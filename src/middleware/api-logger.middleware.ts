import { Injectable, NestMiddleware } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

interface ApiStats {
  callCount: number;
  successCount: number;
  errorCount: number;
  totalTime: number;
  maxTime: number;
  averageTime: number;
  concurrentRequests: number;
  maxConcurrent: number;
}

@Injectable()
export class ApiLoggerMiddleware implements NestMiddleware {
  private logDir = path.join(process.cwd(), 'logs');
  private apiMetrics: Record<string, ApiStats> = {};

  use(req: any, res: any, next: () => void) {
    const start = Date.now();

    let cleanedUrl = req.originalUrl.replace(/^\/api\/v\d+\//, '/');
    if (cleanedUrl === '' || cleanedUrl === undefined) cleanedUrl = '/';

    const endpoint = `${req.method} ${cleanedUrl}`;

    const today = new Date().toISOString().split('T')[0];
    const logFilePath = path.join(this.logDir, `api-${today}.json`);

    if (!this.apiMetrics[endpoint]) {
      this.apiMetrics[endpoint] = {
        callCount: 0,
        successCount: 0,
        errorCount: 0,
        totalTime: 0,
        maxTime: 0,
        averageTime: 0,
        concurrentRequests: 0,
        maxConcurrent: 0,
      };
    }

    this.apiMetrics[endpoint].concurrentRequests++;
    this.apiMetrics[endpoint].maxConcurrent = Math.max(
      this.apiMetrics[endpoint].maxConcurrent,
      this.apiMetrics[endpoint].concurrentRequests,
    );

    res.on('finish', () => {
      const duration = Date.now() - start;
      const stats = this.apiMetrics[endpoint];

      stats.callCount++;
      stats.totalTime += duration;
      stats.maxTime = Math.max(stats.maxTime, duration);
      stats.averageTime = Math.round(stats.totalTime / stats.callCount);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        stats.successCount++;
      } else {
        stats.errorCount++;
      }

      stats.concurrentRequests--;

      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      fs.writeFileSync(logFilePath, JSON.stringify(this.apiMetrics, null, 2));
    });

    next();
  }
}
