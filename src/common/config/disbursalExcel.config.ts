export function handleFormatA(sheet, loans, accountMap, exportedLoanIds, config) {
    sheet.columns = [
        { header: 'PYMT_PROD_TYPE_CODE', key: 'PYMT_PROD_TYPE_CODE', width: 20 },
        { header: 'PYMT_MODE', key: 'PYMT_MODE', width: 20 },
        { header: 'DEBIT_ACC_NO', key: 'DebitAccountNumber', width: 25 },
        { header: 'BNF_NAME', key: 'BNF_NAME', width: 25 },
        { header: 'BENE_ACC_NO', key: 'BENE_ACC_NO', width: 15 },
        { header: 'BENE_IFSC', key: 'BENE_IFSC', width: 20 },
        { header: 'AMOUNT', key: 'AMOUNT', width: 20 },
        { header: 'DEBIT_NARR', key: 'DEBIT_NARR', width: 20 },
        { header: 'CREDIT_NARR', key: 'CREDIT_NARR', width: 20 },
        { header: 'MOBILE_NUM', key: 'MOBILE_NUM', width: 20 },
        { header: 'EMAIL_ID', key: 'EMAIL_ID', width: 20 },
        { header: 'REMARK', key: 'REMARK', width: 20 },
        { header: 'PYMT_DATE', key: 'PYMT_DATE', width: 20 },
        { header: 'REF_NO', key: 'REF_NO', width: 20 },
        { header: 'ADDL_INFO1', key: 'ADDL_INFO1', width: 20 },
        { header: 'ADDL_INFO2', key: 'ADDL_INFO2', width: 20 },
        { header: 'ADDL_INFO3', key: 'ADDL_INFO3', width: 20 },
        { header: 'ADDL_INFO4', key: 'ADDL_INFO4', width: 20 },
        { header: 'ADDL_INFO5', key: 'ADDL_INFO5', width: 20 },

    ];

    sheet.getRow(1).font = { bold: true };

    loans.forEach((loan) => {
        const approval = loan.lead?.approvals?.[0];
        if (!approval) return;

        const adminFee = approval.adminFee || 0;
        const gst = +(adminFee * 0.18).toFixed(2);
        const amount = approval.loanAmtApproved - (adminFee + gst);

        const account = accountMap.get(approval.disbursalaccountid);

        const bankName = account?.bank?.toLowerCase();
        const PYMT_MODE = bankName === 'icici bank' ? 'FT' : 'IMPS';

        sheet.addRow({
            PYMT_PROD_TYPE_CODE: 'PAB_VENDOR',
            PYMT_MODE,
            DebitAccountNumber: config.debitAccount,
            BNF_NAME:
                account?.bank_holder_name || loan.lead?.customer?.firstName,
            BENE_ACC_NO: account?.accountNo,
            BENE_IFSC: account?.bankIfsc,
            AMOUNT: Math.round(amount),
            PYMT_DATE: new Date(),
            DEBIT_NARR: loan.loanNo,
            CREDIT_NARR: loan.loanNo,
            MOBILE_NUM: Number(loan.lead?.customer?.mobile) || "",
            EMAIL_ID: "",
            REMARK: loan?.lead?.fbLeads,
            REF_NO: "",
            ADDL_INFO1: "",
            ADDL_INFO2: "",
            ADDL_INFO3: "",
            ADDL_INFO4: "",
            ADDL_INFO5: "",

        });

        exportedLoanIds.push(loan.loanID);
    });
}


export function handleFormatB(sheet, loans, accountMap, exportedLoanIds, config) {
    sheet.columns = [
        { header: 'Transaction Type', key: 'TransactionType', width: 20 },
        { header: 'Debit Account Number', key: 'DebitAccountNumber', width: 25 },
        { header: 'Transaction Amount', key: 'TransactionAmount', width: 25 },
        { header: 'Value Date', key: 'ValueDate', width: 15 },
        { header: 'Beneficiary Account Number', key: 'BeneficiaryAccountNumber', width: 20 },
        { header: 'Beneficiary Name', key: 'BeneficiaryName', width: 20 },
        { header: 'IFSC Code', key: 'IFSCCode', width: 18 },
        { header: 'Unique Customer Reference Number', key: 'UniqueCustomerReferenceNumber', width: 18 },
    ];

    sheet.getRow(1).font = { bold: true };

    loans.forEach((loan) => {
        const approval = loan.lead?.approvals?.[0];
        if (!approval) return;

        const adminFee = approval.adminFee || 0;
        const gst = +(adminFee * 0.18).toFixed(2);
        const amount = approval.loanAmtApproved - (adminFee + gst);

        const account = accountMap.get(approval.disbursalaccountid);

        sheet.addRow({
            TransactionType: 'IMPS',
            DebitAccountNumber: config.debitAccount,
            TransactionAmount: amount,
            ValueDate: new Date(),
            BeneficiaryAccountNumber: account?.accountNo,
            BeneficiaryName:
                account?.bank_holder_name || loan.lead?.customer?.firstName,
            IFSCCode: account?.bankIfsc,
            UniqueCustomerReferenceNumber: loan.loanNo,
        });

        exportedLoanIds.push(loan.loanID);
    });
}


export function handleFormatC(sheet, loans, accountMap, exportedLoanIds, config) {
    sheet.columns = [
        { header: 'Beneficiary Name', key: 'name', width: 20 },
        { header: 'Beneficiary Account Number', key: 'acc', width: 20 },
        { header: 'IFSC', key: 'ifsc', width: 20 },
        { header: 'Transaction Type', key: 'type', width: 20 },
        { header: 'Debit Account Number', key: 'debit', width: 20 },
        { header: 'Transaction Date', key: 'date', width: 20 },
        { header: 'Amount', key: 'amount', width: 20 },
        { header: 'Currency', key: 'currency', width: 20 },
        { header: 'Remarks', key: 'remarks', width: 20 },
    ];

    sheet.getRow(1).font = { bold: true };

    loans.forEach((loan) => {
        const approval = loan.lead?.approvals?.[0];
        if (!approval) return;

        const adminFee = approval.adminFee || 0;
        const gst = +(adminFee * 0.18).toFixed(2);
        const amount = approval.loanAmtApproved - (adminFee + gst);

        const account = accountMap.get(approval.disbursalaccountid);

        sheet.addRow({
            name: loan.lead?.customer?.name,
            acc: account?.accountNo,
            ifsc: account?.bankIfsc,
            type: 'NEFT',
            debit: config.debitAccount,
            date: new Date().toLocaleDateString('en-GB'),
            amount,
            currency: 'INR',
            remarks: loan.loanNo,
        });

        exportedLoanIds.push(loan.loanID);
    });
}


export function handleFormatD(sheet, loans, accountMap, exportedLoanIds, config) {
    sheet.columns = [
        { header: 'Client Code', key: 'clientcode', width: 20 },
        { header: 'Debit account no.', key: 'debitaccountno', width: 20 },
        { header: 'Transaction type code', key: 'transactionTypeCode', width: 20 },
        { header: 'Value date', key: 'valuedate', width: 20 },
        { header: 'Amount', key: 'amount', width: 20 },
        { header: 'Beneficary Name', key: 'beneficaryName', width: 20 },
        { header: 'Beneficary Accunt no.', key: 'beneficaryAccuntno', width: 20 },
        { header: 'IFSC code', key: 'IFSCcode', width: 20 },
        { header: 'Customer Ref no.', key: 'CustomerRefno', width: 20 },
        { header: 'Beneficary email id', key: 'beneficaryEmailId', width: 20 },
        { header: 'Beneficiary mobile no.', key: 'beneficiaryMobileno', width: 20 },
        { header: 'Remarks', key: 'remarks', width: 20 },
        { header: 'Payment Type', key: 'paymentType', width: 20 },
        { header: 'Purpose code', key: 'purposeCode', width: 20 },
        { header: 'Bene a/c type', key: 'beneacType', width: 20 },
        { header: 'Payable Location', key: 'payableLocation', width: 20 },
        { header: 'Print branch name', key: 'printBranchName', width: 20 },
        { header: 'Mode of delivery', key: 'modeofDelivery', width: 20 },
        { header: 'Transaction currency', key: 'transactionCurrency', width: 20 },
        { header: 'BENE_ADD1', key: 'BENE_ADD1', width: 20 },
        { header: 'BENE_ADD2', key: 'BENE_ADD2', width: 20 },
        { header: 'BENE_ADD3', key: 'BENE_ADD3', width: 20 },
        { header: 'BENE_ADD4', key: 'BENE_ADD4', width: 20 },
        { header: 'BENE_ID', key: 'BENE_ID', width: 20 },

    ];

    sheet.getRow(1).font = { bold: true };
    loans.forEach((loan) => {
        const approval = loan.lead?.approvals?.[0];
        if (!approval) return;


        const adminFee = approval.adminFee || 0;
        const gst = +(adminFee * 0.18).toFixed(2);
        const amount = approval.loanAmtApproved - (adminFee + gst);

        const account = accountMap.get(approval.disbursalaccountid);
        const bankName = account?.bank?.toLowerCase();
        const PYMT_MODE = bankName === 'IDFC First bank' ? 'BT' : 'LBT';

        sheet.addRow({
            clientcode: "",
            debitaccountno: config.debitAccount,
            transactionTypeCode: PYMT_MODE,
            valuedate: new Date().toLocaleDateString('en-GB'),
            amount: amount,
            beneficaryName: account?.bank_holder_name || loan.lead?.customer?.firstName,
            beneficaryAccuntno: account?.accountNo,
            IFSCcode: account?.bankIfsc,
            CustomerRefno: loan?.loanNo,
            beneficaryEmailId: "",
            beneficiaryMobileno: "",
            remarks: `Disbursement${loan.loanNo}`,
            paymentType: "NEFT",
            purposeCode: "OTH",
            beneacType: "11",
            payableLocation: "",
            printBranchName: "",
            modeofDelivery: "",
            transactionCurrency: "INR",
            BENE_ADD1: "",
            BENE_ADD2: "",
            BENE_ADD3: "",
            BENE_ADD4: "",
            BENE_ID: ""

        })
        exportedLoanIds.push(loan.loanID);
    })

}