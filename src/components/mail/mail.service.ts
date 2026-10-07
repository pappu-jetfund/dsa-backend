import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import {
  getProvider,
  getProviderHostConfig,
  getSesConfig,
  getSmtpConfigs,
} from './smtp-config';

type SmtpType = keyof ReturnType<typeof getSmtpConfigs>;

@Injectable()
export class MailService {
  private templatesDir = path.join(__dirname, 'templates');

  /**
   * Send an email dynamically using an .hbs template
   */

  async sendCustomMail(
    to: string,
    subject: string,
    smtpType: SmtpType,
    templateFile: string,
    templateData: Record<string, any>,
    attachments?: any[],
  ) {
    try {
      const provider = getProvider();
      const mailConfigs = getSmtpConfigs();
      const mailConfig = mailConfigs[smtpType];

      let transporter;
      let replyTo;
      if (provider === 'hostinger') {
        transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: 465,
          secure: true,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });



        replyTo = process.env.SMTP_USER;
      } else if (provider === 'ses') {
        // 🔵 SES: one username/password for all
        const sesConfig = getSesConfig();

        transporter = nodemailer.createTransport({
          host: sesConfig.host,
          port: sesConfig.port,
          secure: sesConfig.secure,
          auth: {
            user: sesConfig.username,
            pass: sesConfig.password,
          },
        });

        replyTo = mailConfig.sesReplyTo;
      } else {
        const hostConfig = getProviderHostConfig();

        if (!hostConfig) {
          return {
            msg: 'hostconfig Not Found',
          };
        }

        transporter = nodemailer.createTransport({
          host: hostConfig.host,
          port: hostConfig.port,
          secure: hostConfig.secure,
          auth: {
            user: mailConfig.username,
            pass: mailConfig.password,
          },
        });

        // No need special replyTo
        replyTo = mailConfig.fromEmail;
      }



      const templatePath = this.getTemplatePath(templateFile);

      if (!fs.existsSync(templatePath)) {
        return {
          status: false,
          message: `Template file ${templateFile} not found`,
        };
      }

      // ✅ Load and compile template
      const source = fs.readFileSync(templatePath, 'utf8');
      const compiledTemplate = Handlebars.compile(source);
      const html = compiledTemplate({
        ...templateData,
        company: process.env.COMPANY_NAME,
      });

      const info = await transporter.sendMail({
        from: `${process.env.COMPANY_NAME} <${mailConfig.fromEmail}>`,
        to,
        subject,
        html: html,
        replyTo: replyTo,
        attachments: attachments || [],
      });

      return {
        status: true,
        message: 'Mail sent successfully',
        sender_email: mailConfig.fromEmail,
        html: html,
      };

      // // ✅ Validate SMTP
      // const smtpConfigs = getSmtpConfigs();
      // const config = smtpConfigs[smtpType];
      // if (!config?.username || !config?.password) {
      //   return {
      //     status: false,
      //     message: `SMTP credentials missing for type: ${smtpType}`,
      //   };
      // }

      // const { host, port, secure, companyName } = getSmtpGlobals();

      // if (!host || !port) {
      //   return {
      //     status: false,
      //     message: 'Global SMTP configuration is missing',
      //   };
      // }

      // // ✅ Template path
      // const templatePath = this.getTemplatePath(templateFile);

      // if (!fs.existsSync(templatePath)) {
      //   return {
      //     status: false,
      //     message: `Template file ${templateFile} not found`,
      //   };
      // }

      // // ✅ Load and compile template
      // const source = fs.readFileSync(templatePath, 'utf8');
      // const compiledTemplate = Handlebars.compile(source);
      // const html = compiledTemplate({
      //   ...templateData,
      //   company: companyName, // always inject company name
      // });

      // // ✅ Create transporter
      // const transporter = nodemailer.createTransport({
      //   host: host,
      //   port: port,
      //   secure: false,
      //   auth: {
      //     user: config.username,
      //     pass: config.password,
      //   },
      // });

      // // ✅ Send mail
      // const fromEmail = (config as any)?.fromEmail || config.username;
      // await transporter.sendMail({
      //   from: `"${companyName}" <${fromEmail}>`,
      //   to,
      //   subject,
      //   html,
      // });

      // return {
      //   status: true,
      //   message: 'Mail sent successfully',
      //   sender_email: config.username,
      //   html: html,
      // };
    } catch (error: any) {
      return { status: false, message: `Mailer Error: ${error.message}` };
    }
  }

  private getTemplatePath(templateFile: string): string {
    const distPath = path.join(__dirname, 'templates', templateFile);
    const srcPath = path.join(
      process.cwd(),
      'src',
      'components',
      'mail',
      'templates',
      templateFile,
    );
    if (fs.existsSync(distPath)) return distPath;
    if (fs.existsSync(srcPath)) return srcPath;
    throw new Error(
      `Template file ${templateFile} not found in either dist or src`,
    );
  }
}
