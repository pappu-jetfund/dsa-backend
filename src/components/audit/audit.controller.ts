import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { AuthGuard } from "../../gaurd/auth.gaurd";
import { MethodPermissionGuard } from "../../gaurd/read.gaurd";

@Controller('audit')
export class AuditController {
    constructor(
        private readonly auditService: AuditService,
    ) { }

    @UseGuards(AuthGuard, MethodPermissionGuard)
    @Get('leads')
    async getAuditLeads(
        @Req() req: Request,
        @Query('page') page = 1,
        @Query('limit') limit = 10,
        @Query('search') search?: string,

        @Query('fbleads') fbleads?: string,
        @Query('allSource') allSource?: string,
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,
    ) {
        return this.auditService.getAuditLeads({
            page: Number(page),
            limit: Number(limit),
            search,
            filters: {
                fbleads,
                allSource,
                fromDate,
                toDate,
            },
            req,
        });
    };

    @UseGuards(AuthGuard, MethodPermissionGuard)
    @Patch(':leadID')
    async markLeadAsAudit(
        @Param('leadID', ParseIntPipe) leadID: number,
        @Req() req: Request,
    ) {
        return this.auditService.markLeadAsAudit(leadID, req,);
    };
}