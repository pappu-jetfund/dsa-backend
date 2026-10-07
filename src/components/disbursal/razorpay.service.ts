import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class RazorpayService {
  constructor(private configService: ConfigService) {}
  async verifyWebhookSignature(body: any, signature: string) {
    const secret = await this.configService.get('RAZORPAY_WEBHOOK_SECRET');
    // console.log(secret, 'secret');

    if (!secret) {
      throw new UnauthorizedException(
        'Razorpay webhook secret is not configured',
      );
    }

    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(body))
      .digest('hex');

    if (generatedSignature !== signature) {
      throw new UnauthorizedException('Invalid Razorpay signature');
    }
  }
}
