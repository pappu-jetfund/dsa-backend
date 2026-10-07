import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { SmsService } from '../sms/sms.service';
import { SmsModule } from '../sms/sms.module';
import { MailModule } from '../mail/mail.module';
import { PrismaService } from '../../prisma/prisma.service';
import { CibilService } from '../cibil/cibil.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [AuthModule, SmsModule, MailModule, HttpModule],
  providers: [PrismaService, ApprovalService, CibilService],
  controllers: [ApprovalController],
})
export class ApprovalModule { }
