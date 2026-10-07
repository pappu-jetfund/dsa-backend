import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { TenantPrismaService } from '../../../prisma/tenet-prisma.service';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SmsModule } from '../../sms/sms.module';

@Module({
    imports: [SmsModule],
    controllers: [ReportsController],
    providers: [ReportsService, TenantPrismaService, MailService, PrismaService],
})
export class DsaReportsModule { }
