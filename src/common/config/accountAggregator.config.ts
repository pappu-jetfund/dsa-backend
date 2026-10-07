export type accountAggregator = 'finduit' | 'fineye' | 'ignosis';

export type AAConfig = {
  brand: string;
  gateway: accountAggregator;
  enabled: boolean;
  sms: boolean
};

const DEFAULT_ACCOUNTAGGREGATOR_CONFIG: AAConfig = {
  brand: 'Default',
  gateway: 'fineye',
  enabled: true,
  sms: false
};

export const DOMAIN_AA_CONFIG: Record<string, AAConfig> = {
  // Local
  'localhost:4005': {
    brand: 'Local Dev',
    gateway: 'fineye',
    enabled: true,
    sms: false
  },

  'lms.speedoloan.com': {
    brand: 'SpeedoLoan',
    gateway: 'finduit',
    enabled: true,
    sms: true
  },

  'lms.shreeloan.com': {
    brand: 'ShreeLoan',
    gateway: 'finduit',
    enabled: true,
    sms: true
  },

  'apply.rupyalelo.com': {
    brand: 'RupyaLelo',
    gateway: 'finduit',
    enabled: true,
    sms: true
  },

  'lms.cashmysalary.com': {
    brand: 'CashMySalary',
    gateway: 'finduit',
    enabled: true,
    sms: true
  },


  'lms.jetfund.in': {
    brand: 'JetFund',
    gateway: 'ignosis',
    enabled: false,
    sms: false
  },
};
