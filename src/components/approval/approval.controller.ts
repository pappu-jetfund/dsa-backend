import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { AuthGuard } from '../../gaurd/auth.gaurd';
import { MethodPermissionGuard } from '../../gaurd/read.gaurd';
import type { Response } from 'express';

@Controller('approval')
export class ApprovalController {
  constructor(private ApprovalService: ApprovalService) { }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post(':leadId/aprroved-process')
  async approvedProcess(
    @Param('leadId') leadId: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    return await this.ApprovalService.approvedProcess(leadId, body, req);
  }

  @UseGuards(AuthGuard)
  @Get('list-aprroved-process')
  async ListapprovedProcess(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.ApprovalService.ListapprovedProcess({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('rejected-process-list')
  async rejectedProcessList(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.ApprovalService.rejectedProcessList({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('hold-process-list')
  async holdProcessList(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.ApprovalService.holdProcessList({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('not-required-process-list')
  async notRequiredProcessList(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.ApprovalService.notRequiredProcessList({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Patch(':leadId/credit-aprroved/:approvalID')
  async creditApproved(
    @Param('leadId') leadId: string,
    @Param('approvalID') approvalID: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    return await this.ApprovalService.creditApproved(
      leadId,
      approvalID,
      body,
      req,
    );
  }

  @UseGuards(AuthGuard)
  @Get('download-excel-Rejected-process')
  async rejectedprocessExcel(
    @Res() res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.ApprovalService.rejectedprocessExcel(res, {
      fromDate: fromDate || '',
      toDate: toDate || '',
    });
  }
}
