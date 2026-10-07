import { BadRequestException, Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';

import { CreateCampaignDto, UpdateCampaignDto } from './campaign.dto';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../../../prisma/tenet-prisma.service';
import { status as PrismaStatus } from '@prisma/client';

@Injectable()
export class CampaignsService {
    constructor(
        private readonly tenantPrisma: TenantPrismaService,
        private readonly clsService: ClsService,
    ) { }

    async create(data: CreateCampaignDto) {
        try {
            const userId = this.clsService.get('user');

            const { vendorId, status, ...rest } = data;
            const targetVendorId = vendorId ? Number(vendorId) : Number(userId);

            const response = await this.tenantPrisma.client.campaigns.create({
                data: {
                    ...rest,
                    vendorId: targetVendorId,
                    createdBy: Number(userId),
                    status: status === '0' ? PrismaStatus.ZERO : PrismaStatus.ONE,
                },
            });
            return response;
        } catch (error) {
            console.error('Error creating campaign:', error);
            throw error;
        }
    }

    // async findAll() {
    //     const tag = this.clsService.get('tag');

    //     const whereClause = {};
    //     if (tag !== "admin") {
    //         whereClause['createdBy'] = this.clsService.get('parent_id') || this.clsService.get('user');
    //     }
    //     return await this.tenantPrisma.client.campaigns.findMany({
    //         where: whereClause,
    //         include: {
    //             vendor: true,
    //         },
    //         orderBy: {
    //             createdAt: 'desc',
    //         },
    //     });
    // }

    async findAll(page = 1, limit = 20, search?: string) {
        try {
            const parsedPage = Number(page) || 1;
            const parsedLimit = Math.min(Number(limit) || 20, 100);

            const tag = this.clsService.get('tag');
            const role = this.clsService.get('role');

            const whereClause: any = {};
            if (tag !== "admin" && role.name !== "Vendor Manager") {
                whereClause.vendorId =
                    this.clsService.get('parent_id') || this.clsService.get('user');
            }

            if (search) {
                const searchOrClause: any[] = [];

                const stringFields = ['name', 'campaignId'];

                stringFields.forEach((field) => {
                    searchOrClause.push({
                        [field]: {
                            contains: search,
                            mode: 'insensitive',
                        },
                    });
                });

                if (!isNaN(Number(search))) {
                    const num = Number(search);
                    searchOrClause.push({ id: num });
                }

                whereClause.OR = searchOrClause;
            }

            const skip = (parsedPage - 1) * parsedLimit;

            const [data, total] = await Promise.all([
                this.tenantPrisma.client.campaigns.findMany({
                    where: whereClause,
                    skip,
                    take: parsedLimit,
                    orderBy: {
                        createdAt: 'desc',
                    },
                }),
                this.tenantPrisma.client.campaigns.count({
                    where: whereClause,
                }),
            ]);

            return {
                message: 'Campaigns fetched successfully',
                data: {
                    data,
                    total,
                    page: parsedPage,
                    limit: parsedLimit,
                },
            };
        } catch (error: any) {
            throw new BadRequestException(
                error?.message || 'Unable to fetch campaigns'
            );
        }
    }

    async findOne(id: number) {
        return await this.tenantPrisma.client.campaigns.findUnique({
            where: { id },
            include: {
                vendor: true,
                clickLogs: true,
            },
        });
    }
}