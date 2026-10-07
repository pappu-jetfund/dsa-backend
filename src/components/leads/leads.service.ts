import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { stat } from 'fs';
import { ClsService } from 'nestjs-cls';
import {
  convertBigIntToString,
  getBureauConfig,
  normalize,
  normalizeData,
} from '../../utility/helper';
import { AuthService } from '../auth/auth.service';
import { approval_status, leads_status } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { FileService } from '../fileUploads/file.service';
import { HeadRoles, READ_ONLY_ROLES } from '../../utility/enums';
import Razorpay from 'razorpay';
import { SmsService } from '../sms/sms.service';
import { penalConfig } from '../../common/config/penal.config';
import { GoogleService } from '../googleApi/google.service';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';
import { RoleFilterService } from '../role-filter/role-filter.service';
import { DocumentsService } from '../documents/documents.services';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { CibilService } from '../cibil/cibil.service';
import { bureauConfig } from '../../common/config/cibilConfig';
import { CacheService } from '../cache/cache.service';
import { CacheKey } from '../cache/cache.keys';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { EMANDATE_CONFIG } from '../../common/config/mandate.config';
import { buildJourney, getJourneyConfig, resolveBankRequired } from '../../utility/notonboarded.customer-journey.util';
import { CardCompleted } from '../../common/config/customer-journey.config';

@Injectable()
export class LeadsService {
  private razorpay: Razorpay;
  private readonly EXPORT_BATCH_SIZE = 2000;

  constructor(
    private readonly httpService: HttpService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly clsService: ClsService,
    private configService: ConfigService,
    private readonly authService: AuthService,
    private readonly fileService: FileService,
    private readonly smsService: SmsService,
    private readonly GoogleService: GoogleService,
    private readonly roleFilterService: RoleFilterService,
    private readonly documentsService: DocumentsService,
    private readonly CibilService: CibilService,
    private readonly cacheService: CacheService,

  ) {
    this.razorpay = new Razorpay({
      key_id: this.configService.get<string>('RAZORPAY_KEY_ID', 'test'),
      key_secret: this.configService.get<string>('RAZORPAY_KEY_SECRET', 'test'),
    });
  }

  async getAllLeads({
    page,
    limit,
    search,
    filters,
  }: {
    page: number;
    limit: number;
    search?: string;
    filters: {
      fbleads?: string;
      allSource?: string;
      fromDate?: string;
      toDate?: string;
      status?: string;
      creditUserId: string;
    };
  }) {
    try {
      const skip = (page - 1) * limit;

      const where: any = {};

      const userData = await this.clsService.get('user');
      const userRole = await this.authService.getUserById(userData);

      const headRoleValues = Object.values(HeadRoles);

      if (!headRoleValues.includes(userRole.role)) {
        where.callAssign = userRole.userID;
      }

      if (filters.fbleads) {
        where.fbLeads = {
          equals: filters.fbleads,
        };
      }
      if (filters.allSource) {
        where.utmSource = { equals: filters.allSource };
      }
      if (filters.fromDate) {
        const from = new Date(filters.fromDate + 'T00:00:00.000Z');
        if (!isNaN(from.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), gte: from };
        }
      }
      if (filters.creditUserId) {
        where.sanctionalloUID = Number(filters.creditUserId);
      }

      if (filters.toDate) {
        // End of the day (23:59:59.999)
        const to = new Date(filters.toDate + 'T23:59:59.999Z');
        if (!isNaN(to.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), lte: to };
        }
      }

      if (filters.status) {
        where.status = {
          equals: filters.status,
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

      const [leads, total, utmSourceAgg, fbLeadsAgg] =
        await this.tenantPrisma.client.$transaction([
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
              sanctionUser: {
                select: {
                  name: true,
                  userID: true,
                },
              },
            },
          }),

          this.tenantPrisma.client.leads.count({ where }),

          this.tenantPrisma.client.leads.groupBy({
            by: ['utmSource'],
            _count: { utmSource: true },
            orderBy: { utmSource: 'asc' },
          }),

          this.tenantPrisma.client.leads.groupBy({
            by: ['fbLeads'],
            _count: { fbLeads: true },
            orderBy: { fbLeads: 'asc' },
          }),
        ]);

      const data = normalizeData(leads);

      const sourcesSummary = utmSourceAgg
        .map((item) => item.utmSource)
        .filter((s) => s && s.trim() !== '');

      const fbLeadsSummary = fbLeadsAgg
        .map((item) => item.fbLeads)
        .filter((f) => f && f.trim() !== '');

      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
        sourcesSummary,
        fbLeadsSummary,
      });
    } catch (err: any) {
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  async getFreshLeads({
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
        status: 'Fresh_Lead',
      };

      const userRole = await this.authService.getUserById(userData);

      const role = this.clsService.get('role');
      const userId = this.clsService.get('user');

      if (![...Object.values(HeadRoles), ...READ_ONLY_ROLES].includes(role)) {
        where.callAssign = userId;
      }

      if (filters.fbleads) {
        where.fbLeads = {
          equals: filters.fbleads,
        };
      }
      if (filters.allSource) {
        where.utmSource = { equals: filters.allSource };
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

      const [leads, total, utmSourceAgg, fbLeadsAgg] =
        await this.tenantPrisma.client.$transaction([
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

          this.tenantPrisma.client.leads.groupBy({
            by: ['utmSource'],
            _count: { utmSource: true },
            orderBy: { utmSource: 'asc' },
          }),

          this.tenantPrisma.client.leads.groupBy({
            by: ['fbLeads'],
            _count: { fbLeads: true },
            orderBy: { fbLeads: 'asc' },
          }),
        ]);

      const data = normalizeData(leads);
      // const data = leads.map((lead: any) => ({
      //   ...lead,
      //   pincode: lead.pincode?.toString(),
      //   customer: lead.customer
      //     ? {
      //         ...lead.customer,
      //         mobile: lead.customer.mobile?.toString(),
      //         aadharNo: lead.customer.aadharNo?.toString(),
      //       }
      //     : null,
      // }));

      const sourcesSummary = utmSourceAgg
        .map((item) => item.utmSource)
        .filter((s) => s && s.trim() !== '');

      const fbLeadsSummary = fbLeadsAgg
        .map((item) => item.fbLeads)
        .filter((f) => f && f.trim() !== '');

      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
        sourcesSummary,
        fbLeadsSummary,
      });
    } catch (err: any) {
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  async getCallBackLeads({
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
      const where: any = {
        status: 'Callback',
      };

      const userData = await this.clsService.get('user');
      const userRole = await this.authService.getUserById(userData);

      const headRoleValues = Object.values(HeadRoles);

      if (!headRoleValues.includes(userRole.role)) {
        where.callAssign = userRole.userID;
      }

      if (filters.fbleads) {
        where.fbLeads = {
          equals: filters.fbleads,
        };
      }
      if (filters.allSource) {
        where.utmSource = { equals: filters.allSource };
      }
      if (filters.fromDate) {
        const from = new Date(filters.fromDate + 'T00:00:00.000Z');
        if (!isNaN(from.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), gte: from };
        }
      }

      if (filters.toDate) {
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

      const [leads, total, utmSourceAgg, fbLeadsAgg] =
        await this.tenantPrisma.client.$transaction([
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

          this.tenantPrisma.client.leads.groupBy({
            by: ['utmSource'],
            _count: { utmSource: true },
            orderBy: { utmSource: 'asc' },
          }),
          this.tenantPrisma.client.leads.groupBy({
            by: ['fbLeads'],
            _count: { fbLeads: true },
            orderBy: { fbLeads: 'asc' },
          }),
        ]);

      const data = normalizeData(leads);
      // const data = leads.map((lead: any) => ({
      //   ...lead,

      //   pincode: lead.pincode?.toString(),
      //   customer: lead.customer
      //     ? {
      //         ...lead.customer,
      //         mobile: lead.customer.mobile?.toString(),
      //         aadharNo: lead.customer.aadharNo?.toString(),
      //       }
      //     : null,
      // }));
      const sourcesSummary = utmSourceAgg
        .map((item) => item.utmSource)
        .filter((s) => s && s.trim() !== '');
      const fbLeadsSummary = fbLeadsAgg
        .map((item) => item.fbLeads)
        .filter((f) => f && f.trim() !== '');
      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
        sourcesSummary,
        fbLeadsSummary,
      });
    } catch (err: any) {
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  async getNotInterestedLeads({
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
      const where: any = {
        status: 'Not_Interested',
      };

      const userData = await this.clsService.get('user');
      const userRole = await this.authService.getUserById(userData);

      const headRoleValues = Object.values(HeadRoles);

      if (!headRoleValues.includes(userRole.role)) {
        where.callAssign = userRole.userID;
      }
      if (filters.fbleads) {
        where.fbLeads = {
          equals: filters.fbleads,
        };
      }
      if (filters.allSource) {
        where.utmSource = { equals: filters.allSource };
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
      const [leads, total, utmSourceAgg, fbLeadsAgg] =
        await this.tenantPrisma.client.$transaction([
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
          this.tenantPrisma.client.leads.groupBy({
            by: ['utmSource'],
            _count: { utmSource: true },
            orderBy: { utmSource: 'asc' },
          }),
          this.tenantPrisma.client.leads.groupBy({
            by: ['fbLeads'],

            _count: { fbLeads: true },
            orderBy: { fbLeads: 'asc' },
          }),
        ]);

      const data = normalizeData(leads);
      // const data = leads.map((lead: any) => ({
      //   ...lead,
      //   pincode: lead.pincode?.toString(),
      //   customer: lead.customer
      //     ? {
      //         ...lead.customer,
      //         mobile: lead.customer.mobile?.toString(),
      //         aadharNo: lead.customer.aadharNo?.toString(),
      //       }
      //     : null,
      // }));
      const sourcesSummary = utmSourceAgg
        .map((item) => item.utmSource)
        .filter((s) => s && s.trim() !== '');
      const fbLeadsSummary = fbLeadsAgg
        .map((item) => item.fbLeads)
        .filter((f) => f && f.trim() !== '');
      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
        sourcesSummary,
        fbLeadsSummary,
      });
    } catch (err: any) {
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  async getInterestedLeads({
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
      const where: any = {
        status: 'Interested',
      };

      const userData = await this.clsService.get('user');
      const userRole = await this.authService.getUserById(userData);

      const headRoleValues = Object.values(HeadRoles);

      if (!headRoleValues.includes(userRole.role)) {
        where.callAssign = userRole.userID;
      }
      HttpService;
      if (filters.fbleads) {
        where.fbLeads = {
          equals: filters.fbleads,
        };
      }
      if (filters.allSource) {
        where.utmSource = { equals: filters.allSource };
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
      const [leads, total, utmSourceAgg, fbLeadsAgg] =
        await this.tenantPrisma.client.$transaction([
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
          this.tenantPrisma.client.leads.groupBy({
            by: ['utmSource'],
            _count: { utmSource: true },
            orderBy: { utmSource: 'asc' },
          }),
          this.tenantPrisma.client.leads.groupBy({
            by: ['fbLeads'],
            _count: { fbLeads: true },
            orderBy: { fbLeads: 'asc' },
          }),
        ]);

      const data = normalizeData(leads);
      // const data = leads.map((lead: any) => ({
      //   ...lead,
      //   pincode: lead.pincode?.toString(),
      //   customer: lead.customer
      //     ? {
      //         ...lead.customer,
      //         mobile: lead.customer.mobile?.toString(),
      //         aadharNo: lead.customer.aadharNo?.toString(),
      //       }
      //     : null,
      // }));
      const sourcesSummary = utmSourceAgg

        .map((item) => item.utmSource)
        .filter((s) => s && s.trim() !== '');
      const fbLeadsSummary = fbLeadsAgg
        .map((item) => item.fbLeads)
        .filter((f) => f && f.trim() !== '');
      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
        sourcesSummary,
        fbLeadsSummary,
      });
    } catch (err: any) {
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  async getDocumentsReceivedLeads({
    page,
    limit,
    search,
    filters,
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
      const where: any = {
        status: 'Document_Received',
      };
      const userData = await this.clsService.get('user');
      const userRole = await this.authService.getUserById(userData);

      const headRoleValues = Object.values(HeadRoles);

      if (!headRoleValues.includes(userRole.role)) {
        where.sanctionalloUID = Number(userRole.userID);
      }
      if (filters.fbleads) {
        where.fbLeads = {
          equals: filters.fbleads,
        };
      }
      if (filters.allSource) {
        where.utmSource = { equals: filters.allSource };
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
      const [leads, total, utmSourceAgg, fbLeadsAgg] =
        await this.tenantPrisma.client.$transaction([
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
              sanctionUser: {
                select: {
                  name: true,
                  userID: true,
                },
              },
            },
          }),
          this.tenantPrisma.client.leads.count({ where }),
          this.tenantPrisma.client.leads.groupBy({
            by: ['utmSource'],
            _count: { utmSource: true },
            orderBy: { utmSource: 'asc' },
          }),
          this.tenantPrisma.client.leads.groupBy({
            by: ['fbLeads'],
            _count: { fbLeads: true },
            orderBy: { fbLeads: 'asc' },
          }),
        ]);

      const data = normalizeData(leads);
      // const data = leads.map((lead: any) => ({
      //   ...lead,
      //   pincode: lead.pincode?.toString(),
      //   customer: lead.customer
      //     ? {
      //         ...lead.customer,
      //         mobile: lead.customer.mobile?.toString(),
      //         aadharNo: lead.customer.aadharNo?.toString(),
      //       }
      //     : null,
      // }));
      const sourcesSummary = utmSourceAgg
        .map((item) => item.utmSource)
        .filter((s) => s && s.trim() !== '');
      const fbLeadsSummary = fbLeadsAgg
        .map((item) => item.fbLeads)
        .filter((f) => f && f.trim() !== '');
      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
        sourcesSummary,
        fbLeadsSummary,
      });
    } catch (err: any) {
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  async getBlacklistedLeads({
    page,
    limit,
    search,
    filters,
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

      const where: any = {
        status: 'Blacklisted',
      };
      const userData = await this.clsService.get('user');
      const userRole = await this.authService.getUserById(userData);

      const headRoleValues = Object.values(HeadRoles);

      if (!headRoleValues.includes(userRole.role)) {
        where.callAssign = userRole.userID;
      }

      if (filters.fbleads) {
        where.fbLeads = {
          equals: filters.fbleads,
        };
      }

      if (filters.allSource) {
        where.utmSource = { equals: filters.allSource };
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
      const [leads, total, utmSourceAgg, fbLeadsAgg] =
        await this.tenantPrisma.client.$transaction([
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
          this.tenantPrisma.client.leads.groupBy({
            by: ['utmSource'],
            _count: { utmSource: true },
            orderBy: { utmSource: 'asc' },
          }),
          this.tenantPrisma.client.leads.groupBy({
            by: ['fbLeads'],
            _count: { fbLeads: true },
            orderBy: { fbLeads: 'asc' },
          }),
        ]);

      const data = normalizeData(leads);
      // const data = leads.map((lead: any) => ({
      //   ...lead,
      //   pincode: lead.pincode?.toString(),
      //   customer: lead.customer
      //     ? {
      //         ...lead.customer,
      //         mobile: lead.customer.mobile?.toString(),
      //         aadharNo: lead.customer.aadharNo?.toString(),
      //       }
      //     : null,
      // }));
      const sourcesSummary = utmSourceAgg
        .map((item) => item.utmSource)
        .filter((s) => s && s.trim() !== '');
      const fbLeadsSummary = fbLeadsAgg
        .map((item) => item.fbLeads)
        .filter((f) => f && f.trim() !== '');
      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
        sourcesSummary,
        fbLeadsSummary,
      });
    } catch (err: any) {
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  async getRejectedLeads({
    page,
    limit,
    search,
    filters,
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
      const where: any = {
        status: 'Rejected',
      };

      const userData = await this.clsService.get('user');
      const userRole = await this.authService.getUserById(userData);

      const headRoleValues = Object.values(HeadRoles);

      if (!headRoleValues.includes(userRole.role)) {
        where.callAssign = userRole.userID;
      }

      if (filters.fbleads) {
        where.fbLeads = {
          equals: filters.fbleads,
        };
      }
      if (filters.allSource) {
        where.utmSource = { equals: filters.allSource };
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
      const [leads, total, utmSourceAgg, fbLeadsAgg] =
        await this.tenantPrisma.client.$transaction([
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
                },
              },
            },
          }),

          this.tenantPrisma.client.leads.count({ where }),
          this.tenantPrisma.client.leads.groupBy({
            by: ['utmSource'],
            _count: { utmSource: true },
            orderBy: { utmSource: 'asc' },
          }),
          this.tenantPrisma.client.leads.groupBy({
            by: ['fbLeads'],
            _count: { fbLeads: true },
            orderBy: { fbLeads: 'asc' },
          }),
        ]);

      const data = normalizeData(leads);
      // const data = leads.map((lead: any) => ({
      //   ...lead,

      //   pincode: lead.pincode?.toString(),
      //   customer: lead.customer
      //     ? {
      //         ...lead.customer,
      //         mobile: lead.customer.mobile?.toString(),
      //         aadharNo: lead.customer.aadharNo?.toString(),
      //       }
      //     : null,
      // }));
      const sourcesSummary = utmSourceAgg
        .map((item) => item.utmSource)
        .filter((s) => s && s.trim() !== '');
      const fbLeadsSummary = fbLeadsAgg

        .map((item) => item.fbLeads)
        .filter((f) => f && f.trim() !== '');
      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
        sourcesSummary,
        fbLeadsSummary,
      });
    } catch (err: any) {
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  async getIncompleteDocumentsLeads({
    page,
    limit,
    search,
    filters,
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
      const where: any = {
        status: 'Incomplete_Documents',
      };

      const userData = await this.clsService.get('user');
      const userRole = await this.authService.getUserById(userData);

      const headRoleValues = Object.values(HeadRoles);

      // if (!headRoleValues.includes(userRole.role)) {
      //   where.callAssign = userRole.userID;
      // }
      if (filters.fbleads) {
        where.fbLeads = {
          equals: filters.fbleads,
        };
      }
      if (filters.allSource) {
        where.utmSource = { equals: filters.allSource };
      }
      if (filters.fromDate) {
        const from = new Date(filters.fromDate + 'T00:00:00.000Z');
        if (!isNaN(from.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), gte: from };
        }
      }
      if (filters.toDate) {
        const to = new Date(filters.toDate + 'T23:59:59.999Z');

        if (!isNaN(to.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), lte: to };
        }
      }
      const [leads, total, utmSourceAgg, fbLeadsAgg] =
        await this.tenantPrisma.client.$transaction([
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
          this.tenantPrisma.client.leads.groupBy({
            by: ['utmSource'],
            _count: { utmSource: true },

            orderBy: { utmSource: 'asc' },
          }),
          this.tenantPrisma.client.leads.groupBy({
            by: ['fbLeads'],
            _count: { fbLeads: true },
            orderBy: { fbLeads: 'asc' },
          }),
        ]);
      const data = normalizeData(leads);

      const sourcesSummary = utmSourceAgg
        .map((item) => item.utmSource)
        .filter((s) => s && s.trim() !== '');
      const fbLeadsSummary = fbLeadsAgg
        .map((item) => item.fbLeads)
        .filter((f) => f && f.trim() !== '');
      return convertBigIntToString({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
        sourcesSummary,
        fbLeadsSummary,
      });
    } catch (err: any) {
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  async getLeadDetailByID(
    id: string,
    type: string = 'Profile',
    authHeader: string,
    req: Request,
  ) {
    const startTime = Date.now();

    try {
      if (!id || isNaN(Number(id))) {
        return { statusCode: 400, message: 'Invalid Lead ID' };
      }

      const leadID = Number(id);
      let data: any;

      const user = this.clsService.get('user');
      const role = this.clsService.get('role');

      const roleWhere = this.roleFilterService.getLeadWhereFilter(user, role);

      const tenant = await this.CibilService.getCurrentDomain(req);

      switch (type) {
        /* ========================= PROFILE ========================= */
        case 'Profile': {
          // 1️⃣ Base lead (LIGHT QUERY)

          return this.cacheService.rememberWithLock(
            CacheKey.lead(tenant, leadID, 'Profile'),

            async () => {
              const lead: any = await this.tenantPrisma.client.leads.findUnique({
                where: {
                  leadID,
                },
                include: {
                  customer: {
                    include: {
                      addresses: true,
                      employer: true,
                      customer_extended: {
                        select: {
                          isBtCase: true,
                        },
                      },
                      face_comparison: true,
                      reference: {
                        include: {
                          createdByUser: {
                            select: {
                              name: true,
                              role: true,
                              mobile_number: true,
                            },
                          },
                        },
                      },
                    },
                  },
                  creditRemarks: {
                    include: {
                      user: {
                        select: {
                          userID: true,
                          name: true,
                        }
                      }
                    }
                  },
                  loan: true,
                  face_comparison: true,
                },
              });

              if (!lead) {
                return {
                  statusCode: 404,
                  message: 'You are not authorized to access this lead',
                };
              }

              // 2️⃣ Parallel queries (NO MONSTER JOIN)
              const [approval, collections, docments] = await Promise.all([
                this.tenantPrisma.client.approval.findMany({
                  where: { leadID },
                  include: {
                    creditedUser: {
                      select: {
                        userID: true,
                        name: true,
                        role: true,
                        mobile_number: true,
                      },
                    },
                    sanctionUser: {
                      select: {
                        userID: true,
                        name: true,
                        role: true,
                        mobile_number: true,
                      },
                    },
                  },
                }),
                this.tenantPrisma.client.collection.findMany({
                  where: { leadID },
                  include: {
                    collectedByUser: {
                      select: {
                        userID: true,
                        name: true,
                        role: true,
                        mobile_number: true,
                      },
                    },
                    statusUpdatedByUser: {
                      select: {
                        userID: true,
                        name: true,
                        role: true,
                        mobile_number: true,
                      },
                    },
                  },
                }),
                this.tenantPrisma.client.document.findMany({
                  where: {
                    customerID: lead.customerID,
                    documentType: { in: ['selfie', 'Aadhar Profile'] },
                  },
                  orderBy: [{ documentType: 'asc' }, { uploadedDate: 'desc' }],
                  distinct: ['documentType'],
                  select: {
                    documentFile: true,
                    documentType: true,
                    uploadedDate: true,
                    customerID: true,
                  },
                }),
              ]);

              // 3️⃣ FIX N+1 QUERY (FETCH ALL ACCOUNTS AT ONCE)
              const accountIds: number[] = approval
                .map((a) => a.disbursalaccountid)
                .filter((id): id is number => typeof id === 'number');

              const accounts = accountIds.length
                ? await this.tenantPrisma.client.customeraccount.findMany({
                  where: { accountID: { in: accountIds } },
                })
                : [];

              const accountMap = new Map(
                accounts.map((acc) => [acc.accountID, acc]),
              );

              const enrichedApprovals = approval.map((approval) => ({
                ...approval,
                missingAccount: !approval.disbursalaccountid
                  ? true
                  : !accountMap.has(approval.disbursalaccountid),
                accountInfo:
                  approval.disbursalaccountid &&
                    accountMap.get(approval.disbursalaccountid)
                    ? accountMap.get(approval.disbursalaccountid)
                    : null,
              }));

              const defaultResponse = (source = '', target = '') => ({
                id: 0,
                leadID,
                customerID: Number(lead.customerID),
                sourceImage: source,
                targetImage: target,
                similarity: 0,
                confidence: 0,
                isMatch: false,
                createdAt: new Date(),
                updatedAt: new Date(),
              });

              if (docments.length >= 2 && !lead.customer?.face_comparison.length) {
                const selfie = docments.find(
                  (d) => d.documentType === 'selfie',
                );
                const aadhaar = docments.find(
                  (d) => d.documentType === 'Aadhar Profile',
                );

                if (selfie && aadhaar) {
                  const selfieKey = selfie.documentFile;
                  const aadhaarKey = aadhaar.documentFile;

                  const [sourceDoc, targetDoc] = await Promise.all([
                    this.documentsService.resolveDocument(selfieKey),
                    this.documentsService.resolveDocument(aadhaarKey),
                  ]);

                  const compareImage = await this.fileService.compareFaces(
                    sourceDoc,
                    targetDoc,
                  );

                  const match = compareImage?.matches?.[0];

                  if (match) {
                    const similarity =
                      Math.round((match.similarity || 0) * 100) / 100;
                    const confidence =
                      Math.round((match.confidence || 0) * 100) / 100;

                    const result =
                      await this.tenantPrisma.client.face_comparison.create({
                        data: {
                          leadID,
                          customerID: Number(lead.customerID),
                          sourceImage: selfieKey,
                          targetImage: aadhaarKey,
                          similarity,
                          confidence,
                          isMatch: similarity > 80,
                        },
                      });

                    lead.face_comparison = [result];
                  } else {
                    console.warn('No face match found for lead:', leadID);
                    lead.face_comparison = [
                      defaultResponse(selfieKey, aadhaarKey),
                    ];
                  }
                } else {
                  console.warn(
                    'Required documents not found for face comparison for leadID:',
                    leadID,
                  );
                  lead.face_comparison = [
                    defaultResponse('selfieKey', 'aadhaarKey'),
                  ];
                }
              } else {
                lead.face_comparison = lead.customer?.face_comparison
              }

              const response = {
                ...lead,
                approvals: enrichedApprovals,
                collections,
              };

              data = normalizeData(response);

              return {
                tabName: type,
                data,
              };
            },
            600,
          );
        }

        /* ========================= IVR ========================= */
        case 'IVR': {
          const lead = await this.tenantPrisma.client.leads.findUnique({
            where: { leadID },
            select: {
              leadID: true,
              customerID: true,
              createdDate: true,
              callHistories: {
                include: {
                  calledByUser: {
                    select: {
                      name: true,
                      role: true,
                      mobile_number: true,
                    },
                  },
                },
              },
            },
          });

          data = normalizeData(lead);
          return { tabName: type, data };
        }

        /* ========================= LEAD HISTORY ========================= */
        case 'LeadHistory': {
          return this.cacheService.rememberWithLock(
            CacheKey.lead(tenant, leadID, 'LeadHistory'),
            async () => {
              const lead = await this.tenantPrisma.client.leads.findUnique({
                where: { leadID },
                select: {
                  customerID: true,
                },
              });

              if (!lead) {
                return {
                  statusCode: 404,
                  message: 'Lead not found',
                };
              }

              const allLeads = await this.tenantPrisma.client.leads.findMany({
                where: {
                  customerID: lead.customerID,
                },
                include: {
                  customer: true,
                  loan: true,
                  approvals: true,
                  collections: true,
                },
              });

              return {
                tabName: type,
                data: normalizeData(allLeads),
              };
            },
            600, // 10 minutes
          );
        }

        /* ========================= BANK DETAILS ========================= */
        case 'BankDetails': {
          const lead = await this.tenantPrisma.client.leads.findUnique({
            where: { leadID },
            select: {
              leadID: true,
              createdDate: true,
              customer: {
                select: {
                  customerID: true,
                  name: true,
                  gender: true,
                  pancard: true,
                  mobile: true,
                  accounts: true,
                },
              },
            },
          });

          data = normalizeData({
            leadID: lead?.leadID,
            createdDate: lead?.createdDate,
            customer: lead?.customer
              ? {
                customerID: lead.customer.customerID,
                name: lead.customer.name,
                gender: lead.customer.gender,
                pancard: lead.customer.pancard,
                mobile: lead.customer.mobile,
              }
              : null,
            accounts: lead?.customer?.accounts ?? [],
          });

          return { tabName: type, data };
        }

        /* ========================= TIMELINE ========================= */
        case 'Timeline': {
          const lead = await this.tenantPrisma.client.leads.findUnique({
            where: { leadID },
            select: {
              leadID: true,
              createdDate: true,
              callhistorylogs: {
                include: {
                  calledByUser: {
                    select: {
                      name: true,
                      role: true,
                      mobile_number: true,
                    },
                  },
                },
              },
            },
          });

          data = normalizeData(lead);
          return { tabName: type, data };
        }

        /* ========================= CIBIL ========================= */
        case 'CIBIL': {
          return this.cacheService.rememberWithLock(
            CacheKey.lead(tenant, leadID, 'CIBIL'),
            async () => {
              const domain = await this.CibilService.getCurrentDomain(req);
              const cfg = bureauConfig[domain];

              let bureauData

              if (cfg?.softPull) {
                bureauData =
                  await this.tenantPrisma.client.criffsoftpull.findFirst({
                    where: {
                      leadID,
                      status: 'success',
                    },
                    select: {
                      responsePayload: true,
                    },
                  });

                if (!bureauData) {
                  // return {
                  //   status: 400,
                  //   message: 'No CRIF Soft Pull data found',
                  // };
                }

                let payload: any = bureauData?.responsePayload;


                if (typeof payload === 'string' && payload != undefined) {

                  console.log("1isem");

                  try {
                    payload = JSON.parse(payload);
                  } catch {
                    payload;
                  }
                }


                if (payload != undefined) {
                  return {
                    type: 'json',
                    data: payload,
                    status_code: 200,
                  };
                }
              }
              const cibildata: any =
                await this.tenantPrisma.client.cibildata.findFirst({
                  where: { leadID, status: 'success' },
                  select: {
                    response_pdf: true,
                    responsePayload: true,
                    pdf_password: true,
                  },
                });

              if (!cibildata) {
                return { status: 400, message: 'No CIBIL data found' };
              }


              const isSpecialClient =
                process.env.CLIENT_ENV === 'speedoloan' ||
                process.env.CLIENT_ENV === 'rupyalelo' ||
                process.env.CLIENT_ENV === 'shreeloan' ||
                process.env.CLIENT_ENV === 'rupee4u' ||
                process.env.CLIENT_ENV === 'localhost';

              // 🔥 ✅ NEW FLOW: Return PDF if exists
              if (cibildata.response_pdf) {
                const data = {
                  cibilStatus: 'success',
                  type: 'pdf',
                  data: cibildata.response_pdf,
                  pdfPassword: cibildata.pdf_password,
                };
                return { data };
              }

              // 🔥 ✅ OLD FLOW: Only for special clients
              if (isSpecialClient) {
                let payload: any = null;

                // =========================
                // ✅ SAFE JSON PARSING
                // =========================
                if (typeof cibildata.responsePayload === 'string') {
                  try {
                    payload = JSON.parse(cibildata.responsePayload);
                  } catch (err) {
                    console.error(
                      '❌ JSON parse failed, trying cleanup...',
                      err,
                    );

                    const raw = cibildata.responsePayload;

                    const firstBrace = raw.indexOf('{');
                    const lastBrace = raw.lastIndexOf('}');

                    if (firstBrace !== -1 && lastBrace !== -1) {
                      const possibleJson = raw.substring(
                        firstBrace,
                        lastBrace + 1,
                      );

                      try {
                        payload = JSON.parse(possibleJson);
                      } catch (innerErr) {
                        console.error('❌ Clean JSON parse failed', innerErr);
                        payload = null;
                      }
                    }
                  }
                } else {
                  payload = cibildata.responsePayload;
                }

                // =========================
                // ✅ NEW: HANDLE PURE JSON RESPONSE
                // =========================
                if (
                  payload &&
                  typeof payload === 'object' &&
                  (payload.HEADER || payload.SCORES || payload.REQUEST)
                ) {
                  return {
                    type: 'json',
                    data: payload,
                    status_code: 200,
                  };
                }

                // =========================
                // ❌ INVALID PAYLOAD
                // =========================
                if (!payload || typeof payload !== 'object') {
                  console.warn(
                    '⚠️ Invalid payload, fallback to raw HTML parsing',
                  );
                }

                let htmlContent: string | null = null;

                // =========================
                // 🔹 Case 1: Base64 HTML
                // =========================
                const content =
                  payload?.['CIR-REPORT-FILE']?.['PRINTABLE-REPORT']?.[
                  'CONTENT'
                  ];

                if (content) {
                  try {
                    const decoded = Buffer.from(content, 'base64').toString(
                      'utf-8',
                    );

                    if (
                      decoded.includes('<!DOCTYPE html') ||
                      decoded.includes('<html')
                    ) {
                      htmlContent = decoded;
                    }
                  } catch (err: any) {
                    console.error('❌ Base64 decode failed', err);
                  }
                }

                // =========================
                // 🔹 Case 2: Raw HTML fallback
                // =========================
                if (!htmlContent) {
                  let raw =
                    typeof cibildata.responsePayload === 'string'
                      ? cibildata.responsePayload
                      : JSON.stringify(cibildata.responsePayload);

                  raw = raw
                    .replace(/\\"/g, '"')
                    .replace(/\\n/g, '\n')
                    .replace(/\\t/g, '\t');

                  const htmlStartIndex = raw.indexOf('<!DOCTYPE html');

                  if (htmlStartIndex !== -1) {
                    htmlContent = raw.substring(htmlStartIndex);
                  }
                }

                // =========================
                // ❌ No HTML Found
                // =========================
                if (!htmlContent) {
                  return {
                    status: 400,
                    message: 'No PDF, JSON, or HTML data found',
                  };
                }

                // =========================
                // ✅ Normalize HTML
                // =========================
                const data = normalizeData(htmlContent);

                return {
                  type: 'html',
                  data,
                };
              }

              // ❌ Not special client + no PDF
              return {
                status: 400,
                message: 'No valid CIBIL data found',
              };
            },
            1800, // 30 minutes
          );
        }

        case 'AccountAggregator': {
          const balance =
            await this.tenantPrisma.client.bankstatement.findFirst({
              where: {
                leadID: Number(leadID),
              },
              orderBy: {
                id: 'desc', // latest record first
              },
            });

          if (!balance) {
            return {
              sucess: true,
              msg: 'There is no statement  for this lead',
            };
          }

          return {
            sucess: true,
            msg: 'Balance data Get Successfully',
            // pdfUrl: `/account/${leadID}/bank-statement-pdf`,
            data: balance.pushData,
          };
        }

        case 'BRE': {
          const leadData = await this.tenantPrisma.client.leads.findUnique({
            where: {
              leadID: Number(leadID),
            },
            include: {
              customer: true,
            },
          });

          if (!leadData) {
            return {
              success: false,
              msg: 'Lead not found',
            };
          }

          const panNumber = leadData?.customer?.pancard;

          if (!panNumber) {
            return {
              success: false,
              msg: 'PAN number not found',
            };
          }

          let breLog = await this.tenantPrisma.client.credforge_bre_log.findMany({
            where: {
              leadID: Number(leadID),
            },
            select: {
              workflowName: true,
              responsePayload: true,
              loanAmount: true,
              status: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          });

          // If no records found by leadID, find by customerID
          // if (breLog.length === 0) {
          //   const lead = await this.tenantPrisma.client.leads.findUnique({
          //     where: {
          //       leadID: Number(leadID),
          //     },
          //     select: {
          //       customerID: true,
          //     },
          //   });

          //   if (lead?.customerID) {
          //     breLog = await this.tenantPrisma.client.credforge_bre_log.findMany({
          //       where: {
          //         customerID: lead.customerID,
          //       },
          //       select: {
          //         workflowName: true,
          //         responsePayload: true,
          //         loanAmount: true,
          //         status: true,
          //         createdAt: true,
          //       },
          //       orderBy: {
          //         createdAt: 'desc',
          //       },
          //     });
          //   }
          // }

          // const url = `${process.env.INTERNAL_BRE_URL}${panNumber}`
          // const token = process.env.INTERNAL_BRE_TOKEN
          // const breResponse = await firstValueFrom(
          //   this.httpService.get(url, {
          //     headers: {
          //       Authorization: `Bearer ${token}`,
          //     },
          //   }),
          // );

          // const responsePayload = breLog?.responsePayload as any;
          // const { output_data } = responsePayload || {};

          return {
            success: true,
            msg: 'BRE data fetched successfully',
            data: {
              breResponse: breLog,
              // breLog: output_data,
            },
          };
        }

        /* ========================= DEFAULT ========================= */
        default:
          return await this.getLeadDetailByID(id, 'Profile', authHeader, req);
      }
    } catch (err: any) {
      console.error('getLeadDetailByID error:', err);
      // throw err;
    }
  }

  // async getLeadDetailByID(id: string, type: string = 'Profile') {
  //   try {
  //     if (!id || isNaN(Number(id))) {
  //       return 'Invalid Lead ID';
  //     }

  //     let data;
  //     let lead;
  //     switch (type) {
  //       case 'Profile': {
  //         const lead = await this.tenantPrisma.client.leads.findUnique({
  //           where: { leadID: Number(id) },
  //           include: {
  //             customer: {
  //               include: {
  //                 addresses: true,
  //                 employer: true,
  //                 reference: {
  //                   include: {
  //                     createdByUser: {
  //                       select: {
  //                         name: true,
  //                         role: true,
  //                         mobile_number: true,
  //                       },
  //                     },
  //                   },
  //                 },
  //               },
  //             },
  //             approvals: {
  //               include: {
  //                 creditedUser: {
  //                   select: {
  //                     userID: true,
  //                     name: true,
  //                     role: true,
  //                     mobile_number: true,
  //                   },
  //                 },
  //                 sanctionUser: {
  //                   select: {
  //                     userID: true,
  //                     name: true,
  //                     role: true,
  //                     mobile_number: true,
  //                   },
  //                 },
  //               },
  //             },
  //             loan: true,
  //             collections: true,
  //           },
  //         });

  //         if (!lead) {
  //           return { statusCode: 404, message: 'Lead not found' };
  //         }

  //         if (Array.isArray(lead.approvals) && lead.approvals.length > 0) {
  //           lead.approvals = await Promise.all(
  //             lead.approvals.map(async (approval) => {
  //               let missingAccount = true;
  //               let accountInfo: any = null;

  //               if (approval.disbursalaccountid) {
  //                 const accountExists =
  //                   await this.tenantPrisma.client.customeraccount.findFirst({
  //                     where: { accountID: approval.disbursalaccountid },
  //                   });

  //                 if (accountExists) {
  //                   missingAccount = false;
  //                   accountInfo = accountExists; // ✅ include full account data
  //                 }
  //               }

  //               return {
  //                 ...approval,
  //                 missingAccount,
  //                 accountInfo,
  //               };
  //             }),
  //           );
  //         }

  //         const data = normalizeData(lead);

  //         return {
  //           tabName: type,
  //           data,
  //         };
  //       }

  //       case 'IVR':
  //         lead = await this.tenantPrisma.client.leads.findUnique({
  //           where: { leadID: Number(id) },
  //           select: {
  //             leadID: true,
  //             customerID: true,
  //             createdDate: true,
  //             callHistories: {
  //               include: {
  //                 calledByUser: {
  //                   select: { name: true, role: true, mobile_number: true },
  //                 },
  //               },
  //             },
  //           },
  //         });

  //         data = normalizeData(lead);
  //         return { tabName: type, data };
  //       // return { message: 'IVR logic not implemented yet' };

  //       case 'Email':
  //         return { message: 'Email logic not implemented yet nai dikhana' };

  //       case 'Loan History':
  //         return {
  //           message: 'Loan History logic not implemented yet nshi dikhana hai ',
  //         };

  //       case 'LeadHistory':
  //         lead = await this.tenantPrisma.client.leads.findUnique({
  //           where: { leadID: Number(id) },
  //           select: {
  //             leadID: true,
  //             customerID: true,
  //             createdDate: true,
  //           },
  //         });

  //         if (!lead) {
  //           throw new Error(`Lead with ID ${id} not found`);
  //         }

  //         const allLeads = await this.tenantPrisma.client.leads.findMany({
  //           where: { customerID: lead.customerID },
  //           include: {
  //             customer: true,
  //           },
  //         });

  //         // Normalize or return directly
  //         data = normalizeData(allLeads);

  //         return { tabName: type, data };

  //       case 'BankDetails':
  //         lead = await this.tenantPrisma.client.leads.findUnique({
  //           where: { leadID: Number(id) },
  //           select: {
  //             leadID: true,
  //             customerID: true,
  //             createdDate: true,
  //             customer: {
  //               select: {
  //                 customerID: true,
  //                 name: true,
  //                 gender: true,
  //                 pancard: true,
  //                 mobile: true,
  //                 accounts: true,
  //               },
  //             },
  //           },
  //         });

  //         const response = {
  //           ...lead,
  //           customer: {
  //             customerID: lead.customer?.customerID,
  //             name: lead.customer?.name,
  //             gender: lead.customer?.gender,
  //             pancard: lead.customer?.pancard,
  //             mobile: lead.customer?.mobile,
  //           },
  //           accounts: lead.customer?.accounts ?? [],
  //         };

  //         data = normalizeData(response);
  //         return { tabName: type, data };

  //       case 'Account Aggregator':
  //         return { message: 'Account Aggregator logic not implemented yet' };

  //       case 'Timeline':
  //         lead = await this.tenantPrisma.client.leads.findUnique({
  //           where: { leadID: Number(id) },
  //           select: {
  //             leadID: true,
  //             customerID: true,
  //             createdDate: true,
  //             callhistorylogs: {
  //               include: {
  //                 calledByUser: {
  //                   select: { name: true, role: true, mobile_number: true },
  //                 },
  //               },
  //             },
  //           },
  //         });

  //         data = normalizeData(lead);
  //         return { tabName: type, data };

  //       case 'KYC':
  //         return { message: 'KYC logic not implemented yet' };

  //       case 'CIBIL':
  //         const cibildata: any =
  //           await this.tenantPrisma.client.cibildata.findFirst({
  //             where: { leadID: Number(id), status: 'success' },

  //             select: { responsePayload: true },
  //           });

  //         if (!cibildata?.responsePayload) {
  //           return {
  //             message: 'No CIBIL data found for this lead',
  //             status: 400,
  //           };
  //         }

  //         if (process.env.CLIENT_ENV === 'speedoloan') {
  //           let raw =
  //             typeof cibildata.responsePayload === 'string'
  //               ? cibildata.responsePayload
  //               : JSON.stringify(cibildata.responsePayload);

  //           raw = raw
  //             .replace(/\\"/g, '"')
  //             .replace(/\\n/g, '\n')
  //             .replace(/\\t/g, '\t');

  //           const htmlStartIndex = raw.indexOf('<!DOCTYPE html');
  //           if (htmlStartIndex === -1) {
  //             return {
  //               message: 'HTML data found for this lead',
  //               status: 400,
  //             };
  //           }

  //           const htmlContent = raw.substring(htmlStartIndex);

  //           data = normalizeData(htmlContent);
  //           return data;
  //         } else {
  //           return cibildata.responsePayload;
  //         }

  //       default:
  //         return await this.getLeadDetailByID(id, 'Profile');
  //     }
  //   } catch (err:any) {
  //     console.log(err);
  //     throw err;
  //   }
  // }

  async getLeadCounts(type: string) {
    try {
      const clientEnv = this.configService.get<any>('CLIENT_ENV');
      const configPath = path.join(
        __dirname,
        '..',
        '..',
        '..',
        'leadsConfig.json',
      );
      const configFile = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      const clientConfig = configFile[clientEnv];

      let where: any = {};
      if (clientConfig[type]) {
        where.utmSource = { in: clientConfig[type] };
      } else if (type && type !== 'All') {
        where.status = type;
      }

      const sourceCounts = await this.tenantPrisma.client.leads.groupBy({
        by: ['utmSource'],
        where,
        _count: { utmSource: true },
      });

      const sources = sourceCounts.map((g) => ({
        source: g.utmSource,
        total: g._count.utmSource,
      }));

      let whereSql = '';
      if (where.utmSource) {
        whereSql = `WHERE utmSource IN (${where.utmSource.in
          .map((s: string) => `'${s}'`)
          .join(',')})`;
      } else if (where.status) {
        whereSql = `WHERE status = '${where.status}'`;
      }

      const dailyTrend = await this.tenantPrisma.client.$queryRawUnsafe<
        { date: string; source: string; count: number }[]
      >(
        `
  SELECT DATE(createdDate) as date, utmSource as source, COUNT(*) as count
  FROM leads
  ${whereSql ? whereSql + ' AND' : 'WHERE'} 
    MONTH(createdDate) = MONTH(CURRENT_DATE())
    AND YEAR(createdDate) = YEAR(CURRENT_DATE())
  GROUP BY DATE(createdDate), utmSource
  ORDER BY date ASC
  `,
      );

      const monthlyTrend = await this.tenantPrisma.client.$queryRawUnsafe<
        { month: string; source: string; count: number }[]
      >(
        `
  SELECT DATE_FORMAT(createdDate, '%Y-%m') as month, utmSource as source, COUNT(*) as count
  FROM leads
  ${whereSql}
  GROUP BY DATE_FORMAT(createdDate, '%Y-%m'), utmSource
  ORDER BY month ASC
  `,
      );

      return normalize({
        type: type || 'All',
        sources,
        dailyTrend,
        monthlyTrend,
        message: 'Lead counts fetched successfully',
        status: 'Success',
        statusCode: 200,
      });
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  }

  async addReference(leadID: string, referenceData: any) {
    try {
      const lead = await this.tenantPrisma.client.leads.findUnique({
        where: { leadID: Number(leadID) },
      });
      if (!lead) {
        throw new Error('Lead not found');
      }
      // const newReference = await this.tenantPrisma.client.reference.create({
      //   data: {
      //     ...referenceData,
      //     leadID,

      //   },
      // });
      // return normalize({
      //   data: newReference,
      //   message: 'Reference added successfully',
      //   status: 'Success',
      //   statusCode: 200,
      // });
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  }

  async getStatistics() {
    try {
      const customerApps = await this.tenantPrisma.client.customerapp.findMany({
        select: { createdDate: true, mobile: true },
      });

      // Group customerApps by month
      const customerAppByMonth: Record<string, bigint[]> = {};
      customerApps.forEach((c) => {
        const month = c.createdDate.toISOString().slice(0, 7); // YYYY-MM
        if (!customerAppByMonth[month]) customerAppByMonth[month] = [];
        if (c.mobile) customerAppByMonth[month].push(c.mobile);
      });

      const monthWiseStats: Record<
        string,
        {
          totalCustomerApps: number;
          totalCustomers: number;
          customerAppNotInCustomer: number;
          totalLeads: number;
          customersWithoutLeads: number;
          approvals: Record<string, number>;
          leadsByStatus: Record<string, number>; // 👈 added field
        }
      > = {};

      for (const month of Object.keys(customerAppByMonth)) {
        const mobiles = customerAppByMonth[month];

        // Find customers for these mobiles
        const customers = await this.tenantPrisma.client.customer.findMany({
          where: { mobile: { in: mobiles } },
          select: { customerID: true, mobile: true },
        });

        const customerMobiles = customers.map((c) => c.mobile);
        const customerIDs = customers.map((c) => c.customerID);

        // CustomerApps not in Customer table
        const customerAppNotInCustomer = mobiles.filter(
          (m) => !customerMobiles.includes(m),
        );

        // Leads grouped by status

        const validStatuses: leads_status[] = [
          'Fresh_Lead',
          'Callback',
          'Interested',
          'Not_Interested',
          'Wrong_Number',
          'Document_Received',
          'Approved',
          'Hold',
          'Disbursal_Sheet_Send',
          'Disbursed',
          'Closed',
          'Part_Payment',
          'Settlement',
          'Incomplete_Documents',
          'DNC',
          'Rejected',
          'Not_Eligible',
          'Duplicate',
          'Other',
          'No_Answer',
          'EMI_Paid',
          'Less_Salary',
          'Out_of_Range',
          'EMI_PRECLOSE',
          'Bank_Update_Rejected',
          'Approved_Process',
          'Rejected_Process',
          'Hold_Process',
          'Not_Required',
          'Not_Required_Process',
          'Blacklisted',
          'Disbursal_Approved',
          'Bank_Update_Hold',
        ];
        const leadStats = await this.tenantPrisma.client.leads.groupBy({
          by: ['status'],
          where: {
            customerID: { in: customerIDs },
            status: { in: validStatuses },
          },
          _count: { status: true },
        });

        const leadCounts: Record<string, number> = {};
        leadStats.forEach((l) => {
          leadCounts[l.status] = l._count.status;
        });

        // Get all leads to find total + customers without leads
        const leads = await this.tenantPrisma.client.leads.findMany({
          where: { customerID: { in: customerIDs } },
          select: { leadID: true, customerID: true },
        });

        const leadIDs = leads.map((l) => l.leadID);

        const customerWithLeads = new Set(leads.map((l) => l.customerID));
        const customersWithoutLeads = customerIDs.filter(
          (id) => !customerWithLeads.has(id),
        ).length;

        // Approvals grouped by status

        const validApprovalStatuses: approval_status[] = [
          'Approved',
          'Rejected',
          'Hold',
          'Approved_Process',
          'Rejected_Process',
          'Hold_Process',
          'Not_Required',
          'Not_Required_Process',
        ];
        const approvalStats = await this.tenantPrisma.client.approval.groupBy({
          by: ['status'],
          _count: { status: true },
          where: {
            leadID: { in: leadIDs },
            status: { in: validApprovalStatuses },
          },
        });

        const approvalCounts: Record<string, number> = {};
        approvalStats.forEach((a) => {
          approvalCounts[a.status] = a._count.status;
        });

        // Save stats month-wise
        monthWiseStats[month] = {
          totalCustomerApps: mobiles.length,
          totalCustomers: customerIDs.length,
          customerAppNotInCustomer: customerAppNotInCustomer.length,
          totalLeads: leadIDs.length,
          customersWithoutLeads,
          approvals: approvalCounts,
          leadsByStatus: leadCounts, // 👈 new field added
        };
      }

      // Sort month keys
      const sortedMonthWiseStats = Object.keys(monthWiseStats)
        .sort()
        .reduce(
          (acc, month) => {
            acc[month] = monthWiseStats[month];
            return acc;
          },
          {} as typeof monthWiseStats,
        );

      // Return normalized result
      return normalize({
        monthWiseStats: sortedMonthWiseStats,
        message: 'Lead statistics fetched month-wise successfully',
        status: 'Success',
        statusCode: 200,
      });
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  }

  async getNotGeneratedLeads({
    page,
    limit,
    fromDate,
    toDate,
  }: {
    page: number;
    limit: number;
    fromDate?: string;
    toDate?: string;
  }) {
    try {
      const currentPage = page && page > 0 ? page : 1;
      const pageLimit = limit && limit > 0 ? limit : 20;

      const parseDate = (dateStr?: string): string | null => {
        if (!dateStr) return null;

        if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
          const [day, month, year] = dateStr.split('-');
          return `${year}-${month}-${day}`;
        }
        return dateStr;
      };

      const where: any = {};

      if (fromDate) {
        const parsedFrom = parseDate(fromDate);
        const from = new Date(parsedFrom + 'T00:00:00.000Z');
        if (!isNaN(from.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), gte: from };
        }
      }

      if (toDate) {
        const parsedTo = parseDate(toDate);
        const to = new Date(parsedTo + 'T23:59:59.999Z');
        if (!isNaN(to.getTime())) {
          where.createdDate = { ...(where.createdDate || {}), lte: to };
        }
      }

      // if (
      //   process.env.CLIENT_ENV === 'speedoloan' ||
      //   process.env.CLIENT_ENV === 'rupyalelo'
      // ) {
      //   const customers = await this.tenantPrisma.client.customerapp.findMany({
      //     where,
      //     select: {
      //       customerID: true,
      //       is_onboarded: true,
      //       loanApplied: true,
      //       mobile: true,
      //       name: true,
      //       createdDate: true,
      //       step: true,
      //       alternateMobile: true,
      //       utmSource: true,
      //       status: true,
      //       email: true,
      //     },
      //     orderBy: { createdDate: 'desc' },
      //   });
      //   const onboardedCustomers = customers.filter(
      //     (c) => c.is_onboarded === true,
      //   );
      //   const notOnboardedCustomers = customers.filter(
      //     (c) => c.is_onboarded === false || c.is_onboarded === null,
      //   );
      //   const loanAppliedCustomers = customers.filter(
      //     (c) => c.loanApplied === true && c.is_onboarded === true,
      //   );
      //   const notLoanAppliedCustomers = customers.filter(
      //     (c) => c.loanApplied === false && c.is_onboarded === true,
      //   );

      //   const paginate = <T>(data: T[]) => {
      //     const totalItems = data.length;
      //     const totalPages = Math.ceil(totalItems / pageLimit);
      //     const startIndex = (currentPage - 1) * pageLimit;
      //     const endIndex = startIndex + pageLimit;
      //     return {
      //       totalItems,
      //       totalPages,
      //       currentPage,
      //       limit: pageLimit,
      //       data: data.slice(startIndex, endIndex),
      //     };
      //   };

      //   return normalize({
      //     statusCode: 200,
      //     summary: {
      //       totalCustomers: customers.length,
      //       onboardedCount: onboardedCustomers.length,
      //       notOnboardedCount: notOnboardedCustomers.length,
      //       loanAppliedCount: loanAppliedCustomers.length,
      //       notLoanAppliedCount: notLoanAppliedCustomers.length,
      //     },
      //     segments: {
      //       notOnboarded: paginate(notOnboardedCustomers),
      //       notLoanApplied: paginate(notLoanAppliedCustomers),
      //     },
      //   });
      // }
      // else {
      const customers = await this.tenantPrisma.client.customer.findMany({
        where,
        select: {
          customerID: true,
          is_onboarded: true,
          loanApplied: true,
          mobile: true,
          name: true,
          createdDate: true,
          alternateMobile: true,
          utmSource: true,
          email: true,
          employer: {
            select: {
              empSalary: true,
            },
          },
          addresses: {
            select: {
              address: true,
              city: true,
              state: true,
            },
          },
        },
        orderBy: { createdDate: 'desc' },
      });
      const onboardedCustomers = customers.filter(
        (c) => c.is_onboarded === true,
      );
      const notOnboardedCustomers = customers.filter(
        (c) => c.is_onboarded === false || c.is_onboarded === null,
      );
      const loanAppliedCustomers = customers.filter(
        (c) => c.loanApplied === true && c.is_onboarded === true,
      );
      const notLoanAppliedCustomers = customers.filter(
        (c) => c.loanApplied === false && c.is_onboarded === true,
      );

      const paginate = <T>(data: T[]) => {
        const totalItems = data.length;
        const totalPages = Math.ceil(totalItems / pageLimit);
        const startIndex = (currentPage - 1) * pageLimit;
        const endIndex = startIndex + pageLimit;
        return {
          totalItems,
          totalPages,
          currentPage,
          limit: pageLimit,
          data: data.slice(startIndex, endIndex),
        };
      };

      return normalize({
        statusCode: 200,
        summary: {
          totalCustomers: customers.length,
          onboardedCount: onboardedCustomers.length,
          notOnboardedCount: notOnboardedCustomers.length,
          loanAppliedCount: loanAppliedCustomers.length,
          notLoanAppliedCount: notLoanAppliedCustomers.length,
        },
        segments: {
          notOnboarded: paginate(notOnboardedCustomers),
          notLoanApplied: paginate(notLoanAppliedCustomers),
        },
      });
      // }
    } catch (err: any) {
      return {
        statusCode: 500,
        message: err.message || 'Failed to fetch customer leads',
      };
    }
  }

  async getGlobalSearch(search: string, type: string) {
    if (!search?.trim()) {
      return {
        statusCode: 400,
        message: 'Search term is required',
      };
    }

    const searchTerm = search.trim();

    try {
      const isLoanNo = /^[A-Z]{2,10}\d+$/i.test(searchTerm);
      const isPan = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(searchTerm);
      const isMobile = /^\d{10}$/.test(searchTerm);
      const isLeadID = /^\d+$/.test(searchTerm);

      /**
       * 1. Loan Search (Fastest)
       */
      if (isLoanNo) {
        const result: any[] = await this.tenantPrisma.client.$queryRaw`
            SELECT
              c.customerID,
              c.firstName,
              c.lastName,
              c.name,
              c.mobile,
              c.panCard,
              l.loanID,
              l.loanNo,
              l.leadID,
              l.status AS currentStatus
            FROM loan l
            INNER JOIN customer c
              ON c.customerID = l.customerID
            WHERE l.loanNo = ${searchTerm}
            LIMIT 5
          `;

        return {
          statusCode: 200,
          message: 'Success',
          data: convertBigIntToString(result),
        };
      }


      type SearchType = 'mobile' | 'leadID' | 'panCard' | 'name';

      const searchCondition = {
        mobile: Prisma.sql` c.mobile LIKE ${`%${searchTerm}%`} `,
        leadID: Prisma.sql` CAST(ld.leadID AS CHAR) = ${searchTerm} `,
        panCard: Prisma.sql` UPPER(c.panCard) LIKE UPPER(${`%${searchTerm}%`}) `,
        name: Prisma.sql` ( c.name LIKE ${`%${searchTerm}%`} OR c.firstName LIKE ${`%${searchTerm}%`} OR c.lastName LIKE ${`%${searchTerm}%`} ) `,
      }[type];

      if (!searchCondition) {
        throw new BadRequestException(
          'Invalid search type. Use mobile, leadID, panCard, or name',
        );
      }

      const results = await this.tenantPrisma.client.$queryRaw`
        SELECT 
          c.customerID,
          c.firstName,
          c.lastName,
          c.name,
          c.mobile,
          c.panCard,
          l.loanID,
          l.loanNo,
          ld.leadID,
          l.status AS loanStatus
        FROM customer c

        LEFT JOIN (
            SELECT customerID, MAX(leadID) AS latestLeadID
            FROM leads
            GROUP BY customerID
        ) latestLead 
            ON latestLead.customerID = c.customerID

        LEFT JOIN leads ld 
            ON ld.leadID = latestLead.latestLeadID

        LEFT JOIN loan l 
            ON l.customerID = c.customerID
            AND l.leadID = ld.leadID

        WHERE ${searchCondition}

        LIMIT 5
      `;

      return {
        statusCode: 200,
        message: 'Success',
        data: convertBigIntToString(results),
      };
    } catch (error) {
      console.error('Global Search Error:', error);

      return {
        statusCode: 500,
        message: 'Internal Server Error',
      };
    }
  }

  async getLeadsStep(leadId: string) {
    try {
      if (!leadId) {
        return { statusCode: 400, message: 'Lead ID is required' };
      }

      const prisma = this.tenantPrisma.client;
      // 1. Lead Information
      const lead = await prisma.leads.findUnique({
        where: { leadID: Number(leadId) },
        select: { createdDate: true, callAssign: true, collectionUID: true },
      });

      let lead_created_date = lead?.createdDate || null;
      let lead_created_by = '';
      let call_assign_user_id = lead?.callAssign;
      let collection_user_id = lead?.collectionUID || null;

      if (call_assign_user_id) {
        const userLead = await prisma.users.findUnique({
          where: { userID: call_assign_user_id },
          select: { name: true },
        });
        lead_created_by = userLead?.name || '';
      }

      // 2. Latest Approval
      const approval = await prisma.approval.findFirst({
        where: { leadID: Number(leadId) },
        orderBy: { createdDate: 'desc' },
        select: {
          createdDate: true,
          sanctionalloUID: true,
          creditedBy: true,
          status: true,
        },
      });

      let sanction_date = '';
      let sanctioned_by = '';
      let credit_date = '';
      let credited_by = '';
      let approval_status = approval?.status || '';

      if (approval?.sanctionalloUID) {
        sanction_date = approval.createdDate.toISOString();
        const sanctionUser = await prisma.lms_users.findUnique({
          where: { userID: approval.sanctionalloUID },
          select: { name: true },
        });
        sanctioned_by = sanctionUser?.name || '';
      }

      if (approval?.creditedBy) {
        credit_date = approval.createdDate.toISOString();
        const creditUser = await prisma.lms_users.findUnique({
          where: { userID: approval.creditedBy },
          select: { name: true },
        });
        credited_by = creditUser?.name || '';
      }

      // 3. Loan Information
      const loan = await prisma.loan.findFirst({
        where: { leadID: Number(leadId) },
        select: { disbursalDate: true, disbursedBy: true },
      });

      let disbursal_date = loan?.disbursalDate || null;
      let disbursed_by = '';

      if (loan?.disbursedBy) {
        const userDisbursed = await prisma.lms_users.findUnique({
          where: { userID: loan.disbursedBy },
          select: { name: true },
        });

        disbursed_by = userDisbursed?.name || '';
      }

      // 4. Collection Assigned User
      let collection_assigned_by = '';
      if (collection_user_id) {
        const collectionUser = await prisma.lms_users.findUnique({
          where: { userID: collection_user_id },
          select: { name: true },
        });
        collection_assigned_by = collectionUser?.name || '';
      }

      // Is there any collection entry?
      const collection_count = await prisma.collection.count({
        where: { leadID: Number(leadId) },
      });
      const collection_entry_exists = collection_count > 0;

      // 5. Stepper Logic
      let lead_stepper_status = lead_created_date ? 'completed' : '';
      let sanction_stepper_status = '';
      let credit_stepper_status = '';
      let disbursed_stepper_status = '';
      let collection_stepper_status = '';
      let status_class = '';

      if (
        approval_status === 'Rejected' ||
        approval_status === 'Rejected Process'
      ) {
        sanction_stepper_status = 'rejected';
        credit_stepper_status = 'rejected';
        status_class = 'rejected-status';
      } else if (disbursal_date) {
        disbursed_stepper_status = 'completed';
        credit_stepper_status = 'completed';
        sanction_stepper_status = 'completed';
        lead_stepper_status = 'completed';
        collection_stepper_status = collection_entry_exists
          ? 'completed'
          : 'active';
      } else if (approval_status === 'Approved') {
        credit_stepper_status = 'completed';
        sanction_stepper_status = 'completed';
        disbursed_stepper_status = 'active';
      } else if (approval_status === 'Approved Process') {
        sanction_stepper_status = 'completed';
        credit_stepper_status = 'active';
      } else if (lead_created_date) {
        sanction_stepper_status = 'active';
      }

      return {
        statusCode: 200,
        message: 'Lead step status fetched successfully',
        data: {
          lead_created_date,
          lead_created_by,
          sanction_date,
          sanctioned_by,
          credit_date,
          credited_by,
          disbursal_date,
          disbursed_by,
          collection_assigned_by,
          stepper_status: {
            lead_stepper_status,
            sanction_stepper_status,
            credit_stepper_status,
            disbursed_stepper_status,
            collection_stepper_status,
          },
          status_class,
        },
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        message: err.message || 'Failed to fetch lead step status',
      };
    }
  }

  async getLeadsDocuments(leadId: string) {
    try {
      if (!leadId) {
        return { statusCode: 400, message: 'Lead ID is required' };
      }

      const lead = await this.tenantPrisma.client.leads.findUnique({
        where: { leadID: Number(leadId) },
        include: {
          customer: true,
        },
      });

      if (!lead) {
        return { statusCode: 404, message: 'Lead not found' };
      }

      let documents = await this.tenantPrisma.client.document.findMany({
        where: { customerID: Number(lead.customer?.customerID) },
        select: {
          documentID: true,
          documentType: true,
          uploadedDate: true,
          documentFile: true,
          password: true,
        },
      });

      const bankStatement =
        await this.tenantPrisma.client.bankstatement.findMany({
          where: { leadID: Number(leadId) },
          select: { id: true, documentFile: true, uploadedDate: true },
        });

      const bankStatementWithType = bankStatement.map((doc) => ({
        ...doc,
        documentType: 'Bank Statement',
        tabel: 'bankstatement',
      }));

      const finalDocuments = [...documents, ...bankStatementWithType];

      const groupedDocs = finalDocuments.reduce(
        (acc, doc) => {
          const type = doc.documentType || 'UNKNOWN';
          if (!acc[type]) acc[type] = [];
          acc[type].push(doc);
          return acc;
        },
        {} as Record<string, any[]>,
      );

      return {
        statusCode: 200,
        message: 'Lead documents fetched successfully',
        data: groupedDocs,
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        message: err.message || 'Failed to fetch lead documents',
      };
    }
  }

  async getKycVideos(leadId: string) {
    try {
      if (!leadId) {
        return { statusCode: 400, message: 'Lead ID is required' };
      }

      const lead = await this.tenantPrisma.client.leads.findUnique({
        where: { leadID: Number(leadId) },
        include: {
          customer: true,
        },
      });

      if (!lead) {
        return { statusCode: 404, message: 'Lead not found' };
      }

      const videoDetails = await this.tenantPrisma.client.videokyc.findUnique({
        where: { leadID: Number(leadId) },
      });

      if (!videoDetails) {
        return;
      }

      if (
        videoDetails &&
        videoDetails.latlongAddress === null &&
        videoDetails.location !== 'Permission Denied' &&
        videoDetails.location !== null
      ) {
        const latlong = videoDetails.location;

        const data = await this.GoogleService.getlocation(latlong);

        if (data.sucess === true) {
          const latlongdata = { latlongAddress: data.data };

          const updateData = await this.tenantPrisma.client.videokyc.update({
            where: {
              leadID: Number(leadId),
            },
            data: latlongdata,
          });

          return {
            statusCode: 200,
            message: 'Kyc Video Details fetched successfully',
            data: updateData,
          };
        }
      }

      return {
        statusCode: 200,
        message: 'Kyc Video Details fetched successfully',
        data: videoDetails,
      };
    } catch (err: any) {
      console.log(err);

      return {
        statusCode: 500,
        message: err.message || 'Failed to fetch lead documents',
      };
    }
  }

  async getEmandates(leadId: string, req: Request) {
    try {
      const domain = await this.smsService.getCurrentDomain(req);
      const config = EMANDATE_CONFIG[domain] || {
        enable: false,
        provider: 'none',
      };

      if (!config.enable) {
        return {
          success: false,
          statusCode: 403,
          message: 'E-Mandate is disabled for this domain',
          data: [],
        };
      }

      switch (config.provider) {
        case 'razorpay': {
          const record = await this.tenantPrisma.client.emandates.findFirst({
            where: {
              leadID: leadId.toString(),
            },
            select: {
              token_id: true,
            },
          });

          if (!record?.token_id) {
            return {
              statusCode: 400,
              message: 'E-Mandate token is not present',
              data: false,
            };
          }

          return {
            statusCode: 200,
            message: 'E-Mandate fetched successfully',
            data: true,
          };
        }
        case 'easeBuzz': {
          const mandate = await this.tenantPrisma.client.easebuzz_emandates.findFirst(
            {
              where: {
                leadID: Number(leadId),
              },
              select: {
                status: true,
                sub_status: true,
                response_message: true,
              },
            },
          );

          if (!mandate) {
            return {
              statusCode: 400,
              message: 'No mandate found for this lead',
              data: false,
            };
          }

          const easebuzzStatus = mandate.status?.toLowerCase();
          const easebuzzSubStatus = mandate.sub_status?.toLowerCase();

          const isEasebuzzDone =
            easebuzzStatus === 'authorized' ||
            (easebuzzStatus === 'initiated' &&
              easebuzzSubStatus === 'accepted');

          if (isEasebuzzDone) {
            return {
              statusCode: 200,
              message: 'Mandate completed successfully',
              data: true,
            };
          }

          return {
            statusCode: 400,
            message: 'E-Mandate token is not present',
            data: false,
          };
        }
      }

    } catch (error) {
      console.error('Error checking token_id:', error);
      return error;
    }
  }

  async getCreditTeamUsers() {
    try {
      const users = await this.tenantPrisma.client.lms_users.findMany({
        where: {
          role: 'credit team',
          status: 'active',
        },
        select: {
          userID: true,
          name: true,
        },
      });

      if (!users || users.length === 0) {
        return {
          statusCode: 404,
          message: 'No credit team users found',
        };
      }

      return {
        statusCode: 200,
        message: 'Users fetched successfully',
        data: users,
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        message: error.message || 'Failed to fetch Credit Team Users',
      };
    }
  }

  async setLeadAssign(
    leadIds: string[],
    assignTo: string,
    assignBy: string,
    customerID: string,
  ) {
    try {
      const numericLeadIds = leadIds.map((id) => Number(id));
      const assignToNumber = Number(assignTo);
      const assignByNumber = Number(assignBy);

      const result = await this.tenantPrisma.client.$transaction(async (tx) => {
        // 1️⃣ Update Leads
        await tx.leads.updateMany({
          where: { leadID: { in: numericLeadIds } },
          data: {
            creditAssign: assignToNumber,
            sanctionalloUID: assignToNumber,
          },
        });

        // 2️⃣ Fetch customerIDs
        const customers = await tx.leads.findMany({
          where: {
            leadID: { in: numericLeadIds },
          },
          select: {
            leadID: true,
            customerID: true,
          },
        });

        // 3️⃣ Create Map
        const leadCustomerMap = Object.fromEntries(
          customers.map((c) => [c.leadID, c.customerID]),
        );

        // 4️⃣ Prepare Logs
        const logsData = numericLeadIds.map((leadId) => ({
          leadID: leadId,
          calledBy: assignByNumber,
          callbackTime: new Date(),
          remark: `Lead assigned to ${assignToNumber} by ${assignByNumber}`,
          callType: 'Lead Assign',
          noteli: '',
          customerID: Number(leadCustomerMap[leadId]),
          status: '',
        }));

        // 5️⃣ Bulk Insert Logs
        const callHistoryLogs = await tx.callhistorylogs.createMany({
          data: logsData,
        });

        return callHistoryLogs;
      });

      return result;
    } catch (error) {
      console.error('Error in setLeadAssign:', error);
    }
  }

  async getAnalayserYearData(leadID: string) {
    try {
      // 🔍 1. Validate if customerID exists
      if (!leadID || leadID.trim() === '') {
        throw new Error('customerID is required');
      }

      // 🔍 2. Convert to number safely
      const id = Number(leadID);

      if (isNaN(id) || id <= 0) {
        throw new Error('Invalid customerID');
      }

      // 🔍 3. Fetch records from DB
      const data = await this.tenantPrisma.client.bankstatement.findFirst({
        where: {
          leadID: id,
        },
        select: {
          // analyser_data: true,
          uploadedDate: true,
          bank_analysis: {
            select: {
              analysisData: true,
            },
          },
        },
        orderBy: {
          uploadedDate: 'desc',
        },
      });

      // const filtered = data.filter(
      //   (item: any) => item.analyser_data?.approval_result === true,
      // );

      return {
        success: true,
        data: data,
      };
    } catch (error: any) {
      console.error('Error in getAnalayserYearData:', error);
      return {
        success: false,
        message: error.message || 'Failed to fetch analyser data',
      };
    }
  }

  async getEmailsNotifictaionList(leadID: string) {
    try {
      if (!leadID) {
        return { statusCode: 400, message: 'Lead ID is required' };
      }

      const lead = await this.tenantPrisma.client.leads.findUnique({
        where: { leadID: Number(leadID) },
      });

      if (!lead) {
        return { statusCode: 404, message: 'Lead not found' };
      }

      const mailData = await this.tenantPrisma.client.notifications.findMany({
        where: { leadID: Number(leadID) },
        select: {
          notificationID: true,
          leadID: true,
          subject: true,
          createdDate: true,
        },
      });

      return {
        success: false,
        stausCode: 200,
        data: mailData,
      };
    } catch (err: any) {
      console.error('Error in getEmailsNotifictaionList:', err);
      return {
        success: false,
        message: err.message || 'Failed to fetch Notifications data',
      };
    }
  }

  async getEmailsNotifictaion(notificationID: string) {
    try {
      if (!notificationID) {
        return { statusCode: 400, message: 'NotificationID is required' };
      }

      const mailData = await this.tenantPrisma.client.notifications.findUnique({
        where: { notificationID: Number(notificationID) },
        select: {
          notificationID: true,
          notification: true,
        },
      });

      if (!mailData) {
        return { statusCode: 400, message: 'No data Found' };
      }

      return {
        sucesss: true,
        statusCode: 200,
        data: mailData,
      };
    } catch (err: any) {
      console.error('Error in getEmailsNotifictaionList:', err);
      return {
        success: false,
        message: err.message || 'Failed to fetch Notifications data',
      };
    }
  }

  async getPaymentsByOrderId(leadId: string, req: Request) {
    try {
      const domain = await this.smsService.getCurrentDomain(req);
      const config = EMANDATE_CONFIG[domain] || {
        enable: false,
        provider: 'none',
      };

      // Feature disabled
      if (!config.enable) {
        return {
          success: false,
          statusCode: 403,
          message: 'E-Mandate is disabled for this domain',
          data: [],
        };
      }

      switch (config.provider) {
        case 'razorpay': {
          const orderData = await this.tenantPrisma.client.emandates.findFirst({
            where: {
              leadID: leadId.toString(),
            },
            select: {
              order_id: true,
              token_id: true,
              payment_id: true,
            },
          });

          if (!orderData?.order_id) {
            return {
              success: true,
              statusCode: 200,
              message: 'No order found for this lead',
              data: [],
            };
          }

          if (orderData.token_id && orderData.payment_id) {
            return {
              success: true,
              statusCode: 200,
              message: 'Payment already successful',
              data: [],
            };
          }

          const payments = await this.razorpay.orders.fetchPayments(
            orderData.order_id,
          );

          const normalizedPayments = payments.items.map((payment) => ({
            id: payment.id,
            entity: payment.entity,
            status: payment.status,
            order_id: payment.order_id,
            method: payment.method,
            captured: payment.captured,
            description: payment.description,
            bank: payment.bank,
            notes: payment.notes,
            error_code: payment.error_code,
            error_description: payment.error_description,
            error_source: payment.error_source,
            error_step: payment.error_step,
            error_reason: payment.error_reason,
            provider: config.provider
          }));

          return {
            success: true,
            statusCode: 200,
            action: "verify",
            message: 'Payments fetched successfully',
            data: normalizedPayments,
          };
        }

        case 'easeBuzz': {
          const mandate = await this.tenantPrisma.client.easebuzz_emandates.findFirst(
            {
              where: {
                leadID: Number(leadId),
              },
              select: {
                id: true,
                status: true,
                sub_status: true,
                response_message: true,
              },
            },
          );

          if (!mandate) {
            return {
              success: true,
              statusCode: 200,
              message: 'No mandate found for this lead',
              data: [],
            };
          }

          const easebuzzStatus = mandate.status?.toLowerCase();
          const easebuzzSubStatus = mandate.sub_status?.toLowerCase();

          const isEasebuzzDone =
            easebuzzStatus === 'authorized' ||
            (easebuzzStatus === 'initiated' &&
              easebuzzSubStatus === 'accepted');

          if (isEasebuzzDone) {
            return {
              success: true,
              statusCode: 200,
              message: 'Mandate completed successfully',
              data: [],
            };
          }

          const normalizedPayments = {
            id: mandate.id,
            error_reason: mandate.response_message,
            status: mandate.status,
            provider: config.provider,
            error_description: mandate.sub_status,
            error_source: "",
          }

          return {
            success: false,
            statusCode: 200,
            message:
              mandate.response_message || 'Mandate failed',
            data: normalizedPayments,
          };
        }

        default:
          return {
            success: false,
            statusCode: 400,
            message: 'Unsupported mandate provider',
            data: [],
          };
      }
    } catch (error: any) {
      console.error('Error fetching payment status:', error);

      return {
        success: false,
        statusCode: 500,
        message: error.message || 'Failed to fetch payment status',
        data: [],
      };
    }
  }

  async verifyOrderByPaymentId(leadId, body, req: Request) {
    try {
      const userData = await this.clsService.get('user');

      const domain = await this.smsService.getCurrentDomain(req);
      const config = EMANDATE_CONFIG[domain] || {
        enable: false,
        provider: 'none',
      };

      if (!config.enable) {
        return {
          success: false,
          statusCode: 403,
          message: 'E-Mandate is disabled for this domain',
          data: [],
        };
      }

      switch (config.provider) {
        case 'razorpay': {
          const emandate = await this.tenantPrisma.client.emandates.findFirst({
            where: { leadID: String(leadId) },
          });

          if (!emandate) {
            return {
              success: false,
              statusCode: 404,
              message: 'E-mandate not found',
            };
          }

          const { id, order_id } = body;
          const payment = await this.razorpay.payments.fetch(id);

          const updated = await this.tenantPrisma.client.emandates.update({
            where: { order_id: order_id },
            data: {
              payment_id: id,
              token_id: payment.token_id,
              status: payment.status,
            },
          });
          if (updated.payment_id && updated.token_id) {
            await this.tenantPrisma.client.callhistorylogs.create({
              data: {
                customerID: Number(emandate.customerID),
                leadID: Number(leadId),
                callType: 'E-Mandate',
                status: 'E-mandate Payment Success',
                remark: 'E-mandate payment successful with Payment ID: ' + id,
                calledBy: userData,
                noteli: 'Payment ID: ' + id,
              } as any,
            });
          }

          return {
            success: true,
            statusCode: 200,
            message: 'Payment verified and order updated successfully',
          };

        }

        case 'easeBuzz': {

          const emandate = await this.tenantPrisma.client.easebuzz_emandates.delete({
            where: { leadID: Number(leadId) },
          })

          if (!emandate) {
            return {
              success: false,
              statusCode: 404,
              message: 'E-mandate not found',
            };
          }


          await this.tenantPrisma.client.callhistorylogs.create({
            data: {
              customerID: Number(emandate.customerID),
              leadID: Number(leadId),
              callType: 'E-Mandate',
              status: 'E-mandate Payment Delete',
              remark: 'E-mandate payment delete successful with Payment ID: ' + emandate.transaction_id + emandate.transaction_id,
              calledBy: userData,
              noteli: 'Payment ID: ' + emandate.transaction_id + emandate.transaction_id,
            } as any,
          });
          return {
            success: true,
            statusCode: 200,
            message: 'Payment Delete  successfully',
          };
        }

        default:
          return {
            success: false,
            statusCode: 400,
            message: 'Unsupported mandate provider',
            data: [],
          };


      }

    } catch (error: any) {
      console.error('Error verifying payment:', error);
      return {
        statusCode: 500,
        success: false,
        message: error.message || 'Failed to verify payment',
      };
    }
  }

  async getLoanCalculation(leadID: string, req: Request) {
    try {
      if (!leadID) {
        return {
          success: false,
          statusCode: 400,
          massage: 'leadID is Missing',
        };
      }

      const lead = await this.tenantPrisma.client.leads.findFirst({
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
          approvals: true,
          loan: {
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
          collections: {
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
            loan: lead.loan,
            status: lead.status,
          },
        };
      }

      if (!lead.loan?.disbursalDate) {
        return {
          success: false,
          statusCode: 200,
          massage: 'Pending for disbursment!',
        };
      }

      if (!lead.approvals?.[0]?.repayDate) {
        return {
          success: false,
          statusCode: 200,
          massage: 'Pending for Approval!',
        };
      }

      const approval = lead.approvals[0];
      const approvedCollections = lead.collections || [];

      const totalPaid = approvedCollections.reduce(
        (sum, c: any) => sum + Number(c.collectedAmount || 0),
        0,
      );

      const discountEntry = approvedCollections.filter(
        (c: any) => c.collectedMode === 'DISCOUNT',
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

      const disbursalDate = new Date(lead.loan.disbursalDate);
      const repayDate = new Date(approval.repayDate);

      disbursalDate.setHours(0, 0, 0, 0);
      repayDate.setHours(0, 0, 0, 0);

      const domain = await this.smsService.getCurrentDomain(req);
      const config = penalConfig[domain] || penalConfig['localhost'];

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
          ) + disbursalDayCount;
      } else {
        dueDays =
          Math.ceil(
            (repayDate.getTime() - disbursalDate.getTime()) /
            (1000 * 60 * 60 * 24),
          ) + disbursalDayCount;

        overdueDays = Math.ceil(
          (interestStopDate.getTime() - repayDate.getTime()) /
          (1000 * 60 * 60 * 24),
        );
        totalDays = dueDays + overdueDays;
      }

      let TotalInterest = 0;
      let overdueInterest = 0;

      if (overdueDays > 0) {
        const normalInterest = lead.loan.disbursalAmount * dailyRate * dueDays;

        overdueInterest = lead.loan.disbursalAmount * overdueRate * overdueDays;

        TotalInterest = normalInterest + overdueInterest + bounceCharge;
      } else {
        TotalInterest = lead.loan.disbursalAmount * dailyRate * totalDays;
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
          interestForDay = lead.loan.disbursalAmount * dailyRate;
        } else {
          // Overdue period
          interestForDay = lead.loan.disbursalAmount * overdueRate;
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
        lead.loan.disbursalAmount * dailyRate * actualTenure;

      const tenureWiseRepayAmount =
        lead.loan.disbursalAmount + tenureWiseRepayInterest;

      const outstanding =
        lead.status === 'Settlement' || lead.status === 'Closed'
          ? 0
          : Math.round(lead.loan.disbursalAmount + TotalInterest - totalPaid);

      return {
        success: true,
        statusCode: 200,
        data: {
          loan: lead.loan,
          status: lead.status,
          loanAmount: Math.round(lead.loan.disbursalAmount),

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

  async getStatementOfAccount(leadID: string, req: Request) {
    try {
      if (!leadID) {
        return {
          success: false,
          statusCode: 400,
          message: 'leadID is Missing',
        };
      }

      const lead = await this.tenantPrisma.client.leads.findFirst({
        where: { leadID: Number(leadID) },
        select: {
          leadID: true,
          loan: {
            select: {
              loanNo: true,
              disbursalAmount: true,
              disbursalDate: true,
            },
          },
          approvals: {
            select: {
              roi: true,
              repayDate: true,
            },
          },
          collections: {
            where: { collectionStatus: 'Approved' },
            orderBy: { collectedDate: 'asc' },
          },
        },
      });

      if (!lead) {
        return { success: false, statusCode: 200, message: 'Lead not found!' };
      }

      if (!lead.loan?.disbursalDate) {
        return {
          success: false,
          statusCode: 200,
          message: 'Pending for disbursement!',
        };
      }

      const domain = await this.smsService.getCurrentDomain(req);
      const config = penalConfig[domain] || penalConfig['localhost'];

      const dailyRate = Number(lead.approvals?.[0]?.roi || 0);
      const penalRate = parseFloat(config.interest.replace('%', ''));
      const bounceCharge = config.charges;

      const disbursalDate = new Date(lead.loan.disbursalDate);
      const dueDate = new Date(lead.approvals?.[0]?.repayDate);
      const today = new Date();

      const ledger: any[] = [];

      let principal = Number(lead.loan.disbursalAmount);
      let interestAccrued = 0;
      let penalInterestAccrued = 0;
      let bounceCharges = 0;

      let penaltyApplied = false;

      const collections = lead.collections || [];
      let collectionIndex = 0;

      for (
        let d = new Date(disbursalDate);
        d <= today;
        d.setDate(d.getDate() + 1)
      ) {
        const currentDate = new Date(d);

        const totalBalance =
          principal + interestAccrued + penalInterestAccrued + bounceCharges;

        if (totalBalance <= 0) break;

        const dpd = Math.floor(
          (currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (currentDate <= dueDate) {
          const interest = (principal * dailyRate) / 100;
          interestAccrued += interest;

          ledger.push({
            date: currentDate,
            narration: `Interest @${dailyRate}% on ₹${principal.toFixed(2)}`,
            debit: interest,
            credit: 0,
            balance: Number(
              (
                principal +
                interestAccrued +
                penalInterestAccrued +
                bounceCharges
              ).toFixed(2),
            ),
          });
        }

        if (dpd > 0) {
          // Bounce charge once
          if (!penaltyApplied) {
            bounceCharges += bounceCharge;
            penaltyApplied = true;

            ledger.push({
              date: currentDate,
              narration: `Bounce charge ₹${bounceCharge}`,
              debit: bounceCharge,
              credit: 0,
              balance: Number(
                (
                  principal +
                  interestAccrued +
                  penalInterestAccrued +
                  bounceCharges
                ).toFixed(2),
              ),
            });
          }

          const penal = (principal * penalRate) / 100;
          penalInterestAccrued += penal;

          ledger.push({
            date: currentDate,
            narration: `Penal interest @${penalRate}% on ₹${principal.toFixed(2)}`,
            debit: penal,
            credit: 0,
            balance: Number(
              (
                principal +
                interestAccrued +
                penalInterestAccrued +
                bounceCharges
              ).toFixed(2),
            ),
          });
        }

        while (
          collectionIndex < collections.length &&
          new Date(
            collections[collectionIndex].collectedDate,
          ).toDateString() === currentDate.toDateString()
        ) {
          const c = collections[collectionIndex];

          let amount = 0;
          let narration = '';

          if (c.collectedMode === 'DISCOUNT') {
            amount = Number(c.discountAmount || 0);
            narration = `Discount ₹${amount}`;
          } else {
            amount = Number(c.collectedAmount || 0);
            narration = `Payment ₹${amount}`;
          }

          let remaining = amount;

          let pPaid = 0;
          let iPaid = 0;
          let penalPaid = 0;
          let chargePaid = 0;

          if (remaining > 0) {
            iPaid = Math.min(interestAccrued, remaining);
            interestAccrued -= iPaid;
            remaining -= iPaid;
          }

          // 2. Principal
          if (remaining > 0) {
            pPaid = Math.min(principal, remaining);
            principal -= pPaid;
            remaining -= pPaid;
          }

          // 3. Penal Interest
          if (remaining > 0) {
            penalPaid = Math.min(penalInterestAccrued, remaining);
            penalInterestAccrued -= penalPaid;
            remaining -= penalPaid;
          }

          // 4. Charges
          if (remaining > 0) {
            chargePaid = Math.min(bounceCharges, remaining);
            bounceCharges -= chargePaid;
            remaining -= chargePaid;
          }

          // Always IPC format
          const breakdown =
            `I:${iPaid.toFixed(2)}, ` +
            `P:${pPaid.toFixed(2)}, ` +
            `Penal:${penalPaid.toFixed(2)}, ` +
            `C:${chargePaid.toFixed(2)}`;

          ledger.push({
            date: currentDate,
            narration: `${narration} (${breakdown})`,
            debit: 0,
            credit: amount,
            balance: Number(
              (
                principal +
                interestAccrued +
                penalInterestAccrued +
                bounceCharges
              ).toFixed(2),
            ),
          });

          collectionIndex++;
        }
      }

      return {
        success: true,
        statusCode: 200,
        data: {
          loan: lead.loan,
          statementOfAccount: ledger,

          summary: {
            principalOutstanding: Number(principal.toFixed(2)),
            interestOutstanding: Number(interestAccrued.toFixed(2)),
            penalInterestOutstanding: Number(penalInterestAccrued.toFixed(2)),
            bounceChargesOutstanding: Number(bounceCharges.toFixed(2)),

            totalPayable: Number(
              (
                principal +
                interestAccrued +
                penalInterestAccrued +
                bounceCharges
              ).toFixed(2),
            ),
          },
        },
      };
    } catch (err) {
      console.error(err);
      return {
        success: false,
        statusCode: 500,
        message: 'Something went wrong',
      };
    }
  }

  async getNotOnboarded({
    page,
    limit,
    fromDate,
    toDate,
    mobile,
  }: {
    page: number;
    limit: number;
    fromDate?: string;
    toDate?: string;
    mobile?: string;
  }) {
    try {
      const currentPage = page && page > 0 ? page : 1;
      const pageLimit = limit && limit > 0 ? limit : 20;
      const skip = (currentPage - 1) * pageLimit;

      const parseDate = (dateStr?: string): string | null => {
        if (!dateStr) return null;

        if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
          const [day, month, year] = dateStr.split('-');
          return `${year}-${month}-${day}`;
        }

        return dateStr;
      };

      /**
       * Base filter
       */
      const where: any = {
        is_onboarded: false,
      };

      /**
       * Date filters
       */
      if (fromDate) {
        const parsedFrom = parseDate(fromDate);

        if (parsedFrom) {
          const from = new Date(`${parsedFrom}T00:00:00.000Z`);

          if (!isNaN(from.getTime())) {
            where.createdDate = {
              ...(where.createdDate || {}),
              gte: from,
            };
          }
        }
      }

      if (toDate) {
        const parsedTo = parseDate(toDate);

        if (parsedTo) {
          const to = new Date(`${parsedTo}T23:59:59.999Z`);

          if (!isNaN(to.getTime())) {
            where.createdDate = {
              ...(where.createdDate || {}),
              lte: to,
            };
          }
        }
      }

      /**
       * Partial mobile search
       *
       * Mobile is BigInt in DB, so Prisma `contains`
       * cannot be used directly.
       *
       * Search starts only after 4 digits.
       */
      if (mobile?.trim()) {
        const mobileSearch = mobile.trim();

        // Only numbers allowed
        if (!/^\d+$/.test(mobileSearch)) {
          return {
            error: 'Mobile number must contain only digits.',
          };
        }

        // Minimum 4 digits
        if (mobileSearch.length < 4) {
          return {
            error: 'Please enter at least 4 digits for mobile search.',
          };
        }

        /**
         * Find matching customer IDs.
         *
         * CAST(BigInt mobile AS CHAR) allows partial
         * matching using LIKE.
         */
        const matchingCustomers =
          await this.tenantPrisma.client.$queryRaw<
            { customerID: bigint }[]
          >`
          SELECT customerID
          FROM customer
          WHERE is_onboarded = false
            AND CAST(mobile AS CHAR) LIKE ${`%${mobileSearch}%`}
        `;

        const matchingCustomerIds = matchingCustomers.map(
          (customer) => customer.customerID,
        );

        /**
         * No matching mobile numbers.
         *
         * Set an impossible ID so Prisma returns
         * an empty result and total = 0.
         */
        if (matchingCustomerIds.length === 0) {
          where.customerID = {
            in: [],
          };
        } else {
          where.customerID = {
            in: matchingCustomerIds,
          };
        }
      }

      /**
       * BRE logs only for last 15 days
       */
      const fifteenDaysAgo = new Date();
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

      /**
       * Get customers + total
       */
      const [customers, total] =
        await this.tenantPrisma.client.$transaction([
          this.tenantPrisma.client.customer.findMany({
            where,
            skip,
            take: pageLimit,

            orderBy: {
              createdDate: 'desc',
            },

            select: {
              customerID: true,
              name: true,
              mobile: true,
              email: true,
              alternateMobile: true,
              utmSource: true,
              createdDate: true,
              emailVerify: true,
              is_onboarded: true,
              pancard: true,
              aadharNo: true,
              salary_date: true,
              kyc_at: true,
              step: true,
              isVerified: true,

              customer_extended: {
                select: {
                  selfieAttempts: true,
                },
              },

              employer: {
                take: 1,

                select: {
                  employeeType: true,
                  empSalary: true,
                  employerName: true,
                  empEmail: true,
                  address: true,
                },
              },

              addresses: {
                take: 1,

                select: {
                  address: true,
                  city: true,
                  state: true,
                  pincode: true,
                  type: true,
                },
              },

              document: {
                where: {
                  documentType: 'selfie',
                },

                take: 1,

                orderBy: {
                  uploadedDate: 'desc',
                },

                select: {
                  documentFile: true,
                  uploadedDate: true,
                },
              },

              bankstatement: {
                where: {
                  uploadedDate: {
                    gte: new Date(
                      Date.now() - 2 * 24 * 60 * 60 * 1000,
                    ),
                  },

                  leadID: null,
                },

                take: 1,

                select: {
                  id: true,
                  uploadedDate: true,
                },
              },

              credforge_bre_log: {
                where: {
                  createdAt: {
                    gte: fifteenDaysAgo,
                  },
                },

                take: 1,

                orderBy: {
                  createdAt: 'desc',
                },

                select: {
                  status: true,
                  responsePayload: true,
                },
              },

              leads: {
                orderBy: {
                  createdDate: 'desc',
                },

                select: {
                  leadID: true,
                  status: true,
                },
              },
            },
          }),

          this.tenantPrisma.client.customer.count({
            where,
          }),
        ]);

      /**
       * Unique pincodes
       */
      const uniquePincodes = [
        ...new Set(
          customers
            .map((customer) => customer.addresses[0]?.pincode)
            .filter(
              (pincode): pincode is bigint =>
                pincode !== null &&
                pincode !== undefined,
            ),
        ),
      ];

      /**
       * Customer IDs
       */
      const customerIds = customers.map(
        (customer) => customer.customerID,
      );

      /**
       * Finblogs
       */
      const finblogs =
        customerIds.length > 0
          ? await this.tenantPrisma.client.finb_logs.findMany({
            where: {
              customerID: {
                in: customerIds,
              },
            },

            select: {
              customerID: true,
            },
          })
          : [];

      const finblogsCustomerSet = new Set(
        finblogs.map((item) => item.customerID),
      );

      /**
       * Active serviceable pincodes
       */
      const servicePincodes =
        uniquePincodes.length > 0
          ? await this.tenantPrisma.client.pincode.findMany({
            where: {
              pincode: {
                in: uniquePincodes.map((pincode) =>
                  pincode.toString(),
                ),
              },

              isActive: true,
            },

            select: {
              pincode: true,
            },
          })
          : [];

      /**
       * O(1) serviceable pincode lookup
       */
      const serviceablePincodeSet = new Set(
        servicePincodes.map((item) => item.pincode),
      );

      /**
       * Format response
       */
      const data = customers.map((customer) => {
        let score;
        let riskGrade = '-';

        /**
         * Risk score
         */
        if (
          customer.credforge_bre_log &&
          customer.credforge_bre_log.length > 0
        ) {
          score =
            customer.credforge_bre_log[0]?.responsePayload;

          riskGrade =
            score?.output_data?.features?.output_features?.bureau
              ?.cbs_risk_grade ??
            score?.output_data?.features?.combo
              ?.cbs_risk_grade ??
            '-';
        }

        let currentStep: any = customer.step;

        const address = customer.addresses[0];
        const selfie = customer.document[0];
        const employment = customer.employer[0];
        const bankStatement = customer.bankstatement[0];

        const isotpDone = customer.isVerified;

        /**
         * KYC
         */
        const isKycDone = !!(
          customer.aadharNo &&
          customer.pancard
        );

        /**
         * Banking
         */
        const isBankingDone = !!bankStatement;

        /**
         * Apply button
         */
        const isApplyButtonClicked =
          finblogsCustomerSet.has(customer.customerID);

        const riskScore = riskGrade;

        /**
         * Pincode
         */
        const normalizedPincode =
          address?.pincode?.toString();

        const isPincodeOutsideService =
          !!normalizedPincode &&
          !serviceablePincodeSet.has(normalizedPincode);

        /**
         * Step calculation
         */
        if (!customer.emailVerify) {
          currentStep = 0;
        } else if (isKycDone && !isBankingDone) {
          currentStep = 1;
        }

        return {
          customerID: customer.customerID,

          name: customer.name,

          mobile: customer.mobile,

          createdDate: customer.createdDate,

          utmSource: customer.utmSource,

          riskScore,

          isotpDone,

          is_apply_button_clicked:
            isApplyButtonClicked,

          personalData: {
            alternateMobile:
              customer.alternateMobile,

            emailVerify:
              customer.emailVerify,

            selfie: !!selfie?.documentFile,

            ...address,
          },

          employment: {
            ...employment,

            empSalaryDate:
              customer.salary_date,
          },

          kyc: {
            is_kyc_done: isKycDone,

            is_banking_done:
              isBankingDone,

            kyc_expire_at:
              customer.kyc_at,

            is_selfie_block:
              Number(
                customer.customer_extended
                  ?.selfieAttempts,
              ) > 3,
          },

          is_pincode_outside_service:
            isPincodeOutsideService,

          is_onboarded:
            customer.is_onboarded,

          is_preoffer_generated:
            customer.credforge_bre_log.length > 0,

          preoffer_decision:
            customer.credforge_bre_log[0]?.status ??
            null,

          isReloan:
            customer.leads.length > 0,

          step: currentStep,
        };
      });

      /**
       * Final response
       */
      return normalize({
        data,

        pagination: {
          page: currentPage,

          limit: pageLimit,

          total,

          totalPages:
            Math.ceil(total / pageLimit),
        },
      });
    } catch (error: any) {
      console.error(
        'getNotOnboarded error:',
        error,
      );

      return {
        error:
          error?.message ||
          'Something went wrong.',
      };
    }
  }

  // async notOnboardedExcel(
  //   res: Response,
  //   {
  //     fromDate,
  //     toDate,
  //   }: {
  //     fromDate: string;
  //     toDate: string;
  //   },
  // ) {
  //   const startedAt = Date.now();

  //   try {
  //     /**
  //      * ------------------------------------------------------------
  //      * 1. Parse date
  //      * ------------------------------------------------------------
  //      */
  //     const parseDate = (dateStr?: string): string | null => {
  //       if (!dateStr) return null;

  //       // DD-MM-YYYY
  //       if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
  //         const [day, month, year] = dateStr.split('-');

  //         return `${year}-${month}-${day}`;
  //       }

  //       // YYYY-MM-DD
  //       if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
  //         return dateStr;
  //       }

  //       return null;
  //     };

  //     /**
  //      * ------------------------------------------------------------
  //      * 2. Build WHERE condition
  //      * ------------------------------------------------------------
  //      */
  //     const where: any = {
  //       is_onboarded: false,
  //     };

  //     if (fromDate) {
  //       const parsedFrom = parseDate(fromDate);

  //       if (!parsedFrom) {
  //         throw new BadRequestException(
  //           'Invalid fromDate. Use DD-MM-YYYY or YYYY-MM-DD',
  //         );
  //       }

  //       const from = new Date(`${parsedFrom}T00:00:00.000Z`);

  //       if (isNaN(from.getTime())) {
  //         throw new BadRequestException('Invalid fromDate');
  //       }

  //       where.createdDate = {
  //         ...(where.createdDate || {}),
  //         gte: from,
  //       };
  //     }

  //     if (toDate) {
  //       const parsedTo = parseDate(toDate);

  //       if (!parsedTo) {
  //         throw new BadRequestException(
  //           'Invalid toDate. Use DD-MM-YYYY or YYYY-MM-DD',
  //         );
  //       }

  //       const to = new Date(`${parsedTo}T23:59:59.999Z`);

  //       if (isNaN(to.getTime())) {
  //         throw new BadRequestException('Invalid toDate');
  //       }

  //       where.createdDate = {
  //         ...(where.createdDate || {}),
  //         lte: to,
  //       };
  //     }

  //     /**
  //      * ------------------------------------------------------------
  //      * 3. Headers MUST be sent before streaming
  //      * ------------------------------------------------------------
  //      */
  //     const filename = `NotOnboardedCustomer_${Date.now()}.xlsx`;

  //     res.status(200);

  //     res.setHeader(
  //       'Content-Type',
  //       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  //     );

  //     res.setHeader(
  //       'Content-Disposition',
  //       `attachment; filename="${filename}"`,
  //     );

  //     // Important for large downloads.
  //     res.setHeader('Cache-Control', 'no-store');
  //     res.setHeader('Pragma', 'no-cache');
  //     res.setHeader('X-Accel-Buffering', 'no');

  //     /**
  //      * ------------------------------------------------------------
  //      * 4. Streaming Excel workbook
  //      * ------------------------------------------------------------
  //      *
  //      * IMPORTANT:
  //      *
  //      * Do NOT use:
  //      *
  //      * new ExcelJS.Workbook()
  //      *
  //      * because that keeps the workbook in memory.
  //      */
  //     const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
  //       stream: res,


  //       useStyles: false,


  //       useSharedStrings: false,
  //     });

  //     const worksheet = workbook.addWorksheet(
  //       'Not Onboarded Customer',
  //     );


  //     worksheet.columns = [
  //       {
  //         header: 'Customer ID',
  //         key: 'customerID',
  //         width: 15,
  //       },
  //       {
  //         header: 'Name',
  //         key: 'name',
  //         width: 25,
  //       },
  //       {
  //         header: 'Mobile',
  //         key: 'mobile',
  //         width: 18,
  //       },
  //       {
  //         header: 'Created Date',
  //         key: 'createdDate',
  //         width: 22,
  //       },
  //       {
  //         header: 'Source',
  //         key: 'utmSource',
  //         width: 20,
  //       },
  //       {
  //         header: 'OTP Verified',
  //         key: 'isotpDone',
  //         width: 18,
  //       },
  //       {
  //         header: 'Apply Button Click',
  //         key: 'is_apply_button_clicked',
  //         width: 20,
  //       },
  //       {
  //         header: 'Pincode Outside Service',
  //         key: 'is_pincode_outside_service',
  //         width: 24,
  //       },
  //       {
  //         header: 'Pre-offer Generated',
  //         key: 'is_preoffer_generated',
  //         width: 20,
  //       },
  //       {
  //         header: 'Pre-offer Decision',
  //         key: 'preoffer_decision',
  //         width: 22,
  //       },
  //       {
  //         header: 'Risk Grade',
  //         key: 'riskGrade',
  //         width: 20,
  //       },
  //       {
  //         header: 'Email Verified',
  //         key: 'emailVerify',
  //         width: 18,
  //       },
  //       {
  //         header: 'KYC Done',
  //         key: 'is_kyc_done',
  //         width: 18,
  //       },
  //       {
  //         header: 'Banking Done',
  //         key: 'is_banking_done',
  //         width: 18,
  //       },
  //       {
  //         header: 'Step',
  //         key: 'step',
  //         width: 12,
  //       },
  //     ];


  //     const fifteenDaysAgo = new Date(
  //       Date.now() - 15 * 24 * 60 * 60 * 1000,
  //     );
  //     let lastCreatedDate: Date | null = null;
  //     let lastCustomerID: number | null = null;

  //     let totalProcessed = 0;


  //     while (true) {

  //       const cursorCondition =
  //         lastCreatedDate !== null &&
  //           lastCustomerID !== null
  //           ? {
  //             OR: [
  //               {
  //                 createdDate: {
  //                   lt: lastCreatedDate,
  //                 },
  //               },
  //               {
  //                 AND: [
  //                   {
  //                     createdDate: lastCreatedDate,
  //                   },
  //                   {
  //                     customerID: {
  //                       lt: lastCustomerID,
  //                     },
  //                   },
  //                 ],
  //               },
  //             ],
  //           }
  //           : {};


  //       const customers =
  //         await this.tenantPrisma.client.customer.findMany({
  //           where: {
  //             AND: [
  //               where,
  //               cursorCondition,
  //             ],
  //           },

  //           orderBy: [
  //             {
  //               createdDate: 'desc',
  //             },
  //             {
  //               customerID: 'desc',
  //             },
  //           ],

  //           take: this.EXPORT_BATCH_SIZE,

  //           select: {
  //             customerID: true,
  //             name: true,
  //             mobile: true,
  //             email: true,
  //             alternateMobile: true,
  //             utmSource: true,
  //             createdDate: true,
  //             emailVerify: true,
  //             is_onboarded: true,
  //             pancard: true,
  //             aadharNo: true,
  //             salary_date: true,
  //             kyc_at: true,
  //             step: true,
  //             isVerified: true,

  //             customer_extended: {
  //               select: {
  //                 selfieAttempts: true,
  //               },
  //             },

  //             employer: {
  //               take: 1,

  //               select: {
  //                 employeeType: true,
  //                 empSalary: true,
  //                 employerName: true,
  //                 empEmail: true,
  //                 address: true,
  //               },
  //             },

  //             addresses: {
  //               take: 1,

  //               select: {
  //                 address: true,
  //                 city: true,
  //                 state: true,
  //                 pincode: true,
  //                 type: true,
  //               },
  //             },

  //             document: {
  //               where: {
  //                 documentType: 'selfie',
  //               },

  //               take: 1,

  //               orderBy: {
  //                 uploadedDate: 'desc',
  //               },

  //               select: {
  //                 documentFile: true,
  //                 uploadedDate: true,
  //               },
  //             },

  //             bankstatement: {
  //               where: {
  //                 uploadedDate: {
  //                   gte: new Date(
  //                     Date.now() -
  //                     2 * 24 * 60 * 60 * 1000,
  //                   ),
  //                 },

  //                 leadID: null,
  //               },

  //               take: 1,

  //               select: {
  //                 id: true,
  //                 uploadedDate: true,
  //               },
  //             },

  //             credforge_bre_log: {
  //               where: {
  //                 createdAt: {
  //                   gte: fifteenDaysAgo,
  //                 },
  //               },

  //               take: 1,

  //               orderBy: {
  //                 createdAt: 'desc',
  //               },

  //               select: {
  //                 status: true,
  //                 responsePayload: true,
  //               },
  //             },


  //             leads: {
  //               take: 1,

  //               orderBy: {
  //                 createdDate: 'desc',
  //               },

  //               select: {
  //                 leadID: true,
  //                 status: true,
  //               },
  //             },
  //           },
  //         });


  //       if (customers.length === 0) {
  //         break;
  //       }


  //       const customerIds = customers.map(
  //         (customer) => customer.customerID,
  //       );


  //       const uniquePincodes = [
  //         ...new Set(
  //           customers
  //             .map(
  //               (customer) =>
  //                 customer.addresses[0]?.pincode,
  //             )
  //             .filter(
  //               (
  //                 pincode,
  //               ): pincode is bigint =>
  //                 pincode !== null &&
  //                 pincode !== undefined,
  //             ),
  //         ),
  //       ];


  //       const finblogs =
  //         customerIds.length > 0
  //           ? await this.tenantPrisma.client.finb_logs.findMany({
  //             where: {
  //               customerID: {
  //                 in: customerIds,
  //               },
  //             },

  //             select: {
  //               customerID: true,
  //             },
  //           })
  //           : [];

  //       const finblogsCustomerSet = new Set(
  //         finblogs.map(
  //           (item) => item.customerID,
  //         ),
  //       );


  //       const servicePincodes =
  //         uniquePincodes.length > 0
  //           ? await this.tenantPrisma.client.pincode.findMany({
  //             where: {
  //               pincode: {
  //                 in: uniquePincodes.map(
  //                   (pincode: any) =>
  //                     pincode.toString(),
  //                 ),
  //               },

  //               isActive: true,
  //             },

  //             select: {
  //               pincode: true,
  //             },
  //           })
  //           : [];

  //       const serviceablePincodeSet =
  //         new Set(
  //           servicePincodes.map(
  //             (item) => item.pincode,
  //           ),
  //         );


  //       for (const customer of customers) {
  //         let currentStep: any =
  //           customer.step;

  //         let riskGrade = '-';


  //         if (
  //           customer.credforge_bre_log &&
  //           customer.credforge_bre_log.length > 0
  //         ) {
  //           const score: any =
  //             customer
  //               .credforge_bre_log[0]
  //               ?.responsePayload;

  //           riskGrade =
  //             score?.output_data
  //               ?.features
  //               ?.output_features
  //               ?.bureau
  //               ?.cbs_risk_grade ??
  //             score?.output_data
  //               ?.features
  //               ?.combo
  //               ?.cbs_risk_grade ??
  //             '-';
  //         }

  //         const address =
  //           customer.addresses[0];

  //         const selfie =
  //           customer.document[0];

  //         const employment =
  //           customer.employer[0];

  //         const bankStatement =
  //           customer.bankstatement[0];

  //         const isotpDone =
  //           customer.isVerified;

  //         const isKycDone = !!(
  //           customer.aadharNo &&
  //           customer.pancard
  //         );

  //         const isBankingDone =
  //           !!bankStatement;

  //         const isApplyButtonClicked =
  //           finblogsCustomerSet.has(
  //             customer.customerID,
  //           );

  //         const normalizedPincode =
  //           address?.pincode?.toString();

  //         const isPincodeOutsideService =
  //           !!normalizedPincode &&
  //           !serviceablePincodeSet.has(
  //             normalizedPincode,
  //           );


  //         if (!customer.emailVerify) {
  //           currentStep = 0;
  //         } else if (
  //           isKycDone &&
  //           !isBankingDone
  //         ) {
  //           currentStep = 1;
  //         }

  //         worksheet
  //           .addRow({
  //             customerID:
  //               customer.customerID,

  //             name:
  //               customer.name ?? '-',

  //             mobile:
  //               customer.mobile
  //                 ? customer.mobile.toString()
  //                 : '-',

  //             createdDate:
  //               customer.createdDate,

  //             utmSource:
  //               customer.utmSource ?? '-',

  //             isotpDone:
  //               isotpDone ? 'Yes' : 'No',

  //             is_apply_button_clicked:
  //               isApplyButtonClicked
  //                 ? 'Yes'
  //                 : 'No',

  //             is_pincode_outside_service:
  //               isPincodeOutsideService
  //                 ? 'Yes'
  //                 : 'No',

  //             is_preoffer_generated:
  //               customer
  //                 .credforge_bre_log
  //                 .length > 0
  //                 ? 'Yes'
  //                 : 'No',

  //             preoffer_decision:
  //               customer
  //                 .credforge_bre_log[0]
  //                 ?.status ?? '-',

  //             riskGrade,

  //             emailVerify:
  //               customer.emailVerify
  //                 ? 'Yes'
  //                 : 'No',

  //             is_kyc_done:
  //               isKycDone
  //                 ? 'Yes'
  //                 : 'No',

  //             is_banking_done:
  //               isBankingDone
  //                 ? 'Yes'
  //                 : 'No',

  //             step:
  //               currentStep,
  //           })
  //           .commit();

  //         totalProcessed++;
  //       }


  //       const lastCustomer =
  //         customers[customers.length - 1];

  //       lastCreatedDate =
  //         lastCustomer.createdDate;

  //       lastCustomerID =
  //         lastCustomer.customerID;

  //       console.log(
  //         `Excel export progress: ${totalProcessed} customers`,
  //       );


  //     }


  //     await worksheet.commit();

  //     /**
  //      * ------------------------------------------------------------
  //      * Finalize XLSX
  //      * ------------------------------------------------------------
  //      */
  //     await workbook.commit();

  //     console.log(
  //       `Not onboarded Excel export completed. ` +
  //       `Rows: ${totalProcessed}, ` +
  //       `Time: ${Date.now() - startedAt}ms`,
  //     );
  //   } catch (error) {
  //     console.error(
  //       `Not onboarded Excel export failed after ${Date.now() - startedAt
  //       }ms`,
  //       error instanceof Error
  //         ? error.stack
  //         : error,
  //     );


  //     if (!res.headersSent) {
  //       res.status(500).json({
  //         success: false,
  //         message: 'Failed to generate Excel export',
  //       });
  //     } else {
  //       res.destroy(
  //         error instanceof Error
  //           ? error
  //           : undefined,
  //       );
  //     }
  //   }
  // }


  async notOnboardedExcel(res: Response, { fromDate, toDate }: { fromDate: string; toDate: string }, req: Request,) {
    const startedAt = Date.now();

    try {
      /**
       * 1. Parse dates
       */
      const parseDate = (dateStr?: string): string | null => {
        if (!dateStr) return null;

        // DD-MM-YYYY
        if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
          const [day, month, year] = dateStr.split('-');
          return `${year}-${month}-${day}`;
        }

        // YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          return dateStr;
        }

        return null;
      };

      /**
       * 2. Build WHERE condition
       */
      const where: any = {
        is_onboarded: false,
      };

      if (fromDate) {
        const parsedFrom = parseDate(fromDate);
        if (!parsedFrom) {
          throw new BadRequestException(
            'Invalid fromDate. Use DD-MM-YYYY or YYYY-MM-DD',
          );
        }

        const from = new Date(`${parsedFrom}T00:00:00.000Z`);
        if (isNaN(from.getTime())) {
          throw new BadRequestException('Invalid fromDate');
        }

        where.createdDate = { ...(where.createdDate || {}), gte: from };
      }

      if (toDate) {
        const parsedTo = parseDate(toDate);
        if (!parsedTo) {
          throw new BadRequestException(
            'Invalid toDate. Use DD-MM-YYYY or YYYY-MM-DD',
          );
        }

        const to = new Date(`${parsedTo}T23:59:59.999Z`);
        if (isNaN(to.getTime())) {
          throw new BadRequestException('Invalid toDate');
        }

        where.createdDate = { ...(where.createdDate || {}), lte: to };
      }

      /**
       * 3. Resolve domain + journey config
       *    (before headers are sent so errors can still return JSON)
       */
      const domain = await this.smsService.getCurrentDomain(req);
      const journeyConfig = getJourneyConfig(domain);

      /**
       * 4. Headers MUST be sent before streaming
       */
      const filename = `NotOnboardedCustomer_${Date.now()}.xlsx`;

      res.status(200);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('X-Accel-Buffering', 'no');

      /**
       * 5. Streaming workbook (do NOT use new ExcelJS.Workbook())
       */
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: res,
        useStyles: false,
        useSharedStrings: false,
      });

      const worksheet = workbook.addWorksheet('Not Onboarded Customer');

      worksheet.columns = [
        { header: 'Customer ID', key: 'customerID', width: 15 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Mobile', key: 'mobile', width: 18 },
        { header: 'Created Date', key: 'createdDate', width: 22 },
        { header: 'Source', key: 'utmSource', width: 20 },
        { header: 'OTP Verified', key: 'isotpDone', width: 18 },
        { header: 'Apply Button Click', key: 'is_apply_button_clicked', width: 20 },
        { header: 'Pincode Outside Service', key: 'is_pincode_outside_service', width: 24 },
        { header: 'Pre-offer Generated', key: 'is_preoffer_generated', width: 20 },
        { header: 'Pre-offer Decision', key: 'preoffer_decision', width: 22 },
        { header: 'Risk Grade', key: 'riskGrade', width: 20 },
        { header: 'Email Verified', key: 'emailVerify', width: 18 },
        { header: 'KYC Done', key: 'is_kyc_done', width: 18 },
        { header: 'Banking Done', key: 'is_banking_done', width: 18 },
        { header: 'Step', key: 'step', width: 12 },

        // ---- Journey summary ----
        { header: 'Current Stage', key: 'currentStage', width: 28 },
        // { header: 'Total Steps', key: 'totalSteps', width: 12 },
        // { header: 'Completion %', key: 'completionPercentage', width: 15 },

        // ---- One column per journey step (from the domain config) ----
        // ...journeyConfig.steps.map((s) => ({
        //   header: s.title,
        //   key: `stage_${s.key}`,
        //   width: 24,
        // })),
      ];

      /**
       * 6. Keyset pagination loop
       */
      let lastCreatedDate: Date | null = null;
      let lastCustomerID: number | null = null;
      let totalProcessed = 0;

      while (true) {
        const cursorCondition =
          lastCreatedDate !== null && lastCustomerID !== null
            ? {
              OR: [
                { createdDate: { lt: lastCreatedDate } },
                {
                  AND: [
                    { createdDate: lastCreatedDate },
                    { customerID: { lt: lastCustomerID } },
                  ],
                },
              ],
            }
            : {};

        const customers = await this.tenantPrisma.client.customer.findMany({
          where: {
            AND: [where, cursorCondition],
          },

          orderBy: [{ createdDate: 'desc' }, { customerID: 'desc' }],

          take: this.EXPORT_BATCH_SIZE,

          select: {
            customerID: true,
            name: true,
            mobile: true,
            utmSource: true,
            createdDate: true,
            emailVerify: true,
            pancard: true,
            aadharNo: true,
            isVerified: true,
            step: true,

            employer: {
              take: 1,
              select: { employerName: true },
            },

            addresses: {
              take: 1,
              select: { pincode: true },
            },

            document: {
              where: { documentType: 'selfie' },
              take: 1,
              orderBy: { uploadedDate: 'desc' },
              select: { documentFile: true },
            },

            bankstatement: {
              take: 1,
              orderBy: { uploadedDate: 'desc' },
              select: { id: true },
            },

            preoffer: {
              where: { type: 'Outbound' },
              take: 1,
              orderBy: { createdDate: 'desc' },
              select: { createdDate: true },
            },

            credforge_bre_log: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: {
                status: true,
                responsePayload: true,
              },
            },
          },
        });

        if (customers.length === 0) {
          break;
        }

        const customerIds = customers.map((c) => c.customerID);

        /**
         * One query gives both "apply clicked" and "PAN done"
         */
        const finbLogs = await this.tenantPrisma.client.finb_logs.findMany({
          where: { customerID: { in: customerIds } },
          select: { customerID: true, pan: true },
        });

        const applyClickedSet = new Set(finbLogs.map((l) => l.customerID));
        const panDoneSet = new Set(
          finbLogs.filter((l) => !!l.pan).map((l) => l.customerID),
        );

        /**
         * Serviceable pincodes
         */
        const uniquePincodes: any = [
          ...new Set(
            customers
              .map((c) => c.addresses[0]?.pincode)
              .filter((p): p is bigint => p !== null && p !== undefined)
              .map((p) => p.toString()),
          ),
        ];

        const servicePincodes = uniquePincodes.length
          ? await this.tenantPrisma.client.pincode.findMany({
            where: {
              pincode: { in: uniquePincodes },
              isActive: true,
            },
            select: { pincode: true },
          })
          : [];

        const serviceablePincodeSet = new Set(
          servicePincodes.map((p) => p.pincode),
        );

        /**
         * Build rows
         */
        for (const customer of customers) {
          const breLog = customer.credforge_bre_log[0] ?? null;
          const score: any = breLog?.responsePayload;

          const riskGrade =
            score?.output_data?.features?.output_features?.bureau
              ?.cbs_risk_grade ??
            score?.output_data?.features?.combo?.cbs_risk_grade ??
            null;

          const preofferDecision = breLog?.status ?? null;

          const isBankRequired = resolveBankRequired(
            domain,
            preofferDecision,
            riskGrade,
          );
          const isBankCompleted = !!customer.bankstatement[0];

          const cardCompleted: CardCompleted= {
            preoffer: !!breLog,
            mobileOtp: !!customer.isVerified,
            panVerification: panDoneSet.has(customer.customerID),
            bankVerification: isBankRequired ? isBankCompleted : true,
            employment: !!customer.employer[0],
            loanOffer: !!customer.preoffer[0],
            personalDetails: !!customer.addresses[0],
            kyc: !!customer.pancard && !!customer.aadharNo,
            selfie: !!customer.document[0]?.documentFile,
            refrence: false,
          };

          const journey = buildJourney(journeyConfig, cardCompleted, isBankRequired);

          const isKycDone = cardCompleted.kyc;

          // Legacy "Step" column, same rules as your old export
          let legacyStep: any = customer.step;
          if (!customer.emailVerify) {
            legacyStep = 0;
          } else if (isKycDone && !isBankCompleted) {
            legacyStep = 1;
          }

          const pincode = customer.addresses[0]?.pincode?.toString();

          const row: Record<string, any> = {
            customerID: customer.customerID,
            name: customer.name ?? '-',
            mobile: customer.mobile ? customer.mobile.toString() : '-',
            createdDate: customer.createdDate,
            utmSource: customer.utmSource ?? '-',

            isotpDone: customer.isVerified ? 'Yes' : 'No',

            is_apply_button_clicked: applyClickedSet.has(customer.customerID) ? 'Yes' : 'No',

            is_pincode_outside_service:
              !!pincode && !serviceablePincodeSet.has(pincode) ? 'Yes' : 'No',

            is_preoffer_generated: breLog ? 'Yes' : 'No',
            preoffer_decision: preofferDecision ?? '-',
            riskGrade: riskGrade ?? '-',
            emailVerify: customer.emailVerify ? 'Yes' : 'No',

            is_kyc_done: isKycDone ? 'Yes' : 'No',
            is_banking_done: isBankCompleted ? 'Yes' : 'No',
            step: legacyStep,

            currentStage: journey.currentStageTitle,
            currentStep: journey.currentStep,
            totalSteps: journey.totalSteps,
            completionPercentage: `${journey.completionPercentage}%`,
          };

          for (const s of journey.steps) {
            row[`stage_${s.key}`] =
              s.status === 'completed'
                ? 'Completed'
                : s.status === 'skipped'
                  ? 'Skipped'
                  : 'Pending';
          }

          worksheet.addRow(row).commit();
          totalProcessed++;
        }

        const lastCustomer = customers[customers.length - 1];
        lastCreatedDate = lastCustomer.createdDate;
        lastCustomerID = lastCustomer.customerID;

        console.log(`Excel export progress: ${totalProcessed} customers`);
      }

      /**
       * 7. Finalize XLSX
       */
      await worksheet.commit();
      await workbook.commit();

      console.log(
        `Not onboarded Excel export completed. ` +
        `Rows: ${totalProcessed}, ` +
        `Time: ${Date.now() - startedAt}ms`,
      );
    } catch (error) {
      console.error(
        `Not onboarded Excel export failed after ${Date.now() - startedAt}ms`,
        error instanceof Error ? error.stack : error,
      );

      if (!res.headersSent) {
        // Validation errors (400) keep their status instead of becoming 500
        if (error instanceof HttpException) {
          res.status(error.getStatus()).json(error.getResponse());
        } else {
          res.status(500).json({
            success: false,
            message: 'Failed to generate Excel export',
          });
        }
      } else {
        res.destroy(error instanceof Error ? error : undefined);
      }
    }
  }

  async getNotloanApply({ page, limit, fromDate, toDate, }: {
    page: number;
    limit: number;
    fromDate?: string;
    toDate?: string;
  }) {
    try {
      const currentPage = page && page > 0 ? page : 1;
      const pageLimit = limit && limit > 0 ? limit : 20;
      const skip = (currentPage - 1) * pageLimit;

      const parseDate = (dateStr?: string): string | null => {
        if (!dateStr) return null;

        if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
          const [day, month, year] = dateStr.split('-');
          return `${year}-${month}-${day}`;
        }

        return dateStr;
      };

      const where: any = {
        is_onboarded: true,
        loanApplied: false,
      };

      if (fromDate) {
        const parsedFrom = parseDate(fromDate);
        const from = new Date(parsedFrom + 'T00:00:00.000Z');

        if (!isNaN(from.getTime())) {
          where.createdDate = {
            ...(where.createdDate || {}),
            gte: from,
          };
        }
      }

      if (toDate) {
        const parsedTo = parseDate(toDate);
        const to = new Date(parsedTo + 'T23:59:59.999Z');

        if (!isNaN(to.getTime())) {
          where.createdDate = {
            ...(where.createdDate || {}),
            lte: to,
          };
        }
      }

      const fifteenDaysAgo = new Date();
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

      const [customers, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.customer.findMany({
          where,
          skip,
          take: pageLimit,
          orderBy: {
            createdDate: 'desc',
          },
          select: {
            customerID: true,
            name: true,
            mobile: true,
            email: true,
            alternateMobile: true,
            utmSource: true,
            createdDate: true,
            emailVerify: true,
            is_onboarded: true,
            pancard: true,
            aadharNo: true,
            salary_date: true,
            kyc_at: true,
            step: true,
            isVerified: true,

            customer_extended: {
              select: {
                selfieAttempts: true,
              },
            },

            employer: {
              take: 1,
              select: {
                employeeType: true,
                empSalary: true,
                employerName: true,
                empEmail: true,
                address: true,
              },
            },

            addresses: {
              take: 1,
              select: {
                address: true,
                city: true,
                state: true,
                pincode: true,
                type: true,
              },
            },

            document: {
              where: {
                documentType: 'selfie',
              },
              take: 1,
              orderBy: {
                uploadedDate: 'desc',
              },
              select: {
                documentFile: true,
                uploadedDate: true,
              },
            },

            bankstatement: {
              where: {
                uploadedDate: {
                  gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
                },
                leadID: null,
              },
              take: 1,
              select: {
                id: true,
                uploadedDate: true,
              },
            },

            credforge_bre_log: {
              where: {
                createdAt: {
                  gte: fifteenDaysAgo,
                },
              },
              take: 1,
              orderBy: {
                createdAt: 'desc',
              },
              select: {
                status: true,
              },
            },

            leads: {
              orderBy: {
                createdDate: 'desc',
              },
              select: {
                leadID: true,
                status: true,
              },
            },
          },
        }),

        this.tenantPrisma.client.customer.count({
          where,
        }),
      ]);

      const uniquePincodes = [
        ...new Set(
          customers
            .map((c) => c.addresses[0]?.pincode)
            .filter((p): p is bigint => p !== null && p !== undefined),
        ),
      ];

      const customerIds = customers.map((c) => c.customerID);

      const finblogs = await this.tenantPrisma.client.finb_logs.findMany({
        where: {
          customerID: {
            in: customerIds,
          },
        },
        select: {
          customerID: true,
        },
      });

      const finblogsCustomerSet = new Set(
        finblogs.map((item) => item.customerID),
      );

      // Fetch all active serviceable pincodes
      const servicePincodes = await this.tenantPrisma.client.pincode.findMany({
        where: {
          pincode: {
            in: uniquePincodes.map((p) => p.toString()),
          },
          isActive: true,
        },
        select: {
          pincode: true,
        },
      });

      const serviceablePincodeSet = new Set(
        servicePincodes.map((item) => item.pincode),
      );

      const data = customers.map((customer) => {
        let currentStep: any = customer.step;

        const address = customer.addresses[0];
        const selfie = customer.document[0];
        const employment = customer.employer[0];
        const bankStatement = customer.bankstatement[0];
        const isotpDone = customer.isVerified;

        const isKycDone = !!(customer.aadharNo && customer.pancard);
        const isBankingDone = !!bankStatement;
        const isApplyButtonClicked = finblogsCustomerSet.has(
          customer.customerID,
        );

        const normalizedPincode = address?.pincode?.toString();
        const isPincodeOutsideService =
          !!normalizedPincode && !serviceablePincodeSet.has(normalizedPincode);

        // Step Calculation
        if (!customer.emailVerify) {
          currentStep = 0;
        } else if (isKycDone && !isBankingDone) {
          currentStep = 1;
        }

        return {
          customerID: customer.customerID,
          name: customer.name,
          mobile: customer.mobile,
          email: customer.email,
          state: address.state,
          city: address.city,
          pincode: address.pincode,
          createdDate: customer.createdDate,
          utmSource: customer.utmSource,
          isotpDone: isotpDone,
          pancard: customer.pancard,
          is_apply_button_clicked: isApplyButtonClicked,
          salary: employment.empSalary,

          is_pincode_outside_service: isPincodeOutsideService,

          is_onboarded: customer.is_onboarded,

          is_preoffer_generated: customer.credforge_bre_log.length > 0,

          preoffer_decision: customer.credforge_bre_log[0]?.status ?? null,

          step: currentStep,
        };
      });

      return normalize({
        data,
        pagination: {
          page: currentPage,
          limit: pageLimit,
          total,
          totalPages: Math.ceil(total / pageLimit),
        },
      });
    } catch (error: any) {
      console.error(error);
      return {
        error: error?.message || 'Something went wrong.',
      };
    }
  }

  async notLoanapplyExcel(
    res: Response,
    { fromDate, toDate }: { fromDate: string; toDate: string },
  ) {
    try {
      const parseDate = (dateStr?: string): string | null => {
        if (!dateStr) return null;

        if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
          const [day, month, year] = dateStr.split('-');
          return `${year}-${month}-${day}`;
        }

        return dateStr;
      };

      const where: any = {
        is_onboarded: true,
        loanApplied: false,
      };

      if (fromDate) {
        const parsedFrom = parseDate(fromDate);
        const from = new Date(parsedFrom + 'T00:00:00.000Z');

        if (!isNaN(from.getTime())) {
          where.createdDate = {
            ...(where.createdDate || {}),
            gte: from,
          };
        }
      }

      if (toDate) {
        const parsedTo = parseDate(toDate);
        const to = new Date(parsedTo + 'T23:59:59.999Z');

        if (!isNaN(to.getTime())) {
          where.createdDate = {
            ...(where.createdDate || {}),
            lte: to,
          };
        }
      }

      const fifteenDaysAgo = new Date();
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

      const [customers] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.customer.findMany({
          where,
          orderBy: {
            createdDate: 'desc',
          },
          select: {
            customerID: true,
            name: true,
            mobile: true,
            email: true,
            alternateMobile: true,
            utmSource: true,
            createdDate: true,
            emailVerify: true,
            is_onboarded: true,
            pancard: true,
            aadharNo: true,
            salary_date: true,
            kyc_at: true,
            step: true,
            isVerified: true,
            addresses: {
              take: 1,
              select: {
                address: true,
                city: true,
                state: true,
                pincode: true,
                type: true,
              },
            },
          },
        }),
      ]);

      const data = customers.map((customer) => {
        const address = customer.addresses[0];

        return normalize({
          customerID: customer.customerID,
          name: customer.name,
          mobile: customer.mobile,
          email: customer.email,
          state: address.state,
          city: address.city,
          pincode: address.pincode,
          createdDate: customer.createdDate,
          utmSource: customer.utmSource,
        });
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Not Onboarded Customer');

      worksheet.columns = [
        { header: 'Customer ID', key: 'customerID', width: 15 },
        { header: 'Name', key: 'name', width: 15 },
        { header: 'Mobile', key: 'mobile', width: 18 },
        { header: 'Created Date', key: 'createdDate', width: 22 },
        { header: 'Source', key: 'utmSource', width: 20 },
        { header: 'Email', key: 'email', width: 18 },
        { header: 'Pincode', key: 'pincode', width: 20 },
      ];

      for (const customer of data) {
        worksheet.addRow({
          customerID: customer.customerID,
          name: customer.name,
          mobile: customer.mobile,
          createdDate: customer.createdDate,
          utmSource: customer.utmSource,
          email: customer.email,
          pincode: customer.pincode,
        });
      }

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      res.setHeader(
        'Content-Disposition',
        'attachment; filename=NotloanapplyCustomer.xlsx',
      );

      await workbook.xlsx.write(res);

      res.end();
    } catch (err) {
      console.log(err);
    }
  }
}
