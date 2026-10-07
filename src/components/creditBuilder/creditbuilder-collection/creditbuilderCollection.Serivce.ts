import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import {
  collection_collectedMode,
  collection_status,
  document_status,
} from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CacheService } from '../../cache/cache.service';
import { CibilService } from '../../cibil/cibil.service';
import { TenantPrismaService } from '../../../prisma/tenet-prisma.service';
import { FileService } from '../../fileUploads/file.service';
import { MailService } from '../../mail/mail.service';
import { AuthService } from '../../auth/auth.service';
import { HeadRoles } from '../../../utility/enums';
import { convertBigIntToString, normalizeData } from '../../../utility/helper';
import { CacheKey } from '../../cache/cache.keys';
import { mailConfig } from '../../../common/config/ mailConfig';
// import { mailConfig } from '../../mail/ mailConfig';

@Injectable()
export class CreditBuilderCollectionService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private configService: ConfigService,
    private readonly clsService: ClsService,
    private readonly authService: AuthService,
    private readonly FileService: FileService,
    private readonly MailService: MailService,
    private readonly cacheService: CacheService,
    private readonly CibilService: CibilService,
    @InjectQueue('reloan-sms')
    private readonly statusQueue: Queue,
  ) {}

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
        creditLead: {
          status: { in: ['Disbursed'] },
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
            creditLead: {
              customer: {
                firstName: { contains: search },
              },
            },
          },
          {
            creditLead: {
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
        this.tenantPrisma.client.credit_improve_approval.findMany({
          where: whereClause,
          select: {
            repayDate: true,
            loanAmtApproved: true,
            roi: true,
            tenure: true,
            leadID: true,
            creditLead: {
              select: {
                status: true,
                creditImproveLoan: {
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
        this.tenantPrisma.client.credit_improve_approval.count({
          where: whereClause,
        }),
      ]);

      console.log(data, total, 'line no 177');

      // 🧩 Format response
      const formattedData = data.map((item) => ({
        repayDate: item.repayDate,
        loanAmtApproved: item.loanAmtApproved,
        roi: item.roi,
        tenure: item.tenure,
        leadID: item.leadID,
        name: `${item.creditLead.customer?.firstName ?? ''} ${item.creditLead.customer?.lastName ?? ''}`.trim(),
        loanNo: item.creditLead.creditImproveLoan?.loanNo ?? '',
        leadStatus: item.creditLead.status,
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
        creditLead: {
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

      const collections =
        await this.tenantPrisma.client.credit_improve_collection.findMany({
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

      const leads =
        await this.tenantPrisma.client.credit_improve_leads.findMany({
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
            creditImproveCollections: {
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
    req: any,
  ) {
    try {
      const metadata = body.metadata ? JSON.parse(body.metadata) : [];

      const lead: any =
        await this.tenantPrisma.client.credit_improve_leads.findUnique({
          where: { leadID: Number(leadId) },
          include: { customer: true, creditImproveLoan: true },
        });

      console.log(lead);

      if (!lead) {
        return { statusCode: 404, message: 'Lead not found' };
      }

      if (!lead.customer) {
        return { statusCode: 404, message: 'Customer not found for the lead' };
      }

      if (!lead.creditImproveLoan) {
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
        updateData.discountAmount = updateData.collectedAmount;
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
      console.log(lead, 'line no 484');
      const created = await this.tenantPrisma.client.$transaction(
        async (tx) => {
          const collection = await tx.credit_improve_collection.create({
            data: {
              ...updateData,
              leadID: Number(leadId),
              customerID: lead.customer.customerID.toString(),
            //   s3key: uploadResult?.key || null,
              collectionStatus: 'Approval Waiting',
              loanNo: lead.creditImproveLoan.loanNo,
              remark: '',
              collectedBy: userData,
            },
          });

        //   if (uploadResult?.key) {
        //     await tx.document.create({
        //       data: {
        //         customerID: Number(lead.customer.customerID),
        //         documentType: 'Payment Screenshot',
        //         documentFile: uploadResult.key,
        //         pushData: Number(leadId),
        //         status: document_status.Pending,
        //         verifiedBy: Number(1),
        //         uploadBy: Number(userData),
        //         uploadedDate: new Date(),
        //       } as any,
        //     });
        //   }

          const tenant = await this.CibilService.getCurrentDomain(req);
          await this.cacheService.del(
            CacheKey.lead(tenant, Number(leadId), 'Profile'),
          );

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
        await this.tenantPrisma.client.credit_improve_collection.findUnique({
          where: { collectionID: Number(collectionId) },
        });

      if (!collectionDatas) {
        return { statusCode: 404, message: 'Collection not found' };
      }

      const pendingCollection =
        await this.tenantPrisma.client.credit_improve_collection.findMany({
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

      const lead: any =
        await this.tenantPrisma.client.credit_improve_leads.findUnique({
          where: { leadID: collectionDatas.leadID },
          include: {
            customer: true,
            creditImproveLoan: true,
            creditApprovals: true,
            creditImproveCollections: {
              where: {
                collectionStatus: 'Approved',
              },
            },
          },
        });

      const updatedCollection: any =
        await this.tenantPrisma.client.$transaction(async (tx: any) => {
          const collectionData = await tx.credit_improve_collection.update({
            where: { collectionID: Number(collectionId) },
            data: {
              collectionStatus: body.status,
              collectionStatusby: userData,
              approvedDate: new Date(),
            },
          });
          return { collectionData };
        });

      let leadsData;

      console.log(lead, 'line no 634')
      if (body.status === 'Approved') {
        const leadsStatus: any = collectionDatas.status;
        leadsData = await this.tenantPrisma.client.credit_improve_leads.update({
          where: { leadID: Number(lead.leadID) },
          data: {
            status: leadsStatus,
          },
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
            delay: 30 * 60 * 1000, //First run after 30 minutes
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
          console.log(emailRes);
        }
      }

      const tenant = await this.CibilService.getCurrentDomain(req);
      await this.cacheService.del(
        CacheKey.lead(tenant, Number(lead.leadId), 'Profile'),
      );
      await this.cacheService.del(
        CacheKey.lead(tenant, Number(lead.leadId), 'LeadHistory'),
      );
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
            creditLead: {
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
        this.tenantPrisma.client.credit_improve_collection.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdDate: 'desc' },
          include: {
            creditLead: {
              select: {
                leadID: true,
                loanRequeried: true,

                status: true,
                fbLeads: true,
                createdDate: true,
                customer: {
                  select: {
                    name: true,
                    email: true,
                  },
                },

                creditImproveLoan: true,
              },
            },
            // collectedBy:true
            // collectedBy: {
            //   select: {
            //     name: true,
            //     email: true,
            //     mobile_number: true,
            //   },
            // },
          },
        }),
        this.tenantPrisma.client.credit_improve_collection.count({ where }),
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
        this.tenantPrisma.client.credit_improve_collection.findMany({
          where,
          skip,
          take: limit,
          orderBy: { approvedDate: 'desc' },
          include: {
            creditLead: {
              select: {
                leadID: true,
                loanRequeried: true,

                status: true,
                fbLeads: true,
                createdDate: true,
                customer: {
                  select: {
                    name: true,
                    email: true,
                  },
                },

                creditImproveLoan: true,
              },
            },
            // collectionStatusby:true
            // collectedByUser: {
            //   select: {
            //     name: true,
            //     email: true,
            //     mobile_number: true,
            //   },
            // },
            // statusUpdatedByUser: {
            //   select: {
            //     name: true,
            //     email: true,
            //     mobile_number: true,
            //   },
            // },
          },
        }),
        this.tenantPrisma.client.credit_improve_collection.count({ where }),
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
        this.tenantPrisma.client.credit_improve_collection.findMany({
          where,
          skip,
          take: limit,
          orderBy: { approvedDate: 'desc' },
          include: {
            creditLead: {
              select: {
                leadID: true,

                status: true,
                fbLeads: true,
                createdDate: true,
                customer: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
                creditImproveLoan: true,
              },
            },
            // collectedByUser: {
            //   select: {
            //     name: true,
            //     email: true,
            //     mobile_number: true,
            //   },
            // },
            // statusUpdatedByUser: {
            //   select: {
            //     name: true,
            //     email: true,
            //     mobile_number: true,
            //   },
            // },
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

  async updateCollection(body: any, file: any, collectionId: string) {
    try {
      const metadata = body.metadata ? JSON.parse(body.metadata) : [];

      const collectionEntry =
        await this.tenantPrisma.client.credit_improve_collection.findUnique({
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

      const lead: any =
        await this.tenantPrisma.client.credit_improve_leads.findUnique({
          where: { leadID: Number(collectionEntry.leadID) },
          include: { customer: true, creditImproveLoan: true },
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
}
