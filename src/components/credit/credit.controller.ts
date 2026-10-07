import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { CreditService } from './credit.service';
import { AuthGuard } from '../../gaurd/auth.gaurd';
import { MethodPermissionGuard } from '../../gaurd/read.gaurd';
import type { Response } from 'express';

@Controller('credit')
export class CreditController {
  constructor(private CreditService: CreditService) { }

  @UseGuards(AuthGuard)
  @Get('list-approved')
  async listApproved(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.CreditService.listApproved({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('list-rejected')
  async listRejected(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.CreditService.listRejected({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('list-hold')
  async listHold(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.CreditService.listHold({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('list-not-required')
  async listNotRequired(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.CreditService.listNotRequired({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  // @UseGuards(AuthGuard)
  @Get('send-mail')
  async sendMail() {
    return await this.CreditService.sendMail();
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post(':leadID/send-mail-with-type')
  async sendMailType(@Param('leadID') leadID: string, @Body() body: any) {

    return await this.CreditService.sendMailType(leadID, body);
  }


  @UseGuards(AuthGuard)
  @Get('download-excel-Rejected')
  async rejectedExcel(
    @Res() res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.CreditService.rejectedExcel(res, {
      fromDate: fromDate || '',
      toDate: toDate || '',
    });
  }


  @UseGuards(AuthGuard)
  @Post(':leadId/create-credit-remarks')
  async addCreditRemarks(
    @Param('leadId') leadId: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    return await this.CreditService.addCreditRemarks(leadId, body, req);
  }
}
