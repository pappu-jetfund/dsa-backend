export type MailProvider = 'ses' | 'microsoft' | 'google' | 'hostinger';

export function getProvider() {
  return process.env.MAIL_PROVIDER! as MailProvider;
}

export function getSmtpConfigs() {
  return {
    credit: {
      fromEmail: process.env.CREDIT_USERNAME,
      username: process.env.CREDIT_USERNAME,
      password: process.env.CREDIT_PASSWORD,
      sesReplyTo:
        process.env.CREDIT_REPLY?.split(',').map((e) => e.trim()) || [],
    },

    loan: {
      fromEmail: process.env.LOAN_USERNAME,
      username: process.env.LOAN_USERNAME,
      password: process.env.LOAN_PASSWORD,
      sesReplyTo: process.env.LOAN_REPLY?.split(',').map((e) => e.trim()) || [],
    },

    info: {
      fromEmail: process.env.INFO_USERNAME,
      username: process.env.INFO_USERNAME,
      password: process.env.INFO_PASSWORD,
      sesReplyTo: process.env.INFO_REPLY?.split(',').map((e) => e.trim()) || [],
    },

    recovery: {
      fromEmail: process.env.RECOVERY_USERNAME,
      username: process.env.RECOVERY_USERNAME,
      password: process.env.RECOVERY_PASSWORD,
      sesReplyTo:
        process.env.RECOVERY_REPLY?.split(',').map((e) => e.trim()) || [],
    },
  };
}

export function getSesConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SES_SECURE === 'true',
    username: process.env.SES_SMTP_USER,
    password: process.env.SES_SMTP_PASS,
  };
}

export function getProviderHostConfig() {
  const provider = getProvider();

  if (provider === 'google') {
    return {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
    };
  }

  if (provider === 'microsoft') {
    return {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
    };
  }

  return null; // SES handled separately
}
