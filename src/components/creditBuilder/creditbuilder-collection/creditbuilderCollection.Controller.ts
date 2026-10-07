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
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
// import { CollectionService } from './collection.service';

import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import type { Express, Response } from 'express';
import { AuthGuard } from '../../../gaurd/auth.gaurd';
import { MethodPermissionGuard } from '../../../gaurd/read.gaurd';
import { CreditBuilderCollectionService } from './creditbuilderCollection.Serivce';
import { CreditBuilderGuard } from '../../../gaurd/creditBuilder.gaurd';
// import { AuthGuard } from '../../gaurd/auth.gaurd';
// import { MethodPermissionGuard } from '../../gaurd/read.gaurd';

@Controller('credit-improve-collection')
@UseGuards(CreditBuilderGuard)
export class CreditBuilderCollectionController {
  constructor(
    private CreditBuilderCollectionService: CreditBuilderCollectionService,
  ) {}

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Get('payment-pending')
  async getPaymentPendingCollections(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.CreditBuilderCollectionService.getPaymentPendingCollections(
      {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        search: search || '',
        filters: { fromDate, toDate },
      },
    );
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
    return await this.CreditBuilderCollectionService.getClosedCollections({
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
    return await this.CreditBuilderCollectionService.createCollection(
      body,
      files,
      leadId,
      req,
    );
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Patch(':collectionId/update-collectionEntry')
  @UseInterceptors(FileInterceptor('file'))
  async updateCollection(
    @Body() body: any,
    @Param('collectionId') collectionId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return await this.CreditBuilderCollectionService.updateCollection(
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
    return await this.CreditBuilderCollectionService.updateCollectionStatus(
      collectionId,
      body,
      req,
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
    return await this.CreditBuilderCollectionService.getCollectionApprovalPending(
      {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        search: search || '',
        filters: { fromDate, toDate },
      },
    );
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
    return await this.CreditBuilderCollectionService.getCollectionApproved({
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
    return await this.CreditBuilderCollectionService.getCollectionRejected({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }
}
