
export interface ExportColumnConfig {
    header: string;
    key: string;
    width?: number;

    /**
     * If supplied, this function decides the Excel value.
     */
    value?: (
        customer: any,
        context: any,
    ) => any;
}

export interface ExportStepConfig {
    step: number;
    key: string;
    label: string;

    /**
     * true  = step completed
     * false = customer is currently at this step
     */
    condition: (
        customer: any,
        context: any,
    ) => boolean;
}

export interface NotOnboardedExportConfig {
    sheetName?: string;
    steps: ExportStepConfig[];
    columns: ExportColumnConfig[];
}


export const NOT_ONBOARDED_EXPORT_CONFIG: Record<string, NotOnboardedExportConfig> = {
    default: {
        sheetName: 'Not Onboarded Customer',
        steps: [
            {
                step: 0,
                key: 'otp',
                label: 'OTP Verification',
                condition: (customer, context) =>
                    !!context.isotpDone || !!customer.isVerified,
            },
            {
                step: 1,
                key: 'email',
                label: 'Email Verification',
                condition: (customer) =>
                    !!customer.emailVerify,
            },
            {
                step: 2,
                key: 'kyc',
                label: 'KYC',
                condition: (customer, context) =>
                    !!context.isKycDone ||
                    (!!customer.aadharNo && !!customer.pancard),
            },
            {
                step: 3,
                key: 'banking',
                label: 'Banking',
                condition: (_customer, context) =>
                    !!context.isBankingDone,
            },
            {
                step: 4,
                key: 'preoffer',
                label: 'Pre-offer',
                condition: (_customer, context) =>
                    !!context.isPreofferGenerated,
            },
            {
                step: 5,
                key: 'application',
                label: 'Loan Application',
                condition: (customer) =>
                    !!customer.leads?.length,
            },
        ],

        columns: [
            {
                header: 'Customer ID',
                key: 'customerID',
                width: 15,
            },
            {
                header: 'Name',
                key: 'name',
                width: 25,
                value: (customer) =>
                    customer.name ?? '-',
            },
            {
                header: 'Mobile',
                key: 'mobile',
                width: 18,
                value: (customer) =>
                    customer.mobile
                        ? customer.mobile.toString()
                        : '-',
            },
            {
                header: 'Created Date',
                key: 'createdDate',
                width: 22,
            },
            {
                header: 'Source',
                key: 'utmSource',
                width: 20,
                value: (customer) =>
                    customer.utmSource ?? '-',
            },
            {
                header: 'Current Step',
                key: 'currentStep',
                width: 15,
                value: (_customer, context) =>
                    context.currentStep ?? '-',
            },
            {
                header: 'Current Stage',
                key: 'currentStage',
                width: 30,
                value: (_customer, context) =>
                    context.currentStage ?? '-',
            },
            {
                header: 'Risk Grade',
                key: 'riskGrade',
                width: 20,
                value: (_customer, context) =>
                    context.riskGrade ?? '-',
            },
        ],
    },
    speedoloan: {
        sheetName: 'Not Onboarded Customer',

        steps: [
            {
                step: 0,
                key: 'otp',
                label: 'OTP Verification',
                condition: (customer, context) =>
                    !!context.isotpDone || !!customer.isVerified,
            },
            {
                step: 1,
                key: 'email',
                label: 'Email Verification',
                condition: (customer) =>
                    !!customer.emailVerify,
            },
            {
                step: 2,
                key: 'kyc',
                label: 'KYC',
                condition: (customer, context) =>
                    !!context.isKycDone ||
                    (!!customer.aadharNo && !!customer.pancard),
            },
            {
                step: 3,
                key: 'banking',
                label: 'Banking',
                condition: (_customer, context) =>
                    !!context.isBankingDone,
            },
            {
                step: 4,
                key: 'preoffer',
                label: 'Pre-offer',
                condition: (_customer, context) =>
                    !!context.isPreofferGenerated,
            },
            {
                step: 5,
                key: 'application',
                label: 'Loan Application',
                condition: (customer) =>
                    !!customer.leads?.length,
            },
        ],

        columns: [
            {
                header: 'Customer ID',
                key: 'customerID',
                width: 15,
            },
            {
                header: 'Name',
                key: 'name',
                width: 25,
                value: (customer) =>
                    customer.name ?? '-',
            },
            {
                header: 'Mobile',
                key: 'mobile',
                width: 18,
                value: (customer) =>
                    customer.mobile
                        ? customer.mobile.toString()
                        : '-',
            },
            {
                header: 'Created Date',
                key: 'createdDate',
                width: 22,
            },
            {
                header: 'Source',
                key: 'utmSource',
                width: 20,
                value: (customer) =>
                    customer.utmSource ?? '-',
            },
            {
                header: 'Current Step',
                key: 'currentStep',
                width: 15,
                value: (_customer, context) =>
                    context.currentStep ?? '-',
            },
            {
                header: 'Current Stage',
                key: 'currentStage',
                width: 30,
                value: (_customer, context) =>
                    context.currentStage ?? '-',
            },
            {
                header: 'Risk Grade',
                key: 'riskGrade',
                width: 20,
                value: (_customer, context) =>
                    context.riskGrade ?? '-',
            },

            // {
            //     header: 'OTP Verified',
            //     key: 'isotpDone',
            //     width: 18,
            //     value: (_customer, context) =>
            //         context.isotpDone ? 'Yes' : 'No',
            // },
            // {
            //     header: 'Apply Button Click',
            //     key: 'is_apply_button_clicked',
            //     width: 20,
            //     value: (_customer, context) =>
            //         context.isApplyButtonClicked ? 'Yes' : 'No',
            // },
            // {
            //     header: 'Pincode Outside Service',
            //     key: 'is_pincode_outside_service',
            //     width: 24,
            //     value: (_customer, context) =>
            //         context.isPincodeOutsideService ? 'Yes' : 'No',
            // },
            // {
            //     header: 'Pre-offer Generated',
            //     key: 'is_preoffer_generated',
            //     width: 20,
            //     value: (_customer, context) =>
            //         context.isPreofferGenerated ? 'Yes' : 'No',
            // },
            // {
            //     header: 'Pre-offer Decision',
            //     key: 'preoffer_decision',
            //     width: 22,
            //     value: (_customer, context) =>
            //         context.breLog?.status ?? '-',
            // },
            // {
            //     header: 'Email Verified',
            //     key: 'emailVerify',
            //     width: 18,
            //     value: (customer) =>
            //         customer.emailVerify ? 'Yes' : 'No',
            // },
            // {
            //     header: 'KYC Done',
            //     key: 'is_kyc_done',
            //     width: 18,
            //     value: (_customer, context) =>
            //         context.isKycDone ? 'Yes' : 'No',
            // },
            // {
            //     header: 'Banking Done',
            //     key: 'is_banking_done',
            //     width: 18,
            //     value: (_customer, context) =>
            //         context.isBankingDone ? 'Yes' : 'No',
            // },
        ],
    },
    jetfund: {
        sheetName: 'Not Onboarded Customer',

        steps: [
            {
                step: 0,
                key: 'otp',
                label: 'OTP Verification',
                condition: (customer, context) =>
                    !!context.isotpDone || !!customer.isVerified,
            },
            {
                step: 1,
                key: 'basic_detail',
                label: 'KYC',
                condition: (_customer, context) =>
                    !!context.isKycDone,
            },
            {
                step: 2,
                key: 'Employer',
                label: 'Employer Detail',
                condition: (_customer, context) =>
                    !!context.isEmployerDone,
            },
            {
                step: 3,
                key: 'account_agregator',
                label: 'Account Aggregator',
                condition: (_customer, context) =>
                    !!context.isBankingDone,
            },
            {
                step: 4,
                key: 'Loan Offer',
                label: 'Loan Offer',
                condition: (_customer, context) =>
                    !!context.isPreofferGenerated,
            },
            {
                step: 5,
                key: 'Reference',
                label: 'Reference',
                condition: (_customer, context) =>
                    !!context.isReferenceDone,
            },
            {
                step: 6,
                key: 'Selfie',
                label: 'Selfie',
                condition: (_customer, context) =>
                    !!context.isSelfieDone,
            },
        ],

        columns: [
            {
                header: 'Customer ID',
                key: 'customerID',
                width: 15,
            },
            {
                header: 'Name',
                key: 'name',
                width: 25,
                value: (customer) => customer.name ?? '-',
            },
            {
                header: 'Mobile',
                key: 'mobile',
                width: 18,
                value: (customer) =>
                    customer.mobile ? customer.mobile.toString() : '-',
            },
            {
                header: 'Created Date',
                key: 'createdDate',
                width: 22,
            },
            {
                header: 'Source',
                key: 'utmSource',
                width: 20,
                value: (customer) => customer.utmSource ?? '-',
            },
            {
                header: 'Current Step',
                key: 'currentStep',
                width: 15,
                value: (_customer, context) =>
                    context.currentStep ?? '-',
            },
            {
                header: 'Current Stage',
                key: 'currentStage',
                width: 30,
                value: (_customer, context) =>
                    context.currentStage ?? '-',
            },
            {
                header: 'Risk Grade',
                key: 'riskGrade',
                width: 20,
                value: (_customer, context) =>
                    context.riskGrade ?? '-',
            },
        ],
    },
};