import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DsaCustomerService } from './customer.service';
import { AuthGuard } from '../../../gaurd/auth.gaurd';
import { MethodPermissionGuard } from '../../../gaurd/read.gaurd';
import { GetDsaCustomersDto } from './customer.dto';
import { PermissionGuard } from '../../../gaurd/permissions.guard';
import { dsaModulePermissions } from '../../../utility/enums';

@Controller('/dsa/customers')
export class DsaCustomerController {
  constructor(private readonly service: DsaCustomerService) {}

  @UseGuards(AuthGuard, MethodPermissionGuard, new PermissionGuard(dsaModulePermissions.Customers.Read))
  @Get()
  async list(@Query() query: GetDsaCustomersDto) {
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const search = query.search || undefined;
      return await this.service.listCustomers(page, limit, search);
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Failed to fetch customers');
    }
  }
}
