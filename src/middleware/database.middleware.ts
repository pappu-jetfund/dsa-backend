import { Injectable, NestMiddleware } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantResolverService } from '../tenant/tenant-resolver.service';
import { MetricsService } from '../components/monitoring/metrics.service';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantResolver: TenantResolverService,
    private readonly metrics: MetricsService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    try {
      const domainHeader = req.headers['x-tenant-domain'] ?? req.headers.host;
      const rawDomain = Array.isArray(domainHeader)
        ? domainHeader[0]
        : domainHeader;

      if (!rawDomain) throw new Error('Tenant domain is required');

      const tenant = this.metrics.normalizeTenant(rawDomain);
      const dbUrl = this.tenantResolver.getDbUrl(rawDomain);

      req.prisma = PrismaService.getClient(dbUrl, (event) =>
        this.metrics.recordPrismaQuery(tenant, event),
      );

      next();
    } catch (err: unknown) {
      return res.status(400).json({
        statusCode: 400,
        status: 'Error',
        message: err instanceof Error ? err.message : 'Invalid tenant domain',
      });
    }
  }
}
