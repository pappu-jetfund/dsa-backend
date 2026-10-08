import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TenantMiddleware } from './middleware/database.middleware';
import { ClsModule } from 'nestjs-cls';
import { TenantModule } from './tenant/tenant.module';
import { VendorsModule } from './components/dsa/vendors/vendors.module';
import { DsaAuthModule } from './components/dsa/auth/auth.module';
import { CampaignsModule } from './components/dsa/campaign/campaigns.module';
import { APP_GUARD } from '@nestjs/core';
import { CustomThrottlerGuard } from './gaurd/custom-throttler.guard';
import { DsaReportsModule } from './components/dsa/reports/reports.module';
import { RolesModule } from './components/dsa/roles/roles.module';
import { MonitoringModule } from './components/monitoring/monitoring.module';
import { MetricsMiddleware } from './components/monitoring/metrics.middleware';
import { FailureLoggerMiddleware } from './middleware/failure-logger.middleware';
import { FailureLogService } from './components/logs-api/failure-log.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env.development', '.env'],
    }),

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

    TenantModule,
    PrismaModule,
    VendorsModule,
    DsaAuthModule,
    DsaReportsModule,
    CampaignsModule,
    RolesModule,
    MonitoringModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    FailureLogService,
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
        { path: 'health', method: RequestMethod.ALL },
      )
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }

}
