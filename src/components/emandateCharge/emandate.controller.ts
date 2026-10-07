import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EmandateChargeService } from './emandate.service';
import { RazorpayService } from '../disbursal/razorpay.service';
import * as fs from 'fs';
import * as path from 'path';
import { AuthGuard } from '../../gaurd/auth.gaurd';

@Controller('emandateCharge')
export class EmandateChargeController {
  constructor(
    private EmandateChargeService: EmandateChargeService,
    private razorpayService: RazorpayService,
  ) { }

  @UseGuards(AuthGuard)
  @Get('emandatechargeList')
  async getEmandateList(
    @Req() req: Request,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.EmandateChargeService.getEmandateChagreList({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
      req,
    });
  }

  @UseGuards(AuthGuard)
  @Post('charge-emandate')
  async chargeEmandate(
    @Req() req: Request,
    @Body() body: { leadID: string; amount: number }[],
  ) {
    return await this.EmandateChargeService.chargeEmandate(req, body);
  }

  @Post('emandate/webhook')
  async handleWebhook(
    @Req() req: Request,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    this.razorpayService.verifyWebhookSignature(req.body, signature);
    const logDir = path.join(process.cwd(), 'emandatewebhook-logs');
    const logFile = path.join(logDir, `razorpay-webhook-${Date.now()}.log`);

    // ensure directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    fs.appendFileSync(
      logFile,
      JSON.stringify(req.body, null, 2) + ',\n',
      'utf8',
    );
    // return this.DisbursalService.handlePayoutWebhook(req.body);
  }
}
