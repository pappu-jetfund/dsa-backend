import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UploadedFiles, UseGuards, UseInterceptors, } from '@nestjs/common';
import { CollectionService } from './collection.service';

import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import type { Express, Response } from 'express';
import { AuthGuard } from '../../gaurd/auth.gaurd';
import { MethodPermissionGuard } from '../../gaurd/read.gaurd';

@Controller('collection')
export class CollectionController {
  constructor(private CollectionService: CollectionService) { }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Get('payment-pending')
  async getPaymentPendingCollections(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.CollectionService.getPaymentPendingCollections({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('closed-collections')
  async getClosedCollections(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.CollectionService.getClosedCollections({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('part-payment')
  async getPartPaymentCollections(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.CollectionService.getPartPaymentCollections({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('settelment')
  async getSettelmentCollections(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.CollectionService.getSettelmentCollections({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post(':leadId/create-collection')
  @UseInterceptors(FileInterceptor('files'))
  async createCollection(
    @Body() body: any,
    @Param('leadId') leadId: string,
    @UploadedFile() files: Express.Multer.File,
    @Req() req: Request,
  ) {
    return await this.CollectionService.createCollection(body, files, leadId, req);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Patch(':collectionId/update-collectionEntry')
  @UseInterceptors(FileInterceptor('file'))
  async updateCollection(
    @Body() body: any,
    @Param('collectionId') collectionId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return await this.CollectionService.updateCollection(
      body,
      file,
      collectionId,
    );
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Patch(':collectionId/update-collection-status')
  async updateCollectionStatus(
    @Param('collectionId') collectionId: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    return await this.CollectionService.updateCollectionStatus(
      collectionId,
      body,
      req
    );
  }

  @UseGuards(AuthGuard)
  @Get('collection-approval-pending')
  async getCollectionApprovalPending(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.CollectionService.getCollectionApprovalPending({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('collection-approved')
  async getCollectionApproved(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.CollectionService.getCollectionApproved({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('collection-rejected')
  async getCollectionRejected(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.CollectionService.getCollectionRejected({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post(':leadId/create-collection-follow-up')
  async createCollectionFollowUp(
    @Body() body: any,
    @Param('leadId') leadId: string,
  ) {
    return await this.CollectionService.createCollectionFollowUp(body, leadId);
  }

  @UseGuards(AuthGuard)
  @Get(':leadId/collection-follow-ups')
  async getCollectionFollowUps(@Param('leadId') leadId: string) {
    return await this.CollectionService.getCollectionFollowUps(leadId);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Get('download-excel-closed')
  async closedExcel(
    @Res() res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.CollectionService.closedExcel(res, {
      fromDate: fromDate || '',
      toDate: toDate || '',
    });
  }

  @UseGuards(AuthGuard)
  @Get('download-excel-partPayment')
  async partPaymentExcel(
    @Res() res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.CollectionService.partPaymentExcel(res, {
      fromDate: fromDate || '',
      toDate: toDate || '',
    });
  }

  @UseGuards(AuthGuard)
  @Get('download-excel-settelment')
  async settelmentPaymentExcel(
    @Res() res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.CollectionService.settelmentPaymentExcel(res, {
      fromDate: fromDate || '',
      toDate: toDate || '',
    });
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post('/bank-transfer-casees')
  async bankTransferCases(@Body() body: any) {
    try {
      return await this.CollectionService.bankTransferCases(body);
    } catch (error) {
      console.log('bankTransferCases Controller Error =>', error);

      throw error;
    }
  }
}
