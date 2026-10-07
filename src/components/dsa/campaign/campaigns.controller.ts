import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, UpdateCampaignDto } from './campaign.dto';
import { AuthGuard } from '../../../gaurd/auth.gaurd';
import { MethodPermissionGuard } from '../../../gaurd/read.gaurd';
import { ClsService } from 'nestjs-cls';
import { PermissionGuard } from '../../../gaurd/permissions.guard';
import { dsaModulePermissions } from '../../../utility/enums';

@Controller('/dsa/campaigns')
export class CampaignsController {
  constructor(
    private readonly service: CampaignsService,
    private readonly clsService: ClsService,
  ) { }

  @UseGuards(AuthGuard, MethodPermissionGuard, new PermissionGuard(dsaModulePermissions.Campaign.Add))
  @Post()
  async create(@Body() dto: CreateCampaignDto) {
    return await this.service.create(dto);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard, new PermissionGuard(dsaModulePermissions.Campaign.Read))
  @Get()
  async findAll(@Query() query: any) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search || undefined;
    return await this.service.findAll(page, limit, search);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard, new PermissionGuard(dsaModulePermissions.Campaign.Read))
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.service.findOne(+id);
  }
}