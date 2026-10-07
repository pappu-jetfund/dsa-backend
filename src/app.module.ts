import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './components/auth/auth.module';
import { TenantMiddleware } from './middleware/database.middleware';
import { LeadsModule } from './components/leads/leads.module';
import { ClsModule } from 'nestjs-cls';
import { CustomerModule } from './components/customer/customer.module';
import { ApprovalModule } from './components/approval/approval.module';
import { SmsModule } from './components/sms/sms.module';
import { CreditModule } from './components/credit/credit.module';
import { DisbursalModule } from './components/disbursal/disbursal.module';
import { ScheduleModule } from '@nestjs/schedule';
import { LogsModule } from './components/logs-api/logs.module';
import { QueryModule } from './components/queryLog/query.module';
import { CollectionModule } from './components/collection/collection.module';
import { MailModule } from './components/mail/mail.module';
import { FileModule } from './components/fileUploads/file.module';
import { DocumentsModule } from './components/documents/documents.module';
import { ReportsModule } from './components/reports/reports.module';
import { CibilModule } from './components/cibil/cibil.module';
import { ESignModule } from './components/e-sign/eSign.module';
import { DashboardModule } from './components/dashboard/dashboard.module';
import { DedupeModule } from './components/dedupe/dedupe.module';
import { AccountModule } from './components/accountAggregator/account.module';
import { CollectionFollowUpModule } from './components/collectionfollowUp/followup.module';
import { GoogleModule } from './components/googleApi/google.module';
import { EmandateChargeModule } from './components/emandateCharge/emandate.module';
import { VerificationModule } from './components/verificationsApi/verification.module';
import { PayoutModule } from './components/payout/payout.module';
import { BullBoardSetupModule } from './components/bullboard/bull-board.module';
import { TenantModule } from './tenant/tenant.module';
import { RoleFilterModule } from './components/role-filter/role-filter.module';
import { LeadsAssignModule } from './components/leads-assign/leadsassign.module';
import { BucketModule } from './components/bucket/bucket.module';
import { VendorsModule } from './components/dsa/vendors/vendors.module';
import { DsaCustomerModule } from './components/dsa/customer/customer.module';
import { DsaAuthModule } from './components/dsa/auth/auth.module';
import { CampaignsModule } from './components/dsa/campaign/campaigns.module';
import { APP_GUARD } from '@nestjs/core';
import { CustomThrottlerGuard } from './gaurd/custom-throttler.guard';
import { DsaReportsModule } from './components/dsa/reports/reports.module';
import { RolesModule } from './components/dsa/roles/roles.module';
import { PaymentDatesModule } from './components/paymentDates/payment-dates.module';
import { CacheModule } from './components/cache/cache.module';
import { CacheHealthModule } from './components/cacheHealth/cache-health.module';
import { BullModule } from '@nestjs/bullmq';
import { DisbursalCreditImprovedModule } from './components/creditBuilder/disbursal/disbursal.creditbuilder.module';
import { CreditBuilderLeadsService } from './components/creditBuilder/creditbuilder-leads/leads.creditbuilder.services';
import { CreditImpvoreLeadsModule } from './components/creditBuilder/creditbuilder-leads/leads.creditbuilder.module';
import { CreditBuilderCollectionModule } from './components/creditBuilder/creditbuilder-collection/creditbuilderCollection.Module';
import { DhwaniModule } from './components/dhwani/dhwani.module';
import { AuditModule } from './components/audit/audit.module';
import { GlobalModule } from './common/globalFunctions/global.module';
import { MonitoringModule } from './components/monitoring/monitoring.module';
import { MetricsMiddleware } from './components/monitoring/metrics.middleware';
import { FailureLoggerMiddleware } from './middleware/failure-logger.middleware';
import { loanModule } from './components/loan/loan.module';
// import { DisbursalCreditImprovedModule } from './components/creditBuilder/disbursal.creditbuilder.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env.development', '.env'],
    }),
    ScheduleModule.forRoot(),

    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const enabled = config.get<string>('RATE_LIMIT_ENABLED') === 'true';
        const ttl = (config.get<number>('RATE_LIMIT_TTL') || 60) * 1000;
        const limit = config.get<number>('RATE_LIMIT_LIMIT') || 5;

        if (!enabled) {
          return {
            throttlers: [],
          };
        }

        return {
          throttlers: [{ ttl, limit }],
        };
      },
    }),

    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD || undefined,
        db: Number(process.env.REDIS_DB ?? 0),
      },
    }),
    TenantModule,
    PrismaModule,
    GlobalModule,
    AuthModule,
    LeadsModule,
    CustomerModule,
    ApprovalModule,
    SmsModule,
    CreditModule,
    DisbursalModule,
    LogsModule,
    QueryModule,
    CollectionModule,
    MailModule,
    FileModule,
    DocumentsModule,
    ReportsModule,
    CibilModule,
    ESignModule,
    DashboardModule,
    DedupeModule,
    AccountModule,
    CollectionFollowUpModule,
    GoogleModule,
    EmandateChargeModule,
    VerificationModule,
    PayoutModule,
    BullBoardSetupModule,
    RoleFilterModule,
    LeadsAssignModule,
    BucketModule,
    VendorsModule,
    DsaAuthModule,
    DsaReportsModule,
    CampaignsModule,
    DsaCustomerModule,
    RolesModule,
    PaymentDatesModule,
    CacheModule,
    CacheHealthModule,
    DisbursalCreditImprovedModule,
    CreditImpvoreLeadsModule,
    CreditBuilderCollectionModule,
    DhwaniModule,
    AuditModule,
    MonitoringModule,
    loanModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MetricsMiddleware).forRoutes({
      path: '*path',
      method: RequestMethod.ALL,
    });
    consumer
      .apply(FailureLoggerMiddleware, TenantMiddleware)
      .exclude(
        { path: 'metrics', method: RequestMethod.ALL },
        { path: 'profiling', method: RequestMethod.ALL },
        { path: 'profiling/data', method: RequestMethod.ALL },
      )
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }

}
