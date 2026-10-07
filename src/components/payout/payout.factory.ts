import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

import { RazorpayProvider } from './providers/razorpay.provider';
import { IciciProvider } from './providers/icici.provider';
import { DomainPayoutConfigService } from './config/payout.config';

@Injectable({ scope: Scope.REQUEST })
export class PayoutFactory {
  constructor(
    private domainConfig: DomainPayoutConfigService,
    private razorpay: RazorpayProvider,
    private icici: IciciProvider,

    @Inject(REQUEST) private request: Request,
  ) { }

  async getProvider(domain?: string) {
    let resolvedDomain: any = domain;

    // ✅ fallback to request (only in API)
    if (!resolvedDomain && this.request) {
      resolvedDomain =
        this.request.headers['x-tenant-domain'] ||
        this.request.headers.host;
    }

    if (!resolvedDomain) {
      throw new Error('Domain not found for payout provider');
    }

    console.log(resolvedDomain, 'domain in payout factory');

    const config = await this.domainConfig.getConfigByDomain(resolvedDomain);

    const providerName = config.provider;

    if (providerName === 'razorpay') {
      this.razorpay.setConfig(config.providers.razorpay);
      return this.razorpay;
    }

    if (providerName === 'icici') {
      this.icici.setConfig(config.providers.icici);
      return this.icici;
    }

    throw new Error(`Unsupported provider: ${providerName}`);
  }
}
