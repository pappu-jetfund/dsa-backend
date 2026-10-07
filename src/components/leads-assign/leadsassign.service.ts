import { Injectable } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenet-prisma.service";
import { ConfigService } from "@nestjs/config";
import { ClsService } from "nestjs-cls";
import { AuthService } from "../auth/auth.service";
import { SmsService } from "../sms/sms.service";
import { RolesTypes } from "../../utility/enums";
import { convertBigIntToString, normalizeData } from "../../utility/helper";

@Injectable()
export class LeadsAssignService {
    constructor(
        private readonly tenantPrisma: TenantPrismaService,
        private configService: ConfigService,
        private readonly clsService: ClsService,
        private readonly authService: AuthService,
        private readonly smsService: SmsService,
    ) { }


    async getUsernameByRole(role: string, query?: { page?: number; limit?: number; search?: string }) {
        try {
            const allowedRoles = ['Calling Team', 'Collection Team', 'Credit Team'];

            if (!allowedRoles.includes(role)) {
                return [];
            }

            const { page, limit, search } = query || {};

            const where: any = {
                role,
                status: 'Active',
            };

            if (search && search.trim() !== '') {
                const searchStr = String(search);

                where.OR = [
                    { name: { contains: searchStr } },
                    { email: { contains: searchStr } },
                    { mobile_number: { equals: searchStr } },
                ];
            }

            if (page && limit) {
                const skip = (page - 1) * limit;

                const [users, total] = await this.tenantPrisma.client.$transaction([
                    this.tenantPrisma.client.lms_users.findMany({
                        where,
                        skip,
                        take: limit,
                        select: {
                            userID: true,
                            name: true,
                            username: true,
                            email: true,
                            role: true,
                            mobile_number: true,
                        },
                        orderBy: { userID: 'desc' },
                    }),

                    this.tenantPrisma.client.lms_users.count({ where }),
                ]);

                return {
                    data: users,
                    pagination: {
                        total,
                        page,
                        limit,
                        totalPages: Math.ceil(total / limit),
                    }
                };
            }

            const users = await this.tenantPrisma.client.lms_users.findMany({
                where,
                select: {
                    userID: true,
                    name: true,
                    username: true,
                    email: true,
                    role: true,
                    mobile_number: true,
                },
                orderBy: { userID: 'desc' },
            });

            return users;

        } catch (err: any) {
            return {
                success: false,
                error: err.message,
            };
        }
    }

    async collectioncaseTransfer(leadIds, assignTo) {
        try {

            if (!leadIds.length) {
                return {
                    sucess: false,
                    message: "No lead is provided to assign "
                }
            }

            const role = this.clsService.get('role');
            const userId = this.clsService.get('user');

            const isHead = [RolesTypes.COLLECTION_HEAD, RolesTypes.ADMIN, RolesTypes.SUPER_ADMIN].includes(role);

            if (!isHead) {
                return {
                    sucess: false,
                    message: "Only Head and Admin can assign the leads"
                }
            }

            const assignuserCheck = await this.tenantPrisma.client.lms_users.findUnique({
                where: {
                    userID: Number(assignTo),
                    role: RolesTypes.COLLECTION_TEAM,
                    status: "Active"
                },
            })
            if (!assignuserCheck) {
                return {
                    sucess: false,
                    message: `The User you will provide not in ${RolesTypes.COLLECTION_TEAM} / Inactive`
                }
            }
            const numericLeadIds = leadIds.map((id) => Number(id));

            const result = await this.tenantPrisma.client.$transaction(async (tx) => {
                const leadsupdate = await tx.leads.updateMany({
                    where: { leadID: { in: numericLeadIds } },
                    data: {
                        collectionUID: Number(assignTo)
                    },
                });

                const customers = await tx.leads.findMany({
                    where: {
                        leadID: { in: numericLeadIds },
                    },
                    select: {
                        leadID: true,
                        customerID: true,
                    },
                });


                const leadCustomerMap = Object.fromEntries(
                    customers.map((c) => [c.leadID, c.customerID])
                );


                const logsData = numericLeadIds.map((leadId) => ({
                    leadID: leadId,
                    calledBy: userId,
                    callbackTime: new Date(),
                    remark: `collectionllection id transfer to ${assignTo} by ${userId}`,
                    callType: 'Collection Assign',
                    noteli: '',
                    customerID: Number(leadCustomerMap[leadId]),
                    status: '',
                }));


                const callHistoryLogs = await tx.callhistorylogs.createMany({
                    data: logsData,
                });

                return leadsupdate;
            })
            return result;


        } catch (err: any) {
            return {
                sucess: false,
                message: err.message
            }
        }
    }

    async getUserAssinedLeads(userId: number, { page, limit, role, filters }: { page: number; limit: number; role: string; filters: any; }) {
        try {
            const roleFieldMap: Record<string, string> = {
                "Calling Team": "callAssign",
                "Collection Team": "collectionUID",
                "Credit Team": "creditAssign",
            };

            const field = roleFieldMap[role];

            if (!field) {
                return [];
            };

            const skip = (page - 1) * limit;

            const where: any = {
                [field]: userId,
            };

            if (filters.fromDate) {
                const from = new Date(filters.fromDate + 'T00:00:00.000Z');
                if (!isNaN(from.getTime())) {
                    where.createdDate = { ...(where.createdDate || {}), gte: from };
                }
            }

            if (filters.toDate) {
                const to = new Date(filters.toDate + 'T23:59:59.999Z');
                if (!isNaN(to.getTime())) {
                    where.createdDate = { ...(where.createdDate || {}), lte: to };
                }
            }

            const [leads, total] = await this.tenantPrisma.client.$transaction([
                this.tenantPrisma.client.leads.findMany({
                    where,
                    skip,
                    take: limit,
                    select: {
                        leadID: true,
                        loanRequeried: true,
                        monthlyIncome: true,
                        salaryMode: true,
                        pincode: true,
                        city: true,
                        state: true,
                        status: true,
                        createdDate: true,
                        customer: {
                            select: {
                                name: true,
                                mobile: true,
                                email: true
                            }
                        }
                    },
                    orderBy: { createdDate: 'desc' }
                }),

                this.tenantPrisma.client.leads.count({ where }),
            ]);

            const data = normalizeData(leads);
            return convertBigIntToString({
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                data
            })

        } catch (err: any) {
            return {
                success: false,
                error: err?.message || "Something went wrong",
            };
        }
    }


    async sanctioncaseTransfer(leadIds, assignTo) {
        try {

            if (!leadIds.length) {
                return {
                    sucess: false,
                    message: "No lead is provided to assign "
                }
            }

            const role = this.clsService.get('role');
            const userId = this.clsService.get('user');

            const isHead = [RolesTypes.CREDIT_HEAD, RolesTypes.ADMIN, RolesTypes.SUPER_ADMIN].includes(role);

            if (!isHead) {
                return {
                    sucess: false,
                    message: "Only Head and Admin can assign the leads"
                }
            }

            const assignuserCheck = await this.tenantPrisma.client.lms_users.findUnique({
                where: {
                    userID: Number(assignTo),
                    role: RolesTypes.CREDIT_TEAM,
                    status: "Active"
                },
            })
            if (!assignuserCheck) {
                return {
                    sucess: false,
                    message: `The User you will provide not in ${RolesTypes.CREDIT_TEAM} / Inactive`
                }
            }
            const numericLeadIds = leadIds.map((id) => Number(id));

            const result = await this.tenantPrisma.client.$transaction(async (tx) => {
                const leadsupdate = await tx.leads.updateMany({
                    where: { leadID: { in: numericLeadIds } },
                    data: {
                        sanctionalloUID: Number(assignTo)
                    },
                });

                const customers = await tx.leads.findMany({
                    where: {
                        leadID: { in: numericLeadIds },
                    },
                    select: {
                        leadID: true,
                        customerID: true,
                    },
                });


                const leadCustomerMap = Object.fromEntries(
                    customers.map((c) => [c.leadID, c.customerID])
                );


                const logsData = numericLeadIds.map((leadId) => ({
                    leadID: leadId,
                    calledBy: userId,
                    callbackTime: new Date(),
                    remark: `sanction cases transfer to ${assignTo} by ${userId}`,
                    callType: 'Sanction Assign',
                    noteli: '',
                    customerID: Number(leadCustomerMap[leadId]),
                    status: '',
                }));


                const callHistoryLogs = await tx.callhistorylogs.createMany({
                    data: logsData,
                });

                return leadsupdate;
            })
            return result;


        } catch (err: any) {
            return {
                sucess: false,
                message: err.message
            }
        }
    }


    async callingcaseTransfer(leadIds, assignTo) {
        try {

            if (!leadIds.length) {
                return {
                    sucess: false,
                    message: "No lead is provided to assign "
                }
            }

            const role = this.clsService.get('role');
            const userId = this.clsService.get('user');

            const isHead = [RolesTypes.CALLING_HEAD, RolesTypes.ADMIN, RolesTypes.SUPER_ADMIN].includes(role);

            if (!isHead) {
                return {
                    sucess: false,
                    message: "Only Head and Admin can assign the leads"
                }
            }

            const assignuserCheck = await this.tenantPrisma.client.lms_users.findUnique({
                where: {
                    userID: Number(assignTo),
                    role: RolesTypes.CALLING_TEAM,
                    status: "Active"
                },
            })
            if (!assignuserCheck) {
                return {
                    sucess: false,
                    message: `The User you will provide not in ${RolesTypes.CALLING_TEAM} / Inactive`
                }
            }
            const numericLeadIds = leadIds.map((id) => Number(id));

            const result = await this.tenantPrisma.client.$transaction(async (tx) => {
                const leadsupdate = await tx.leads.updateMany({
                    where: { leadID: { in: numericLeadIds } },
                    data: {
                        callAssign: Number(assignTo)
                    },
                });

                const customers = await tx.leads.findMany({
                    where: {
                        leadID: { in: numericLeadIds },
                    },
                    select: {
                        leadID: true,
                        customerID: true,
                    },
                });


                const leadCustomerMap = Object.fromEntries(
                    customers.map((c) => [c.leadID, c.customerID])
                );


                const logsData = numericLeadIds.map((leadId) => ({
                    leadID: leadId,
                    calledBy: userId,
                    callbackTime: new Date(),
                    remark: `calling cases transfer to ${assignTo} by ${userId}`,
                    callType: 'Calling Assign',
                    noteli: '',
                    customerID: Number(leadCustomerMap[leadId]),
                    status: '',
                }));


                const callHistoryLogs = await tx.callhistorylogs.createMany({
                    data: logsData,
                });

                return leadsupdate;
            })
            return result;


        } catch (err: any) {
            return {
                sucess: false,
                message: err.message
            }
        }
    }
}