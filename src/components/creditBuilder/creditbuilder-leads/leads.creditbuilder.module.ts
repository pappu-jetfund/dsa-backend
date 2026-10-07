import { Module } from '@nestjs/common';
import { CacheModule } from '../../cache/cache.module';
import { CreditImproveLeadController } from './leads.creditbuilder.controller';
import { CreditBuilderLeadsService } from './leads.creditbuilder.services';
import { ClsModule } from 'nestjs-cls';
import { PrismaModule } from '../../../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
// import { CreditImproveController } from './credit-improve.controller';
// import { CreditImproveService } from './credit-improve.service';

// import { CacheModule } from 'src/cache/cache.module';

@Module({
  imports: [CacheModule,ClsModule,PrismaModule,ConfigModule],
  controllers: [CreditImproveLeadController],
  providers: [CreditBuilderLeadsService],
  exports: [CreditBuilderLeadsService],
})
export class CreditImpvoreLeadsModule {}
