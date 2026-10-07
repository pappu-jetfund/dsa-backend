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
  Res,
  UseGuards,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { AuthGuard } from '../../gaurd/auth.gaurd';
import { MethodPermissionGuard } from '../../gaurd/read.gaurd';
import type { Response } from 'express';
import { CronService } from './cronJobs.service';

@Controller('leads')
export class LeadsController {
  constructor(
    private leadService: LeadsService,
    private cronService: CronService,
  ) { }

  ///all Leads
  @UseGuards(AuthGuard)
  @Get('all-leads')
  async getAllLeads(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fbleads') fbleads?: string,
    @Query('allSource') allSource?: string,
    @Query('status') status?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
    @Query('creditUserId') creditUserId?: any,
  ) {
    return await this.leadService.getAllLeads({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fbleads, allSource, fromDate, toDate, status, creditUserId },
    });
  }

  //Fresh_Leads APi
  @UseGuards(AuthGuard)
  @Get('fresh-leads')
  async getFreshLeads(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fbleads') fbleads?: string,
    @Query('allSource') allSource?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.leadService.getFreshLeads({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fbleads, allSource, fromDate, toDate },
    });
  }

  //Call-back AP-leads api
  @UseGuards(AuthGuard)
  @Get('Call-back-leads')
  async getCallBackLeads(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fbleads') fbleads?: string,
    @Query('allSource') allSource?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.leadService.getCallBackLeads({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fbleads, allSource, fromDate, toDate },
    });
  }

  /// not-interested leads
  @UseGuards(AuthGuard)
  @Get('not-interested-leads')
  async getNotInterestedLeads(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fbleads') fbleads?: string,
    @Query('allSource') allSource?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.leadService.getNotInterestedLeads({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fbleads, allSource, fromDate, toDate },
    });
  }

  ///intrested leads
  @UseGuards(AuthGuard)
  @Get('interested-leads')
  async getInterestedLeads(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fbleads') fbleads?: string,
    @Query('allSource') allSource?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.leadService.getInterestedLeads({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fbleads, allSource, fromDate, toDate },
    });
  }

  //Documents-Received api
  @UseGuards(AuthGuard)
  @Get('documents-received-leads')
  async getDocumentsReceivedLeads(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fbleads') fbleads?: string,
    @Query('allSource') allSource?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.leadService.getDocumentsReceivedLeads({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fbleads, allSource, fromDate, toDate },
    });
  }

  //Blacklisted leads
  @UseGuards(AuthGuard)
  @Get('blacklisted-leads')
  async getBlacklistedLeads(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fbleads') fbleads?: string,
    @Query('allSource') allSource?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.leadService.getBlacklistedLeads({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fbleads, allSource, fromDate, toDate },
    });
  }

  //Rejected leads
  @UseGuards(AuthGuard)
  @Get('rejected-leads')
  async getRejectedLeads(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search?: string,
    @Query('fbleads') fbleads?: string,
    @Query('allSource') allSource?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.leadService.getRejectedLeads({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fbleads, allSource, fromDate, toDate },
    });
  }

  // IncompleteDocuments leads
  @UseGuards(AuthGuard)
  @Get('incomplete-documents-leads')
  async getIncompleteDocumentsLeads(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fbleads') fbleads?: string,
    @Query('allSource') allSource?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.leadService.getIncompleteDocumentsLeads({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fbleads, allSource, fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get(':id/get-one-lead-detailsById')
  async getLeadDetailByID(
    @Headers('authorization') authHeader: string,
    @Param('id') id: string,
    @Query('type') type: string,
    @Req() req: Request
  ) {
    return await this.leadService.getLeadDetailByID(id, type, authHeader, req);
  }

  @UseGuards(AuthGuard)
  @Get('dashboard/lead-counts')
  async getLeadCounts(@Query('type') type: string) {
    return await this.leadService.getLeadCounts(type);
  }

  @UseGuards(AuthGuard)
  @Post(':id/add-Reference')
  async addReference(@Param('id') id: string, @Body() body: any) {
    return await this.leadService.addReference(id, body);
  }

  @UseGuards(AuthGuard)
  @Get('dashboard/statistics')
  async getStatistics() {
    return await this.leadService.getStatistics();
  }

  @UseGuards(AuthGuard)
  @Get('not-completed_leads')
  async getNotGenratedLeads(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.leadService.getNotGeneratedLeads({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      fromDate,
      toDate,
    });
  }

  /// Global Search Api
  @UseGuards(AuthGuard)
  @Get('search')
  async getGlobalSearch(
    @Query('search') search: string,
    @Query('type') type: 'mobile' | 'leadID' | 'panCard' | 'name' | 'loanNo',
  ) {
    return await this.leadService.getGlobalSearch(search,type);
  }

  @UseGuards(AuthGuard)
  @Get(':leadID/leads-steps')
  async getLeadsStep(@Param('leadID') leadID: string) {
    return await this.leadService.getLeadsStep(leadID);
  }

  @UseGuards(AuthGuard)
  @Get(':leadID/Documents')
  async getLeadsDocuments(@Param('leadID') leadID: string) {
    return await this.leadService.getLeadsDocuments(leadID);
  }

  @UseGuards(AuthGuard)
  @Get(':leadID/kyc-video-details')
  async getKycVideos(@Param('leadID') leadID: string) {
    return await this.leadService.getKycVideos(leadID);
  }

  @UseGuards(AuthGuard)
  @Get('/creditUserList')
  async getCreditTeamUsers() {
    return await this.leadService.getCreditTeamUsers();
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post('/:assignTo/assign/:assignBy')
  async assignLead(
    @Param('assignTo') assignTo: string,
    @Param('assignBy') assignBy: string,
    @Body() body: { leadIds: string[]; customerID: string },
  ) {
    const { leadIds, customerID } = body;

    return await this.leadService.setLeadAssign(
      leadIds,
      assignTo,
      assignBy,
      customerID,
    );
  }

  @UseGuards(AuthGuard)
  @Get(':leadId/emandate-check')
  async checkToken(@Param('leadId') leadId: string,
    @Req() req: Request,) {
    return await this.leadService.getEmandates(leadId, req);
  }

  @UseGuards(AuthGuard)
  @Get(':leadId/get-emandate-payments')
  async getPaymentsByOrderId(@Param('leadId') leadId: string,
    @Req() req: Request,) {
    return await this.leadService.getPaymentsByOrderId(leadId, req);
  }

  @UseGuards(AuthGuard)
  @Post(':leadId/verify-emandate-order')
  async verifyOrderByPaymentId(
    @Param('leadId') leadId: string,
    @Body() body: any,
    @Req() req: Request
  ) {
    return await this.leadService.verifyOrderByPaymentId(leadId, body, req);
  }

  @UseGuards(AuthGuard)
  @Get('bankstatement-analyser/:leadID')
  async getAnalsyer(@Param('leadID') leadID: string) {
    return await this.leadService.getAnalayserYearData(leadID);
  }

  @UseGuards(AuthGuard)
  @Get('notification-list/:leadID')
  async getEmailsNotifictaionList(@Param('leadID') leadID: string) {
    return await this.leadService.getEmailsNotifictaionList(leadID);
  }

  @UseGuards(AuthGuard)
  @Get('mail-data/:notificationID')
  async getEmailsNotifictaion(@Param('notificationID') notificationID: string) {
    return await this.leadService.getEmailsNotifictaion(notificationID);
  }

  @UseGuards(AuthGuard)
  @Get('loan-calculation/:leadID')
  async getLoanCalculation(
    @Param('leadID') leadID: string,
    @Req() req: Request,
  ) {
    return await this.leadService.getLoanCalculation(leadID, req);
  }

  @UseGuards(AuthGuard)
  @Get(':leadID/statement-of-account')
  async getStatementOfAccount(
    @Param('leadID') leadID: string,
    @Req() req: Request,
  ) {
    return await this.leadService.getStatementOfAccount(leadID, req);
  }

  @Get('not-onboarded-customer')
  async getNotOnboarded(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('mobile') mobile?: string,
  ) {
    return await this.leadService.getNotOnboarded({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      fromDate,
      toDate,
      mobile,
    });
  }



  // @UseGuards(AuthGuard)
  @Get('download-excel-not-onboarded')
  async notOnboardedExcel(
    @Res() res: Response,
    @Req() req: Request,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.leadService.notOnboardedExcel(res, { fromDate: fromDate || '', toDate: toDate || '', }, req);
  }

  @UseGuards(AuthGuard)
  @Get('not-loanapply-customer')
  async getNotloanApply(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.leadService.getNotloanApply({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      fromDate,
      toDate,
    });
  }


  @UseGuards(AuthGuard)
  @Get('download-excel-not-loanApply')
  async notLoanapplyExcel(
    @Res() res: Response,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.leadService.notLoanapplyExcel(res, {
      fromDate: fromDate || '',
      toDate: toDate || '',
    });
  }

  // @UseGuards(AuthGuard)
  @Get('approval-follow-up/run')
  async runApprovalFollowUp(
  ) {
    this.cronService.markExpiredApprovalCasesAsNotInterested();
    return true
  }


  // @Patch()
}
