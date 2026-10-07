export type BureauType = 'cibil' | 'crif' | 'experian' | 'equifax' | 'none';

export interface BureauConfig {
  enabled: boolean;
  environment: 'dev' | 'prod' | 'staging';
  bureau: BureauType;
  softPull: boolean;
  hardPull: boolean;
  isAnalysis: boolean;
}

type BureauConfigMap = Record<string, BureauConfig>;

export const bureauConfig: BureauConfigMap = {
  localhost: {
    enabled: true,
    environment: 'prod',
    bureau: 'crif',
    softPull: true,
    hardPull: false,
    isAnalysis: false,
  },
  'lms.speedoloan.com': {
    enabled: true,
    environment: 'prod',
    bureau: 'equifax',
    softPull: false,
    hardPull: true,
    isAnalysis: false,
  },

  'lms.rupyalelo.com': {
    enabled: true,
    environment: 'prod',
    bureau: 'equifax',
    softPull: false,
    hardPull: true,
    isAnalysis: false,
  },
  'lms.shreeloan.com': {
    enabled: true,
    environment: 'prod',
    bureau: 'equifax',
    softPull: false,
    hardPull: true,
    isAnalysis: false,
  },





  // 'loanapply.5minutesloan.com': {
  //   enabled: false,
  //   environment: 'prod',
  //   bureau: 'crif',
  //   softPull: false,
  //   hardPull: true,
  //   isAnalysis: false,
  // },








  'lms.cashmysalary.com': {
    enabled: true,
    environment: 'prod',
    bureau: 'equifax',
    softPull: false,
    hardPull: true,
    isAnalysis: false,
  },




  'lms.jetfund.in': {
    enabled: true,
    environment: 'prod',
    bureau: 'crif',
    softPull: true,
    hardPull: false,
    isAnalysis: false,
  },
};
