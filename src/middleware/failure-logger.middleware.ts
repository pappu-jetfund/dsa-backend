import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { FailureLogService } from '../components/logs-api/failure-log.service';

type ResponseBody = unknown;

@Injectable()
export class FailureLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger(FailureLoggerMiddleware.name);

  constructor(private readonly failureLog: FailureLogService) { }

  use(req: Request, res: Response, next: NextFunction) {
    const started = process.hrtime.bigint();
    let responseBody: ResponseBody;

    const originalJson = res.json.bind(res) as (body: unknown) => Response;
    const originalSend = res.send.bind(res) as (body?: unknown) => Response;

    // Capture the RAW send from Express — this is the one `res.json`
    // internally calls, and we must NOT re-enter our own wrapper.
    const rawSend = res.send.bind(res);

    res.json = ((body: ResponseBody) => {
      // 🔑 Guard: if headers were already sent (e.g. PDF stream),
      // do not attempt to write again — it would throw ERR_HTTP_HEADERS_SENT.
      if (res.headersSent) {
        this.logger.warn(
          'res.json() skipped — headers already sent',
        );
        return res;
      }

      responseBody = body;

      // Use rawSend directly so our wrapped res.send isn't re-entered.
      return originalJson(body);
    }) as Response['json'];

    res.send = ((body?: ResponseBody) => {
      // 🔑 Same guard for res.send().
      if (res.headersSent) {
        this.logger.warn(
          'res.send() skipped — headers already sent',
        );
        return res;
      }

      if (responseBody === undefined) responseBody = body;
      return originalSend(body);
    }) as Response['send'];

    res.once('finish', () => {
      // Skip logging for binary streams (PDF etc.) — no JSON body to inspect.
      const isBinary = Buffer.isBuffer(responseBody);

      const bodyStatusCode = isBinary
        ? undefined
        : this.extractStatusCode(responseBody);

      const effectiveStatusCode =
        bodyStatusCode && bodyStatusCode >= 400
          ? bodyStatusCode
          : res.statusCode;

      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;

      void this.failureLog.write({
        timestamp: new Date().toISOString(),
        method: req.method,
        endpoint: this.routeTemplate(req),
        tenant: this.tenant(req),
        statusCode: effectiveStatusCode,
        reason: isBinary
          ? undefined
          : this.extractReason(responseBody),
        durationMs: Math.round(durationMs * 100) / 100,
      });
    });

    next();
  }

  private extractReason(body: ResponseBody): string | undefined {
    if (Buffer.isBuffer(body)) return undefined;
    if (typeof body === 'string') {
      try {
        return this.extractReason(JSON.parse(body) as unknown) ?? body;
      } catch {
        return body;
      }
    }
    if (!body || typeof body !== 'object') return undefined;
    const value = body as Record<string, unknown>;
    const reason = value.message ?? value.error ?? value.reason;
    if (Array.isArray(reason)) return reason.map(String).join(', ');
    return typeof reason === 'string' ? reason : undefined;
  }

  private extractStatusCode(body: ResponseBody): number | undefined {
    if (!body || typeof body !== 'object' || Buffer.isBuffer(body)) {
      if (typeof body !== 'string') return undefined;
      try {
        return this.extractStatusCode(JSON.parse(body) as unknown);
      } catch {
        return undefined;
      }
    }
    const statusCode = (body as Record<string, unknown>).statusCode;
    return typeof statusCode === 'number' && Number.isInteger(statusCode)
      ? statusCode
      : undefined;
  }

  private routeTemplate(req: Request): string {
    const route = (req.route as { path?: string } | undefined)?.path;
    return route
      ? `${req.baseUrl === '/' ? '' : req.baseUrl}${route}`.replace(/\/+/g, '/')
      : req.originalUrl.split('?')[0];
  }

  private tenant(req: Request): string {
    const value = req.headers['x-tenant-domain'] ?? req.headers.host;
    const domain = Array.isArray(value) ? value[0] : value;
    return (
      domain?.toLowerCase().replace(/:\d+$/, '').slice(0, 100) ?? 'unknown'
    );
  }
}