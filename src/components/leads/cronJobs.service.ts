import { Cron, CronExpression } from "@nestjs/schedule";

import { Injectable } from "@nestjs/common";
import { DhwaniCronService } from "../dhwani/dhwani.cron.service";
import { dhawaniAgent } from "../../utility/enums";
import { PrismaService } from "../../prisma/prisma.service";
import { penalConfig } from "../../common/config/penal.config";

@Injectable()
export class CronService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly dhwaniService: DhwaniCronService,
    ) {
    }

    // private getCurrentTenantDbConfig(): { db_name: string; db_url: string } | null {
    //     const currentClient = (process.env.CLIENT_ENV || "").toLowerCase();

    //     const allClients = ["speedoloan", "shreeloan", "rupyalelo"];

    //     if (!allClients.includes(currentClient)) {
    //         return null;
    //     }

    //     const targetClient =
    //         currentClient === "speedoloan" ? "speedoprod" : currentClient;

    //     const seenUrls = new Set<string>();

    //     for (const value of Object.values(process.env)) {
    //         if (typeof value !== "string") continue;

    //         const lowerUrl = value.toLowerCase();

    //         if (lowerUrl.includes(targetClient)) {

    //             // ✅ normalize (remove query params)
    //             const baseUrl = value.split("?")[0];

    //             if (!seenUrls.has(baseUrl)) {
    //                 seenUrls.add(baseUrl);

    //                 return {
    //                     db_name: targetClient,
    //                     db_url: value,
    //                 };
    //             }
    //         }
    //     }

    //     return null; // if nothing found
    // }

    private getCurrentTenantDbConfig(): { db_name: string; db_url: string } | null {
        const targetClient = (process.env.CLIENT_ENV || "").toLowerCase();
        const db_url: any = process.env.TENANT1_DB;
        return {
            db_name: targetClient,
            db_url,
        };
    }

    private buildReason(lead: any): string {
        let amount: any = Number(lead.approvals?.[0]?.loanAmtApproved) + Number((lead.approvals?.[0]?.loanAmtApproved * lead.approvals?.[0]?.roi * lead.approvals?.[0]?.tenure) / 100) || 0;

        const dueDate = lead.approvals?.[0]?.repayDate
            ? new Date(lead.approvals[0].repayDate).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
            })
            : 'N/A';

        const gender = lead.customer?.gender || 'N/A';
        return `- [outstanding amount] — ${amount} rupees- [due date] — ${dueDate} - [offers] — Upto 20% waiver on Loan till date interest  Upto 40 to 50% Discount on processing fees on new loan Can Increase the loan limit upto 10% to 20% - [customer gender] — ${gender}`;
    };

    async calculateOutstanding(lead: any) {
        const approval = lead.approvals?.[0];
        const approvedCollections = lead.collections || [];

        const totalPaid = approvedCollections.reduce(
            (sum, c: any) => sum + Number(c.collectedAmount || 0),
            0,
        );

        const disbursalDate = new Date(lead.loan.disbursalDate);
        const repayDate = new Date(approval.repayDate);

        disbursalDate.setHours(0, 0, 0, 0);
        repayDate.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const domain: any = process.env.TENANT1_DOMAIN;
        const config = penalConfig[domain] || penalConfig['localhost'];

        const dailyRate = Number(approval.roi) / 100;
        const overdueRate = parseFloat(config.interest.replace('%', '')) / 100;
        const bounceCharge = config.charges;

        let dueDays = Math.ceil(
            (repayDate.getTime() - disbursalDate.getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1;

        let overdueDays = 0;
        if (today > repayDate) {
            overdueDays = Math.ceil(
                (today.getTime() - repayDate.getTime()) /
                (1000 * 60 * 60 * 24),
            );
        }

        let totalInterest = 0;

        if (overdueDays > 0) {
            const normalInterest =
                lead.loan.disbursalAmount * dailyRate * dueDays;

            const overdueInterest =
                lead.loan.disbursalAmount * overdueRate * overdueDays;

            totalInterest = normalInterest + overdueInterest + bounceCharge;
        } else {
            totalInterest =
                lead.loan.disbursalAmount * dailyRate * dueDays;
        }

        const outstanding = Math.max(
            0,
            Math.round(
                lead.loan.disbursalAmount + totalInterest - totalPaid,
            ),
        );

        return outstanding;
    }

    private buildReasonOverdue(lead: any, outstanding: number): string {
        const approval = lead.approvals?.[0];

        const formattedAmount = outstanding.toLocaleString('en-IN');

        const dueDate = approval?.repayDate
            ? new Date(approval.repayDate).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            })
            : 'N/A';

        const gender = (lead.customer?.gender || 'male').toLowerCase();

        let salutation = 'Sir';
        if (gender === 'female') salutation = 'Ma’am';

        const lateFeeRule = 'Late payment पर applicable charges या penalty 10% तक लागू हो सकती है';

        return `- [customer] — ${salutation}
                - [outstanding amount] — ${formattedAmount} rupees
                - [due date] — ${dueDate}
                - [late fee rule] — ${lateFeeRule}`;
    }

    async paymentOverdueCustomers(days: number) {
        try {
            const tenantConfigs = this.getCurrentTenantDbConfig();
            if (!tenantConfigs) return;

            const prisma = PrismaService.getClient(tenantConfigs.db_url);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let startDate = new Date(today);
            let endDate = new Date(today);

            if (days === 5) {
                // Final Reminder (> 5 days overdue)
                startDate.setDate(today.getDate() - 1000);
                endDate.setDate(today.getDate() - 6);
            } else {
                // Payment Overdue (0–5 days)
                startDate.setDate(today.getDate() - 5);
                endDate.setDate(today.getDate() - 1);
            }

            // 1. Fetch overdue leads
            const leads = await prisma.leads.findMany({
                where: {
                    status: 'Disbursed',
                    approvals: {
                        some: {
                            repayDate: {
                                gte: startDate,
                                lte: endDate,
                            },
                        },
                    },
                },
                include: {
                    customer: {
                        select: {
                            name: true,
                            mobile: true,
                            gender: true,
                        },
                    },
                    approvals: true,
                    loan: true,
                    collections: {
                        where: {
                            collectionStatus: 'Approved',
                        },
                    },
                },
            });

            if (!leads.length) {
                console.log("⚠️ No overdue customers found");
                return;
            }

            const calls = await Promise.all(
                leads.map(async (lead: any) => {
                    const outstanding = await this.calculateOutstanding(lead);

                    return {
                        phone_number: String(lead.customer.mobile),
                        name: lead.customer.name,
                        reason: this.buildReasonOverdue(lead, outstanding),
                        customerID: lead.customerID,
                        leadID: lead.leadID,
                    };
                })
            );

            const client = process.env.CLIENT_ENV || "speedoloan";

            let agent = dhawaniAgent.outbound[client as keyof typeof dhawaniAgent.outbound]?.postDue;

            const payload = {
                agent: agent,
                calls: calls.map(c => ({
                    phone_number: c.phone_number,
                    name: c.name,
                    reason: c.reason,
                })),
            };

            console.log(`📞 Triggering AI Calls for ${calls.length} overdue customers (D-${days === 5 ? "FINAL" : "NORMAL"})`);

            const response = await this.dhwaniService.triggerBulkCalls(payload);

            if (!response?.batch_id) {
                console.log("❌ No batch_id received");
                return;
            }

            const batchId = String(response.batch_id).trim();

            await prisma.ai_call_batches.upsert({
                where: { batchId },
                update: {
                    status: response.status,
                    totalCalls: response.total_calls || 0,
                },
                create: {
                    batchId,
                    agent: agent,
                    status: response.status,
                    totalCalls: calls.length,
                },
            });

            const callData = response.calls.map((rc: any) => {
                const matchedCustomer = calls.find(
                    (c: any) => String(c.phone_number) === String(rc.phone_number)
                );

                if (!matchedCustomer) {
                    console.warn("⚠️ No matching customer for:", rc.phone_number);
                    return null;
                }

                return {
                    callId: String(rc.call_id),
                    batchId,
                    customerID: matchedCustomer.customerID,
                    leadID: matchedCustomer.leadID,
                    phoneNumber: String(rc.phone_number),
                    status: rc.status,
                    agent: rc.agent,
                };
            }).filter(Boolean);

            if (callData.length) {
                await prisma.ai_call_logs.createMany({
                    data: callData,
                    skipDuplicates: true,
                });
            }

            console.log(`✅ Overdue batch stored (${days === 5 ? "FINAL" : "NORMAL"})`, batchId);

            return {
                success: true,
                batchId,
                total: calls.length,
            };

        } catch (error: any) {
            console.log("❌ paymentOverdueCustomers error:", error.message);
            throw error;
        }
    }

    async paymentDueAiCalls(daysOffset: number) {
        try {
            const tenantConfigs = this.getCurrentTenantDbConfig();
            if (!tenantConfigs) return;

            const prisma = PrismaService.getClient(tenantConfigs.db_url);

            const start = new Date();
            start.setDate(start.getDate() + daysOffset);
            start.setHours(0, 0, 0, 0);

            const end = new Date(start);
            end.setHours(23, 59, 59, 999);

            const client = process.env.CLIENT_ENV || "speedoloan";

            let agent = dhawaniAgent.outbound[client as keyof typeof dhawaniAgent.outbound]?.preDue;

            const leads = await prisma.leads.findMany({
                where: {
                    status: 'Disbursed',
                    approvals: {
                        some: {
                            repayDate: {
                                gte: start,
                                lte: end,
                            },
                        },
                    },
                },
                select: {
                    leadID: true,
                    customerID: true,
                    customer: {
                        select: {
                            name: true,
                            mobile: true,
                            gender: true,
                        },
                    },
                    approvals: {
                        select: {
                            loanAmtApproved: true,
                            roi: true,
                            tenure: true,
                            repayDate: true,
                        },
                    },
                },
            });

            if (!leads.length) {
                console.log(`⚠️ No customers for D-${daysOffset}`);
                return;
            }

            const calls = leads.map((lead: any) => ({
                phone_number: String(lead.customer.mobile),
                name: lead.customer.name,
                reason: this.buildReason(lead),
                customerID: lead.customerID,
                leadID: lead.leadID,
            }));

            const payload = {
                agent,
                calls: calls.map(c => ({
                    phone_number: c.phone_number,
                    name: c.name,
                    reason: c.reason,
                })),
            };
            console.log(`📞 Triggering AI Calls for ${calls.length} overdue customers`);

            const response = await this.dhwaniService.triggerBulkCalls(payload);

            if (!response?.batch_id) {
                console.log("❌ No batch_id received");
                return;
            }

            const batchId = String(response.batch_id).trim();

            await prisma.ai_call_batches.upsert({
                where: { batchId },
                update: {
                    status: response.status,
                    totalCalls: response.total_calls || 0,
                },
                create: {
                    batchId,
                    agent,
                    status: response.status,
                    totalCalls: calls.length,
                },
            });

            const callData = response.calls.map((rc: any) => {
                const matchedCustomer = calls.find(
                    (c: any) => String(c.phone_number) === String(rc.phone_number)
                );

                if (!matchedCustomer) {
                    console.warn("⚠️ No matching customer for:", rc.phone_number);
                    return null;
                }

                return {
                    callId: String(rc.call_id),
                    batchId,
                    customerID: matchedCustomer.customerID,
                    leadID: matchedCustomer.leadID,
                    phoneNumber: String(rc.phone_number),
                    status: rc.status,
                    agent: rc.agent,
                };
            }).filter(Boolean);

            if (callData.length) {
                await prisma.ai_call_logs.createMany({
                    data: callData,
                    skipDuplicates: true,
                });
            }

            console.log(`✅ AI Calls done for D-${daysOffset}`, batchId);

            return {
                success: true,
                batchId,
                total: calls.length,
            };

        } catch (error: any) {
            console.log("❌ paymentDueAiCalls error:", error.message);
            throw error;
        }
    }

    private async runPaymentCron() {
        await Promise.all([
            this.paymentDueAiCalls(3),
            this.paymentOverdueCustomers(0),
        ]);
    }

    private isCronEnabled(): boolean {
        return process.env.ENABLE_AI_CALLER_CRON === 'true';
    }

    // 09:00 AM
    @Cron('0 9 * * *')
    async handleMorningCron() {
        try {
            if (!this.isCronEnabled()) return;
            console.log('✅ [CRON] morningNotifications completed');
            await this.runPaymentCron();

        } catch (error: any) {
            console.log("❌ handleMorningCron error:", error.message);
        }
    };

    // 01:00 PM
    // @Cron('0 13 * * *')
    async handleAfternoonCron() {
        try {
            if (!this.isCronEnabled()) return;
            await this.runPaymentCron();

        } catch (error: any) {
            console.log("❌ handleAfternoonCron error:", error.message);
        }
    };

    // 05:00 PM
    // @Cron('0 17 * * *')
    async handleEveningCron() {
        try {
            if (!this.isCronEnabled()) return;
            await this.runPaymentCron();

        } catch (error: any) {
            console.log("❌ handleEveningCron error:", error.message);
        }
    };

    // 12:00 AM
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async handleApprovalFollowUpCron() {
        try {
            await this.runApprovalFollowUpCron();

        } catch (error: any) {
            console.log("❌ handleApprovalFollowUpCron error:", error.message);
        }
    };

    private async runApprovalFollowUpCron() {
        await Promise.all([
            this.markExpiredApprovalCasesAsNotInterested(),
        ]);
    }

    async markExpiredApprovalCasesAsNotInterested() {
        const tenantConfig = this.getCurrentTenantDbConfig();

        if (!tenantConfig) {
            throw new Error('Tenant database configuration not found');
        }

        const prisma = PrismaService.getClient(tenantConfig.db_url);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const approvalDays = Number(
            process.env.APPROVAL_AUTO_REMARK_DAYS || 7,
        );

        if (!Number.isInteger(approvalDays) || approvalDays < 1) {
            throw new Error(
                'APPROVAL_AUTO_REMARK_DAYS must be a positive integer',
            );
        }

        const daysAgo = new Date(today);
        daysAgo.setDate(daysAgo.getDate() - approvalDays);
        const AUTO_REMARK = 'Auto marked as Not Interested after 7 days';
        const systemEmail = process.env.SYSTEM_EMAIL || "anonymous@factorwise.com";

        if (!systemEmail) {
            throw new Error('SYSTEM_EMAIL is not configured');
        }

        const user = await prisma.lms_users.findUnique({
            where: {
                email: String(systemEmail),
            },
            select: {
                userID: true,
                email: true,
            }
        });
        if (!user) {
            throw new Error(`System user not found: ${systemEmail}`);
        }
        const SYSTEM_USER_ID = user.userID;

        try {
            /**
             * 1. Find eligible leads
             *
             * Approved:
             *   approval.createdDate 7 days ago
             *
             * Disbursal_Sheet_Send:
             *   loan.createdDate 7 days ago
             */
            const leads = await prisma.leads.findMany({
                where: {
                    OR: [
                        {
                            status: 'Approved',
                            approvals: {
                                some: {
                                    createdDate: {
                                        lt: daysAgo,
                                    },
                                },
                            },
                        },
                        {
                            status: 'Disbursal_Sheet_Send',
                            loan: {
                                createdDate: {
                                    lt: daysAgo,
                                },
                                exported: false
                            },

                        },
                    ],
                },
                select: {
                    leadID: true,
                    customerID: true,
                    status: true,
                },
            });

            if (!leads.length) {
                console.log('ℹ️ No eligible leads found');

                return {
                    success: true,
                    processed: 0,
                    skipped: 0,
                };
            }

            /**
             * 2. Get leads which have already been automatically
             *    marked as Not Interested.
             *
             *    This makes the cron idempotent.
             */
            const leadIds = leads.map(({ leadID }) => leadID);

            const alreadyProcessed = await prisma.callhistory.findMany({
                where: {
                    leadID: {
                        in: leadIds,
                    },
                    callType: 'IVR',
                    status: 'Not_Interested',
                    remark: AUTO_REMARK,
                },
                select: {
                    leadID: true,
                },
            });

            const processedLeadIds = new Set(
                alreadyProcessed.map(({ leadID }) => leadID),
            );

            const pendingLeads = leads.filter(
                ({ leadID }) => !processedLeadIds.has(leadID),
            );

            if (!pendingLeads.length) {
                console.log('ℹ️ All eligible leads are already processed');

                return {
                    success: true,
                    processed: 0,
                    skipped: leads.length,
                };
            }

            const BATCH_SIZE = 100;

            let processed = 0;
            let failed = 0;

            for (let i = 0; i < pendingLeads.length; i += BATCH_SIZE) {
                const batch = pendingLeads.slice(i, i + BATCH_SIZE);

                const results = await Promise.allSettled(
                    batch.map(async (lead) => {
                        await prisma.$transaction(async (tx) => {
                            await tx.callhistory.create({
                                data: {
                                    status: 'Not_Interested',
                                    remark: AUTO_REMARK,
                                    calledBy: SYSTEM_USER_ID,
                                    leadID: lead.leadID,
                                    callType: 'IVR',
                                    noteli: '',
                                    customerID: lead.customerID,
                                } as any,
                            });

                            await tx.callhistorylogs.create({
                                data: {
                                    status: 'Not_Interested',
                                    remark: AUTO_REMARK,
                                    calledBy: SYSTEM_USER_ID,
                                    callType: 'IVR',
                                    callbackTime: today,
                                    noteli: '',
                                    leadID: lead.leadID,
                                    customerID: lead.customerID,
                                } as any,
                            });

                            await tx.leads.update({
                                where: {
                                    leadID: lead.leadID,
                                },
                                data: {
                                    status: 'Not_Interested',
                                },
                            });
                        });

                        return lead.leadID;
                    }),
                );

                processed += results.filter(
                    (result) => result.status === 'fulfilled',
                ).length;

                const batchFailed = results.filter(
                    (result) => result.status === 'rejected',
                );

                failed += batchFailed.length;

                batchFailed.forEach((result, index) => {
                    if (result.status === 'rejected') {
                        console.error(
                            `❌ Failed processing lead ${batch[index].leadID}:`,
                            result.reason?.message || result.reason,
                        );
                    }
                });

                console.log(
                    `📦 Batch processed | ${Math.min(
                        i + BATCH_SIZE,
                        pendingLeads.length,
                    )}/${pendingLeads.length}`,
                );
            }

            return {
                success: true,
                found: leads.length,
                // processed,
                skipped: leads.length - pendingLeads.length,
                // failed: failed.length,
            };
        } catch (error: any) {
            console.error('❌ approvedWeekAgoCases error:', error.message,);

            throw error;
        }
    }

}