export interface DedupeConfig {
    enabled: boolean;
    isthirdPart: boolean;
}


type DedupeConfigMap = Record<string, DedupeConfig>;


export const dedupeConfig: DedupeConfigMap = {

    localhost: {
        enabled: false,
        isthirdPart: false,

    },
    'lms.speedoloan.com': {
        enabled: true,
        isthirdPart: true,
    },

    'lms.rupyalelo.com': {
        enabled: true,
        isthirdPart: true,
    },
    'lms.shreeloan.com': {
        enabled: true,
        isthirdPart: true,
    },










    'lms.cashmysalary.com': {
        enabled: true,
        isthirdPart: true,
    },



    'lms.jetfund.in': {
        enabled: false,
        isthirdPart: false,
    },
    'lms.rupyalelo.in': {
        enabled: true,
        isthirdPart: true,
    },
}