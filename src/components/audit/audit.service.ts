import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenet-prisma.service";
import { SmsService } from "../sms/sms.service";
import { EMANDATE_CONFIG } from "../../common/config/mandate.config";
import { convertBigIntToString, normalizeData } from "../../utility/helper";
import { GlobalService } from "../../common/globalFunctions/global.service";
import { ClsService } from "nestjs-cls";

@Injectable()
export class AuditService {
    constructor(
        private readonly tenantPrisma: TenantPrismaService,
        private readonly smsService: SmsService,
        private readonly globalService: GlobalService,
        private readonly clsService: ClsService,
    ) { }

    async getAuditLeads({ page, limit, filters, search, req, }: {
        page: number;
        limit: number;
        filters: {
            fbleads?: string;
            allSource?: string;
            fromDate?: string;
            toDate?: string;
        };
        search?: string;
        req: Request;
    }) {
        try {
            const skip = (page - 1) * limit;
            const systemUserId = await this.globalService.getSystemUserId();

            const approvalsWhere: any = {
                creditedBy: systemUserId
            };

            const where: any = {
                status: 'Disbursal_Sheet_Send',
                isAudit: false,
                loan: {
                    exported: false,
                },

                approvals: {
                    some: approvalsWhere,
                },
            };

            // ----------------------------------------
            // Approval date filter
            // ----------------------------------------

            if (filters.fromDate || filters.toDate) {
                if (filters.fromDate) {
                    const from = new Date(
                        `${filters.fromDate}T00:00:00.000Z`,
                    );

                    if (!isNaN(from.getTime())) {
                        approvalsWhere.createdDate = {
                            ...(approvalsWhere.createdDate || {}),
                            gte: from,
                        };
                    }
                }

                if (filters.toDate) {
                    const to = new Date(
                        `${filters.toDate}T23:59:59.999Z`,
                    );

                    if (!isNaN(to.getTime())) {
                        approvalsWhere.createdDate = {
                            ...(approvalsWhere.createdDate || {}),
                            lte: to,
                        };
                    }
                }
            } else {
                const todayEnd = new Date();
                todayEnd.setUTCHours(23, 59, 59, 999);
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setUTCDate(
                    sevenDaysAgo.getUTCDate() - 7,
                );
                sevenDaysAgo.setUTCHours(0, 0, 0, 0);
                approvalsWhere.createdDate = {
                    gte: sevenDaysAgo,
                    lte: todayEnd,
                };
            }

            // ----------------------------------------
            // Domain
            // ----------------------------------------

            const domain = (
                await this.smsService.getCurrentDomain(req)
            )?.toLowerCase();
            // ----------------------------------------
            // E-Mandate filter
            // ----------------------------------------

            const allowedDomains = process.env.GET_EMANDATE_BYPASS_ALLOWED_DOMAINS?.split(',').map((d) => d.trim().toLowerCase()) || [];

            if (!allowedDomains.includes(domain)) {
                const mandateConfig = EMANDATE_CONFIG[domain] || {
                    enable: false,
                    provider: 'none',
                };

                let emandateLeadIds: number[] = [];

                if (mandateConfig.provider === 'razorpay') {
                    const emandates =
                        await this.tenantPrisma.client.emandates.findMany({
                            where: {
                                token_id: {
                                    not: null,
                                },
                            },
                            select: {
                                leadID: true,
                            },
                        });

                    emandateLeadIds = emandates.map((e) =>
                        Number(e.leadID),
                    );
                }

                if (mandateConfig.provider === 'easeBuzz') {
                    const easebuzzEmandates =
                        await this.tenantPrisma.client.easebuzz_emandates.findMany({
                            where: {
                                OR: [
                                    {
                                        status: 'authorized',
                                    },
                                    {
                                        status: 'initiated',
                                        sub_status: 'accepted',
                                    },
                                ],
                            },
                            select: {
                                leadID: true,
                            },
                        });

                    emandateLeadIds = easebuzzEmandates.map((e) =>
                        Number(e.leadID),
                    );
                }

                // ----------------------------------------
                // Audit bypass
                // ----------------------------------------

                const bypassLeads =
                    await this.tenantPrisma.client.leads.findMany({
                        where: {
                            emandatebypass: true,
                        },
                        select: {
                            leadID: true,
                        },
                    });

                const allowedLeadIds = [
                    ...emandateLeadIds,
                    ...bypassLeads.map((l) => l.leadID),
                ];

                if (allowedLeadIds.length === 0) {
                    return convertBigIntToString({
                        total: 0,
                        page,
                        limit,
                        totalPages: 0,
                        data: [],
                    });
                }

                where.leadID = {
                    in: [...new Set(allowedLeadIds)],
                };
            }

            // ----------------------------------------
            // Search
            // ----------------------------------------

            if (search?.trim()) {
                const searchValue = search.trim();

                where.OR = [
                    {
                        customer: {
                            mobile: {
                                contains: searchValue,
                            },
                        },
                    },
                    {
                        customer: {
                            firstName: {
                                contains: searchValue,
                            },
                        },
                    },
                    {
                        customer: {
                            lastName: {
                                contains: searchValue,
                            },
                        },
                    },
                ];
            }

            // ----------------------------------------
            // Fetch data
            // ----------------------------------------

            const [leads, total] =
                await this.tenantPrisma.client.$transaction([
                    this.tenantPrisma.client.leads.findMany({
                        where,
                        skip,
                        take: limit,

                        orderBy: {
                            createdDate: 'desc',
                        },

                        include: {
                            customer: {
                                select: {
                                    customerID: true,
                                    name: true,
                                    firstName: true,
                                    lastName: true,
                                    mobile: true,
                                    email: true,
                                    aadharNo: true,
                                    reference: true,
                                },
                            },

                            credforge_bre_log: {
                                orderBy: {
                                    createdAt: 'desc',
                                },
                                take: 1,
                                select: {
                                    responsePayload: true,
                                },
                            },

                            approvals: {
                                select: {
                                    loanAmtApproved: true,
                                    tenure: true,
                                    roi: true,
                                    repayDate: true,
                                    GstOfAdminFee: true,
                                    adminFee: true,

                                    disbursalAccount: {
                                        select: {
                                            bank_holder_name: true,
                                            // accountNo: true,
                                            // bankIfsc: true,
                                            // bank: true,
                                            // bankBranch: true,
                                        },
                                    },
                                },
                            },

                            loan: true,
                        },
                    }),

                    this.tenantPrisma.client.leads.count({
                        where,
                    }),
                ]);
            // ----------------------------------------
            // Response transformation
            // ----------------------------------------

            const data = leads.map((lead) => {
                const response =
                    lead.credforge_bre_log?.[0]
                        ?.responsePayload as any;

                const riskGrade =
                    response?.output_data?.features?.output_features
                        ?.bureau?.cbs_risk_grade ??
                    response?.output_data?.features?.bureau
                        ?.cbs_risk_grade;

                return {
                    ...lead,
                    cbs_risk_grade: riskGrade,
                };
            });

            return convertBigIntToString({
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                data: normalizeData(data),
            });
        } catch (err: any) {
            throw new HttpException(
                {
                    success: false,
                    statusCode: 500,
                    message: 'Failed to fetch audit data',
                    error: err.message,
                },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    };

    private async validateAuditLead(leadID: number, req: Request,) {
        const systemUserId = await this.globalService.getSystemUserId();

        const lead = await this.tenantPrisma.client.leads.findFirst({
            where: {
                leadID,
                status: 'Disbursal_Sheet_Send',
                isAudit: false,
                loan: {
                    exported: false,
                },
                approvals: {
                    some: {
                        creditedBy: systemUserId,
                    },
                },
            },

            select: {
                leadID: true,
                isAudit: true,
                emandatebypass: true,
                customerID: true
            },
        });

        if (!lead) {
            throw new HttpException(
                {
                    success: false,
                    statusCode: 400,
                    message:
                        'Lead is not eligible for audit',
                },
                HttpStatus.BAD_REQUEST,
            );
        };

        const domain = (await this.smsService.getCurrentDomain(req))?.toLowerCase();

        const allowedDomains = process.env.GET_EMANDATE_BYPASS_ALLOWED_DOMAINS?.split(',').map((d) => d.trim().toLowerCase()) || [];

        if (allowedDomains.includes(domain)) {
            return lead;
        }

        if (lead.emandatebypass === true) {
            return lead;
        }

        const mandateConfig = EMANDATE_CONFIG[domain] || {
            enable: false,
            provider: 'none',
        };

        let mandateExists = false;

        if (mandateConfig.provider === 'razorpay') {
            const emandate = await this.tenantPrisma.client.emandates.findFirst({
                where: {
                    leadID: String(leadID),
                    token_id: {
                        not: null,
                    },
                },

                select: {
                    leadID: true,
                },
            });

            mandateExists = !!emandate;
        }

        if (mandateConfig.provider === 'easeBuzz') {
            const easebuzzEmandate = await this.tenantPrisma.client.easebuzz_emandates.findFirst({
                where: {
                    leadID: leadID,

                    OR: [
                        {
                            status: 'authorized',
                        },
                        {
                            status: 'initiated',
                            sub_status: 'accepted',
                        },
                    ],
                },

                select: {
                    leadID: true,
                },
            });

            mandateExists = !!easebuzzEmandate;
        }

        if (!mandateExists) {
            throw new HttpException(
                {
                    success: false,
                    statusCode: 400,
                    message:
                        'Lead is not eligible for audit. Valid e-mandate not found.',
                },
                HttpStatus.BAD_REQUEST,
            );
        }

        return lead;
    };

    async markLeadAsAudit(leadID: number, req: Request,) {
        try {

            const userData = await this.clsService.get('user');
            const lead = await this.validateAuditLead(leadID, req,);
            const updatedLead = await this.tenantPrisma.client.leads.update({
                where: {
                    leadID,
                },

                data: {
                    isAudit: true,
                },

                select: {
                    leadID: true,
                    isAudit: true,
                },
            });

            await this.tenantPrisma.client.callhistorylogs.create({
                data: {
                    customerID: Number(lead.customerID),
                    leadID: leadID,
                    callType: 'Audit',
                    status: 'audit-approved',
                    remark: 'audit-approved',
                    calledBy: userData,
                    noteli: 'audit-approved',
                } as any,
            })

            return convertBigIntToString({
                success: true,
                statusCode: 200,
                message: 'Lead audit completed successfully',
                data: updatedLead,
            });
        } catch (err: any) {
            if (err instanceof HttpException) {
                throw err;
            }
            throw new HttpException(
                {
                    success: false,
                    statusCode: 500,
                    message:
                        'Failed to update audit status',
                    error: err.message,
                },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}