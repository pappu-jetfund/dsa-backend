import { Injectable } from '@nestjs/common';
import { PayoutProvider } from '../interfaces/payout-provider.interface';

@Injectable()
export class RazorpayProvider implements PayoutProvider {
  private config: any;

  setConfig(config: any) {
    this.config = config;
  }

  async transfer(data: any): Promise<any> {
    // 👉 use this.config.keyId / keySecret
    // 👉 your existing Razorpay payout logic

    return { provider: 'razorpay', status: 'success' };
  }

  async status(referenceId: string): Promise<any> {
    return { status: 'ok' };
  }
}
