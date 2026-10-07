import { Module } from '@nestjs/common';
import { DsaCustomerController } from './customer.controller';
import { DsaCustomerService } from './customer.service';
import { TenantPrismaService } from '../../../prisma/tenet-prisma.service';

@Module({
  controllers: [DsaCustomerController],
  providers: [DsaCustomerService, TenantPrismaService],
})
export class DsaCustomerModule {}
