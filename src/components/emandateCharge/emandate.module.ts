import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { EmandateChargeService } from './emandate.service';
import { EmandateChargeController } from './emandate.controller';
import { SmsModule } from '../sms/sms.module';
import { RazorpayService } from '../disbursal/razorpay.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [AuthModule, SmsModule],
  providers: [PrismaService, EmandateChargeService, RazorpayService],
  controllers: [EmandateChargeController],
})
export class EmandateChargeModule { }
