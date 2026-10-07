export const mailConfig = {
  not_answring_call: {
    subject: `Call Not Answering - ${process.env.COMPANY_NAME}`,
    template: 'not-answering-letter.hbs',
    smtpType: 'recovery',
    buildData: (lead) => ({
      name: lead.customer.name,
      company_name_show: process.env.NBFC_NAME_SHOW,
      SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
      SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
    }),
  },
  repeatedly_making_commitments: {
    subject: 'Repeatedly Making Commitments',
    template: 'repeatedly-making-commitments.hbs',
    smtpType: 'recovery',
    buildData: (lead) => ({
      name: lead.customer.name,
      SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
      SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
    }),
  },
  not_paid_anything: {
    subject: `Not Paid Anything - ${process.env.COMPANY_NAME}`,
    template: 'not-paid-anything.hbs',
    smtpType: 'recovery',
    buildData: (lead) => ({
      name: lead.customer.name,
      SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
      SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
    }),
  },
  not_getting_salary: {
    subject: `Not Getting Salary ${process.env.COMPANY_NAME}`,
    template: 'not-getting-salary.hbs',
    smtpType: 'recovery',
    buildData: (lead) => ({
      name: lead.customer.name,
      SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
      SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
    }),
  },
  alining_visit: {
    subject: `Alining Visit - ${process.env.COMPANY_NAME}`,
    template: 'alining-visit.hbs',
    smtpType: 'recovery',
    buildData: (lead) => ({
      name: lead.customer.name,
      SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
      SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
      los_server_name: process.env.LOS_SERVER_NAME,
      company_name_show: process.env.NBFC_NAME_SHOW,
    }),
  },
  do_not_make_cash_payment: {
    subject: `Reminder Do Not Make Cash Payment  ${process.env.COMPANY_NAME}`,
    template: 'do-not-make-cash-payments.hbs',
    smtpType: 'recovery',
    buildData: (lead) => ({
      name: lead.customer.name,
      SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
      SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
      company_name_show: process.env.NBFC_NAME_SHOW,
    }),
  },
  left_home_and_not_paid: {
    subject: `Left home and not paid -  ${process.env.COMPANY_NAME}`,
    template: 'left-home-not-paid.hbs',
    smtpType: 'recovery',
    buildData: (lead) => ({
      name: lead.customer.name,
      SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
      SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
      company_name_show: process.env.NBFC_NAME_SHOW,
    }),
  },
  creditReminderMailSend: {
    subject: `Credit Reminder ${process.env.COMPANY_NAME}`,
    template: 'credit-reminder.hbs',
    smtpType: 'recovery',
    buildData: (lead) => {
      const approval = lead.approvals?.[0] || {};
      const adminFee = Number(approval.adminFee || 0);
      const loanAmt = Number(approval.loanAmtApproved || 0);
      const roi = Number(approval.roi || 0);
      const tenure = Number(approval.tenure || 0);

      const gstAmount = (adminFee * 18) / 100;

      const interestAmount = (loanAmt * roi * tenure) / 100;

      const netDisbursedAmount = loanAmt - (adminFee + Math.round(gstAmount));

      const repaymentAmount = loanAmt + Math.round(interestAmount);
      const repayDate = approval.repayDate
        ? new Date(approval.repayDate).toISOString().split('T')[0]
        : null;

      return {
        name: lead.customer.name,
        SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
        SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
        company_name_show: process.env.NBFC_NAME_SHOW,

        disbursalAmount: netDisbursedAmount,
        disbursalDate: lead.loan.disbursalDate,

        repayDate: repayDate,
        repayAmount: repaymentAmount,
        loanNo: lead.loan.loanNo,

        paymentLink: `${process.env.LOS_SERVER_NAME}/repayment`,
      };
    },
  },

  'loan-close': {
    subject: `No Dues Certificate  ${process.env.COMPANY_NAME}`,
    template: 'loan-close.hbs',
    smtpType: 'info',
    buildData: (lead) => {
      const approval = lead.approvals?.[0] || {};
      const adminFee = Number(approval.adminFee || 0);
      const loanAmt = Number(approval.loanAmtApproved || 0);
      const roi = Number(approval.roi || 0);
      const tenure = Number(approval.tenure || 0);

      const gstAmount = (adminFee * 18) / 100;

      const interestAmount = (loanAmt * roi * tenure) / 100;

      const netDisbursedAmount = loanAmt;

      const repaymentAmount = loanAmt + Math.round(interestAmount);
      const repayDate = approval.repayDate
        ? new Date(approval.repayDate).toISOString().split('T')[0]
        : null;

      const lastCollection = lead.collections?.[lead.collections.length - 1];

      const collectedDate = lastCollection?.createdDate
        ? new Date(lastCollection.createdDate).toISOString().split('T')[0]
        : null;

      return {
        name: lead.customer.name,
        SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
        SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
        company_name_show: process.env.NBFC_NAME_SHOW,
        formattedDate: new Date().toISOString().split('T')[0],
        loanNo: lead?.loan?.loanNo || lead?.creditImproveLoan?.loanNo,
        customerName: lead.customer.name,
        disbursalAmount: netDisbursedAmount,
        company_name: process.env.COMPANY_NAME,
        disbursalDate: lead?.loan?.disbursalDate || lead?.creditImproveLoan?.disbursalDate,
        collectedDate: collectedDate,
      };
    },
  },

  'settle-letter': {
    subject: `Settlement Letter  ${process.env.COMPANY_NAME}`,
    template: 'settelment-letter.hbs',
    smtpType: 'credit',
    buildData: (lead) => {
      const totalCollectedAmount = lead.collections?.reduce(
        (sum, c) => sum + Number(c.collectedAmount || 0),
        0,
      );

      const lastCollection = lead.collections?.[lead.collections.length - 1];

      const settlementDate = lastCollection?.createdDate
        ? new Date(lastCollection.createdDate).toISOString().split('T')[0]
        : null;

      const loan = lead.loan.loanNo

      return {
        name: lead.customer.name,
        SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
        SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
        nbfc_name_show: process.env.NBFC_NAME_SHOW,
        currentDate: new Date().toISOString().split('T')[0],
        customerName: lead.customer.name,
        loanAmtApproved: lead.approvals[0].loanAmtApproved,
        disbursalDate: lead.loan.disbursalDate,
        collectedAmount: totalCollectedAmount || 'NA',
        settlementDate: settlementDate,
        info_email_id: process.env.INFO_MAIL_ID,
        companyName: process.env.COMPANY_NAME,
        loannumber: loan
      };
    },
  },

  sameDayReminderMailSend: {
    subject: `Payday Reminder  ${process.env.COMPANY_NAME}`,
    template: 'today-reminder.hbs',
    smtpType: 'recovery',
    buildData: (lead) => {
      return {
        name: lead.customer.name,
        SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
        SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
        companyName: process.env.COMPANY_NAME,
      };
    },
  },

  one_day_before_due_date: {
    subject: `1 Days Before Reminder - ${process.env.COMPANY_NAME}`,
    template: 'one-day-before-due-date.hbs',
    smtpType: 'recovery',
    buildData: (lead) => {
      return {
        name: lead.customer.name,
        SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
        SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
        companyName: process.env.COMPANY_NAME,
      };
    },
  },

  four_days_before_due_date: {
    subject: `4 Days Before Reminder -${process.env.COMPANY_NAME}`,
    template: 'four-days-before-due-date.hbs',
    smtpType: 'recovery',
    buildData: (lead) => {
      const approval = lead.approvals?.[0] || {};

      const repayDate = approval.repayDate
        ? new Date(approval.repayDate).toISOString().split('T')[0]
        : null;
      return {
        name: lead.customer.name,
        SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
        SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
        company_name_show: process.env.COMPANY_NAME,
        repayDate: repayDate,
      };
    },
  },

  ten_days_before_due_date: {
    subject: `10 days before due date -${process.env.COMPANY_NAME}`,
    template: 'ten-days-before-due-date.hbs',
    smtpType: 'recovery',
    buildData: (lead) => {
      const approval = lead.approvals?.[0] || {};

      const repayDate = approval.repayDate
        ? new Date(approval.repayDate).toISOString().split('T')[0]
        : null;
      return {
        name: lead.customer.name,
        SERVER_DOMAIN_NAME_HEADER: process.env.SERVER_DOMAIN_NAME_HEADER,
        SERVER_DOMAIN_NAME_FOOTER: process.env.SERVER_DOMAIN_NAME_FOOTER,
        company_name_show: process.env.COMPANY_NAME,
        repayDate: repayDate,
      };
    },
  },

  //    ten_days_before_due_date: {
  //     subject: `10 days before due date -${process.env.COMPANY_NAME}`,
  //     template: 'ten-days-before-due-date.hbs',
  //     smtpType: 'recovery',
  //     buildData: (lead) => {
  //       const approval = lead.approvals?.[0] || {};

  //       const repayDate = approval.repayDate
  //         ? new Date(approval.repayDate).toISOString().split('T')[0]
  //         : null;
  //       return {
  //         name: lead.customer.name,
  //         server_domain_name: process.env.SERVER_DOMAIN_NAME,
  //         company_name_show: process.env.COMPANY_NAME,
  //         repayDate: repayDate,
  //       };
  //     },
  //   },
};
