import { Injectable } from '@nestjs/common';

@Injectable()
export class DomainPayoutConfigService {
  async getConfigByDomain(domain: string) {
    const configs: Record<string, any> = {
      localhost: {
        provider: 'icici',

        providers: {
          icici: {
            type: 'ICICI',
            baseUrl: process.env.ICICI_TRANSACTION_URL,
            apiKey: process.env.ICICI_API_KEY,
            statusCheckURL: process.env.ICICI_STATUS_CHECK_URL,

            publicKeyPath: './keys/ICICI_PUBLIC_CERT_CIB API PROD1.txt',
            privateKeyPath: './keys/private.key',
            defaultMode: 'IMPS',
            retailerCode: 'rcode',
            passCode: process.env.ICICI_PASSCODE,
            bcID: process.env.ICICI_BCID,
          },
          razorpay: {
            type: 'RAZORPAY',
            keyId: process.env.RAZORPAY_KEY_ID,
            keySecret: process.env.RAZORPAY_SECRET,
          },
        },
      },

      'lms.speedoloan.com': {
        provider: 'razorpay',

        providers: {
          icici: {
            type: 'ICICI',
            baseUrl: 'https://apibankingonesandbox.icici.bank.in/api/v1',
            apiKey: process.env.ICICI_API_KEY,

            publicKeyPath: './keys/uatPubliccert.txt',
            privateKeyPath: './keys/private.key',

            // optional (for future flexibility)
            defaultMode: 'IMPS', // IMPS | UPI | NEFT | RTGS
          },

          razorpay: {
            type: 'RAZORPAY',
            keyId: process.env.RAZORPAY_KEY_ID,
            keySecret: process.env.RAZORPAY_SECRET,
          },
        },
      },

      'lms.shreeloan.com': {
        provider: 'icici',

        providers: {
          icici: {
            type: 'ICICI',
            baseUrl: 'https://apibankingonesandbox.icici.bank.in/api/v1',
            apiKey: process.env.ICICI_API_KEY,

            publicKeyPath: './keys/uatPubliccert.txt',
            privateKeyPath: './keys/private.key',

            // optional (for future flexibility)
            defaultMode: 'IMPS', // IMPS | UPI | NEFT | RTGS
          },

          razorpay: {
            type: 'RAZORPAY',
            keyId: process.env.RAZORPAY_KEY_ID,
            keySecret: process.env.RAZORPAY_SECRET,
          },
        },
      },
      'lms.rupyalelo.com': {
        provider: 'icici',

        providers: {
          icici: {
            type: 'ICICI',
            baseUrl: process.env.ICICI_TRANSACTION_URL,
            apiKey: process.env.ICICI_API_KEY,
            statusCheckURL: process.env.ICICI_STATUS_CHECK_URL,

            publicKeyPath: './keys/composite_live_certificate.txt',
            privateKeyPath: './keys/private.key',
            defaultMode: 'IMPS',
            retailerCode: 'rcode',
            passCode: process.env.ICICI_PASSCODE,
            bcID: process.env.ICICI_BCID,
          },

          razorpay: {
            type: 'RAZORPAY',
            keyId: process.env.RAZORPAY_KEY_ID,
            keySecret: process.env.RAZORPAY_SECRET,
          },
        },
      },
    };

    const cleanDomain = domain?.split(':')[0]; // remove port
    const config = configs[cleanDomain];

    if (!config) {
      throw new Error(`No payout config for domain: ${cleanDomain}`);
    }

    return config;
  }
}
