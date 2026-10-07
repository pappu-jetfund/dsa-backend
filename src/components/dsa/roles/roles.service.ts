import { BadRequestException, Injectable, NotFoundException, InternalServerErrorException, } from '@nestjs/common';
import { CreateRoleDto, UpdateRoleDto } from './role.dto';
import { TenantPrismaService } from '../../../prisma/tenet-prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) { }

  async createRole(body: CreateRoleDto) {
    try {
      const exists = await this.tenantPrisma.client.dsa_roles.findUnique({
        where: { name: body.name },
      });

      if (exists) {
        throw new BadRequestException('Role already exists');
      }

      return await this.tenantPrisma.client.dsa_roles.create({
        data: {
          name: body.name,
          description: body.description,
          permissionIds: body.permissionIds || [],
        },
      });
    } catch (error: any) {
      throw new InternalServerErrorException(
        error.message || 'Failed to create role',
      );
    }
  }

  async getRoles() {
    try {
      const roles = await this.tenantPrisma.client.dsa_roles.findMany({
        where: {
          NOT: {
            name: 'Super Admin',
          }
        },
        orderBy: { createdAt: 'desc' },
      });

      return roles;
    } catch (error: any) {
      throw new InternalServerErrorException(
        error.message || 'Failed to fetch roles',
      );
    }
  }

  async getRoleById(id: number) {
    try {
      const role = await this.tenantPrisma.client.dsa_roles.findUnique({
        where: { id },
      });

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      const permissionIds = Array.isArray(role.permissionIds)
        ? role.permissionIds.map(Number)
        : [];

      const permissions =
        await this.tenantPrisma.client.dsa_permissions.findMany({
          where: {
            id: { in: permissionIds },
          },
        });

      return {
        ...role,
        permissions,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;

      throw new InternalServerErrorException(
        error.message || 'Failed to fetch role',
      );
    }
  }

  async updateRole(id: number, body: UpdateRoleDto) {
    try {
      const role = await this.tenantPrisma.client.dsa_roles.findUnique({
        where: { id },
      });

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      return await this.tenantPrisma.client.dsa_roles.update({
        where: { id },
        data: {
          ...body,
        },
      });
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;

      throw new InternalServerErrorException(
        error.message || 'Failed to update role',
      );
    }
  }

  async deleteRole(id: number) {
    try {
      const role = await this.tenantPrisma.client.dsa_roles.findUnique({
        where: { id },
      });

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      return await this.tenantPrisma.client.dsa_roles.delete({
        where: { id },
      });
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;

      throw new InternalServerErrorException(
        error.message || 'Failed to delete role',
      );
    }
  }

  async getPermissions() {
    try {
      const permissions =
        await this.tenantPrisma.client.dsa_permissions.findMany({
          orderBy: { module: 'asc' },
        });

      const grouped = permissions.reduce((acc, perm) => {
        if (!acc[perm.module]) {
          acc[perm.module] = [];
        }
        acc[perm.module].push(perm);
        return acc;
      }, {} as Record<string, any[]>);

      return grouped;
    } catch (error: any) {
      throw new InternalServerErrorException(
        error.message || 'Failed to fetch permissions',
      );
    }
  }
}