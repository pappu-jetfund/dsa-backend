import { Body, Controller, Get, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { AuthGuard } from '../../gaurd/auth.gaurd';
import { FileInterceptor } from '@nestjs/platform-express';


@Controller('report')
export class ReportController {
  constructor(private ReportsService: ReportsService) { }

  @UseGuards(AuthGuard)
  @Get('remaining-sanction-credit-leadCount')
  async getallSanctionleadCount(@Query('userID') userID?: string) {
    return await this.ReportsService.getallSanctionleadCount({
      userID,
    });
  }

  @UseGuards(AuthGuard)
  @Get('today-leads-status-summary')
  async gettodayLeadsSummary() {
    return await this.ReportsService.getTodayLeadCountByStatus();
  }

  @UseGuards(AuthGuard)
  @Get('document-received-cases-report')
  async gettotaldocRecived() {
    return await this.ReportsService.gettotaldocRecived();
  }

  @UseGuards(AuthGuard)
  @Get('sanction-reports-userWise')
  async getSanctionReportUserWise(
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.ReportsService.getSanctionReportUserWise({
      fromDate,
      toDate,
    });
  }

  @UseGuards(AuthGuard)
  @Get('credit-reports-userWise')
  async getCreditReportUserWise(
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.ReportsService.getCreditReportUserWise({
      fromDate,
      toDate,
    });
  }

  @UseGuards(AuthGuard)
  @Get('disbursed-reports-userWise')
  async getDisbursedReportUserWise(
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.ReportsService.getDisbursedReportUserWise({
      fromDate,
      toDate,
    });
  }

  @UseGuards(AuthGuard)
  @Get('reloan-pending')
  async getReloanPending(
    @Req() req: Request,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.ReportsService.getReloanPending({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      filters: { fromDate, toDate },
      req,
    });
  }



  // @Post('upload-pincode')
  // @UseInterceptors(FileInterceptor('file'))
  // async uploadExcel(
  //   @UploadedFile() file: Express.Multer.File,
  // ) {
  //   return await this.ReportsService.uploadPincodeExcel(file);
  // }


  @UseGuards(AuthGuard)
  @Get('download-excel-reloan')
  async reloanPendingExcel(
    @Res() res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {



    return await this.ReportsService.reloanPendingExcel(res, {
      fromDate: fromDate || '',
      toDate: toDate || '',
    });
  }
}
