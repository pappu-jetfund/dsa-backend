import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../auth/auth.service';
import { approval_status } from '@prisma/client';
import {
  convertBigIntToString,
  normalize,
  normalizeData,
} from '../../utility/helper';
import { SmsService } from '../sms/sms.service';
import { MailService } from '../mail/mail.service';
import { HeadRoles, READ_ONLY_ROLES } from '../../utility/enums';

import { penalConfig } from '../../common/config/penal.config';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { CacheService } from '../cache/cache.service';
import { CacheKey } from '../cache/cache.keys';
import { CibilService } from '../cibil/cibil.service';
import {
  PROCESS_STATUS,
  REJECTION_REQUIRED,
  VALID_STATUS,
} from '../../utility/constants';
import { SMS_CONFIG } from '../../common/config/smsConfig';

@Injectable()
export class ApprovalService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private configService: ConfigService,
    private readonly clsService: ClsService,
    private readonly authService: AuthService,
    private readonly smsService: SmsService,
    private readonly MailService: MailService,
    private readonly cacheService: CacheService,
    private readonly CibilService: CibilService,
  ) { }

  async approvedProcess(leadId: string, body: any, req: Request) {
    try {
      let domain = await this.smsService.getCurrentDomain(req);

      const lead = await this.tenantPrisma.client.leads.findUnique({
        where: { leadID: Number(leadId) },
      });

      if (!lead) {
        return { statusCode: 404, message: 'Lead not found' };
      }

      const userData = await this.clsService.get('user');

      const userRole = await this.authService.getUserById(userData);

      /// make this head or admin can perform action
      const isOwner = Number(lead.sanctionalloUID) === userData;
      const isCreditHead =
        userRole.role === HeadRoles.CREDIT_HEAD ||
        userRole.role === HeadRoles.ADMIN;

      if (!isOwner && !isCreditHead) {
        return { statusCode: 404, message: 'Unauthorized Access' };
      }

      // if (body.status == 'Approved_Process') {
      //   const accountNumber =
      //     await this.tenantPrisma.client.customeraccount.findUnique({
      //       where: { accountID: Number(body.disbursalaccountid) },
      //     });

      //   if (!accountNumber) {
      //     return { statusCode: 404, message: 'Account Number not found' };
      //   }
      // }

      const allowedKeys = [
        'branch',
        'loanAmtApproved',
        'roi',
        'repayDate',
        'adminFee',
        // 'disbursalaccountid',
        'status',
        'alternateMobile',
        'officialEmail',
        'remark',
        'rejectionReason',
      ];

      const numericKeys = [
        'loanAmtApproved',
        'roi',
        'adminFee',
        // 'disbursalaccountid',
      ];

      const updateData: any = {};

      for (const key of allowedKeys) {
        if (body[key] !== undefined) {
          if (numericKeys.includes(key)) {
            const numValue = Number(body[key]);
            if (isNaN(numValue)) {
              return {
                statusCode: 400,
                message: `${key} must be a valid number.`,
              };
            }

            if (key === 'loanAmtApproved' && numValue > 150000) {
              return {
                statusCode: 400,
                message: `Loan Amount cannot be greater than 100000.`,
              };
            }
            updateData[key] = numValue;
          } else {
            updateData[key] = body[key];
          }
        }
      }

      // if (body.status === 'Rejected_Process') {
      //   delete updateData.disbursalaccountid;
      // }

      if (body.status) {
        const validStatuses = Object.values(approval_status);
        if (!validStatuses.includes(body.status)) {
          return {
            statusCode: 400,
            message: `Invalid status value. Allowed values are: ${validStatuses.join(', ')}.`,
          };
        }
        updateData.status = body.status;
      }

      const rejectionRequiredStatuses = [
        'Rejected_Process',
        'Hold_Process',
        'Not_Required',
      ];

      if (
        rejectionRequiredStatuses.includes(body.status) &&
        !body.rejectionReason
      ) {
        return {
          statusCode: 400,
          message: `Rejection reason is required when status is ${body.status}.`,
        };
      }

      const shouldSkipRepayDate = rejectionRequiredStatuses.includes(
        body.status,
      );

      if (body.repayDate) {
        let repayDate: Date;

        if (
          typeof body.repayDate === 'string' &&
          body.repayDate.includes('-')
        ) {
          const [day, month, year] = body.repayDate.split('-').map(Number);

          repayDate = new Date(Date.UTC(year, month - 1, day));
        } else {
          const d = new Date(body.repayDate);
          repayDate = new Date(
            Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
          );
        }

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        const day = repayDate.getUTCDay(); // 0 = Sunday

        if (body.status !== 'Rejected_Process' && day === 0) {
          return {
            statusCode: 400,
            message: 'Repay date cannot be on Sunday.',
          };
        }


        const formattedDate = repayDate.toISOString().split('T')[0];

        const blockedDate = await this.tenantPrisma.client.payment_block_dates.findFirst({
          where: {
            isActive: true,
            date: new Date(formattedDate),
          },
          select: { id: true },
        });

        if (blockedDate && body.status != "Rejected_Process") {
          return {
            statusCode: 400,
            message: 'Selected repay date is blocked. Please choose another date.',
          };
        }

        const config = penalConfig[domain] || penalConfig['localhost'];

        const baseDiffInDays = Math.floor(
          (repayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );

        const diffInDays = baseDiffInDays + config.disbursalDayCount;

        updateData.repayDate = repayDate;
        updateData.tenure = diffInDays;

        if (!shouldSkipRepayDate) {
          if (diffInDays < 6 || diffInDays > 45) {
            return {
              statusCode: 400,
              message:
                'Repay date must be between 6 and 45 days (inclusive) from today.',
            };
          }
        }
      }

      if (body.adminFee !== undefined && !isNaN(body.adminFee)) {
        const gstAmount = (Number(body.adminFee) * 18) / 100;
        updateData.GstOfAdminFee = Number(gstAmount.toFixed(2));
      }

      updateData.cibil = 0;

      const result = await this.tenantPrisma.client.$transaction(async (tx) => {

        const existingApproval = await tx.approval.findFirst({
          where: {
            leadID: Number(leadId),
          },
        });

        let approvalData;

        if (existingApproval) {
          approvalData = await tx.approval.update({
            where: {
              approvalID: existingApproval.approvalID,
            },
            data: {
              customerID: lead.customerID,
              sanctionalloUID: userData,
              ...updateData,
            },
          });
        } else {
          approvalData = await tx.approval.create({
            data: {
              leadID: Number(leadId),
              customerID: lead.customerID,
              sanctionalloUID: userData,
              ...updateData,
            },
          });
        }

        const updatedLead = await tx.leads.update({
          where: { leadID: Number(leadId) },
          data: {
            status: body.status,
          },
        });

        const updateCallHistoryLogs = await tx.callhistorylogs.create({
          data: {
            customerID: Number(lead.customerID),
            leadID: Number(leadId),
            callType: 'IVR',
            appAmount: body.loanAmtApproved,
            status: body.status,
            remark: body.remark || '',
            calledBy: userData,
            noteli: '',
            callbackTime: new Date(),
          } as any,
        });
        const tenant = await this.CibilService.getCurrentDomain(req);
        await this.cacheService.del(
          CacheKey.lead(tenant, Number(leadId), 'Profile'),
        );
        await this.cacheService.del(
          CacheKey.lead(tenant, Number(leadId), 'LeadHistory'),
        );
        await this.cacheService.del(
          CacheKey.lead(tenant, Number(leadId), 'CIBIL'),
        );

        return { approvalData, updatedLead, updateCallHistoryLogs };
      });

      return normalize({
        statusCode: 200,
        message: 'Lead approval process completed successfully.',
        data: result,
      });
    } catch (error) {
      console.error('Error in approvedProcess:', error);
      return { statusCode: 500, message: 'Internal server error' };
    }
  }

  async ListapprovedProcess({
    page,
    limit,
    filters,
    search,
  }: {
    page: number;
    limit: number;
    search?: string;
    filters: {
      fbleads?: string;
      allSource?: string;
      fromDate?: string;
      toDate?: string;
    };
  }) {
    try {
      const skip = (page - 1) * limit;

      const userData = await this.clsService.get('user');

      const where: any = {
        status: 'Approved_Process',
      };

      // const userRole = await this.authService.getUserById(userData);

      const role = this.clsService.get('role');

      const headRoleValues = Object.values(HeadRoles);

      const isHead = headRoleValues.includes(role);
      const isReadOnly = READ_ONLY_ROLES.includes(role);

      if (!isHead && !isReadOnly) {
        return convertBigIntToString({
          total: 0,
          page,
          limit,
          totalPages: 0,
          data: [],
          msg: 'You are not allowed to perform this action Only Heads can access',
        });
      }

      if (filters.fromDate) {
        const from = new Date(filters.fromDate + 'T00:00:00.000Z');
        if (!isNaN(from.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), gte: from };
        }
      }

      if (filters.toDate) {
        // End of the day (23:59:59.999)
        const to = new Date(filters.toDate + 'T23:59:59.999Z');
        if (!isNaN(to.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), lte: to };
        }
      }

      if (search && search.trim() !== '') {
        const searchNumber = Number(search.trim());
        if (!isNaN(searchNumber)) {
          where.customer = {
            mobile: searchNumber,
          };
        }
      }

      const [leads, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.leads.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdDate: 'desc' },
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
              },
            },
          },
        }),

        this.tenantPrisma.client.leads.count({ where }),
      ]);

      const data = normalizeData(leads);

      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
      });
    } catch (err: any) {
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  async rejectedProcessList({
    page,
    limit,
    filters,
    search,
  }: {
    page: number;
    limit: number;
    search?: string;
    filters: {
      fbleads?: string;
      allSource?: string;
      fromDate?: string;
      toDate?: string;
    };
  }) {
    try {
      const skip = (page - 1) * limit;

      const userData = await this.clsService.get('user');

      const where: any = {
        status: 'Rejected_Process',
      };

      const role = this.clsService.get('role');
      const userId = this.clsService.get('user');

      const isHead = Object.values(HeadRoles).includes(role);
      const isReadOnly = READ_ONLY_ROLES.includes(role);

      if (!isHead && !isReadOnly) {
        where.OR = [
          { sanctionalloUID: userId.toString() },
          { callAssign: Number(userId) },
        ];
      }

      if (filters.fromDate) {
        const from = new Date(filters.fromDate + 'T00:00:00.000Z');
        if (!isNaN(from.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), gte: from };
        }
      }

      if (filters.toDate) {
        // End of the day (23:59:59.999)
        const to = new Date(filters.toDate + 'T23:59:59.999Z');
        if (!isNaN(to.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), lte: to };
        }
      }

      if (search && search.trim() !== '') {
        const searchNumber = Number(search.trim());
        if (!isNaN(searchNumber)) {
          where.customer = {
            mobile: searchNumber,
          };
        }
      }

      const [leads, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.leads.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdDate: 'desc' },
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
              },
            },
          },
        }),

        this.tenantPrisma.client.leads.count({ where }),
      ]);

      const data = normalizeData(leads);

      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
      });
    } catch (err: any) {
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  async holdProcessList({
    page,
    limit,
    filters,
    search,
  }: {
    page: number;
    limit: number;
    search?: string;
    filters: {
      fbleads?: string;
      allSource?: string;
      fromDate?: string;
      toDate?: string;
    };
  }) {
    try {
      const skip = (page - 1) * limit;

      const userData = await this.clsService.get('user');

      const where: any = {
        status: 'Hold_Process',
      };

      const role = this.clsService.get('role');
      const userId = this.clsService.get('user');

      const isHead = Object.values(HeadRoles).includes(role);
      const isReadOnly = READ_ONLY_ROLES.includes(role);

      if (!isHead && !isReadOnly) {
        where.OR = [
          { sanctionalloUID: userId || userId.toString() },
          { callAssign: Number(userId) },
        ];
      }

      if (filters.fromDate) {
        const from = new Date(filters.fromDate + 'T00:00:00.000Z');
        if (!isNaN(from.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), gte: from };
        }
      }

      if (filters.toDate) {
        // End of the day (23:59:59.999)
        const to = new Date(filters.toDate + 'T23:59:59.999Z');
        if (!isNaN(to.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), lte: to };
        }
      }

      if (search && search.trim() !== '') {
        const searchNumber = Number(search.trim());
        if (!isNaN(searchNumber)) {
          where.customer = {
            mobile: searchNumber,
          };
        }
      }

      const [leads, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.leads.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdDate: 'desc' },
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
              },
            },
          },
        }),

        this.tenantPrisma.client.leads.count({ where }),
      ]);

      const data = normalizeData(leads);

      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
      });
    } catch (err: any) {
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  async notRequiredProcessList({
    page,
    limit,
    filters,
    search,
  }: {
    page: number;
    limit: number;
    search?: string;
    filters: {
      fbleads?: string;
      allSource?: string;
      fromDate?: string;
      toDate?: string;
    };
  }) {
    try {
      const skip = (page - 1) * limit;

      const userData = await this.clsService.get('user');

      const where: any = {
        status: 'Not_Required_Process',
      };

      const role = this.clsService.get('role');
      const userId = this.clsService.get('user');

      const isHead = Object.values(HeadRoles).includes(role);
      const isReadOnly = READ_ONLY_ROLES.includes(role);

      if (!isHead && !isReadOnly) {
        where.OR = [
          { sanctionalloUID: userId.toString() },
          { callAssign: Number(userId) },
        ];
      }

      if (filters.fromDate) {
        const from = new Date(filters.fromDate + 'T00:00:00.000Z');
        if (!isNaN(from.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), gte: from };
        }
      }

      if (filters.toDate) {
        // End of the day (23:59:59.999)
        const to = new Date(filters.toDate + 'T23:59:59.999Z');
        if (!isNaN(to.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), lte: to };
        }
      }

      if (search && search.trim() !== '') {
        const searchNumber = Number(search.trim());
        if (!isNaN(searchNumber)) {
          where.customer = {
            mobile: searchNumber,
          };
        }
      }

      const [leads, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.leads.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdDate: 'desc' },
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
              },
            },
          },
        }),

        this.tenantPrisma.client.leads.count({ where }),
      ]);

      const data = normalizeData(leads);

      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
      });
    } catch (err: any) {
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  // async creditApproved(
  //   leadId: string,
  //   approvalID: string,
  //   body: any,
  //   req: Request,
  // ) {
  //   try {
  //     let domain;
  //     domain = await this.smsService.getCurrentDomain(req);
  //     const lead: any = await this.tenantPrisma.client.leads.findUnique({
  //       where: { leadID: Number(leadId) },
  //       include: {
  //         customer: true,
  //         eagreement: true,
  //       },
  //     });

  //     if (!lead) {
  //       return { statusCode: 404, message: 'Lead not found' };
  //     }

  //     if (lead.status === 'Disbursal_Sheet_Send') {
  //       return {
  //         statusCode: 404,
  //         message: 'Case is Alreday in Disbursal sheet Send',
  //       };
  //     }

  //     const approval = await this.tenantPrisma.client.approval.findUnique({
  //       where: { approvalID: Number(approvalID) },
  //     });

  //     if (!approval) {
  //       return { statusCode: 404, message: 'Approval record not found' };
  //     }

  //     const userData = await this.clsService.get('user');

  //     const userRole = await this.authService.getUserById(userData);

  //     const otherStatus = [
  //       'Rejected_Process',
  //       'Hold_Process',
  //       'Not_Required',
  //       'Approved_Process',
  //     ];

  //     if (!otherStatus.includes(body.status)) {
  //       const isCreditHead =
  //         userRole.role === HeadRoles.CREDIT_HEAD ||
  //         userRole.role === HeadRoles.ADMIN ||
  //         userRole.role === HeadRoles.SUPER_ADMIN;

  //       if (!isCreditHead) {
  //         return {
  //           statusCode: 403,
  //           message: 'You are not allowed to perform this action',
  //         };
  //       }
  //     }

  //     if (otherStatus.includes(body.status)) {
  //       const isOwner = Number(lead.sanctionalloUID) === userData;
  //       const isCreditHead =
  //         userRole.role === HeadRoles.CREDIT_HEAD ||
  //         userRole.role === HeadRoles.ADMIN;

  //       if (!isOwner && !isCreditHead) {
  //         return { statusCode: 404, message: 'Unauthorized Access' };
  //       }
  //     }

  //     // if (lead && lead.creditAssign !== userData) {
  //     //   return { statusCode: 404, message: 'Anauthorize Access' };
  //     // }

  //     const allowedKeys = [
  //       'branch',
  //       'loanAmtApproved',
  //       'roi',
  //       'repayDate',
  //       'adminFee',
  //       // 'disbursalaccountid',
  //       'status',
  //       'alternateMobile',
  //       'officialEmail',
  //       'remark',
  //       'rejectionReason',
  //     ];

  //     const numericKeys = [
  //       'loanAmtApproved',
  //       'roi',
  //       'adminFee',
  //       // 'disbursalaccountid',
  //     ];

  //     let bankDetails;

  //     const updateData: any = {};

  //     for (const key of allowedKeys) {
  //       const value = body[key];

  //       // Only update if the value is not undefined, null, or empty string
  //       if (value !== undefined && value !== null && value !== '') {
  //         if (numericKeys.includes(key)) {
  //           const numValue = Number(value);
  //           if (isNaN(numValue)) {
  //             return {
  //               statusCode: 400,
  //               message: `${key} must be a valid number.`,
  //             };
  //           }
  //           if (key === 'loanAmtApproved' && numValue > 150000) {
  //             return {
  //               statusCode: 400,
  //               message: `Loan Amount cannot be greater than 100000.`,
  //             };
  //           }
  //           updateData[key] = numValue;
  //         } else {
  //           updateData[key] = value;
  //         }
  //       }
  //     }

  //     if (body.status) {
  //       const validStatuses = [
  //         'Approved',
  //         'Rejected',
  //         'Hold',
  //         'Not_Required',
  //         'Rejected_Process',
  //         'Hold_Process',
  //         'Approved_Process',
  //       ];

  //       if (!validStatuses.includes(body.status)) {
  //         return {
  //           statusCode: 400,
  //           message: `Invalid status value. Allowed values are: ${validStatuses.join(', ')}.`,
  //         };
  //       }

  //       const rejectionRequiredStatuses = [
  //         'Rejected',
  //         'Hold',
  //         'Not_Required',
  //         'Rejected_Process',
  //         'Hold_Process',
  //       ];
  //       if (
  //         rejectionRequiredStatuses.includes(body.status) &&
  //         !body.rejectionReason
  //       ) {
  //         return {
  //           statusCode: 400,
  //           message: `Rejection reason is required when status is ${body.status}.`,
  //         };
  //       }

  //       updateData.status = body.status;
  //     }

  //     if (body.repayDate) {
  //       let repayDate: Date;

  //       if (
  //         typeof body.repayDate === 'string' &&
  //         body.repayDate.includes('-')
  //       ) {
  //         const [day, month, year] = body.repayDate.split('-').map(Number);

  //         // ✅ CREATE DATE IN UTC (NO DATE SHIFT)
  //         repayDate = new Date(Date.UTC(year, month - 1, day));
  //       } else {
  //         repayDate = new Date(body.repayDate);
  //       }

  //       const today = new Date();
  //       today.setUTCHours(0, 0, 0, 0);

  //       const config = penalConfig[domain] || penalConfig['localhost'];

  //       const baseDiffInDays = Math.floor(
  //         (repayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  //       );

  //       const diffInDays = baseDiffInDays + config.disbursalDayCount;

  //       if (body.status === 'Approved_Process' || body.status === 'Approved') {
  //         if (diffInDays < 6 || diffInDays > 45) {
  //           return {
  //             statusCode: 400,
  //             message:
  //               'Repay date must be between 6 and 45 days (inclusive) from today.',
  //           };
  //         }
  //       }

  //       updateData.repayDate = repayDate; // ✅ stays same date
  //       updateData.tenure = diffInDays;
  //     }

  //     if (body.adminFee !== undefined && !isNaN(body.adminFee)) {
  //       const gstAmount = (Number(body.adminFee) * 18) / 100;
  //       updateData.GstOfAdminFee = Number(gstAmount.toFixed(2));
  //     }

  //     if (body.status === 'Approved') {
  //       if (lead.eagreement) {

  //         if (lead.eagreement.isSigned) {
  //           return {
  //             statusCode: 400,
  //             success: false,
  //             message:
  //               'Status cannot be changed. The customer has already completed the e-sign process.',
  //           };
  //         }

  //         await this.tenantPrisma.client.eagreement.delete({
  //           where: {
  //             leadID: Number(leadId),
  //           },
  //         });
  //       }
  //     }

  //     // 1️⃣ FIRST: update DB in a FAST transaction
  //     const result = await this.tenantPrisma.client.$transaction(async (tx) => {
  //       await tx.approval.update({
  //         where: { approvalID: Number(approvalID) },
  //         data: { ...updateData, creditedBy: Number(userData) },
  //       });

  //       await tx.leads.update({
  //         where: { leadID: Number(leadId) },
  //         data: { status: body.status || approval.status },
  //       });

  //       await tx.callhistorylogs.create({
  //         data: {
  //           customerID: Number(lead.customerID),
  //           leadID: Number(leadId),
  //           callType: 'IVR',
  //           appAmount:
  //             body.loanAmtApproved?.toString() ||
  //             approval.loanAmtApproved.toString(),
  //           status: body.status || approval.status,
  //           remark: body.remark || '',
  //           calledBy: userData,
  //           noteli: '',
  //         } as any,
  //       });

  //       return { success: true };
  //     });

  //     if (result?.success && body.status === 'Rejected') {
  //       const name = lead.customer.name
  //       const loanRequired = lead.loanRequeried

  //       const mailData = {
  //         name: name,
  //         loanRequired: loanRequired,
  //         company_name: process.env.COMPANY_NAME,
  //         SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
  //         SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
  //       }

  //       const emailRes = await this.MailService.sendCustomMail(
  //         lead.customer.email,
  //         `Loan Rejection Notice ${mailData.company_name}`,
  //         'credit',
  //         'loan-rejected.hbs',
  //         mailData,
  //       );
  //       if (emailRes?.status) {
  //         await this.tenantPrisma.client.notifications.create({
  //           data: {
  //             customerID: Number(lead.customerID),
  //             leadID: Number(leadId),
  //             sender_email: emailRes.sender_email,
  //             notification: emailRes.html,
  //             type: 'Email',
  //             subject: 'Loan Rejection Notice',
  //             senderUser: Number(userData),
  //             createdDate: new Date(),
  //             mtype: 'crm',
  //           } as any,
  //         });

  //         await this.tenantPrisma.client.callhistorylogs.create({
  //           data: {
  //             customerID: Number(lead.customerID),
  //             leadID: Number(leadId),
  //             callType: 'Mail',
  //             status: 'rejection-notice',
  //             remark: 'rejection-notice',
  //             calledBy: userData,
  //             noteli: 'rejection-notice',
  //           } as any,
  //         });
  //       }
  //     }

  //     if (result?.success && body.status === 'Approved') {
  //       // ---------- SMS -----------

  //       try {
  //         let sms = SMS_CONFIG[domain];

  //         if (sms?.enable) {
  //           const provider = sms.provider;

  //           const customer_mobile = lead.customer.mobile.toString();
  //           const customer_name = lead.customer.name;
  //           const base_url = this.configService.get<string>('PORTAL_URL');
  //           const portal_url = `${base_url}${leadId}`;

  //           if (provider === 'trustsignal') {
  //             const sms = await this.smsService.sendSms(
  //               domain,
  //               customer_mobile,
  //               {
  //                 name: customer_name,
  //                 portal_url,
  //               },
  //             );
  //           } else if (provider === 'fast2sms') {
  //             await this.smsService.fastsendSms(
  //               customer_name,
  //               portal_url,
  //               customer_mobile,
  //             );
  //           } else if (provider === 'truebulk') {
  //             await this.smsService.truebulksms(
  //               customer_name,
  //               portal_url,
  //               customer_mobile,
  //             );
  //           } else if (provider === 'nimbusit') {
  //             await this.smsService.nimbussms(
  //               customer_name,
  //               portal_url,
  //               customer_mobile,
  //             );
  //           }
  //         }
  //       } catch (smsError: any) {
  //         console.error('SMS failed but process continued:', {
  //           leadId,
  //           error: smsError?.message || smsError,
  //         });
  //       }

  //       // ---------- CALCULATIONS ----------
  //       const interestAmount =
  //         (Number(body.loanAmtApproved || approval.loanAmtApproved) *
  //           Number(body.roi || approval.roi) *
  //           (Number(updateData.tenure) || Number(approval.tenure))) /
  //         100;

  //       const gstAmount = body.adminFee
  //         ? (Number(body.adminFee) * 18) / 100
  //         : (Number(approval.adminFee) * 18) / 100;

  //       const netDisbursedAmount =
  //         Number(body.loanAmtApproved || approval.loanAmtApproved) -
  //         (Number(body.adminFee || approval.adminFee) + Math.round(gstAmount));

  //       const repaymentAmount =
  //         Number(body.loanAmtApproved || approval.loanAmtApproved) +
  //         Math.round(interestAmount);

  //       let penalintrest;
  //       let penalCharges;

  //       const config = penalConfig[domain];
  //       if (config) {
  //         penalintrest = config.interest;
  //         penalCharges = config.charges;
  //       }

  //       const mailData = {
  //         name: lead.customer.name,
  //         SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
  //         SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
  //         createdDate: new Date().toISOString().split('T')[0],
  //         COMPANY_NAME: process.env.COMPANY_NAME,
  //         nbfc_name_show: process.env.NBFC_NAME_SHOW,
  //         company_mobile_no: process.env.COMPANY_MOBILE_NUMBER,
  //         loanAmtApproved: body.loanAmtApproved || approval.loanAmtApproved,
  //         roi: body.roi || approval.roi,
  //         intem: interestAmount.toFixed(2),
  //         adminFee: body.adminFee || approval.adminFee,
  //         gst: Math.round(gstAmount),
  //         fdb: netDisbursedAmount,
  //         rep1: repaymentAmount,
  //         repayDate: body.repayDate || approval.repayDate,
  //         tenure: updateData.tenure || approval.tenure,
  //         penalintrest: penalintrest || '2%',
  //         penalCharges: penalCharges || '1000',
  //         // account_detail: {
  //         //   bank: bankDetails.bank,
  //         //   accountNo: bankDetails.accountNo,
  //         //   bankIfsc: bankDetails.bankIfsc,
  //         // },
  //       };
  //       // ---------- MAIL SENDING ----------
  //       const emailRes = await this.MailService.sendCustomMail(
  //         lead.customer.email,
  //         `Loan Sanction Letter ${mailData.COMPANY_NAME}`,
  //         'credit',
  //         'loan-sanction-letter.hbs',
  //         mailData,
  //       );

  //       // ---------- SAVE NOTIFICATION ----------
  //       if (emailRes?.status) {
  //         await this.tenantPrisma.client.notifications.create({
  //           data: {
  //             customerID: Number(lead.customerID),
  //             leadID: Number(leadId),
  //             sender_email: emailRes.sender_email,
  //             notification: emailRes.html,
  //             type: 'Email',
  //             subject: 'Loan Sanction Letter',
  //             senderUser: Number(userData),
  //             createdDate: new Date(),
  //             mtype: 'crm',
  //           } as any,
  //         });

  //         await this.tenantPrisma.client.callhistorylogs.create({
  //           data: {
  //             customerID: Number(lead.customerID),
  //             leadID: Number(leadId),
  //             callType: 'Mail',
  //             status: 'sanction-letter',
  //             remark: 'sanction-letter',
  //             calledBy: userData,
  //             noteli: 'sanction-letter',
  //           } as any,
  //         });
  //       }
  //     }

  //     const tenant = await this.CibilService.getCurrentDomain(req);
  //     await Promise.all([
  //       this.cacheService.del(CacheKey.lead(tenant, Number(leadId), 'Profile')),
  //       this.cacheService.del(CacheKey.lead(tenant, Number(leadId), 'LeadHistory')),
  //       this.cacheService.del(CacheKey.lead(tenant, Number(leadId), 'CIBIL')),
  //     ]);

  //     return normalize({
  //       statusCode: 200,
  //       success: true,
  //       message: 'Approval completed successfully',
  //     });

  //     // const result = await this.tenantPrisma.client
  //     //   .$transaction(async (tx) => {
  //     //     await tx.approval.update({
  //     //       where: { approvalID: Number(approvalID) },
  //     //       data: { ...updateData, creditedBy: Number(userData) },
  //     //     });

  //     //     await tx.leads.update({
  //     //       where: { leadID: Number(leadId) },
  //     //       data: { status: body.status || approval.status },
  //     //     });

  //     //     await tx.callhistorylogs.create({
  //     //       data: {
  //     //         customerID: Number(lead.customerID),
  //     //         leadID: Number(leadId),
  //     //         callType: 'IVR',
  //     //         appAmount:
  //     //           body.loanAmtApproved?.toString() ||
  //     //           approval.loanAmtApproved.toString(),
  //     //         status: body.status || approval.status,
  //     //         remark: body.remark || '',
  //     //         calledBy: userData,
  //     //         noteli: '',
  //     //       } as any,
  //     //     });

  //     //     if (body.status === 'Approved') {
  //     //       const domain = await this.smsService.getCurrentDomain(req);
  //     //       const sms = SMS_CONFIG[domain];
  //     //       const provider = sms.provider;

  //     //       if (sms.enable) {
  //     //         if (provider == 'trustsignal') {
  //     //           const customer_mobile = lead.customer.mobile.toString();
  //     //           const customer_name = lead.customer.firstName;
  //     //           const base_url = this.configService.get<string>('PORTAL_URL');
  //     //           const portal_url = `${base_url}${leadId}`;

  //     //           await this.smsService.sendSms('loanApproved', customer_mobile, {
  //     //             name: customer_name,
  //     //             portal_url: portal_url,
  //     //           });
  //     //         } else if (provider == 'fast2sms') {
  //     //           const mobile = lead.customer.mobile.toString();
  //     //           const name = lead.customer.firstName;
  //     //           const base_url = this.configService.get<string>('PORTAL_URL');
  //     //           const portal_url = `${base_url}${leadId}`;

  //     //           await this.smsService.fastsendSms(name, portal_url, mobile);
  //     //         }
  //     //       }

  //     //       const interestAmount =
  //     //         (Number(body.loanAmtApproved || approval.loanAmtApproved) *
  //     //           Number(body.roi || approval.roi) *
  //     //           (Number(approval.tenure) || 0)) /
  //     //         100;

  //     //       const gstAmount = body.adminFee
  //     //         ? (Number(body.adminFee) * 18) / 100
  //     //         : (Number(approval.adminFee) * 18) / 100;

  //     //       const netDisburesedAmount =
  //     //         Number(body.loanAmtApproved || approval.loanAmtApproved) -
  //     //         (Number(body.adminFee || approval.adminFee) +
  //     //           Math.round(gstAmount));

  //     //       const repaymentAmount =
  //     //         Number(body.loanAmtApproved || approval.loanAmtApproved) +
  //     //         Math.round(interestAmount);

  //     //       const mailData = {
  //     //         name: lead.customer.firstName,
  //     //         SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
  //     //         SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
  //     //         createdDate: new Date().toISOString().split('T')[0],
  //     //         COMPANY_NAME: process.env.COMPANY_NAME,
  //     //         nbfc_name_show: process.env.NBFC_NAME_SHOW,
  //     //         company_mobile_no: process.env.COMPANY_MOBILE_NUMBER,
  //     //         loanAmtApproved: body.loanAmtApproved || approval.loanAmtApproved,
  //     //         roi: body.roi || approval.roi,
  //     //         intem: interestAmount.toFixed(2),
  //     //         adminFee: body.adminFee || approval.adminFee,
  //     //         gst: Math.round(gstAmount),
  //     //         fdb: netDisburesedAmount,
  //     //         rep1: repaymentAmount,
  //     //         repayDate: body.repayDate || approval.repayDate,
  //     //         tenure: approval.tenure,
  //     //         account_detail: {
  //     //           bank: bankDetails.bank,
  //     //           accountNo: bankDetails.accountNo,
  //     //           bankIfsc: bankDetails.bankIfsc,
  //     //         },
  //     //       };

  //     //       const data = await this.MailService.sendCustomMail(
  //     //         lead.customer.email,
  //     //         `Loan Sanction Letter ${mailData.COMPANY_NAME}`,
  //     //         'credit',
  //     //         'loan-sanction-letter.hbs',
  //     //         mailData,
  //     //       );

  //     //       if (data.status === true) {
  //     //         const create =
  //     //           await this.tenantPrisma.client.notifications.create({
  //     //             data: {
  //     //               customerID: Number(lead.customerID),
  //     //               leadID: Number(leadId),
  //     //               sender_email: data.sender_email,
  //     //               notification: data.html,
  //     //               type: 'Email',
  //     //               subject: 'Loan Sanction Letter',
  //     //               senderUser: Number(userData),
  //     //               createdDate: new Date(),
  //     //               mtype: 'crm',
  //     //             } as any,
  //     //           });
  //     //       }
  //     //     }

  //     //     return { success: true, message: 'Approval completed successfully' };
  //     //   })
  //     //   .catch((e) => {
  //     //     console.log(e, 'e');

  //     //     return {
  //     //       success: false,
  //     //       message: 'Transaction failed',
  //     //       error: e,
  //     //     };
  //     //   });

  //     // return normalize({
  //     //   statusCode: result.success ? 200 : 500,
  //     //   success: result.success,
  //     //   message: result.message,
  //     // });
  //   } catch (err: any) {
  //     console.error('Error in creditApproved:', err);
  //     return {
  //       statusCode: 500,
  //       success: false,
  //       message: err.message || 'Internal server error',
  //     };
  //   }
  // }

  async rejectedprocessExcel(
    res: Response,
    { fromDate, toDate }: { fromDate: string; toDate: string },
  ) {
    try {
      const where: any = {
        status: 'Rejected_Process',
      };

      if (fromDate) {
        const from = new Date(fromDate + 'T00:00:00.000Z');
        if (!isNaN(from.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), gte: from };
        }
      }

      if (toDate) {
        // End of the day (23:59:59.999)
        const to = new Date(toDate + 'T23:59:59.999Z');
        if (!isNaN(to.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), lte: to };
        }
      }

      const [leadData] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.leads.findMany({
          where,
          orderBy: { createdDate: 'desc' },
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
              },
            },
            approvals: {
              select: {
                rejectionReason: true,
                remark: true,
                updatedAt: true,
              },
            },
          },
        }),
      ]);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Rejected Leads');

      worksheet.columns = [
        { header: 'CustomerID', key: 'customerID', width: 20 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Monthly Income', key: 'monthlyIncome', width: 20 },
        { header: 'City', key: 'city', width: 20 },
        { header: 'Pincode', key: 'pincode', width: 20 },
        { header: 'state', key: 'state:', width: 20 },
        { header: 'Status', key: 'status', width: 20 },
        { header: 'Lead Type', key: 'fbLeads', width: 20 },
        { header: 'Remark', key: 'remark', width: 20 },
        { header: 'Reason', key: 'reason', width: 20 },
        { header: 'Date', key: 'date', width: 20 },
        { header: 'Source', key: 'source', width: 20 },
      ];

      leadData.forEach((item) => {
        worksheet.addRow({
          name: item?.customer?.name,
          customerID: item?.customer?.customerID,
          monthlyIncome: item?.monthlyIncome,
          city: item?.city,
          pincode: item?.pincode?.toString(),
          state: item?.state,
          status: item?.status,
          fbLeads: item?.fbLeads,
          remark: item?.approvals[0]?.remark,
          reason: item?.approvals[0]?.rejectionReason,
          date: item?.approvals[0]?.updatedAt,
          source: item?.utmSource,
        });
      });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      res.setHeader(
        'Content-Disposition',
        'attachment; filename=rejectedProcessLeads.xlsx',
      );

      await workbook.xlsx.write(res);

      res.end();
    } catch (err: any) {
      console.error('Error in Export:', err);
      return {
        statusCode: 500,
        success: false,
        message: 'Error in Export',
      };
    }
  }

  async creditApproved(
    leadId: string,
    approvalID: string,
    body: any,
    req: Request,
  ) {
    try {

      if (body.repayDate) {
        let repayDate

        if (typeof body.repayDate === "string" && body.repayDate.includes("-")) {
          const [day, month, year] = body.repayDate.split("-").map(Number);

          repayDate = new Date(Date.UTC(year, month - 1, day));
        } else {
          repayDate = new Date(body.repayDate);
        }

        if (isNaN(repayDate.getTime())) {
          return {
            statusCode: 400,
            message: "Invalid repay date format. Use DD-MM-YYYY or ISO format.",
          };
        }
        const day = repayDate.getUTCDay(); // 0 = Sunday


        const skipRepayDateValidation = [
          'Rejected',
          'Rejected_Process',
        ].includes(body.status);


        if (!skipRepayDateValidation && day === 0) {
          return {
            statusCode: 400,
            message: 'Repay date cannot be on Sunday.',
          };
        }

        const formattedDate = repayDate.toISOString().split('T')[0];

        const blockedDate = await this.tenantPrisma.client.payment_block_dates.findFirst({
          where: {
            isActive: true,
            date: new Date(formattedDate),
          },
          select: { id: true },
        });

        if (!skipRepayDateValidation && blockedDate) {
          return {
            statusCode: 400,
            message: 'Selected repay date is blocked. Please choose another date.',
          };
        }
      }
      const domain = await this.smsService.getCurrentDomain(req);
      const userId = await this.clsService.get('user');

      // Fetch all required data in parallel
      const [lead, approval, userRole] = await Promise.all([
        this.getLead(Number(leadId)),
        this.getApproval(Number(approvalID)),
        this.authService.getUserById(userId),
      ]);

      const validation = this.validateLeadAndApproval(lead, approval);

      if (validation) {
        return validation;
      }

      const permission = this.validatePermission(
        lead,
        userRole,
        userId,
        body.status,
      );

      if (permission) {
        return permission;
      }

      const statusValidation = this.validateStatus(body);

      if (statusValidation) {
        return statusValidation;
      }

      const updateData = await this.buildApprovalUpdateData(
        body,
        approval,
        domain,
      );

      if (body.status === 'Approved') {
        const agreementValidation = await this.validateEAgreement(
          Number(leadId),
          lead,
        );

        if (agreementValidation) {
          return agreementValidation;
        }
      }

      await this.executeApprovalTransaction(
        Number(leadId),
        Number(approvalID),
        lead,
        approval,
        updateData,
        userId,
        body,
      );

      switch (body.status) {
        case 'Approved':
          await this.handleApprovedFlow(
            lead,
            approval,
            updateData,
            body,
            domain,
            leadId,
            userId,
          );
          break;

        case 'Rejected':
          await this.handleRejectedFlow(lead, domain, leadId, userId);
          break;
      }

      await this.clearLeadCache(domain, Number(leadId));

      return normalize({
        statusCode: 200,
        success: true,
        message: 'Approval completed successfully',
      });
    } catch (err: any) {
      console.error(err);

      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal Server Error',
      };
    }
  }

  private async getLead(leadId: number) {
    return this.tenantPrisma.client.leads.findUnique({
      where: {
        leadID: leadId,
      },
      include: {
        customer: {
          include: {
            addresses: true,
            employer: true
          }
        },
        eagreement: true,
      },
    });
  }
  private async getApproval(approvalID: number) {
    return this.tenantPrisma.client.approval.findUnique({
      where: {
        approvalID,
      },
    });
  }
  private validatePermission(
    lead: any,
    userRole: any,
    userId: number,
    status: string,
  ) {
    const isCreditHead =
      userRole.role === HeadRoles.CREDIT_HEAD ||
      userRole.role === HeadRoles.ADMIN ||
      userRole.role === HeadRoles.SUPER_ADMIN;

    const isOwner = Number(lead.sanctionalloUID) === Number(userId);

    if (!PROCESS_STATUS.includes(status)) {
      if (!isCreditHead) {
        return {
          statusCode: 403,
          message: 'You are not allowed to perform this action',
        };
      }

      return null;
    }

    if (!isOwner && !isCreditHead) {
      return {
        statusCode: 403,
        message: 'Unauthorized Access',
      };
    }

    return null;
  }

  private validateStatus(body: any) {
    if (!body.status) {
      return null;
    }

    if (!VALID_STATUS.includes(body.status)) {
      return {
        statusCode: 400,
        message: `Invalid status. Allowed values are ${VALID_STATUS.join(', ')}`,
      };
    }

    if (REJECTION_REQUIRED.includes(body.status) && !body.rejectionReason) {
      return {
        statusCode: 400,
        message: `Rejection reason is required when status is ${body.status}.`,
      };
    }

    return null;
  }

  private async validateEAgreement(leadId: number, lead: any) {
    if (!lead.eagreement) {
      return null;
    }

    if (lead.eagreement.isSigned) {
      return {
        statusCode: 400,
        success: false,
        message:
          'Status cannot be changed. Customer has already completed e-sign.',
      };
    }

    await this.tenantPrisma.client.eagreement.delete({
      where: {
        leadID: leadId,
      },
    });

    return null;
  }

  private validateLeadAndApproval(lead: any, approval: any) {
    if (!lead) {
      return {
        statusCode: 404,
        message: 'Lead not found',
      };
    }

    if (!approval) {
      return {
        statusCode: 404,
        message: 'Approval record not found',
      };
    }

    if (lead.status === 'Disbursal_Sheet_Send') {
      return {
        statusCode: 400,
        message: 'Case is already in Disbursal sheet.',
      };
    }

    return null;
  }

  private readonly ALLOWED_KEYS = [
    'branch',
    'loanAmtApproved',
    'roi',
    'repayDate',
    'adminFee',
    'status',
    'alternateMobile',
    'officialEmail',
    'remark',
    'rejectionReason',
  ];

  private readonly NUMERIC_KEYS = ['loanAmtApproved', 'roi', 'adminFee'];

  private async buildApprovalUpdateData(
    body: any,
    approval: any,
    domain: string,
  ) {
    const updateData: any = {};

    /**
     * Copy request values
     */

    for (const key of this.ALLOWED_KEYS) {
      const value = body[key];

      if (value === undefined || value === null || value === '') {
        continue;
      }

      /**
       * Numeric validation
       */

      if (this.NUMERIC_KEYS.includes(key)) {
        const number = Number(value);

        if (isNaN(number)) {
          throw new BadRequestException(`${key} must be a valid number.`);
        }

        if (key === 'loanAmtApproved' && number > 150000) {
          throw new BadRequestException('Loan Amount cannot exceed 150000.');
        }

        updateData[key] = number;

        continue;
      }

      updateData[key] = value;
    }

    /**
     * Repay Date
     */

    if (body.repayDate) {
      const repay = this.calculateRepayDate(
        body.repayDate,
        body.status,
        domain,
      );

      updateData.repayDate = repay.repayDate;
      updateData.tenure = repay.tenure;
    }

    /**
     * GST
     */

    const adminFee = Number(body.adminFee ?? approval.adminFee ?? 0);

    updateData.GstOfAdminFee = this.calculateGST(adminFee);

    return updateData;
  }

  private calculateRepayDate(
    repayDateInput: string,
    status: string,
    domain: string,
  ) {
    let repayDate: Date;

    /**
     * dd-mm-yyyy
     */

    if (typeof repayDateInput === 'string' && repayDateInput.includes('-')) {
      const [day, month, year] = repayDateInput.split('-').map(Number);

      repayDate = new Date(Date.UTC(year, month - 1, day));
    } else {
      repayDate = new Date(repayDateInput);
    }

    const today = new Date();

    today.setUTCHours(0, 0, 0, 0);

    const config = penalConfig[domain] ?? penalConfig['localhost'];

    const days =
      Math.floor(
        (repayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      ) + config.disbursalDayCount;

    if (['Approved', 'Approved_Process'].includes(status)) {
      if (days < 6 || days > 45) {
        throw new BadRequestException(
          'Repay date must be between 6 and 45 days.',
        );
      }
    }

    return {
      repayDate,

      tenure: days,
    };
  }

  private calculateGST(adminFee: number): number {
    return Number(((adminFee * 18) / 100).toFixed(2));
  }

  private validateLoanAmount(amount: number) {
    if (amount > 150000) {
      throw new BadRequestException('Loan Amount cannot exceed 150000.');
    }
  }

  private async handleApprovedFlow(
    lead: any,
    approval: any,
    updateData: any,
    body: any,
    domain: string,
    leadId: string,
    userId: number,
  ) {
    try {
      await this.sendApprovalSMS(lead, domain, leadId);
      const calculation = this.calculateLoanDetails(
        lead,
        approval,
        updateData,
        body,
        domain,
      );

      await this.sendSanctionLetter(
        lead,
        calculation,
        approval,
        updateData,
        body,
        userId,
        leadId,
      );
    } catch (err) {
      console.error('Approved Flow Error', err);
    }
  }

  private async sendApprovalSMS(lead: any, domain: string, leadId: string) {
    const smsConfig = SMS_CONFIG[domain];

    if (!smsConfig?.enable) {
      return;
    }

    const mobile = lead.customer.mobile.toString();

    const name = lead.customer.name;

    const portalUrl = `${this.configService.get<string>(
      'PORTAL_URL',
    )}${leadId}`;

    const providers = {
      trustsignal: () =>
        this.smsService.sendSms(domain, mobile, {
          name,
          portal_url: portalUrl,
        }),

      fast2sms: () => this.smsService.fastsendSms(name, portalUrl, mobile),

      truebulk: () => this.smsService.truebulksms(name, portalUrl, mobile),

      nimbusit: () => this.smsService.nimbussms(name, portalUrl, mobile),
    };

    await providers[smsConfig.provider]?.();
  }

  private calculateLoanDetails(
    lead: any,
    approval: any,
    updateData: any,
    body: any,
    domain: string,
  ) {



    const loanAmount = Number(body.loanAmtApproved ?? approval.loanAmtApproved);

    const roi = Number(body.roi ?? approval.roi);

    const tenure = Number(updateData.tenure ?? approval.tenure);

    const adminFee = Number(body.adminFee ?? approval.adminFee);

    const interest = (loanAmount * roi * tenure) / 100;

    const gst = Math.round((adminFee * 18) / 100);

    const netDisbursed = loanAmount - (adminFee + gst);
    const netDisbursedPercent = (netDisbursed / loanAmount) * 100;

    const finalPf = adminFee + gst

    const repayment = loanAmount + Math.round(interest);

    const config = penalConfig[domain];

    const finalPfPercentage = (finalPf / loanAmount) * 100;

    const adminFeepercentage = (adminFee / loanAmount) * 100
    const yearlyRoi = roi * 365; // roi is daily %



    const apr =
      ((Number(adminFee) +
        Number(gst) +
        Number(interest)) /
        netDisbursed) *
      (365 / Number(tenure)) *
      100;

    // const apr = (yearlyRoi) + ((finalPfPercentage / netDisbursedPercent) * 100);


    return {
      loanAmount,

      roi,

      finalPfPercentage,
      tenure,
      adminFeepercentage,
      adminFee,

      interest,

      gst,

      repayment,

      netDisbursed,

      penalInterest: config?.interest ?? '1.5',

      penalCharges: config?.charges ?? '1000',
      apr,
    };
  }

  private async sendSanctionLetter(
    lead: any,
    calculation: any,
    approval: any,
    updateData: any,
    body: any,
    userId: number,
    leadId: string,
  ) {


    const mailData = {
      name: lead.customer.name,

      SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,

      SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,

      createdDate: new Date().toISOString().split('T')[0],

      COMPANY_NAME: process.env.COMPANY_NAME,

      nbfc_name_show: process.env.NBFC_NAME_SHOW,

      company_mobile_no: process.env.COMPANY_MOBILE_NUMBER,

      leadId: lead.leadID,
      pan: lead.customer.pancard,
      aadhaar: lead.customer.aadharNo,
      address: lead.customer.addresses[0].kyc_permanent_add,
      email: lead.customer.email,
      mobile: lead.customer.mobile,
      totalgstadminfee: calculation.finalPfPercentage.toFixed(2),
      apr: calculation.apr.toFixed(2),

      adminFeepercentage: calculation.adminFeepercentage,

      loanAmtApproved: calculation.loanAmount,

      roi: calculation.roi,

      intem: calculation.interest.toFixed(2),

      adminFee: calculation.adminFee,

      gst: calculation.gst,

      fdb: calculation.netDisbursed,

      rep1: calculation.repayment,

      repayDate: body.repayDate ?? approval.repayDate,

      tenure: calculation.tenure,

      penalintrest: calculation.penalInterest,

      penalCharges: calculation.penalCharges,
    };

    const email = await this.MailService.sendCustomMail(
      lead.customer.email,

      `Loan Sanction Letter ${mailData.COMPANY_NAME}`,

      'credit',

      'newsanctionletter.hbs',

      mailData,
    );

    if (!email?.status) {
      return;
    }

    await Promise.all([
      this.tenantPrisma.client.notifications.create({
        data: {
          customerID: Number(lead.customerID),

          leadID: Number(leadId),

          sender_email: email.sender_email,

          notification: email.html,

          type: 'Email',

          subject: 'Loan Sanction Letter',

          senderUser: Number(userId),

          createdDate: new Date(),

          mtype: 'crm',
        } as any,
      }),

      this.tenantPrisma.client.callhistorylogs.create({
        data: {
          customerID: Number(lead.customerID),

          leadID: Number(leadId),

          callType: 'Mail',

          status: 'sanction-letter',

          remark: 'sanction-letter',

          calledBy: userId,

          noteli: 'sanction-letter',
        } as any,
      }),
    ]);
  }

  private async handleRejectedFlow(
    lead: any,
    domain: string,
    leadId: string,
    userId: number,
  ) {
    try {
      const email = await this.sendLoanRejectedMail(lead, domain);

      if (!email?.status) {
        return;
      }

      await this.saveRejectedNotification(lead, leadId, userId, email);
    } catch (err) {
      console.error('Rejected Flow Error', err);
    }
  }

  private async sendLoanRejectedMail(lead: any, domain: string) {
    const mailData = {
      name: lead.customer.name,

      loanRequired: lead.loanRequeried,

      company_name: process.env.COMPANY_NAME,

      SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,

      SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
    };

    return this.MailService.sendCustomMail(
      lead.customer.email,

      `Loan Rejection Notice ${mailData.company_name}`,

      'credit',

      'loan-rejected.hbs',

      mailData,
    );
  }

  private async saveRejectedNotification(
    lead: any,
    leadId: string,
    userId: number,
    email: any,
  ) {
    await Promise.all([
      this.tenantPrisma.client.notifications.create({
        data: {
          customerID: Number(lead.customerID),

          leadID: Number(leadId),

          sender_email: email.sender_email,

          notification: email.html,

          type: 'Email',

          subject: 'Loan Rejection Notice',

          senderUser: Number(userId),

          createdDate: new Date(),

          mtype: 'crm',
        } as any,
      }),

      this.tenantPrisma.client.callhistorylogs.create({
        data: {
          customerID: Number(lead.customerID),

          leadID: Number(leadId),

          callType: 'Mail',

          status: 'rejection-notice',

          remark: 'rejection-notice',

          calledBy: userId,

          noteli: 'rejection-notice',
        } as any,
      }),
    ]);
  }

  private async saveEmailNotification(
    lead: any,
    leadId: number,
    userId: number,
    email: any,
    subject: string,
    status: string,
  ) {
    await Promise.all([
      this.tenantPrisma.client.notifications.create({
        data: {
          customerID: Number(lead.customerID),

          leadID: leadId,

          sender_email: email.sender_email,

          notification: email.html,

          type: 'Email',

          subject,

          senderUser: Number(userId),

          createdDate: new Date(),

          mtype: 'crm',
        } as any,
      }),

      this.tenantPrisma.client.callhistorylogs.create({
        data: {
          customerID: Number(lead.customerID),

          leadID: leadId,

          callType: 'Mail',

          status,

          remark: status,

          calledBy: userId,

          noteli: status,
        } as any,
      }),
    ]);
  }

  private async executeApprovalTransaction(
    leadId: number,
    approvalId: number,
    lead: any,
    approval: any,
    updateData: any,
    userId: number,
    body: any,
  ) {
    return this.tenantPrisma.client.$transaction(async (tx) => {
      /**
       * Approval
       */

      await tx.approval.update({
        where: {
          approvalID: approvalId,
        },
        data: {
          ...updateData,
          creditedBy: Number(userId),
        },
      });

      /**
       * Lead Status
       */

      await tx.leads.update({
        where: {
          leadID: leadId,
        },
        data: {
          status: body.status ?? approval.status,
          isAudit: true
        },
      });

      /**
       * Call History
       */

      await tx.callhistorylogs.create({
        data: {
          customerID: Number(lead.customerID),

          leadID: leadId,

          callType: 'IVR',

          appAmount: String(body.loanAmtApproved ?? approval.loanAmtApproved),

          status: body.status ?? approval.status,

          remark: body.remark ?? '',

          calledBy: Number(userId),

          noteli: '',
        } as any,
      });

      return true;
    });
  }

  private async clearLeadCache(tenant: string, leadId: number) {
    await Promise.all([
      this.cacheService.del(CacheKey.lead(tenant, leadId, 'Profile')),

      this.cacheService.del(CacheKey.lead(tenant, leadId, 'LeadHistory')),

      this.cacheService.del(CacheKey.lead(tenant, leadId, 'CIBIL')),
    ]);
  }
}
