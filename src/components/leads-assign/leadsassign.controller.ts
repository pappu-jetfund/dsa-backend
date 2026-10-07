import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { LeadsAssignService } from "./leadsassign.service";
import { AuthGuard } from "../../gaurd/auth.gaurd";
import { MethodPermissionGuard } from "../../gaurd/read.gaurd";

@Controller('leadsAssign')
export class LeadsAssignController {
    constructor(
        private LeadsAssignService: LeadsAssignService,

    ) { }

    @UseGuards(AuthGuard, MethodPermissionGuard)
    @Get('userList-byrole')
    async getUsernameByRole(
        @Query('role') role: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('search') search?: string,
    ) {
        return await this.LeadsAssignService.getUsernameByRole(role, {
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
            search
        });
    }

    @UseGuards(AuthGuard, MethodPermissionGuard)
    @Post('/collection-case-transfer/:assignTo')
    async collectioncaseTransfer(
        @Param('assignTo') assignTo: string,
        @Body() body: { leadIds: string[] },
    ) {
        const { leadIds } = body;
        return await this.LeadsAssignService.collectioncaseTransfer(
            leadIds,
            assignTo,
        );
    }

    @UseGuards(AuthGuard, MethodPermissionGuard)
    @Get('assigned-leads/:memberId')
    async getUserAssignedLeads(
        @Param('memberId') memberId: string,
        @Query('role') role: string,
        @Query('page') page: string,
        @Query('limit') limit: string,
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,

    ) {
        return await this.LeadsAssignService.getUserAssinedLeads(Number(memberId), {
            role,
            page: Number(page) || 1,
            limit: Number(limit) || 10,
            filters: { fromDate, toDate }
        });
    }


    @UseGuards(AuthGuard, MethodPermissionGuard)
    @Post('/sanction-case-transfer/:assignTo')
    async sanctioncaseTransfer(
        @Param('assignTo') assignTo: string,
        @Body() body: { leadIds: string[] },
    ) {
        const { leadIds } = body;
        return await this.LeadsAssignService.sanctioncaseTransfer(
            leadIds,
            assignTo,
        );
    }

    @UseGuards(AuthGuard, MethodPermissionGuard)
    @Post('/calling-case-transfer/:assignTo')
    async callingcaseTransfer(
        @Param('assignTo') assignTo: string,
        @Body() body: { leadIds: string[] },
    ) {
        const { leadIds } = body;
        return await this.LeadsAssignService.callingcaseTransfer(
            leadIds,
            assignTo,
        );
    }
}