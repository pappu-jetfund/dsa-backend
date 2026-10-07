import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [AuthModule, MailModule, SmsModule],
  providers: [PrismaService, DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule { }
