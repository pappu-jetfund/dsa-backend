import { Controller, Get, Post, Query, Body, UseGuards, BadRequestException, HttpException, HttpStatus, Res, Req } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { AuthGuard } from '../../../gaurd/auth.gaurd';
import { MethodPermissionGuard } from '../../../gaurd/read.gaurd';
import { GetVendorReportsDto, } from './reports.dto';
import type { Response } from 'express';

@Controller('/dsa/reports')
export class ReportsController {
    constructor(
        private readonly service: ReportsService,
    ) { }

    @UseGuards(AuthGuard, MethodPermissionGuard)
    @Get('vendor-report')
    async getVendorReport(@Query() query: GetVendorReportsDto) {
        try {
            return await this.service.getVendorReport(query);
        } catch (error: any) {
            throw new BadRequestException(error?.message || 'Failed to fetch vendor report');
        }
    }

    @UseGuards(AuthGuard, MethodPermissionGuard)
    @Get('vendor-report-customers')
    async getVendorCustomerReport(@Req() req: Request, @Query() query: GetVendorReportsDto) {
        try {
            return await this.service.getVendorCustomerReport(req, query);
        } catch (error: any) {
            throw new BadRequestException(error?.message || 'Failed to fetch vendor customer report');
        }
    }

    @UseGuards(AuthGuard, MethodPermissionGuard)
    @Get('utm-sources')
    async getUtmSources(@Query('filter') filter?: string) {
        try {
            const data = await this.service.getAllUtmSources(filter);

            return {
                statusCode: 200,
                message: 'UTM sources fetched successfully',
                data,
            };
        } catch (error: any) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                    message: error?.message || 'Failed to fetch UTM sources',
                },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @UseGuards(AuthGuard, MethodPermissionGuard)
    @Get('vendor-report-summary')
    async getVendorReportSummary(@Query() payload: any) {
        try {
            return await this.service.getVendorReportSummary(payload);
        } catch (error: any) {
            throw new BadRequestException(error?.message || 'Failed to fetch vendor report summary');
        }
    }

}
