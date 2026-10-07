import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { TenantPrismaService } from '../../../prisma/tenet-prisma.service';

@Module({
  controllers: [RolesController],
  providers: [RolesService, TenantPrismaService],
})
export class RolesModule {}