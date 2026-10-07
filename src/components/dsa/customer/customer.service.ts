import { BadRequestException, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../../../prisma/tenet-prisma.service';
import { normalize } from '../../../utility/helper';

@Injectable()
export class DsaCustomerService {
    constructor(
        private readonly tenantPrisma: TenantPrismaService,
        private readonly clsService: ClsService,
    ) { }

    async listCustomers(page = 1, limit = 20, search?: string,) {
        try {
            const parsedPage = Number(page) || 1;
            const parsedLimit = Number(limit) || 20;
            const tag = this.clsService.get('tag');
            const whereClause: any = {};

            // Base filter by tag if not admin
            if (tag && String(tag).toLowerCase() !== 'admin') {
                whereClause.utmSource = String(tag);
            }

            // Add search filters
            if (search) {
                const searchOrClause: any[] = [];

                const stringFields = ['name', 'firstName', 'lastName', 'email'];

                stringFields.forEach((field) => {
                    searchOrClause.push({
                        [field]: { contains: search },
                    });
                });

                // Numeric-safe handling
                if (!isNaN(Number(search))) {
                    const num = Number(search);

                    searchOrClause.push(
                        { mobile: num },
                        { customerID: num }
                    );
                }

                whereClause.OR = searchOrClause;
            }


            const skip = (parsedPage - 1) * parsedLimit;

            const [data, total] = await Promise.all([
                this.tenantPrisma.client.customer.findMany({
                    where: whereClause,
                    skip,
                    take: parsedLimit,
                    select: {
                        customerID: true,
                        name: true,
                        fatherName: true,
                        gender: true,
                        dob: true,
                        companyName: true,
                        loanApplied: true,
                        utmSource: true,
                        profile: true,
                    },
                    orderBy: {
                        customerID: 'desc',
                    },
                }),
                this.tenantPrisma.client.customer.count({
                    where: whereClause,
                }),
            ]);
            const normalizedData = data.map((customer) => normalize(customer));
            return {
                message: 'Customers fetched successfully',
                data: {
                    data: normalizedData,
                    total,
                    page: parsedPage,
                    limit: parsedLimit,
                }
            };
        } catch (error: any) {
            throw new BadRequestException(error?.message || 'Unable to fetch customers');
        }
    }
}
