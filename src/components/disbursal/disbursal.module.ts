import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DisbursalController } from './disbursal.controller';
import { DisbursalService } from './disbursal.service';
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';
import { RazorpayService } from './razorpay.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PayoutModule } from '../payout/payout.module';
import { BullMqModule } from '../queue/queue.module';
import { CibilService } from '../cibil/cibil.service';
import { HttpModule } from '@nestjs/axios';



@Module({
  imports: [AuthModule, MailModule, SmsModule, PayoutModule, BullMqModule, HttpModule],
  providers: [PrismaService, DisbursalService, RazorpayService, CibilService],
  controllers: [DisbursalController],
})
export class DisbursalModule { }
