export type mandateProvider =
    | 'easeBuzz'
    | 'razorpay'
    | 'none';


export interface providerConfig {
    enable: boolean;
    provider: mandateProvider;
}


export const EMANDATE_CONFIG: Record<string, providerConfig> = {
    localhost: {
        enable: true,
        provider: 'razorpay',
    },
    'lms.speedoloan.com': {
        enable: true,
        provider: 'easeBuzz',
    },
    'lms-dev.speedoloan.com': {
        enable: true,
        provider: 'easeBuzz',
    },
    'rlms.speedoloan.com': {
        enable: true,
        provider: 'razorpay',
    },
    'lms.rupyalelo.com': {
        enable: true,
        provider: 'razorpay',
    },
    'lms.shreeloan.com': {
        enable: true,
        provider: 'razorpay',
    },


    'lms.cashmysalary.com': {
        enable: true,
        provider: 'easeBuzz',
    },


    'lms.jetfund.in': {
        enable: true,
        provider: 'easeBuzz',
    },
};
