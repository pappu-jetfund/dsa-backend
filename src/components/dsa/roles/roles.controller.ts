import {
  Body, Controller, Delete, Get, Param, Post, Put, BadRequestException, UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './role.dto';
import { PermissionGuard } from '../../../gaurd/permissions.guard';
import { AuthGuard } from '../../../gaurd/auth.gaurd';
import { dsaModulePermissions } from '../../../utility/enums';

const { Add, Edit, Read } = dsaModulePermissions.Roles;

@Controller('/dsa/roles-permissions')
export class RolesController {
  constructor(private readonly rolesService: RolesService) { }

  @UseGuards(AuthGuard, new PermissionGuard(Add))
  @Post('/create-role')
  async createRole(@Body() body: CreateRoleDto) {
    try {
      return await this.rolesService.createRole(body);
    } catch (error: any) {
      throw new BadRequestException(
        error?.message || 'Failed to create role',
      );
    }
  }

  @UseGuards(AuthGuard, new PermissionGuard(Read))
  @Get('/listing')
  async getRoles() {
    try {
      return await this.rolesService.getRoles();
    } catch (error: any) {
      throw new BadRequestException(
        error?.message || 'Failed to fetch roles',
      );
    }
  }

  @UseGuards(AuthGuard, new PermissionGuard(Read))
  @Get('/detail/:id')
  async getRole(@Param('id') id: string) {
    try {
      return await this.rolesService.getRoleById(Number(id));
    } catch (error: any) {
      throw new BadRequestException(
        error?.message || 'Failed to fetch role detail',
      );
    }
  }

  @UseGuards(AuthGuard, new PermissionGuard(Edit))
  @Put('/update/:id')
  async updateRole(
    @Param('id') id: string,
    @Body() body: UpdateRoleDto,
  ) {
    try {
      return await this.rolesService.updateRole(Number(id), body);
    } catch (error: any) {
      throw new BadRequestException(
        error?.message || 'Failed to update role',
      );
    }
  }

  @UseGuards(AuthGuard, new PermissionGuard(dsaModulePermissions.Roles.Delete))
  @Delete(':id')
  async deleteRole(@Param('id') id: string) {
    try {
      return await this.rolesService.deleteRole(Number(id));
    } catch (error: any) {
      throw new BadRequestException(
        error?.message || 'Failed to delete role',
      );
    }
  }

  @UseGuards(AuthGuard, new PermissionGuard(Read))
  @Get('/permissions/all')
  async getPermissions() {
    try {
      return await this.rolesService.getPermissions();
    } catch (error: any) {
      throw new BadRequestException(
        error?.message || 'Failed to fetch permissions',
      );
    }
  }
}