import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../../gaurd/auth.gaurd';
import { DisbursalCreditImprovedService } from './disbursal.creditbuilder.service';
import { PayoutStatus } from '../../../utility/enums';
import { MethodPermissionGuard } from '../../../gaurd/read.gaurd';
import { RazorpayService } from '../../disbursal/razorpay.service';
import { CreditBuilderGuard } from '../../../gaurd/creditBuilder.gaurd';

@Controller('credit-builder-disbursal')
@UseGuards(CreditBuilderGuard)
export class CreditImproveDisbursalController {
  constructor(
    private disbursalCreditImprovedService: DisbursalCreditImprovedService,
    private razorpayService: RazorpayService,
  ) {}

  @UseGuards(AuthGuard)
  @Get('disbursal-sheet-send')
  async getDisbursalSheetSend(
    @Req() req: Request,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.disbursalCreditImprovedService.getDisbursalSheetSend({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
      //   req,
    });
  }

  @UseGuards(AuthGuard)
  @Get('disbursed-leads')
  async getDisbursedLeads(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return this.disbursalCreditImprovedService.getDisbursedLeads({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search,
      filters: {
        fromDate,
        toDate,
      },
    });
  }

  @UseGuards(AuthGuard)
  @Patch('disburse/:leadId')
  async updateCreditBuilderDisbursal(
    @Param('leadId') leadId: string,
    @Body()
    body: {
      disbursalRefrenceNo: string;
      disbursalDate: string;
      remarks: string;
    },
  ) {
    return await this.disbursalCreditImprovedService.updateCreditBuilderDisbursal(
      Number(leadId),
      body,
    );
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post('approve-disbursal-payout')
  async approveDisbursalPayout(@Body('id') id: number, @Req() req: Request) {
    return await this.disbursalCreditImprovedService.approveCreditBuilderDisbursalPayout(
      id,
      req,
    );
  }

  // @UseGuards(AuthGuard)
  // @Patch('approve-payout/:id')
  // async approveCreditBuilderDisbursalPayout(@Param('id') id: number, @Req() req: Request) {
  //   return await this. disbursalCreditImprovedService.approveCreditBuilderDisbursalPayout(id, req);
  // }

  @UseGuards(AuthGuard)
  @Get('payout-status/:id')
  async disbursalPayoutStatus(
    @Param('id') id: number,
    @Body('status') status: PayoutStatus,
  ) {
    return await this.disbursalCreditImprovedService.disbursalPayoutStatus(
      id,
      status,
    );
  }

  // @Post('webhook/payout')
  // async handlePayoutWebhook(@Body() body: any) {
  //   return await this.disbursalCreditImprovedService.handlePayoutWebhook(body);
  // }

  @Post('razorpay/webhook')
  async handleWebhook(
    @Req() req: Request,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    console.log(req.headers, 'check payout webhook headers');

    this.razorpayService.verifyWebhookSignature(req.body, signature);

    return this.disbursalCreditImprovedService.handlePayoutWebhook(req.body);
  }

  @UseGuards(AuthGuard)
  @Get('disbursal-payout')
  async getDisbursalPayout(
    @Req() req: Request,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
    @Query('status') status?: PayoutStatus,
  ) {
    return await this.disbursalCreditImprovedService.getDisbursalPayout({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
      status,
    });
  }

  @UseGuards(AuthGuard)
  @Get('disbursal-detail/:leadID')
  async getLoanCalculation(
    @Param('leadID') leadID: string,
    @Req() req: Request,
  ) {
    return await this.disbursalCreditImprovedService.getCreditBuilderLoanCalculation(
      leadID,
      req,
    );
  }
}
