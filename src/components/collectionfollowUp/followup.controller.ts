import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CollectionFollowUpService } from './followup.service';
import { AuthGuard } from '../../gaurd/auth.gaurd';


@Controller('followup')
export class CollectionFOllowUpController {
  constructor(private CollectionFollowUpService: CollectionFollowUpService) { }

  @UseGuards(AuthGuard)
  @Get('ptp-call-pending')
  async ptpCallPending(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search?: string,
  ) {
    return await this.CollectionFollowUpService.ptpCallPending({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
    });
  }

  @UseGuards(AuthGuard)
  @Get('pre-ptp-call-pending')
  async preptpCallPending(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.CollectionFollowUpService.preptpCallPending({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('fi-pending')
  async fipendingPending(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.CollectionFollowUpService.fipendingPending({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('pre-fi-pending')
  async prefipendingPending(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.CollectionFollowUpService.prefipendingPending({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('call-pending')
  async callPending(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.CollectionFollowUpService.callPending({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('fi-done-pending')
  async fidonePending(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.CollectionFollowUpService.fidonePending({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('ptp-call-done')
  async ptpcallDone(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.CollectionFollowUpService.ptpcallDone({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }

  @UseGuards(AuthGuard)
  @Get('call-done')
  async callDone(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return await this.CollectionFollowUpService.callDone({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
    });
  }
}
