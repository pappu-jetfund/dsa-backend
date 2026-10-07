import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { QueryService } from './query.service';
import { AuthGuard } from '../../gaurd/auth.gaurd';

@Controller('query')
export class QueryController {
  constructor(private QueryService: QueryService) { }

  @UseGuards(AuthGuard)
  @Get('query-logs')
  async getAllData(
    @Req() req: Request,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    return await this.QueryService.getAllData({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search || '',
      filters: { fromDate, toDate },
      req,
    });
  }
}
