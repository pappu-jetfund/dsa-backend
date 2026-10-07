import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  classifyHttpStatus,
  defaultHttpReason,
} from '../../common/http-status.util';

export interface ApiFailureEntry {
  timestamp: string;
  method: string;
  endpoint: string;
  tenant: string;
  statusCode: number;
  reason?: string;
  durationMs: number;
}

@Injectable()
export class FailureLogService {
  private readonly logger = new Logger(FailureLogService.name);
  private readonly logDir = path.join(process.cwd(), 'logs');

  async write(entry: ApiFailureEntry): Promise<void> {
    const outcome = classifyHttpStatus(entry.statusCode);
    const logType = outcome === 'success' ? 'access' : 'error';
    const file = path.join(this.logDir, `${logType}.log`);
    const record = {
      ...entry,
      outcome,
      reason: this.cleanReason(
        entry.reason || defaultHttpReason(entry.statusCode),
      ),
    };

    try {
      await fs.mkdir(this.logDir, { recursive: true });
      await fs.appendFile(file, `${JSON.stringify(record)}\n`, 'utf8');
    } catch (error) {
      this.logger.error(
        'Unable to write API failure log',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private cleanReason(reason: string): string {
    return reason
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, 1000);
  }
}
