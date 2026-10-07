export type verificationProvider =
    | 'Unifers'
    | 'ongrid'
    | 'none';


export interface providerConfig {
    enable: boolean;
    provider: verificationProvider;
}


export const EMPLOYMENT_HISTORY_CONFIG: Record<string, providerConfig> = {
    localhost: {
        enable: true,
        provider: 'Unifers',
    },
    'lms.speedoloan.com': {
        enable: true,
        provider: 'ongrid',
    },
    'rlms.speedoloan.com': {
        enable: true,
        provider: 'ongrid',
    },
    'lms.rupyalelo.com': {
        enable: true,
        provider: 'ongrid',
    },
    'lms.shreeloan.com': {
        enable: true,
        provider: 'ongrid',
    },


    'lms.cashmysalary.com': {
        enable: true,
        provider: 'ongrid',
    },


    'lms.jetfund.in': {
        enable: false,
        provider: 'ongrid',
    },

};
