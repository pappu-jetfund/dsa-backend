import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { CreditBuilderLeadsService } from './leads.creditbuilder.services';
import { AuthGuard } from '../../../gaurd/auth.gaurd';
import { CreditBuilderGuard } from '../../../gaurd/creditBuilder.gaurd';
// import { CreditImproveService } from './credit-improve.service';

@Controller('credit-improve')
@UseGuards(CreditBuilderGuard)
export class CreditImproveLeadController {
  constructor(
    private readonly creditBuilderLeadsService: CreditBuilderLeadsService,
  ) {}

  @UseGuards(AuthGuard)
  @Get('profile/:leadID')
  async getProfile(@Param('leadID', ParseIntPipe) leadID: number) {
    return await this.creditBuilderLeadsService.getCreditBuilderProfile(leadID);
  }
}
