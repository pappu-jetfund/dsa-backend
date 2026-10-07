export const penalConfig: Record<
  string,
  { interest: string; charges: number; disbursalDayCount: number }
> = {
  localhost: { interest: '1.5%', charges: 1000, disbursalDayCount: 0 },
  'lms.speedoloan.com': {
    interest: '1.5%',
    charges: 1000,
    disbursalDayCount: 0,
  },
  'rlms.speedoloan.com': {
    interest: '1.5%',
    charges: 1000,
    disbursalDayCount: 1,
  },
  'lms.rupyalelo.com': {
    interest: '1.5%',
    charges: 1000,
    disbursalDayCount: 1,
  },
  'lms.shreeloan.com': {
    interest: '1.5%',
    charges: 1000,
    disbursalDayCount: 1,
  },




  'lms.cashmysalary.com': {
    interest: '1.5%', charges: 1000, disbursalDayCount: 0
  },



  'lms.jetfund.in': { interest: '1.5%', charges: 1000, disbursalDayCount: 0 },
  'lms.rupyalelo.in': {
    interest: '1.5%',
    charges: 1000,
    disbursalDayCount: 0,
  },
};



export const creditpenalConfig: Record<
  string,
  { interest: string; charges: number; disbursalDayCount: number }
> = {
  localhost: { interest: '1.5%', charges: 1000, disbursalDayCount: 1 },
  'lms.speedoloan.com': {
    interest: '1.5%',
    charges: 100,
    disbursalDayCount: 1,
  },
  'rlms.speedoloan.com': {
    interest: '1.5%',
    charges: 100,
    disbursalDayCount: 1,
  },
  'lms.rupyalelo.com': {
    interest: '1.5%',
    charges: 100,
    disbursalDayCount: 1,
  },
  'lms.shreeloan.com': {
    interest: '1.5%',
    charges: 100,
    disbursalDayCount: 1,
  },
  'lms.salaryanytime.com': {
    interest: '2%',
    charges: 100,
    disbursalDayCount: 1,
  },
  'lms.wallstreetfinz.com': {
    interest: '1.5%',
    charges: 100,
    disbursalDayCount: 1,
  },
  'lms.rupee4u.com': { interest: '1.5%', charges: 100, disbursalDayCount: 1 },
  'lms.mudraboxx.in': {
    interest: '0.05%',
    charges: 100,
    disbursalDayCount: 1,
  },
  'lms.dhanly.in': {
    interest: '1.5%', charges: 100, disbursalDayCount: 1
  },
  'lms.cashmysalary.com': {
    interest: '1.5%', charges: 100, disbursalDayCount: 1
  },
  'lms.fundsontime.in': {
    interest: '1.5%', charges: 100, disbursalDayCount: 1
  },
  'lms.instantrupiya.com': {
    interest: '1.5%', charges: 100, disbursalDayCount: 1
  }
};
