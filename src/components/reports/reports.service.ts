import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../auth/auth.service';
import { approval_status } from '@prisma/client';
import { normalize } from '../../utility/helper';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';
import * as XLSX from 'xlsx';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { log } from '@tensorflow/tfjs-node';

@Injectable()
export class ReportsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private configService: ConfigService,
    private readonly clsService: ClsService,
    private readonly authService: AuthService,
  ) { }

  async getallSanctionleadCount({ userID }) {
    try {
      const whereDate: any = {};

      const processStatuses = [
        'Approved_Process',
        'Rejected_Process',
        'Hold_Process',
        'Not_Required_Process',
      ];

      const sanctionStatuses = ['Approved', 'Rejected', 'Hold', 'Not_Required'];

      const processData = await Promise.all(
        processStatuses.map(async (status) => {
          const count = await this.tenantPrisma.client.leads.count({
            where: {
              ...whereDate,
              status,
              sanctionalloUID: Number(userID),
            },
          });

          return {
            status: status.replace('_', ' '),
            count,
          };
        }),
      );

      const sanctionData = await Promise.all(
        sanctionStatuses.map(async (status) => {
          const count = await this.tenantPrisma.client.leads.count({
            where: {
              ...whereDate,
              status,
              approvals: {
                some: {
                  creditedBy: userID ? Number(userID) : { not: null },
                },
              },
            },
          });

          return {
            status,
            count,
          };
        }),
      );

      return {
        success: true,
        data: {
          process: processData,
          sanction: sanctionData,
        },
      };
    } catch (err: any) {

      return {
        success: false,
        message: 'Transaction failed',
        error: err.message,
      };
    }
  }

  async getTodayLeadCountByStatus() {
    try {
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);

      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      const dateFilter = {
        createdDate: {
          gte: start,
          lte: end,
        },
      };

      const [
        total_received,
        rejected_count,
        not_eligible_count,
        approved_count,
      ] = await Promise.all([
        this.tenantPrisma.client.leads.count({
          where: dateFilter,
        }),

        this.tenantPrisma.client.leads.count({
          where: {
            ...dateFilter,
            status: {
              in: ['Rejected_Process', 'Rejected'],
            },
          },
        }),

        this.tenantPrisma.client.leads.count({
          where: {
            ...dateFilter,
            status: 'Not_Eligible',
          },
        }),

        this.tenantPrisma.client.leads.count({
          where: {
            ...dateFilter,
            status: {
              in: ['Approved_Process', 'Approved'],
            },
          },
        }),
      ]);

      return {
        success: true,
        data: {
          total_received,
          rejected_count,
          not_eligible_count,
          approved_count,
        },
      };
    } catch (err: any) {

      return {
        success: false,
        message: 'Transaction failed',
        error: err.message,
      };
    }
  }

  async gettotaldocRecived() {
    try {
      const perManager = await this.tenantPrisma.client.leads.groupBy({
        by: ['creditAssign'],
        where: {
          status: 'Document_Received',
          creditAssign: {
            gt: 0,
          },
        },
        _count: {
          leadID: true,
        },
        orderBy: {
          _count: {
            leadID: 'desc',
          },
        },
      });

      const userIds = perManager.map((p) => p.creditAssign);

      const users = await this.tenantPrisma.client.lms_users.findMany({
        where: {
          userID: {
            in: userIds,
          },
        },
        select: {
          userID: true,
          name: true,
        },
      });

      const userMap = new Map(users.map((u) => [u.userID, u.name]));

      const managerWise = perManager.map((p) => ({
        manager_name: userMap.get(p.creditAssign) || 'Unknown',
        case_count: p._count.leadID,
      }));

      const total = await this.tenantPrisma.client.leads.count({
        where: {
          status: 'Document_Received',
          creditAssign: {
            gt: 0,
          },
        },
      });

      return {
        success: true,
        data: {
          total,
          managerWise,
        },
      };
    } catch (err: any) {
      console.error(err);
      return {
        success: false,
        message: 'Transaction failed',
        error: err.message,
      };
    }
  }

  async getSanctionReportUserWise({ fromDate, toDate }) {
    try {
      const sanctionStatuses = [
        'Approved Process',
        'Approved_Process',
        'Rejected Process',
        'Rejected_Process',
        'Hold Process',
        'Hold_Process',
      ];

      const STATUS_MAP: Record<string, string> = {
        'Approved Process': 'Approved_Process',
        Approved_Process: 'Approved_Process',

        'Rejected Process': 'Rejected Process',
        Rejected_Process: 'Rejected Process',

        'Hold Process': 'Hold Process',
        Hold_Process: 'Hold Process',
      };

      const dateFilter =
        fromDate && toDate
          ? {
            createdDate: {
              gte: new Date(`${fromDate}T00:00:00.000Z`),
              lte: new Date(`${toDate}T23:59:59.999Z`),
            },
          }
          : {
            createdDate: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
              lte: new Date(new Date().setHours(23, 59, 59, 999)),
            },
          };

      const rows = await this.tenantPrisma.client.callhistorylogs.findMany({
        where: {
          calledBy: { not: null },
          status: { in: sanctionStatuses },
          ...dateFilter,
        },
        select: {
          calledBy: true,
          status: true,
          leadID: true,
          calledByUser: {
            select: {
              userID: true,
              name: true,
            },
          },
          lead: {
            select: {
              approvals: {
                select: {
                  loanAmtApproved: true,
                },
              },
            },
          },
        },
      });

      const reportMap = new Map<number, any>();

      for (const row of rows) {
        const userID = row.calledBy!;
        const userName = row.calledByUser?.name ?? 'Unknown';

        if (!reportMap.has(userID)) {
          reportMap.set(userID, {
            userID,
            name: userName,
            data: {
              Approved_Process: {
                totalLeads: 0,
                totalApprovedAmount: 0,
                leadIds: new Set<number>(),
              },
              'Rejected Process': {
                totalLeads: 0,
                totalApprovedAmount: 0,
                leadIds: new Set<number>(),
              },
              'Hold Process': {
                totalLeads: 0,
                totalApprovedAmount: 0,
                leadIds: new Set<number>(),
              },
            },
          });
        }

        const userEntry = reportMap.get(userID);
        const normalizedStatus = STATUS_MAP[row.status];
        if (!normalizedStatus) continue;

        const statusEntry = userEntry.data[normalizedStatus];
        const leadID = row.leadID;

        // 🚫 already counted → skip
        if (statusEntry.leadIds.has(leadID)) {
          continue;
        }

        // ✅ first time for this lead
        statusEntry.leadIds.add(leadID);
        statusEntry.totalLeads += 1;

        for (const approval of row.lead.approvals) {
          statusEntry.totalApprovedAmount += approval.loanAmtApproved ?? 0;
        }
      }

      const result = Array.from(reportMap.values()).map((user) => ({
        userID: user.userID,
        name: user.name,
        data: Object.entries(user.data).map(([status, values]: any) => ({
          status,
          totalLeads: values.totalLeads,
          totalApprovedAmount: values.totalApprovedAmount,
        })),
      }));

      return {
        success: true,
        data: result,
      };
    } catch (err: any) {
      console.error(err);
      return {
        success: false,
        message: 'Transaction failed',
        error: err.message,
      };
    }
  }

  async getCreditReportUserWise({ fromDate, toDate }) {
    try {
      const creditStatuses: approval_status[] = [
        approval_status.Approved,
        approval_status.Rejected,
        approval_status.Hold,
        approval_status.Not_Required,
        // approval_status.Blacklist_Lead,
      ];

      const dateFilter =
        fromDate && toDate
          ? {
            createdDate: {
              gte: new Date(`${fromDate}T00:00:00.000Z`),
              lte: new Date(`${toDate}T23:59:59.999Z`),
            },
          }
          : {
            createdDate: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
              lte: new Date(new Date().setHours(23, 59, 59, 999)),
            },
          };

      const approvals = await this.tenantPrisma.client.approval.findMany({
        where: {
          creditedBy: { not: 0 },
          status: { in: creditStatuses },
          ...dateFilter,
        },
        select: {
          leadID: true,
          status: true,
          loanAmtApproved: true,
          creditedBy: true,
          creditedUser: {
            select: {
              userID: true,
              name: true,
            },
          },
          lead: {
            select: {
              fbLeads: true,
            },
          },
        },
      });

      const userMap = new Map<number, any>();

      for (const row of approvals) {
        const userID: any = row.creditedBy;
        const userName = row.creditedUser?.name ?? 'Unknown';

        if (!userMap.has(userID)) {
          userMap.set(userID, {
            userID,
            name: userName,
            statuses: {},
            approvedSplit: {
              newCase: { count: 0, amount: 0 },
              repeatCase: { count: 0, amount: 0 },
            },
          });

          creditStatuses.forEach((status) => {
            userMap.get(userID).statuses[status] = {
              count: 0,
              amount: 0,
            };
          });
        }

        userMap.get(userID).statuses[row.status].count += 1;
        userMap.get(userID).statuses[row.status].amount +=
          row.loanAmtApproved ?? 0;

        if (row.status === 'Approved') {
          if (row.lead?.fbLeads === 'New Case') {
            userMap.get(userID).approvedSplit.newCase.count += 1;
            userMap.get(userID).approvedSplit.newCase.amount +=
              row.loanAmtApproved ?? 0;
          }

          if (row.lead?.fbLeads === 'Repeat Case') {
            userMap.get(userID).approvedSplit.repeatCase.count += 1;
            userMap.get(userID).approvedSplit.repeatCase.amount +=
              row.loanAmtApproved ?? 0;
          }
        }
      }

      const overallTotals: any = {};

      creditStatuses.forEach((status) => {
        overallTotals[status] = { count: 0, amount: 0 };
      });

      for (const row of approvals) {
        overallTotals[row.status].count += 1;
        overallTotals[row.status].amount += row.loanAmtApproved ?? 0;
      }

      return {
        success: true,
        data: {
          users: Array.from(userMap.values()),
          totals: overallTotals,
        },
      };
    } catch (err: any) {
      console.error(err);
      return {
        success: false,
        message: 'Transaction failed',
        error: err.message,
      };
    }
  }

  async getDisbursedReportUserWise({ fromDate, toDate }) {
    try {
      const startOfDay = (date: string | Date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
      };

      const endOfDay = (date: string | Date) => {
        const d = new Date(date);
        d.setHours(23, 59, 59, 999);
        return d;
      };

      const dateFilter =
        fromDate && toDate
          ? {
            gte: startOfDay(fromDate).toISOString(),
            lte: endOfDay(toDate).toISOString(),
          }
          : {
            gte: startOfDay(new Date()).toISOString(),
            lte: endOfDay(new Date()).toISOString(),
          };

      const disbursedData = await this.tenantPrisma.client.loan.groupBy({
        by: ['disbursedBy'],
        where: {
          status: 'Disbursed',
          disbursalDate: dateFilter,
        },
        _count: {
          loanID: true,
        },
        _sum: {
          disbursalAmount: true,
        },
        orderBy: {
          disbursedBy: 'asc',
        },
      });

      if (!disbursedData.length) {
        return {
          success: true,
          data: [],
        };
      }

      const userIds = disbursedData
        .map((d) => d.disbursedBy)
        .filter((id): id is number => id !== null);

      const users = await this.tenantPrisma.client.lms_users.findMany({
        where: {
          userID: { in: userIds },
        },
        select: {
          userID: true,
          name: true,
        },
      });

      const userMap = new Map(users.map((u) => [u.userID, u.name]));

      const finalReport = disbursedData.map((d: any) => ({
        userID: d.disbursedBy,
        userName: userMap.get(d.disbursedBy) ?? 'Unknown',
        totalDisbursedCount: d._count.loanID,
        totalDisbursedAmount: d._sum.disbursalAmount ?? 0,
      }));

      return {
        success: true,
        data: finalReport,
      };
    } catch (err: any) {
      console.error(err);
      return {
        success: false,
        message: 'Transaction failed',
        error: err.message,
      };
    }
  }

  async getReloanPending({
    page,
    limit,
    filters,
  }: {
    page: number;
    limit: number;
    filters: {
      fromDate?: string;
      toDate?: string;
    };
    req: Request;
  }) {
    try {
      const offset = (page - 1) * limit;

      const fromDate = filters?.fromDate ? new Date(filters.fromDate) : null;
      const toDate = filters?.toDate ? new Date(filters.toDate) : null;

      const data = await this.tenantPrisma.client.$queryRaw`
SELECT 
    c.customerID,
    c.name,
    c.mobile,
    c.pancard,
    c.email,
    ld.leadID,
    ld.status,
    e.empSalary,
    COALESCE(lc.loanCount,0) AS loanCount,
    col.createdDate AS closedDate

FROM customer c

JOIN leads ld 
  ON ld.customerID = c.customerID

JOIN (
    SELECT customerID, MAX(leadID) AS lastLeadId
    FROM leads
    GROUP BY customerID
) lastLead 
  ON lastLead.lastLeadId = ld.leadID

JOIN collection col
  ON col.leadID = ld.leadID

LEFT JOIN employer e
  ON e.customerID = c.customerID

LEFT JOIN (
    SELECT ld.customerID, COUNT(l.id) AS loanCount
    FROM loan l
    JOIN leads ld ON ld.leadID = l.leadID
    GROUP BY ld.customerID
) lc
  ON lc.customerID = c.customerID

WHERE ld.status = 'CLOSED'
  AND col.collectionStatus = 'APPROVED'
  AND col.status = 'CLOSED'
  AND (${fromDate} IS NULL OR col.createdDate >= ${fromDate})
  AND (${toDate} IS NULL OR col.createdDate <= ${toDate})

ORDER BY col.createdDate DESC, ld.leadID DESC
LIMIT ${limit} OFFSET ${offset}
`;

      const total: any = await this.tenantPrisma.client.$queryRaw`
      SELECT COUNT(*) as total
      FROM (
        SELECT customerID, MAX(leadID) AS lastLeadId
        FROM leads
        GROUP BY customerID
      ) lastLead
      JOIN leads ld ON ld.leadID = lastLead.lastLeadId
      JOIN collection col ON col.leadID = ld.leadID
      WHERE ld.status = 'CLOSED'
        AND col.collectionStatus = 'APPROVED'
        AND col.status = 'CLOSED'
        AND (${fromDate} IS NULL OR col.createdDate >= ${fromDate})
        AND (${toDate} IS NULL OR col.createdDate <= ${toDate})
    `;

      const totalCount = Number(total[0].total);

      return normalize({
        statusCode: 200,
        data,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      });
    } catch (err: any) {

      return {
        statusCode: 500,
        message: 'Failed to Fetch Data',
        error: err.message,
      };
    }
  }


  // async uploadPincodeExcel(file: Express.Multer.File) {
  //   try {
  //     if (!file) {

  //       return {
  //         statusCode: 500,
  //         message: "file Not Found "
  //       }
  //     }

  //     const workbook = XLSX.read(file.buffer, {
  //       type: 'buffer',
  //     });

  //     const sheetName = workbook.SheetNames[0];

  //     const sheet = workbook.Sheets[sheetName];

  //     const rows: any[] = XLSX.utils.sheet_to_json(sheet, {
  //       defval: '',
  //     });


  //     if (!rows.length) {
  //       throw new BadRequestException(
  //         'Excel file contains no data',
  //       );
  //     }

  //     const data = rows.map((row) => ({
  //       pincode: String(row['pincode']).trim(),

  //       circlename: row['circlename'] || null,
  //       regionname: row['regionname'] || null,
  //       divisionname: row['divisionname'] || null,
  //       officename: row['officename'] || null,
  //       officetype: row['officetype'] || null,
  //       delivery: row['delivery'] || null,
  //       district: row['district'] || null,
  //       statename: row['statename'] || null,
  //       latitude: row['latitude']
  //         ? String(row['latitude'])
  //         : null,
  //       longitude: row['longitude']
  //         ? String(row['longitude'])
  //         : null,

  //       type: row['Metro/Non Metro'] || null,

  //       riskStatus: row['Risk Status'] || null,

  //       riskEligibleFlag:
  //         row['Risk Eligible Flag'] || null,

  //       eligibleSince:
  //         row['Eligible Since'] || null,

  //       isActive: true,
  //     }));


  //     // return


  //     const result =
  //       await this.tenantPrisma.client.pincode.createMany({
  //         data,
  //         skipDuplicates: true,
  //       });

  //     // console.log(result, "result");


  //     return {
  //       success: true,
  //       totalRows: rows.length,
  //       inserted: result.count,
  //     };
  //   } catch (error: any) {
  //     console.log(error);

  //     return {
  //       success: false,
  //       message:
  //         error?.message || 'Failed to upload file',
  //     };
  //   }
  // }


  async reloanPendingExcel(
    res: Response,
    { fromDate, toDate }: { fromDate: string; toDate: string },
  ) {
    try {
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;

      const data: any[] = await this.tenantPrisma.client.$queryRaw`
      SELECT 
          c.customerID,
          c.name,
          c.mobile,
          c.pancard,
          c.email,
          ld.leadID,
          ld.status,
          e.empSalary,
          COALESCE(lc.loanCount,0) AS loanCount,
          col.createdDate AS closedDate

      FROM customer c

      JOIN leads ld
        ON ld.customerID = c.customerID

      JOIN (
          SELECT customerID, MAX(leadID) AS lastLeadId
          FROM leads
          GROUP BY customerID
      ) lastLead
        ON lastLead.lastLeadId = ld.leadID

      JOIN collection col
        ON col.leadID = ld.leadID

      LEFT JOIN employer e
        ON e.customerID = c.customerID

      LEFT JOIN (
          SELECT ld.customerID, COUNT(l.id) AS loanCount
          FROM loan l
          JOIN leads ld
            ON ld.leadID = l.leadID
          GROUP BY ld.customerID
      ) lc
        ON lc.customerID = c.customerID

      WHERE ld.status = 'CLOSED'
        AND col.collectionStatus = 'APPROVED'
        AND col.status = 'CLOSED'
        AND (${from} IS NULL OR col.createdDate >= ${from})
        AND (${to} IS NULL OR col.createdDate <= ${to})

      ORDER BY col.createdDate DESC, ld.leadID DESC
    `;


      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Reloan Pending');

      worksheet.columns = [
        { header: 'Customer ID', key: 'customerID', width: 15 },
        { header: 'Customer Name', key: 'name', width: 30 },
        { header: 'Mobile', key: 'mobile', width: 18 },
        { header: 'PAN', key: 'pancard', width: 18 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Lead ID', key: 'leadID', width: 15 },
        { header: 'Lead Status', key: 'status', width: 18 },
        { header: 'Salary', key: 'empSalary', width: 15 },
        { header: 'Loan Count', key: 'loanCount', width: 15 },
        { header: 'Closed Date', key: 'closedDate', width: 25 },
      ];

      for (const item of data) {



        worksheet.addRow({
          customerID: Number(item.customerID),
          name: item.name ?? '',
          mobile: item.mobile ? Number(item.mobile) : '',
          pancard: item.pancard ?? '',
          email: item.email ?? '',
          leadID: Number(item.leadID),
          status: item.status,
          empSalary: item.empSalary ?? '',
          loanCount: Number(item.loanCount),
          closedDate: item.closedDate,
        });
      }


      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      res.setHeader(
        'Content-Disposition',
        'attachment; filename=reloanPending.xlsx',
      );

      await workbook.xlsx.write(res);

      res.end();
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        statusCode: 500,
        message: 'Failed to generate excel',
      });
    }
  }
}
