import { ConfigService } from '@nestjs/config';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../auth/auth.service';
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

import { SmsService } from '../sms/sms.service';
import { EMPLOYMENT_HISTORY_CONFIG } from '../../common/config/verification.config';

@Injectable()
export class VerificationService {
    constructor(
        private readonly tenantPrisma: TenantPrismaService,
        private configService: ConfigService,
        private readonly clsService: ClsService,
        private readonly httpService: HttpService,
        private readonly smsService: SmsService,
    ) { }

    private async getEmploymentHistoryProvider(req: Request) {
        const domain = await this.smsService.getCurrentDomain(req);

        console.log(domain, 'domain');

        return (
            EMPLOYMENT_HISTORY_CONFIG[domain] || {
                enable: false,
                provider: 'none',
            }
        );
    }

    async fetchEmploymentHistory(leadId: any, req: Request) {
        try {
            if (!leadId) {
                return {
                    success: false,
                    message: 'leadId is required',
                };
            }

            const providerConfig = await this.getEmploymentHistoryProvider(req);

            if (!providerConfig.enable) {
                return {
                    success: false,
                    statusCode: 400,
                    message: 'Employment verification is disabled for this domain',
                };
            }

            const lead = await this.tenantPrisma.client.leads.findUnique({
                where: {
                    leadID: Number(leadId),
                },
                include: {
                    customer: {
                        select: {
                            pancard: true,
                            mobile: true,
                        },
                    },
                    employmentHistory: true,
                },
            });

            if (!lead) {
                return {
                    success: false,
                    message: 'Lead not found',
                };
            }

            const employmentHistory = lead.employmentHistory || [];


            if (employmentHistory.length === 0) {
                let uanResponse: any;



                switch (providerConfig.provider) {
                    case 'ongrid':
                        uanResponse = await this.fetchUANFromPANOnGrid(lead);
                        break;

                    case 'Unifers':
                        uanResponse = await this.fetchUANFromPANUnifers(lead);
                        break;

                    default:
                        return {
                            success: false,
                            message: 'Provider not configured',
                        };
                }

                if (!uanResponse.status) {
                    return {
                        success: false,
                        statusCode: 200,
                        message: uanResponse.message,
                    };
                }


                const UAN =
                    uanResponse.data?.data?.uan_list?.[0] ||
                    uanResponse.data?.uanNumber ||
                    null;

                if (!UAN) {
                    return {
                        success: false,
                        statusCode: 200,
                        message: 'UAN not found',
                    };
                }

                let employmentResponse: any;


                switch (providerConfig.provider) {
                    case 'ongrid':
                        employmentResponse =
                            await this.fetchEmploymentHistoryByUANOnGrid(UAN);
                        break;

                    case 'Unifers':
                        employmentResponse =
                            await this.fetchEmploymentHistoryByUANUnifers(UAN);
                        break;

                    default:
                        return {
                            success: false,
                            message: 'Provider not configured',
                        };
                }


                const created =
                    await this.tenantPrisma.client.employment_history.create({
                        data: {
                            leadID: Number(lead.leadID),
                            customerID: lead.customerID,
                            uan: UAN,
                            employmentData:
                                employmentResponse ||
                                null,
                            status: employmentResponse.status ? 'success' : 'failed',
                        } as any,
                    });

                return {
                    statusCode: 200,
                    success: true,
                    message: 'Employment history fetched successfully',
                    provider: providerConfig.provider,
                    data: created,
                    UAN,
                };
            }

            const needFetch = employmentHistory.filter(
                (item) =>
                    item.uan &&
                    (!item.employmentData ||
                        Object.keys(item.employmentData).length === 0),
            );




            if (needFetch.length > 0) {
                const uan: any = needFetch[0].uan;

                let employmentResponse: any;

                switch (providerConfig.provider) {
                    case 'ongrid':
                        employmentResponse =
                            await this.fetchEmploymentHistoryByUANOnGrid(uan);
                        break;

                    case 'Unifers':
                        employmentResponse =
                            await this.fetchEmploymentHistoryByUANUnifers(uan);
                        break;

                    default:
                        return {
                            success: false,
                            message: 'Provider not configured',
                        };
                }

                await this.tenantPrisma.client.employment_history.update({
                    where: {
                        id: needFetch[0].id,
                    },
                    data: {
                        employmentData:
                            employmentResponse?.data?.data ||
                            employmentResponse?.data ||
                            null,
                        status: employmentResponse.status ? 'success' : 'failed',
                    } as any,
                });

                return {
                    success: true,
                    statusCode: 200,
                    provider: providerConfig.provider,
                    message: 'Fetched missing employment history',
                    data: employmentResponse,
                };
            }

            return {
                success: true,
                statusCode: 200,
                provider: providerConfig.provider,
                message: 'Employment history already available',
                data: employmentHistory,
                UAN: employmentHistory[0]?.uan || null,
            };
        } catch (error) {


            return {
                success: false,
                statusCode: 500,
                message: 'Something went wrong',
            };
        }
    }

    async fetchUANFromPANOnGrid(lead: any) {
        try {
            const url = this.configService.get<string>(
                'FETCH_UAN_BY_PAN_API_URL',
                '',
            );
            const apiKey = this.configService.get<string>('ONGRID_API_KEY');

            const response = await this.httpService.axiosRef.post(
                url,
                {
                    pan_number: lead?.customer?.pancard,
                    consent: 'Y',
                },
                {
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'X-API-Key': apiKey,
                        'X-Auth-Type': 'API-Key',
                    },
                },
            );

            const data = response.data;



            if (!data) {
                return {
                    status: false,
                    message: 'Empty response from UAN API',
                };
            }

            const code = Number(data.code);

            switch (code) {
                case 1029:
                    return {
                        status: true,
                        message: 'UAN fetched successfully',
                        data: data.data || data,
                    };

                case 1030:
                    return {
                        status: false,
                        message: 'No UAN linked or invalid PAN',
                    };

                default:
                    return {
                        status: true,
                        message: 'Unexpected response from UAN API',
                        data: data,
                    };
            }
        } catch (error: any) {
            console.log(error);

            return {
                status: false,
                message:
                    error?.response?.data?.message ||
                    error?.response?.data ||
                    'Error fetching UAN',
            };
        }
    }

    async fetchEmploymentHistoryByUANOnGrid(uan: string) {
        try {
            console.log(uan, 'uan');

            const url = this.configService.get<string>(
                'FETCH_EMPLOYMENT_DETAILS_BY_UAN_API_URL',
                '',
            );
            const apiKey = this.configService.get<string>('ONGRID_API_KEY');

            const response = await this.httpService.axiosRef.post(
                url,
                {
                    uan: uan,
                    consent: 'Y',
                },
                {
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'X-API-Key': apiKey,
                        'X-Auth-Type': 'API-Key',
                    },
                },
            );

            const data = response.data;

            if (!data) {
                return {
                    status: false,
                    message: 'Empty response from Employment History API',
                };
            }

            const code = Number(data.code);

            switch (code) {
                case 1011:
                    return {
                        status: true,
                        message: 'Employment history fetched successfully',
                        data: data.data || data,
                    };

                case 1013:
                    return {
                        status: false,
                        message: 'No employment history found for this UAN',
                    };

                default:
                    return {
                        status: true,
                        message: 'Unexpected response from Employment History API',
                        data: data,
                    };
            }
        } catch (error: any) {
            return {
                status: false,
                message:
                    error?.response?.data?.message ||
                    error?.response?.data ||
                    'Error fetching employment history',
            };
        }
    }

    async fetchUANFromPANUnifers(lead) {
        try {
            const payload = {
                PAN_Number: String(lead?.customer?.pancard),
                Concent: 'Y',
                Concent_Text:
                    'We confirm and undertake that valid end-user consent has been obtained for fetching UAN DETAILS using PAN NUMBER, and that such consent remains active and unrevoked at the time of this request.',
            };

            const response = await this.httpService.axiosRef.post(
                `${process.env.FETCH_UAN_BY_PAN_API_URL}`,
                payload,
                {
                    headers: {
                        Authorization: `${process.env.CRIF_AUTH_TOKEN}`,
                    },
                },
            );

            if (response.data.error === false) {
                return {
                    status: true,
                    message: 'UAN fetched successfully',
                    data: response.data.data.errorMessage || "data",

                }
            }
            return {
                status: false,
                message: 'No UAN linked or invalid PAN',
            };


        } catch (err: any) {
            return {
                status: false,
                message:
                    err?.response?.data?.message ||
                    err?.response?.data ||
                    'Error fetching UAN',
            };
        }
    }

    async fetchEmploymentHistoryByUANUnifers(uan) {
        try {
            const payload = {
                UAN_Number: String(uan),
                Concent: 'Y',
                Concent_Text:
                    'We confirm and undertake that valid end-user consent has been obtained for fetching UAN HISTORY using UAN NUMBER, and that such consent remains active and unrevoked at the time of this request.',
            };


            const response = await this.httpService.axiosRef.post(
                `${process.env.FETCH_EMPLOYMENT_DETAILS_BY_UAN_API_URL}`,
                payload,
                {
                    headers: {
                        Authorization: `${process.env.CRIF_AUTH_TOKEN}`,
                    },
                },
            );



            if (response.data.error === false) {
                return {
                    status: true,
                    message: 'Employment history fetched successfully',
                    data: response.data.data.result || "data",

                }
            }
            return {
                status: false,
                message: 'No employment history found for this UAN',
            };


        } catch (err: any) {
            return {
                status: false,
                message:
                    err?.response?.data?.message ||
                    err?.response?.data ||
                    'Error fetching UAN',
            };

        }
    }

    async fetchPersonalProfile(leadId: any, req: Request) {
        try {
            if (!leadId) {
                return {
                    success: false,
                    message: 'leadId is required',
                };
            }

            const lead = await this.tenantPrisma.client.leads.findUnique({
                where: {
                    leadID: Number(leadId),
                },
                include: {
                    customer: {
                        select: {
                            firstName: true,
                            pancard: true,
                            email: true,
                            mobile: true,
                        },
                    },
                    profileInfo: true,
                },
            });

            if (!lead) {
                return {
                    success: false,
                    message: 'Lead not found',
                };
            }

            const profileInfo = lead.profileInfo;

            // ✅ Already array
            if (profileInfo.length > 0) {
                return {
                    statusCode: 200,
                    success: true,
                    message: 'Personal profile already present',
                    data: profileInfo, // already array
                };
            }

            const result: any = await this.personalProfileAPI(lead);

            if (result.status) {
                const storeData = {
                    leadID: Number(lead.leadID),
                    profileData: result.data.data || null,
                    customerID: lead.customerID,
                    status: 'success',
                };

                const storedData = await this.tenantPrisma.client.profile_info.create({
                    data: storeData,
                } as any);

                return {
                    statusCode: 200,
                    success: true,
                    message: 'Personal profile fetched successfully',
                    data: [storedData],
                };
            }

            return {
                statusCode: 400,
                success: false,
                message: 'Failed to fetch personal profile',
                data: [],
            };
        } catch (err: any) {
            return {
                statusCode: 500,
                success: false,
                message: err.message || 'Internal server error',
                data: [], // ✅ keep consistent
            };
        }
    }

    async personalProfileAPI(lead: any) {
        try {
            const url = this.configService.get<string>(
                'FETCH_PERSONAL_PROFILE_API_URL',
                '',
            );
            const apiKey = this.configService.get<string>('ONGRID_API_KEY');

            const response = await this.httpService.axiosRef.post(
                url,
                {
                    phone: Number(lead?.customer?.mobile),
                    first_name: lead?.customer?.firstName,
                    pan: lead?.customer?.pancard,
                    consent_text: 'I provide consent to process my information.',
                    consent: 'Y',
                },
                {
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'X-API-Key': apiKey,
                        'X-Auth-Type': 'API-Key',
                    },
                },
            );

            const data = response.data;

            if (!data) {
                return {
                    status: false,
                    message: 'Empty response from Personal Profile API',
                };
            }

            const code = Number(data.code);

            switch (code) {
                case 1000:
                    return {
                        status: true,
                        message: 'Fetched personal data.',
                        data: data.data || data,
                    };

                default:
                    return {
                        status: true,
                        message: 'Unexpected response from Personal Profile API',
                        data: data,
                    };
            }
        } catch (error: any) {
            return {
                status: false,
                message:
                    error?.response?.data?.message ||
                    error?.response?.data ||
                    'Error fetching personal profile',
            };
        }
    }
}
