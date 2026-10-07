import { Module } from '@nestjs/common';

import { PayoutService } from './payout.service';
import { PayoutFactory } from './payout.factory';
import { RazorpayProvider } from './providers/razorpay.provider';
import { IciciProvider } from './providers/icici.provider';
import { DomainPayoutConfigService } from './config/payout.config';
import { PayoutController } from './payout.controller';

@Module({
  providers: [
    PayoutService,
    PayoutFactory,
    DomainPayoutConfigService,
    RazorpayProvider,
    IciciProvider,
  ],
  exports: [PayoutService],
  controllers: [PayoutController],
})
export class PayoutModule {}
