import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { MailModule } from '../../mail/mail.module';
import { SmsModule } from '../../sms/sms.module';
import { PayoutModule } from '../../payout/payout.module';
import { BullMqModule } from '../../queue/queue.module';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '../../../prisma/prisma.service';
// import { DisbursalCreditImprovedService } from './disbursal.creditbuilder.service';
import { RazorpayService } from '../../disbursal/razorpay.service';
import { CibilService } from '../../cibil/cibil.service';
import { CreditImproveDisbursalController } from './disbursal.creditbuilder.controller';
import { DisbursalCreditImprovedService } from './disbursal.creditbuilder.service';


@Module({
  imports: [
    AuthModule,
    MailModule,
    SmsModule,
    PayoutModule,
    BullMqModule,
    HttpModule,
  ],
  providers: [
    PrismaService,
    DisbursalCreditImprovedService,
    RazorpayService,
    CibilService,
  ],
  controllers: [CreditImproveDisbursalController],
})
export class DisbursalCreditImprovedModule {}
