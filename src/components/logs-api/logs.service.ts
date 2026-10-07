import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LogsService {
  private logDir = path.join(process.cwd(), 'logs');

  getLogsByDate(date?: string) {
    const logDate = date || new Date().toISOString().split('T')[0];
    const filePath = path.join(this.logDir, `api-${logDate}.json`);

    if (!fs.existsSync(filePath)) {
      return { message: `No logs for ${logDate}` };
    }

    const logs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return { date: logDate, logs };
  }
}
