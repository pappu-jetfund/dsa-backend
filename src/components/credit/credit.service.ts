import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../auth/auth.service';
import { SmsService } from '../sms/sms.service';
import { Injectable } from '@nestjs/common';
import { convertBigIntToString, normalize, normalizeData } from '../../utility/helper';
import { MailService } from '../mail/mail.service';
import { HeadRoles, READ_ONLY_ROLES } from '../../utility/enums';
import { mailConfig } from '../../common/config/ mailConfig';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';

@Injectable()
export class CreditService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private configService: ConfigService,
    private readonly clsService: ClsService,
    private readonly authService: AuthService,
    private readonly smsService: SmsService,
    private readonly MailService: MailService,
  ) { }

  async listApproved({
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
        status: 'Approved',
      };

      // const userRole = await this.authService.getUserById(userData);

      const role = this.clsService.get('role');

      const isAllowed =
        [
          HeadRoles.CREDIT_HEAD,
          HeadRoles.ADMIN,
          HeadRoles.SUPER_ADMIN,
        ].includes(role) || READ_ONLY_ROLES.includes(role);


      if (!isAllowed) {
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

  async listRejected({
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
        status: 'Rejected',
      };

      // const userRole = await this.authService.getUserById(userData);

      const role = this.clsService.get('role');

      if (
        ![...Object.values(HeadRoles), ...READ_ONLY_ROLES].includes(role)
      ) {
        return {
          statusCode: 403,
          message: 'You are not allowed to perform this action',
        };
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
            approvals: {
              select: {
                rejectionReason: true,
                remark: true,

              }
            }
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

  async listHold({
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
        status: 'Hold',
      };

      // const userRole = await this.authService.getUserById(userData);

      const role = this.clsService.get('role');

      if (
        ![...Object.values(HeadRoles), ...READ_ONLY_ROLES].includes(role)
      ) {
        return {
          statusCode: 403,
          message: 'You are not allowed to perform this action',
        };
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

  async listNotRequired({
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
        status: 'Not_Required',
      };

      // const userRole = await this.authService.getUserById(userData);

      const role = this.clsService.get('role');

      if (
        ![...Object.values(HeadRoles), ...READ_ONLY_ROLES].includes(role)
      ) {
        return {
          statusCode: 403,
          message: 'You are not allowed to perform this action',
        };
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

  async sendMail() {
    try {
      const data = await this.MailService.sendCustomMail(
        'shashankpandey9981@gmail.com',
        'Loan Sanction Letter instantRupya',
        'credit', // smtpType
        'loan-sanction-letter.hbs',
        {
          SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
          SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,

          createdDate: '25/12/2025',
          COMPANY_NAME: process.env.COMPANY_NAME,
          nbfc_name_show: process.env.NBFC_NAME_SHOW,
          company_mobile_no: process.env.COMPANY_MOBILE_NUMBER,
          loanAmtApproved: '30000',
          roi: '1',
          intem: '10800',
          adminFee: '1150',
          gst: '207',
          fdb: '28643',
          rep1: '40800',
          repayDate: '31-01-2026',
          tenure: '36',
          penalintrest: '2%',
          penalCharges: '1000',
          account_detail: {
            bank: 'HDFC Bank',
            accountNo: '05771050032549',
            bankIfsc: 'HDFC0000577',
          },
          name: 'Testing',
          // amount: 100000,
        },
      );
      return { status: true, message: 'sendMail method called', data: data };
    } catch (err) {

      return { status: false, message: err || 'Error sending mail' };
    }
  }

  async sendMailType(leadID: string, body: any) {
    try {
      if (!leadID) {
        return {
          statusCode: 400,
          msg: 'leadId is required',
        };
      }

      const lead: any = await this.tenantPrisma.client.leads.findUnique({
        where: { leadID: Number(leadID) },
        include: {
          customer: true,
          loan: true,
          approvals: true,
          collections: {
            where: {
              collectionStatus: 'Approved',
            },
          },
        },
      });

      if (!lead) {
        return { statusCode: 404, message: 'Lead not found' };
      }

      const validTypes = [
        'not_answring_call',
        'repeatedly_making_commitments',
        'not_paid_anything',
        'not_getting_salary',
        'alining_visit',
        'do_not_make_cash_payment',
        'left_home_and_not_paid',
        'creditReminderMailSend',
        'loan-close',
        'settle-letter',
        'sameDayReminderMailSend',
        'one_day_before_due_date',
        'four_days_before_due_date',
        'ten_days_before_due_date',
      ];

      if (!body.type || !validTypes.includes(body.type)) {
        return {
          statusCode: 400,
          message: `Invalid type. Allowed types are: ${validTypes.join(', ')}`,
        };
      }

      const config = mailConfig[body.type];
      if (!config) {
        return {
          statusCode: 400,
          message: `Invalid type: ${body.type}`,
        };
      }

      const templateData = config.buildData(lead);

      const data = await this.MailService.sendCustomMail(
        lead.customer.email,
        config.subject,
        config.smtpType,
        config.template,
        templateData,
      );

      const userData = await this.clsService.get('user');

      if (data.status === true) {
        const create = await this.tenantPrisma.client.notifications.create({
          data: {
            customerID: Number(lead.customer.customerID),
            leadID: Number(lead.leadID),
            sender_email: data.sender_email,
            notification: data.html,
            type: 'Email',
            subject: config.subject,
            senderUser: Number(userData),
            createdDate: new Date(),
            mtype: 'crm',
          } as any,
        });

        const callHistoryLog =
          await this.tenantPrisma.client.callhistorylogs.create({
            data: {
              customerID: Number(lead.customerID),
              leadID: Number(leadID),
              callType: 'Mail',
              status: body.type,
              remark: body.type,
              calledBy: userData,
              noteli: body.type,
            } as any,
          });
      }
      return {
        statusCode: 200,
        message: data.message,
        sender_email: data.sender_email,
        mailto: lead.customer.email,
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        error: 'Failed to Send Mail',
        details: err.message,
      };
    }
  }



  async rejectedExcel(
    res: Response,
    { fromDate, toDate }: { fromDate: string; toDate: string },
  ) {
    try {

      const where: any = {
        status: 'Rejected',
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
                updatedAt: true
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
          source: item?.utmSource
        });
      })


      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      res.setHeader(
        'Content-Disposition',
        'attachment; filename=rejectedLeads.xlsx',
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


  async addCreditRemarks(leadId: string, body: any, req: Request) {
    try {


      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return {
          statusCode: 400,
          message: 'Request body is required',
        };
      }

      const allowedKeys = ['remark'];

      const invalidKeys = Object.keys(body).filter(
        (key) => !allowedKeys.includes(key),
      );

      if (invalidKeys.length > 0) {
        return {
          statusCode: 400,
          message: `Invalid field(s): ${invalidKeys.join(', ')}`,
        };
      }
      if (body.remark === undefined || body.remark === null) {
        return {
          statusCode: 400,
          message: 'Remark is required',
        };
      }

      if (typeof body.remark !== 'string') {
        return {
          statusCode: 400,
          message: 'Remark must be a string',
        };
      }

      const remark = body.remark.trim();

      if (!remark) {
        return {
          statusCode: 400,
          message: 'Remark cannot be empty',
        };
      }

      if (remark.length > 1000) {
        return {
          statusCode: 400,
          message: 'Remark cannot exceed 1000 characters',
        };
      }

      const domain = await this.smsService.getCurrentDomain(req);

      if (!domain) {
        return {
          statusCode: 400,
          message: 'Unable to determine tenant domain',
        };
      }

      const lead = await this.tenantPrisma.client.leads.findUnique({
        where: {
          leadID: Number(leadId),
        },
        select: {
          leadID: true,
          status: true,
        },
      });

      if (!lead) {
        return {
          statusCode: 404,
          message: 'Lead not found',
        };
      }

      const restrictedStatuses = [
        'Disbursal_Sheet_Send',
        'Disbursed',
        'Closed',
        'Part_Payment',
      ];

      if (restrictedStatuses.includes(lead.status)) {
        return {
          statusCode: 400,
          message: `Credit remark cannot be added when lead status is ${lead.status}`,
        };
      }

      const userData = await this.clsService.get('user');

      if (!userData) {
        return {
          statusCode: 401,
          message: 'Unauthorized',
        };
      }

      const userRole = await this.authService.getUserById(userData);





      if (!userRole) {
        return {
          statusCode: 401,
          message: 'User not found',
        };
      }

      const allowedRoles = [
        'Credit Team',
        'Credit Head',
        'Admin',
        'Super Admin',
      ];

      const currentRole =
        userRole?.role ||
        userRole?.roleName ||
        userRole?.userRole;


      console.log(currentRole, "currentRole");

      if (!allowedRoles.includes(currentRole)) {
        return {
          statusCode: 403,
          message: 'You are not authorized to add credit remarks',
        };
      }


      const userID =
        typeof userData === 'object'
          ? userData.userID || userData.id || userData
          : userData;

      const numericUserId = Number(userID);

      if (!Number.isSafeInteger(numericUserId) || numericUserId <= 0) {
        return {
          statusCode: 401,
          message: 'Invalid logged-in user',
        };
      }

      const creditRemark = await this.tenantPrisma.client.credit_remarks.create({
        data: {
          leadID: Number(leadId),
          userID: numericUserId,
          remark,
        },
      });

      return {
        statusCode: 200,
        message: 'Credit remark added successfully',
        data: creditRemark,
      };
    } catch (err: any) {
      console.error('Error in addCreditRemarks:', err);
      return { statusCode: 500, message: "Error in create credit Remarks" };
    }
  }
}
