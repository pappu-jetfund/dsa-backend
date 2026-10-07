import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { AuthGuard } from '../../gaurd/auth.gaurd';

@Controller('dashboard')
export class DashboardController {
  constructor(private DashboardService: DashboardService) { }

  @UseGuards(AuthGuard)
  @Get('dashboard-overview')
  async dashboardOverview(
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('tabs') tabs?: string,
    @Query('collectionView') collectionView?: string,
    @Query('disbursalView') disbursalView?: string,
    @Query('query') query?: string,
  ) {
    return await this.DashboardService.dashboardOverview(
      period,
      startDate,
      endDate,
      tabs,
      collectionView,
      disbursalView,
      query,
    );
  }


  // @Get('dashboard-role-wise')
  // async dashboardRoleWise(

  // )
}
