import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const path = req.originalUrl.split('?')[0];
    if (path === '/metrics' || path.startsWith('/profiling')) return next();

    const method = req.method;
    const tenant = this.metrics.normalizeTenant(
      req.headers['x-tenant-domain'] ?? req.headers.host,
    );
    const started = process.hrtime.bigint();
    this.metrics.requestStarted(method, tenant);

    res.once('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - started) / 1e9;
      const route = this.routeTemplate(req);
      const contentLength = Number(res.getHeader('content-length') ?? 0);
      this.metrics.requestFinished(
        method,
        route,
        tenant,
        res.statusCode,
        durationSeconds,
        Number.isFinite(contentLength) ? contentLength : 0,
      );
    });

    next();
  }

  private routeTemplate(req: Request): string {
    const routePath = (req.route as { path?: string } | undefined)?.path;
    if (routePath) {
      const mountPath = req.baseUrl === '/' ? '' : req.baseUrl;
      return `${mountPath}${routePath}`.replace(/\/+/g, '/') || '/';
    }

    // Unmatched requests are grouped to prevent IDs and query values from
    // creating an unbounded number of Prometheus label values.
    return 'unmatched';
  }
}
