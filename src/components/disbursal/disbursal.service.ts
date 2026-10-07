import {
  HttpException,
  HttpStatus,
  Injectable,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../auth/auth.service';
import {
  convertBigIntToString,
  formatDateYYYYMMDD,
  isTerminalStatus,
  mapStatus,
  normalize,
  normalizeData,
} from '../../utility/helper';
import {
  disbursalPayoutStatus,
  HeadRoles,
  PayoutGenerateStatus,
  PayoutStatus,
  READ_ONLY_ROLES,
} from '../../utility/enums';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import * as ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';
import axios from 'axios';

import { DISBURSAL_DOMAIN_CONFIG } from '../../common/config/disbursalDomainConfig';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';
import { retry } from 'rxjs';
import { PayoutService } from '../payout/payout.service';
import { acquireLock, releaseLock } from '../../utility/queue.lock';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { iciciPayoutStatus } from '@prisma/client';
import { CacheService } from '../cache/cache.service';
import { CibilService } from '../cibil/cibil.service';
import { CacheKey } from '../cache/cache.keys';
import { EMANDATE_CONFIG } from '../../common/config/mandate.config';
import {
  handleFormatA,
  handleFormatB,
  handleFormatC,
  handleFormatD,
} from '../../common/config/disbursalExcel.config';
import { GlobalService } from '../../common/globalFunctions/global.service';

interface DisbursalExcelRow {
  rowNumber: number;
  loanNo: string;
  leadId: number | null;
  disbursalRefrenceNo: string;
  disbursalDate: string;
  remarks: string;
}

interface ValidationError {
  row: number;
  loanNo?: string;
  field?: string;
  message: string;
}

@Injectable()
export class DisbursalService {
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

  //   async getDisbursalData(date?: string, month?: string, year?: string) {
  //     try {
  //       // 🔹 Current Date
  //       const today = new Date();
  //       const currentYear = today.getFullYear();
  //       const currentMonth = today.getMonth(); // 0-indexed
  //       const currentDay = today.getDate();

  //       // 🔹 Convert filter date (dd-mm-yyyy) to ISO Date
  //       const parseDate = (dateString: string) => {
  //         const [day, month, year] = dateString.split('-');
  //         return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  //       };

  //       // ✅ Daily Range (00:00 to 23:59)
  //       const startOfToday = date
  //         ? parseDate(date)
  //         : new Date(currentYear, currentMonth, currentDay, 0, 0, 0);
  //       const endOfToday = date
  //         ? new Date(startOfToday.getTime() + 86400000 - 1)
  //         : new Date(currentYear, currentMonth, currentDay, 23, 59, 59);

  //       // ✅ Monthly Range
  //       const startOfMonth =
  //         month && year
  //           ? new Date(Number(year), Number(month) - 1, 1)
  //           : new Date(currentYear, currentMonth, 1);

  //       const startOfNextMonth =
  //         month && year
  //           ? new Date(Number(year), Number(month), 1)
  //           : new Date(currentYear, currentMonth + 1, 1);

  //       /* ✅ DAILY TOTAL (All statuses - Disbursed + Pending) */
  //       const dailyTotal = await this.tenantPrisma.client.loan.aggregate({
  //         _sum: {
  //           disbursalAmount: true,
  //           deduction: true,
  //         },
  //         _count: { _all: true },
  //         where: {
  //           OR: [
  //             {
  //               disbursalDate: {
  //                 gte: startOfToday.toISOString(),
  //                 lte: endOfToday.toISOString(),
  //               },
  //             },
  //             {
  //               disbursalDate: null,
  //               createdDate: { gte: startOfToday, lte: endOfToday },
  //             },
  //           ],
  //         },
  //       });

  //       /* ✅ MONTHLY TOTAL (All statuses) */
  //       const monthlyTotal = await this.tenantPrisma.client.loan.aggregate({
  //         _sum: {
  //           disbursalAmount: true,
  //           deduction: true,
  //         },
  //         _count: { _all: true },
  //         where: {
  //           OR: [
  //             {
  //               disbursalDate: {
  //                 gte: startOfMonth.toISOString(),
  //                 lt: startOfNextMonth.toISOString(),
  //               },
  //             },
  //             {
  //               disbursalDate: null,
  //               createdDate: { gte: startOfMonth, lt: startOfNextMonth },
  //             },
  //           ],
  //         },
  //       });

  //       /* ✅ DISBURSED ONLY (Sum disbursed amount where status = 'Disbursed') */
  //       const disbursed = await this.tenantPrisma.client.loan.aggregate({
  //         _sum: {
  //           disbursalAmount: true,
  //           deduction: true,
  //         },
  //         _count: { _all: true },
  //         where: {
  //           status: 'Disbursed',
  //           disbursalDate: { not: null },
  //         },
  //       });

  //       /* ✅ PENDING ONLY (Sum of amounts with no disbursal yet) */
  //       const pending = await this.tenantPrisma.client.loan.aggregate({
  //         _sum: {
  //           disbursalAmount: true,
  //           deduction: true,
  //         },
  //         _count: { _all: true },
  //         where: {
  //           disbursalDate: null,
  //         },
  //       });

  //       return {
  //         success: true,
  //         message: 'Disbursal data fetched successfully',
  //         data: {
  //           dailyTotal,
  //           monthlyTotal,
  //           pending,
  //         },
  //       };
  //     } catch (error) {
  //       return {
  //         success: false,
  //         statusCode: 500,
  //         message: 'Failed to fetch disbursal data',
  //         error: error.message,
  //       };
  //     }
  //   }
  async getDisbursalData(date?: string, month?: string, year?: string) {
    try {
      let baseDate: Date;

      if (date) {
        const [day, mon, yr] = date.split('-');
        baseDate = new Date(`${yr}-${mon}-${day}T00:00:00`);
      } else {
        baseDate = new Date();
      }

      const istDate = new Date(baseDate.getTime());

      const istStart = new Date(istDate);
      istStart.setHours(0, 0, 0, 0);

      const istEnd = new Date(istDate);
      istEnd.setHours(23, 59, 59, 999);

      const currentMonth = Number(month) || new Date().getMonth() + 1;
      const currentYear = Number(year) || new Date().getFullYear();

      const dailyTotal: any = await this.tenantPrisma.client.$queryRaw`
      SELECT 
        DATE_FORMAT(STR_TO_DATE(createdDate, '%Y-%m-%d'), '%d-%m-%Y') AS disbursal_day,
        COALESCE(SUM(disbursalAmount), 0) AS total_disbursal_amount,
        COALESCE(SUM(deduction), 0) AS total_deduction,
        COUNT(*) AS total_count
      FROM loan
        WHERE createdDate >= ${istStart}
      AND createdDate <= ${istEnd}
    `;

      const dailyDisbursed: any = await this.tenantPrisma.client.$queryRaw`
      SELECT 
        COALESCE(SUM(disbursalAmount), 0) AS total_disbursal_amount,
        COALESCE(SUM(deduction), 0) AS total_deduction,
        COUNT(*) AS disbursed_count
      FROM loan
      WHERE disbursalDate >= ${istStart}
      AND disbursalDate <= ${istEnd}
      AND status = 'Disbursed';
    `;

      const dailyPending: any = await this.tenantPrisma.client.$queryRaw`
        SELECT
          COUNT(*) AS pending_count,
          COALESCE(SUM(disbursalAmount), 0) AS pending_amount,
          COALESCE(SUM(deduction), 0) AS pending_deduction
        FROM loan
        WHERE createdDate >= ${istStart}
      AND createdDate <= ${istEnd}
        AND status != 'Disbursed';
      `;

      const monthlyTotal: any = await this.tenantPrisma.client.$queryRaw`
      SELECT 
        DATE_FORMAT(createdDate, '%m-%Y') AS month_year,
        COALESCE(SUM(disbursalAmount), 0) AS total_disbursal_amount,
        COALESCE(SUM(deduction), 0) AS total_deduction,
        COUNT(*) AS total_count
      FROM loan
      WHERE YEAR(createdDate) = ${currentYear}
      AND MONTH(createdDate) = ${currentMonth};
    `;

      const monthlyDisbursed: any = await this.tenantPrisma.client.$queryRaw`
      SELECT 
        COALESCE(SUM(disbursalAmount), 0) AS total_disbursal_amount,
        COALESCE(SUM(deduction), 0) AS total_deduction,
        COUNT(*) AS disbursed_count
      FROM loan
      WHERE YEAR(disbursalDate) = ${currentYear}
      AND MONTH(disbursalDate) = ${currentMonth}
      AND status = 'Disbursed';
    `;

      const monthlyPending: any = await this.tenantPrisma.client.$queryRaw`
        SELECT
          COUNT(*) AS pending_count,
          COALESCE(SUM(disbursalAmount), 0) AS pending_amount,
          COALESCE(SUM(deduction), 0) AS pending_deduction
        FROM loan
        WHERE YEAR(createdDate) = ${currentYear}
        AND MONTH(createdDate) = ${currentMonth}
        AND status != 'Disbursed';
      `;

      const newCaseDailyDisbursed: any = await this.tenantPrisma.client
        .$queryRaw`
  SELECT 
    COUNT(LO.loanID) AS total_loans,
    COALESCE(SUM(LO.disbursalAmount), 0) AS total_disbursed_amount,
    COALESCE(SUM(LO.deduction), 0) AS total_deduction
  FROM leads LE
  INNER JOIN loan LO ON LE.leadID = LO.leadID
  WHERE (LE.fbLeads = 'New Case' OR LE.fbLeads IS NULL)
  AND LO.disbursalDate >= ${istStart}
    AND LO.disbursalDate <= ${istEnd}
`;

      const newCaseMonthlyDisbursed: any = await this.tenantPrisma.client
        .$queryRaw`
  SELECT 
    COUNT(LO.loanID) AS total_loans,
    COALESCE(SUM(LO.disbursalAmount), 0) AS total_disbursed_amount,
    COALESCE(SUM(LO.deduction), 0) AS total_deduction
  FROM leads LE
  INNER JOIN loan LO ON LE.leadID = LO.leadID
  WHERE (LE.fbLeads = 'New Case' OR LE.fbLeads IS NULL)
  AND YEAR(LO.disbursalDate) = ${currentYear}
  AND MONTH(LO.disbursalDate) = ${currentMonth}
`;

      const newCaseDailyPending: any = await this.tenantPrisma.client.$queryRaw`
  SELECT 
    COUNT(LO.loanID) AS total_loans,
    COALESCE(SUM(LO.disbursalAmount), 0) AS total_pending_amount,
    COALESCE(SUM(LO.deduction), 0) AS total_pending_deduction
  FROM leads LE
  INNER JOIN loan LO ON LE.leadID = LO.leadID
  WHERE (LE.fbLeads = 'New Case' OR LE.fbLeads IS NULL)
  AND LO.disbursalDate >= ${istStart}
    AND LO.disbursalDate <= ${istEnd}
  AND LO.status != 'Disbursed'
`;

      const newCaseMonthlyPending: any = await this.tenantPrisma.client
        .$queryRaw`
  SELECT 
    COUNT(LO.loanID) AS total_loans,
    COALESCE(SUM(LO.disbursalAmount), 0) AS total_pending_amount,
    COALESCE(SUM(LO.deduction), 0) AS total_pending_deduction
  FROM leads LE
  INNER JOIN loan LO ON LE.leadID = LO.leadID
  WHERE (LE.fbLeads = 'New Case' OR LE.fbLeads IS NULL)
  AND YEAR(LO.createdDate) = ${currentYear}
  AND MONTH(LO.createdDate) = ${currentMonth}
  AND LO.status != 'Disbursed'
`;

      const repeatCaseDailyDisbursed: any = await this.tenantPrisma.client
        .$queryRaw`
  SELECT 
    COUNT(LO.loanID) AS total_loans,
    COALESCE(SUM(LO.disbursalAmount), 0) AS total_disbursed_amount,
    COALESCE(SUM(LO.deduction), 0) AS total_deduction
  FROM loan LO
  INNER JOIN leads LE ON LO.leadID = LE.leadID
  WHERE LE.fbLeads = 'Repeat Case'
   AND LO.disbursalDate >= ${istStart}
    AND LO.disbursalDate <= ${istEnd}
`;

      const repeatCaseMonthlyDisbursed: any = await this.tenantPrisma.client
        .$queryRaw`
  SELECT 
    COUNT(LO.loanID) AS total_loans,
    COALESCE(SUM(LO.disbursalAmount), 0) AS total_disbursed_amount,
    COALESCE(SUM(LO.deduction), 0) AS total_deduction
  FROM loan LO
  INNER JOIN leads LE ON LO.leadID = LE.leadID
  WHERE LE.fbLeads = 'Repeat Case'
  AND YEAR(LO.disbursalDate) = ${currentYear}
  AND MONTH(LO.disbursalDate) = ${currentMonth}
`;

      const repeatCaseDailyPending: any = await this.tenantPrisma.client
        .$queryRaw`
  SELECT 
    COUNT(LO.loanID) AS total_loans,
    COALESCE(SUM(LO.disbursalAmount), 0) AS total_pending_amount,
    COALESCE(SUM(LO.deduction), 0) AS total_pending_deduction
  FROM loan LO
  INNER JOIN leads LE ON LO.leadID = LE.leadID
  WHERE LE.fbLeads = 'Repeat Case'
   AND LO.disbursalDate >= ${istStart}
    AND LO.disbursalDate <= ${istEnd}
  AND LO.status != 'Disbursed'
`;

      const repeatCaseMonthlyPending: any = await this.tenantPrisma.client
        .$queryRaw`
  SELECT 
    COUNT(LO.loanID) AS total_loans,
    COALESCE(SUM(LO.disbursalAmount), 0) AS total_pending_amount,
    COALESCE(SUM(LO.deduction), 0) AS total_pending_deduction
  FROM loan LO
  INNER JOIN leads LE ON LO.leadID = LE.leadID
  WHERE LE.fbLeads = 'Repeat Case'
  AND YEAR(LO.createdDate) = ${currentYear}
  AND MONTH(LO.createdDate) = ${currentMonth}
  AND LO.status != 'Disbursed'
`;

      const dailyLeadCount: any = await this.tenantPrisma.client.$queryRaw`
  SELECT 
    COUNT(*) AS total_leads
  FROM leads
   WHERE createdDate >= ${istStart}
      AND createdDate <= ${istEnd}
`;

      const monthlyLeadCount: any = await this.tenantPrisma.client.$queryRaw`
  SELECT 
    COUNT(*) AS total_leads
  FROM leads
  WHERE YEAR(createdDate) = ${currentYear}
  AND MONTH(createdDate) = ${currentMonth}
`;

      const dailyCollection: any = await this.tenantPrisma.client.$queryRaw`
  SELECT 
    COALESCE(SUM(collectedAmount), 0) AS total_collected_amount,
    COUNT(*) AS total_collections
  FROM collection
      WHERE collectedDate >= ${istStart}
      AND collectedDate <= ${istEnd}
  AND collectionStatus = 'approved'
`;

      const dailyClosedCollection: any = await this.tenantPrisma.client
        .$queryRaw`
  SELECT 
    COUNT(*) AS closed_count,
    COALESCE(SUM(collectedAmount), 0) AS closed_collected_amount
  FROM collection
      WHERE collectedDate >= ${istStart}
      AND collectedDate <= ${istEnd}
  AND collectionStatus = 'approved'
`;

      const monthlyCollection: any = await this.tenantPrisma.client.$queryRaw`
  SELECT 
    COALESCE(SUM(collectedAmount), 0) AS total_collected_amount,
    COUNT(*) AS total_collections
  FROM collection
  WHERE YEAR(collectedDate) = ${currentYear}
  AND MONTH(collectedDate) = ${currentMonth}
  AND collectionStatus = 'approved'
`;

      const monthlyClosedCollection: any = await this.tenantPrisma.client
        .$queryRaw`
  SELECT 
    COUNT(*) AS closed_count,
    COALESCE(SUM(collectedAmount), 0) AS closed_collected_amount
  FROM collection
  WHERE YEAR(collectedDate) = ${currentYear}
  AND MONTH(collectedDate) = ${currentMonth}
  AND collectionStatus = 'approved'
`;

      return normalize({
        success: true,
        statusCode: 200,
        message: 'Disbursal data fetched successfully.',
        data: {
          daily: {
            total: dailyTotal[0] || null,
            disbursed: dailyDisbursed[0] || {
              disbursed_count: 0,
              total_disbursal_amount: 0,
              total_deduction: 0,
            },
            pending: dailyPending[0] || {
              pending_count: 0,
              pending_amount: 0,
              pending_deduction: 0,
            },
          },
          monthly: {
            total: monthlyTotal[0] || null,
            disbursed: monthlyDisbursed[0] || {
              disbursed_count: 0,
              total_disbursal_amount: 0,
              total_deduction: 0,
            },
            pending: monthlyPending[0] || {
              pending_count: 0,
              pending_amount: 0,
              pending_deduction: 0,
            },
          },
          caseWise: {
            newCase: {
              daily: {
                disbursed: newCaseDailyDisbursed[0] || {
                  total_loans: 0,
                  total_disbursed_amount: 0,
                  total_deduction: 0,
                },
                pending: newCaseDailyPending[0] || {
                  total_loans: 0,
                  total_pending_amount: 0,
                  total_pending_deduction: 0,
                },
              },
              monthly: {
                disbursed: newCaseMonthlyDisbursed[0] || {
                  total_loans: 0,
                  total_disbursed_amount: 0,
                  total_deduction: 0,
                },
                pending: newCaseMonthlyPending[0] || {
                  total_loans: 0,
                  total_pending_amount: 0,
                  total_pending_deduction: 0,
                },
              },
            },

            repeatCase: {
              daily: {
                disbursed: repeatCaseDailyDisbursed[0] || {
                  total_loans: 0,
                  total_disbursed_amount: 0,
                  total_deduction: 0,
                },
                pending: repeatCaseDailyPending[0] || {
                  total_loans: 0,
                  total_pending_amount: 0,
                  total_pending_deduction: 0,
                },
              },
              monthly: {
                disbursed: repeatCaseMonthlyDisbursed[0] || {
                  total_loans: 0,
                  total_disbursed_amount: 0,
                  total_deduction: 0,
                },
                pending: repeatCaseMonthlyPending[0] || {
                  total_loans: 0,
                  total_pending_amount: 0,
                  total_pending_deduction: 0,
                },
              },
            },
          },
          leadCount: {
            daily: dailyLeadCount[0] || { total_leads: 0 },
            monthly: monthlyLeadCount[0] || { total_leads: 0 },
          },
          collection: {
            daily: {
              total: dailyCollection[0] || {
                total_collected_amount: 0,
                total_collections: 0,
              },
              closed: dailyClosedCollection[0] || {
                closed_count: 0,
                closed_collected_amount: 0,
              },
            },
            monthly: {
              total: monthlyCollection[0] || {
                total_collected_amount: 0,
                total_collections: 0,
              },
              closed: monthlyClosedCollection[0] || {
                closed_count: 0,
                closed_collected_amount: 0,
              },
            },
          },
        },
      });
    } catch (err: any) {
      console.error(err);
      throw new HttpException(
        {
          success: false,
          statusCode: 500,
          message: 'Failed to fetch disbursal data',
          error: err.message,
        },
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
        status: 'Disbursed',
      };

      // const userRole = await this.authService.getUserById(userData);

      const role = this.clsService.get('role');

      if (![...Object.values(HeadRoles), ...READ_ONLY_ROLES].includes(role)) {
        return {
          statusCode: 403,
          message: 'You are not allowed to perform this action',
        };
      }

      if (filters.fromDate || filters.toDate) {
        where.loan = {
          is: {
            ...(filters.fromDate && {
              disbursalDate: {
                ...(filters.toDate && {
                  lte: filters.toDate,
                }),
                gte: filters.fromDate,
              },
            }),
          },
        };
      }

      // safer merge version
      if (filters.fromDate || filters.toDate) {
        where.loan = {
          is: {
            disbursalDate: {
              ...(filters.fromDate && { gte: filters.fromDate }),
              ...(filters.toDate && { lte: filters.toDate }),
            },
          },
        };
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
      throw new HttpException(
        {
          success: false,
          statusCode: 500,
          message: 'Failed to fetch disbursal data',
          error: err.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getDisbursalSheetSend({
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
      fbleads?: string;
      allSource?: string;
      fromDate?: string;
      toDate?: string;
    };
    req: Request;
  }) {
    try {
      const skip = (page - 1) * limit;

      const approvalsWhere: any = {};

      const where: any = {
        status: 'Disbursal_Sheet_Send',
        // isAudit: true,
        loan: {
          exported: false,
        },
        approvals: {
          some: approvalsWhere,
        },
      };

      if (filters.fromDate || filters.toDate) {
        if (filters.fromDate) {
          const from = new Date(filters.fromDate + 'T00:00:00.000Z');

          if (!isNaN(from.getTime())) {
            approvalsWhere.createdDate = {
              ...(approvalsWhere.createdDate || {}),
              gte: from,
            };
          }
        }

        if (filters.toDate) {
          const to = new Date(filters.toDate + 'T23:59:59.999Z');

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
        sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
        sevenDaysAgo.setUTCHours(0, 0, 0, 0);

        approvalsWhere.createdDate = {
          gte: sevenDaysAgo,
          lte: todayEnd,
        };
      }

      const domain = (
        await this.smsService.getCurrentDomain(req)
      )?.toLowerCase();

      const allowedDomains =
        process.env.GET_EMANDATE_BYPASS_ALLOWED_DOMAINS?.split(',').map((d) =>
          d.trim().toLowerCase(),
        ) || [];

      console.log(allowedDomains, "allowedDomains");


      /**
       * Apply emandate filter only for domains
       * that are NOT bypassed.
       */
      if (!allowedDomains.includes(domain)) {
        const mandateConfig = EMANDATE_CONFIG[domain] || {
          enable: false,
          provider: 'none',
        };

        console.log(mandateConfig, 'mandateConfig');

        let emandateLeadIds: number[] = [];

        if (mandateConfig.provider === 'razorpay') {
          const emandates = await this.tenantPrisma.client.emandates.findMany({
            where: {
              token_id: {
                not: null,
              },
            },
            select: {
              leadID: true,
            },
          });

          emandateLeadIds = emandates.map((e) => Number(e.leadID));
        } else if (mandateConfig.provider === 'easeBuzz') {
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

          emandateLeadIds = easebuzzEmandates.map((e) => Number(e.leadID));
        }

        const bypassLeads = await this.tenantPrisma.client.leads.findMany({
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

      const [leads, total] = await this.tenantPrisma.client.$transaction([
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
                    accountNo: true,
                    bankIfsc: true,
                    bank: true,
                    bankBranch: true,
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

      const data = leads.map((lead) => {
        const response = lead.credforge_bre_log?.[0]?.responsePayload as any;

        const riskGrade =
          response?.output_data?.features?.output_features?.bureau
            ?.cbs_risk_grade ??
          response?.output_data?.features?.bureau?.cbs_risk_grade;

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
          message: 'Failed to fetch disbursal data',
          error: err.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateDisbursal(leadId: string, body: any, req: Request) {
    try {
      if (!leadId) {
        return {
          statusCode: 400,
          msg: 'leadId is required',
        };
      }
      const lead: any = await this.tenantPrisma.client.leads.findUnique({
        where: { leadID: Number(leadId) },
        include: {
          loan: true,
          approvals: true,
          customer: {
            select: {
              firstName: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // console.log(lead, 'lead');

      if (!lead) {
        return { statusCode: 404, message: 'Lead not found' };
      }

      const domain = (
        await this.smsService.getCurrentDomain(req)
      )?.toLowerCase();

      const allowedDomains =
        process.env.UPDATE_DISBURSAL_ALLOWED_DOMAINS?.split(',').map((d) =>
          d.trim().toLowerCase(),
        ) || [];

      const isAllowedDomain = allowedDomains.includes(domain);

      if (!isAllowedDomain && !lead.emandatebypass) {
        const mandateConfig = EMANDATE_CONFIG[domain] || {
          enable: false,
          provider: 'none',
        };

        let isEmandateDone = false;

        if (mandateConfig.provider === 'razorpay') {
          const emandate = await this.tenantPrisma.client.emandates.findFirst({
            where: {
              leadID: String(leadId),
            },
            select: {
              token_id: true,
            },
          });

          isEmandateDone = !!emandate?.token_id;
        } else if (mandateConfig.provider === 'easeBuzz') {
          const emandate =
            await this.tenantPrisma.client.easebuzz_emandates.findFirst({
              where: {
                leadID: Number(leadId),
              },
              select: {
                status: true,
                sub_status: true,
              },
            });

          isEmandateDone =
            emandate?.status === 'authorized' ||
            (emandate?.status === 'initiated' &&
              emandate?.sub_status === 'accepted');
        }

        if (!isEmandateDone) {
          return {
            success: false,
            statusCode: 500,
            message:
              'Emandate not done, so you cannot punch the reference number.',
          };
        }
      }

      const allowedKeys = ['disbursalRefrenceNo', 'disbursalDate', 'remarks'];

      const updateData: any = {};

      for (const key of allowedKeys) {
        if (body[key] !== undefined) {
          updateData[key] = body[key];
        }
      }

      for (const field of allowedKeys) {
        if (!updateData[field]) {
          return {
            statusCode: 400,
            message: `Missing required field: ${field}`,
          };
        }
      }

      const userData = await this.clsService.get('user');

      // return;

      const created = await this.tenantPrisma.client.$transaction(
        async (tx) => {
          const disbusral = await tx.loan.update({
            where: { id: Number(lead.loan?.id) },
            data: {
              disbursalRefrenceNo: updateData.disbursalRefrenceNo,
              disbursalDate: updateData.disbursalDate,
              remarks: updateData.remarks,
              status: 'Disbursed',
              disbursedBy: Number(userData),
              disbursalTime: new Date(),
            },
          });

          const callHistoryLog = await tx.callhistorylogs.create({
            data: {
              customerID: Number(lead.customerID),
              leadID: Number(leadId),
              callType: 'IVR',
              status: 'Disbursed',
              remark: updateData.remarks || '',
              calledBy: userData,
              noteli: updateData.remarks || '',
            } as any,
          });

          const leadsUpdate = await tx.leads.update({
            where: { leadID: Number(leadId) },
            data: {
              status: 'Disbursed',
            },
          });

          return { success: true };
        },
      );

      // const created = {
      //   success: true,
      // };

      if (created.success === true) {
        const name = lead.customer.name;
        const loanNo = lead.loan.loanNo;
        const interestAmount =
          (Number(lead.approvals[0].loanAmtApproved) *
            Number(lead.approvals[0].roi) *
            (Number(lead.approvals[0].tenure) || 0)) /
          100;
        const disbursalAmount = lead.approvals[0].loanAmtApproved;
        const roi = lead.approvals[0].roi;
        const tenure = lead.approvals[0].tenure;
        const repayment =
          Number(lead.approvals[0].loanAmtApproved) +
          Math.round(interestAmount);

        const mailData = {
          SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
          name: name,
          loanNo: loanNo,
          disbursalAmount: disbursalAmount,
          roi: roi,
          tenure: tenure,
          repayment: repayment,
          COMPANY_NAME: process.env.COMPANY_NAME,
          SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
        };

        const emailRes = await this.MailService.sendCustomMail(
          lead.customer.email,
          `Disbursal Letter ${mailData.COMPANY_NAME}`,
          'credit',
          'disbursalLetter.hbs',
          mailData,
        );

        if (emailRes?.status) {
          await this.tenantPrisma.client.notifications.create({
            data: {
              customerID: Number(lead.customerID),
              leadID: Number(leadId),
              sender_email: emailRes.sender_email,
              notification: emailRes.html,
              type: 'Email',
              subject: 'Disbursal Letter',
              senderUser: Number(userData),
              createdDate: new Date(),
              mtype: 'crm',
            } as any,
          });
          await this.tenantPrisma.client.callhistorylogs.create({
            data: {
              customerID: Number(lead.customerID),
              leadID: Number(leadId),
              callType: 'Mail',
              status: 'DisbursalLetter',
              remark: 'DisbursalLetter',
              calledBy: userData,
              noteli: 'DisbursalLetter',
            } as any,
          });
        }
      }

      return normalize({
        statusCode: 200,
        success: true,
        message: 'Disbursal Reference Update SucessFully',
      });
    } catch (err: any) {
      console.error('Error in Update:', err);
      return {
        statusCode: 500,
        success: false,
        message: 'Error in Update',
      };
    }
  }

  async disbursedExport(req: Request, body: { leads: number[] }) {
    try {
      const { leads } = body;

      if (!leads || !leads.length) {
        return {
          success: false,
          message: 'No leads provided',
        };
      }

      const loans = await this.tenantPrisma.client.loan.findMany({
        where: {
          leadID: {
            in: leads,
          },
        },
        include: {
          lead: {
            include: {
              customer: true,
              approvals: true,
            },
          },
        },
      });

      const domain = (await this.smsService.getCurrentDomain(req))?.split(
        ':',
      )[0];

      const config = DISBURSAL_DOMAIN_CONFIG[domain];

      if (!config) {
        throw new Error('Domain not configured');
      }

      let exportedLoanIds: number[] = [];

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Disbursed Loans');

      const accountIds: any = loans
        .map((loan) => loan.lead?.approvals?.[0]?.disbursalaccountid)
        .filter(Boolean);

      const customerAccounts =
        await this.tenantPrisma.client.customeraccount.findMany({
          where: { accountID: { in: accountIds } },
        });

      const accountMap: any = new Map(
        customerAccounts.map((acc) => [acc.accountID, acc]),
      );

      switch (config.format) {
        case 'FORMAT_A':
          handleFormatA(sheet, loans, accountMap, exportedLoanIds, config);
          break;

        case 'FORMAT_B':
          handleFormatB(sheet, loans, accountMap, exportedLoanIds, config);
          break;

        case 'FORMAT_C':
          handleFormatC(sheet, loans, accountMap, exportedLoanIds, config);
          break;

        case 'FORMAT_D':
          handleFormatD(sheet, loans, accountMap, exportedLoanIds, config);

        default:
          throw new Error('Invalid format');
      }

      // ✅ Generate file
      const buffer = await workbook.xlsx.writeBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      if (exportedLoanIds.length) {
        await this.tenantPrisma.client.loan.updateMany({
          where: {
            loanID: { in: exportedLoanIds },
          },
          data: {
            exported: true,
          },
        });
      }

      return {
        success: true,
        fileName: 'disbursal.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        base64,
      };
    } catch (err: any) {
      console.error('Error in Export:', err);
      return {
        statusCode: 500,
        success: false,
        message: 'Error in Export',
      };
    }
  }

  async getDisbursalSheetExported({
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
      const approvalsWhere: any = {};

      const where: any = {
        status: 'Disbursal_Sheet_Send',
        loan: {
          exported: true,
        },
        approvals: {
          some: approvalsWhere,
        },
      };

      if (filters.fromDate || filters.toDate) {
        if (filters.fromDate) {
          const from = new Date(filters.fromDate + 'T00:00:00.000Z');
          if (!isNaN(from.getTime())) {
            approvalsWhere.createdDate = {
              ...(approvalsWhere.createdDate || {}),
              gte: from,
            };
          }
        }

        if (filters.toDate) {
          const to = new Date(filters.toDate + 'T23:59:59.999Z');
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
        sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
        sevenDaysAgo.setUTCHours(0, 0, 0, 0);

        approvalsWhere.createdDate = {
          gte: sevenDaysAgo,
          lte: todayEnd,
        };
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
                accounts: {
                  select: {
                    accountNo: true,
                    bankIfsc: true,
                    bankBranch: true,
                    bank_holder_name: true,
                    bank: true,
                  },
                },
                reference: true,
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
              },
            },
            loan: {
              select: {
                loanID: true,
                loanNo: true,
                disbursalAmount: true,
                deduction: true,
                status: true,
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
      throw new HttpException(
        {
          success: false,
          statusCode: 500,
          message: 'Failed to fetch disbursal data',
          error: err.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async revrseDisbursedExport(req: Request, body: { leads: number[] }) {
    try {
      const { leads } = body;

      if (!leads || !leads.length) {
        return {
          success: false,
          message: 'No leads provided',
        };
      }

      const loans = await this.tenantPrisma.client.loan.findMany({
        where: {
          leadID: {
            in: leads,
          },
          lead: {
            status: 'Disbursal_Sheet_Send',
          },
        },
        select: {
          loanID: true,
          leadID: true,
          lead: {
            select: {
              status: true,
              leadID: true,
            },
          },
        },
      });

      const loanIds = loans.map((l) => l.loanID);
      let revrseData;
      if (loanIds.length) {
        revrseData = await this.tenantPrisma.client.loan.updateMany({
          where: {
            loanID: { in: loanIds },
          },
          data: {
            exported: false,
          },
        });
      }

      return normalize({ success: true, data: revrseData });
    } catch (err: any) {
      console.error('Error in Export:', err);
      return {
        statusCode: 500,
        success: false,
        message: 'Error in Export',
      };
    }
  }

  async disbursedExcel(
    res: Response,
    { fromDate, toDate }: { fromDate: string; toDate: string },
  ) {
    try {
      const toDateString = (date: string | Date): string => {
        const d = new Date(date);
        return d.toISOString().split('T')[0];
      };

      const dateFilter =
        fromDate && toDate
          ? {
            gte: toDateString(fromDate),
            lte: toDateString(toDate),
          }
          : {
            gte: toDateString(new Date()),
            lte: toDateString(new Date()),
          };

      const disbursedData = await this.tenantPrisma.client.loan.findMany({
        where: {
          status: 'Disbursed',
          disbursalDate: dateFilter,
        },
        include: {
          lead: {
            select: {
              leadID: true,
              customerID: true,
              state: true,
              fbLeads: true,
              utmSource: true,
              callAssignUser: {
                select: {
                  name: true,
                },
              },
              sanctionUser: {
                select: {
                  name: true,
                },
              },
              approvals: {
                select: {
                  loanAmtApproved: true,
                  tenure: true,
                  roi: true,
                  repayDate: true,
                  adminFee: true,
                  officialEmail: true,
                  branch: true,
                  GstOfAdminFee: true,
                },
              },
              customer: {
                select: {
                  name: true,
                  mobile: true,
                  email: true,
                  pancard: true,
                  aadharNo: true,
                  official_email: true,
                },
              },
            },
          },
        },
      });

      const disbursedByIds = [
        ...new Set(
          disbursedData
            .map((loan) => loan.disbursedBy)
            .filter((id) => id !== null && id !== undefined),
        ),
      ];

      const lmsUsers = await this.tenantPrisma.client.lms_users.findMany({
        where: {
          userID: { in: disbursedByIds },
        },
        select: {
          userID: true,
          name: true,
        },
      });

      const userId = await this.clsService.get('user');
      const permission =
        await this.tenantPrisma.client.lms_users_permissions.findUnique({
          where: {
            user_id: Number(userId),
          },
          select: {
            users_permissions: true,
          },
        });
      const canUnmask = Array.isArray(permission?.users_permissions)
        ? permission.users_permissions.some(
          (item: any) =>
            item.key === 'unmask_mobile_email' && item.view === true,
        )
        : false;

      const maskEmail = (email?: string | null) => {
        if (!email) return null;
        return canUnmask
          ? email
          : email.replace(/^(.{2}).*(@.*)$/, '$1******$2');
      };

      const maskMobile = (mobile?: string | number | null) => {
        if (!mobile) return null;

        const value = String(mobile);

        return canUnmask
          ? value
          : value.replace(/(\d{2})\d{6}(\d{2})/, '$1******$2');
      };
      const userMap = new Map<number, string>();
      lmsUsers.forEach((u) => userMap.set(u.userID, u.name));

      let workbook = new ExcelJS.Workbook();
      const sheetName =
        `Disbursed ${dateFilter.gte} to ${dateFilter.lte}`.slice(0, 31);

      const sheet = workbook.addWorksheet(sheetName);

      sheet.columns = [
        { header: 'Loan No.', key: 'loanNo', width: 20 },
        { header: 'LeadID', key: 'leadID', width: 20 },
        { header: 'Branch', key: 'branch', width: 20 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Customer State', key: 'state', width: 20 },
        { header: 'Loan Amount', key: 'loanAmount', width: 20 },
        { header: 'PF Amount', key: 'pfAmount', width: 20 },
        { header: 'PF Percentage', key: 'PFPercentage', width: 20 },
        { header: 'Disbursed Amount', key: 'disbursedAmount', width: 20 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Official Email', key: 'officialEmail', width: 25 },
        { header: 'Mobile', key: 'mobile', width: 20 },
        { header: 'Alt No', key: 'altNo', width: 20 },
        { header: 'Aadhar No', key: 'aadhar', width: 25 },
        { header: 'Pancard', key: 'pancard', width: 20 },
        { header: 'Tenure', key: 'tenure', width: 15 },
        { header: 'ROI', key: 'roi', width: 10 },
        { header: 'Repay Date', key: 'repayDate', width: 20 },
        { header: 'Account No', key: 'accountNo', width: 20 },
        { header: 'Account Type', key: 'accountType', width: 20 },
        { header: 'Bank IFSC', key: 'bankIFSC', width: 20 },
        { header: 'Bank', key: 'bank', width: 20 },
        { header: 'Bank Branch', key: 'bankBranch', width: 20 },
        { header: 'Disbursal Ref No', key: 'DisbursalRefNo', width: 20 },
        { header: 'Disbursal Date', key: 'DisbursalDate', width: 25 },
        { header: 'Disbursed By', key: 'DisbursedBy', width: 25 },
        { header: 'Sales', key: 'Sales', width: 25 },
        { header: 'Credit', key: 'Credit', width: 25 },
        { header: 'Admin Fee', key: 'adminFee', width: 25 },
        { header: 'CGST', key: 'CGST', width: 25 },
        { header: 'SGST', key: 'SGST', width: 25 },
        { header: 'IGST', key: 'IGST', width: 25 },
        { header: 'PD Boy', key: 'PDBoy', width: 25 },
        { header: 'Lead Type', key: 'leadType', width: 25 },
        { header: 'Source', key: 'source', width: 25 },
      ];

      sheet.getRow(1).font = { bold: true };

      const disbdata = normalize(disbursedData);

      disbdata &&
        disbdata.forEach((loan) => {
          const approval = loan.lead?.approvals?.[0];

          const adminFees =
            Number(approval?.adminFee) + Number(approval?.GstOfAdminFee);

          sheet.addRow({
            leadID: loan?.lead?.leadID,
            loanNo: loan?.loanNo,
            branch: approval.branch,
            name: loan?.lead?.customer?.name,
            state: loan?.lead?.state,
            loanAmount: loan?.disbursalAmount,
            pfAmount: adminFees,
            PFPercentage:
              (Number(adminFees) / Number(loan?.disbursalAmount)) * 100,
            disbursedAmount: Math.ceil(loan?.acutalDisbursalAmount),
            email: maskEmail(loan?.lead?.customer?.email),
            officialEmail: maskEmail(loan?.lead?.customer?.official_email),
            mobile: maskMobile(loan?.lead?.customer?.mobile),
            altNo: maskMobile(loan?.lead?.customer?.altNo),
            aadhar: loan?.lead?.customer?.aadharNo,
            pancard: loan?.lead?.customer?.pancard,
            tenure: approval?.tenure,
            roi: `${approval?.roi} ${'%'}`,
            repayDate: approval?.repayDate
              ? new Date(approval.repayDate).toISOString().split('T')[0]
              : null,
            accountNo: loan?.accountNo,
            accountType: loan?.accountType,
            bankIFSC: loan?.bankIfsc,
            bank: loan?.bank,
            bankBranch: loan?.bankBranch,
            DisbursalRefNo: loan?.disbursalRefrenceNo,
            DisbursalDate: loan?.disbursalDate,
            DisbursedBy:
              loan.disbursedBy != null
                ? userMap.get(loan.disbursedBy) || ''
                : '',
            Sales: loan?.lead?.callAssignUser?.name,
            Credit: loan?.lead?.sanctionUser?.name,
            adminFee: approval?.adminFee,
            CGST: 0,
            SGST: 0,
            IGST: approval?.GstOfAdminFee,
            PDBoy: loan?.pdDoneBy,
            leadType: loan?.lead?.fbLeads,
            source: loan?.lead?.utmSource,
          });

          // sheet.addRow({
          //   loanNo: loan.loanNo,
          //   branch: approval.branch || '',
          //   name: loan.lead?.customer?.name || '',
          //   state: loan.lead?.state || '',

          //   loanAmount: loan.disbursalAmount || 0,
          //   adminFee: approval?.adminFee || 0,

          //   netDisbursal:loan.acutalDisbursalAmount,

          //   email: loan.lead?.customer?.email || '',
          //   officialEmail:
          //     approval?.officialEmail ||
          //     loan.lead?.customer?.official_email ||
          //     '',

          //   mobile: Number(loan.lead?.customer?.mobile),
          //   aadhar: Number(loan.lead?.customer?.aadharNo),
          //   pancard: loan.lead?.customer?.pancard || '',

          //   tenure: approval?.tenure || '',
          //   roi: approval?.roi || '',
          //   repayDate: approval?.repayDate || '',

          //   disbursalDate: loan.disbursalDate || '',

          //   disbursedBy:
          //     loan.disbursedBy != null ? userMap.get(loan.disbursedBy) || '' : '',
          // });
        });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      res.setHeader(
        'Content-Disposition',
        'attachment; filename="disbursal.xlsx"',
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

  async getDisbursalPayout({
    page,
    limit,
    filters,
    search,
    status,
    req,
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
    status?: PayoutStatus;
    req: Request;
  }) {
    try {
      const skip = (page - 1) * limit;

      const where: any = {
        status,
        leads: {
          status: 'Disbursal_Sheet_Send',
          // isAudit: true
        },
      };

      if (status == PayoutStatus.PENDING) {
        where.leads = {
          ...where.leads,
          loan: {
            exported: false,
          },
        };
      } else if (status == PayoutStatus.PROCESSED) {
        where.leads.status = 'Disbursed';
      }
      //  else if (status == PayoutStatus.APPROVED) {
      // } else if (status == PayoutStatus.PROCESSING) {
      // }

      if (filters.fromDate || filters.toDate) {
        where.createdAt = {};

        if (filters.fromDate) {
          const from = new Date(filters.fromDate + 'T00:00:00.000Z');
          if (!isNaN(from.getTime())) {
            where.createdAt.gte = from;
          }
        }

        if (filters.toDate) {
          const to = new Date(filters.toDate + 'T23:59:59.999Z');
          if (!isNaN(to.getTime())) {
            where.createdAt.lte = to;
          }
        }
      } else {
        const todayEnd = new Date();
        todayEnd.setUTCHours(23, 59, 59, 999);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
        sevenDaysAgo.setUTCHours(0, 0, 0, 0);

        where.createdAt = {
          gte: sevenDaysAgo,
          lte: todayEnd,
        };
      }

      if (search && search.trim() !== '') {
        const searchNumber = Number(search.trim());
        if (!isNaN(searchNumber)) {
          where.loan = {
            customer: {
              mobile: searchNumber,
            },
          };
        }
      }

      const [disbursal, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.payout.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            amount: true,
            status: true,
            performed_by: true,
            createdAt: true,
            updatedAt: true,
            leadId: true,
            leads: {
              select: {
                leadID: true,
                fbLeads: true,
                utmSource: true,
                status: true,
                emandatebypass: true,

                approvals: {
                  select: {
                    adminFee: true,
                    GstOfAdminFee: true,
                    loanAmtApproved: true,
                    disbursalAccount: {
                      select: {
                        bank_holder_name: true,
                      },
                    },
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

                customer: {
                  select: {
                    name: true,
                    mobile: true,
                    razorpay_contact_id: true,
                    reference: {
                      select: {
                        referenceID: true,
                        name: true,
                        is_verified: true,
                      },
                    },
                  },
                },
                loan: {
                  select: {
                    id: true,
                    disbursalAmount: true,
                    loanNo: true,
                    accountNo: true,
                    accountType: true,
                    bankIfsc: true,
                    bank: true,
                    createdDate: true,
                    exported: true,
                  },
                },
              },
            },
          },
        }),

        this.tenantPrisma.client.payout.count({ where }),
      ]);

      const data = disbursal.map((lead) => {
        const response = lead.leads.credforge_bre_log?.[0]
          ?.responsePayload as any;

        const riskGrade =
          response?.output_data?.features?.bureau?.cbs_risk_grade ??
          response?.output_data?.features?.bureau?.cbs_risk_grade;
        const { credforge_bre_log, ...leads } = lead.leads;
        return {
          ...lead,
          leads,
          cbs_risk_grade: riskGrade,
        };
      });

      const domain = (
        await this.smsService.getCurrentDomain(req)
      )?.toLowerCase();

      const allowedDomains =
        process.env.GET_EMANDATE_BYPASS_ALLOWED_DOMAINS?.split(',').map((d) =>
          d.trim().toLowerCase(),
        ) || [];

      if (allowedDomains.includes(domain)) {
        return convertBigIntToString({
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          data: normalizeData(data),
        });
      }

      const mandateConfig = EMANDATE_CONFIG[domain] || {
        enable: false,
        provider: 'none',
      };

      const leadIds = data.map((d) => d.leadId);

      let emandateMap = new Map<number, any>();

      if (mandateConfig.provider === 'razorpay') {
        const emandates = await this.tenantPrisma.client.emandates.findMany({
          where: {
            leadID: {
              in: leadIds.map(String),
            },
          },
          select: {
            leadID: true,
            token_id: true,
          },
        });

        emandateMap = new Map(emandates.map((e) => [Number(e.leadID), e]));
      } else if (mandateConfig.provider === 'easeBuzz') {
        const easebuzzEmandates =
          await this.tenantPrisma.client.easebuzz_emandates.findMany({
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

      const skipwithEmandate = data.filter((item) => {
        const emandate = emandateMap.get(item.leadId);

        let isEmandateDone = false;

        if (mandateConfig.provider === 'razorpay') {
          isEmandateDone = !!emandate?.token_id;
        } else if (mandateConfig.provider === 'easeBuzz') {
          isEmandateDone =
            emandate?.status === 'authorized' ||
            (emandate?.status === 'initiated' &&
              emandate?.sub_status === 'accepted');
        }

        return (
          (isEmandateDone && !item.leads.loan?.exported) ||
          (item.leads.emandatebypass && !item.leads.loan?.exported)
        );
      });

      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data: normalizeData(skipwithEmandate),
      });

      // return convertBigIntToString({
      //   total,
      //   page,
      //   limit,
      //   totalPages: Math.ceil(total / limit),
      //   data,
      // });
    } catch (err: any) {
      console.error(err);
      throw new HttpException(
        {
          success: false,
          statusCode: 500,
          message: 'Failed to fetch disbursal payout data',
          error: err.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async approveDisbursalPayout(id: number, req: Request) {
    try {
      const userData = await this.clsService.get('user');

      const payoutApproval = await this.tenantPrisma.client.$transaction(
        async (tx) => {
          const payout = await tx.payout.findUnique({
            where: { id },
            include: {
              leads: {
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

          const allowedDomains =
            process.env.UPDATE_DISBURSAL_ALLOWED_DOMAINS?.split(',').map((d) =>
              d.trim().toLowerCase(),
            ) || [];

          const isAllowedDomain = allowedDomains.includes(domain);

          if (!isAllowedDomain) {
            const emandate = await tx.emandates.findFirst({
              where: {
                leadID: String(payout.leadId),
              },
            });
            if (!emandate?.token_id) {
              return normalize({
                success: false,
                message: `Emandate is incompleted,Say customer to do emandate.`,
              });
            }
          }

          const idempotencyKey = randomUUID();

          const payload = {
            account_number: process.env.RAZORPAY_ACCOUNT_NUMBER,
            fund_account_id: payout.fundAccountId,
            amount: Number(payout.amount) * 100,
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
              isTerminal: false,
            },
          });

          await tx.payoutStatusHistory.create({
            data: {
              payoutId: id,
              oldStatus: payout.status,
              newStatus: 'APPROVED',
              performed_by: userData,
            },
          });
          await tx.callhistorylogs.create({
            data: {
              customerID: Number(payout?.leads?.customerID || ''),
              leadID: Number(payout.leadId),
              callType: 'IVR',
              status: 'Dibursal Aprroved',
              remark: 'Clicked for Disbursal Approved',
              calledBy: Number(userData),
              noteli: 'Clicked for Disbursal Approved',
            } as any,
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

  async disbursalPayoutStatus(id, status: PayoutStatus) {
    try {
      const userData = await this.clsService.get('user');

      const payoutApproval = await this.tenantPrisma.client.$transaction(
        async (tx) => {
          const payout = await tx.payout.findUnique({
            where: { id },
          });

          if (!payout) {
            return normalize({
              success: false,
              message: 'Disbursal Payout not found',
            });
          }
          if (status == 'HOLD' || status == 'APPROVAL_PENDING') {
            await tx.payoutStatusHistory.create({
              data: {
                payoutId: id,
                oldStatus: payout.status,
                newStatus: status,
                performed_by: userData,
              },
            });

            await tx.payout.update({
              where: {
                id: id,
              },
              data: {
                status,
              },
            });
            return normalize({
              success: true,
              message: 'Disbursal payout status updated!',
            });
          }
          return normalize({
            success: false,
            message: 'Bad Request!',
          });
        },
      );

      return payoutApproval;
    } catch (error: any) {
      console.error(
        ' payout status update error:',
        error?.response?.data || error,
      );

      throw new HttpException(
        {
          success: false,
          statusCode: 500,
          message: 'Failed to update disbursal payout status',
          error: error?.response?.data || error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async handlePayoutWebhook(body: any) {
    try {
      const eventType = body.event;
      const payoutData = body.payload?.payout?.entity;

      if (!payoutData) return;

      // Save raw webhook for audit
      const mappedStatus = mapStatus(payoutData.status);

      const existing = await this.tenantPrisma.client.payout.findUnique({
        where: { razorpayPayoutId: payoutData.id },
      });

      // If payout does not exist
      if (!existing) {
        return {
          success: false,
          message:
            'Payout should be created from LOS when payout is initiated. Webhook will only update the status. Please check the LOS initiation flow.',
        };
      }

      const customer = await this.tenantPrisma.client.leads.findFirst({
        where: {
          leadID: existing.leadId,
        },
        include: {
          customer: true,
          loan: true,
          approvals: true,
        },
      });
      if (!customer) {
        return {
          success: false,
          message: 'Customer not found!',
        };
      }

      const payoutFeature = await this.tenantPrisma.client.$transaction(
        async (tx) => {
          // const existing = await tx.payout.findUnique({
          //   where: { razorpayPayoutId: payoutData.id },
          // });

          // // If payout does not exist
          // if (!existing) {
          //   return {
          //     message:
          //       'Payout should be created from LOS when payout is initiated. Webhook will only update the status. Please check the LOS initiation flow.',
          //   };
          // }

          if (mappedStatus === existing.status) {
            return {
              success: false,
              message:
                'Received duplicate webhook with same status. Ignore it.',
            };
          }

          // Save raw webhook for audit
          await tx.payoutWebhookLog.create({
            data: {
              eventType,
              payload: body,
              payoutId: existing.id,
            },
          });

          // If already terminal → ignore updates
          if (existing.isTerminal) {
            return {
              success: false,
              message: 'Received Terminal webhook. Ignore it.',
            };
          }

          // Update payout
          const updated = await tx.payout.update({
            where: { id: existing.id },
            data: {
              ...this.buildPayoutData(payoutData, mappedStatus),
              isTerminal: isTerminalStatus(mappedStatus),
            },
          });

          const systemUserId = await this.globalService.getSystemUserId();


          // Save status history
          await tx.payoutStatusHistory.create({
            data: {
              payoutId: existing.id,
              oldStatus: existing.status,
              newStatus: mappedStatus,
              performed_by: systemUserId,
            },
          });

          if (mappedStatus == PayoutStatus.PROCESSED) {
            // we will
            await tx.loan.update({
              where: { leadID: Number(existing.leadId) },
              data: {
                disbursalRefrenceNo: payoutData.utr,
                disbursalDate: formatDateYYYYMMDD(new Date()), // make a new function like which return data like this yyyy-mm-dd
                remarks: payoutData.narration,
                status: 'Disbursed',
                disbursedBy: Number(updated.performed_by) || 155,
                disbursalTime: new Date(),
              },
            });

            await tx.callhistorylogs.create({
              data: {
                customerID: Number(customer.customerID || ''),
                leadID: Number(existing.leadId),
                callType: 'IVR',
                status: 'Disbursed',
                remark: payoutData.narration || '',
                calledBy: Number(updated.performed_by) || 155,
                noteli: payoutData.narration || '',
              } as any,
            });

            await tx.leads.update({
              where: { leadID: Number(existing.leadId) },
              data: {
                status: 'Disbursed',
              },
            });
          }

          return {
            success: true,
            message: 'Webhook stored',
          };
        },
      );

      if (
        payoutFeature.success === true &&
        mappedStatus == PayoutStatus.PROCESSED
      ) {
        const name = customer?.customer?.name;
        const loanNo = customer.loan?.loanNo;
        const interestAmount =
          (Number(customer.approvals[0].loanAmtApproved) *
            Number(customer.approvals[0].roi) *
            (Number(customer.approvals[0].tenure) || 0)) /
          100;
        const disbursalAmount = customer.approvals[0].loanAmtApproved;
        const roi = customer.approvals[0].roi;
        const tenure = customer.approvals[0].tenure;
        const repayment =
          Number(customer.approvals[0].loanAmtApproved) +
          Math.round(interestAmount);

        const mailData = {
          SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
          name: name,
          loanNo: loanNo,
          disbursalAmount: disbursalAmount,
          roi: roi,
          tenure: tenure,
          repayment: repayment,
          COMPANY_NAME: process.env.COMPANY_NAME,
          SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
        };

        const emailRes = await this.MailService.sendCustomMail(
          customer.customer?.email ?? '',
          `Disbursal Letter ${mailData.COMPANY_NAME}`,
          'credit',
          'disbursalLetter.hbs',
          mailData,
        );

        if (emailRes?.status) {
          const systemUserId = await this.globalService.getSystemUserId();

          await this.tenantPrisma.client.notifications.create({
            data: {
              customerID: Number(customer.customerID),
              leadID: Number(existing.leadId),
              sender_email: emailRes.sender_email,
              notification: emailRes.html,
              type: 'Email',
              subject: 'Disbursal Letter',
              senderUser: systemUserId,
              createdDate: new Date(),
              mtype: 'crm',
            } as any,
          });
          await this.tenantPrisma.client.callhistorylogs.create({
            data: {
              customerID: Number(customer.customerID),
              leadID: Number(existing.leadId),
              callType: 'Mail',
              status: 'DisbursalLetter',
              remark: 'DisbursalLetter',
              calledBy: systemUserId,
              noteli: 'DisbursalLetter',
            } as any,
          });
        }
      }
    } catch (error: any) {
      console.error('Error handling payout webhook:', error);
      throw new HttpException(
        {
          success: false,
          statusCode: 500,
          message: 'Failed to handle payout webhook',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Speedo@4321
  buildPayoutData(p: any, status: PayoutStatus) {
    return {
      status,
      narration: p.narration,
      referenceId: p.reference_id,
      failureReason: p.failure_reason,
      statusReason: p.status_details?.reason,
      statusDescription: p.status_details?.description,
      statusSource: p.status_details?.source,
      createdAtRzp: p.created_at,
    };
  }

  async handlePayoutDowntimeWebhook(payload: any) {
    try {
      const event = payload.event;

      if (
        event !== 'payout.downtime.started' &&
        event !== 'payout.downtime.resolved'
      ) {
        return {
          success: false,
          statusCode: 400,
          massage: 'Wrong downtime webhook found!',
        };
      }

      const downtime = payload.payload['payout.downtime'].entity;

      const { id, method, status, begin, end, scheduled, source, instrument } =
        downtime;

      await this.tenantPrisma.client.payoutDowntime.upsert({
        where: { id },
        update: {
          status,
          end: end ?? null,
        },
        create: {
          id,
          method: method[0], // IMPS / NEFT / RTGS
          bank: instrument?.bank ?? null,
          status,
          begin,
          end: end ?? null,
          scheduled,
          source,
        },
      });

      return {
        success: true,
        statusCode: 200,
        massage: 'Downtime updated',
      };
    } catch (error) {
      console.error(error, 'error on downtime webhook');
      return {
        success: false,
        statusCode: 500,
        massage: 'Something went wrong!',
      };
    }
  }

  async getPayoutDowntime() {
    try {
      // await this.tenantPrisma.client.payoutDowntime.findMany();
      return {
        success: false,
        massage: 'Data not found!',
      };
    } catch (error) {
      console.error(error, 'Error in gettin payout downtime');
      return {
        success: false,
        statusCode: 500,
        massage: 'Something went wrong!',
      };
    }
  }

  async getDisbursedDataExcel() {
    console.log('Calling');
    // const leads = await this.tenantPrisma.client.leads.findMany({
    //   where: {
    //     status: 'Disbursed',
    //     utmSource: {
    //       in: ['FB_PARTNER', 'GOOGLE_PARTNER', 'ig'],
    //     },
    //     createdDate: {
    //       gte: new Date('2026-02-19T00:00:00.000Z'),
    //     },
    //   },
    //   select: {
    //     utmSource: true,
    //     customer: {
    //       select: {
    //         mobile: true,
    //       },
    //     },
    //     loan: {
    //       select: {
    //         disbursalAmount: true,
    //         acutalDisbursalAmount: true,
    //       },
    //     },
    //   },
    // });

    // const workbook = new ExcelJS.Workbook();
    // const worksheet = workbook.addWorksheet('Disbursed Leads');

    // worksheet.columns = [
    //   { header: 'UTM Source', key: 'utmSource', width: 20 },
    //   { header: 'Mobile', key: 'mobile', width: 18 },
    //   { header: 'Disbursal Amount', key: 'disbursalAmount', width: 18 },
    //   {
    //     header: 'Actual Disbursal Amount',
    //     key: 'actualDisbursalAmount',
    //     width: 22,
    //   },
    // ];

    // leads.forEach((l) => {
    //   worksheet.addRow({
    //     utmSource: l.utmSource,
    //     mobile: l.customer?.mobile
    //       ? l.customer.mobile.toString() // 👈 mobile often bigint
    //       : '',
    //     disbursalAmount: l.loan?.disbursalAmount
    //       ? Number(l.loan.disbursalAmount)
    //       : 0,
    //     actualDisbursalAmount: l.loan?.acutalDisbursalAmount
    //       ? Number(l.loan.acutalDisbursalAmount)
    //       : 0,
    //   });
    // });

    // worksheet.getRow(1).font = { bold: true };

    // return workbook;

    //query logs
    // const customers = await this.tenantPrisma.client.leads.findMany({
    //   where: {
    //     status: {
    //       in: ['Approved', 'Disbursal_Sheet_Send'],
    //     },
    //     createdDate: {
    //       gte: new Date('2025-12-01T00:00:00.000Z'),
    //       lt: new Date('2026-03-13T00:00:00.000Z'),
    //     },
    //   },
    //   select: {
    //     customer: {
    //       select: {
    //         name: true,
    //         mobile: true,
    //         pancard:true,
    //         email:true
    //       },
    //     },
    //     status: true,
    //   },
    // });
    // const workbook = new ExcelJS.Workbook();
    // const worksheet = workbook.addWorksheet('Disbursed Leads');

    // worksheet.columns = [
    //   { header: 'Name', key: 'name', width: 18 },
    //   { header: 'Mobile', key: 'mobile', width: 18 },
    //   { header: 'Status', key: 'status', width: 18 },
    //   { header: 'Pan', key: 'pan', width: 18 },
    //   { header: 'Email', key: 'email', width: 18 },

    // ];

    // customers.forEach((l) => {
    //   worksheet.addRow({
    //        Name: l.customer?.name,
    //     mobile: l.customer?.mobile
    //       ? l.customer.mobile.toString()
    //       : '',
    //     status: l.status,
    //     pan:l.customer?.pancard,
    //     email:l.customer?.email

    //   });
    // });

    // worksheet.getRow(1).font = { bold: true };
    // console.log(customers.length,"length")

    // // return workbook;
    const today = new Date();

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const customers = await this.tenantPrisma.client.loan.findMany({
      where: {
        status: 'Disbursed',
        disbursalDate: {
          gte: '2026-02-01',
        },
        lead: {
          approvals: {
            some: {
              repayDate: {
                gte: tomorrow,
              },
            },
          },
        },
      },
      select: {
        disbursalDate: true,
        loanNo: true,
        lead: {
          select: {
            approvals: {
              where: {
                repayDate: {
                  gte: tomorrow,
                },
              },
              select: {
                repayDate: true,
                loanAmtApproved: true,
              },
            },
            customer: {
              select: {
                name: true,
                mobile: true,
                email: true,
                pancard: true,
                employer: {
                  select: {
                    empSalary: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Disbursed Leads');

    worksheet.columns = [
      { header: 'Name', key: 'name', width: 18 },
      { header: 'Mobile', key: 'mobile', width: 18 },
      { header: 'Pan', key: 'pan', width: 18 },
      { header: 'Email', key: 'email', width: 18 },
      { header: 'Loan No.', key: 'loanNo', width: 18 },
      { header: 'Amount', key: 'amount', width: 18 },
      { header: 'Disbural Date', key: 'disbursalDate', width: 18 },
      { header: 'Repay Date', key: 'repayDate', width: 18 },
      { header: 'Salary', key: 'empSalary', width: 18 },
    ];

    customers.forEach((l) => {
      worksheet.addRow({
        Name: l.lead.customer?.name,
        mobile: l.lead.customer?.mobile
          ? l.lead.customer.mobile.toString()
          : '',
        pan: l.lead.customer?.pancard,
        email: l.lead.customer?.email,
        loanNo: l.loanNo,
        amount: l.lead.approvals[0].loanAmtApproved,
        disbursalDate: l.disbursalDate,
        repayDate: l.lead.approvals[0].repayDate,
        empSalary: l.lead.customer?.employer[0]?.empSalary || '',
        // status:""
      });
    });

    worksheet.getRow(1).font = { bold: true };
    console.log(customers.length, 'length');

    return workbook;
  }

  async getCibilData() {
    const data = await this.tenantPrisma.client.cibildata.count({
      where: {
        createdAt: {
          gte: new Date('2025-11-01T00:00:00.000Z'),
          lte: new Date('2025-11-15T00:00:00.000Z'),
        },
      },
    });

    console.log(data, 'data');

    return {
      count: data,
    };
  }

  async generatePayout(leadId) {
    try {
      const payoutGenerate = await this.tenantPrisma.client.$transaction(
        async (tx) => {
          const payout = await tx.payout.findFirst({
            where: {
              leadId,
            },
            select: {
              id: true,
            },
          });

          if (payout) {
            return {
              statusCode: 200,
              success: true,
              message: 'Payout already generated!',
            };
          }

          const lead = await tx.leads.findFirst({
            where: {
              leadID: leadId,
              status: 'Disbursal_Sheet_Send',
            },
            select: {
              customer: {
                select: {
                  name: true,
                  email: true,
                  mobile: true,
                  pancard: true,
                  customerID: true,
                  razorpay_contact_id: true,
                },
              },
              approvals: {
                select: {
                  disbursalaccountid: true,
                },
              },
              loan: {
                select: {
                  acutalDisbursalAmount: true,
                },
              },
            },
          });

          if (!lead) {
            return {
              statusCode: 400,
              success: false,
              message: `Lead not found or lead's status is not disburalsheetsend.`,
            };
          }

          const apiKey = process.env.RAZORPAY_PAYOUT_KEY_ID;
          const apiSecret = process.env.RAZORPAY_PAYOUT_KEY_SECRET;
          const Contacturl = 'https://api.razorpay.com/v1/contacts';
          const fundAccUrl = 'https://api.razorpay.com/v1/fund_accounts';
          const authHeader =
            'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
          if (!lead?.customer?.razorpay_contact_id) {
            const rpContact = await axios.post(
              Contacturl,
              {
                name: lead?.customer?.name,
                email: lead?.customer?.email,
                contact: String(lead?.customer?.mobile),
                type: 'customer',
                reference_id: `${lead?.customer?.mobile} - ${lead?.customer?.pancard}`,
                notes: {
                  customer: `${lead?.customer?.mobile} - ${lead?.customer?.pancard}`,
                },
              },
              {
                headers: {
                  Authorization: authHeader,
                  'Content-Type': 'application/json',
                },
              },
            );

            await tx.customer.update({
              where: {
                customerID: Number(lead?.customer?.customerID),
              },
              data: {
                razorpay_contact_id: rpContact.data.id,
              },
            });
          }

          let fund = await tx.customeraccount.findUnique({
            where: {
              accountID: Number(lead?.approvals[0]?.disbursalaccountid),
            },
            //   select: {},
          });
          if (!fund) {
            return {
              status: false,
              message: 'Bank Account Not Found!',
            };
          }
          if (!fund.razorpay_fund_account_id) {
            const fa = await axios.post(
              fundAccUrl,
              {
                contact_id: lead?.customer?.razorpay_contact_id,
                account_type: 'bank_account',
                bank_account: {
                  name: fund.bank_holder_name,
                  ifsc: fund.bankIfsc,
                  account_number: fund.accountNo,
                },
              },
              {
                headers: {
                  Authorization: authHeader,
                  'Content-Type': 'application/json',
                },
              },
            );

            fund = await tx.customeraccount.update({
              where: {
                accountID: Number(lead?.customer?.razorpay_contact_id),
              },
              data: {
                razorpay_fund_account_id: fa.data.id,
              },
            });
          }

          const existingDisbursement = await tx.payout.findFirst({
            where: { leadId: leadId },
          });

          if (existingDisbursement) {
            await tx.payout.update({
              where: { id: existingDisbursement.id },
              data: { fundAccountId: fund?.razorpay_fund_account_id || '' },
            });
          } else {
            await tx.payout.create({
              data: {
                leadId: leadId,
                fundAccountId: fund?.razorpay_fund_account_id || '',
                amount: Math.round(Number(lead?.loan?.acutalDisbursalAmount)),
                status: 'APPROVAL_PENDING',
              },
            });
          }
          return {
            statusCode: 200,
            success: true,
            message: 'Payout generated',
          };
        },
      );
      return payoutGenerate;
    } catch (error: any) {
      // console.dir(error.response.data);
      console.error(error.response.data, 'Error on payout generation!');
      return {
        statusCode: 500,
        success: false,
        message:
          error.response.data.error.description || 'Error on payout generated!',
      };
    }
  }

  async getWithoutGeneratedPayout({
    page,
    limit,
    filters,
    search,
    status,
    req,
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
    status?: PayoutGenerateStatus;
    req: Request;
  }) {
    const skip = (page - 1) * limit;

    const where: any = {
      status,
      lead: {
        status: 'Disbursal_Sheet_Send',
        Payout: null,
      },
    };

    if (filters.fromDate || filters.toDate) {
      where.createdDate = {};

      if (filters.fromDate) {
        const from = new Date(filters.fromDate + 'T00:00:00.000Z');
        if (!isNaN(from.getTime())) {
          where.createdDate.gte = from;
        }
      }

      if (filters.toDate) {
        const to = new Date(filters.toDate + 'T23:59:59.999Z');
        if (!isNaN(to.getTime())) {
          where.createdDate.lte = to;
        }
      }
    } else {
      const todayEnd = new Date();
      todayEnd.setUTCHours(23, 59, 59, 999);

      // const threeDaysAgo = new Date();
      // threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
      // threeDaysAgo.setUTCHours(0, 0, 0, 0);

      // where.createdDate = {
      //   gte: threeDaysAgo,
      //   lte: todayEnd,
      // };

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
      sevenDaysAgo.setUTCHours(0, 0, 0, 0);

      where.createdDate = {
        gte: sevenDaysAgo,
        lte: todayEnd,
      };
    }

    // const todayEnd = new Date();
    // todayEnd.setUTCHours(23, 59, 59, 999);

    // const threeDaysAgo = new Date();
    // threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
    // threeDaysAgo.setUTCHours(0, 0, 0, 0);

    const [leads, total] = await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.approval.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdDate: 'desc' },
        select: {
          leadID: true,
          adminFee: true,
          GstOfAdminFee: true,
          disbursalAccount: {
            select: {
              bank_holder_name: true,
              accountNo: true,
              bankIfsc: true,
              bank: true,
            },
          },
          createdDate: true,
          lead: {
            select: {
              loan: {
                select: {
                  loanNo: true,
                  acutalDisbursalAmount: true,
                  accountNo: true,
                  bankIfsc: true,
                  bank: true,
                },
              },
              customer: {
                select: {
                  name: true,
                  mobile: true,
                },
              },
              status: true,
            },
          },
        },
      }),
      this.tenantPrisma.client.approval.count({
        where,
      }),
    ]);

    return convertBigIntToString({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: normalizeData(leads),
    });
  }

  async getIciciPayoutList({
    page,
    limit,
    tab,
    filters,
    search,
    req,
  }: {
    page: number;
    limit: number;
    tab: string;
    search?: string;
    filters: {
      fbleads?: string;
      allSource?: string;
      fromDate?: string;
      toDate?: string;
    };
    req: Request;
  }) {
    try {
      const skip = (page - 1) * limit;

      const approvalsWhere: any = {};

      // -------------------------
      // DATE FILTER
      // -------------------------
      if (filters.fromDate || filters.toDate) {
        if (filters.fromDate) {
          const from = new Date(filters.fromDate + 'T00:00:00.000Z');
          if (!isNaN(from.getTime())) {
            approvalsWhere.createdDate = {
              ...(approvalsWhere.createdDate || {}),
              gte: from,
            };
          }
        }

        if (filters.toDate) {
          const to = new Date(filters.toDate + 'T23:59:59.999Z');
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
        sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
        sevenDaysAgo.setUTCHours(0, 0, 0, 0);

        approvalsWhere.createdDate = {
          gte: sevenDaysAgo,
          lte: todayEnd,
        };
      }

      // -------------------------
      // BASE WHERE
      // -------------------------
      const where: any = {
        status: 'Disbursal_Sheet_Send',
        // isAudit: true,
        loan: {
          exported: false,
        },
        approvals: {
          some: approvalsWhere,
        },
      };

      // -------------------------
      // ICICI PAYOUT FILTER
      // -------------------------

      if (tab === 'ALL') {
        // DEFAULT → EXCLUDE SUCCESS & PENDING
        where.icici_payout = {
          none: {
            status: {
              in: ['SUCCESS', 'PENDING'],
            },
          },
        };
      }

      if (tab === 'pending') {
        where.icici_payout = {
          some: {
            status: 'PENDING',
          },
        };
      }

      if (tab === 'error') {
        where.icici_payout = {
          some: {
            status: 'FAILED',
          },
        };
      }

      // -------------------------
      // QUERY
      // -------------------------
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
                    accountNo: true,
                    bankIfsc: true,
                    bank: true,
                    bankBranch: true,
                  },
                },
              },
            },
            loan: true,
            icici_payout: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 1,
              select: {
                leadID: true,
                responseMsg: true,
                status: true,
              },
            },
          },
        }),

        this.tenantPrisma.client.leads.count({ where }),
      ]);

      // const data = normalizeData(leads);

      const data = leads.map((lead) => {
        const response = lead.credforge_bre_log?.[0]?.responsePayload as any;

        const riskGrade =
          response?.output_data?.features?.output_features?.bureau
            ?.cbs_risk_grade ?? null;

        return {
          ...lead,
          cbs_risk_grade: riskGrade,
        };
      });

      const domain = (
        await this.smsService.getCurrentDomain(req)
      )?.toLowerCase();

      const allowedDomains =
        process.env.GET_EMANDATE_BYPASS_ALLOWED_DOMAINS?.split(',').map((d) =>
          d.trim().toLowerCase(),
        ) || [];

      // -------------------------
      // EMANDATE BYPASS
      // -------------------------
      if (allowedDomains.includes(domain)) {
        return convertBigIntToString({
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          data,
        });
      }

      const mandateConfig = EMANDATE_CONFIG[domain] || {
        enable: false,
        provider: 'none',
      };

      // -------------------------
      // FILTER EMANDATE (OPTIMIZED)
      // -------------------------
      const leadIds = leads.map((l) => Number(l.leadID));

      let emandateLeadSet = new Set<number>();

      if (mandateConfig.provider === 'razorpay') {
        const emandates = await this.tenantPrisma.client.emandates.findMany({
          where: {
            leadID: {
              in: leadIds.map(String),
            },
            token_id: {
              not: null,
            },
          },
          select: {
            leadID: true,
          },
        });

        emandateLeadSet = new Set(emandates.map((e) => Number(e.leadID)));
      } else if (mandateConfig.provider === 'easeBuzz') {
        const easebuzzEmandates =
          await this.tenantPrisma.client.easebuzz_emandates.findMany({
            where: {
              leadID: {
                in: leadIds,
              },
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

        emandateLeadSet = new Set(
          easebuzzEmandates.map((e) => Number(e.leadID)),
        );
      }

      const filteredData = leads.filter((lead) =>
        emandateLeadSet.has(lead.leadID),
      );

      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data: filteredData,
      });
    } catch (err: any) {
      throw new HttpException(
        {
          success: false,
          statusCode: 500,
          message: 'Failed to fetch disbursal data',
          error: err.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async makePayoutIcici(leadId, req) {
    const lockKey = `payout_lock:${leadId}`;

    const lock = await acquireLock(lockKey, 60000);
    if (!lock) {
      return { success: false, message: 'Payout already in progress' };
    }
    try {
      const userData = await this.clsService.get('user');

      const existing = await this.tenantPrisma.client.icici_payout.findFirst({
        where: {
          leadID: Number(leadId),
          status: { in: ['SUCCESS', 'PENDING'] },
        },
      });

      if (existing) {
        return {
          success: true,
          message: 'Payout already exists',
          data: normalize(existing),
        };
      }

      const loan = await this.tenantPrisma.client.loan.findUnique({
        where: {
          leadID: Number(leadId),
        },
        include: {
          lead: {
            select: {
              customerID: true,
              customer: {
                select: {
                  name: true,
                  mobile: true,
                  customerID: true,
                  email: true,
                },
              },
              approvals: {
                select: {
                  disbursalAccount: true,
                  loanAmtApproved: true,
                  roi: true,
                  tenure: true,
                },
              },
            },
          },
        },
      });

      console.log(loan?.lead?.customer?.email, 'loan');

      if (!loan) {
        return {
          success: false,
          statusCode: 400,
          message: 'Loan not found for the lead',
        };
      }

      if (!loan?.lead.approvals[0]?.disbursalAccount) {
        return {
          success: false,
          statusCode: 400,
          message: 'Disbursal account not found for the lead',
        };
      }

      if (loan.exported === true) {
        return {
          success: false,
          statusCode: 400,
          message: 'Loan already exported for disbursal',
        };
      }
      const paymentRef = `${loan.loanNo}_${Date.now()}`;

      const payload = {
        beneAccNo: loan.accountNo,
        beneIFSC: loan.bankIfsc,
        senderName: loan.lead.approvals[0].disbursalAccount.bank_holder_name,
        amount: Math.round(Number(loan.acutalDisbursalAmount)),
        mobile: loan.lead.customer?.mobile.toString(),
        paymentRef: paymentRef,
      };

      // const payload = {
      //   "beneAccNo": "12345604111218",
      //   "beneIFSC": "NPCI0000001",
      //   "amount": "1",
      //   "senderName": "Pratik Mundhe",
      //   "mobile": "9999988888",
      //   "paymentRef": "IMPSTransferP2A"
      // }

      const payout = await this.tenantPrisma.client.icici_payout.create({
        data: {
          amount: BigInt(payload.amount),
          paymentRef,
          status: 'PENDING',
          responseMsg: 'INITIATED',
          leadID: Number(leadId),
        },
      });
      await this.log(payout.id, 'REQUEST', payload);

      const res = await this.payoutService.transfer(payload);

      if (res.error) {
        await this.failPayout(payout.id, res);
        return { success: false, message: res.message };
      }

      const updated = await this.tenantPrisma.client.icici_payout.update({
        where: { id: payout.id },
        data: {
          status: res.status,
          actCode: res.actCode,
          bankRRN: res.bankRRN,
          responseMsg: res.message,
          response: res.raw,
          transRefNo: res.referenceId,

          isTerminal: res.status !== 'PENDING',
          isRetryable: res.isRetryable,
          needsStatusCheck: res.needsStatusCheck,

          nextCheckAt: res.needsStatusCheck
            ? new Date(Date.now() + 5 * 60 * 1000)
            : null,

          expiresAt: res.needsStatusCheck
            ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
            : null,
        },
      });

      await this.log(payout.id, 'RESPONSE', res.raw, res.actCode, res.message);

      if (res.status != 'FAILED' && !res.needsStatusCheck) {
        const dataUpdate = await this.tenantPrisma.client.$transaction(
          async (tx) => {
            const disbusral = await tx.loan.update({
              where: { leadID: Number(leadId) },
              data: {
                disbursalRefrenceNo: res.referenceId,
                disbursalDate: formatDateYYYYMMDD(new Date()),
                remarks: `${res.message}-Disbursed via ICICI Payouts` || '',
                status: 'Disbursed',
                disbursedBy: Number(userData),
                disbursalTime: new Date(),
              },
            });

            const systemUserId = await this.globalService.getSystemUserId();


            const callHistoryLog = await tx.callhistorylogs.create({
              data: {
                customerID: Number(loan?.lead?.customer?.customerID ?? ''),
                leadID: Number(leadId),
                callType: 'IVR',
                status: 'Disbursed',
                remark: `${res.message}-Disbursed via ICICI Payouts` || '',
                calledBy: systemUserId,
                noteli: res.message || '',
              } as any,
            });

            const leadsUpdate = await tx.leads.update({
              where: { leadID: Number(leadId) },
              data: {
                status: 'Disbursed',
              },
            });
          },
        );
      }

      if (res.status != 'FAILED' && !res.needsStatusCheck) {
        const name = loan?.lead?.customer?.name ?? '';
        const loanNo = loan?.loanNo ?? '';
        const interestAmount =
          (Number(loan?.lead.approvals[0].loanAmtApproved) *
            Number(loan?.lead.approvals[0].roi) *
            (Number(loan?.lead.approvals[0].tenure) || 0)) /
          100;
        const disbursalAmount = loan?.lead.approvals[0].loanAmtApproved;
        const roi = loan?.lead.approvals[0].roi;
        const tenure = loan?.lead.approvals[0].tenure;
        const repayment =
          Number(loan?.lead.approvals[0].loanAmtApproved) +
          Math.round(interestAmount);

        const mailData = {
          SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
          name: name,
          loanNo: loanNo,
          disbursalAmount: disbursalAmount,
          roi: roi,
          tenure: tenure,
          repayment: repayment,
          COMPANY_NAME: process.env.COMPANY_NAME,
          SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
        };

        const emailRes = await this.MailService.sendCustomMail(
          loan?.lead?.customer?.email ?? '',
          `Disbursal Letter ${mailData.COMPANY_NAME}`,
          'credit',
          'disbursalLetter.hbs',
          mailData,
        );

        if (emailRes?.status) {
          await Promise.all([
            this.tenantPrisma.client.notifications.create({
              data: {
                customerID: Number(loan?.lead.customerID),
                leadID: Number(leadId),
                sender_email: emailRes.sender_email,
                notification: emailRes.html,
                type: 'Email',
                subject: 'Disbursal Letter',
                senderUser: Number(userData),
                createdDate: new Date(),
                mtype: 'crm',
              } as any,
            }),

            this.tenantPrisma.client.callhistorylogs.create({
              data: {
                customerID: Number(loan?.lead.customerID),
                leadID: Number(leadId),
                callType: 'Mail',
                status: 'DisbursalLetter',
                remark: 'DisbursalLetter',
                calledBy: userData,
                noteli: 'DisbursalLetter',
              } as any,
            }),
          ]);
        }
      }

      if (res.needsStatusCheck) {
        const domain = req.headers['x-tenant-domain'] || req.headers['host'];

        await this.statusQueue.add(
          'status-check',
          {
            payoutId: payout.id,
            domain,
          },
          {
            jobId: `payout-${payout.id}`,
            delay: 5 * 1000,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      }

      const tenant = await this.CibilService.getCurrentDomain(req);
      await this.cacheService.del(
        CacheKey.lead(tenant, Number(leadId), 'Profile'),
      );

      return { success: true, data: normalize(updated) };
    } finally {
      await releaseLock(lockKey);
    }
  }

  async log(payoutId, step, payload, actCode?, message?) {
    return this.tenantPrisma.client.icici_Payoutlog.create({
      data: {
        payoutId,
        step,
        payload,
        actCode,
        message,
      },
    });
  }

  async failPayout(payoutId: number, error: any) {
    await this.tenantPrisma.client.icici_payout.update({
      where: { id: payoutId },
      data: {
        status: 'FAILED',
        isTerminal: true,
        responseMsg: error.message || 'ICICI API Failed',
        error: error,
      },
    });

    await this.tenantPrisma.client.icici_Payoutlog.create({
      data: {
        payoutId,
        step: 'ERROR',
        payload: error,
        message: error.message,
      },
    });
  }

  async getReportByNumber(res: Response, query: any) {
    try {
      const { fromDate, toDate, apiKey } = query;

      if (apiKey !== process.env.LOAN_REPORT_API_KEY) {
        throw new Error('Invalid API Key');
      }

      const data = await this.tenantPrisma.client.loan.findMany({
        where: {
          status: 'Disbursed',
          lead: {
            status: 'Disbursed',
            approvals: {
              some: {
                repayDate: {
                  gte: fromDate ? new Date(fromDate) : new Date('2026-08-01'),
                  lte: toDate ? new Date(toDate) : new Date('2026-08-31'),
                },
              },
            },
          },
        },

        select: {
          loanNo: true,
          disbursalDate: true,
          lead: {
            select: {
              customer: {
                select: {
                  mobile: true,
                  email: true,
                  name: true,
                  reference: true,
                  addresses: {
                    select: {
                      address: true,
                    },
                    orderBy: {
                      addressID: 'asc',
                    },
                    take: 1,
                  },
                },
              },

              approvals: {
                where: {
                  repayDate: {
                    gte: fromDate ? new Date(fromDate) : new Date('2026-08-01'),
                    lte: toDate ? new Date(toDate) : new Date('2026-08-31'),
                  },
                },
                select: {
                  repayDate: true,
                  tenure: true,
                  roi: true,
                  loanAmtApproved: true,
                  leadID: true,
                },
              },
            },
          },
        },
      });
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(
        `Loan Report ${process.env.CLIENT_ENV}`,
      );

      worksheet.columns = [
        { header: 'Mobile', key: 'mobile', width: 20 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Email', key: 'email', width: 20 },
        { header: 'Loan No', key: 'loanNo', width: 20 },
        { header: 'Repay Date', key: 'repayDate', width: 20 },
        { header: 'Amount', key: 'amount', width: 20 },
        { header: 'Address', key: 'address', width: 20 },
        { header: 'Disbursal Date', key: 'disbursalDate', width: 20 },
        { header: 'Reference Number', key: 'reference', width: 20 },
      ];

      data.forEach((item) => {
        item.lead.approvals.forEach((approval) => {
          worksheet.addRow({
            mobile: String(item.lead.customer?.mobile || ''),
            loanNo: String(item.loanNo || ''),
            repayDate: approval.repayDate,
            email: String(item.lead.customer?.email || ''),
            name: String(item.lead.customer?.name || ''),
            address: String(item.lead.customer?.addresses[0]?.address || ''),
            amount:
              Number(approval.loanAmtApproved) +
              Number(
                (approval.loanAmtApproved * approval.roi * approval.tenure) /
                100,
              ),
            disbursalDate: item.disbursalDate,
            reference: String(
              item.lead.customer?.reference[0]?.contactNo || '',
            ),
          });
        });
      });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      res.setHeader(
        'Content-Disposition',
        `attachment; filename=loan-report-${process.env.CLIENT_ENV}.xlsx`,
      );

      await workbook.xlsx.write(res);

      res.end();
    } catch (err) {
      console.log(err);
      throw err;
    }
  }


  async bulkDisbursalUpload(
    file: Express.Multer.File,
    req: Request,
  ) {
    try {
      /**
       * ============================================================
       * 1. FILE VALIDATION
       * ============================================================
       */

      if (!file) {
        return {
          success: false,
          statusCode: 400,
          message: 'Excel file is required',
        };
      }

      if (!file.buffer) {
        return {
          success: false,
          statusCode: 400,
          message: 'Invalid Excel file',
        };
      }

      /**
       * ============================================================
       * 2. READ EXCEL
       * ============================================================
       */

      const workbook = new ExcelJS.Workbook();

      await workbook.xlsx.load(file.buffer as any);

      const worksheet = workbook.worksheets[0];

      if (!worksheet) {
        return {
          success: false,
          statusCode: 400,
          message: 'Excel sheet not found',
        };
      }

      const MAX_ROWS = 1000;

      /**
       * ============================================================
       * 3. VALIDATE HEADERS
       * ============================================================
       */

      const expectedHeaders = [
        'Loan Number',
        'Disbursal Reference No',
        'Disbursal Date',
        'Remarks',
      ];

      const actualHeaders = [
        this.getCellValue(worksheet.getCell(1, 1)),
        this.getCellValue(worksheet.getCell(1, 2)),
        this.getCellValue(worksheet.getCell(1, 3)),
        this.getCellValue(worksheet.getCell(1, 4)),
      ];

      for (let i = 0; i < expectedHeaders.length; i++) {
        if (
          actualHeaders[i]?.trim().toLowerCase() !==
          expectedHeaders[i].toLowerCase()
        ) {
          return {
            success: false,
            statusCode: 400,
            message: `Invalid Excel format. Column ${i + 1} must be "${expectedHeaders[i]}"`,
            expectedHeaders,
          };
        }
      }

      /**
       * ============================================================
       * 4. READ EXCEL ROWS
       * ============================================================
       */

      let rows: DisbursalExcelRow[] = [];
      const errors: ValidationError[] = [];

      for (
        let rowNumber = 2;
        rowNumber <= worksheet.rowCount;
        rowNumber++
      ) {
        const excelRow = worksheet.getRow(rowNumber);

        const loanNoValue = this.getCellValue(
          excelRow.getCell(1),
        );

        const referenceValue = this.getCellValue(
          excelRow.getCell(2),
        );

        const dateValue = excelRow.getCell(3).value;

        const remarksValue = this.getCellValue(
          excelRow.getCell(4),
        );

        /**
         * Skip completely empty rows
         */
        if (
          !loanNoValue &&
          !referenceValue &&
          !dateValue &&
          !remarksValue
        ) {
          continue;
        }

        /**
         * ==========================================================
         * Loan Number validation
         * ==========================================================
         */

        const loanNo = String(loanNoValue ?? '').trim();

        if (!loanNo) {
          errors.push({
            row: rowNumber,
            field: 'Loan Number',
            message: 'Loan Number is required',
          });

          continue;
        }

        /**
         * ==========================================================
         * Reference validation
         * ==========================================================
         */

        const disbursalRefrenceNo =
          String(referenceValue ?? '').trim();

        if (!disbursalRefrenceNo) {
          errors.push({
            row: rowNumber,
            loanNo,
            field: 'Disbursal Reference No',
            message: 'Disbursal Reference No is required',
          });
        } else if (disbursalRefrenceNo.length > 100) {
          errors.push({
            row: rowNumber,
            loanNo,
            field: 'Disbursal Reference No',
            message:
              'Disbursal Reference No cannot exceed 100 characters',
          });
        }

        /**
         * ==========================================================
         * Date validation
         * ==========================================================
         */

        const disbursalDate =
          this.parseExcelDate(dateValue);

        if (!disbursalDate) {
          errors.push({
            row: rowNumber,
            loanNo,
            field: 'Disbursal Date',
            message:
              'Invalid Disbursal Date. Use DD-MM-YYYY format',
          });
        } else {
          const today =
            this.formatDateToYYYYMMDD(new Date());

          if (disbursalDate > today) {
            errors.push({
              row: rowNumber,
              loanNo,
              field: 'Disbursal Date',
              message:
                'Disbursal Date cannot be a future date',
            });
          }
        }

        /**
         * ==========================================================
         * Remarks validation
         * ==========================================================
         */

        const remarks =
          String(remarksValue ?? '').trim();

        if (!remarks) {
          errors.push({
            row: rowNumber,
            loanNo,
            field: 'Remarks',
            message: 'Remarks are required',
          });
        } else if (remarks.length > 500) {
          errors.push({
            row: rowNumber,
            loanNo,
            field: 'Remarks',
            message:
              'Remarks cannot exceed 500 characters',
          });
        }

        /**
         * IMPORTANT:
         * leadId is NOT coming from Excel anymore.
         * It will be resolved from loanNo later.
         */

        rows.push({
          rowNumber,
          loanNo,
          leadId: null,
          disbursalRefrenceNo,
          disbursalDate: disbursalDate || '',
          remarks,
        });
      }

      /**
       * ============================================================
       * 5. EMPTY FILE CHECK
       * ============================================================
       */

      if (!rows.length) {
        return {
          success: false,
          statusCode: 400,
          message: 'Excel file contains no disbursal data',
        };
      }

      if (rows.length > MAX_ROWS) {
        return {
          success: false,
          statusCode: 400,
          message: `Maximum ${MAX_ROWS} records are allowed in one upload`,
        };
      }

      /**
       * Stop if Excel validation failed.
       */

      if (errors.length) {
        return {
          success: false,
          statusCode: 400,
          message: 'Excel validation failed',
          totalRecords: rows.length,
          totalErrors: errors.length,
          errors,
        };
      }

      /**
       * ============================================================
       * 6. DUPLICATE LOAN NUMBERS IN EXCEL
       * ============================================================
       */

      const duplicateLoanNos =
        this.findDuplicates(
          rows.map((item) => item.loanNo),
        );

      if (duplicateLoanNos.length) {
        duplicateLoanNos.forEach((loanNo) => {
          const matchingRows = rows.filter(
            (row) => row.loanNo === loanNo,
          );

          matchingRows.forEach((row) => {
            errors.push({
              row: row.rowNumber,
              loanNo,
              field: 'Loan Number',
              message:
                `Duplicate Loan Number ${loanNo} found in Excel`,
            });
          });
        });
      }

      /**
       * ============================================================
       * 7. DUPLICATE REFERENCE NUMBERS IN EXCEL
       * ============================================================
       */

      const duplicateReferences =
        this.findDuplicates(
          rows.map((item) =>
            item.disbursalRefrenceNo.toLowerCase(),
          ),
        );

      if (duplicateReferences.length) {
        duplicateReferences.forEach((reference) => {
          const matchingRows = rows.filter(
            (row) =>
              row.disbursalRefrenceNo.toLowerCase() ===
              reference,
          );

          matchingRows.forEach((row) => {
            errors.push({
              row: row.rowNumber,
              loanNo: row.loanNo,
              field: 'Disbursal Reference No',
              message:
                `Duplicate reference number "${row.disbursalRefrenceNo}" found in Excel`,
            });
          });
        });
      }

      if (errors.length) {
        return {
          success: false,
          statusCode: 400,
          message: 'Duplicate records found',
          totalRecords: rows.length,
          totalErrors: errors.length,
          errors,
        };
      }

      /**
       * ============================================================
       * 8. FETCH DOMAIN
       * ============================================================
       */

      const domain = (
        await this.smsService.getCurrentDomain(req)
      )?.toLowerCase();

      if (!domain) {
        return {
          success: false,
          statusCode: 400,
          message: 'Unable to identify tenant domain',
        };
      }

      const allowedDomains =
        process.env.UPDATE_DISBURSAL_ALLOWED_DOMAINS
          ?.split(',')
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean) || [];

      const isAllowedDomain =
        allowedDomains.includes(domain);

      /**
       * ============================================================
       * 9. FETCH LOANS USING LOAN NUMBER
       * ============================================================
       */

      const loanNos = rows.map(
        (item) => item.loanNo,
      );

      const loans =
        await this.tenantPrisma.client.loan.findMany({
          where: {
            loanNo: {
              in: loanNos,
            },
          },
          select: {
            id: true,
            leadID: true,
            loanNo: true,
            status: true,
            disbursalRefrenceNo: true,
            disbursalDate: true,
          },
        });

      /**
       * ============================================================
       * loanNo -> loan
       * ============================================================
       */

      const loanMap = new Map(
        loans.map((loan) => [
          String(loan.loanNo).trim(),
          loan,
        ]),
      );

      /**
       * ============================================================
       * 10. VALIDATE THAT EVERY EXCEL LOAN EXISTS
       * ============================================================
       */

      for (const row of rows) {
        const loan = loanMap.get(
          String(row.loanNo).trim(),
        );

        if (!loan) {
          errors.push({
            row: row.rowNumber,
            loanNo: row.loanNo,
            field: 'Loan Number',
            message:
              `Loan Number "${row.loanNo}" not found`,
          });

          continue;
        }

        /**
         * Store leadID internally.
         * Excel still uses loanNo.
         */

        row.leadId = Number(loan.leadID);
      }

      /**
       * Stop if any loan number doesn't exist.
       */

      if (errors.length) {
        return {
          success: false,
          statusCode: 400,
          message:
            'Loan validation failed',
          totalRecords: rows.length,
          totalErrors: errors.length,
          errors,
        };
      }

      /**
       * ============================================================
       * 11. FETCH LEADS
       * ============================================================
       */

      const leadIds = rows
        .map((row) => Number(row.leadId))
        .filter((id) => Number.isFinite(id));

      const leads: any[] =
        await this.tenantPrisma.client.leads.findMany({
          where: {
            leadID: {
              in: leadIds,
            },
          },
          select: {
            leadID: true,
            customerID: true,
            status: true,
            emandatebypass: true,

            loan: {
              select: {
                id: true,
                leadID: true,
                loanNo: true,
                status: true,
                disbursalRefrenceNo: true,
                disbursalDate: true,
              },
            },

            customer: {
              select: {
                name: true,
                firstName: true,
                email: true,
              },
            },

            approvals: {
              select: {
                loanAmtApproved: true,
                roi: true,
                tenure: true,
              },
              take: 1,
            },
          },
        });

      /**
       * ============================================================
       * leadID -> lead
       * ============================================================
       *
       * This map is only for internal DB operations.
       * Excel/error identification remains loanNo.
       */

      const leadByIdMap = new Map<number, any>(
        leads.map((lead) => [
          Number(lead.leadID),
          lead,
        ]),
      );

      /**
       * ============================================================
       * loanNo -> lead
       * ============================================================
       *
       * This is the main map we should use throughout this function.
       */

      const leadMap = new Map<string, any>(
        leads
          .filter((lead) => lead.loan?.loanNo)
          .map((lead) => [
            String(lead.loan.loanNo).trim(),
            lead,
          ]),
      );

      /**
       * ============================================================
       * 12. VALIDATE LEAD + LOAN
       * ============================================================
       */

      for (const row of rows) {
        /**
         * IMPORTANT:
         * Get lead using loanNo, NOT leadId.
         */

        const lead = leadMap.get(
          String(row.loanNo).trim(),
        );

        if (!lead) {
          errors.push({
            row: row.rowNumber,
            loanNo: row.loanNo,
            field: 'Loan Number',
            message:
              `Lead not found for Loan Number "${row.loanNo}"`,
          });

          continue;
        }

        if (!lead.loan) {
          errors.push({
            row: row.rowNumber,
            loanNo: row.loanNo,
            field: 'Loan Number',
            message:
              'Loan record not found',
          });

          continue;
        }

        /**
         * Already disbursed
         */

        if (
          lead.status === 'Disbursed' ||
          lead.loan.status === 'Disbursed'
        ) {
          errors.push({
            row: row.rowNumber,
            loanNo: row.loanNo,
            field: 'Loan Number',
            message:
              'Loan is already disbursed',
          });

          continue;
        }

        /**
         * Allowed statuses
         */

        const allowedStatuses = [
          'Approved',
          'Disbursal_Sheet_Send',
        ];

        if (
          !allowedStatuses.includes(
            lead.status,
          )
        ) {
          errors.push({
            row: row.rowNumber,
            loanNo: row.loanNo,
            field: 'Loan Number',
            message:
              `Loan cannot be disbursed from status "${lead.status}"`,
          });
        }
      }

      /**
       * ============================================================
       * 13. CHECK REFERENCE ALREADY EXISTS IN DB
       * ============================================================
       */

      const references = rows.map(
        (row) => row.disbursalRefrenceNo,
      );

      const existingReferences =
        await this.tenantPrisma.client.loan.findMany({
          where: {
            disbursalRefrenceNo: {
              in: references,
            },
          },
          select: {
            leadID: true,
            loanNo: true,
            disbursalRefrenceNo: true,
          },
        });

      const referenceMap = new Map(
        existingReferences
          .filter(
            (loan) =>
              loan.disbursalRefrenceNo,
          )
          .map((loan) => [
            loan.disbursalRefrenceNo!
              .toLowerCase(),
            loan,
          ]),
      );

      for (const row of rows) {
        const existingLoan =
          referenceMap.get(
            row.disbursalRefrenceNo.toLowerCase(),
          );

        if (
          existingLoan &&
          String(existingLoan.loanNo).trim() !==
          String(row.loanNo).trim()
        ) {
          errors.push({
            row: row.rowNumber,
            loanNo: row.loanNo,
            field: 'Disbursal Reference No',
            message:
              `Reference number already exists against Loan Number ${existingLoan.loanNo}`,
          });
        }
      }

      /**
       * ============================================================
       * 14. EMANDATE VALIDATION
       * ============================================================
       */

      if (!isAllowedDomain) {
        const leadsRequiringMandate =
          rows
            .map((row) =>
              leadMap.get(
                String(row.loanNo).trim(),
              ),
            )
            .filter(
              (lead) =>
                lead && !lead.emandatebypass,
            );

        const mandateLeadIds =
          leadsRequiringMandate.map(
            (lead: any) =>
              Number(lead.leadID),
          );

        if (mandateLeadIds.length) {
          const mandateConfig =
            EMANDATE_CONFIG[domain] || {
              enable: false,
              provider: 'none',
            };

          /**
           * ========================================================
           * Razorpay
           * ========================================================
           */

          if (
            mandateConfig.provider ===
            'razorpay'
          ) {
            const emandates =
              await this.tenantPrisma.client.emandates.findMany(
                {
                  where: {
                    leadID: {
                      in: mandateLeadIds.map(
                        String,
                      ),
                    },
                    token_id: {
                      not: null,
                    },
                  },
                  select: {
                    leadID: true,
                    token_id: true,
                  },
                },
              );

            const mandateDoneSet =
              new Set<number>(
                emandates
                  .filter(
                    (item) =>
                      !!item.token_id,
                  )
                  .map((item) =>
                    Number(item.leadID),
                  ),
              );

            for (const row of rows) {
              const lead =
                leadMap.get(
                  String(row.loanNo).trim(),
                );

              if (
                !lead ||
                lead.emandatebypass
              ) {
                continue;
              }

              if (
                !mandateDoneSet.has(
                  Number(lead.leadID),
                )
              ) {
                errors.push({
                  row: row.rowNumber,
                  loanNo: row.loanNo,
                  field: 'eMandate',
                  message:
                    'Razorpay eMandate is not completed',
                });
              }
            }
          }

          /**
           * ========================================================
           * EaseBuzz
           * ========================================================
           */

          else if (
            mandateConfig.provider ===
            'easeBuzz'
          ) {
            const mandates =
              await this.tenantPrisma.client.easebuzz_emandates.findMany(
                {
                  where: {
                    leadID: {
                      in: mandateLeadIds,
                    },
                  },
                  select: {
                    leadID: true,
                    status: true,
                    sub_status: true,
                  },
                },
              );

            const mandateDoneSet =
              new Set<number>();

            mandates.forEach(
              (emandate) => {
                const done =
                  emandate.status ===
                  'authorized' ||
                  (
                    emandate.status ===
                    'initiated' &&
                    emandate.sub_status ===
                    'accepted'
                  );

                if (done) {
                  mandateDoneSet.add(
                    Number(
                      emandate.leadID,
                    ),
                  );
                }
              },
            );

            for (const row of rows) {
              const lead =
                leadMap.get(
                  String(row.loanNo).trim(),
                );

              if (
                !lead ||
                lead.emandatebypass
              ) {
                continue;
              }

              if (
                !mandateDoneSet.has(
                  Number(lead.leadID),
                )
              ) {
                errors.push({
                  row: row.rowNumber,
                  loanNo: row.loanNo,
                  field: 'eMandate',
                  message:
                    'EaseBuzz eMandate is not completed',
                });
              }
            }
          }

          /**
           * ========================================================
           * No mandate provider
           * ========================================================
           */

          else {
            for (const row of rows) {
              const lead =
                leadMap.get(
                  String(row.loanNo).trim(),
                );

              if (
                !lead ||
                lead.emandatebypass
              ) {
                continue;
              }

              errors.push({
                row: row.rowNumber,
                loanNo: row.loanNo,
                field: 'eMandate',
                message:
                  `eMandate provider is not configured for ${domain}`,
              });
            }
          }
        }
      }

      /**
       * ============================================================
       * 15. STOP IF ANY VALIDATION FAILED
       * ============================================================
       */

      if (errors.length) {
        return {
          success: false,
          statusCode: 400,
          message:
            'Bulk disbursal validation failed. No records were updated.',
          totalRecords: rows.length,
          totalErrors: errors.length,
          errors,
        };
      }

      /**
       * ============================================================
       * 16. GET LOGGED-IN USER
       * ============================================================
       */

      const userData =
        await this.clsService.get('user');

      const userId = Number(userData);

      if (!userId) {
        return {
          success: false,
          statusCode: 401,
          message:
            'Unable to identify logged-in user',
        };
      }

      /**
       * ============================================================
       * 17. DATABASE TRANSACTION
       * ============================================================
       */

      const transactionResult =
        await this.tenantPrisma.client.$transaction(
          async (tx) => {
            /**
             * ========================================================
             * Update loans
             * ========================================================
             */

            for (const row of rows) {
              /**
               * IMPORTANT:
               * Find lead using loanNo.
               */

              const lead =
                leadMap.get(
                  String(row.loanNo).trim(),
                );

              if (!lead) {
                throw new Error(
                  `Loan ${row.loanNo} not found`,
                );
              }

              const updatedLoan =
                await tx.loan.updateMany({
                  where: {
                    id: Number(
                      lead.loan.id,
                    ),

                    status: {
                      not: 'Disbursed',
                    },
                  },

                  data: {
                    disbursalRefrenceNo:
                      row.disbursalRefrenceNo,

                    disbursalDate:
                      row.disbursalDate,

                    remarks:
                      row.remarks,

                    status:
                      'Disbursed',

                    disbursedBy:
                      userId,

                    disbursalTime:
                      new Date(),
                  },
                });

              /**
               * Protect against concurrent
               * disbursal requests.
               */

              if (
                updatedLoan.count !== 1
              ) {
                throw new Error(
                  `Loan ${row.loanNo} was already updated/disbursed by another request`,
                );
              }
            }

            /**
             * ========================================================
             * Update all leads
             * ========================================================
             */

            await tx.leads.updateMany({
              where: {
                leadID: {
                  in: leadIds,
                },
              },

              data: {
                status: 'Disbursed',
              },
            });

            /**
             * ========================================================
             * Create call history
             * ========================================================
             */

            await tx.callhistorylogs.createMany({
              data: rows.map((row) => {
                /**
                 * Again resolve using loanNo.
                 */

                const lead =
                  leadMap.get(
                    String(
                      row.loanNo,
                    ).trim(),
                  );

                if (!lead) {
                  throw new Error(
                    `Lead not found for Loan Number ${row.loanNo}`,
                  );
                }

                return {
                  customerID:
                    Number(
                      lead.customerID,
                    ),

                  leadID:
                    Number(
                      lead.leadID,
                    ),

                  callType: 'IVR',

                  status:
                    'Disbursed',

                  remark:
                    row.remarks,

                  calledBy:
                    userId,

                  noteli:
                    row.remarks,
                };
              }),
            });

            return {
              success: true,
            };
          },
          {
            maxWait: 10000,
            timeout: 120000,
          },
        );

      /**
       * ============================================================
       * 18. SEND DISBURSAL LETTER
       * ============================================================
       */

      if (transactionResult.success) {
        const mailResults: Array<{
          leadId: number;
          sent: boolean;
          message?: string;
        }> = [];

        const MAIL_BATCH_SIZE = 10;

        for (
          let index = 0;
          index < rows.length;
          index += MAIL_BATCH_SIZE
        ) {
          const batch =
            rows.slice(
              index,
              index + MAIL_BATCH_SIZE,
            );

          const batchResults =
            await Promise.all(
              batch.map(
                async (row) => {
                  /**
                   * Find lead by loanNo.
                   */

                  const lead =
                    leadMap.get(
                      String(
                        row.loanNo,
                      ).trim(),
                    );

                  if (!lead) {
                    return {
                      leadId:
                        Number(
                          row.leadId,
                        ),
                      sent: false,
                      message:
                        `Lead not found for Loan Number ${row.loanNo}`,
                    };
                  }

                  return this.sendDisbursalLetter(
                    lead,
                    userId,
                  );
                },
              ),
            );

          mailResults.push(
            ...batchResults,
          );
        }

        const sentMails =
          mailResults.filter(
            (result) =>
              result.sent,
          ).length;

        const failedMails =
          mailResults.filter(
            (result) =>
              !result.sent,
          );

        /**
         * ==========================================================
         * RESPONSE
         * ==========================================================
         */

        return {
          success: true,
          statusCode: 200,
          message:
            'Bulk disbursal updated successfully',

          totalRecords:
            rows.length,

          updatedRecords:
            rows.length,

          failedRecords: 0,

          sentMails,

          failedMails:
            failedMails.length,

          mailErrors:
            failedMails,

          data: rows.map(
            (row) => ({
              row:
                row.rowNumber,

              loanNo:
                row.loanNo,

              disbursalReferenceNo:
                row.disbursalRefrenceNo,

              disbursalDate:
                row.disbursalDate,

              status:
                'Disbursed',
            }),
          ),
        };
      }

      return {
        success: false,
        statusCode: 500,
        message:
          'Unable to update disbursal records',
      };
    } catch (error: any) {
      console.error(
        'Bulk Disbursal Upload Error:',
        error,
      );

      return {
        success: false,
        statusCode: 500,
        message:
          error?.message ||
          'Bulk disbursal upload failed',
      };
    }
  }

  async downloadBulkDisbursalTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Bulk Disbursal');

    worksheet.columns = [
      { header: 'Loan Number', key: 'loanNo', width: 15 },
      {
        header: 'Disbursal Reference No',
        key: 'disbursalReferenceNo',
        width: 30,
      },
      { header: 'Disbursal Date', key: 'disbursalDate', width: 20 },
      { header: 'Remarks', key: 'remarks', width: 40 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 22;
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = 'A1:D1';

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async sendDisbursalLetter(
    lead: any,
    userId: number,
  ): Promise<{ leadId: number; sent: boolean; message?: string }> {
    const leadId = Number(lead?.leadID);

    try {
      const approval = lead?.approvals?.[0];
      const email = lead?.customer?.email?.trim();

      if (!email) {
        return { leadId, sent: false, message: 'Customer email is missing' };
      }

      if (!approval) {
        return { leadId, sent: false, message: 'Approval record is missing' };
      }

      const approvedAmount = Number(approval.loanAmtApproved);
      const roi = Number(approval.roi);
      const tenure = Number(approval.tenure) || 0;
      const interestAmount = (approvedAmount * roi * tenure) / 100;

      const mailData = {
        SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
        name: lead.customer.name || lead.customer.firstName || '',
        loanNo: lead.loan.loanNo,
        disbursalAmount: approval.loanAmtApproved,
        roi: approval.roi,
        tenure: approval.tenure,
        repayment: approvedAmount + Math.round(interestAmount),
        COMPANY_NAME: process.env.COMPANY_NAME,
        SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
      };

      const emailRes = await this.MailService.sendCustomMail(
        email,
        `Disbursal Letter ${mailData.COMPANY_NAME}`,
        'credit',
        'disbursalLetter.hbs',
        mailData,
      );

      if (!emailRes?.status) {
        return {
          leadId,
          sent: false,
          message: emailRes?.message || 'Unable to send disbursal letter',
        };
      }

      await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.notifications.create({
          data: {
            customerID: Number(lead.customerID),
            leadID: leadId,
            sender_email: emailRes.sender_email,
            notification: emailRes.html,
            type: 'Email',
            subject: 'Disbursal Letter',
            senderUser: userId,
            createdDate: new Date(),
            mtype: 'crm',
          } as any,
        }),
        this.tenantPrisma.client.callhistorylogs.create({
          data: {
            customerID: Number(lead.customerID),
            leadID: leadId,
            callType: 'Mail',
            status: 'DisbursalLetter',
            remark: 'DisbursalLetter',
            calledBy: userId,
            noteli: 'DisbursalLetter',
          } as any,
        }),
      ]);

      return { leadId, sent: true };
    } catch (error: any) {
      console.error(`Disbursal letter mail failed for lead ${leadId}:`, error);
      return {
        leadId,
        sent: false,
        message: error?.message || 'Unable to send disbursal letter',
      };
    }
  }


  private getCellValue(
    cell: ExcelJS.Cell,
  ): string {
    if (
      cell.value === null ||
      cell.value === undefined
    ) {
      return '';
    }

    /**
     * Formula cells
     */
    if (
      typeof cell.value === 'object' &&
      'result' in cell.value
    ) {
      return String(
        cell.value.result ?? '',
      ).trim();
    }

    /**
     * Rich text cells
     */
    if (
      typeof cell.value === 'object' &&
      'richText' in cell.value
    ) {
      return cell.value.richText
        .map((item) => item.text)
        .join('')
        .trim();
    }

    return String(cell.value).trim();
  }

  /**
   * ==========================================
   * HELPER: PARSE EXCEL DATE
   * ==========================================
   *
   * Supports:
   *
   * Excel date
   * DD-MM-YYYY
   * DD/MM/YYYY
   * YYYY-MM-DD
   */

  private parseExcelDate(
    value: any,
  ): string | null {
    if (!value) {
      return null;
    }

    /**
     * ExcelJS normally converts date cells
     * into JavaScript Date objects.
     */
    if (value instanceof Date) {
      if (isNaN(value.getTime())) {
        return null;
      }

      return this.formatDateToYYYYMMDD(
        value,
      );
    }

    /**
     * Excel serial number fallback.
     */
    if (typeof value === 'number') {
      const excelEpoch =
        new Date(Date.UTC(1899, 11, 30));

      const milliseconds =
        value * 24 * 60 * 60 * 1000;

      const date = new Date(
        excelEpoch.getTime() +
        milliseconds,
      );

      return this.formatDateToYYYYMMDD(
        date,
      );
    }

    const stringValue = String(value).trim();

    /**
     * YYYY-MM-DD
     */
    let match = stringValue.match(
      /^(\d{4})-(\d{2})-(\d{2})$/,
    );

    if (match) {
      const [, year, month, day] =
        match;

      if (
        this.isValidDate(
          Number(year),
          Number(month),
          Number(day),
        )
      ) {
        return `${year}-${month}-${day}`;
      }

      return null;
    }

    /**
     * DD-MM-YYYY / DD/MM/YYYY
     */
    match = stringValue.match(
      /^(\d{2})[-/](\d{2})[-/](\d{4})$/,
    );

    if (match) {
      const [, day, month, year] =
        match;

      if (
        this.isValidDate(
          Number(year),
          Number(month),
          Number(day),
        )
      ) {
        return `${year}-${month}-${day}`;
      }

      return null;
    }

    return null;
  }

  /**
   * ==========================================
   * HELPER: VALID DATE
   * ==========================================
   */

  private isValidDate(
    year: number,
    month: number,
    day: number,
  ): boolean {
    const date = new Date(
      year,
      month - 1,
      day,
    );

    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }

  /**
   * ==========================================
   * HELPER: YYYY-MM-DD
   * ==========================================
   */

  private formatDateToYYYYMMDD(
    date: Date,
  ): string {
    const year = date.getFullYear();

    const month = String(
      date.getMonth() + 1,
    ).padStart(2, '0');

    const day = String(
      date.getDate(),
    ).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  /**
   * ==========================================
   * HELPER: FIND DUPLICATES
   * ==========================================
   */

  private findDuplicates<T>(
    values: T[],
  ): T[] {
    const seen = new Set<T>();
    const duplicate = new Set<T>();

    values.forEach((value) => {
      if (seen.has(value)) {
        duplicate.add(value);
      } else {
        seen.add(value);
      }
    });

    return [...duplicate];
  }
}
