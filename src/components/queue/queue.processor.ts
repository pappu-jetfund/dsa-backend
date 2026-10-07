import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PayoutService } from '../payout/payout.service';
import { Queue } from 'bullmq';
import { TenantResolverService } from '../../tenant/tenant-resolver.service';
import { PrismaService } from '../../prisma/prisma.service';
import { formatDateYYYYMMDD } from '../../utility/helper';
import { SmsService } from '../sms/sms.service';
import { SmsType } from '../../utility/enums';
import { MailService } from '../mail/mail.service';
import { GlobalService } from '../../common/globalFunctions/global.service';

@Processor('icici-status', { concurrency: 2 })
export class IciciProcessor extends WorkerHost {
    constructor(
        private readonly tenantResolver: TenantResolverService,
        private readonly payoutService: PayoutService,
        private readonly globalService: GlobalService,


        @InjectQueue('icici-status')
        private readonly statusQueue: Queue,
    ) {
        super();
    }

    async process(job: Job<{ payoutId: number; domain: string }>) {
        try {
            console.log(`🔥 Job STARTED: ${job.id}`, job.data);

            const { payoutId, domain } = job.data;

            if (!domain) {
                throw new Error('Domain missing in job');
            }

            // ✅ Resolve DB
            const dbUrl = this.tenantResolver.getDbUrl(domain);

            // ✅ Get Prisma (NO tenantPrisma here)
            const prisma = PrismaService.getClient(dbUrl);




            const txn: any = await prisma.icici_payout.findUnique({
                where: { id: payoutId },
                include: {
                    lead: {
                        select: {
                            leadID: true,
                            customerID: true
                        }
                    }
                }
            });


            if (!txn) return;


            if (txn.isTerminal) {

                return;
            }

            // ⛔ Expiry check
            if (txn.expiresAt && new Date() > txn.expiresAt) {
                await prisma.icici_payout.update({
                    where: { id: payoutId },
                    data: {
                        status: 'FAILED',
                        isTerminal: true,
                        responseMsg: 'Expired after T+2',
                    },
                });
                return;
            }

            // Call ICICI status API
            const res = await this.payoutService.status(
                txn.transRefNo,
                domain
            );

            await prisma.icici_Payoutlog.create({
                data: {
                    payoutId,
                    step: 'STATUS_CHECK',
                    payload: res.raw,
                    actCode: res.actCode,
                    message: res.message,
                },
            });

            if (res.status !== 'PENDING') {
                await prisma.icici_payout.update({
                    where: { id: payoutId },
                    data: {
                        status: res.status,
                        actCode: res.actCode,
                        bankRRN: res.bankRRN,
                        isTerminal: true,
                        needsStatusCheck: false,
                    },
                });

                const systemUserId = await this.globalService.getSystemUserId();


                const dataUpdate = await prisma.$transaction(
                    async (tx) => {

                        const disbusral = await tx.loan.update({
                            where: { leadID: Number(txn.lead.leadID) },
                            data: {
                                disbursalRefrenceNo: txn.transRefNo,
                                disbursalDate: formatDateYYYYMMDD(new Date()),
                                remarks: res.message,
                                status: 'Disbursed',
                                disbursedBy: systemUserId,
                                disbursalTime: new Date(),
                            },
                        });

                        const callHistoryLog = await tx.callhistorylogs.create({
                            data: {
                                customerID: Number(txn?.lead?.customerID ?? ''),
                                leadID: Number(txn?.lead?.leadId),
                                callType: 'IVR',
                                status: 'Disbursed',
                                remark: `${res.message}-Disbursed via ICICI Payouts` || '',
                                calledBy: systemUserId,
                                noteli: res.message || '',
                            } as any,
                        });

                        const leadsUpdate = await tx.leads.update({
                            where: { leadID: Number(txn?.lead?.leadId) },
                            data: {
                                status: 'Disbursed',
                            },
                        });
                    })
                return;
            }

            const attempts = txn.checkAttempts + 1;

            const delay = Math.min(
                5 * 1000 * attempts,
                30 * 1000,
            );

            await prisma.icici_payout.update({
                where: { id: payoutId },
                data: {
                    checkAttempts: { increment: 1 },
                    nextCheckAt: new Date(Date.now() + delay),
                },
            });

            await this.statusQueue.add(
                'status-check',
                {
                    payoutId,
                    domain,
                },
                {
                    jobId: `payout-${payoutId}`,
                    delay,
                    removeOnComplete: true,
                    removeOnFail: true,
                },
            );
        } catch (err) {
            console.error(`💥 Job FAILED: ${job.id}`, err);
            throw err;
        }
    }
}


@Processor('reloan-sms', { concurrency: 5 })
export class ReloanSmsProcessor extends WorkerHost {
    constructor(
        private readonly tenantResolver: TenantResolverService,
        private readonly smsService: SmsService,
        @InjectQueue('reloan-sms')
        private readonly statusQueue: Queue,
    ) {
        super();
    }

    async process(job: Job<{ customerId: number; domain: string, attempts?: number }>) {
        try {
            console.log(`📩 SMS Job STARTED: ${job.id}`, job.data);

            const { customerId, domain } = job.data;

            if (!domain) {
                throw new Error('Domain missing in SMS job');
            }

            const attempts = job.data.attempts || 1;

            if (attempts >= 5) return;

            const dbUrl = this.tenantResolver.getDbUrl("localhost");
            const prisma = PrismaService.getClient(dbUrl);

            // Fetch customer details
            const lead = await prisma.leads.findFirst({
                where: { customerID: customerId },
                select: {
                    leadID: true,
                    customer: true,
                    status: true,
                },
                orderBy: {
                    createdDate: 'desc'
                }
            });

            if (!lead?.customer?.mobile || lead.status !== "Closed") {
                console.log('❌ No phone number found');
                return;
            }

            const { customer } = lead;

            const smsPayload: any = {
                templateKey: domain,
                customerMobile: `${customer.mobile}`,
                // customerMobile: `+918218299028`,
                variables: {
                    name: customer.name,
                },
            };



            console.log(`✅ SMS SENT: ${lead.customer.name}`);

            // send SMS...
            await this.smsService.dovesoftSms(smsPayload.templateKey, SmsType.PRE_APPROVED_LOAN, smsPayload.customerMobile, smsPayload.variables);

            // schedule next
            await this.statusQueue.add(
                'status-check',
                {
                    ...job.data,
                    attempts: attempts + 1,
                },
                {
                    delay: 2 * 60 * 60 * 1000, // 2 hours
                    removeOnComplete: true,
                    removeOnFail: true,
                },
            );

        } catch (err) {
            console.error(`💥 SMS Job FAILED: ${job.id}`, err);
            throw err;
        }
    }
}


@Processor('mail-queue', { concurrency: 10 })
export class MailProcessor extends WorkerHost {
    constructor(
        private readonly mailService: MailService,
    ) {
        super();
    }

    async process(job: any) {
        console.log(job.data, "job.data");
        try {


            const { to, subject, type, template, data } = job.data;

            await this.mailService.sendCustomMail(
                to,
                subject,
                type,
                template,
                data,
            );
        } catch (err) {
            console.error(`❌ Mail Job Failed: ${job.id}`, err);
            throw err;
        }
    }
}