import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../auth/auth.service';
import e from 'express';
import { normalize } from '../../utility/helper';
import { SmsService } from '../sms/sms.service';
import { penalConfig } from '../../common/config/penal.config';
import Razorpay from 'razorpay';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';

@Injectable()
export class EmandateChargeService {
  private razorpay: Razorpay;
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly smsService: SmsService,
    private readonly clsService: ClsService,
    private configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    this.razorpay = new Razorpay({
      key_id: this.configService.get<string>('RAZORPAY_KEY_ID', 'test'),
      key_secret: this.configService.get<string>('RAZORPAY_KEY_SECRET', 'test'),
    });
  }

  async getEmandateChagreList({
    page,
    limit,
    filters,
    search,
    req,
  }: {
    page: number;
    limit: number;
    search?: string;
    filters: {
      fromDate?: string;
      toDate?: string;
    };
    req: Request;
  }) {
    try {
      const skip = (page - 1) * limit;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      /** ---------------------------------------
       * GET LEAD IDS FROM EMANDATE TABLE
       * --------------------------------------*/
      const emandateLeads = await this.tenantPrisma.client.emandates.findMany({
        where: {
          token_id: {
            not: null,
          },
        },
        select: {
          leadID: true,
        },
      });

      const leadIds = emandateLeads
        .map((e) => Number(e.leadID))
        .filter((id) => !isNaN(id));

      if (leadIds.length === 0) {
        return normalize({
          data: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
          sucess: true,
        });
      }

      /** ---------------------------------------
       * APPROVAL WHERE CONDITION
       * --------------------------------------*/
      const approvalWhere: any = {
        leadID: {
          in: leadIds,
        },
        repayDate: {
          lt: today,
        },
        lead: {
          status: {
            in: ['Disbursed', 'Part_Payment'],
          },
        },
      };

      /** ---------------------------------------
       * DATE FILTER
       * --------------------------------------*/
      if (filters?.fromDate && filters?.toDate) {
        const from = new Date(filters.fromDate);
        from.setHours(0, 0, 0, 0);

        const to = new Date(filters.toDate);
        to.setHours(0, 0, 0, 0);

        approvalWhere.repayDate = {
          gte: from,
          lte: to,
        };
      }

      /** ---------------------------------------
       * SEARCH FILTER
       * --------------------------------------*/
      if (search?.trim()) {
        const searchTerm = search.trim();
        const isNumber = !isNaN(Number(searchTerm));

        const orConditions: any[] = [
          {
            loan: {
              loanNo: {
                contains: searchTerm,
              },
            },
          },
          {
            customer: {
              name: {
                contains: searchTerm,
              },
            },
          },
        ];

        if (isNumber) {
          orConditions.push({
            customer: {
              mobile: Number(searchTerm),
            },
          });
        }

        approvalWhere.lead.OR = orConditions;
      }

      /** ---------------------------------------
       * GET APPROVALS
       * --------------------------------------*/
      const approvals = await this.tenantPrisma.client.approval.findMany({
        where: approvalWhere,
        orderBy: {
          repayDate: 'desc',
        },
        skip,
        take: limit,

        select: {
          repayDate: true,
          roi: true,
          loanAmtApproved: true,
          tenure: true,

          lead: {
            select: {
              leadID: true,
              status: true,

              loan: {
                select: {
                  loanNo: true,
                  disbursalDate: true,
                  disbursalAmount: true,
                },
              },

              customer: {
                select: {
                  name: true,
                  mobile: true,
                },
              },

              collections: {
                where: {
                  collectionStatus: 'Approved',
                },
                select: {
                  collectedAmount: true,
                },
              },
            },
          },
        },
      });

      const domain = await this.smsService.getCurrentDomain(req);
      const MS_PER_DAY = 86400000;

      const parseLocalDate = (date: string | Date | null | undefined) => {
        if (!date) return new Date();

        if (date instanceof Date) {
          return new Date(date.getFullYear(), date.getMonth(), date.getDate());
        }

        const [y, m, d] = date.split('-').map(Number);
        return new Date(y, m - 1, d);
      };

      /** ---------------------------------------
       * CALCULATE DATA
       * --------------------------------------*/
      const data = approvals.map((row) => {
        const repayDate = parseLocalDate(row.repayDate);
        const disbursalDate = parseLocalDate(row.lead.loan?.disbursalDate);

        const config = penalConfig[domain] || penalConfig['localhost'];

        const dailyRate = Number(row.roi) / 100;
        const overdueRate = parseFloat(config.interest.replace('%', '')) / 100;
        const bounceCharge = config.charges;

        const dueDays =
          Math.floor(
            (repayDate.getTime() - disbursalDate.getTime()) / MS_PER_DAY,
          ) + 1;

        let overdueDays = Math.floor(
          (today.getTime() - repayDate.getTime()) / MS_PER_DAY,
        );

        overdueDays = Math.max(overdueDays, 0);

        const totalDays = dueDays + overdueDays;

        let TotalInterest = 0;
        let overdueInterest = 0;

        if (overdueDays > 0 && row.lead.loan) {
          const normalInterest =
            row.lead.loan.disbursalAmount * dailyRate * dueDays;

          overdueInterest =
            row.lead.loan.disbursalAmount * overdueRate * overdueDays;

          TotalInterest = normalInterest + overdueInterest + bounceCharge;
        } else if (row.lead.loan) {
          TotalInterest = row.lead.loan.disbursalAmount * dailyRate * totalDays;
        }

        TotalInterest = Math.round(TotalInterest * 100) / 100;

        const totalCollectedAmount =
          row.lead.collections.reduce(
            (sum, c) => sum + (c.collectedAmount || 0),
            0,
          ) || 0;

        const outstanding = Math.round(
          (row.lead.loan?.disbursalAmount || 0) +
          TotalInterest -
          totalCollectedAmount,
        );

        return {
          leadID: row.lead.leadID,
          loanNo: row.lead.loan?.loanNo,
          customerName: row.lead.customer?.name,
          mobileNo: row.lead.customer?.mobile,
          status: row.lead.status,
          repayDate: repayDate.toISOString().split('T')[0],
          overdueDays,
          roi: row.roi,
          loanAmtApproved: row.loanAmtApproved,
          tenure: row.tenure,
          totalCollectedAmount,
          outstanding,
        };
      });

      /** ---------------------------------------
       * TOTAL COUNT
       * --------------------------------------*/
      const total = await this.tenantPrisma.client.approval.count({
        where: approvalWhere,
      });

      return normalize({
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        sucess: true,
      });
    } catch (err) {
      console.error(err);

      return {
        sucess: false,
      };
    }
  }

  async chargeEmandate(req, body: { leadID: string; amount: number }[]) {
    try {
      const success: any[] = [];
      const errors: any[] = [];

      for (const item of body) {
        const { leadID, amount } = item;

        try {
          const [customer, emandate] = await Promise.all([
            this.tenantPrisma.client.leads.findUnique({
              where: { leadID: Number(leadID) },
              include: {
                customer: {
                  select: {
                    name: true,
                    email: true,
                    mobile: true,
                    razorpay_cust_id: true,
                  },
                },
              },
            }),

            this.tenantPrisma.client.emandates.findFirst({
              where: { leadID: leadID.toString() },
              select: { id: true, token_id: true },
            }),
          ]);

          if (!customer) {
            errors.push({ leadID, error: 'Customer not found' });
            continue;
          }

          if (!emandate) {
            errors.push({
              leadID,
              error: 'Emandate not found for this customer',
            });
            continue;
          }

          const lastCharge =
            await this.tenantPrisma.client.emandate_charge.findFirst({
              where: { emandate_id: emandate.id },
              orderBy: { created_at: 'desc' },
            });

          if (lastCharge) {
            const now = new Date();
            const createdAt = lastCharge.created_at
              ? new Date(lastCharge.created_at)
              : new Date(0);

            const hoursDiff =
              (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

            if (lastCharge.razorpay_payment_id && hoursDiff < 48) {
              errors.push({
                leadID,
                error:
                  'Last payment attempt still pending confirmation. Retry after 24-48 hours.',
                nextRetryAllowedAt: new Date(
                  createdAt.getTime() + 48 * 60 * 60 * 1000,
                ).toISOString(),
              });
              continue;
            }
          }

          /** CREATE ORDER */
          const order = await this.razorpay.orders.create({
            amount: Number(amount) * 100,
            currency: 'INR',
            payment_capture: true,
            receipt: `rcpt_${Date.now()}_${leadID}-${customer.customerID}`,
            notes: {
              purpose: `Emandate charge for ${leadID}-${customer.customerID}-${customer?.customer?.name}`,
            },
          });

          /** SAVE ORDER */
          const chargeOrder =
            await this.tenantPrisma.client.emandate_charge.create({
              data: {
                amount: order.amount,
                order_id: order.id,
                emandate_id: emandate.id,
              },
            });

          try {
            /** CREATE RECURRING PAYMENT */
            const recurringPayment =
              await this.razorpay.payments.createRecurringPayment({
                email: customer?.customer?.email ?? '',
                contact: `${customer?.customer?.mobile}`,
                amount: order.amount,
                currency: order.currency,
                order_id: order.id,
                customer_id: customer?.customer?.razorpay_cust_id ?? '',
                token: emandate.token_id ?? '',
                recurring: '1',
                description: `Auto-charge for ${customer?.customer?.name} (${customer?.customerID}/${leadID})`,
                notes: {
                  purpose: `Emandate charge for ${leadID}-${customer?.customerID}-${customer?.customer?.name}`,
                },
              });

            const updatedCharge =
              await this.tenantPrisma.client.emandate_charge.update({
                where: { id: chargeOrder.id },
                data: {
                  razorpay_payment_id:
                    recurringPayment.razorpay_payment_id ?? null,
                  response: recurringPayment,
                },
              });

            success.push({
              leadID,
              amount,
              message: 'Payment initiated successfully',
              orderId: order.id,
              payment: updatedCharge,
            });
          } catch (paymentError: any) {
            console.error('Recurring payment failed:', paymentError);

            await this.tenantPrisma.client.emandate_charge.update({
              where: { id: chargeOrder.id },
              data: { response: paymentError },
            });

            const nextRetry = new Date(Date.now() + 72 * 60 * 60 * 1000);

            errors.push({
              leadID,
              error:
                paymentError?.error?.description ?? 'Recurring payment failed',
              retryEligibleFrom: nextRetry.toISOString(),
            });
          }
        } catch (err) {
          errors.push({
            leadID,
            error: 'Internal processing error',
          });
        }
      }

      /** FINAL RESPONSE AFTER LOOP */
      return {
        successCount: success.length,
        failedCount: errors.length,
        success,
        errors,
        statusCode: 200,
      };
    } catch (err) {


      return {
        success: false,
        message: 'Something went wrong',
      };
    }
  }
}
