import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../auth/auth.service';
import { stat } from 'fs';
import {
  convertBigIntToString,
  normalize,
  normalizeData,
} from '../../utility/helper';
import {
  collection_collectedMode,
  collection_status,
  document_status,
} from '@prisma/client';
import { FileService } from '../fileUploads/file.service';
import { HeadRoles } from '../../utility/enums';
import { mailConfig } from '../../common/config/ mailConfig';
import { MailService } from '../mail/mail.service';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CacheService } from '../cache/cache.service';
import { CibilService } from '../cibil/cibil.service';
import { CacheKey } from '../cache/cache.keys';
import { LeadsService } from '../leads/leads.service';
import { GlobalService } from '../../common/globalFunctions/global.service';

@Injectable()
export class CollectionService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private configService: ConfigService,
    private readonly clsService: ClsService,
    private readonly authService: AuthService,
    private readonly FileService: FileService,
    private readonly MailService: MailService,
    private readonly cacheService: CacheService,
    private readonly CibilService: CibilService,
    private readonly leadService: LeadsService,
    private readonly globalService: GlobalService,
    @InjectQueue('reloan-sms')
    private readonly statusQueue: Queue,
  ) { }

  async getPaymentPendingCollections({
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

      // Build dynamic where clause

      const whereClause: any = {
        status: 'Approved',
        lead: {
          status: { in: ['Disbursed', 'Part_Payment'] },
        },
      };

      // 🗓 Date filter

      const getUtcStartOfDay = (dateStr: string) => {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      };

      const getUtcEndOfDay = (dateStr: string) => {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
      };
      if (filters.fromDate && filters.toDate) {
        whereClause.repayDate = {
          gte: getUtcStartOfDay(filters.fromDate),
          lte: getUtcEndOfDay(filters.toDate),
        };
      } else {
        const today = new Date();
        whereClause.repayDate = {
          gte: new Date(
            Date.UTC(
              today.getUTCFullYear(),
              today.getUTCMonth(),
              today.getUTCDate(),
              0,
              0,
              0,
              0,
            ),
          ),
          lte: new Date(
            Date.UTC(
              today.getUTCFullYear(),
              today.getUTCMonth(),
              today.getUTCDate(),
              23,
              59,
              59,
              999,
            ),
          ),
        };
      }

      // 🔍 Search filter (by customer name or loan number)
      if (search) {
        whereClause.OR = [
          {
            lead: {
              customer: {
                firstName: { contains: search },
              },
            },
          },
          {
            lead: {
              loan: {
                loanNo: { contains: search },
              },
            },
          },
        ];
      }

      const userData = await this.clsService.get('user');
      const userRole = await this.authService.getUserById(userData);

      const headRoleValues = Object.values(HeadRoles);

      if (!headRoleValues.includes(userRole.role)) {
        whereClause.collectionUID = userRole.userID;
      }

      const [data, total] = await Promise.all([
        this.tenantPrisma.client.approval.findMany({
          where: whereClause,
          select: {
            repayDate: true,
            loanAmtApproved: true,
            roi: true,
            tenure: true,
            leadID: true,
            lead: {
              select: {
                status: true,
                loan: {
                  select: {
                    loanNo: true,
                  },
                },
                customer: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
          orderBy: {
            repayDate: 'desc',
          },
          skip,
          take: limit,
        }),
        this.tenantPrisma.client.approval.count({
          where: whereClause,
        }),
      ]);

      // 🧩 Format response
      const formattedData = data.map((item) => ({
        repayDate: item.repayDate,
        loanAmtApproved: item.loanAmtApproved,
        roi: item.roi,
        tenure: item.tenure,
        leadID: item.leadID,
        name: `${item.lead.customer?.firstName ?? ''} ${item.lead.customer?.lastName ?? ''}`.trim(),
        loanNo: item.lead.loan?.loanNo ?? '',
        leadStatus: item.lead.status,
      }));

      return normalizeData({
        statusCode: 200,
        message: 'Payment pending collections fetched successfully',
        data: formattedData,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err: any) {
      console.error('Error fetching payment pending collections:', err);
      return {
        statusCode: 500,
        error: 'Failed to fetch payment pending collections',
        details: err.message,
      };
    }
  }

  async getClosedCollections({
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

      /* ---------------- COLLECTION FILTER ---------------- */

      const collectionWhere: any = {
        collectionStatus: 'Approved',
        status: {
          in: ['Closed', 'Part_Payment'],
        },
        lead: {
          status: 'Closed',
        },
      };

      // Date filter on collection.createdDate
      if (filters?.fromDate && filters?.toDate) {
        collectionWhere.collectedDate = {
          gte: new Date(`${filters.fromDate}T00:00:00.000Z`),
          lte: new Date(`${filters.toDate}T23:59:59.999Z`),
        };
      }

      // Search filter (customer name)
      if (search) {
        collectionWhere.lead.customer = {
          mobile: {
            equals: BigInt(search),
          },
        };
      }

      /* ---------------- ROLE FILTER ---------------- */

      const userData = await this.clsService.get('user');
      const userRole = await this.authService.getUserById(userData);
      const headRoleValues = Object.values(HeadRoles);

      if (!headRoleValues.includes(userRole.role)) {
        collectionWhere.collectedBy = userRole.userID;
      }

      /* ---------------- STEP 1: GET ORDERED COLLECTIONS ---------------- */

      const collections = await this.tenantPrisma.client.collection.findMany({
        where: collectionWhere,
        orderBy: { createdDate: 'desc' }, // ORDER BY collection.createdDate
        select: {
          leadID: true,
        },
      });

      // Extract unique leadIDs in correct order
      const uniqueLeadIds = [
        ...new Map(collections.map((c) => [c.leadID, c])).keys(),
      ];

      const total = uniqueLeadIds.length;

      // Pagination on unique leads
      const paginatedLeadIds = uniqueLeadIds.slice(skip, skip + limit);

      if (paginatedLeadIds.length === 0) {
        return {
          total: 0,
          page,
          limit,
          totalPages: 0,
          data: [],
        };
      }

      /* ---------------- STEP 2: FETCH LEADS WITH COLLECTIONS ---------------- */

      const leads = await this.tenantPrisma.client.leads.findMany({
        where: {
          leadID: { in: paginatedLeadIds },
        },
        include: {
          customer: {
            select: {
              name: true,
              email: true,
              mobile: true,
            },
          },
          collections: {
            where: collectionWhere,
            orderBy: { collectedDate: 'desc' },
          },
        },
      });

      // Maintain order same as collection ordering
      const orderedLeads = paginatedLeadIds.map((id) =>
        leads.find((lead) => lead.leadID === id),
      );

      const data = normalizeData(orderedLeads);

      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
      });
    } catch (err: any) {
      console.error('Error fetching closed collections:', err);
      return {
        statusCode: 500,
        error: 'Failed to fetch closed collections',
        details: err.message,
      };
    }
  }

  async getPartPaymentCollections({
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

      /* ---------------- COLLECTION FILTER ---------------- */

      const collectionWhere: any = {
        collectionStatus: 'Approved',
        status: 'Part_Payment',
        lead: {
          status: 'Part_Payment',
        },
      };

      // Date filter on collection.createdDate
      if (filters?.fromDate && filters?.toDate) {
        collectionWhere.collectedDate = {
          gte: new Date(`${filters.fromDate}T00:00:00.000Z`),
          lte: new Date(`${filters.toDate}T23:59:59.999Z`),
        };
      }

      // Search filter (customer name)
      if (search) {
        collectionWhere.lead.customer = {
          mobile: {
            equals: BigInt(search),
          },
        };
      }

      /* ---------------- ROLE FILTER ---------------- */

      const userData = await this.clsService.get('user');
      const userRole = await this.authService.getUserById(userData);
      const headRoleValues = Object.values(HeadRoles);

      if (!headRoleValues.includes(userRole.role)) {
        collectionWhere.collectionUID = userRole.userID;
      }

      /* ---------------- STEP 1: GET ORDERED COLLECTIONS ---------------- */

      const collections = await this.tenantPrisma.client.collection.findMany({
        where: collectionWhere,
        orderBy: { createdDate: 'desc' }, // ORDER BY collection.createdDate
        select: {
          leadID: true,
        },
      });

      // Extract unique leadIDs in correct order
      const uniqueLeadIds = [
        ...new Map(collections.map((c) => [c.leadID, c])).keys(),
      ];

      const total = uniqueLeadIds.length;

      // Pagination on unique leads
      const paginatedLeadIds = uniqueLeadIds.slice(skip, skip + limit);

      if (paginatedLeadIds.length === 0) {
        return {
          total: 0,
          page,
          limit,
          totalPages: 0,
          data: [],
        };
      }

      /* ---------------- STEP 2: FETCH LEADS WITH COLLECTIONS ---------------- */

      const leads = await this.tenantPrisma.client.leads.findMany({
        where: {
          leadID: { in: paginatedLeadIds },
        },
        include: {
          customer: {
            select: {
              name: true,
              email: true,
              mobile: true,
            },
          },
          collections: {
            where: collectionWhere,
            orderBy: { collectedDate: 'desc' },
          },
        },
      });

      // Maintain order same as collection ordering
      const orderedLeads = paginatedLeadIds.map((id) =>
        leads.find((lead) => lead.leadID === id),
      );

      const data = normalizeData(orderedLeads);

      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
      });
    } catch (err: any) {
      console.error('Error fetching closed collections:', err);
      return {
        statusCode: 500,
        error: 'Failed to fetch closed collections',
        details: err.message,
      };
    }
  }

  async getSettelmentCollections({
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

      const collectionWhere: any = {
        status: {
          in: ['Settlement', 'Part_Payment'],
        },
        collectionStatus: 'Approved',
        lead: {
          status: 'Settlement',
        },
      };
      // Date filter on collection.createdDate
      if (filters?.fromDate && filters?.toDate) {
        collectionWhere.collectedDate = {
          gte: new Date(`${filters.fromDate}T00:00:00.000Z`),
          lte: new Date(`${filters.toDate}T23:59:59.999Z`),
        };
      }

      // Search filter (customer name)
      if (search) {
        collectionWhere.lead.customer = {
          mobile: {
            equals: BigInt(search),
          },
        };
      }

      /* ---------------- ROLE FILTER ---------------- */

      const userData = await this.clsService.get('user');
      const userRole = await this.authService.getUserById(userData);
      const headRoleValues = Object.values(HeadRoles);

      if (!headRoleValues.includes(userRole.role)) {
        collectionWhere.collectionUID = userRole.userID;
      }

      /* ---------------- STEP 1: GET ORDERED COLLECTIONS ---------------- */

      const collections = await this.tenantPrisma.client.collection.findMany({
        where: collectionWhere,
        orderBy: { createdDate: 'desc' }, // ORDER BY collection.createdDate
        select: {
          leadID: true,
        },
      });

      // Extract unique leadIDs in correct order
      const uniqueLeadIds = [
        ...new Map(collections.map((c) => [c.leadID, c])).keys(),
      ];

      const total = uniqueLeadIds.length;

      // Pagination on unique leads
      const paginatedLeadIds = uniqueLeadIds.slice(skip, skip + limit);

      if (paginatedLeadIds.length === 0) {
        return {
          total: 0,
          page,
          limit,
          totalPages: 0,
          data: [],
        };
      }

      /* ---------------- STEP 2: FETCH LEADS WITH COLLECTIONS ---------------- */

      const leads = await this.tenantPrisma.client.leads.findMany({
        where: {
          leadID: { in: paginatedLeadIds },
        },
        include: {
          customer: {
            select: {
              name: true,
              email: true,
              mobile: true,
            },
          },
          collections: {
            where: collectionWhere,
            orderBy: { collectedDate: 'desc' },
          },
        },
      });

      // Maintain order same as collection ordering
      const orderedLeads = paginatedLeadIds.map((id) =>
        leads.find((lead) => lead.leadID === id),
      );

      const data = normalizeData(orderedLeads);

      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
      });
    } catch (err: any) {
      console.error('Error fetching closed collections:', err);
      return {
        statusCode: 500,
        error: 'Failed to fetch closed collections',
        details: err.message,
      };
    }
  }

  async createCollection(
    body: any,
    files: Express.Multer.File,
    leadId: string,
    req: any
  ) {
    try {
      const metadata = body.metadata ? JSON.parse(body.metadata) : [];

      const lead: any = await this.tenantPrisma.client.leads.findUnique({
        where: { leadID: Number(leadId) },
        include: { customer: true, loan: true },
      });

      if (!lead) {
        return { statusCode: 404, message: 'Lead not found' };
      }

      if (!lead.customer) {
        return { statusCode: 404, message: 'Customer not found for the lead' };
      }

      if (!lead.loan) {
        return { statusCode: 404, message: 'Loan not found for the lead' };
      }

      const userData = await this.clsService.get('user');

      const userRole = await this.authService.getUserById(userData);

      const headRoleValues = Object.values(HeadRoles);

      if (!headRoleValues.includes(userRole.role)) {
        lead.collectionUID = userRole.userID;
      }

      const allowedKeys = [
        'collectedAmount',
        'collectedMode',
        'referenceNo',
        'collectedDate',
        'status',
      ];

      const numericKeys = ['collectedAmount'];
      const updateData: any = {};

      for (const key of allowedKeys) {
        if (body[key] !== undefined) {
          if (numericKeys.includes(key)) {
            const val = Number(body[key]);
            if (isNaN(val)) {
              return {
                statusCode: 400,
                message: `${key} must be a valid number.`,
              };
            }
            updateData[key] = val;
          } else {
            updateData[key] = body[key];
          }
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

      if (body.status) {
        const validStatuses = Object.values(collection_status);
        if (!validStatuses.includes(body.status)) {
          return {
            statusCode: 400,
            message: `Invalid status. Allowed: ${validStatuses.join(', ')}`,
          };
        }
        updateData.status = body.status;
      }

      if (body.collectedMode) {
        const validModes = Object.values(collection_collectedMode);
        if (!validModes.includes(body.collectedMode)) {
          return {
            statusCode: 400,
            message: `Invalid collectedMode. Allowed: ${validModes.join(', ')}`,
          };
        }
        updateData.collectedMode = body.collectedMode;
      }

      if (body.collectedDate) {
        const parsedDate = new Date(body.collectedDate);

        if (isNaN(parsedDate.getTime())) {
          return {
            statusCode: 400,
            message: `collectedDate must be in valid date format (ISO 8601).`,
          };
        }

        updateData.collectedDate = parsedDate.toISOString();
      }

      if (updateData.collectedMode === 'DISCOUNT') {
        const hasPendingDiscount = await this.tenantPrisma.client.collection.findFirst({
            where: {
              leadID: Number(leadId),
              collectionStatus: 'Approval Waiting',
              discountAmount: { gt: 0 },
            },
            select: { leadID: true },
          });

        if (hasPendingDiscount) {
          return {
            statusCode: 400,
            message: `You can't add a new discount while another is pending approval.`,
          };
        }

        const currentDiscount = Number(updateData.collectedAmount || 0);
        // const response = await this.leadService.getStatementOfAccount(
        //   leadId,
        //   req,
        // );
        const response = await this.leadService.getLoanCalculation(
          leadId,
          req,
        );

        // const totalPayable = Number(response?.data?.summary?.totalPayable || 0);
        const totalPayable = Number(response?.data?.outstanding || 0);

        const collectionAgg =
          await this.tenantPrisma.client.collection.aggregate({
            where: {
              leadID: Number(leadId),
              collectionStatus: 'Approved',
              discountAmount: 0,
            },
            _sum: {
              collectedAmount: true,
              discountAmount: true,
            },
          });

        const totalCollected = Number(collectionAgg._sum.collectedAmount || 0);
        const disbursalAmount = Number(lead?.loan?.disbursalAmount || 0);

        const round = (val: number) => Math.round(val * 100) / 100;

        const remainingAfterDiscount = totalPayable - currentDiscount;

        const totalRecovered = totalCollected + remainingAfterDiscount;

        if (round(totalRecovered) < round(disbursalAmount)) {
          return {
            statusCode: 400,
            message: `Invalid discount: mismatch in loan balance calculation`,
          };
        }

        updateData.discountAmount = currentDiscount;
        updateData.collectedAmount = 0;
      }

      let uploadResult: any = null;

      try {
        if (files) {
          uploadResult = await this.FileService.uploadFileToS3(
            files.buffer,
            files.originalname,
            'Payment Screenshot',
            String(lead.customer.customerID),
            String(lead.leadID),
          );

          if (!uploadResult || !uploadResult.key) {
            return {
              statusCode: 500,
              message: 'File upload failed. Collection not created.',
            };
          }
        }
      } catch (err: any) {
        return {
          statusCode: 500,
          message: 'File upload failed',
          details: err.message,
        };
      }

      if (uploadResult && uploadResult?.key) {
        updateData.s3key = uploadResult.key;
      }

      const created = await this.tenantPrisma.client.$transaction(
        async (tx) => {
          const collection = await tx.collection.create({
            data: {
              ...updateData,
              leadID: Number(leadId),
              customerID: lead.customer.customerID.toString(),
              s3key: uploadResult?.key || null,
              collectionStatus: 'Approval Waiting',
              loanNo: lead.loan.loanNo,
              remark: '',
              collectedBy: userData,
            },
          });

          const callHistorylogs = await tx.callhistorylogs.create({
            data: {
              customerID: Number(lead.customer.customerID),
              leadID: Number(leadId),
              callType: 'IVR',
              appAmount: body.collectedAmount,
              status: 'Approval Waiting',
              remark: body.status,
              calledBy: userData,
              noteli: '',
            } as any,
          });

          if (uploadResult?.key) {
            await tx.document.create({
              data: {
                customerID: Number(lead.customer.customerID),
                documentType: 'Payment Screenshot',
                documentFile: uploadResult.key,
                pushData: Number(leadId),
                status: document_status.Pending,
                verifiedBy: Number(1),
                uploadBy: Number(userData),
                uploadedDate: new Date(),
              } as any,
            });
          }

          const tenant = await this.CibilService.getCurrentDomain(req);
          await this.cacheService.del(CacheKey.lead(tenant, Number(leadId), 'Profile'));

          return collection;
        },
      );

      return {
        statusCode: 200,
        message: 'Collection created successfully',
        data: {
          collection: created,
          uploadedFiles: uploadResult,
        },
      };
    } catch (err: any) {
      console.error('Error creating collection:', err);

      return {
        statusCode: 500,
        error: 'Failed to create collection',
        details: err.message,
      };
    }
  }

  async updateCollectionStatus(collectionId: string, body: any, req: any) {
    try {
      const collectionDatas =
        await this.tenantPrisma.client.collection.findUnique({
          where: { collectionID: Number(collectionId) },
        });

      if (!collectionDatas) {
        return { statusCode: 404, message: 'Collection not found' };
      }

      const pendingCollection =
        await this.tenantPrisma.client.collection.findMany({
          where: {
            leadID: collectionDatas.leadID,
            collectionStatus: 'Approval Waiting',
            status: 'Part_Payment',
            collectionID: {
              not: Number(collectionId),
            },
          },
        });

      if (
        (collectionDatas.status === 'Closed' ||
          collectionDatas.status === 'Settlement') &&
        pendingCollection.length > 0
      ) {
        return {
          statusCode: 400,
          message:
            'Please Approve/Reject the first part payment entry before closing or settling this collection.',
        };
      }

      const allowedStats = ['Approved', 'Payment Rejected'];

      const allowedStatuses = Object.values(allowedStats);
      if (!body.status || !allowedStatuses.includes(body.status)) {
        return {
          statusCode: 400,
          message: `Invalid or missing status. Allowed statuses: ${allowedStatuses.join(', ')}`,
        };
      }

      const userData = await this.clsService.get('user');

      const userRole = await this.authService.getUserById(userData);

      const headRoleValues = Object.values(HeadRoles);

      if (!headRoleValues.includes(userRole.role)) {
        return {
          statusCode: 403,
          message: 'You are not allowed to perform this action',
        };
      }

      const lead: any = await this.tenantPrisma.client.leads.findUnique({
        where: { leadID: collectionDatas.leadID },
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

      const updatedCollection: any =
        await this.tenantPrisma.client.$transaction(async (tx: any) => {
          const collectionData = await tx.collection.update({
            where: { collectionID: Number(collectionId) },
            data: {
              collectionStatus: body.status,
              collectionStatusby: userData,
              approvedDate: new Date(),
            },
          });

          const callHistorylogs = await tx.callhistorylogs.create({
            data: {
              customerID: Number(lead.customer.customerID),
              leadID: Number(lead.leadID),
              callType: 'IVR',
              appAmount: String(collectionDatas.collectedAmount),
              status: body.status,
              remark: 'collection Approval',
              calledBy: userData,
              noteli: '',
            } as any,
          });

          const mappedStatus =
            body.status === 'Approved'
              ? document_status.Verified
              : document_status.Rejected;

          return { collectionData };
        });

      let leadsData;

      if (body.status === 'Approved') {
        const leadsStatus: any = collectionDatas.status;
        leadsData = await this.tenantPrisma.client.leads.update({
          where: { leadID: Number(lead.leadID) },
          data: {
            status: leadsStatus,
          },
        });

        const callHistorylog =
          await this.tenantPrisma.client.callhistorylogs.create({
            data: {
              customerID: Number(lead.customer.customerID),
              leadID: Number(lead.leadID),
              callType: 'IVR',
              appAmount: String(collectionDatas.collectedAmount),
              status: leadsStatus,
              remark: 'Lead Status',
              calledBy: userData,
              noteli: '',
            } as any,
          });
      }

      if (
        body.status === 'Approved' &&
        updatedCollection.collectionData.status === 'Closed'
      ) {

        const config: any = mailConfig['loan-close'];
        const templateData = config.buildData(lead);

        const domain = req.headers['x-tenant-domain'] || req.headers['host'];
        await this.statusQueue.add(
          'reloan-sms',
          {
            customerId: Number(lead.customer.customerID),
            domain,
          },
          {
            jobId: `reloanSMS-${Number(lead.customer.customerID)}`,
            delay: 30 * 60 * 1000,  //First run after 30 minutes
            // repeat: {
            //   every: 2 * 60 * 60 * 1000, // 2 hours
            // },
            removeOnComplete: true,
            removeOnFail: true,
          },
        );

        const emailRes = await this.MailService.sendCustomMail(
          lead.customer.email,
          config.subject,
          config.smtpType,
          config.template,
          templateData,
        );

        if (emailRes?.status) {
          await this.tenantPrisma.client.notifications.create({
            data: {
              customerID: Number(lead.customerID),
              leadID: Number(collectionDatas.leadID),
              sender_email: emailRes.sender_email,
              notification: emailRes.html,
              type: 'Email',
              subject: 'Loan Close Letter',
              senderUser: Number(userData),
              createdDate: new Date(),
              mtype: 'crm',
            } as any,
          });

          await this.tenantPrisma.client.callhistorylogs.create({
            data: {
              customerID: Number(lead.customerID),
              leadID: Number(collectionDatas.leadID),
              callType: 'Mail',
              status: 'loan-close-letter',
              remark: 'loan-close-letter',
              calledBy: userData,
              noteli: 'loan-close-letter',
            } as any,
          });
        }

      }

      const tenant = await this.CibilService.getCurrentDomain(req);
      await this.cacheService.del(CacheKey.lead(tenant, Number(lead.leadId), 'Profile'));
      await this.cacheService.del(CacheKey.lead(tenant, Number(lead.leadId), 'LeadHistory'));
      return convertBigIntToString({
        statusCode: 200,
        message:
          'Collection status updated successfully And Leads Status Updated',
        data: updatedCollection,
      });
    } catch (err: any) {
      console.error('Error updating collection status:', err);
      return {
        statusCode: 500,
        error: 'Failed to update collection status',
        details: err.message,
      };
    }
  }

  async getCollectionApprovalPending({
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
      const where: any = {
        collectionStatus: 'Approval Waiting',
      };

      if (filters.fromDate && filters.toDate) {
        const from = new Date(`${filters.fromDate}T00:00:00.000Z`);
        const to = new Date(`${filters.toDate}T23:59:59.999Z`);

        where.createdDate = {
          gte: from,
          lte: to,
        };
      }

      if (search) {
        where.OR = [
          {
            lead: {
              customer: {
                name: { contains: search },
              },
            },
          },
        ];
      }

      const userData = await this.clsService.get('user');

      const userRole = await this.authService.getUserById(userData);

      const headRoleValues = Object.values(HeadRoles);

      if (!headRoleValues.includes(userRole.role)) {
        return {
          statusCode: 403,
          message: 'You are not allowed to perform this action',
        };
      }

      const [leads, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.collection.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdDate: 'desc' },
          include: {
            lead: {
              select: {
                leadID: true,
                loanRequeried: true,
                monthlyIncome: true,
                city: true,
                state: true,
                pincode: true,
                status: true,
                fbLeads: true,
                createdDate: true,
                customer: {
                  select: {
                    name: true,
                    email: true,
                  },
                },

                loan: true,
              },
            },
            collectedByUser: {
              select: {
                name: true,
                email: true,
                mobile_number: true,
              },
            },
          },
        }),
        this.tenantPrisma.client.collection.count({ where }),
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
      console.error('Error fetching collection approval pending:', err);
      return {
        statusCode: 500,
        error: 'Failed to fetch collection approval pending',
        details: err.message,
      };
    }
  }

  async getCollectionApproved({
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
      const where: any = {
        collectionStatus: 'Approved',
      };

      if (filters.fromDate && filters.toDate) {
        const from = new Date(`${filters.fromDate}T00:00:00.000Z`);
        const to = new Date(`${filters.toDate}T23:59:59.999Z`);

        where.approvedDate = {
          gte: from,
          lte: to,
        };
      }

      if (search) {
        where.OR = [
          {
            lead: {
              customer: {
                name: { contains: search },
              },
            },
          },
        ];
      }

      const userData = await this.clsService.get('user');

      const userRole = await this.authService.getUserById(userData);

      const headRoleValues = Object.values(HeadRoles);

      if (!headRoleValues.includes(userRole.role)) {
        return {
          statusCode: 403,
          message: 'You are not allowed to perform this action',
        };
      }

      const [leads, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.collection.findMany({
          where,
          skip,
          take: limit,
          orderBy: { approvedDate: 'desc' },
          include: {
            lead: {
              select: {
                leadID: true,
                loanRequeried: true,
                monthlyIncome: true,
                city: true,
                state: true,
                pincode: true,
                status: true,
                fbLeads: true,
                createdDate: true,
                customer: {
                  select: {
                    name: true,
                    email: true,
                  },
                },

                loan: true,
              },
            },
            collectedByUser: {
              select: {
                name: true,
                email: true,
                mobile_number: true,
              },
            },
            statusUpdatedByUser: {
              select: {
                name: true,
                email: true,
                mobile_number: true,
              },
            },
          },
        }),
        this.tenantPrisma.client.collection.count({ where }),
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
      console.error('Error fetching collection approval pending:', err);
      return {
        statusCode: 500,
        error: 'Failed to fetch collection approval pending',
        details: err.message,
      };
    }
  }

  async getCollectionRejected({
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
      const where: any = {
        collectionStatus: 'Payment Rejected',
      };
      if (filters.fromDate && filters.toDate) {
        const from = new Date(`${filters.fromDate}T00:00:00.000Z`);
        const to = new Date(`${filters.toDate}T23:59:59.999Z`);
        where.approvedDate = {
          gte: from,
          lte: to,
        };
      }
      if (search) {
        where.OR = [
          {
            lead: {
              customer: {
                name: { contains: search },
              },
            },
          },
        ];
      }
      const [leads, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.collection.findMany({
          where,
          skip,
          take: limit,
          orderBy: { approvedDate: 'desc' },
          include: {
            lead: {
              select: {
                leadID: true,
                loanRequeried: true,
                monthlyIncome: true,
                city: true,
                state: true,
                pincode: true,
                status: true,
                fbLeads: true,
                createdDate: true,
                customer: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
                loan: true,
              },
            },
            collectedByUser: {
              select: {
                name: true,
                email: true,
                mobile_number: true,
              },
            },
            statusUpdatedByUser: {
              select: {
                name: true,
                email: true,
                mobile_number: true,
              },
            },
          },
        }),
        this.tenantPrisma.client.collection.count({ where }),
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
      console.error('Error fetching collection rejected:', err);
      return {
        statusCode: 500,
        error: 'Failed to fetch collection rejected',
        details: err.message,
      };
    }
  }

  async createCollectionFollowUp(body: any, leadId: string) {
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
              customerID: true,
              firstName: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!lead) {
        return { statusCode: 404, message: 'Lead not found' };
      }

      const allowedKeys = [
        'followType',
        'StatusType',
        'remark',
        'StatusTypeDate',
      ];

      const updateData: any = {};

      for (const key of allowedKeys) {
        const val = body[key];
        if (val !== null && val !== undefined) {
          if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed !== '') updateData[key] = trimmed;
          } else {
            updateData[key] = val;
          }
        }
      }

      if (Object.keys(updateData).length === 0) {
        return {
          statusCode: 400,
          message: 'No valid fields to create collection followup',
        };
      }

      const requiredFields = ['followType', 'StatusType', 'remark'];

      const followTypes = ['Call', 'Mail', 'Whatsapp', 'SMS', 'No Conatct'];

      const statusTypes = [
        'PTP',
        'Ringing',
        'Busy',
        'Disconnected the Call',
        'Out Of Network',
        'Delivered',
        'Not Delivered',
        'No response after reading',
        'Switch Off',
      ];

      for (const field of requiredFields) {
        if (!updateData[field]) {
          return {
            statusCode: 400,
            message: `Missing required field: ${field}`,
          };
        }
      }

      // ✅ Validate followType
      if (!followTypes.includes(updateData.followType)) {
        return {
          statusCode: 400,
          message: `Invalid followType. Allowed values are: ${followTypes.join(', ')}`,
        };
      }

      // ✅ Validate StatusType
      if (!statusTypes.includes(updateData.StatusType)) {
        return {
          statusCode: 400,
          message: `Invalid StatusType. Allowed values are: ${statusTypes.join(', ')}`,
        };
      }

      if (
        updateData.StatusType === 'PTP' &&
        (!body.StatusTypeDate || body.StatusTypeDate.trim() === '')
      ) {
        return {
          statusCode: 400,
          message: 'StatusTypeDate is required when StatusType is PTP',
        };
      }

      const userData = await this.clsService.get('user');

      const createdFollowUp =
        await this.tenantPrisma.client.collectionfollowup.create({
          data: {
            leadID: Number(leadId),
            customerID: Number(lead.customer.customerID),
            loanNo: lead.loan.loanNo,
            followType: updateData.followType,
            StatusType: updateData.StatusType,
            statusTypeDate:
              updateData.StatusType === 'PTP'
                ? updateData.StatusTypeDate
                : null,
            remark: updateData.remark,
            createdBy: Number(userData),
            followup_type: Number(0),
            createdDate: new Date(),
          },
        } as any);

      const createLog = await this.tenantPrisma.client.callhistorylogs.create({
        data: {
          leadID: Number(leadId),
          customerID: Number(lead.customer.customerID),
          callType: 'IVR',
          status: updateData.StatusType,
          noteli: updateData.followType,
          remark: updateData.remark,
          callbackTime: new Date(),
          calledBy: Number(userData),
          createdDate: new Date(),
        },
      } as any);

      if (updateData.StatusType === 'PTP') {
        const mailData = {
          SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
          SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
          COMPANY_NAME: process.env.COMPANY_NAME,
          name: lead.customer.name,
          commitmentDate: new Date().toISOString().split('T')[0],
          paymentDate: updateData.StatusTypeDate,
        };
        const emailRes = await this.MailService.sendCustomMail(
          lead.customer.email,
          `Promise to pay payment ${mailData.COMPANY_NAME}`,
          'recovery',
          'ptp.hbs',
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
              subject: 'Promise to pay Payment',
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
              status: 'Promise to pay Payment',
              remark: 'Promise to pay Payment',
              calledBy: userData,
              noteli: 'Promise to pay Payment',
            } as any,
          });
        }
      }

      return convertBigIntToString({
        statusCode: 200,
        message: 'Collection follow up created successfully',
        data: createdFollowUp,
      });
    } catch (err: any) {
      console.error('Error create collection follow up:', err);
      return {
        statusCode: 500,
        error: 'Failed to create collection follow up',
        details: err.message,
      };
    }
  }

  async getCollectionFollowUps(leadId: string) {
    try {
      if (!leadId) {
        return {
          statusCode: 400,
          msg: 'leadId is required',
        };
      }

      const followUps =
        await this.tenantPrisma.client.collectionfollowup.findMany({
          where: { leadID: Number(leadId) },
          orderBy: { createdDate: 'desc' },
        });

      if (!followUps.length) {
        return {
          statusCode: 200,
          message: 'No collection follow ups found',
          data: [],
        };
      }

      const aiFollowUps = await this.tenantPrisma.client.ai_call_logs.findMany({
        where: {
          leadID: Number(leadId),
          status: {
            not: "null"
          }
        },
        select: {
          customerID: true,
          status:true,
          createdAt:true,
          aiCallAnalysis: true
        }
      })

      // ✅ 1. Extract unique createdBy IDs
      const userIds = [
        ...new Set(followUps.map((f) => f.createdBy).filter(Boolean)), 155
      ];

      // ✅ 2. Fetch LMS users
      const users = await this.tenantPrisma.client.lms_users.findMany({
        where: {
          userID: { in: userIds },
        },
        select: {
          userID: true,
          name: true,
          email: true,
          mobile_number: true,
          role: true,
        },
      });

      // ✅ 3. Create map for fast lookup
      const userMap = new Map(users.map((user) => [user.userID, user]));

      // ✅ 4. Attach user data to followUps
      const mappedFollowUps = followUps.map((followUp) => ({
        ...followUp,
        createdByUser: userMap.get(followUp.createdBy) || null,
      }));

      const systemUserId = await this.globalService.getSystemUserId();

      const mappedAiFollowUps = aiFollowUps.map((ai: any) => ({
        reviewID: null,
        customerID: ai?.customerID,
        leadID: Number(leadId),
        loanNo: null,
        followType: 'AI Call',
        StatusType: ai?.status || null,
        statusTypeDate: ai.aiCallAnalysis?.tentativeDate || null,
        remark: ai.aiCallAnalysis?.summary || ai.aiCallAnalysis?.hangupcause || null,
        createdBy: systemUserId,
        createdDate: ai.createdAt,
        followup_type: 'AI',
        reason: null,
        s3key: null,

        createdByUser: userMap.get(155) || null
      }));

      return normalizeData({
        statusCode: 200,
        message: 'Collection follow ups fetched successfully',
        data: [...mappedFollowUps, ...mappedAiFollowUps],
      });
    } catch (err: any) {
      console.error('Error get collection follow up:', err);
      return {
        statusCode: 500,
        error: 'Failed to get collection follow up',
        details: err.message,
      };
    }
  }

  async updateCollection(body: any, file: any, collectionId: string) {
    try {
      const metadata = body.metadata ? JSON.parse(body.metadata) : [];

      const collectionEntry =
        await this.tenantPrisma.client.collection.findUnique({
          where: { collectionID: Number(collectionId) },
        });

      if (!collectionEntry) {
        return { statusCode: 404, message: 'CollectionEntry not found' };
      }

      if (collectionEntry.collectionStatus === 'Approved') {
        return {
          statusCode: 404,
          message: 'Collection is Already Approved so it cannot be Update',
        };
      }

      const lead: any = await this.tenantPrisma.client.leads.findUnique({
        where: { leadID: Number(collectionEntry.leadID) },
        include: { customer: true, loan: true },
      });

      if (!lead) {
        return { statusCode: 404, message: 'Lead not found' };
      }

      const userData = await this.clsService.get('user');

      const userRole = await this.authService.getUserById(userData);

      const headRoleValues = Object.values(HeadRoles);

      if (!headRoleValues.includes(userRole.role)) {
        lead.collectionUID = userRole.userID;
      }

      const allowedKeys = [
        'collectedAmount',
        'collectedMode',
        'referenceNo',
        'collectedDate',
        'status',
      ];

      const numericKeys = ['collectedAmount'];
      const updateData: any = {};

      for (const key of allowedKeys) {
        if (body[key] !== undefined) {
          if (numericKeys.includes(key)) {
            const val = Number(body[key]);
            if (isNaN(val)) {
              return {
                statusCode: 400,
                message: `${key} must be a valid number.`,
              };
            }
            updateData[key] = val;
          } else {
            updateData[key] = body[key];
          }
        }
      }

      if (body.status) {
        const validStatuses = Object.values(collection_status);
        if (!validStatuses.includes(body.status)) {
          return {
            statusCode: 400,
            message: `Invalid status. Allowed: ${validStatuses.join(', ')}`,
          };
        }
        updateData.status = body.status;
      }

      if (body.collectedMode) {
        const validModes = Object.values(collection_collectedMode);
        if (!validModes.includes(body.collectedMode)) {
          return {
            statusCode: 400,
            message: `Invalid collectedMode. Allowed: ${validModes.join(', ')}`,
          };
        }
        updateData.collectedMode = body.collectedMode;
      }

      if (body.collectedDate) {
        const parsedDate = new Date(body.collectedDate);

        if (isNaN(parsedDate.getTime())) {
          return {
            statusCode: 400,
            message: `collectedDate must be in valid date format (ISO 8601).`,
          };
        }

        updateData.collectedDate = parsedDate.toISOString();
      }

      if (updateData.collectedMode === 'DISCOUNT') {
        updateData.discountAmount = updateData.collectedAmount;
        updateData.collectedAmount = 0;
      }

      let uploadResult: any = null;

      try {
        if (file) {
          uploadResult = await this.FileService.uploadFileToS3(
            file.buffer,
            file.originalname,
            'Payment Screenshot',
            String(lead.customer.customerID),
            String(lead.leadID),
          );

          if (!uploadResult || !uploadResult.key) {
            return {
              statusCode: 500,
              message: 'File upload failed. Collection not created.',
            };
          }
        }
      } catch (err: any) {
        return {
          statusCode: 500,
          message: 'File upload failed',
          details: err.message,
        };
      }

      if (uploadResult && uploadResult?.key) {
        updateData.s3key = uploadResult.key;
      }

      const created = await this.tenantPrisma.client.$transaction(
        async (tx) => {
          const collection = await tx.collection.update({
            where: { collectionID: Number(collectionId) },
            data: updateData,
          });
          const callHistorylogs = await tx.callhistorylogs.create({
            data: {
              customerID: Number(lead.customer.customerID),
              leadID: Number(lead.leadID),
              callType: 'IVR',
              appAmount:
                String(body.collectedAmount) ||
                String(collectionEntry.collectedAmount),
              status: 'Approval Waiting',
              remark: body.status || collectionEntry.collectionStatus,
              calledBy: userData,
              noteli: '',
            } as any,
          });

          return { sucess: true };
        },
      );

      return {
        statusCode: 200,
        message: 'collection Entry Updated Sucessfully.',
        data: created,
      };
    } catch (err: any) {
      console.error('Error to update collection', err);
      return {
        statusCode: 500,
        error: 'Failed to update collection ',
        details: err.message,
      };
    }
  }

  async closedExcel(
    res: Response,
    { fromDate, toDate }: { fromDate: string; toDate: string },
  ) {
    try {
      const collectionWhere: any = {
        collectionStatus: 'Approved',
        status: {
          in: ['Closed', 'Part_Payment'],
        },
        lead: {
          status: 'Closed',
        },
      };

      if (fromDate && toDate) {
        collectionWhere.collectedDate = {
          gte: new Date(`${fromDate}T00:00:00.000Z`),
          lte: new Date(`${toDate}T23:59:59.999Z`),
        };
      }

      const collections = await this.tenantPrisma.client.collection.findMany({
        where: collectionWhere,
        orderBy: { createdDate: 'desc' }, // ORDER BY collection.createdDate
        select: {
          leadID: true,
        },
      });

      const uniqueLeadIds = [
        ...new Map(collections.map((c) => [c.leadID, c])).keys(),
      ];

      const leads = await this.tenantPrisma.client.leads.findMany({
        where: {
          leadID: { in: uniqueLeadIds },
        },
        include: {
          approvals: {
            select: {
              roi: true,
              repayDate: true,
              adminFee: true,
              GstOfAdminFee: true,
              loanAmtApproved: true,
              tenure: true,
            },
          },
          loan: true,
          customer: {
            select: {
              name: true,
              email: true,
              mobile: true,
            },
          },
          collections: {
            where: collectionWhere,
            orderBy: { collectedDate: 'desc' },
          },
        },
      });

      const orderedLeads = uniqueLeadIds.map((id) =>
        leads.find((lead) => lead.leadID === id),
      );

      const collectionData = normalizeData(orderedLeads);

      let workbook = new ExcelJS.Workbook();

      const sheetName = `closed ${fromDate} to ${toDate}`.slice(0, 31);

      const sheet = workbook.addWorksheet(sheetName);

      sheet.columns = [
        { header: 'Loan No', key: 'loanNo', width: 20 },
        { header: 'Status', key: 'status', width: 20 },
        { header: 'Sanctioned Amount', key: 'sanctionedAmount', width: 20 },
        { header: 'ROI', key: 'roi', width: 20 },
        { header: 'PF', key: 'PF', width: 20 },
        { header: 'Interest Amount', key: 'interestAmount', width: 20 },
        { header: 'Repayment Amount', key: 'repaymentAmount', width: 20 },
        { header: 'Disbursed Date', key: 'disbursedDate', width: 20 },
        { header: 'Repayment Date', key: 'repaymentDate', width: 20 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'PAN', key: 'pan', width: 20 },
        { header: 'State', key: 'state', width: 20 },
        { header: 'City', key: 'city', width: 20 },
        { header: 'Collection Status', key: 'collectionStatus', width: 20 },
        { header: 'Payment Date', key: 'paymentDate', width: 20 },
        { header: 'Paid Amount', key: 'paidAmount', width: 20 },
        { header: 'Payment Reference', key: 'paymentReference', width: 20 },
        { header: 'Payment Mode', key: 'paymentMode', width: 20 },
        { header: 'Discount Amount', key: 'discountAmount', width: 20 },
      ];

      sheet.getRow(1).font = { bold: true };

      collectionData &&
        collectionData.forEach((loan) => {
          const approval = loan.approvals[0];

          const adminFees =
            Number(approval?.adminFee) + Number(approval?.GstOfAdminFee);
          const interestAmount =
            (Number(loan.loan.disbursalAmount) *
              Number(approval.roi) *
              Number(approval.tenure)) /
            100;

          const repaymentAmount =
            Number(loan.loan.disbursalAmount) + Math.round(interestAmount);

          const discountAmount = loan.collections.reduce(
            (sum: number, collection: any) => {
              return collection.collectedMode === 'DISCOUNT'
                ? sum + Number(collection.collectedAmount || 0)
                : sum;
            },
            0,
          );

          const leadsWithTotal = loan.collections.reduce(
            (sum: number, collection: any) => {
              return collection.collectedMode !== 'DISCOUNT'
                ? sum + Number(collection.collectedAmount || 0)
                : sum;
            },
            0,
          );

          const pf =
            (Number(adminFees) / Number(loan.loan.disbursalAmount)) * 100;

          sheet.addRow({
            loanNo: loan?.loan?.loanNo,
            status: loan?.status,
            sanctionedAmount: loan?.loan?.disbursalAmount,
            roi: approval.roi,
            PF: pf.toFixed(2),
            interestAmount: interestAmount,
            repaymentAmount: repaymentAmount,
            disbursedDate: loan.loan?.disbursalDate,
            repaymentDate: approval?.repayDate
              ? new Date(approval.repayDate).toISOString().split('T')[0]
              : null,
            name: loan?.customer?.name,
            pan: loan?.customer?.pancard,
            state: loan?.state,
            city: loan?.city,
            collectionStatus: loan?.collections[0].status,
            paymentDate: loan?.collections[0].collectedDate
              ? new Date(loan?.collections[0].collectedDate)
                .toISOString()
                .split('T')[0]
              : null,

            paidAmount: leadsWithTotal,
            discountAmount: discountAmount,
            paymentReference: loan?.collections[0].referenceNo,
            paymentMode: loan?.collections[0].collectedMode,
          });
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
    } catch (err) {
      return {
        statusCode: 500,
        success: false,
        message: 'Error in Export',
      };
    }
  }

  async partPaymentExcel(
    res: Response,
    { fromDate, toDate }: { fromDate: string; toDate: string },
  ) {
    try {
      const collectionWhere: any = {
        collectionStatus: 'Approved',
        status: 'Part_Payment',
        lead: {
          status: 'Part_Payment',
        },
      };

      if (fromDate && toDate) {
        collectionWhere.collectedDate = {
          gte: new Date(`${fromDate}T00:00:00.000Z`),
          lte: new Date(`${toDate}T23:59:59.999Z`),
        };
      }
      const collections = await this.tenantPrisma.client.collection.findMany({
        where: collectionWhere,
        orderBy: { createdDate: 'desc' },
        select: {
          leadID: true,
        },
      });

      const uniqueLeadIds = [
        ...new Map(collections.map((c) => [c.leadID, c])).keys(),
      ];

      const leads = await this.tenantPrisma.client.leads.findMany({
        where: {
          leadID: { in: uniqueLeadIds },
        },
        include: {
          approvals: {
            select: {
              roi: true,
              repayDate: true,
              adminFee: true,
              GstOfAdminFee: true,
              loanAmtApproved: true,
              tenure: true,
            },
          },
          loan: true,
          customer: {
            select: {
              name: true,
              email: true,
              mobile: true,
            },
          },
          collections: {
            where: collectionWhere,
            orderBy: { collectedDate: 'desc' },
          },
        },
      });

      const orderedLeads = uniqueLeadIds.map((id) =>
        leads.find((lead) => lead.leadID === id),
      );

      const collectionData = normalizeData(orderedLeads);

      let workbook = new ExcelJS.Workbook();

      const sheetName = `PartPayment ${fromDate} to ${toDate}`.slice(0, 31);

      const sheet = workbook.addWorksheet(sheetName);

      sheet.columns = [
        { header: 'Loan No', key: 'loanNo', width: 20 },
        { header: 'Status', key: 'status', width: 20 },
        { header: 'Sanctioned Amount', key: 'sanctionedAmount', width: 20 },
        { header: 'ROI', key: 'roi', width: 20 },
        { header: 'PF', key: 'PF', width: 20 },
        { header: 'Interest Amount', key: 'interestAmount', width: 20 },
        { header: 'Repayment Amount', key: 'repaymentAmount', width: 20 },
        { header: 'Disbursed Date', key: 'disbursedDate', width: 20 },
        { header: 'Repayment Date', key: 'repaymentDate', width: 20 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'PAN', key: 'pan', width: 20 },
        { header: 'State', key: 'state', width: 20 },
        { header: 'City', key: 'city', width: 20 },
        { header: 'Collection Status', key: 'collectionStatus', width: 20 },
        { header: 'Payment Date', key: 'paymentDate', width: 20 },
        { header: 'Paid Amount', key: 'paidAmount', width: 20 },
        { header: 'Payment Reference', key: 'paymentReference', width: 20 },
        { header: 'Payment Mode', key: 'paymentMode', width: 20 },
      ];

      sheet.getRow(1).font = { bold: true };

      collectionData &&
        collectionData.forEach((loan) => {
          const approval = loan.approvals[0];

          const adminFees =
            Number(approval?.adminFee) + Number(approval?.GstOfAdminFee);
          const interestAmount =
            (Number(loan.loan.disbursalAmount) *
              Number(approval.roi) *
              Number(approval.tenure)) /
            100;

          const repaymentAmount =
            Number(loan.loan.disbursalAmount) + Math.round(interestAmount);

          const leadsWithTotal = loan.collections.reduce(
            (sum: number, collection: any) =>
              sum + (collection?.collectedAmount || 0),
            0,
          );

          const pf =
            (Number(adminFees) / Number(loan.loan.disbursalAmount)) * 100;

          sheet.addRow({
            loanNo: loan?.loan?.loanNo,
            status: loan?.status,
            sanctionedAmount: loan?.loan?.disbursalAmount,
            roi: approval.roi,
            PF: pf.toFixed(2),
            interestAmount: interestAmount,
            repaymentAmount: repaymentAmount,
            disbursedDate: loan.loan?.disbursalDate,
            repaymentDate: approval?.repayDate
              ? new Date(approval.repayDate).toISOString().split('T')[0]
              : null,
            name: loan?.customer?.name,
            pan: loan?.customer?.pancard,
            state: loan?.state,
            city: loan?.city,
            collectionStatus: loan?.collections[0].status,
            paymentDate: loan?.collections[0].collectedDate
              ? new Date(loan?.collections[0].collectedDate)
                .toISOString()
                .split('T')[0]
              : null,

            paidAmount: leadsWithTotal,
            paymentReference: loan?.collections[0].referenceNo,
            paymentMode: loan?.collections[0].collectedMode,
          });
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
      return {
        statusCode: 500,
        success: false,
        message: 'Error in Export',
      };
    }
  }

  async settelmentPaymentExcel(
    res: Response,
    { fromDate, toDate }: { fromDate: string; toDate: string },
  ) {
    try {
      const collectionWhere: any = {
        status: {
          in: ['Settlement', 'Part_Payment'],
        },
        collectionStatus: 'Approved',
        lead: {
          status: 'Settlement',
        },
      };

      if (fromDate && toDate) {
        collectionWhere.collectedDate = {
          gte: new Date(`${fromDate}T00:00:00.000Z`),
          lte: new Date(`${toDate}T23:59:59.999Z`),
        };
      }
      const collections = await this.tenantPrisma.client.collection.findMany({
        where: collectionWhere,
        orderBy: { createdDate: 'desc' },
        select: {
          leadID: true,
        },
      });

      const uniqueLeadIds = [
        ...new Map(collections.map((c) => [c.leadID, c])).keys(),
      ];

      const leads = await this.tenantPrisma.client.leads.findMany({
        where: {
          leadID: { in: uniqueLeadIds },
        },
        include: {
          approvals: {
            select: {
              roi: true,
              repayDate: true,
              adminFee: true,
              GstOfAdminFee: true,
              loanAmtApproved: true,
              tenure: true,
            },
          },
          loan: true,
          customer: {
            select: {
              name: true,
              email: true,
              mobile: true,
            },
          },
          collections: {
            where: collectionWhere,
            orderBy: { collectedDate: 'desc' },
          },
        },
      });

      const orderedLeads = uniqueLeadIds.map((id) =>
        leads.find((lead) => lead.leadID === id),
      );

      const collectionData = normalizeData(orderedLeads);

      let workbook = new ExcelJS.Workbook();

      const sheetName = `settelment ${fromDate} to ${toDate}`.slice(0, 31);

      const sheet = workbook.addWorksheet(sheetName);

      sheet.columns = [
        { header: 'Loan No', key: 'loanNo', width: 20 },
        { header: 'Status', key: 'status', width: 20 },
        { header: 'Sanctioned Amount', key: 'sanctionedAmount', width: 20 },
        { header: 'ROI', key: 'roi', width: 20 },
        { header: 'PF', key: 'PF', width: 20 },
        { header: 'Interest Amount', key: 'interestAmount', width: 20 },
        { header: 'Repayment Amount', key: 'repaymentAmount', width: 20 },
        { header: 'Disbursed Date', key: 'disbursedDate', width: 20 },
        { header: 'Repayment Date', key: 'repaymentDate', width: 20 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'PAN', key: 'pan', width: 20 },
        { header: 'State', key: 'state', width: 20 },
        { header: 'City', key: 'city', width: 20 },
        { header: 'Collection Status', key: 'collectionStatus', width: 20 },
        { header: 'Payment Date', key: 'paymentDate', width: 20 },
        { header: 'Paid Amount', key: 'paidAmount', width: 20 },
        { header: 'Payment Reference', key: 'paymentReference', width: 20 },
        { header: 'Payment Mode', key: 'paymentMode', width: 20 },
        { header: 'Discount Amount', key: 'discountAmount', width: 20 },
      ];

      sheet.getRow(1).font = { bold: true };

      collectionData &&
        collectionData.forEach((loan) => {
          const approval = loan.approvals[0];

          const adminFees =
            Number(approval?.adminFee) + Number(approval?.GstOfAdminFee);
          const interestAmount =
            (Number(loan.loan.disbursalAmount) *
              Number(approval.roi) *
              Number(approval.tenure)) /
            100;

          const repaymentAmount =
            Number(loan.loan.disbursalAmount) + Math.round(interestAmount);

          const discountAmount = loan.collections.reduce(
            (sum: number, collection: any) => {
              return collection.collectedMode === 'DISCOUNT'
                ? sum + Number(collection.collectedAmount || collection.discountAmount)
                : sum;
            },
            0,
          );

          const leadsWithTotal = loan.collections.reduce(
            (sum: number, collection: any) => {
              return collection.collectedMode !== 'DISCOUNT'
                ? sum + Number(collection.collectedAmount || 0)
                : sum;
            },
            0,
          );
          const pf =
            (Number(adminFees) / Number(loan.loan.disbursalAmount)) * 100;

          sheet.addRow({
            loanNo: loan?.loan?.loanNo,
            status: loan?.status,
            sanctionedAmount: loan?.loan?.disbursalAmount,
            roi: approval.roi,
            PF: pf.toFixed(2),
            interestAmount: interestAmount,
            repaymentAmount: repaymentAmount,
            disbursedDate: loan.loan?.disbursalDate,
            repaymentDate: approval?.repayDate
              ? new Date(approval.repayDate).toISOString().split('T')[0]
              : null,
            name: loan?.customer?.name,
            pan: loan?.customer?.pancard,
            state: loan?.state,
            city: loan?.city,
            collectionStatus: loan?.collections[0].status,
            paymentDate: loan?.collections[0].collectedDate
              ? new Date(loan?.collections[0].collectedDate)
                .toISOString()
                .split('T')[0]
              : null,

            paidAmount: leadsWithTotal,
            discountAmount: discountAmount,
            paymentReference: loan?.collections[0].referenceNo,
            paymentMode: loan?.collections[0].collectedMode,
          });
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
    } catch (err) {
      return {
        statusCode: 500,
        success: false,
        message: 'Error in Export',
      };
    }
  }

  async bankTransferCases(body: any) {
    try {
      const { customerID, isBtCase } = body;

      // Validate payload
      if (!customerID) {
        throw new BadRequestException('customerID is required');
      }

      if (typeof isBtCase !== 'boolean') {
        throw new BadRequestException('isBtCase must be true or false');
      }

      // Upsert operation
      const response = await this.tenantPrisma.client.customer_extended.upsert({
        where: {
          customerID: customerID,
        },

        update: {
          isBtCase: isBtCase,
        },

        create: {
          customerID: customerID,
          isBtCase: isBtCase,
        },
      });

      return {
        statusCode: 'OK',
        message: 'Bank transfer case updated successfully',
        data: response,
      };
    } catch (error: any) {
      console.log('bankTransferCases Error =>', error);

      // Prisma known errors
      if (error.code === 'P2002') {
        throw new ConflictException('Customer already exists');
      }

      // Validation errors
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      // Default server error
      throw new InternalServerErrorException(
        'Something went wrong while updating bank transfer case',
      );
    }
  }
}
