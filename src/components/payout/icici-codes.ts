type IciciStatus = 'SUCCESS' | 'FAILED' | 'PENDING';

type IciciCategory =
    | 'SUCCESS'
    | 'BUSINESS_DECLINE'
    | 'TECHNICAL_DECLINE'
    | 'PENDING'
    | 'DEEMED_APPROVED';

interface IciciCodeConfig {
    status: IciciStatus;
    category: IciciCategory;
    retryable: boolean;
    needsStatusCheck: boolean;
    description: string;
}


export const ICICI_CODE_MAP: Record<string, IciciCodeConfig> = {

    '0': {
        status: 'SUCCESS',
        category: 'SUCCESS',
        retryable: false,
        needsStatusCheck: false,
        description: 'Transaction successful',
    },

    //  PENDING / TIMEOUT / DEEMED APPROVED
    '11': { status: 'PENDING', category: 'DEEMED_APPROVED', retryable: false, needsStatusCheck: true, description: 'Timeout - check status' },
    '30': { status: 'PENDING', category: 'DEEMED_APPROVED', retryable: false, needsStatusCheck: true, description: 'Timeout at NPCI' },
    '31': { status: 'PENDING', category: 'DEEMED_APPROVED', retryable: false, needsStatusCheck: true, description: 'Timeout at ICICI CBS' },
    '33': { status: 'PENDING', category: 'DEEMED_APPROVED', retryable: false, needsStatusCheck: true, description: 'Intra-bank timeout' },
    '40': { status: 'PENDING', category: 'PENDING', retryable: false, needsStatusCheck: true, description: 'CDCI timeout' },
    '63': { status: 'PENDING', category: 'PENDING', retryable: false, needsStatusCheck: true, description: 'ICICI timeout' },
    '80': { status: 'PENDING', category: 'PENDING', retryable: false, needsStatusCheck: true, description: 'Duplicate request' },
    '101': { status: 'PENDING', category: 'DEEMED_APPROVED', retryable: false, needsStatusCheck: true, description: 'IMPS switch not reachable' },
    '102': { status: 'PENDING', category: 'PENDING', retryable: false, needsStatusCheck: true, description: 'Connectivity issue' },
    '103': { status: 'PENDING', category: 'DEEMED_APPROVED', retryable: false, needsStatusCheck: true, description: 'No response' },
    '814': { status: 'PENDING', category: 'PENDING', retryable: false, needsStatusCheck: true, description: 'Duplicate transaction at switch' },

    //  BUSINESS DECLINES (NO RETRY IMMEDIATELY)
    '1': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Invalid beneficiary' },
    '2': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Amount limit exceeded' },
    '3': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Frozen account' },
    '4': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'NRE account' },
    '5': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Closed account' },
    '7': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Account type not allowed' },
    '8': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Account limit exceeded' },
    '9': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Non reloadable card' },
    '12': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Bank not live' },
    '15': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Beneficiary is merchant' },
    '22': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Remitter account issue' },
    '24': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Amount too high' },
    '29': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Fraud suspected' },
    '52': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Invalid account' },
    '65': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Account limit exceeded' },
    '201': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Invalid IFSC' },
    '202': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Customer limit exceeded' },
    '205': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Amount < 1' },
    '206': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Invalid remitter account' },

    //  TECHNICAL DECLINES (RETRYABLE)
    '13': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: false, needsStatusCheck: false, description: 'Invalid amount format' },
    '14': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'Duplicate txn' },
    '16': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: false, needsStatusCheck: false, description: 'Format error' },
    '18': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'Bank down' },
    '23': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'CBS issue' },
    '35': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'Invalid message' },
    '36': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'Invalid transaction' },
    '39': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'Timeout CDCI' },
    '60': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'Unknown error' },
    '64': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'Processing error' },
    '70': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'OCH failure' },
    '96': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'Unable to process' },
    '207': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'General error' },
    '403': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'Unauthorized IP' },

    //  U CODES (NPCI)
    'U09': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'Timeout' },
    'U27': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'No response from bank' },
    'U78': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'Beneficiary bank offline' },
    'U92': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'Remitter bank offline' },
    'U16': { status: 'FAILED', category: 'BUSINESS_DECLINE', retryable: false, needsStatusCheck: false, description: 'Risk exceeded' },
    'U01': { status: 'FAILED', category: 'TECHNICAL_DECLINE', retryable: true, needsStatusCheck: false, description: 'Duplicate request' },

    //  DEFAULT FALLBACK
    'DEFAULT': {
        status: 'FAILED',
        category: 'TECHNICAL_DECLINE',
        retryable: true,
        needsStatusCheck: false,
        description: 'Unknown error',
    },
};