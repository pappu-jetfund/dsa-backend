import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { TenantPrismaService } from '../../../prisma/tenet-prisma.service';

@Module({
    controllers: [ReportsController],
    providers: [ReportsService, TenantPrismaService],
})
export class DsaReportsModule { }
