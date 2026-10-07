import { Injectable } from '@nestjs/common';
import { PayoutFactory } from './payout.factory';

@Injectable()
export class PayoutService {
  constructor(private factory: PayoutFactory) { }

  async transfer(data: any) {
    const provider = await this.factory.getProvider();
    return provider.transfer(data);
  }

  async status(transRefNo: string, domain?: string) {
    const provider = await this.factory.getProvider(domain);
    return provider.status(transRefNo);
  }
}
