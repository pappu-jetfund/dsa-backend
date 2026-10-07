import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import {
  dateOnlyToDateTimeRange,
  getComparisonDateRange,
  getDateRange,
  normalizeState,
  toLocalDateString,
} from '../../utility/helper';
import dayjs from 'dayjs';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';
import { RolesTypes } from '../../utility/enums';

@Injectable()
export class DashboardService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private configService: ConfigService,
    private readonly clsService: ClsService,
    private readonly authService: AuthService,
    private readonly MailService: MailService,
    private readonly smsService: SmsService,
  ) { }

  async dashboardOverview(
    period?,
    startDate?,
    endDate?,
    tabs: string = 'Overview',
    collectionView: string = 'collectionOverview',
    disbursalView: string = 'disbursalOverview',
    query?,
  ) {
    try {
      const userData = await this.clsService.get('user');

      const userRole = await this.authService.getUserById(userData);

      const resolvedTabs = tabs ?? 'Overview';
      const resolvedPeriod = period ?? 'today';

      if (userRole && userRole?.role !== 'Admin') {

        const data = await this.getUserTasks(userData, userRole, resolvedPeriod, startDate, endDate);
        return {
          success: false,
          statusCode: 403,
          message: 'Access denied. Admins only.',
        };
      }

      const { fromDate, toDate } = getDateRange(
        resolvedPeriod,
        startDate,
        endDate,
      );

      const dateFilter =
        fromDate && toDate
          ? {
            createdDate: {
              gte: fromDate,
              lte: toDate,
            },
          }
          : {};

      switch (resolvedTabs) {
        case 'Overview': {
          const [totalCustomers, totalLeads, leads] = await Promise.all([
            this.tenantPrisma.client.customer.count({ where: dateFilter }),
            this.tenantPrisma.client.leads.count({ where: dateFilter }),

            await this.tenantPrisma.client.leads.findMany({
              where: {
                ...dateFilter,
              },
              select: {
                status: true,
              },
            }),
          ]);

          const approvalCounts = {
            Approved_process: 0,
            Approved: 0,
            Document_Received: 0,
            Disbursed: 0,
            Rejected: 0,
            Rejected_Process: 0,
            Closed: 0,
            Not_Required: 0,
            Disbursal_Sheet_Send: 0,
            Settlement: 0,
          };
          const STATUS_MAP: Record<string, keyof typeof approvalCounts> = {
            'Approved Process': 'Approved_process',
            Approved_Process: 'Approved_process',
            Approved_process: 'Approved_process',

            Approved: 'Approved',
            Disbursed: 'Disbursed',

            Rejected: 'Rejected',
            rejected: 'Rejected',
            Rejected_Process: 'Rejected_Process',
            'Rejected Process': 'Rejected_Process',
            Document_Received: 'Document_Received',

            Closed: 'Closed',

            Not_Required: 'Not_Required',
            Disbursal_Sheet_Send: 'Disbursal_Sheet_Send',
            Settlement: 'Settlement',
          };

          for (const lead of leads) {
            const normalizedStatus = STATUS_MAP[lead.status];
            if (!normalizedStatus) continue;

            approvalCounts[normalizedStatus]++;
          }

          return {
            success: true,
            period: resolvedPeriod,
            tab: resolvedTabs,
            dateRange: { fromDate, toDate },
            data: {
              totalCustomers,
              totalLeads,
              approvals: approvalCounts,
            },
          };
        }
        case 'leads': {
          const sourceCounts = await this.tenantPrisma.client.leads.groupBy({
            by: ['utmSource'],
            where: dateFilter,
            _count: { _all: true },
          });

          const currentTotal = sourceCounts.reduce(
            (sum, s) => sum + s._count._all,
            0,
          );

          const { prevFromDate, prevToDate } = getComparisonDateRange(
            resolvedPeriod,
            fromDate,
            toDate,
          );

          let previousTotal = 0;

          if (prevFromDate && prevToDate) {
            previousTotal = await this.tenantPrisma.client.leads.count({
              where: {
                createdDate: {
                  gte: prevFromDate,
                  lte: prevToDate,
                },
              },
            });
          }

          let percentageChange = 0;

          if (previousTotal === 0 && currentTotal > 0) {
            percentageChange = 100;
          } else if (previousTotal > 0) {
            percentageChange =
              ((currentTotal - previousTotal) / previousTotal) * 100;
          }

          const sources = sourceCounts.map((g) => ({
            source: g.utmSource ?? 'Unknown',
            total: g._count._all,
          }));

          const fbLeadCounts = await this.tenantPrisma.client.leads.groupBy({
            by: ['fbLeads'],
            where: {
              ...dateFilter,
            },
            _count: { _all: true },
          });

          const fbLeads = {
            newCase: 0,
            repeatCase: 0,
          };

          for (const row of fbLeadCounts) {
            if (row.fbLeads === 'New Case') {
              fbLeads.newCase += row._count._all;
            }
            if (row.fbLeads === 'Repeat Case') {
              fbLeads.repeatCase += row._count._all;
            }
          }

          const caseWise = fbLeadCounts.map((g) => ({
            source: g.fbLeads ?? 'Unknown',
            total: g._count._all,
          }));

          return {
            success: true,
            period: resolvedPeriod,
            tab: resolvedTabs,
            dateRange: { fromDate, toDate },
            comparison: {
              previousRange: { fromDate: prevFromDate, toDate: prevToDate },
              currentTotal,
              previousTotal,
              percentageChange: Number(percentageChange.toFixed(2)),
              trend:
                percentageChange > 0
                  ? 'UP'
                  : percentageChange < 0
                    ? 'DOWN'
                    : 'NO_CHANGE',
            },
            data: { sources, caseWise },
          };
        }
        case 'disbursement': {
          const { prevFromDate, prevToDate } = getComparisonDateRange(
            resolvedPeriod,
            fromDate,
            toDate,
          );

          const disbursalFrom =
            resolvedPeriod === 'customrange'
              ? startDate
              : toLocalDateString(fromDate);

          const disbursalTo =
            resolvedPeriod === 'customrange'
              ? endDate
              : toLocalDateString(toDate);

          const disbursalDateFilter =
            disbursalFrom || disbursalTo
              ? {
                disbursalDate: {
                  ...(disbursalFrom && { gte: disbursalFrom }),
                  ...(disbursalTo && { lte: disbursalTo }),
                },
              }
              : {};

          switch (disbursalView) {
            case 'disbursalOverview': {
              const [
                createdAgg,
                disbursedAgg,
                pendingAgg,
                disbursedLoans,
                prevCreatedCount,
                prevDisbursedCount,
              ] = await Promise.all([
                // Total created
                this.tenantPrisma.client.loan.aggregate({
                  where: dateFilter,
                  _sum: {
                    disbursalAmount: true,
                    deduction: true,
                  },
                  _count: { _all: true },
                }),

                //total disbursed
                this.tenantPrisma.client.loan.aggregate({
                  where: {
                    status: 'Disbursed',
                    ...disbursalDateFilter,
                  },
                  _sum: {
                    disbursalAmount: true,
                    deduction: true,
                  },
                  _count: { _all: true },
                }),

                //total pending
                this.tenantPrisma.client.loan.aggregate({
                  where: {
                    status: { not: 'Disbursed' },
                    ...dateFilter,
                  },
                  _sum: {
                    disbursalAmount: true,
                    deduction: true,
                  },
                  _count: { _all: true },
                }),

                //case wise
                this.tenantPrisma.client.loan.findMany({
                  where: {
                    status: 'Disbursed',
                    ...disbursalDateFilter,
                  },
                  select: {
                    lead: {
                      select: {
                        fbLeads: true,
                      },
                    },
                  },
                }),

                // Previous created
                prevFromDate && prevToDate
                  ? this.tenantPrisma.client.loan.count({
                    where: {
                      createdDate: {
                        gte: prevFromDate,
                        lte: prevToDate,
                      },
                    },
                  })
                  : 0,

                prevFromDate && prevToDate
                  ? this.tenantPrisma.client.loan.count({
                    where: {
                      status: 'Disbursed',
                      createdDate: {
                        gte: prevFromDate,
                        lte: prevToDate,
                      },
                    },
                  })
                  : 0,
              ]);

              const disbursedCases = {
                newCase: 0,
                repeatCase: 0,
              };

              for (const loan of disbursedLoans) {
                if (loan.lead?.fbLeads === 'New Case') {
                  disbursedCases.newCase++;
                } else if (loan.lead?.fbLeads === 'Repeat Case') {
                  disbursedCases.repeatCase++;
                }
              }

              const currentConversion =
                createdAgg._count._all > 0
                  ? Number(
                    (
                      (disbursedAgg._count._all / createdAgg._count._all) *
                      100
                    ).toFixed(2),
                  )
                  : 0;

              const previousConversion =
                prevCreatedCount > 0
                  ? Number(
                    ((prevDisbursedCount / prevCreatedCount) * 100).toFixed(
                      2,
                    ),
                  )
                  : 0;

              return {
                success: true,
                period: resolvedPeriod,
                tab: resolvedTabs,
                utcRange: { fromDate, toDate },

                data: {
                  total: {
                    total_disbursal_amount:
                      createdAgg._sum.disbursalAmount ?? 0,
                    total_deduction: createdAgg._sum.deduction ?? 0,
                    total_count: createdAgg._count._all ?? 0,
                  },
                  disbursed: {
                    total_disbursal_amount:
                      disbursedAgg._sum.disbursalAmount ?? 0,
                    total_deduction: disbursedAgg._sum.deduction ?? 0,
                    total_count: disbursedAgg._count._all ?? 0,
                  },

                  pending: {
                    total_disbursal_amount:
                      pendingAgg._sum.disbursalAmount ?? 0,
                    total_deduction: pendingAgg._sum.deduction ?? 0,
                    total_count: pendingAgg._count._all ?? 0,
                  },

                  disbursedCases,

                  conversion: {
                    current: currentConversion + '%',
                    previous: previousConversion + '%',
                  },
                },
              };
            }

            case 'bylocation': {
              const disbursedLoans =
                await this.tenantPrisma.client.loan.findMany({
                  where: {
                    status: 'Disbursed',
                    ...disbursalDateFilter,
                  },
                  select: {
                    disbursalAmount: true,
                    deduction: true,
                    lead: {
                      select: {
                        state: true,
                      },
                    },
                  },
                });

              if (!disbursedLoans.length) {
                return {
                  success: true,
                  period: resolvedPeriod,
                  tab: resolvedTabs,
                  view: 'byLocation',
                  utcRange: { fromDate, toDate },
                  data: [],
                };
              }

              const stateWise: Record<
                string,
                {
                  totalCases: number;
                  totalDisbursal: number;
                  totalDeduction: number;
                  netDisbursal: number;
                }
              > = {};

              for (const loan of disbursedLoans) {
                const rawState: any = loan.lead?.state;
                const state = normalizeState(rawState);

                const amount = loan.disbursalAmount ?? 0;
                const deduction = loan.deduction ?? 0;
                const net = amount - deduction;

                if (!stateWise[state]) {
                  stateWise[state] = {
                    totalCases: 0,
                    totalDisbursal: 0,
                    totalDeduction: 0,
                    netDisbursal: 0,
                  };
                }

                stateWise[state].totalCases += 1;
                stateWise[state].totalDisbursal += amount;
                stateWise[state].totalDeduction += deduction;
                stateWise[state].netDisbursal += net;
              }

              const result = Object.entries(stateWise).map(([state, v]) => ({
                state,
                totalCases: v.totalCases,
                totalDisbursal: Number(v.totalDisbursal.toFixed(2)),
                totalDeduction: Number(v.totalDeduction.toFixed(2)),
                netDisbursal: Number(v.netDisbursal.toFixed(2)),
              }));

              return {
                success: true,
                period: resolvedPeriod,
                tab: resolvedTabs,
                view: 'byLocation',
                utcRange: { fromDate, toDate },
                data: result,
              };
            }

            // case'by'
          }
        }

        case 'collection': {
          const repayFrom = toLocalDateString(fromDate);
          const repayTo = toLocalDateString(toDate);

          const repayDateFilter =
            repayFrom || repayTo
              ? {
                repayDate: {
                  ...(repayFrom && dateOnlyToDateTimeRange(repayFrom)),
                  ...(repayTo && {
                    lte: new Date(`${repayTo}T23:59:59.999Z`),
                  }),
                },
              }
              : {};

          console.log(repayDateFilter, "repayDateFilter");


          switch (collectionView) {
            case 'collectionOverview': {
              const disbursedLoans =
                await this.tenantPrisma.client.loan.findMany({
                  where: {
                    status: 'Disbursed',
                  },
                  select: {
                    leadID: true,
                  },
                });

              const disbursedLeadIds = disbursedLoans.map((l) => l.leadID);

              // console.log(disbursedLeadIds.length, "ddfdd");


              /** 1️⃣ FETCH APPROVED LOANS */
              const approvals =
                await this.tenantPrisma.client.approval.findMany({
                  where: {
                    ...repayDateFilter,
                    status: 'Approved',
                    leadID: {
                      in: disbursedLeadIds,
                    },
                  },
                  select: {
                    leadID: true,
                    loanAmtApproved: true,
                    tenure: true, // months
                    roi: true, // annual %
                  },
                });

              console.log(approvals.length, "approvals count");


              let totalPrincipal = 0;
              let totalInterest = 0;

              /** Store per-loan due map */
              const loanDueMap = new Map<
                number,
                { principal: number; interest: number }
              >();

              for (const loan of approvals) {
                const principal = loan.loanAmtApproved ?? 0;
                const tenureMonths = loan.tenure ?? 0;
                const roi = loan.roi ?? 0;

                const interest = (principal * roi * tenureMonths) / 100;

                totalPrincipal += principal;
                totalInterest += interest;

                loanDueMap.set(loan.leadID, { principal, interest });
              }

              const totalAmount = totalPrincipal + totalInterest;

              /** 2️⃣ FETCH COLLECTION (AMOUNT ONLY) */
              const collections =
                await this.tenantPrisma.client.collection.groupBy({
                  by: ['leadID'],
                  where: {
                    leadID: { in: approvals.map((a) => a.leadID) },
                    collectionStatus: 'Approved',
                  },
                  _sum: {
                    collectedAmount: true,
                  },
                });


              console.log(collections.length);





              let receivedPrincipal = 0;
              let receivedInterest = 0;

              for (const row of collections) {
                const collected = row._sum.collectedAmount ?? 0;
                const due = loanDueMap.get(row.leadID);

                if (!due) continue;

                /** Interest-first adjustment */
                const interestCollected = Math.min(collected, due.interest);
                const principalCollected = Math.max(
                  collected - interestCollected,
                  0,
                );

                receivedInterest += interestCollected;
                receivedPrincipal += principalCollected;
              }

              const receivedAmount = receivedPrincipal + receivedInterest;

              /** 3️⃣ COLLECTION EFFICIENCY */
              const collectionEfficiency = {
                loans_percentage:
                  approvals.length > 0
                    ? Number(
                      ((collections.length / approvals.length) * 100).toFixed(
                        2,
                      ),
                    )
                    : 0,

                principal_percentage:
                  totalPrincipal > 0
                    ? Number(
                      ((receivedPrincipal / totalPrincipal) * 100).toFixed(2),
                    )
                    : 0,

                interest_percentage:
                  totalInterest > 0
                    ? Number(
                      ((receivedInterest / totalInterest) * 100).toFixed(2),
                    )
                    : 0,

                amount_percentage:
                  totalAmount > 0
                    ? Number(((receivedAmount / totalAmount) * 100).toFixed(2))
                    : 0,
              };

              return {
                success: true,
                period: resolvedPeriod,
                tab: resolvedTabs,
                subtab: collectionView,
                dateRange: { fromDate, toDate },

                data: {
                  collectionDue: {
                    total_loans: approvals.length,
                    total_principal: Number(totalPrincipal.toFixed(2)),
                    total_interest: Number(totalInterest.toFixed(2)),
                    total_amount: Number(totalAmount.toFixed(2)),
                  },

                  collectionReceived: {
                    total_loans: collections.length,
                    total_principal: Number(receivedPrincipal.toFixed(2)),
                    total_interest: Number(receivedInterest.toFixed(2)),
                    total_amount: Number(receivedAmount.toFixed(2)),
                  },

                  collectionEfficiency,
                },
              };
            }

            case 'aumAnalysis': {
              const DPD_BUCKETS = [
                {
                  key: 'COMING',
                  label: 'Coming Case',
                  min: -Infinity,
                  max: -1,
                },
                {
                  key: 'RUNNING',
                  label: 'Running Case',
                  min: 0,
                  max: 0,
                },
                { key: '1_30', label: '1 To 30', min: 1, max: 30 },
                { key: '31_60', label: '31 - 60', min: 31, max: 60 },
                { key: '61_90', label: '61 - 90', min: 61, max: 90 },
                { key: '90_PLUS', label: '90+', min: 91, max: Infinity },
                // { key: '121_180', label: '121 - 180', min: 121, max: 180 },
                // { key: '180_PLUS', label: '180+', min: 181, max: Infinity },
              ];

              const today = new Date();

              const disbursedLeads =
                await this.tenantPrisma.client.loan.findMany({
                  where: {
                    status: 'Disbursed',
                    lead: {
                      status: {
                        in: ['Disbursed', 'Part_Payment'],
                      },
                    },
                  },
                  select: { leadID: true },
                });

              if (disbursedLeads.length === 0) {
                return {
                  success: true,
                  view: 'aumAnalysis',
                  data: [],
                };
              }

              const disbursedLeadIds = disbursedLeads.map((l) => l.leadID);

              const approvals =
                await this.tenantPrisma.client.approval.findMany({
                  where: {
                    status: 'Approved',
                    leadID: { in: disbursedLeadIds },
                  },
                  select: {
                    leadID: true,
                    loanAmtApproved: true,
                    tenure: true,
                    roi: true,
                    repayDate: true,
                  },
                });

              /** 2️⃣ Fetch collections till today */
              const collections =
                await this.tenantPrisma.client.collection.groupBy({
                  by: ['leadID'],
                  where: {
                    collectionStatus: 'Approved',
                    leadID: { in: disbursedLeadIds },
                    collectedDate: { lte: today },
                  },
                  _sum: {
                    collectedAmount: true,
                  },
                });

              const collectionMap = new Map<number, number>();
              for (const c of collections) {
                collectionMap.set(c.leadID, c._sum.collectedAmount ?? 0);
              }

              const todayMs = today.getTime();
              const DAY_MS = 1000 * 60 * 60 * 24;

              const bucketData = Object.fromEntries(
                DPD_BUCKETS.map((b) => [
                  b.key,
                  {
                    label: b.label,
                    totalCases: 0,
                    loanAmount: 0,
                    obligation: 0,
                    collected: 0,
                    outstanding: 0,
                  },
                ]),
              );

              for (const a of approvals) {
                const principal = a.loanAmtApproved ?? 0;
                const tenure = a.tenure ?? 0;
                const roi = a.roi ?? 0;

                const interest = (principal * roi * tenure) / 100;
                const obligation = principal + interest;

                const collected = collectionMap.get(a.leadID) ?? 0;
                const outstanding = obligation - collected;

                const dpd = Math.floor(
                  (today.getTime() - new Date(a.repayDate).getTime()) /
                  (1000 * 60 * 60 * 24),
                );

                const bucket = DPD_BUCKETS.find(
                  (b) => dpd >= b.min && dpd <= b.max,
                );

                if (!bucket) continue;

                const target = bucketData[bucket.key];

                target.totalCases++;
                target.loanAmount += principal;
                target.obligation += obligation;
                target.collected += collected;
                target.outstanding += outstanding;
              }

              let grand = {
                totalCases: 0,
                loanAmount: 0,
                obligation: 0,
                collected: 0,
                outstanding: 0,
              };

              const rows = Object.values(bucketData).map((b) => {
                const rate =
                  b.obligation > 0
                    ? Number(((b.collected / b.obligation) * 100).toFixed(2))
                    : 0;

                grand.totalCases += b.totalCases;
                grand.loanAmount += b.loanAmount;
                grand.obligation += b.obligation;
                grand.collected += b.collected;
                grand.outstanding += b.outstanding;

                return {
                  dpdRange: b.label,
                  totalCases: b.totalCases,
                  loanAmount: Math.round(b.loanAmount),
                  obligation: Math.round(b.obligation),
                  collected: Math.round(b.collected),
                  outstanding: Math.round(b.outstanding),
                  collectionRate: rate + '%',
                };
              });

              rows.push({
                dpdRange: 'Grand Total',
                totalCases: grand.totalCases,
                loanAmount: Math.round(grand.loanAmount),
                obligation: Math.round(grand.obligation),
                collected: Math.round(grand.collected),
                outstanding: Math.round(grand.outstanding),
                collectionRate:
                  grand.obligation > 0
                    ? Number(
                      ((grand.collected / grand.obligation) * 100).toFixed(2),
                    ) + '%'
                    : '0%',
              });

              return {
                success: true,
                tab: 'collection',
                view: 'aumAnalysis',
                asOnDate: today,
                data: rows,
              };
            }

            case 'byStatus': {
              const page = Number(query ?? 1);
              const pageSize = Number(query?.pageSize ?? 10);

              const disbursedLoans =
                await this.tenantPrisma.client.loan.findMany({
                  where: { status: 'Disbursed' },
                  select: {
                    loanNo: true,
                    leadID: true,
                    disbursalDate: true,
                  },
                });

              if (!disbursedLoans.length) {
                return {
                  success: true,
                  view: 'byStatus',
                  data: {},
                };
              }

              const disbursedLeadIds: number[] = [];
              const loanIdMap = new Map<number, string | number>();
              const disbursalDateMap = new Map<number, Date>();

              for (const l of disbursedLoans) {
                disbursedLeadIds.push(l.leadID);
                loanIdMap.set(l.leadID, l.loanNo);
                if (l.disbursalDate) {
                  disbursalDateMap.set(l.leadID, new Date(l.disbursalDate));
                }
              }

              const approvals =
                await this.tenantPrisma.client.approval.findMany({
                  where: {
                    status: 'Approved',
                    leadID: { in: disbursedLeadIds },
                    ...repayDateFilter,
                  },
                  select: {
                    leadID: true,
                    repayDate: true,
                    loanAmtApproved: true,
                    tenure: true,
                    roi: true,
                  },
                });

              if (!approvals.length) {
                return {
                  success: true,
                  view: 'byStatus',
                  data: {},
                };
              }

              const approvalLeadIds = approvals.map((a) => a.leadID);

              const collections =
                await this.tenantPrisma.client.collection.findMany({
                  where: {
                    leadID: { in: approvalLeadIds },
                    collectionStatus: 'Approved',
                  },
                  select: {
                    leadID: true,
                    collectedAmount: true,
                    collectedDate: true,
                  },
                });

              const collectionAggMap = new Map<
                number,
                { totalCollected: number; earliestPaymentDate?: Date }
              >();

              for (const c of collections) {
                const existing = collectionAggMap.get(c.leadID);

                if (!existing) {
                  collectionAggMap.set(c.leadID, {
                    totalCollected: c.collectedAmount ?? 0,
                    earliestPaymentDate: c.collectedDate,
                  });
                } else {
                  existing.totalCollected += c.collectedAmount ?? 0;
                  if (
                    c.collectedDate &&
                    existing.earliestPaymentDate &&
                    c.collectedDate < existing.earliestPaymentDate
                  ) {
                    existing.earliestPaymentDate = c.collectedDate;
                  }
                }
              }

              const leads = await this.tenantPrisma.client.leads.findMany({
                where: { leadID: { in: approvalLeadIds } },
                select: {
                  leadID: true,
                  status: true,
                  customer: { select: { name: true } },
                },
              });

              const leadMetaMap = new Map<
                number,
                { status: string; customerName: string }
              >();

              for (const l of leads) {
                leadMetaMap.set(l.leadID, {
                  status: l.status ?? 'Unknown',
                  customerName: l.customer?.name ?? 'Unknown',
                });
              }

              const MS_PER_DAY = 1000 * 60 * 60 * 24;

              function diffDaysInclusive(from: Date, to: Date): number {
                // normalize to midnight to avoid time drift
                const start = new Date(
                  from.getFullYear(),
                  from.getMonth(),
                  from.getDate(),
                );

                const end = new Date(
                  to.getFullYear(),
                  to.getMonth(),
                  to.getDate(),
                );

                return Math.max(
                  Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) +
                  1,
                  1,
                );
              }

              const statusWiseData: Record<string, any[]> = {};
              const statusTotals: Record<string, number> = {};

              for (const a of approvals) {
                const meta = leadMetaMap.get(a.leadID);
                if (!meta) continue;

                const principal = a.loanAmtApproved ?? 0;
                const roiPerDay = a.roi ?? 0;

                const disbursalDate = disbursalDateMap.get(a.leadID);
                if (!disbursalDate) continue; // ❗ Cannot compute interest

                const repayDate = a.repayDate ? new Date(a.repayDate) : null;

                const collectionAgg = collectionAggMap.get(a.leadID);
                const collected = collectionAgg?.totalCollected ?? 0;
                const paymentDate = collectionAgg?.earliestPaymentDate
                  ? new Date(collectionAgg.earliestPaymentDate)
                  : null;

                let bucketStatus = meta.status;
                let interestDays = 0;

                const isPreClosure =
                  meta.status === 'Closed' &&
                  paymentDate &&
                  repayDate &&
                  paymentDate < repayDate;

                if (isPreClosure) {
                  bucketStatus = 'Pre-Closure';
                  interestDays = diffDaysInclusive(disbursalDate, paymentDate);
                } else if (meta.status === 'Closed' && repayDate) {
                  interestDays = diffDaysInclusive(disbursalDate, repayDate);
                } else {
                  interestDays = diffDaysInclusive(disbursalDate, new Date());
                }

                const interest = (principal * roiPerDay * interestDays) / 100;

                const obligation = principal + interest;

                const outstanding =
                  bucketStatus === 'Pre-Closure'
                    ? Math.max(obligation - collected)
                    : Math.max(obligation - collected);

                if (!statusWiseData[bucketStatus]) {
                  statusWiseData[bucketStatus] = [];
                  statusTotals[bucketStatus] = 0;
                }

                statusTotals[bucketStatus] += collected;

                statusWiseData[bucketStatus].push({
                  loanId: loanIdMap.get(a.leadID),
                  leadId: a.leadID,
                  customerName: meta.customerName,
                  disbursalDate,
                  dueDate: a.repayDate,
                  status: bucketStatus,

                  interestDays,
                  principal,
                  interest,
                  obligation,
                  collected,
                  outstanding,
                });
              }

              const paginatedResult: Record<string, any> = {};

              for (const status of Object.keys(statusWiseData)) {
                const totalRecords = statusWiseData[status].length;
                const start = (page - 1) * pageSize;
                const end = start + pageSize;

                paginatedResult[status] = {
                  totalRecords,
                  totalCollected: Number(statusTotals[status].toFixed(2)),
                  page,
                  pageSize,
                  totalPages: Math.ceil(totalRecords / pageSize),
                  data: statusWiseData[status].slice(start, end),
                };
              }

              return {
                success: true,
                tab: 'collection',
                view: 'byStatus',
                dateRange: { fromDate, toDate },
                data: paginatedResult,
              };
            }

            case 'bylocation': {
              const disbursedLoans =
                await this.tenantPrisma.client.loan.findMany({
                  where: { status: 'Disbursed' },
                  select: {
                    leadID: true,
                  },
                });

              if (!disbursedLoans.length) {
                return {
                  success: true,
                  tab: 'collection',
                  view: 'byState',
                  data: [],
                };
              }

              const disbursedLeadIds = disbursedLoans.map((l) => l.leadID);

              const approvals =
                await this.tenantPrisma.client.approval.findMany({
                  where: {
                    status: 'Approved',
                    leadID: { in: disbursedLeadIds },
                    ...repayDateFilter,
                  },
                  select: {
                    leadID: true,
                    loanAmtApproved: true,
                    tenure: true,
                    roi: true,
                  },
                });

              if (!approvals.length) {
                return {
                  success: true,
                  tab: 'collection',
                  view: 'byState',
                  data: [],
                };
              }

              const approvalLeadIds = approvals.map((a) => a.leadID);

              const collections =
                await this.tenantPrisma.client.collection.groupBy({
                  by: ['leadID'],
                  where: {
                    leadID: { in: approvalLeadIds },
                    collectionStatus: 'Approved',
                  },
                  _sum: {
                    collectedAmount: true,
                  },
                });

              const collectionMap = new Map<number, number>();
              for (const c of collections) {
                collectionMap.set(c.leadID, c._sum.collectedAmount ?? 0);
              }

              const leads = await this.tenantPrisma.client.leads.findMany({
                where: {
                  leadID: { in: approvalLeadIds },
                },
                select: {
                  leadID: true,
                  state: true,
                },
              });

              const stateMap = new Map<number, string>();
              for (const l of leads) {
                stateMap.set(l.leadID, l.state ?? 'Unknown');
              }

              const stateWise: Record<
                string,
                {
                  totalCases: number;
                  principal: number;
                  obligation: number;
                  collected: number;
                  outstanding: number;
                }
              > = {};

              for (const a of approvals) {
                const rawState = stateMap.get(a.leadID);
                const state = normalizeState(rawState);

                const principal = a.loanAmtApproved ?? 0;
                const tenure = a.tenure ?? 0;
                const roi = a.roi ?? 0;

                const interest = (principal * roi * tenure) / 100;
                const obligation = principal + interest;

                const collected = collectionMap.get(a.leadID) ?? 0;
                const outstanding = Math.max(obligation - collected, 0);

                if (!stateWise[state]) {
                  stateWise[state] = {
                    totalCases: 0,
                    principal: 0,
                    obligation: 0,
                    collected: 0,
                    outstanding: 0,
                  };
                }

                stateWise[state].totalCases += 1;
                stateWise[state].principal += principal;
                stateWise[state].obligation += obligation;
                stateWise[state].collected += collected;
                stateWise[state].outstanding += outstanding;
              }

              const result = Object.entries(stateWise).map(([state, v]) => ({
                state,
                totalCases: v.totalCases,
                principal: Number(v.principal.toFixed(2)),
                obligation: Number(v.obligation.toFixed(2)),
                collected: Number(v.collected.toFixed(2)),
                outstanding: Number(v.outstanding.toFixed(2)),
                collectionPercentage:
                  v.obligation > 0
                    ? Number(((v.collected / v.obligation) * 100).toFixed(2))
                    : 0,
              }));

              return {
                success: true,
                tab: 'collection',
                view: 'byState',
                dateRange: { fromDate, toDate },
                data: result,
              };
            }

            case 'monthwiseAnalysis': {
              const approvals =
                await this.tenantPrisma.client.approval.findMany({
                  where: {
                    status: 'Approved',
                    // ...repayDateFilter, // already contains gte & lte for repayDate
                  },
                  include: {
                    lead: {
                      include: {
                        collections: true,
                      },
                    },
                  },
                });

              if (!approvals.length) {
                return {
                  success: true,
                  tab: 'collection',
                  view: 'monthwiseAnalysis',
                  dateRange: { fromDate, toDate },
                  data: [],
                };
              }

              const monthlyMap: Record<
                string,
                {
                  month: string;
                  monthDate: Date;
                  loanCount: number;
                  payableAmount: number;
                  earlyCollected: number;
                  onTimeCollected: number;
                  lateCollected: number;
                  collectedLoanCount: number;
                }
              > = {};

              for (const approval of approvals) {
                const repayDate = approval.repayDate;
                const monthKey = dayjs(repayDate).format('MMM YYYY');

                if (!monthlyMap[monthKey]) {
                  monthlyMap[monthKey] = {
                    month: monthKey,
                    monthDate: dayjs(repayDate).startOf('month').toDate(),
                    loanCount: 0,
                    payableAmount: 0,
                    earlyCollected: 0,
                    onTimeCollected: 0,
                    lateCollected: 0,
                    collectedLoanCount: 0,
                  };
                }

                const principal = approval.loanAmtApproved ?? 0;
                const tenure = approval.tenure ?? 0;
                const roi = approval.roi ?? 0;

                const interest = (principal * tenure * roi) / 100;
                const payable = principal + interest;

                monthlyMap[monthKey].loanCount += 1;
                monthlyMap[monthKey].payableAmount += payable;

                const validCollections = (
                  approval.lead?.collections || []
                ).filter(
                  (col) =>
                    col.collectionStatus === 'Approved' &&
                    ['Closed', 'Part_Payment', 'Settlement'].includes(
                      col.status,
                    ),
                );

                if (validCollections.length > 0) {
                  monthlyMap[monthKey].collectedLoanCount += 1;
                }

                for (const col of validCollections) {
                  const amount = col.collectedAmount ?? 0;

                  if (dayjs(col.collectedDate).isBefore(repayDate, 'day')) {
                    monthlyMap[monthKey].earlyCollected += amount;
                  } else if (
                    dayjs(col.collectedDate).isSame(repayDate, 'day')
                  ) {
                    monthlyMap[monthKey].onTimeCollected += amount;
                  } else {
                    monthlyMap[monthKey].lateCollected += amount;
                  }
                }
              }

              const result = Object.values(monthlyMap)
                .sort((a, b) => a.monthDate.getTime() - b.monthDate.getTime())
                .map((row) => {
                  const totalCollected =
                    row.earlyCollected +
                    row.onTimeCollected +
                    row.lateCollected;

                  const payable = row.payableAmount || 1;

                  return {
                    month: row.month,
                    loanCount: row.loanCount,
                    payableAmount: Number(row.payableAmount.toFixed(2)),
                    collectedLoanCount: row.collectedLoanCount,
                    earlyCollected: Number(row.earlyCollected.toFixed(2)),
                    onTimeCollected: Number(row.onTimeCollected.toFixed(2)),
                    lateCollected: Number(row.lateCollected.toFixed(2)),
                    totalCollected: Number(totalCollected.toFixed(2)),
                    earlyRecoveryPercentage: Number(
                      ((row.earlyCollected / payable) * 100).toFixed(2),
                    ),
                    onTimeRecoveryPercentage: Number(
                      ((row.onTimeCollected / payable) * 100).toFixed(2),
                    ),
                    lateRecoveryPercentage: Number(
                      ((row.lateCollected / payable) * 100).toFixed(2),
                    ),
                    overallRecoveryPercentage: Number(
                      ((totalCollected / payable) * 100).toFixed(2),
                    ),
                  };
                });

              return {
                success: true,
                tab: 'collection',
                view: 'monthwiseAnalysis',
                dateRange: { fromDate, toDate },
                data: result,
              };
            }
          }
        }

        default:
          return {
            success: false,
            message: 'Invalid tab',
          };
      }
    } catch (err: any) {

      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }


  async getUserTasks(userId: number, role: any, resolvedPeriod: any, startDate: any, endDate: any) {
    try {


      const { fromDate, toDate } = getDateRange(
        resolvedPeriod,
        startDate,
        endDate,
      );

      const where: any = {};

      const dateFilter =
        fromDate && toDate
          ? {
            createdDate: {
              gte: fromDate,
              lte: toDate,
            },
          }
          : {};




      switch (role) {
        case RolesTypes.CREDIT_HEAD: {

        }
        case RolesTypes.CREDIT_TEAM: {
          if (userId) {
            where.sanctionalloUID = Number(userId);
          }


          const whereWithDate = { ...where, ...dateFilter };

          const total = await this.tenantPrisma.client.leads.count({ where: whereWithDate });

          console.log(total, "total");

        }
      }


    } catch (err: any) {

      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }
}
