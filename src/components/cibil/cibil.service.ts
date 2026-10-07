import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../auth/auth.service';
import { BureauConfig, bureauConfig } from '../../common/config/cibilConfig';
import {
  cibilResToJson,
  getAgeFromDOB,
  normalize,
  parseAadhaarAddress,
  toDMYFromISO,
  toYMDFromISO,
} from '../../utility/helper';
import { HttpService } from '@nestjs/axios';
import * as fs from 'fs';
import * as path from 'path';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';

@Injectable()
export class CibilService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private configService: ConfigService,
    private readonly clsService: ClsService,
    private readonly authService: AuthService,
    private readonly httpService: HttpService,
  ) { }

  async fetchCibil(leadId: string, req: Request) {


    try {
      const lead: any = await this.tenantPrisma.client.leads.findUnique({
        where: { leadID: Number(leadId) },
        include: {
          customer: {
            include: {
              addresses: true,
            },
          },
        },
      });


      if (!lead) {
        return { statusCode: 404, message: 'Lead not found' };
      }



      const domain = await this.getCurrentDomain(req);

      const cfg = bureauConfig[domain];

      if (!cfg) {
        return {
          statusCode: 500,
          success: false,
          message: `No bureau config available for domain -> ${domain}`,
        };
      }

      if (!cfg.enabled || cfg.bureau === 'none') {
        return null;
      }

      if (cfg.softPull) {
        const cibildata = await this.tenantPrisma.client.criffsoftpull.findUnique({
          where: { leadID: Number(lead.leadID) },
          select: { responsePayload: true, status: true },
        });




        if (cibildata?.status === "sucess") {
          return {
            statusCode: 200,
            success: true,
            message: 'Cibil Data Already present',
          };
        }
      }

      const cibildata = await this.tenantPrisma.client.cibildata.findFirst({
        where: { leadID: Number(lead.leadID) },
        select: { responsePayload: true },
      });

      console.log(cibildata, "cibildata");


      if (cibildata) {
        return {
          statusCode: 200,
          success: true,
          message: 'Cibil Data Already present',
        };
      }

      const bureauClient = await this.getBureauClient(domain, lead);
      return bureauClient;
    } catch (err: any) {
      console.error('Error in FetchCIbil', err);
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  async getCurrentDomain(req: Request) {
    try {
      const domain =
        req.headers['x-tenant-domain'] || req.headers['origin'] || 'unknown';

      return domain;
    } catch (err: any) {
      console.error('Error in FetchCIbilDOmain', err);
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  async getBureauClient(domain: string, lead: any) {
    try {
      const cfg = bureauConfig[domain];

      if (!cfg) {
        return {
          statusCode: 500,
          success: false,
          message: `No bureau config available for domain -> ${domain}`,
        };
      }

      if (!cfg.enabled || cfg.bureau === 'none') {
        return null;
      }

      switch (cfg.bureau) {
        case 'cibil':
        //   return new CibilClient(cfg);
        case 'crif':
          return await this.CrifClient(lead, cfg);
        case 'experian':
        //   return new ExperianClient(cfg);
        case 'equifax':
          return await this.EquifaxClient(lead, cfg);
        default:
          throw new Error('Unknown bureau type');
      }
    } catch (err: any) {
      console.error('Error in FetchCIbilDOmain', err);
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  //CRIF API
  async CrifClient(lead: any, cfg: BureauConfig) {
    if (cfg.enabled) {
      if (cfg.hardPull) {

        return await this.fetchCrifHardPullData(lead, cfg.isAnalysis);
      } else if (cfg.softPull) {

        return await this.fetchCrifSoftPullData(lead, cfg.isAnalysis);
      } else {

        return {
          statusCode: 500,
          success: false,
          message: 'not enabled',
        };
      }
    } else {
      return {
        statusCode: 500,
        success: false,
        message: 'CRIF Bureau not enabled',
      };
    }
  }

  async fetchCrifHardPullData(lead: any, isAnalysis: boolean) {
    try {


      const addressDetails = parseAadhaarAddress(
        lead?.customer?.addresses[lead?.customer?.addresses.length - 1]
          .kyc_current_add,
      );

      const apiMemberId = process.env.API_MEMBER_ID;
      const loan_amount = 50000;

      const formatDateYmdHis = (date: Date) => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return (
          date.getFullYear().toString() +
          pad(date.getMonth() + 1) +
          pad(date.getDate()) +
          pad(date.getHours()) +
          pad(date.getMinutes()) +
          pad(date.getSeconds())
        );
      };

      const formatDateDMYHis = (date: Date) => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return (
          pad(date.getHours()) +
          ':' +
          pad(date.getMinutes()) +
          ':' +
          pad(date.getSeconds())
        );
      };

      const now = new Date();

      const INQUIRY_UNIQUE_REF_NO =
        formatDateYmdHis(now) +
        apiMemberId +
        Math.floor(Math.random() * 900 + 100);

      const CREDT_RPT_TRN_ID =
        'BLUAT' + formatDateYmdHis(now) + Math.floor(Math.random() * 900 + 100);

      const APPLICATION_DATETIME = formatDateDMYHis(now);
      const LOAN_AMOUNT = Math.round(loan_amount);
      const today = new Date();

      const cibilPayload = {
        'REQUEST-FILE': {
          'HEADER-SEGMENT': {
            'PRODUCT-TYPE': 'CIR PRO V2',
            'PRODUCT-VER': '2.0',
            'USER-ID': process.env.API_USER_ID,
            'USER-PWD': process.env.API_PASSWORD,
            'REQ-MBR': '',
            'INQ-DT-TM': today.toLocaleDateString('en-GB').replace(/\//g, '-'),
            'REQ-VOL-TYPE': 'C04',
            'REQ-ACTN-TYPE': 'AT01',
            'AUTH-FLG': 'Y',
            'AUTH-TITLE': 'USER',
            'RES-FRMT': 'html',
            'MEMBER-PREF-OVERRIDE': 'N',
            'RES-FRMT-EMBD': 'Y',
            'LOS-NAME': 'INHOUSE',
            'LOS-VENDOR': '',
            'LOS-VERSION': '',
            'REQ-SERVICES-TYPE': 'CIR',
          },
          INQUIRY: {
            'APPLICANT-SEGMENT': {
              'APPLICANT-ID': `LEAD-${lead.leadID}`,
              'FIRST-NAME': lead?.customer?.firstName || '',
              'MIDDLE-NAME': '',
              'LAST-NAME': lead?.customer?.lastName || '.',
              DOB: {
                'DOB-DT': toDMYFromISO(lead?.customer?.dob),
                AGE: getAgeFromDOB(lead?.customer?.dob).toString(),
                'AGE-AS-ON': getAgeFromDOB(lead?.customer?.dob).toString(),
              },
              RELATIONS: [
                {
                  TYPE: 'K01',
                  VALUE: lead?.customer?.fatherName
                    ? lead?.customer?.fatherName
                    : '',
                },
              ],
              IDS: [
                {
                  TYPE: 'ID07',
                  VALUE: lead?.customer?.pancard,
                },
              ],
              ADDRESSES: [
                {
                  TYPE: 'D05',
                  'ADDRESS-TEXT':
                    lead?.customer?.addresses?.length > 0
                      ? lead?.customer?.addresses[
                        lead?.customer?.addresses.length - 1
                      ].kyc_current_add
                      : 'G2/9a budh vihar phase-1,Gautam Buddha Nagar,Uttar Pradesh,201301',
                  CITY:
                    lead?.customer?.addresses?.length > 0
                      ? addressDetails.city
                      : 'Gautam Buddha Nagar',
                  STATE:
                    lead?.customer?.addresses?.length > 0
                      ? addressDetails.state
                      : 'UP',
                  LOCALITY: '',
                  PIN: addressDetails.pin || '201301',
                  COUNTRY: 'INDIA',
                },
              ],

              PHONES: [
                {
                  TYPE: 'P04',
                  VALUE: String(lead?.customer?.mobile),
                },
              ],
              EMAILS: [
                {
                  EMAIL: lead?.customer?.email ?? '',
                },
              ],
              'ACCOUNT-NUMBER': '',
            },
            'APPLICATION-SEGMENT': {
              'INQUIRY-UNIQUE-REF-NO': INQUIRY_UNIQUE_REF_NO,
              'CREDIT-RPT-ID': CREDT_RPT_TRN_ID,
              'CREDIT-RPT-TRN-DT-TM': APPLICATION_DATETIME,
              'CREDIT-INQ-PURPS-TYPE': 'CP06',
              'CREDIT-INQUIRY-STAGE': 'PRE-DISB',
              'CLIENT-CONTRIBUTOR-ID': 'MFI00',
              'BRANCH-ID': '',
              'APPLICATION-ID': `LEAD-${lead.leadID}`,
              'ACNT-OPEN-DT': '',
              'LOAN-AMT': LOAN_AMOUNT.toString(),
              LTV: '12',
              TERM: '24',
              'LOAN-TYPE': 'A01',
              'LOAN-TYPE-DESC': '',
            },
          },
        },
      };

      let cibilResponseData;
      let cibilStatus = 'success';

      try {
        const cibilResponse = await this.httpService.axiosRef.post(
          'https://hub.crifhighmark.com/Inquiry/doGet.serviceJson/CIRProServiceSynchJson',
          cibilPayload,
          {
            headers: {
              userId: process.env.API_USER_ID,
              password: process.env.API_PASSWORD,
              'CUSTOMER-ID': process.env.API_MEMBER_ID,
              'PRODUCT-TYPE': 'CIR PRO V2',
              'PRODUCT-VER': '2.0',
              'REQ-VOL-TYPE': 'C04',
              'Content-Type': 'application/json',
              Cookie:
                'JSESSIONID=ix-eYzn8-tb2JCNqh0vKsyUSV3YGLbE7rm3S2WQ5ME6dGGR459LQ!-621591906',
            },
          },
        );

        cibilResponseData = cibilResponse.data;
      } catch (error: any) {
        console.error(
          '❌ CIBIL API error:',
          error.response?.data || error.message,
        );
        cibilStatus = 'failed';
        cibilResponseData = { error: error.response?.data || error.message };
      }

      let leadID = lead.leadID;

      if (isAnalysis) {
        const analyser_payload = cibilResToJson(cibilResponseData);

        let analyser_data;
        if (analyser_payload?.analyserData['CIR-REPORT-FILE']) {
          analyser_data = await this.httpService.axiosRef.post(
            `${process.env.ANALYSER_API_URL}/cibil/analyze`,
            {
              cibilJson: analyser_payload?.analyserData['CIR-REPORT-FILE'],
              PAN: lead?.customer?.pancard,
              BirthDate: toDMYFromISO(lead?.customer?.dob),
              Phone: Number(lead?.customer?.mobile),
              address:
                lead?.customer?.addresses[lead?.customer?.addresses.length - 1]
                  .kyc_current_add,
            },
          );
        }

        await this.tenantPrisma.client.cibildata.create({
          data: {
            leadID,
            requestPayload: cibilPayload,
            responsePayload: cibilResponseData,
            analyser_data: analyser_data?.data,
            status: cibilStatus,
          } as any,
        });

        return { cibilStatus, analyser_data: analyser_data?.data };
      } else {
        await this.tenantPrisma.client.cibildata.create({
          data: {
            leadID,
            requestPayload: cibilPayload,
            responsePayload: cibilResponseData,
            analyser_data: {},
            status: cibilStatus,
          },
        });
        return { cibilStatus };
      }
    } catch (err: any) {

      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  async fetchCrifSoftPullData(lead: any, isAnalysis: boolean) {
    try {

      // const pincode = normalize(lead?.customer?.addresses?.length > 0
      //   ? lead?.customer?.addresses[lead?.customer?.addresses.length - 1].pincode
      //   : '201301')

      // const payload = {
      //   first_name: lead?.customer?.firstName || '',
      //   last_name: lead?.customer?.lastName || '.',
      //   mobile_number: String(lead?.customer?.mobile),
      //   pan_number: lead?.customer?.pancard,
      //   dob: toDMYFromISO(lead?.customer?.dob),
      //   city:
      //     lead?.customer?.addresses?.length > 0
      //       ? lead?.customer?.addresses[lead?.customer?.addresses.length - 1].city
      //       : 'Gautam Buddha Nagar',
      //   state:
      //     lead?.customer?.addresses?.length > 0
      //       ? lead?.customer?.addresses[lead?.customer?.addresses.length - 1].state
      //       : 'UP',
      //   pincode:
      //     String(pincode),

      //   gender: lead?.customer?.gender === 'Male' ? 'M' : 'F',
      //   address:
      //     lead?.customer?.addresses?.length > 0
      //       ? lead?.customer?.addresses[lead?.customer?.addresses.length - 1]
      //         .kyc_current_add
      //       : 'G2/9a budh vihar phase-1,Gautam Buddha Nagar,Uttar Pradesh,201301',


      // };

      const payload = {
        First_Name: lead?.customer?.firstName,
        Last_Name: lead?.customer?.lastName || lead?.customer?.firstName,
        Middle_Name: "",
        Mobile_Number: String(lead?.customer?.mobile),
        PAN_Number: lead?.customer?.pancard,
        DOB: toYMDFromISO(lead?.customer?.dob),
        Concent: "Y",
        Concent_Text: "We confirm and undertake that valid end-user consent has been obtained for fetching CRIF REPORT V2 using MOBILE NUMBER, and that such consent remains active and unrevoked at the time of this request."
      }

      let logEntry;

      // 1️⃣ Create Log (PENDING)
      logEntry = await this.tenantPrisma.client.cibil_fetch_logs.create({
        data: {
          leadID: lead.leadID,
          pan: lead?.customer?.pancard || '',
          bureau: 'CRIF_SOFT_PULL',
          request_payload: payload,
          status: 'PENDING',
        },
      });

      let crifData;
      let criffResponseData;
      let criffStatus;


      try {
        const crifDatas = await this.httpService.axiosRef.post(
          `${process.env.CRIF_AUTH_API_URL}`,
          payload,
          {
            headers: {
              Authorization: `${process.env.CRIF_AUTH_TOKEN}`,
            },
          },
        );

        if (crifDatas?.data.error === true) {
          return {
            statusCode: 400,
            success: false,
            message: 'CRIF Softpull Data Fetching ERROR',

          }
        }
        crifData = crifDatas?.data?.data?.result

      } catch (error: any) {
        console.error(
          '❌ CRIF API error:',
          error.response?.data || error.message,
        );

        criffStatus = 'failed';
        criffResponseData = {
          error: error.response?.data || error.message,
        };
        await this.tenantPrisma.client.cibil_fetch_logs.update({
          where: { id: logEntry.id },
          data: {
            status: 'FAILED',
            error_message: error.response?.data.statusCode || error.message,
          },
        });
      }


      let leadID = lead.leadID;


      if (isAnalysis) {
        const analyser_payload = cibilResToJson(crifData);

        let analyser_data;
        if (analyser_payload?.analyserData['CIR-REPORT-FILE']) {
          analyser_data = await this.httpService.axiosRef.post(
            `${process.env.ANALYSER_API_URL}/cibil/analyze`,
            {
              cibilJson: analyser_payload?.analyserData['CIR-REPORT-FILE'],
              PAN: lead?.customer?.pancard,
              BirthDate: toDMYFromISO(lead?.customer?.dob),
              Phone: Number(lead?.customer?.mobile),
              address:
                lead?.customer?.addresses[lead?.customer?.addresses.length - 1]
                  .kyc_current_add,
            },
          );
        }

        await this.tenantPrisma.client.cibildata.create({
          data: {
            leadID,
            requestPayload: payload,
            responsePayload: crifData,
            analyser_data: analyser_data?.data,
            status: crifData.data?.message_code,
          },
        });

        return {
          cibilStatus: crifData.data?.message_code,
          analyser_data: analyser_data?.data,
        };
      } else {
        await this.tenantPrisma.client.criffsoftpull.create({
          data: {
            customerID: Number(lead.customer.customerID),
            leadID: lead.leadID,
            requestPayload: payload,
            responsePayload: crifData,
            status: crifData?.status || 'success',
          },
        })

        await this.tenantPrisma.client.cibil_fetch_logs.update({
          where: { id: logEntry.id },
          data: {
            status: 'SUCCESS',
          },
        });
        return { cibilStatus: crifData.data?.message_code || "success" };
      }
    } catch (error: any) {
      return {
        statusCode: 500,
        success: false,
        message: error.message || 'Internal server error',
      };
    }
  }


  async EquifaxClient(lead: any, cfg: BureauConfig) {
    if (cfg.enabled) {
      if (cfg.hardPull) {

        return await this.fetchEquifaxHardPullData(lead, cfg.isAnalysis);
      } else if (cfg.softPull) {
        // return await this.fetchCrifSoftPullData(lead, cfg.isAnalysis);
      } else {
        return {
          statusCode: 500,
          success: false,
          message: 'not enabled',
        };
      }
    }
  }

  async fetchEquifaxHardPullData(lead: any, isAnalysis: boolean) {
    try {


      const addressDetails = parseAadhaarAddress(
        lead?.customer?.addresses[
          lead?.customer?.addresses.length - 1
        ]?.kyc_current_add,
      );

      const now = new Date();

      const formatDate = (date: Date) => {
        return date.toISOString().split('T')[0];
      };

      const equifaxPayload = {
        RequestHeader: {
          CustomerId: process.env.EQUIFAX_CUSTOMER_ID,
          UserId: process.env.EQUIFAX_USER_ID,
          Password: process.env.EQUIFAX_PASSWORD,
          MemberNumber: process.env.EQUIFAX_MEMBER_NUMBER,
          SecurityCode: process.env.EQUIFAX_SECURITY_CODE,
          ProductVersion: '4.8',
          CustRefField: `LEAD-${lead.leadID}`,
          ProductCode: ['CCR'],
        },
        RequestBody: {
          InquiryPurpose: '00',
          FirstName: lead?.customer?.firstName || '',
          MiddleName: '',
          LastName: lead?.customer?.lastName || '',
          DOB: formatDate(new Date(lead?.customer?.dob)),
          InquiryAddresses: [
            {
              seq: '1',
              AddressType: ['H'],
              AddressLine1:
                lead?.customer?.addresses?.length > 0
                  ? lead?.customer?.addresses[
                    lead?.customer?.addresses.length - 1
                  ].kyc_current_add
                  : '',
              State: addressDetails.state || 'UP',
              Postal: addressDetails.pin || '',
            },
          ],
          InquiryPhones: [
            {
              seq: '1',
              Number: String(lead?.customer?.mobile),
              PhoneType: ['M'],
            },
          ],
          IDDetails: [
            {
              seq: '1',
              IDType: 'T',
              IDValue: lead?.customer?.pancard || '',
              Source: 'Inquiry',
            },
          ],
          CustomFields: [
            {
              key: 'EmbeddedPdf',
              value: 'Y',
            },
          ],
          MFIDetails: {
            FamilyDetails: [
              {
                seq: '1',
                AdditionalNameType: 'K01',
                AdditionalName: lead?.customer?.fatherName || '',
              },
            ],
          },
        },
        Score: [
          {
            Type: 'ERS',
            Version: '4.0',
          },
        ],
      };

      let logEntry;

      // 1️⃣ Create Log (PENDING)
      logEntry = await this.tenantPrisma.client.cibil_fetch_logs.create({
        data: {
          leadID: lead.leadID,
          pan: lead?.customer?.pancard || '',
          bureau: 'EQUIFAX',
          request_payload: equifaxPayload,
          status: 'PENDING',
        },
      });

      let equifaxResponseData;
      let equifaxStatus;
      let equifaxPdfData;

      try {
        const equifaxResponse = await this.httpService.axiosRef.post(
          process.env.EQUIFAX_API_URL || '',
          equifaxPayload,
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );

        equifaxResponseData = equifaxResponse.data;

        const isSuccess =
          String(equifaxResponseData?.InquiryResponseHeader?.SuccessCode) === '1';

        equifaxStatus = isSuccess ? 'success' : 'failed';

        if (isSuccess && !equifaxResponseData?.EncodedPdf) {

          const retryResult = await this.getEquifaxPdfWithRetry(equifaxPayload);

          if (retryResult.pdf) {
            equifaxPdfData = retryResult.pdf;
            equifaxResponseData = retryResult.data;
          }
        } else if (isSuccess) {
          equifaxPdfData = equifaxResponseData?.EncodedPdf;
        }

        await this.tenantPrisma.client.cibil_fetch_logs.update({
          where: { id: logEntry.id },
          data: {
            status: isSuccess ? 'SUCCESS' : 'FAILED',
            error_message: isSuccess
              ? null
              : equifaxResponseData?.Error?.ErrorDesc || 'API Failed',
          },
        });

      } catch (error: any) {
        console.error(
          '❌ Equifax API error:',
          error.response?.data || error.message,
        );

        equifaxStatus = 'failed';
        equifaxResponseData = {
          error: error.response?.data || error.message,
        };
        await this.tenantPrisma.client.cibil_fetch_logs.update({
          where: { id: logEntry.id },
          data: {
            status: 'FAILED',
            error_message: error.response?.data || error.message,
          },
        });

      }

      const leadID = lead.leadID;


      const { EncodedPdf, ...responseWithoutPdf } = equifaxResponseData || {};


      let pdfPassword;

      if (equifaxPdfData) {
        const now = new Date();

        const month = now.toLocaleString('en-US', { month: 'short' });
        const formattedMonth =
          month.charAt(0).toUpperCase() + month.slice(1).toLowerCase();

        pdfPassword = `${process.env.EQUIFAX_CUSTOMER_ID}${formattedMonth}${now.getFullYear()}`;
      }


      let analyser_data = {};

      if (isAnalysis && equifaxStatus === 'success') {
        try {
          analyser_data = (
            await this.httpService.axiosRef.post(
              `${process.env.ANALYSER_API_URL}/equifax/analyze`,
              {
                equifaxJson: responseWithoutPdf, // ✅ clean JSON
                PAN: lead?.customer?.pancard,
                BirthDate: formatDate(new Date(lead?.customer?.dob)),
                Phone: Number(lead?.customer?.mobile),
                address:
                  lead?.customer?.addresses[
                    lead?.customer?.addresses.length - 1
                  ]?.kyc_current_add,
              },
            )
          )?.data;
        } catch (e: any) {
          console.log('⚠️ analyser failed', e.message);
        }
      }


      await this.tenantPrisma.client.cibildata.create({
        data: {
          leadID,
          requestPayload: equifaxPayload,
          responsePayload: responseWithoutPdf,
          response_pdf: equifaxPdfData,
          pdf_password: pdfPassword,
          analyser_data: analyser_data || {},
          status: equifaxStatus,
        },
      });


      const errorMessage =
        equifaxResponseData?.Error?.ErrorDesc || null;

      return {
        cibilStatus: equifaxStatus,
        ...(equifaxStatus === 'success'
          ? { analyser_data, pdfPassword }
          : { errorMessage }),
      };
    } catch (err: any) {


      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }



  async getEquifaxPdfWithRetry(payload: any, maxAttempts = 2) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await this.httpService.axiosRef.post(
        process.env.EQUIFAX_API_URL || '',
        payload,
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const data = response.data;

      const isSuccess =
        String(data?.InquiryResponseHeader?.SuccessCode) === '1';

      const pdf = data?.EncodedPdf;


      if (isSuccess && pdf) {
        return { data, pdf };
      }


      if (attempt < maxAttempts) {
        await new Promise(res => setTimeout(res, 2000));
      }
    }

    return { data: null, pdf: null };
  }


  async fetchCriffSoftpull(leadId: string, req: Request) {
    try {
      const lead: any = await this.tenantPrisma.client.leads.findUnique({
        where: { leadID: Number(leadId) },
        include: {
          customer: {
            include: {
              addresses: true,
            },
          },
          criffsoftpull: true,
        },
      });

      if (!lead) {
        return { statusCode: 404, message: 'Lead not found' };
      }


      if (lead?.criffsoftpull?.status === "success") {
        return {
          statusCode: 200,
          success: true,
          message: 'CRIF Softpull Data Already present',
          data: lead.criffsoftpull.responsePayload,
        };
      }

      try {

        // const pincode = normalize(lead?.customer?.addresses?.length > 0
        //   ? lead?.customer?.addresses[lead?.customer?.addresses.length - 1].pincode
        //   : '201301')

        // const payload = {
        //   first_name: lead?.customer?.firstName || '',
        //   last_name: lead?.customer?.lastName || '.',
        //   mobile_number: String(lead?.customer?.mobile),
        //   pan_number: lead?.customer?.pancard,
        //   dob: toDMYFromISO(lead?.customer?.dob),
        //   city:
        //     lead?.customer?.addresses?.length > 0
        //       ? lead?.customer?.addresses[lead?.customer?.addresses.length - 1].city
        //       : 'Gautam Buddha Nagar',
        //   state:
        //     lead?.customer?.addresses?.length > 0
        //       ? lead?.customer?.addresses[lead?.customer?.addresses.length - 1].state
        //       : 'UP',
        //   pincode:
        //     String(pincode),

        //   gender: lead?.customer?.gender === 'Male' ? 'M' : 'F',
        //   address:
        //     lead?.customer?.addresses?.length > 0
        //       ? lead?.customer?.addresses[lead?.customer?.addresses.length - 1]
        //         .kyc_current_add
        //       : 'G2/9a budh vihar phase-1,Gautam Buddha Nagar,Uttar Pradesh,201301',


        // }



        const payload = {
          First_Name: lead?.customer?.firstName,
          Last_Name: lead?.customer?.lastName || lead?.customer?.firstName,
          Middle_Name: "",
          Mobile_Number: String(lead?.customer?.mobile),
          PAN_Number: lead?.customer?.pancard,
          DOB: toYMDFromISO(lead?.customer?.dob),
          Concent: "Y",
          Concent_Text: "We confirm and undertake that valid end-user consent has been obtained for fetching CRIF REPORT V2 using MOBILE NUMBER, and that such consent remains active and unrevoked at the time of this request."
        }

        let crifData;

        const crifDatas = await this.httpService.axiosRef.post(
          `${process.env.CRIF_AUTH_API_URL}`,
          payload,
          {
            headers: {
              Authorization: `${process.env.CRIF_AUTH_TOKEN}`,
            },
          },
        );

        if (crifDatas?.data.error === true) {
          return {
            statusCode: 400,
            success: false,
            message: 'CRIF Softpull Data Fetching ERROR',

          }
        }
        crifData = crifDatas?.data?.data?.result


        if (crifData) {
          const storeData = await this.tenantPrisma.client.criffsoftpull.create({
            data: {
              customerID: Number(lead.customer.customerID),
              leadID: lead.leadID,
              requestPayload: payload,
              responsePayload: crifData,
              status: crifData?.status || 'success',
            },
          } as any);
        }



        return {
          statusCode: 200,
          success: true,
          message: 'CRIF Softpull Data Fetched successfully',
          data: crifData,
        };

      } catch (err: any) {
        console.error('Error preparing payload for CRIF soft pull', err);
        return {
          statusCode: 500,
          success: false,
          message: 'Error preparing payload for CRIF soft pull',
        };
      }
    } catch (err: any) {
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

}
