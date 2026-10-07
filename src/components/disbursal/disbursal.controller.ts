import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors, } from '@nestjs/common';
import type { Response } from 'express';
import { DisbursalService } from './disbursal.service';
import { PayoutGenerateStatus, PayoutStatus } from '../../utility/enums';
import { RazorpayService } from './razorpay.service';
import * as fs from 'fs';
import * as path from 'path';
import { AuthGuard } from '../../gaurd/auth.gaurd';
import { MethodPermissionGuard } from '../../gaurd/read.gaurd';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@Controller('disbursal')
export class DisbursalController {
  constructor(
    private DisbursalService: DisbursalService,
    private razorpayService: RazorpayService,
  ) { }

  @UseGuards(AuthGuard)
  @Get('dashboard/disbursalData')
  async getDisbursalData(
    @Query('date') date?: string, // Format: dd-MM-YYYY
    @Query('month') month?: string, // 1-12
    @Query('year') year?: string, // 2023, 2024, etc.
  ) {
    return await this.DisbursalService.getDisbursalData(date, month, year);
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
    return await this.DisbursalService.getDisbursedLeads({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

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
    return await this.DisbursalService.getDisbursalSheetSend({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
      req,
    });
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Patch(':leadId/update-disbursal')
  async updateDisbursal(
    @Param('leadId') leadId: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    return await this.DisbursalService.updateDisbursal(leadId, body, req);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Patch('disbursed-export')
  async disbursedExport(@Req() req: Request, @Body() body: any) {
    return await this.DisbursalService.disbursedExport(req, body);
  }

  @UseGuards(AuthGuard)
  @Get('disbursal-sheet-exported')
  async getDisbursalSheetExported(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.DisbursalService.getDisbursalSheetExported({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Patch('reverse-disbursed-export')
  async revrseDisbursedExport(@Req() req: Request, @Body() body: any) {
    return await this.DisbursalService.revrseDisbursedExport(req, body);
  }

  @UseGuards(AuthGuard)
  @Get('download-excel-disbursed')
  async disbursedExcel(
    @Res() res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.DisbursalService.disbursedExcel(res, {
      fromDate: fromDate || '',
      toDate: toDate || '',
    });
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
    return await this.DisbursalService.getDisbursalPayout({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
      status,
      req,
    });
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post('approve-disbursal-payout')
  async approveDisbursalPayout(@Body('id') id: number, @Req() req: Request) {
    return await this.DisbursalService.approveDisbursalPayout(id, req);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Patch('disbursal-payout-status')
  async disbursalPayoutStatus(
    @Body() body: { id: number; status: PayoutStatus },
  ) {
    return await this.DisbursalService.disbursalPayoutStatus(
      body.id,
      body.status,
    );
  }

  @Post('razorpay/webhook')
  async handleWebhook(
    @Req() req: Request,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    console.log(req.headers, 'check payout webhook headers');

    this.razorpayService.verifyWebhookSignature(req.body, signature);
    // const logDir = path.join(process.cwd(), 'webhook-logs');
    // const logFile = path.join(logDir, `razorpay-webhook-${Date.now()}.log`);

    // ensure directory exists
    // if (!fs.existsSync(logDir)) {
    //   fs.mkdirSync(logDir, { recursive: true });
    // }

    // fs.appendFileSync(
    //   logFile,
    //   JSON.stringify(req.body, null, 2) + ',\n',
    //   'utf8',
    // );
    return this.DisbursalService.handlePayoutWebhook(req.body);
  }

  @Post('razorpay/payout-downtime')
  async handlePayoutDowntime(
    @Req() req: Request,

    @Headers('x-razorpay-signature') signature: string,
  ) {
    this.razorpayService.verifyWebhookSignature(req.body, signature);

    return await this.DisbursalService.handlePayoutDowntimeWebhook(req.body);
  }

  @UseGuards(AuthGuard)
  @Get('get-payout-downtime')
  async getPayoutDowntime() {
    return await this.DisbursalService.getPayoutDowntime();
  }

  @UseGuards(AuthGuard)
  @Get('get-disbursed-data')
  async downloadExcel(@Res() res: Response) {
    const workbook = await this.DisbursalService.getDisbursedDataExcel();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="topup-rupyalelo.xlsx"',
    );

    await workbook.xlsx.write(res);
    res.end();
  }

  // @UseGuards(AuthGuard)
  @Get('get-cibil-data')
  async getCibilData() {
    return this.DisbursalService.getCibilData();
  }

  @UseGuards(AuthGuard)
  @Post('payout-generate')
  async generatePayout(@Body() body: { leadId: number }) {
    return await this.DisbursalService.generatePayout(body.leadId);
  }

  @UseGuards(AuthGuard)
  @Get('disbursal-payout-generation')
  async getWithoutGeneratedPayout(
    @Req() req: Request,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
    @Query('status') status?: PayoutGenerateStatus,
  ) {
    return await this.DisbursalService.getWithoutGeneratedPayout({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
      status,
      req,
    });
  }


  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Get('icici-payout-list')
  async getIciciPayoutList(
    @Req() req: Request,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('tab') tab: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.DisbursalService.getIciciPayoutList({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      tab: tab || 'ALL',
      search: search || '',
      filters: { fromDate, toDate },
      req,
    });
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post('make-payout-icici')
  async makePayoutIcici(
    @Body() body: { leadId: number },
    @Req() req: Request,
  ) {
    return await this.DisbursalService.makePayoutIcici(body.leadId, req);
  }


  @Get('loan-report')
  async getLoanReport(
    @Res() res: Response,
    @Query() query: any,
  ) {
    return this.DisbursalService.getReportByNumber(res, query);
  }


  @UseGuards(AuthGuard)
  @Post('bulk-upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
      },
      fileFilter: (req, file, callback) => {
        const allowedExtensions = ['xlsx'];

        const extension = file.originalname
          .split('.')
          .pop()
          ?.toLowerCase();

        if (!extension || !allowedExtensions.includes(extension)) {
          return callback(
            new Error('Only .xlsx Excel files are allowed'),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  async bulkDisbursalUpload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ): Promise<any> {
    return this.DisbursalService.bulkDisbursalUpload(file, req);
  }

  @UseGuards(AuthGuard)
  @Get('bulk-upload-template')
  async downloadBulkDisbursalTemplate(
    @Res() res: Response,
  ): Promise<void> {
    const buffer =
      await this.DisbursalService.downloadBulkDisbursalTemplate();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="bulk-disbursal-template.xlsx"',
    );
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
