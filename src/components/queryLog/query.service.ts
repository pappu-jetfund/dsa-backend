import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../auth/auth.service';
import { normalize } from '../../utility/helper';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';
import { leads_status } from '@prisma/client';
import { SmsService } from '../sms/sms.service';
import { EMANDATE_CONFIG } from '../../common/config/mandate.config';
import { RolesTypes } from '../../utility/enums';

@Injectable()
export class QueryService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private configService: ConfigService,
    private readonly clsService: ClsService,
    private readonly authService: AuthService,
    private readonly smsService: SmsService,
  ) { }

  //   async getAllData({
  //     page,
  //     limit,
  //     filters,
  //     search,
  //   }: {
  //     page: number;
  //     limit: number;
  //     search?: string;
  //     filters: { fromDate?: string; toDate?: string };
  //   }) {
  //     try {
  //       const prisma = this.tenantPrisma.client;

  //       const offset = (page - 1) * limit;

  //       let whereClause = `WHERE l.status IN ('Approved', 'Disbursal Sheet Send')`;

  //       if (search) {
  //         whereClause += ` AND c.mobile LIKE '%${search}%'`;
  //       }

  //       if (filters?.fromDate && filters?.toDate) {
  //         whereClause += ` AND DATE(l.createdDate) BETWEEN '${filters.fromDate}' AND '${filters.toDate}'`;
  //       }

  //       const query = `
  //       SELECT 
  //   l.leadID, 
  //   MAX(l.status) AS status, 
  //   MAX(l.createdDate) AS createdDate, 
  //   MAX(c.name) AS customer_name, 
  //   MAX(c.email) AS email, 
  //   MAX(c.mobile) AS mobile, 
  //   MAX(c.pancard) AS pancard, 
  //   MAX(c.customerID) AS customerID, 
  //   MAX(u.name) AS assigned_user_name, 
  //   MAX(v.leadID) AS kyc_done, 
  //   MAX(e.isSigned) AS eagreement_done, 
  //   MAX(em.payment_id) AS payment_id, 
  //   MAX(em.token_id) AS token_id, 
  //   COUNT(ref.customerID) AS reference_count,
  //   MAX(n_sanction.otp) AS sanction_status
  // FROM leads l
  // INNER JOIN customer c ON l.customerID = c.customerID
  // LEFT JOIN users u ON l.callAssign = u.userID
  // LEFT JOIN videokyc v ON l.leadID = v.leadID
  // LEFT JOIN eagreement e ON l.leadID = e.leadID
  // LEFT JOIN notifications n_sanction 
  //   ON l.leadID = n_sanction.leadID 
  //   AND n_sanction.subject = 'Loan Sanction Letter speedoloan' 
  //   AND n_sanction.otp = 'concern_verify'
  // LEFT JOIN reference ref ON c.customerID = ref.customerID
  // LEFT JOIN emandates em ON l.leadID = em.leadID
  // ${whereClause}
  // GROUP BY l.leadID
  // ORDER BY createdDate DESC
  // LIMIT ${limit} OFFSET ${offset};
  //     `;

  //       const result: any = await prisma.$queryRawUnsafe(query);

  //       const countQuery = `
  //       SELECT COUNT(*) AS total 
  //       FROM leads l 
  //       INNER JOIN customer c ON l.customerID = c.customerID
  //       ${whereClause};
  //     `;
  //       const totalData: any = await prisma.$queryRawUnsafe(countQuery);
  //       const total = totalData[0]?.total || 0;

  //       const totalNumber = Number(total);

  //       return normalize({
  //         statusCode: 200,
  //         message: 'Data fetched successfully',
  //         data: result,
  //         pagination: {
  //           total: totalNumber,
  //           page,
  //           limit,
  //           totalPages: Math.ceil(totalNumber / limit),
  //         },
  //       });
  //     } catch (err: any) {
  //       return {
  //         statusCode: 500,
  //         message: err.message || 'Failed to fetch Query Data',
  //       };
  //     }
  //   }


  async getAllData({
    page,
    limit,
    filters,
    search,
    req
  }: {
    page: number;
    limit: number;
    search?: string;
    req: Request
    filters: {
      fromDate?: string;
      toDate?: string;
    };
  }) {
    try {
      const prisma = this.tenantPrisma.client;

      const skip = (page - 1) * limit;

      const where: any = {
        status: {
          in: [
            leads_status.Approved,
            leads_status.Disbursal_Sheet_Send,
          ],
        },
      };

      if (process.env.CLIENT_ENV === 'jetfund') {
        const role = this.clsService.get('role');

        const isHead = [RolesTypes.CALLING_HEAD, RolesTypes.ADMIN, RolesTypes.SUPER_ADMIN, RolesTypes.IT_TEAM].includes(role);
        if (!isHead) {
          if (role === RolesTypes.CALLING_TEAM) {
            const userId = this.clsService.get('user');
            where.callAssign = Number(userId);
          } else {
            return {
              statusCode: 200,
              message: "You are not authorized to access this data",
              data: [],
            }
          }
        }
      }

      if (search) {
        where.OR = [
          {
            customer: {
              name: {
                contains: search,
              },
            },
          },
          {
            customer: {
              pancard: {
                contains: search,
              },
            },
          },
          {
            customer: {
              mobile: BigInt(search),
            },
          },
          {
            leadID: Number(search) || 0,
          },
        ];
      }

      if (filters?.fromDate && filters?.toDate) {
        where.approvals = {
          some: {
            updatedAt: {
              gte: new Date(filters.fromDate),
              lte: new Date(filters.toDate + "T23:59:59"),
            },
          },
        };
      }

      const [leads, total] = await prisma.$transaction([
        prisma.leads.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            updatedAt: "desc",
          },
          include: {
            customer: {
              include: {
                accounts: true,

                reference: {
                  where: {
                    is_verified: true,
                  },
                  select: {
                    referenceID: true,
                  },
                },
              },
            },
            approvals: {
              orderBy: {
                updatedAt: "desc",
              },
              take: 1,
            },
            eagreement: {
              select: {
                isSigned: true,
                status: true,
              },
            },
            credforge_bre_log: {
              orderBy: {
                createdAt: "desc",
              },
              take: 1,
              select: {
                responsePayload: true,
              },
            },
          },

        }),
        prisma.leads.count({
          where,
        }),
      ]);

      const domain = await this.smsService.getCurrentDomain(req);

      const config = EMANDATE_CONFIG[domain] || {
        enable: false,
        provider: 'none',
      };

      const leadIds = leads.map((l) => l.leadID);

      let emandateMap = new Map<number, any>();

      if (config.enable) {
        if (config.provider === 'razorpay') {
          const emandates = await prisma.emandates.findMany({
            where: {
              leadID: {
                in: leadIds.map(String),
              },
            },
            select: {
              leadID: true,
              payment_id: true,
            },
          });

          emandateMap = new Map(
            emandates.map((e) => [Number(e.leadID), e]),
          );
        }

        if (config.provider === 'easeBuzz') {
          const easebuzzEmandates = await prisma.easebuzz_emandates.findMany({
            where: {
              leadID: {
                in: leadIds,
              },
            },
            select: {
              leadID: true,
              status: true,
              sub_status: true,
            },
          });

          emandateMap = new Map(
            easebuzzEmandates.map((e) => [Number(e.leadID), e]),
          );
        }
      }

      const data = leads.map((lead) => {
        const emandate = emandateMap.get(lead.leadID);

        let emandateDone = false;

        if (config.enable) {
          if (config.provider === 'razorpay') {
            emandateDone = !!emandate?.payment_id;
          } else if (config.provider === 'easeBuzz') {
            const easebuzzStatus = emandate?.status?.toLowerCase();
            const easebuzzSubStatus = emandate?.sub_status?.toLowerCase();

            emandateDone =
              easebuzzStatus === 'authorized' ||
              (easebuzzStatus === 'initiated' &&
                easebuzzSubStatus === 'accepted');
          }
        }

        const response =
          lead.credforge_bre_log?.[0]?.responsePayload as any;

        const riskGrade =
          response?.output_data?.features?.output_features?.bureau
            ?.cbs_risk_grade ??
          response?.output_data?.features?.bureau?.cbs_risk_grade;

        return {
          leadID: lead.leadID,
          customer_name: lead.customer?.name,
          email: lead.customer?.email,
          mobile: lead.customer?.mobile?.toString(),
          pancard: lead.customer?.pancard,
          status: lead.status,
          approval_date:
            lead.approvals.length > 0
              ? lead.approvals[0].updatedAt
              : null,
          case_type: lead.fbLeads,
          cbs_risk_grade: riskGrade,
          banking_done: (lead.customer?.accounts?.length ?? 0) > 0,
          esign_done:
            lead.eagreement?.isSigned === true &&
            lead.eagreement?.status === 'Signed Successfully',
          emandate_done: emandateDone,
          reference_count: lead.customer?.reference?.length ?? 0,
        };
      });

      return normalize({
        statusCode: 200,
        message: "Data fetched successfully",
        data,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err: any) {
      console.log(err, "err");

      return {
        statusCode: 500,
        message: err.message,
      };
    }
  }
}
