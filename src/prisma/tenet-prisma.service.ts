import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaClient } from '@prisma/client';

@Injectable({ scope: Scope.REQUEST })
export class TenantPrismaService {
  constructor(@Inject(REQUEST) private readonly request: Request) { }

  // Lazy getter
  get client(): PrismaClient {
    if (!this.request.prisma) {
      throw new Error('Prisma client not initialized on request');
    }
    return this.request.prisma;
  }
}
