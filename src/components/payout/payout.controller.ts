import { Body, Controller, Get, Post } from '@nestjs/common';
import { PayoutService } from './payout.service';

@Controller('payouts')
export class PayoutController {
  constructor(private readonly payoutService: PayoutService) {}

  @Get()
  async test() {
    console.log('Console mangta');
  }

  @Post('icici')
  async payoutPayment(@Body() body) {
    return await this.payoutService.transfer(body);
  }

  @Post('icici-status')
  async payoutPaymentStatus(@Body() body: { transRefNo: string }) {
    return await this.payoutService.status(body.transRefNo);
  }
}
