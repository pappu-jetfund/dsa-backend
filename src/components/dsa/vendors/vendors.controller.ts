import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Query } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { CreateVendorDto, UpdateVendorDto } from './vendor.dto';
import { AuthGuard } from '../../../gaurd/auth.gaurd';
import { MethodPermissionGuard } from '../../../gaurd/read.gaurd';
import { PermissionGuard } from '../../../gaurd/permissions.guard';
import { dsaModulePermissions } from '../../../utility/enums';

@Controller('/dsa/vendors')
export class VendorsController {
  constructor(private readonly service: VendorsService) { }

  @UseGuards(AuthGuard, MethodPermissionGuard, new PermissionGuard(dsaModulePermissions.Vendors.Add))
  @Post()
  async create(@Body() dto: CreateVendorDto) {
    return await this.service.createVendor(dto);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard, new PermissionGuard([dsaModulePermissions.Vendors.Read, dsaModulePermissions.Campaign.Parent_add]))
  @Get()
  async findAll(
    @Query() query: any,
  ) {
    return await this.service.findAll(query);
  }

  @UseGuards(AuthGuard)
  @Get('/me')
  async ownInfo(@Req() req: any) {
    return await this.service.ownDetail(req.user.id);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard, new PermissionGuard(dsaModulePermissions.Vendors.Read))
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.service.findOne(+id);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard, new PermissionGuard(dsaModulePermissions.Vendors.Edit))
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateVendorDto) {
    return await this.service.update(+id, dto);
  }
}