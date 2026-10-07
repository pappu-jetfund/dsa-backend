export type SmsProvider =
  | 'fast2sms'
  | 'trustsignal'
  | 'twilio'
  | 'truebulk'
  | 'nimbusit'
  | 'msg91'
  | 'none';

export interface SmsConfig {
  enable: boolean;
  provider: SmsProvider;
}

export const SMS_CONFIG: Record<string, SmsConfig> = {
  localhost: {
    enable: true,
    provider: 'trustsignal',
  },
  'lms.speedoloan.com': {
    enable: true,
    provider: 'trustsignal',
  },
  'rlms.speedoloan.com': {
    enable: true,
    provider: 'trustsignal',
  },




  'lms.rupyalelo.com': {
    enable: true,
    provider: 'trustsignal',
  },
  'lms.shreeloan.com': {
    enable: true,
    provider: 'trustsignal',
  },


  'lms.cashmysalary.com': {
    enable: true,
    provider: 'trustsignal',
  },

};
