import { Injectable, BadRequestException } from '@nestjs/common';
import { TenantPrismaService } from '../../../prisma/tenet-prisma.service';
import { ClsService } from 'nestjs-cls';
import { GetVendorReportsDto, VendorCustomerReportDto } from './reports.dto';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { CardCompleted } from '../../../common/config/customer-journey.config';
import { buildJourney, getJourneyConfig, resolveBankRequired } from '../../../utility/notonboarded.customer-journey.util';
import { SmsService } from '../../sms/sms.service';

interface DomainConfig {
    brand: string;
    baseUrl: string;
}

@Injectable()
export class ReportsService {

    constructor(
        private readonly tenantPrisma: TenantPrismaService,
        private readonly clsService: ClsService,
        private readonly smsService: SmsService,
    ) { }

    private getDatesBetween(startDate: string, endDate: string): string[] {
        const dates: string[] = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        const currentDate = new Date(start);

        while (currentDate <= end) {
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            dates.push(`${year}-${month}-${day}`);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return dates;
    }

    private getAllTenantDbConfigs(): { db_name: string; db_url: string }[] {
        const currentClient = (process.env.CLIENT_ENV || "").toLowerCase();

        const allClients = ["speedoloan", "shreeloan", "rupyalelo"];

        if (!allClients.includes(currentClient)) {
            return [];
        }

        const targetClients = allClients.filter(c => c !== currentClient);

        const results: { db_name: string; db_url: string }[] = [];
        const seenUrls = new Set<string>();

        for (const value of Object.values(process.env)) {
            if (typeof value !== "string") continue;

            const lowerUrl = value.toLowerCase();

            for (const client of targetClients) {
                if (lowerUrl.includes(client)) {
                    if (!seenUrls.has(value)) {
                        results.push({
                            db_name: client,
                            db_url: value,
                        });
                        seenUrls.add(value);
                    }
                    break; // stop after first match
                }
            }
        }

        return results;
    }

    async getVendorReport(payload: any) {
        try {

            const { fromDate, toDate, utmSource, multipleUtmSources } = payload;

            const tag = this.clsService.get('tag');
            let filterUtmSource = utmSource;
            const role = this.clsService.get('role');

            // Non-admin users can only see their own tag data
            if (tag && String(tag).toLowerCase() !== 'admin' && role.name !== "Vendor Manager") {
                filterUtmSource = String(tag);
            }

            const startUTC = new Date(`${fromDate}T00:00:00.000+05:30`);
            const endUTC = new Date(`${toDate}T23:59:59.999+05:30`);

            // Build the base filter
            const baseFilter: any = {
                createdDate: {
                    gte: startUTC,
                    lte: endUTC,
                },
            };

            let campaignNames: any

            if (filterUtmSource) {
                const isAdmin = String(tag).toLowerCase() === 'admin';
                const isVendorManager = role.name === 'Vendor Manager';

                if (!isAdmin && !isVendorManager) {

                    const userId = this.clsService.get('user');

                    // Get all campaigns belonging to logged-in vendor
                    const campaigns = await this.tenantPrisma.client.campaigns.findMany({
                        where: {
                            vendorId: userId,
                        },
                        select: {
                            name: true,
                        },
                    });

                    campaignNames = campaigns.map((campaign) => campaign.name).filter(Boolean);

                    baseFilter.utmSource = utmSource ? utmSource : {
                        in: campaignNames,
                    };

                } else {
                    baseFilter.utmSource = filterUtmSource;
                }
            }

            const BATCH_SIZE = 2000;
            const CONCURRENCY = 5; // 🔥 control parallelism

            let lastId: number | null = null;
            const batchQueue: Promise<void>[] = [];

            const reportMap = new Map<string, any>();

            // ✅ Initialize dates
            const dates = this.getDatesBetween(fromDate, toDate);
            dates.forEach((date) => {
                reportMap.set(date, {
                    date,
                    allOtp: 0,
                    otpStage: 0,
                    breRejected: 0,
                    breApprove: 0,
                    proceedToBank: 0,
                    kyc: 0,
                    approvedStatus: 0,
                    docReceive: 0,
                    rejected: 0,
                    approved: 0,
                    hold: 0,
                    disbSheetSend: 0,
                    disbursed: 0,
                    disbAmount: 0,
                    acutalDisbursalAmount: 0
                });
            });

            const processBatch = async (customers: any[]) => {
                for (const customer of customers) {
                    const dateKey = customer.createdDate.toISOString().split('T')[0];

                    const dayData = reportMap.get(dateKey);
                    if (!dayData) continue;

                    dayData.allOtp++;

                    if (customer.isVerified) {
                        dayData.otpStage++;
                    }

                    if (customer.is_onboarded) {
                        dayData.kyc++;
                    }

                    if (customer.loanApplied) {
                        dayData.docReceive++;
                    }

                    if (customer.credforge_bre_log?.length) {
                        const breStatus = customer.credforge_bre_log[0]?.status;

                        if (breStatus === 'Reject') {
                            dayData.breRejected++;
                        } else if (breStatus === 'Approve') {
                            dayData.breApprove++;
                        } else if (breStatus === 'Proceed to Bank') {
                            dayData.proceedToBank++;
                        }
                    }

                    for (const lead of customer.leads) {
                        const approval = lead.approvals?.[0];
                        if (
                            lead.status == 'Rejected' ||
                            lead.status == 'Not_Interested' ||
                            lead.status == 'Not_Required' ||
                            lead.status == 'Not_Required_Process' ||
                            lead.status == 'Rejected_Process') {
                            dayData.rejected++;
                        } else if (lead.status == 'Approved') {
                            dayData.approved++;
                        } else if (lead.status === 'Disbursal_Sheet_Send') {
                            dayData.disbSheetSend++;
                        }

                        if (approval) {
                            if (approval.status === 'Hold') {
                                dayData.hold++;
                            }
                        }

                        if (lead.loan) {
                            if (lead.loan.status === 'Disbursed') {
                                dayData.disbursed++;
                                dayData.disbAmount += lead.loan.disbursalAmount || 0;
                                dayData.acutalDisbursalAmount += lead.loan.acutalDisbursalAmount || 0;
                            }
                        }

                    }
                }
            };

            while (true) {
                const customers = await this.tenantPrisma.client.customer.findMany({
                    where: {
                        ...baseFilter,
                        ...(lastId && { customerID: { gt: lastId } }),
                    },
                    select: {
                        customerID: true,
                        createdDate: true,
                        loanApplied: true,
                        isVerified: true,
                        leads: {
                            where: { fbLeads: 'New Case' },
                            select: {
                                leadID: true,
                                status: true,
                                loan: {
                                    select: {
                                        status: true,
                                        disbursalAmount: true,
                                        acutalDisbursalAmount: true
                                    },
                                },
                                approvals: {
                                    orderBy: { approvalID: "desc" },
                                    take: 1,
                                    select: { status: true },
                                },
                            },
                        },
                        credforge_bre_log: {
                            orderBy: { createdAt: "desc" },
                            take: 1,
                            select: {
                                status: true,
                            }
                        },
                        is_onboarded: true
                    },
                    orderBy: { customerID: 'asc' },
                    take: BATCH_SIZE,
                });

                if (!customers.length) break;

                lastId = customers[customers.length - 1].customerID;

                // 🔥 push batch to parallel queue
                const task = processBatch(customers);
                batchQueue.push(task);

                // 🔥 control concurrency
                if (batchQueue.length >= CONCURRENCY) {
                    await Promise.all(batchQueue);
                    batchQueue.length = 0;
                }

                if (customers.length < BATCH_SIZE) break;
            }

            // 🔥 process remaining batches
            if (batchQueue.length) {
                await Promise.all(batchQueue);
            }

            const report = Array.from(reportMap.values()).sort((a, b) =>
                b.date.localeCompare(a.date),
            );

            let utmSources: string[] = [];

            if (tag && String(tag).toLowerCase() === 'admin' || role.name === "Vendor Manager") {
                utmSources = (
                    await this.tenantPrisma.client.customer.findMany({
                        where: {
                            utmSource: { not: null },
                            ...(filterUtmSource
                                ? { utmSource: filterUtmSource }
                                : {}),
                        },
                        select: { utmSource: true },
                        distinct: ['utmSource'],
                        take: 100,
                    })
                )
                    .map((i) => i.utmSource)
                    .filter((s): s is string => Boolean(s));
            } else {
                utmSources = campaignNames
            }

            const actualDisbursement = report.reduce(
                (sum, item) => sum + Number(item.acutalDisbursalAmount || 0),
                0,
            );

            return {
                message: 'Vendor report fetched successfully',
                data: {
                    utmSources: utmSources || [],
                    actualDisbursement,
                    data: report,
                },
            };
        } catch (error: any) {
            throw new BadRequestException(
                error?.message ||
                'An error occurred while fetching the report.',
            );
        }
    }


    async getVendorCustomerReport(req: Request, query: VendorCustomerReportDto) {
        const { date, fromDate, toDate, utmSource } = query;

        let startUTC: Date;
        let endUTC: Date;

        if (date) {
            startUTC = new Date(`${date}T00:00:00.000+05:30`);
            endUTC = new Date(`${date}T23:59:59.999+05:30`);
        } else if (fromDate && toDate) {
            startUTC = new Date(`${fromDate}T00:00:00.000+05:30`);
            endUTC = new Date(`${toDate}T23:59:59.999+05:30`);
        } else {
            throw new BadRequestException(
                "Either 'date' or both 'fromDate' and 'toDate' are required",
            );
        }

        const tag = this.clsService.get('tag');
        const role = this.clsService.get('role');

        const whereClause: any = {
            createdDate: {
                gte: startUTC,
                lte: endUTC,
            },
        };

        const isAdmin = String(tag).toLowerCase() === 'admin';
        const isVendorManager = role.name === 'Vendor Manager';

        if (utmSource && (isAdmin || isVendorManager)) {
            whereClause.utmSource = utmSource;

        } else if (tag && !isAdmin && !isVendorManager) {

            const userId = this.clsService.get('user');

            const campaigns = await this.tenantPrisma.client.campaigns.findMany({
                where: {
                    vendorId: userId,
                },
                select: {
                    name: true,
                },
            });

            const campaignNames = campaigns.map((campaign) => campaign.name).filter(Boolean);

            whereClause.utmSource = utmSource ? utmSource : {
                in: campaignNames,
            };

        }

        const BATCH_SIZE = 2000;

        let lastId: number | null = null;
        let finalData: any[] = [];

        const domain = await this.smsService.getCurrentDomain(req);
        const journeyConfig = getJourneyConfig(domain);

        while (true) {
            const customers = await this.tenantPrisma.client.customer.findMany({
                where: {
                    ...whereClause,
                    ...(lastId && { customerID: { gt: lastId } }),
                },
                include: {
                    leads: {
                        where: { fbLeads: "New Case" },
                        orderBy: { createdDate: "desc" },
                        take: 1,
                        include: {
                            approvals: {
                                orderBy: { createdDate: "asc" },
                                take: 1,
                            },
                            loan: true,
                            eagreement: {
                                where: {
                                    isSigned: true
                                },
                                select: {
                                    isSigned: true
                                }
                            },
                            easebuzz_emandates: {
                                where: {
                                    OR: [
                                        {
                                            AND: [
                                                {
                                                    status: "initiated",
                                                    sub_status: "accepted"
                                                }
                                            ]
                                        },
                                        {
                                            status: "authorized"
                                        }
                                    ]
                                },
                                select: {
                                    id: true
                                }
                            }
                        },
                    },
                    addresses: {
                        take: 1,
                        select: {
                            city: true,
                            state: true,
                            pincode: true
                        }
                    },
                    face_comparison: {
                        select: {
                            isMatch: true
                        }
                    },
                    bankstatement: {
                        select: {
                            id: true
                        }
                    },
                    reference: {
                        select: {
                            is_verified: true
                        }
                    },
                    credforge_bre_log: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: {
                            loanAmount: true,
                            responsePayload: true,
                            status: true,
                            workflowName: true
                        }
                    },
                    finb_logs: {
                        orderBy: { createdDate: "desc" },
                        take: 1,
                        select: {
                            pan: true
                        }
                    },
                    employer: {
                        select: {
                            employeeType: true,
                            salaryMode: true
                        }
                    },
                    accounts: {
                        orderBy: {
                            createdDate: 'desc',
                        },
                        take: 1,
                        select: {
                            accountID: true
                        }
                    }
                },
                orderBy: { customerID: "asc" },
                take: BATCH_SIZE,
            });

            if (!customers.length) break;

            lastId = customers[customers.length - 1].customerID;

            // ============================================
            // Get city/state from indianpincode
            // only when address city/state is missing
            // ============================================

            const pincodeList: string[] = Array.from(
                new Set(
                    customers
                        .map((customer) => {
                            const lead: any = customer.leads?.[0];

                            return (
                                lead?.pincode?.toString() ||
                                customer?.addresses?.[0]?.pincode?.toString() ||
                                null
                            );
                        })
                        .filter((pincode): pincode is string => Boolean(pincode))
                )
            );

            const pincodeData = pincodeList.length ? await this.tenantPrisma.client.indianpincode.findMany({
                where: {
                    pincode: {
                        in: pincodeList,
                    },
                    isActive: true,
                },
                select: {
                    pincode: true,
                    district: true,
                    statename: true,
                },
            })
                : [];

            const pincodeMap = new Map(
                pincodeData.map((item) => [
                    item.pincode,
                    {
                        city: item.district,
                        state: item.statename,
                    },
                ])
            );

            const batchData = customers.map((customer) => {
                const lead: any = customer.leads?.[0];
                const approval = lead?.approvals?.[0];
                const loan = lead?.loan;
                const credforge_bre_log: any = customer.credforge_bre_log[0];

                const address = customer.addresses[0];
                const pincode = lead?.pincode?.toString() || address?.pincode?.toString() || null;
                const pincodeLocation: any = pincode ? pincodeMap.get(pincode) : null;
                const city = address?.city || pincodeLocation?.city || null;
                const state = address?.state || pincodeLocation?.state || null;
                const employer = customer?.employer[0];

                const score: any = credforge_bre_log?.responsePayload;

                const riskGrade = score?.output_data?.features?.output_features?.bureau?.cbs_risk_grade ?? score?.output_data?.features?.combo?.cbs_risk_grade ?? null;
                const preofferDecision = credforge_bre_log?.status ?? null;

                const isBankRequired = resolveBankRequired(domain, preofferDecision, riskGrade,);
                const isBankCompleted = !!customer.bankstatement[0];
                const isPennyDropCompleted = !!customer.accounts[0];
                const cardCompleted: CardCompleted = {
                    preoffer: !!credforge_bre_log,
                    mobileOtp: !!customer?.isVerified,
                    panVerification: !!customer?.pancard || !!customer?.finb_logs?.[0]?.pan,
                    bankVerification: isBankRequired ? !!isBankCompleted : true,
                    employment: !!customer?.employer?.[0],
                    loanOffer: !!customer?.preoffer?.[0],
                    personalDetails: !!customer?.addresses?.[0],
                    kyc: !!customer?.pancard && !!customer?.aadharNo,
                    selfie: !!customer?.document?.[0]?.documentFile,
                    refrence: customer.reference ? true : false,
                    penny_drop: isPennyDropCompleted ? true : false,
                    e_sign: lead?.eagreement ? true : false,
                    emandate: lead?.easebuzz_emandates ? true : false,
                    disbursed: loan?.disbursalDate ? true : false,
                };



                const journey = buildJourney(journeyConfig, cardCompleted, isBankRequired);

                return {
                    customerId: customer.customerID,
                    createdAt: customer.createdDate,
                    source: customer.utmSource || "-",
                    medium: customer.utmMedium || "-",
                    campaign: customer.utmCampaign || "-",
                    currentStage: journey.currentStageTitle,
                    userName:
                        customer.name ||
                        [
                            customer.firstName,
                            customer.middlename,
                            customer.lastName,
                        ]
                            .filter(Boolean)
                            .join(" ") ||
                        "-",
                    phoneNumber: customer.mobile?.toString() || "",
                    empType: employer?.employeeType || "Null",
                    salaryMode: employer?.salaryMode || "Null",
                    income: lead?.monthlyIncome || 0,
                    pincode: lead?.pincode?.toString() || customer?.addresses?.[0]?.pincode?.toString() || "Null",
                    caseType: lead?.fbLeads || "Null",
                    userStatus: approval?.status || lead?.status || "OTP Done",
                    approvalAmount: approval?.loanAmtApproved || 0,
                    disbursedAt: loan?.disbursalDate || null,
                    disbursalAmount: loan?.acutalDisbursalAmount ?? loan?.disbursalAmount ?? 0,
                    rejectionReason: approval?.rejectionReason || "Null",

                    // New colomn add as per true fund MIS report
                    leadId: lead?.leadID || null,
                    aadhar_Details: customer.aadharNo ? true : false,
                    pan_Details: customer.pancard || customer?.finb_logs[0]?.pan ? true : false,
                    pancard: customer.pancard?.toString(),
                    city: city,
                    state: state,
                    facematch_Details: customer?.face_comparison[0]?.isMatch,
                    bankstatement: customer?.bankstatement[0]?.id ? true : false,
                    otpVerified: customer.isVerified ? true : false,
                    breApproveAmount: credforge_bre_log?.loanAmount || 0,
                    cbs_risk_grade_v1: credforge_bre_log?.responsePayload?.output_data?.features?.bureau?.cbs_risk_grade ?? null,
                    crif_scrore: credforge_bre_log?.responsePayload?.output_data?.features?.bureau?.bureau_score ?? null,
                    breRejected: credforge_bre_log?.status === 'Reject',
                    breApprove: credforge_bre_log?.status === 'Approve',
                    proceedToBank: credforge_bre_log?.status === 'Proceed to Bank',
                    breRejectRemarks: credforge_bre_log?.workflowName === "pincode_validation" ? "OGL Case" : credforge_bre_log?.status === 'Reject' ? credforge_bre_log?.responsePayload?.output_data?.rules_output?.final_decision?.DecisionReason || null : null,
                    e_sign: lead?.eagreement ? true : false,
                    emandate: lead?.easebuzz_emandates ? true : false,
                    reference: customer.reference ? true : false
                };
            });

            finalData.push(...batchData);

            if (customers.length < BATCH_SIZE) break;
        }

        return {
            message: "Vendor customer report fetched successfully",
            data: {
                count: finalData.length,
                data: finalData,
            },
        };
    }

    async getAllUtmSources(filterUtmSource?: string) {
        try {
            const utmSources = await this.tenantPrisma.client.customer.findMany({
                where: {
                    utmSource: {
                        not: null,
                    },
                    ...(filterUtmSource ? { utmSource: filterUtmSource } : {}),
                },
                select: {
                    utmSource: true,
                },
                distinct: ['utmSource'],
                take: 100,
            });

            // Separate UUIDs from normal UTM sources
            // const campaignIds = utmSources
            //     .map((item) => item.utmSource)
            //     .filter(
            //         (utm): utm is string =>
            //             !!utm &&
            //             /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            //                 utm,
            //             ),
            //     );

            // Fetch campaigns
            // const campaigns = campaignIds.length
            //     ? await this.tenantPrisma.client.campaigns.findMany({
            //         where: {
            //             campaignId: {
            //                 in: campaignIds,
            //             },
            //         },
            //         select: {
            //             name: true,
            //         },
            //     })
            //     : [];

            // Create campaign lookup
            // const campaignMap = new Map(
            //     campaigns.map((campaign) => [
            //         campaign.campaignId,
            //         campaign,
            //     ]),
            // );

            // Final response
            const result = utmSources.map(({ utmSource }) => {
                if (!utmSource) {
                    return {
                        utmSource: null,
                    };
                }

                // Normal UTM source
                return {
                    utmSource,
                };
            });

            return result;
        } catch (error) {
            throw new Error('Failed to fetch UTM sources');
        }
    }

    async getVendorReportSummary(payload: any) {
        try {
            const { fromDate, toDate, utmSource } = payload;

            const tag = this.clsService.get('tag');
            const role = this.clsService.get('role');

            let filterUtmSource = utmSource;

            // Non-admin users can only see their own tag data
            if (
                tag &&
                String(tag).toLowerCase() !== 'admin' &&
                role?.name !== 'Vendor Manager'
            ) {
                filterUtmSource = String(tag);
            }

            const now = new Date();

            const todayIST = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Kolkata',
            }).format(now);

            const effectiveFromDate = fromDate || todayIST;
            const effectiveToDate = toDate || todayIST;

            const startDisbursalDate = `${effectiveFromDate}`;
            const endDisbursalDate = `${effectiveToDate}`;

            const startUTC = new Date(
                `${effectiveFromDate}T00:00:00.000+05:30`,
            );

            const endUTC = new Date(
                `${effectiveToDate}T23:59:59.999+05:30`,
            );

            const baseFilter: any = {
                // createdDate: {
                //     gte: startUTC,
                //     lte: endUTC,
                // },
            };

            // UTM filtering
            if (filterUtmSource) {
                const isAdmin = String(tag).toLowerCase() === 'admin';
                const isVendorManager = role.name === 'Vendor Manager';

                if (!isAdmin && !isVendorManager) {
                    const userId = this.clsService.get('user');

                    const campaigns = await this.tenantPrisma.client.campaigns.findMany({
                        where: {
                            vendorId: userId,
                        },
                        select: {
                            name: true,
                        },
                    });

                    const campaignNames = campaigns.map((campaign) => campaign.name).filter(Boolean);

                    baseFilter.utmSource = {
                        in: campaignNames,
                    };
                } else {
                    baseFilter.utmSource = filterUtmSource;
                }
            }

            const BATCH_SIZE = 2000;

            let lastId: number | null = null;

            let totalCases = 0;
            let totalNetDisbursed = 0;
            const reportData: any = [];

            while (true) {
                const customers = await this.tenantPrisma.client.customer.findMany({
                    where: {
                        ...baseFilter,

                        ...(lastId && {
                            customerID: {
                                gt: lastId,
                            },
                        }),
                        leads: {
                            some: {
                                fbLeads: 'New Case',
                                loan: {
                                    is: {
                                        disbursalDate: {
                                            gte: startDisbursalDate,
                                            lte: endDisbursalDate,
                                        },
                                        status: 'Disbursed',
                                    },
                                },
                            },
                        },
                    },
                    select: {
                        customerID: true,
                        createdDate: true,
                        utmSource: true,
                        utmMedium: true,
                        utmCampaign: true,
                        name: true,
                        firstName: true,
                        middlename: true,
                        lastName: true,
                        mobile: true,
                        employeeType: true,
                        pancard: true,
                        employer: {
                            select: {
                                employeeType: true,
                                salaryMode: true,
                            }
                        },
                        finb_logs: {
                            orderBy: { createdDate: "desc" },
                            take: 1,
                            select: {
                                pan: true
                            }
                        },
                        face_comparison: {
                            select: {
                                isMatch: true
                            }
                        },
                        bankstatement: {
                            select: {
                                id: true
                            }
                        },
                        isVerified: true,
                        reference: {
                            select: {
                                is_verified: true
                            }
                        },
                        aadharNo: true,
                        addresses: {
                            take: 1,
                            select: {
                                city: true,
                                state: true,
                                pincode: true
                            }
                        },
                        leads: {
                            where: {
                                fbLeads: 'New Case',
                                loan: {
                                    is: {
                                        disbursalDate: {
                                            gte: startDisbursalDate,
                                            lte: endDisbursalDate,
                                        },
                                        status: 'Disbursed',
                                        exported: true
                                    },
                                },
                            },
                            orderBy: { createdDate: 'desc' },
                            take: 1,
                            select: {
                                loan: {
                                    select: {
                                        status: true,
                                        acutalDisbursalAmount: true,
                                        disbursalDate: true,
                                        disbursalAmount: true
                                    },
                                },
                                approvals: true,
                                credforge_bre_log: {
                                    orderBy: { createdAt: "desc" },
                                    take: 1,
                                    select: {
                                        loanAmount: true,
                                        responsePayload: true,
                                        status: true,
                                        workflowName: true
                                    }
                                },
                                salaryMode: true,
                                monthlyIncome: true,
                                pincode: true,
                                fbLeads: true,
                                status: true,
                                leadID: true,
                                eagreement: {
                                    where: {
                                        isSigned: true
                                    },
                                    select: {
                                        isSigned: true
                                    }
                                },
                                easebuzz_emandates: {
                                    where: {
                                        OR: [
                                            {
                                                AND: [
                                                    {
                                                        status: "initiated",
                                                        sub_status: "accepted"
                                                    }
                                                ]
                                            },
                                            {
                                                status: "authorized"
                                            }
                                        ]
                                    },
                                    select: {
                                        id: true
                                    }
                                }
                            },

                        },
                    },
                    orderBy: {
                        customerID: 'asc',
                    },
                    take: BATCH_SIZE,
                });

                if (!customers.length) {
                    break;
                }

                lastId = customers[customers.length - 1].customerID;

                const pincodeList: string[] = Array.from(
                    new Set(
                        customers
                            .map((customer) => {
                                const lead: any = customer.leads?.[0];

                                return (
                                    lead?.pincode?.toString() ||
                                    customer?.addresses?.[0]?.pincode?.toString() ||
                                    null
                                );
                            })
                            .filter((pincode): pincode is string => Boolean(pincode))
                    )
                );

                const pincodeData = pincodeList.length ? await this.tenantPrisma.client.indianpincode.findMany({
                    where: {
                        pincode: {
                            in: pincodeList,
                        },
                        isActive: true,
                    },
                    select: {
                        pincode: true,
                        district: true,
                        statename: true,
                    },
                })
                    : [];

                const pincodeMap = new Map(
                    pincodeData.map((item) => [
                        item.pincode,
                        {
                            city: item.district,
                            state: item.statename,
                        },
                    ])
                );

                for (const customer of customers) {
                    totalCases++;
                    for (const lead of customer.leads) {
                        const loan = lead.loan;
                        const approval = lead.approvals?.[0];
                        const credforge_bre_log: any = lead.credforge_bre_log?.[0];

                        const address = customer.addresses[0];
                        const pincode = lead?.pincode?.toString() || address?.pincode?.toString() || null;
                        const pincodeLocation: any = pincode ? pincodeMap.get(pincode) : null;
                        const city = address?.city || pincodeLocation?.city || null;
                        const state = address?.state || pincodeLocation?.state || null;
                        const employer = customer?.employer;

                        if (!loan) {
                            continue;
                        }

                        if (loan.status === 'Disbursed') {
                            totalNetDisbursed += Number(
                                loan.acutalDisbursalAmount || 0,
                            );
                        }

                        reportData.push({
                            customerId: customer.customerID,
                            createdAt: customer.createdDate,
                            source: customer.utmSource || '-',
                            medium: customer.utmMedium || '-',
                            campaign: customer.utmCampaign || '-',
                            userName:
                                customer.name ||
                                [
                                    customer.firstName,
                                    customer.middlename,
                                    customer.lastName,
                                ]
                                    .filter(Boolean)
                                    .join(' ') ||
                                '-',
                            phoneNumber: customer.mobile?.toString() || '',
                            empType: employer.employeeType || 'Null',
                            salaryMode: employer?.salaryMode || '-',
                            income: lead?.monthlyIncome || 0,
                            pincode: lead?.pincode?.toString() || customer?.addresses?.[0]?.pincode?.toString() || 'Null',
                            caseType: lead?.fbLeads || 'Null',
                            userStatus: approval?.status || lead?.status || 'OTP Done',
                            approvalAmount: approval?.loanAmtApproved || 0,
                            disbursedAt: loan?.disbursalDate || null,
                            disbursalAmount: loan?.acutalDisbursalAmount ?? loan?.disbursalAmount ?? 0,
                            rejectionReason: approval?.rejectionReason || 'Null',
                            // True Fund MIS fields
                            leadId: lead?.leadID || null,
                            aadhar_Details: customer.aadharNo ? true : false,
                            pan_Details: customer.pancard || customer?.finb_logs?.[0]?.pan ? true : false,
                            pancard: customer.pancard?.toString() || null,
                            city,
                            state,
                            facematch_Details: customer?.face_comparison?.[0]?.isMatch,
                            bankstatement: customer?.bankstatement?.[0]?.id ? true : false,
                            otpVerified: customer.isVerified ? true : false,
                            breApproveAmount: credforge_bre_log?.loanAmount || 0,
                            cbs_risk_grade_v1: credforge_bre_log?.responsePayload?.output_data?.features?.bureau?.cbs_risk_grade ?? null,
                            crif_scrore: credforge_bre_log?.responsePayload?.output_data?.features?.bureau?.bureau_score || null,
                            breRejected: credforge_bre_log?.status === 'Reject',
                            breApprove: credforge_bre_log?.status === 'Approve',
                            proceedToBank: credforge_bre_log?.status === 'Proceed to Bank',
                            breRejectRemarks: credforge_bre_log?.workflowName === 'pincode_validation' ? 'OGL Case' : credforge_bre_log?.status === 'Reject' ? credforge_bre_log?.responsePayload?.output_data?.rules_output?.final_decision?.DecisionReason || null : null,
                            e_sign: lead?.eagreement ? true : false,
                            emandate: lead?.easebuzz_emandates ? true : false,
                            reference: customer.reference ? true : false,
                        });
                    }
                }

                if (customers.length < BATCH_SIZE) {
                    break;
                }
            }

            const averagePerCase = totalCases > 0 ? totalNetDisbursed / totalCases : 0;

            return {
                message: 'Vendor report summary fetched successfully',
                data: {
                    totalNetDisbursed,
                    totalCases,
                    averagePerCase,
                    reportData
                },
            };
        } catch (error: any) {
            throw new BadRequestException(
                error?.message ||
                'An error occurred while fetching vendor report summary.',
            );
        }
    }



    // async getVendorReportSummary(payload: any) {
    //     try {
    //         const { fromDate, toDate, utmSource } = payload;

    //         const tag = this.clsService.get('tag');
    //         const role = this.clsService.get('role');

    //         let filterUtmSource = utmSource;

    //         // Non-admin users can only see their own tag data
    //         if (
    //             tag &&
    //             String(tag).toLowerCase() !== 'admin' &&
    //             role?.name !== 'Vendor Manager'
    //         ) {
    //             filterUtmSource = String(tag);
    //         }

    //         const now = new Date();

    //         const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', }).format(now);

    //         const effectiveFromDate = fromDate || todayIST;
    //         const effectiveToDate = toDate || todayIST;
    //         let campaignNames: string[] = [];

    //         // UTM filtering
    //         if (filterUtmSource) {
    //             const isAdmin = String(tag).toLowerCase() === 'admin';

    //             const isVendorManager = role?.name === 'Vendor Manager';

    //             if (!isAdmin && !isVendorManager) {
    //                 const userId = this.clsService.get('user');

    //                 const campaigns = await this.tenantPrisma.client.campaigns.findMany({
    //                         where: {
    //                             vendorId: userId,
    //                         },
    //                         select: {
    //                             name: true,
    //                         },
    //                     });

    //                 campaignNames = campaigns
    //                     .map((campaign) => campaign.name)
    //                     .filter(Boolean);
    //             }
    //         }

    //         /**
    //          * Since loan.disbursalDate is String,
    //          * assuming it is stored in YYYY-MM-DD format.
    //          *
    //          * Example:
    //          * 2026-09-25
    //          */
    //         const loanFilter: any = {
    //             status: 'Disbursed',
    //             exported: true,
    //             lead: {
    //                 fbLeads: 'New Case'
    //             },
    //             disbursalDate: {
    //                 gte: effectiveFromDate,
    //                 lte: effectiveToDate,
    //             },
    //         };

    //         /**
    //          * Vendor-wise UTM filtering.
    //          *
    //          * loan -> lead -> customer
    //          *
    //          * UTM source is taken from customer.
    //          */
    //         if (filterUtmSource) {
    //             const isAdmin = String(tag).toLowerCase() === 'admin';

    //             const isVendorManager = role?.name === 'Vendor Manager';

    //             if (!isAdmin && !isVendorManager) {
    //                 loanFilter.lead = {
    //                     fbLeads: 'New Case',
    //                     customer: {
    //                         utmSource: {
    //                             in: campaignNames,
    //                         },
    //                     },
    //                 };
    //             } else {
    //                 loanFilter.lead = {
    //                     fbLeads: 'New Case',
    //                     customer: {
    //                         utmSource: filterUtmSource,
    //                     },
    //                 };
    //             }
    //         }

    //         const BATCH_SIZE = 2000;

    //         let lastId: number | null = null;

    //         let totalCases = 0;
    //         let totalNetDisbursed = 0;


    //         while (true) {
    //             const loans = await this.tenantPrisma.client.loan.findMany({
    //                     where: {
    //                         ...loanFilter,

    //                         ...(lastId && {
    //                             id: {
    //                                 gt: lastId,
    //                             },
    //                         }),
    //                     },

    //                     select: {
    //                         id: true,
    //                         acutalDisbursalAmount: true,
    //                         disbursalAmount: true,
    //                         disbursalDate: true,
    //                         exported: true,
    //                         lead: {
    //                             select: {
    //                                 customer: {
    //                                     select: {
    //                                         customerID: true,
    //                                         utmSource: true,
    //                                     },
    //                                 },
    //                                 fbLeads: true
    //                             },
    //                         },
    //                     },

    //                     orderBy: {
    //                         id: 'asc',
    //                     },

    //                     take: BATCH_SIZE,
    //                 });
    //             if (!loans.length) {
    //                 break;
    //             }

    //             lastId = loans[loans.length - 1].id;

    //             for (const loan of loans) {
    //                 // console.log("loan-------------------",loan)
    //                 totalCases++;

    //                 totalNetDisbursed += Number( loan.acutalDisbursalAmount || 0, );
    //             }

    //             if (loans.length < BATCH_SIZE) {
    //                 break;
    //             }
    //         }

    //         const averagePerCase = totalCases > 0 ? totalNetDisbursed / totalCases : 0;

    //         return {
    //             message: 'Vendor report summary fetched successfully',

    //             data: {
    //                 totalNetDisbursed,
    //                 totalCases,
    //                 averagePerCase,
    //             },
    //         };
    //     } catch (error: any) {
    //         throw new BadRequestException(
    //             error?.message ||
    //             'An error occurred while fetching vendor report summary.',
    //         );
    //     }
    // }
}
