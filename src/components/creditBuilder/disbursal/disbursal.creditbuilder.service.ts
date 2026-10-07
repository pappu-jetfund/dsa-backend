import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  convertBigIntToString,
  isTerminalStatus,
  mapStatus,
  normalize,
  normalizeData,
} from '../../../utility/helper';
import { TenantPrismaService } from '../../../prisma/tenet-prisma.service';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../../auth/auth.service';
import { randomUUID } from 'crypto';
import { MailService } from '../../mail/mail.service';
import { SmsService } from '../../sms/sms.service';
import { PayoutService } from '../../payout/payout.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CacheService } from '../../cache/cache.service';
import { CibilService } from '../../cibil/cibil.service';
import {
  HeadRoles,
  PayoutStatus,
  READ_ONLY_ROLES,
} from '../../../utility/enums';
import axios from 'axios';
import { creditpenalConfig } from '../../../common/config/penal.config';
import { GlobalService } from '../../../common/globalFunctions/global.service';

@Injectable()
export class DisbursalCreditImprovedService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private configService: ConfigService,
    private readonly clsService: ClsService,
    private readonly authService: AuthService,
    private readonly MailService: MailService,
    private readonly smsService: SmsService,
    private readonly payoutService: PayoutService,
    @InjectQueue('icici-status')
    private readonly statusQueue: Queue,
    private readonly cacheService: CacheService,
    private readonly CibilService: CibilService,
    private readonly globalService: GlobalService,

  ) { }

  async getDisbursalSheetSend({
    page,
    limit,
    search,
    filters,
  }: {
    page: number;
    limit: number;
    search: string;
    filters: any;
  }) {
    try {
      const skip = (page - 1) * limit;

      const where: any = {
        status: 'Disbursal_Sheet_Send',
      };

      const [leads, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.credit_improve_leads.findMany({
          where: where,
          skip,
          take: limit,
          orderBy: {
            createdDate: 'desc',
          },

          include: {
            customer: {
              select: {
                ID: true,
                customerID: true,
                name: true,
                mobile: true,
                email: true,
                pancard: true,
              },
            },

            creditApprovals: {
              orderBy: {
                approvalID: 'desc',
              },
              take: 1,
              select: {
                approvalID: true,
                loanAmtApproved: true,
                adminFee: true,
                tenure: true,
                repayDate: true,
                status: true,
              },
            },

            creditImproveLoan: true,
          },
        }),

        this.tenantPrisma.client.credit_improve_leads.count({ where }),
      ]);

      return normalize({
        success: true,
        message: 'Credit Builder Disbursal sheet data fetched successfully',
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data: leads,
      });
    } catch (error: any) {
      console.error('getDisbursalSheetSend Error:', error);

      throw new HttpException(
        error?.message || 'Failed to fetch disbursal sheet data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getDisbursedLeads({
    page,
    limit,
    filters,
    search,
  }: {
    page: number;
    limit: number;
    search?: string;
    filters: {
      fromDate?: string;
      toDate?: string;
    };
  }) {
    try {
      const skip = (page - 1) * limit;

      const role = this.clsService.get('role');

      console.log(role, 'role');

      if (![...Object.values(HeadRoles), ...READ_ONLY_ROLES].includes(role)) {
        throw new HttpException(
          {
            success: false,
            message: 'You are not allowed to perform this action',
          },
          HttpStatus.FORBIDDEN,
        );
      }

      const where: any = {
        status: 'Disbursed',
      };

      // Filter by disbursal date
      if (filters.fromDate || filters.toDate) {
        where.creditImproveLoan = {
          is: {
            disbursalDate: {
              ...(filters.fromDate && {
                gte: filters.fromDate,
              }),
              ...(filters.toDate && {
                lte: filters.toDate,
              }),
            },
          },
        };
      }

      // Search by mobile number
      if (search?.trim()) {
        const mobile = search.trim();

        where.customer = {
          mobile,
        };
      }

      const [leads, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.credit_improve_leads.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            createdDate: 'desc',
          },
          include: {
            customer: {
              select: {
                ID: true,
                customerID: true,
                name: true,
                mobile: true,
                email: true,
              },
            },

            creditApprovals: {
              orderBy: {
                approvalID: 'desc',
              },
              take: 1,
            },

            creditImproveLoan: true,
          },
        }),

        this.tenantPrisma.client.credit_improve_leads.count({
          where,
        }),
      ]);

      return normalize({
        success: true,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data: leads,
      });
    } catch (err: any) {
      console.error('getDisbursedLeads Error:', err);

      if (err instanceof HttpException) {
        throw err;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: 500,
          message: 'Failed to fetch disbursed leads',
          error: err?.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getDisbursalPayout({
    page,
    limit,
    filters,
    search,
    status,
  }: {
    page: number;
    limit: number;
    filters: {
      fromDate?: string;
      toDate?: string;
    };
    search?: string;
    status?: PayoutStatus;
  }) {
    try {
      const skip = (page - 1) * limit;

      const where: any = {
        status,
        credit_leads: {
          status: 'Disbursal_Sheet_Send',
        },
      };

      // Payout Status Filter
      if (status) {
        where.status = status;
      }

      // Date Filter
      if (filters.fromDate || filters.toDate) {
        where.createdAt = {
          ...(filters.fromDate && {
            gte: new Date(`${filters.fromDate}T00:00:00.000Z`),
          }),
          ...(filters.toDate && {
            lte: new Date(`${filters.toDate}T23:59:59.999Z`),
          }),
        };
      }

      // Mobile Search
      if (search?.trim()) {
        where.credit_leads = {
          is: {
            customer: {
              mobile: search.trim(),
            },
          },
        };
      }

      const [payouts, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.credit_improve_payout.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            credit_leads: {
              include: {
                customer: {
                  select: {
                    ID: true,
                    customerID: true,
                    name: true,
                    mobile: true,
                    email: true,
                    document: true,
                  },
                },

                creditApprovals: {
                  orderBy: {
                    approvalID: 'desc',
                  },
                  take: 1,
                },

                creditImproveLoan: true,
              },
            },

            statusHistory: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 5,
            },
          },
        }),

        this.tenantPrisma.client.credit_improve_payout.count({
          where,
        }),
      ]);

      const data = payouts.map((payout) => {
        const lead = payout.credit_leads;
        const approval = lead.creditApprovals?.[0];
        const loan = lead.creditImproveLoan;

        return {
          payoutId: payout.id,
          leadId: payout.leadId,

          payoutStatus: payout.status,
          payoutAmount: Number(payout.amount),

          razorpayPayoutId: payout.razorpayPayoutId,
          fundAccountId: payout.fundAccountId,

          narration: payout.narration,
          referenceId: payout.referenceId,
          failureReason: payout.failureReason,

          performedBy: payout.performed_by,

          createdAt: payout.createdAt,
          updatedAt: payout.updatedAt,

          customer: lead.customer
            ? {
                id: lead.customer.ID,
                customerID: lead.customer.customerID,
                name: lead.customer.name,
                mobile: lead.customer.mobile,
                email: lead.customer.email,
              }
            : null,

          lead: {
            leadID: lead.leadID,
            purpose: lead.purpose,
            status: lead.status,
            loanRequired: lead.loanRequeried,
            createdDate: lead.createdDate,
          },

          approval: approval
            ? {
                approvalID: approval.approvalID,
                approvedAmount: approval.loanAmtApproved,
                adminFee: approval.adminFee,
                gst: approval.GstOfAdminFee,
                roi: approval.roi,
                tenure: approval.tenure,
                repayDate: approval.repayDate,
                status: approval.status,
              }
            : null,

          loan: loan
            ? {
                loanID: loan.id,
                loanNo: loan.loanNo,
                status: loan.status,
                disbursalAmount: loan.disbursalAmount,

                accountNo: loan.accountNo,
                accountType: loan.accountType,
                bank: loan.bank,
                bankIfsc: loan.bankIfsc,
                bankBranch: loan.bankBranch,

                pdDate: loan.pdDate,
                disbursalDate: loan.disbursalDate,
              }
            : null,

          statusHistory: payout.statusHistory,
        };
      });

      return normalize({
        success: true,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
      });
    } catch (err: any) {
      console.error('getDisbursalPayout Error:', err);

      throw new HttpException(
        {
          success: false,
          statusCode: 500,
          message: 'Failed to fetch payout data',
          error: err.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // async approveCreditBuilderDisbursalPayout(leadID: number, req: Request) {
  //   try {
  //     const userId = this.clsService.get('user');

  //     const lead =
  //       await this.tenantPrisma.client.credit_improve_leads.findUnique({
  //         where: {
  //           leadID,
  //         },
  //       });

  //     if (!lead) {
  //       throw new HttpException('Lead not found', HttpStatus.NOT_FOUND);
  //     }

  //     if (lead.status !== 'Disbursal_Sheet_Send') {
  //       throw new HttpException(
  //         `Lead already ${lead.status}`,
  //         HttpStatus.BAD_REQUEST,
  //       );
  //     }

  //     const loan = await this.tenantPrisma.client.credit_improve_loan.findFirst(
  //       {
  //         where: {
  //           leadID,
  //         },
  //       },
  //     );

  //     if (!loan) {
  //       throw new HttpException('Loan not found', HttpStatus.NOT_FOUND);
  //     }

  //     // ----------------------
  //     // Razorpay Payout Logic
  //     // ----------------------

  //     // const payoutResponse = await axios.post(...)

  //     await this.tenantPrisma.client.$transaction(async (tx) => {
  //       await tx.credit_improve_loan.update({
  //         where: {
  //           id: loan.id,
  //         },
  //         data: {
  //           status: 'Disbursed',
  //           disbursalDate: new Date().toISOString().split('T')[0],
  //         },
  //       });

  //       await tx.credit_improve_leads.update({
  //         where: {
  //           leadID,
  //         },
  //         data: {
  //           status: 'Disbursed',
  //         },
  //       });
  //     });

  //     return {
  //       success: true,
  //       message: 'Loan disbursed successfully',
  //     };
  //   } catch (error: any) {
  //     console.error('approveDisbursalPayout Error:', error);

  //     throw new HttpException(
  //       {
  //         success: false,
  //         message: error?.message || 'Failed to approve disbursal',
  //       },
  //       error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }

  async approveCreditBuilderDisbursalPayout(id: number, req: Request) {
    try {
      const userData = await this.clsService.get('user');

      const payoutApproval = await this.tenantPrisma.client.$transaction(
        async (tx) => {
          const payout = await tx.credit_improve_payout.findUnique({
            where: { id },
            include: {
              credit_leads: {
                select: {
                  leadID: true,
                  customerID: true,
                },
              },
            },
          });

          if (!payout) {
            return normalize({
              success: false,
              message: 'Disbursal Payout not found',
            });
          }

          if (payout.status !== 'APPROVAL_PENDING') {
            return normalize({
              success: false,
              message: `Disbursal Payout is already ${payout.status}`,
            });
          }

          const domain = (
            await this.smsService.getCurrentDomain(req)
          )?.toLowerCase();

          const idempotencyKey = randomUUID();

          const payload = {
            account_number: process.env.RAZORPAY_ACCOUNT_NUMBER,
            fund_account_id: payout.fundAccountId,
            amount: Number(payout.amount),
            currency: 'INR',
            mode: 'IMPS',
            purpose: 'payout',
            queue_if_low_balance: true,
            reference_id: `DISB_${payout.id}`,
            narration: 'Loan Disbursal',
            notes: {
              payoutId: payout.id.toString(),
              loanId: payout.leadId,
              leadId: payout.leadId,
            },
          };

          const auth = Buffer.from(
            `${process.env.RAZORPAY_PAYOUT_KEY_ID}:${process.env.RAZORPAY_PAYOUT_KEY_SECRET}`,
          ).toString('base64');

          const response = await axios.post(
            `${process.env.RAZORPAY_PAYOUTS_URL}`,
            payload,
            {
              headers: {
                'Content-Type': 'application/json',
                'X-Payout-Idempotency': idempotencyKey,
                Authorization: `Basic ${auth}`,
              },
            },
          );

          await tx.payout.update({
            where: { id },
            data: {
              status: 'APPROVED',
              razorpayPayoutId: response.data.id,
              response: response.data,
              payload: payload,
              performed_by: userData,
              updatedAt: new Date(),
            },
          });

          await tx.credit_improve_PayoutStatusHistory.create({
            data: {
              payoutId: id,
              oldStatus: payout.status,
              newStatus: 'APPROVED',
              performed_by: userData,
            },
          });

          return normalize({
            success: true,
            message: 'Disbursal payout approved successfully',
            data: response.data,
          });
        },
      );
      return payoutApproval;
    } catch (error: any) {
      console.error('Razorpay payout error:', error?.response?.data || error);

      throw new HttpException(
        {
          success: false,
          statusCode: 500,
          message: 'Failed to approve disbursal payout',
          error: error?.response?.data || error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateCreditBuilderDisbursal(
    leadId: number,
    body: {
      disbursalRefrenceNo: string;
      disbursalDate: string;
      remarks: string;
    },
  ) {
    try {
      const userData = Number(this.clsService.get('user'));

      const lead =
        await this.tenantPrisma.client.credit_improve_leads.findUnique({
          where: {
            leadID: Number(leadId),
          },
          include: {
            customer: true,
            creditImproveLoan: true,
            creditApprovals: true,
          },
        });

      if (!lead) {
        throw new HttpException(
          {
            success: false,
            message: 'Lead not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const loan = lead.creditImproveLoan;

      if (!loan) {
        throw new HttpException(
          {
            success: false,
            message: 'Loan not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      if (loan.status === 'Disbursed') {
        throw new HttpException(
          {
            success: false,
            message: 'Loan already disbursed',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!body.disbursalRefrenceNo || !body.disbursalDate || !body.remarks) {
        throw new HttpException(
          {
            success: false,
            message:
              'disbursalRefrenceNo, disbursalDate and remarks are required',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.tenantPrisma.client.$transaction(async (tx) => {
        await tx.credit_improve_loan.update({
          where: {
            id: loan.id,
          },
          data: {
            disbursalRefrenceNo: body.disbursalRefrenceNo,
            disbursalDate: body.disbursalDate,
            remarks: body.remarks,
            status: 'Disbursed',
            disbursedBy: userData,
            disbursalTime: new Date(),
          },
        });

        await tx.credit_improve_leads.update({
          where: {
            leadID: lead.leadID,
          },
          data: {
            status: 'Disbursed',
          },
        });
      });

      // Send Disbursal Letter

      const approval = lead.creditApprovals?.[0];

      if (approval && lead.customer?.email) {
        const interestAmount =
          (Number(approval.loanAmtApproved) *
            Number(approval.roi) *
            Number(approval.tenure || 0)) /
          100;

        const repayment =
          Number(approval.loanAmtApproved) + Math.round(interestAmount);

        const mailData = {
          SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
          name: lead.customer.name,
          loanNo: loan.loanNo,
          disbursalAmount: approval.loanAmtApproved,
          roi: approval.roi,
          tenure: approval.tenure,
          repayment,
          COMPANY_NAME: process.env.COMPANY_NAME,
          SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
        };

        const emailRes = await this.MailService.sendCustomMail(
          lead.customer.email,
          `Disbursal Letter ${process.env.COMPANY_NAME}`,
          'credit',
          'disbursalLetter.hbs',
          mailData,
        );

        console.log(emailRes, 'line no 564');

        // if (emailRes?.status) {
        //   await this.tenantPrisma.client.notifications.create({
        //     data: {
        //       customerID: Number(lead.customerID),
        //       leadID: Number(lead.leadID),
        //       sender_email: emailRes.sender_email,
        //       notification: emailRes.html,
        //       type: 'Email',
        //       subject: 'Disbursal Letter',
        //       senderUser: userData,
        //       createdDate: new Date(),
        //       mtype: 'crm',
        //     } as any,
        //   });
        // }
      }

      return {
        success: true,
        statusCode: 200,
        message: 'Credit Builder loan disbursed successfully',
      };
    } catch (error: any) {
      console.error('updateCreditBuilderDisbursal Error:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          message:
            error?.message || 'Failed to update Credit Builder disbursal',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async disbursalPayoutStatus(id: number, status: PayoutStatus) {
    try {
      const userId = Number(this.clsService.get('user'));

      const payout =
        await this.tenantPrisma.client.credit_improve_payout.findUnique({
          where: { id },
        });

      if (!payout) {
        throw new HttpException(
          {
            success: false,
            message: 'Credit Improve payout not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      if (
        status !== PayoutStatus.HOLD &&
        status !== PayoutStatus.APPROVAL_PENDING
      ) {
        throw new HttpException(
          {
            success: false,
            message: 'Invalid payout status',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.tenantPrisma.client.$transaction(async (tx) => {
        await tx.credit_improve_PayoutStatusHistory.create({
          data: {
            payoutId: id,
            oldStatus: payout.status,
            newStatus: status,
            performed_by: userId,
          },
        });

        await tx.credit_improve_payout.update({
          where: {
            id,
          },
          data: {
            status,
          },
        });
      });

      return normalize({
        success: true,
        message: 'Credit Improve payout status updated successfully',
      });
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message:
            error?.response?.message ||
            error?.message ||
            'Failed to update payout status',
        },
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async handlePayoutWebhook(body: any) {
    try {
      const eventType = body.event;
      const payoutData = body.payload?.payout?.entity;

      if (!payoutData) {
        return {
          success: false,
          message: 'Invalid webhook payload',
        };
      }

      const mappedStatus = mapStatus(payoutData.status);

      const existing =
        await this.tenantPrisma.client.credit_improve_payout.findUnique({
          where: {
            razorpayPayoutId: payoutData.id,
          },
        });

      if (!existing) {
        return {
          success: false,
          message: 'Payout not found',
        };
      }

      const lead =
        await this.tenantPrisma.client.credit_improve_leads.findUnique({
          where: {
            leadID: existing.leadId,
          },
          include: {
            customer: true,
            creditImproveLoan: true,
            creditApprovals: true,
          },
        });

      if (!lead) {
        return {
          success: false,
          message: 'Lead not found',
        };
      }

      const payoutResult = await this.tenantPrisma.client.$transaction(
        async (tx) => {
          if (existing.status === mappedStatus) {
            return {
              success: false,
              message: 'Duplicate webhook received',
            };
          }

          await tx.credit_improve_payout.update({
            where: {
              id: existing.id,
            },
            data: {
              status: mappedStatus,
              response: payoutData,
              isTerminal: isTerminalStatus(mappedStatus),
              updatedAt: new Date(),
            },
          });

          const systemUserId = await this.globalService.getSystemUserId();

          await tx.credit_improve_PayoutStatusHistory.create({
            data: {
              payoutId: existing.id,
              oldStatus: existing.status,
              newStatus: mappedStatus,
              performed_by: systemUserId,
            },
          });

          if (mappedStatus === PayoutStatus.PROCESSED) {
            await tx.credit_improve_loan.update({
              where: {
                leadID: existing.leadId,
              },
              data: {
                disbursalRefrenceNo: payoutData.utr || '',
                disbursalDate: new Date().toISOString().split('T')[0],
                remarks: payoutData.narration || 'Payout Processed',
                status: 'Disbursed',
                disbursedBy: Number(existing.performed_by) || 155,
                disbursalTime: new Date(),
              },
            });

            await tx.credit_improve_leads.update({
              where: {
                leadID: existing.leadId,
              },
              data: {
                status: 'Disbursed',
              },
            });
          }

          return {
            success: true,
            message: 'Webhook processed successfully',
          };
        },
      );

      if (payoutResult.success && mappedStatus === PayoutStatus.PROCESSED) {
        const approval = lead.creditApprovals?.[0];

        const emailRes = await this.MailService.sendCustomMail(
          lead.customer?.email || '',
          `Disbursal Letter ${process.env.COMPANY_NAME}`,
          'credit',
          'creditBuilderDisbursalLetter.hbs',
          {
            name: lead.customer?.name,
            loanNo: lead.creditImproveLoan?.loanNo,
            disbursalAmount: approval?.loanAmtApproved,
            repayDate: approval?.repayDate,
            COMPANY_NAME: process.env.COMPANY_NAME,
          },
        );

        if (emailRes?.status) {
          console.log(emailRes, 'line no 1017');
        }
      }

      return {
        success: true,
        message: 'Webhook handled successfully',
      };
    } catch (error: any) {
      console.error('handlePayoutWebhook Error:', error);

      throw new HttpException(
        {
          success: false,
          statusCode: 500,
          message: 'Failed to handle payout webhook',
          error: error?.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getCreditBuilderLoanCalculation(leadID: string, req: Request) {
    try {
      if (!leadID) {
        return {
          success: false,
          statusCode: 400,
          massage: 'leadID is Missing',
        };
      }

      const lead =
        await this.tenantPrisma.client.credit_improve_leads.findFirst({
          where: {
            leadID: Number(leadID),
            status: {
              in: [
                'Disbursed',
                'Part_Payment',
                'Settlement',
                'Closed',
                'Disbursal_Sheet_Send',
              ],
            },
          },
          select: {
            leadID: true,
            status: true,
            creditApprovals: true,
            creditImproveLoan: {
              select: {
                loanNo: true,
                disbursalAmount: true,
                deduction: true,
                accountNo: true,
                bankIfsc: true,
                bank: true,
                status: true,
                disbursalRefrenceNo: true,
                disbursalDate: true,
              },
            },
            creditImproveCollections: {
              where: {
                collectionStatus: 'Approved',
              },
            },
          },
        });

      if (!lead) {
        return {
          success: false,
          statusCode: 200,
          massage: 'Loan not found!',
        };
      }

      if (lead.status == 'Disbursal_Sheet_Send') {
        return {
          success: true,
          statusCode: 200,
          data: {
            loan: lead.creditImproveLoan,
            status: lead.status,
          },
        };
      }

      if (!lead.creditImproveLoan?.disbursalDate) {
        return {
          success: false,
          statusCode: 200,
          massage: 'Pending for disbursment!',
        };
      }

      if (!lead.creditApprovals?.[0]?.repayDate) {
        return {
          success: false,
          statusCode: 200,
          massage: 'Pending for Approval!',
        };
      }

      const approval = lead.creditApprovals[0];
      const approvedCollections = lead.creditImproveCollections || [];
      const loanAmtApproved = approval.loanAmtApproved;
      console.log(approval, lead, 'line no 1115');
      const totalPaid = approvedCollections.reduce(
        (sum, c: any) => sum + Number(c.collectedAmount || 0),
        0,
      );

      const totaldiscount = approvedCollections.reduce(
        (sum, c: any) => sum + Number(c.discountAmount || 0),
        0,
      );

      let interestStopDate: Date;

      if (lead.status === 'Settlement' || lead.status === 'Closed') {
        const closingCollection = approvedCollections.find(
          (c: any) => c.status === 'Settlement' || c.status === 'Closed',
        );

        interestStopDate = closingCollection?.collectedDate
          ? new Date(closingCollection.collectedDate)
          : new Date(approval.repayDate);
      } else {
        // Disbursed / Part payment
        interestStopDate = new Date();
      }

      interestStopDate.setHours(0, 0, 0, 0);

      const disbursalDate = new Date(lead.creditImproveLoan.disbursalDate);
      const repayDate = new Date(approval.repayDate);

      disbursalDate.setHours(0, 0, 0, 0);
      repayDate.setHours(0, 0, 0, 0);

      const domain = await this.smsService.getCurrentDomain(req);
      const config =
        creditpenalConfig[domain] || creditpenalConfig['localhost'];

      const dailyRate = Number(approval.roi) / 100;
      const overdueRate = parseFloat(config.interest.replace('%', '')) / 100;
      const bounceCharge = config.charges;

      let totalDays = 0;
      let dueDays = 0;
      let overdueDays = 0;
      const disbursalDayCount = config.disbursalDayCount;

      if (interestStopDate <= repayDate) {
        totalDays =
          Math.ceil(
            (interestStopDate.getTime() - disbursalDate.getTime()) /
              (1000 * 60 * 60 * 24),
          ) + disbursalDayCount;
        dueDays =
          Math.ceil(
            (repayDate.getTime() - disbursalDate.getTime()) /
              (1000 * 60 * 60 * 24),
          ) + 1;
      } else {
        dueDays =
          Math.ceil(
            (repayDate.getTime() - disbursalDate.getTime()) /
              (1000 * 60 * 60 * 24),
          ) + 1;

        overdueDays = Math.ceil(
          (interestStopDate.getTime() - repayDate.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        totalDays = dueDays + overdueDays;
      }

      let TotalInterest = 0;
      let overdueInterest = 0;
      console.log(overdueDays, overdueInterest, overdueRate);
      if (overdueDays > 0) {
        const normalInterest = loanAmtApproved * dailyRate * dueDays;

        overdueInterest = loanAmtApproved * overdueRate * overdueDays;

        TotalInterest = normalInterest + overdueInterest + bounceCharge;
      } else {
        TotalInterest = loanAmtApproved * dailyRate * totalDays;
      }

      TotalInterest = Math.round(TotalInterest * 100) / 100;

      const dailyLedger: any[] = [];
      let runningInterest = 0;
      let bounceAdded = false;

      const cursorDate = new Date(disbursalDate);

      while (cursorDate <= interestStopDate) {
        let interestForDay = 0;
        let type = 'NORMAL';

        if (cursorDate <= repayDate) {
          // Normal interest period
          interestForDay = loanAmtApproved * dailyRate;
        } else {
          // Overdue period
          interestForDay = loanAmtApproved * overdueRate;
          type = 'OVERDUE';

          // Add bounce charge only once (first overdue day)
          if (!bounceAdded) {
            dailyLedger.push({
              date: new Date(cursorDate),
              type: 'BOUNCE',
              amount: bounceCharge,
              note: 'Bounce charge applied on first overdue day',
            });
            runningInterest += bounceCharge;
            bounceAdded = true;
          }
        }

        runningInterest += interestForDay;

        dailyLedger.push({
          date: new Date(cursorDate),
          type,
          amount: Math.round(interestForDay * 100) / 100,
          runningInterest: Math.round(runningInterest * 100) / 100,
        });

        cursorDate.setDate(cursorDate.getDate() + 1);
      }

      const actualTenure =
        Math.ceil(
          (repayDate.getTime() - disbursalDate.getTime()) /
            (1000 * 60 * 60 * 24),
        ) + disbursalDayCount;

      const tenureWiseRepayInterest =
        loanAmtApproved * dailyRate * actualTenure;

      const tenureWiseRepayAmount = loanAmtApproved + tenureWiseRepayInterest;

      const outstanding =
        lead.status === 'Settlement' || lead.status === 'Closed'
          ? 0
          : Math.round(loanAmtApproved + TotalInterest - totalPaid);

      return {
        success: true,
        statusCode: 200,
        data: {
          loan: lead.creditImproveLoan,
          status: lead.status,
          loanAmount: Math.round(lead.creditImproveLoan.disbursalAmount),

          tenureWiseRepayAmount: Math.round(tenureWiseRepayAmount),
          tenureWiseRepayInterest: Math.round(tenureWiseRepayInterest),

          TotalInterest: Math.round(TotalInterest),
          overdueInterest: Math.round(overdueInterest),

          totalPaid: Math.round(totalPaid),
          outstanding: Math.round(outstanding),

          totaldiscount: Math.round(totaldiscount),

          roi: approval.roi,
          tenure: actualTenure,

          dueDays,
          overdueDays,
          totalDays,

          repayDate,
          disbursalDate,
          interestCalculatedTill: interestStopDate,

          dailyLedger,
        },
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        massage: 'Something went wrong',
      };
    }
  }
}
