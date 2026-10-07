import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsPayload } from './sms.interface';
import * as messages from '../../../sms.json';
import * as messagesConfig from '../../../due_sms.json';
import { HttpService } from '@nestjs/axios';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';
import { SmsType } from '../../utility/enums';

@Injectable()
export class SmsService {
  private apiUrl: string;
  private apiKey: string;
  private senderId: string;
  private route: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {
    this.apiUrl = this.configService.get<string>('TRUSTSIGNAL_API_URL', '');
    this.apiKey = this.configService.get<string>('TRUSTSIGNAL_API_KEY', '');
    this.senderId = this.configService.get<string>('SMS_SENDER_ID', '');
    this.route = this.configService.get<string>('SMS_ROUTE', '');
  }

  async sendSms(
    templateKey: string,
    customerMobile: string,
    variables: Record<string, string>,
  ): Promise<any> {
    const template = messages[templateKey];
    if (!template) {
      return {
        msg: `Template '${templateKey}' not found in sms.messages.json`,
      };
    }

    // Replace variables in message text
    let message = template.message;
    for (const key of template.variables) {
      const value = variables[key] || '';
      message = message.replace(`{{${key}}}`, value);
    }

    const payload: SmsPayload = {
      sender_id: this.senderId,
      to: [Number(customerMobile)],
      route: this.route,
      template_id: template.template_id,
      message,
      variables,
    };

    const url = `${this.apiUrl}?api_key=${this.apiKey}`;

    try {
      const response = await this.httpService.axiosRef.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      return response.data;
    } catch (error: any) {
      console.error(
        'SMS sending failed:',
        error.response?.data || error.message,
      );
      throw new Error('Failed to send SMS');
    }
  }

  async getCurrentDomain(req: Request) {
    try {
      const domain =
        req.headers['x-tenant-domain'] || req.headers['origin'] || 'unknown';

      return domain;
    } catch (err: any) {
      console.error('Error in FetchDOmain', err);
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  //Fast2SMS
  async fastsendSms(name: string, portal_url, mobile) {


    const params = `authorization=${process.env.FAST2SMS_TOKEN}&sender_id=${process.env.FAST2SMS_SENDERID}&message=${process.env.FAST2SMS_MESSAGEID}&variables_values=${name}%7C${portal_url}&route=${process.env.FAST2SMS_ROUTE}&numbers=${mobile}`;

    const response = await this.httpService.axiosRef.get(
      `https://www.fast2sms.com/dev/bulkV2?${params}`,
    );


  }

  //truebulksms
  async truebulksms(name: string, portal_url, mobile) {
    const params = `username=${process.env.TRUEBULK_USERNAME}&password=${process.env.TRUEBULK_PASSWORD}&sender=${process.env.TRUEBULK_SENDER}&sendto=${mobile}&message=Dear ${name}, We're pleased to inform you that your loan application has been approved. To proceed and receive the loan amount, please complete a short video KYC through our portal: ${portal_url} Thank you,AYAAN FINSERVE INDIA PRIVATE LIMITED Team&PEID=${process.env.TRUEBULK_PEID}&templateid=${process.env.TRUEBULK_TEMPLATE_ID}`;

    await this.httpService.axiosRef.get(
      `http://truebulksms.biz/api.php?${params}`,
    );
  }

  //nimbusit

  async nimbussms(name: string, portal_url, mobile) {
    const params = `user=${process.env.NIMBUS_USER}&authkey=${process.env.NUMBUS_AUTHKEY}&sender=${process.env.NUMBUS_SENDER}&mobile=${mobile}&entityid=${process.env.NUMBUS_ENTITY_ID}&templateid=${process.env.NUMBUS_OTP_TEMPLATE_ID}&text=Dear ${name}, We're pleased to inform you that your loan application has been approved. To proceed and receive the loan amount, please complete a short video KYC through our portal: ${portal_url} Thank you, PAWANSUT HOLDINGS LIMITED Team&rpt=1`;
    await this.httpService.axiosRef.get(
      `http://nimbusit.net/api/pushsms?${params}`,
    );
  }

  //msg91
  async msg91sms(name: string, portal_url, mobile) { }

  // dovesoft SMS
  async dovesoftSms(portal_url: string, type: string, mobile: string, variables: Record<string, string>,) {
    try {

      const domain_templates = messagesConfig[portal_url];

      if (!domain_templates) {
        throw new Error(`Template config not found for domain: ${portal_url}`);
      }

      const template = domain_templates[type];

      if (!template) {
        throw new Error(`Template not found for domain: ${portal_url}`);
      }

      let message = template.message;

      template.variables.forEach((key: string) => {
        const value = variables[key] || '';
        message = message.replace('{#var#}', value);
      });

      const payload = {
        listsms: [
          {
            unicode: 1,
            sms: message,
            mobiles: mobile.startsWith('+91') ? mobile : `+91${mobile}`,
            senderid: template.senderid,
            entityid: template.entityid,
            tempid: template.template_id,
          },
        ],
      };

      const response = await this.httpService.axiosRef.post(
        'https://api.dovesoft.io/api/json/sendsms/',
        payload,
        {
          headers: {
            key: process.env.DOVESOFT_API_KEY,
            'content-type': 'application/json',
          },
        },
      );

      return response.data;
    } catch (error: any) {
      console.error('DoveSoft SMS failed:', error.response?.data || error.message,);
      throw new Error('Failed to send SMS via DoveSoft');
    }
  }

  async sendPaymentLinkToCustomers(payload: { leadIds: number[] }, req: Request) {
    try {

      const { leadIds } = payload;

      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        return {
          statusCode: 400,
          message: 'Lead IDs are required',
        };
      }

      const leads: any = await this.tenantPrisma.client.leads.findMany({
        where: {
          leadID: { in: leadIds },
          OR: [
            { status: "Disbursed" },
            { status: "Part_Payment" },
          ]
        },
        select: {
          customer: {
            select: {
              name: true,
              mobile: true
            }
          },
          customerID: true,
          loan: {
            select: {
              loanNo: true,
              disbursalAmount: true,
              disbursalDate: true
            }
          },
          approvals: {
            select: {
              repayDate: true,
              roi: true,
              loanAmtApproved: true,
              tenure: true
            },
            take: 1
          }
        },
      });

      if (!leads.length) {
        return {
          statusCode: 404,
          message: 'No customers found',
        };
      }

      const results: any = [];

      for (const lead of leads) {
        try {

          const domain = req.headers['x-tenant-domain'] || req.headers['host'];
          const portal_url = `${domain}`;
          // const portal_url = `lms.rupyalelo.com`;
          const { customer, approvals, loan } = lead;

          const approval = approvals?.[0];

          const repayDate = new Date(approval.repayDate);

          const expectedRepayAmount = approval.loanAmtApproved + approval.loanAmtApproved * (approval.roi / 100) * approval.tenure;


          const smsPayload = {
            templateKey: portal_url,
            customerMobile: `${customer.mobile}`,
            // customerMobile: `+918218299028`,
            variables: {
              name: customer.name,
              amount: expectedRepayAmount.toString(),
              loan_id: loan.loanNo,
              due_date: repayDate.toISOString().split('T')[0],
            },
          };

          // Send SMS
          await this.dovesoftSms(smsPayload.templateKey, SmsType.PAYMENT_LINK, smsPayload.customerMobile, smsPayload.variables);

          results.push({
            customerId: customer.id,
            status: 'SUCCESS',
          });
        } catch (err: any) {
          results.push({
            leadId: lead.customerID,
            status: 'FAILED',
            error: err.message,
          });
        }
      }

      return {
        statusCode: 200,
        message: 'Payment links processed',
        data: results,
      };
    } catch (error) {
      console.error('Error sending payment links:', error);
      return {
        statusCode: 500,
        message: 'Internal server error',
      };
    }
  }
}
