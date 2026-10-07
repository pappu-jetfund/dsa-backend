import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccountService } from './account.service';
import { AuthGuard } from '../../gaurd/auth.gaurd';
import { MethodPermissionGuard } from '../../gaurd/read.gaurd';

@Controller('accountAggregator')
export class AccountController {
  constructor(private AccountService: AccountService) {}

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post(':leadId/fetch-account-balance')
  async fetchBankBalance(@Param('leadId') leadId: string, @Body() body: any) {
    return await this.AccountService.fetchBankBalance(leadId, body);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Get(':leadId/balance-history')
  async getBalanceHistory(@Param('leadId') leadId: string) {
    return await this.AccountService.getBalanceHistory(leadId);
  }

  @UseGuards(AuthGuard)
  @Get(':leadId/create-consent')
  async getRedirectUrl(@Param('leadId') leadId: string, @Req() req) {
    return await this.AccountService.redirectToFinduit(leadId, req);
  }
}
