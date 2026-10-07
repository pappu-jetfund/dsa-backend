import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../auth/auth.service';
import { HttpService } from '@nestjs/axios';
import { v4 as uuidv4 } from 'uuid';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';
import { SmsService } from '../sms/sms.service';
import { DOMAIN_AA_CONFIG } from '../../common/config/accountAggregator.config';
import { randomBytes } from 'crypto';

@Injectable()
export class AccountService {
  constructor(
    private readonly httpService: HttpService,
    private readonly tenantPrisma: TenantPrismaService,
    private configService: ConfigService,
    private readonly clsService: ClsService,
    private readonly authService: AuthService,
    private readonly smsService: SmsService,
  ) { }

  async fetchBankBalance(leadId: any, body: any) {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const alreadyFetched =
        await this.tenantPrisma.client.balance_history.findFirst({
          where: {
            leadID: Number(leadId),
            balance_date: {
              gte: todayStart,
              lte: todayEnd,
            },
          },
          select: { id: true, responsePayload: true },
        });

      if (alreadyFetched) {
        return {
          success: false,
          message: 'You have already fetched balance today',
          data: alreadyFetched,
        };
      }

      const accountAggregator =
        await this.tenantPrisma.client.account_agg.findFirst({
          where: { mobileNumber: body.mobileNumber, consentStatus: 'ACTIVE' },
          select: {
            consentId: true,
            customerId: true,
            clienttrnxid: true,
          },
        });

      if (!accountAggregator) {
        return {
          success: false,
          message: 'There is no Active Consent Data Found',
        };
      }

      const {
        consentId,
        customerId,
        clienttrnxid: transactionId,
      } = accountAggregator;

      const authData = await this.authenticationAggregator();
      if (!authData?.sucess) return authData;

      const periodicBody = {
        token: authData.result.token,
        sessionId: authData.result.sessionId,
        consentId,
        transactionId,
      };

      const periodicData = await this.fetchPerodic(periodicBody);

      if (!periodicData?.sucess) return periodicData;

      // await new Promise((resolve) => setTimeout(resolve, 10_000)); // 10 sec
      await new Promise((resolve) => setTimeout(resolve, 15_000)); // 15 sec

      const consentData = await this.getConsentData({
        consentId,
        token: authData.result.token,
      });

      if (!consentData?.sucess) return consentData;

      const accounts =
        consentData?.result?.data
          ?.map((item) => {
            const account = item?.dataDetail?.jsonData?.Account;
            if (!account) return null;

            return {
              profile: account.Profile ?? null,
              balances: account.Summary ?? null,
              transactions: account.Transactions ?? null,
            };
          })
          .filter(Boolean) || [];

      if (accounts.length === 0) {
        return {
          success: false,
          message: 'No account data found in consent response',
        };
      }

      return await this.tenantPrisma.client.balance_history.create({
        data: {
          leadID: Number(leadId),
          customerID: Number(customerId),
          consentId: consentData?.result?.ConsentStatusNotification?.consentId,
          txnId: consentData?.result?.txnId,
          responsePayload: { accounts },
        },
      });
    } catch (err) {
      console.error('fetchBankBalance error:', err);
      throw err;
    }
  }

  async authenticationAggregator() {
    try {
      const fiuid = this.configService.get<string>('BANK_FIU_ID', '');
      const redirection_key = this.configService.get<string>(
        'BANK_REDIRECTION_KEY',
        '',
      );
      const userId = this.configService.get<string>('BANK_USER_ID', '');

      const apiUrl = this.configService.get<string>('BANK_AUTH_URL', '');

      const body = {
        fiuid,
        redirection_key,
        userId,
      };

      const response = await this.httpService.axiosRef.post(apiUrl, body, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status === 500) {
        return {
          sucess: false,
          msg: 'Authentication Unseccesfull',
        };
      }

      return {
        result: response.data,
        sucess: true,
      };
    } catch (err: any) {
      if (err.status === 500) {
        return {
          sucess: false,
          msg: 'Authentication Unseccesfull',
        };
      }
      return {
        sucess: false,
        msg: 'Authentication Unseccesfull',
      };
    }
  }

  async fetchPerodic(body) {
    try {
      const fiuid = this.configService.get<string>('BANK_FIU_ID', '');
      const perodicUrl = this.configService.get<string>(
        'BANK_PERODIC_API_URL',
        '',
      );
      let txnId = uuidv4();

      while (body.transactionId === txnId) {
        txnId = uuidv4();
      }
      const sessionId = body.sessionId;
      const consentId = body.consentId;

      const sendBody = {
        sessionId,
        txnId,
        consentId,
        fiuid,
      };

      const perodicData = await this.httpService.axiosRef.post(
        perodicUrl,
        sendBody,
        {
          headers: {
            Authorization: `Bearer ${body.token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return { result: perodicData.data, sucess: true };
    } catch (err) {
      return {
        sucess: false,
        msg: 'Error in Fetching PerodicData',
      };
    }
  }

  async redirectAA(body) {
    const clienttrnxid = crypto.randomUUID();

    const { mobile, customerID } = body;
    // console.log(body);

    const authData = await this.authenticationAggregator();
    if (!authData?.sucess) return authData;

    const token = authData.result.token;
    const sessionId = authData.result.sessionId;
    const redirectUrl = this.configService.get<string>(
      'FINDUIT_REDIRECT_URL',
      '',
    );
    const response = await this.httpService.axiosRef.post(
      redirectUrl,
      {
        clienttrnxid: clienttrnxid,
        fiuID: this.configService.get<string>('BANK_FIU_ID', ''),
        userId: this.configService.get<string>('BANK_USER_ID', ''),
        aaCustomerHandleId: `${mobile}@CAMSAA`,
        aaCustomerMobile: String(mobile),
        sessionId,
        useCaseId: this.configService.get<string>('FINDUIT_USE_CASE_ID', ''),
        // fipid: payload.bank,
        addfip: 'false',
        Integrated_trigger_sms_email: 'Y',
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const data: any = response.data;
    // console.log(data, 'banking service');

    if (data.statusCode === '200') {
      // console.log({
      //   mobileNumber: mobile,
      //   clienttrnxid: clienttrnxid,
      //   txnid: data.txnid,
      //   redirectionurl: data.redirectionurl,
      // });
      // First, try to find the record by mobileNumber
      // console.time("check time");
      const existingAgg = await this.tenantPrisma.client.account_agg.findFirst({
        where: {
          mobileNumber: String(mobile),
        },
        // select: {
        //   mobileNumber: true,
        //   id: true,
        // },
      });

      if (existingAgg) {
        await this.tenantPrisma.client.account_agg.update({
          where: {
            id: existingAgg?.id,
          },
          data: {
            customerId: customerID,
            clienttrnxid,
            txnid: data.txnid,
            redirectionurl: data.redirectionurl,
            consentStatus: 'PENDING',
          },
        });
      } else {
        await this.tenantPrisma.client.account_agg.create({
          data: {
            customerId: customerID,
            mobileNumber: String(mobile),
            clienttrnxid,
            txnid: data.txnid,
            redirectionurl: data.redirectionurl,
            consentStatus: 'PENDING',
          },
        });
      }
    }

    return data.redirectionurl;
  }

  async getConsentData(body) {
    try {
      const consentId = body.consentId;
      const fiuid = this.configService.get<string>('BANK_FIU_ID', '');

      const consentUrl = this.configService.get<string>(
        'BANK_CONSETDATA_API_URL',
        '',
      );

      const finalBody = {
        consentId,
        fiuid,
      };

      const consentData = await this.httpService.axiosRef.post(
        consentUrl,
        finalBody,
        {
          headers: {
            Authorization: `Bearer ${body.token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return { result: consentData.data, sucess: true };
    } catch (err) {
      return {
        sucess: false,
        msg: 'Error in Fetching ConsentData',
      };
    }
  }

  // async getConsentDataStatus(body) {}

  async getBalanceHistory(leadId) {
    try {
      const balance = await this.tenantPrisma.client.balance_history.findMany({
        where: { leadID: Number(leadId) },
      });

      if (balance.length === 0) {
        return {
          sucess: true,
          msg: 'There is no balance check for this lead',
        };
      }

      return {
        msg: 'Balance data Get Sucessfully',
        sucess: true,
        result: balance,
      };
    } catch (err) {
      return {
        sucess: false,
        msg: 'Error in Get balance Histroy',
      };
    }
  }

  async getDateRange() {
    const today = new Date();

    const toDate = new Date(today);

    const fromDate = new Date(today);
    fromDate.setFullYear(fromDate.getFullYear() - 1);

    const formatDate = (date: Date): string => {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();

      return `${day}-${month}-${year}`;
    };

    return {
      from_date: formatDate(fromDate),
      to_date: formatDate(toDate),
    };
  }

  async generateUniqueReference() {
    while (true) {
      // Generate a random 12-character string
      const id = randomBytes(8)
        .toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 12);

      // Check if it already exists
      const exists = await this.tenantPrisma.client.account_agg.findFirst({
        where: {
          clienttrnxid: id,
        },
        select: {
          clienttrnxid: true,
        },
      });

      if (!exists) {
        return id;
      }
    }
  }
  async redirectToFinduit(leadId, req: Request) {
    try {


      const domain = await this.smsService.getCurrentDomain(req);
      const cfg = DOMAIN_AA_CONFIG[domain];

      if (!cfg) {
        return {
          success: false,
          message: `Aggregator config  not available for domain -> ${domain}`,
        };
      }

      if (!cfg.sms) {
        return {
          success: true,
          message: `SMS sending config  not Active for domain -> ${domain}`,
        };
      }


      const customer = await this.tenantPrisma.client.leads.findUnique({
        where: {
          leadID: Number(leadId),
        },
        select: {
          customer: {
            select: {
              mobile: true,
              customerID: true,
            },
          },
        },
      });

      // console.log(customer?.customer);

      const url = await this.redirectAA(customer?.customer);
      // console.log(url, 'FINDUIT_USE_CASE_ID');
      return {
        success: true,
        url,
        message: 'Redirect URL fetched successfully',
      };
    } catch (error: any) {
      console.error('redirectToFinduit Error:', error);
      return {
        message: 'Failed to fetch redirect URL',
        error,
      };
    }
  }
}
