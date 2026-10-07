import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export interface PrismaQueryMetric {
  query: string;
  duration: number;
  target: string;
}

@Injectable()
export class PrismaService {
  private static clients = new Map<string, PrismaClient>();

  static getClient(
    databaseUrl: string,
    onQuery?: (event: PrismaQueryMetric) => void,
  ): PrismaClient {
    if (!this.clients.has(databaseUrl)) {
      const client = new PrismaClient({
        datasources: {
          db: { url: databaseUrl },
        },
        log: [{ emit: 'event', level: 'query' }],
      });

      if (onQuery) client.$on('query', onQuery);

      this.clients.set(databaseUrl, client);
    }

    return this.clients.get(databaseUrl)!;
  }
}
