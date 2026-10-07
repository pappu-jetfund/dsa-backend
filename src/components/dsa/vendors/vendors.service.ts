import { BadRequestException, Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import * as crypto from 'crypto';
import { TenantPrismaService } from '../../../prisma/tenet-prisma.service';
import { CreateVendorDto, UpdateVendorDto } from './vendor.dto';
import { ClsService } from 'nestjs-cls';
import { CommissionType } from '../../../utility/enums';
import { status as PrismaStatus } from '@prisma/client';


@Injectable()
export class VendorsService {
    constructor(
        private readonly tenantPrisma: TenantPrismaService,
        private readonly clsService: ClsService,
    ) { }

    private generateClientId(): string {
        return `client_${uuid().replace(/-/g, '').slice(0, 12)}`;
    }

    private generateSecretId(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    async createVendor(data: CreateVendorDto) {
        try {
            const clientId = this.generateClientId();
            const secretId = this.generateSecretId();

            const userId = this.clsService.get('user');

            const creator: any = await this.tenantPrisma.client.vendors.findUnique({
                where: { id: userId },
            });

            if (!creator) {
                throw new BadRequestException('User not found');
            }

            if (creator.parentId !== null) {
                throw new BadRequestException('Child vendor cannot create another vendor');
            }

            if (data.type === 1 && data.tag) {
                throw new BadRequestException('Tag not allowed for child vendor');
            }

            // switch (data.commissionType) {
            //     case CommissionType.PERCENTAGE:
            //     case CommissionType.FIXED:
            //         if (!data.commissionValue) {
            //             throw new BadRequestException('commissionValue is required');
            //         }
            //         break;

            //     case CommissionType.SLAB:
            //         if (!data.slabs || data.slabs.length === 0) {
            //             throw new BadRequestException('Slabs are required');
            //         }
            //         break;

            //     case CommissionType.CUSTOM_LEAD:
            //         if (!data.leadPricing || data.leadPricing.length === 0) {
            //             throw new BadRequestException('Lead pricing is required');
            //         }
            //         break;
            // }

            const vendorTag = data.type === 0 ? data.tag : creator.tag;

            const payload: any = {
                name: data.name,
                email: data.email,
                roleId: data.roleId,
                companyName: data.companyName,
                tag: vendorTag,
                clientId,
                secretId,
                password: '',
                createdBy: userId,
                parentId: data.type === 1 ? creator.id : null,
                // commissionType: data.commissionType || null,
                // commissionValue: data.commissionType === 'PERCENTAGE' || data.commissionType === 'FIXED' ? data.commissionValue : null,
            };

            // if (data.commissionType === 'SLAB') {
            //     const slabs = data.slabs!;

            //     payload.slabs = {
            //         create: slabs.map((slab) => ({
            //             from: slab.from,
            //             to: slab.to,
            //             value: slab.value,
            //         })),
            //     };
            // }

            // if (data.commissionType === 'CUSTOM_LEAD') {

            //     if (!data.leadPricing || data.leadPricing.length === 0) {
            //         throw new BadRequestException('Lead pricing is required');
            //     }

            //     payload.leadPricing = {
            //         create: data.leadPricing.map((lead) => ({
            //             leadId: lead.leadId,
            //             amount: lead.amount,
            //         })),
            //     };
            // };


            const response = await this.tenantPrisma.client.vendors.create({
                data: payload,
                include: {
                    slabs: true,
                    leadPricing: true,
                },
            });

            if (vendorTag) {
                await this.tenantPrisma.client.campaigns.create({
                    data: {
                        name: vendorTag,
                        vendorId: response.id,
                        createdBy: Number(userId),
                        status: PrismaStatus.ONE,
                    },
                });
            }

            return {
                message: 'Vendor created.',
                data: response,
            };
        } catch (error: any) {
            if (error.code === 'P2002') {
                throw new BadRequestException({
                    message: 'Email already exists',
                    statusCode: 400,
                });
            }

            throw new BadRequestException({
                message: error.message,
                statusCode: 400,
            });

        }
    }

    async findAll(payload: { page?: number, limit?: number, search?: string, type?: number }) {
        try {
            let { page, limit, search, type } = payload;
            page = payload.page ?? 1;
            limit = payload.limit ?? 20;
            search = payload.search || undefined;

            const parsedPage = Number(page) || 1;
            const parsedLimit = Math.min(Number(limit) || 20, 100);

            const tag = this.clsService.get('tag');
            const role = this.clsService.get('role');

            const whereClause: any = {};

            if (tag !== "admin" && role.name !== "Vendor Manager") {
                whereClause.parentId = this.clsService.get('parent_id') || this.clsService.get('user');
            } else {
                whereClause.tag = { not: "admin" };
                if (type) {
                    whereClause.role = { name: { not: "Vendor Manager" } };
                }
            }

            if (search) {
                const searchOrClause: any[] = [];

                const stringFields = ['name', 'email', 'clientId', 'tag'];

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
                this.tenantPrisma.client.vendors.findMany({
                    where: whereClause,
                    skip,
                    take: parsedLimit,
                    select: {
                        id: true,
                        isActive: true,
                        name: true,
                        email: true,
                        companyName: true,
                        createdAt: true,
                        tag: true,
                        parentId: true,
                        role: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                }),
                this.tenantPrisma.client.vendors.count({
                    where: whereClause,
                }),
            ]);
            return {
                message: 'Vendors fetched successfully',
                data: {
                    data,
                    total,
                    page: parsedPage,
                    limit: parsedLimit,
                },
            };
        } catch (error: any) {
            throw new BadRequestException(
                error?.message || 'Unable to fetch vendors'
            );
        }
    }

    async findOne(id: number) {
        return await this.tenantPrisma.client.vendors.findUnique({
            where: {
                id,
            },
            select: {
                id: true,
                isActive: true,
                name: true,
                email: true,
                clientId: true,
                secretId: true,
                createdAt: true,
                tag: true,
                commissionType: true,
                commissionValue: true,
                parent: {
                    select: {
                        name: true,
                        tag: true,
                        email: true,
                        isActive: true

                    }
                },
                slabs: true,
                leadPricing: true,
                role: true

            }
        });
    }

    async update(id: number, data: UpdateVendorDto) {
        try {

            const payload: any = {
                name: data.name,
                email: data.email,
                roleId: data.roleId,
                companyName: data.companyName,
                tag: data.tag,
                // commissionType: data.commissionType || undefined,
                // commissionValue: data.commissionValue || undefined,
            };

            // Remove undefined properties
            Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

            // Handle slabs update
            // if (data.slabs !== undefined) {
            //     payload.slabs = {
            //         deleteMany: {},
            //         create: data.slabs.map((slab) => ({
            //             from: slab.from,
            //             to: slab.to,
            //             value: slab.value,
            //         })),
            //     };
            // }

            // Handle leadPricing update
            // if (data.leadPricing !== undefined) {
            //     payload.leadPricing = {
            //         deleteMany: {},
            //         create: data.leadPricing.map((lead) => ({
            //             leadId: lead.leadId,
            //             amount: lead.amount,
            //         })),
            //     };
            // }

            const response = await this.tenantPrisma.client.vendors.update({
                where: { id },
                data: payload,
                include: {
                    slabs: true,
                    leadPricing: true,
                },
            });

            return {
                message: 'Vendor updated successfully.',
                data: response,
            };
        } catch (error: any) {
            if (error.code === 'P2025') {
                throw new BadRequestException('Vendor not found');
            }

            throw new BadRequestException({
                message: error.message,
                statusCode: 400,
            });
        }
    }

    async ownDetail(userId: any) {
        const vendor: any = await this.tenantPrisma.client.vendors.findUnique({
            where: {
                id: userId,
            },
            select: {
                id: true,
                isActive: true,
                name: true,
                email: true,
                clientId: true,
                secretId: true,
                createdAt: true,
                tag: true,
                commissionType: true,
                commissionValue: true,
                parent: {
                    select: {
                        name: true,
                        tag: true,
                        email: true,
                        isActive: true

                    }
                },
                slabs: true,
                leadPricing: true,
                role: true

            }
        });

        const permissionIds: number[] = vendor?.role?.permissionIds || [];

        // if (vendor.role) {
        //     delete vendor.role;
        // };

        let permissions: any = [];

        if (permissionIds.length > 0) {
            permissions = await this.tenantPrisma.client.dsa_permissions.findMany({
                where: {
                    id: {
                        in: permissionIds,
                    },
                },
                select: {
                    id: true,
                    name: true,
                    module: true,
                },
            });
        };
        vendor.permissions = permissions;

        return vendor
    }
}