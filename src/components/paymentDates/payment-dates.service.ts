import { Injectable, BadRequestException, HttpException, } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class PaymentDatesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly clsService: ClsService,
  ) { }

  async getBlockedDates() {
    try {
      const records = await this.tenantPrisma.client.payment_block_dates.findMany({
        where: { isActive: true },
        select: { date: true },
        orderBy: { date: 'asc' },
      });

      const data = records.map((item) => {
        const d = new Date(item.date);
        return d.toISOString().split('T')[0];
      });

      return {
        statusCode: 200,
        success: true,
        data,
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        success: false,
        message: err?.message || 'Failed to fetch payment dates',
      };
    }
  }

  async saveBlockedDates(body: { dates?: string[]; reason?: string }) {
    try {
      const { dates = [], reason } = body;
      const userId = this.clsService.get('user');

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const validDates = dates.map((d) => new Date(d)).filter((date) => !isNaN(date.getTime()) && date >= today);

      if (validDates.length === 0 && dates.length > 0) {
        throw new BadRequestException('Only valid future dates are allowed');
      }

      const existingDates = await this.tenantPrisma.client.payment_block_dates.findMany({
        select: { id: true, date: true, isActive: true },
      });

      const existingMap = new Map(
        existingDates.map((d) => [new Date(d.date).toISOString(), d]),
      );


      const incomingSet = new Set(
        validDates.map((d) => d.toISOString()),
      );


      const operations: any[] = [];

      for (const date of validDates) {
        const key = date.toISOString();
        const existing = existingMap.get(key);

        if (existing) {
          if (!existing.isActive) {
            operations.push(
              this.tenantPrisma.client.payment_block_dates.update({
                where: { id: existing.id },
                data: {
                  isActive: true,
                  reason: reason || null,
                  updatedById: userId || null,
                },
              }),
            );
          }
        } else {
          operations.push(
            this.tenantPrisma.client.payment_block_dates.create({
              data: {
                date,
                reason: reason || null,
                createdById: userId || null,
              },
            }),
          );
        }
      }


      for (const existing of existingDates) {
        const key = new Date(existing.date).toISOString();

        if (!incomingSet.has(key) && existing.isActive) {
          operations.push(
            this.tenantPrisma.client.payment_block_dates.update({
              where: { id: existing.id },
              data: {
                isActive: false,
                updatedById: userId || null,
              },
            }),
          );
        }
      }

      if (operations.length > 0) {
        await this.tenantPrisma.client.$transaction(operations);
      }

      return {
        statusCode: 200,
        success: true,
        message: 'Payment blocked dates synced successfully',
      };
    } catch (err: any) {
      throw new HttpException(
        {
          statusCode: err?.status || 500,
          success: false,
          message: err?.response?.message || err?.message || 'Failed to save payment dates',
        },
        err?.status || 500,
      );
    }
  }

  async deleteDate(date: string) {
    try {
      if (!date) {
        throw new BadRequestException('Date is required');
      }

      const parsedDate = new Date(date);

      if (isNaN(parsedDate.getTime())) {
        throw new BadRequestException('Invalid date format');
      }

      await this.tenantPrisma.client.payment_block_dates.updateMany({
        where: {
          date: parsedDate,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      return {
        statusCode: 200,
        success: true,
        message: 'Date removed successfully',
      };
    } catch (err: any) {
      return {
        statusCode: err?.status || 500,
        success: false,
        message: err?.response?.message || err?.message || 'Failed to delete date',
      };
    }
  }
}