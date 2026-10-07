// customer-journey.config.ts

export type RequiredJourneyStep =
    | 'mobileOtp'
    | 'preoffer'
    | 'panVerification'
    | 'bankVerification'
    | 'employment'
    | 'loanOffer'
    | 'personalDetails'
    | 'kyc'
    | 'selfie'
    | 'refrence';

export type OptionalJourneyStep =
    | 'penny_drop'
    | 'e_sign'
    | 'emandate'
    | 'disbursed';



export type CustomerJourneyStep = | RequiredJourneyStep | OptionalJourneyStep;


export type CardCompleted = { [K in RequiredJourneyStep]: boolean; } & { [K in OptionalJourneyStep]?: boolean; };

export interface JourneyStepConfig {
    key: CustomerJourneyStep;
    title: string;
}

export interface DomainJourneyConfig {
    steps: JourneyStepConfig[];
}



export const CUSTOMER_JOURNEY_CONFIG: Record<string, DomainJourneyConfig> = {

    'lms.jetfund.in': {
        steps: [
            {
                key: 'mobileOtp',
                title: 'Mobile & OTP Verification',
            },
            {
                key: 'panVerification',
                title: 'PAN Verification',
            },
            {
                key: 'employment',
                title: 'Employment Details',
            },
            {
                key: 'preoffer',
                title: 'Pre-offer',
            },
            {
                key: 'bankVerification',
                title: 'Bank Verification',
            },
            {
                key: 'loanOffer',
                title: 'Loan Offer',
            },
            {
                key: 'refrence',
                title: 'Refrence',
            },
            {
                key: 'kyc',
                title: 'KYC',
            },
            {
                key: 'selfie',
                title: 'Selfie Verification',
            },
            {
                key: 'penny_drop',
                title: 'Penny Drop',
            },
            {
                key: 'e_sign',
                title: 'E Sign',
            },
            {
                key: 'emandate',
                title: 'E Mandate',
            },
            {
                key: 'disbursed',
                title: 'Disbursed',
            },
        ],
    },



    'lms.cashmysalary.com': {
        steps: [
            {
                key: 'mobileOtp',
                title: 'Mobile & OTP Verification',
            },
            {
                key: 'panVerification',
                title: 'PAN Verification',
            },
            {
                key: 'preoffer',
                title: 'Pre-offer',
            },
            {
                key: 'bankVerification',
                title: 'Bank Verification',
            },
            {
                key: 'employment',
                title: 'Employment Details',
            },
            {
                key: 'loanOffer',
                title: 'Loan Offer',
            },
            {
                key: 'personalDetails',
                title: 'Personal Details',
            },
            {
                key: 'kyc',
                title: 'KYC Verification',
            },
            {
                key: 'selfie',
                title: 'Selfie Verification',
            },
            {
                key: 'penny_drop',
                title: 'Penny Drop',
            },
            {
                key: 'e_sign',
                title: 'E Sign',
            },
            {
                key: 'emandate',
                title: 'E Mandate',
            },
            {
                key: 'disbursed',
                title: 'Disbursed',
            },
        ],
    },


    default: {
        steps: [
            {
                key: 'mobileOtp',
                title: 'Mobile & OTP Verification',
            },
            {
                key: 'panVerification',
                title: 'PAN Verification',
            },
            {
                key: 'bankVerification',
                title: 'Bank Verification',
            },
            {
                key: 'employment',
                title: 'Employment Details',
            },
            {
                key: 'loanOffer',
                title: 'Loan Offer',
            },
            {
                key: 'personalDetails',
                title: 'Personal Details',
            },
            {
                key: 'kyc',
                title: 'KYC Verification',
            },
            {
                key: 'selfie',
                title: 'Selfie Verification',
            },
            {
                key: 'penny_drop',
                title: 'Penny Drop',
            },
            {
                key: 'e_sign',
                title: 'E Sign',
            },
            {
                key: 'emandate',
                title: 'E Mandate',
            },
            {
                key: 'disbursed',
                title: 'Disbursed',
            },
        ],
    },
};
