import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { convertBigIntToString, normalize } from '../../utility/helper';
import { PrismaClient } from '@prisma/client/extension';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';
import { CibilService } from '../cibil/cibil.service';
import { dedupeConfig } from '../../common/config/dedupeconfig';
import { GlobalService } from '../../common/globalFunctions/global.service';

@Injectable()
export class DedupeService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private configService: ConfigService,
    private readonly clsService: ClsService,
    private readonly authService: AuthService,
    private readonly MailService: MailService,
    private readonly smsService: SmsService,
    private readonly CibilService: CibilService,
    private readonly globalService: GlobalService,

  ) { }

  async fetchTruefundPanDetails(pan: string, mobile: string,) {
    try {
      const response = await axios.post(
        `${process.env.TRUEFUND_API_URL}/dedupe/check`,
        {
          pan: pan,
          mobile: mobile
        },
        {
          headers: {
            "Content-Type": "application/json",
            'x-api-key': `${process.env.TRUEFUND_API_KEY}`,
          },
          // timeout: 5000,
        }
      );
      return response.data;
    } catch (error: any) {
      console.error(`PAN API failed for ${pan}`, error?.message);
      return null; // don't break flow
    }
  }

  async panLookup(body: any, req: Request) {
    const pancard = body.panNumber?.toUpperCase();
    let mobile = body.mobile;

    if (!pancard) {
      return {
        msg: 'pan is required',
        statusCode: 500,
      };
    }


    const domain = await this.CibilService.getCurrentDomain(req);

    const cfg = dedupeConfig[domain];


    if (!cfg) {
      return {
        success: false,
        message: `Dedupe config  not available for domain -> ${domain}`,
      };
    }

    if (!cfg.enabled) {
      return {
        success: true,
        message: `Dedupe config  not Active for domain -> ${domain}`,
      };
    }


    const result: Record<string, any[]> = {};

    for (const dbUrl of this.getAllTenantDbUrls()) {

      const prisma = PrismaService.getClient(dbUrl);

      const customers = await prisma.customer.findMany({
        where: { pancard },
        select: {
          customerID: true,
          name: true,
          dob: true,
          mobile: true,
          email: true,
          pancard: true,
          aadharNo: true,
          official_email: true,
          isBlocked: true,
          utmSource: true,
          addresses: true,
          leads: {
            select: {
              leadID: true,
              status: true,
              fbLeads: true,
              city: true,
              state: true,
              approvals: {
                select: {
                  loanAmtApproved: true,
                  status: true,
                  approvalID: true,
                  leadID: true,
                  createdDate: true,
                },
              },
              loan: {
                select: {
                  loanNo: true,
                  status: true,
                },
              },
              collections: {
                select: {
                  collectedAmount: true,
                  collectionStatus: true,
                },
              },
            },
          },
        },
      });

      if (customers.length) {
        const dbName = this.extractDbName(dbUrl);
        result[dbName] = customers;
      }
    }

    const firstTenant = Object.keys(result)[0];
    const firstCustomer = firstTenant ? result[firstTenant]?.[0] : null;

    mobile = firstCustomer?.mobile ? String(firstCustomer.mobile) : null;


    let truefundRes: any = [];

    console.log(cfg.isthirdPart, "cfg.isthirdPart");


    if (cfg.isthirdPart) {

      console.log("111111");

      truefundRes = await Promise.all([
        this.fetchTruefundPanDetails(pancard, mobile),
      ]);
    }

    console.log(truefundRes, "truefundRes");



    const baseCustomer = firstTenant ? result[firstTenant]?.[0] : null;
    const truefundCustomer = truefundRes.length > 0 && truefundRes?.lead_status !== "not_found" ? [{
      customerID: null,
      name: baseCustomer?.name || null,
      dob: baseCustomer?.dob || null,
      mobile: baseCustomer?.mobile || null,
      email: baseCustomer?.email || null,
      pancard: pancard,
      aadharNo: null,
      official_email: null,
      isBlocked: false,
      utmSource: "TRUEFUND",

      addresses: [],
      leads: [
        {
          leadID: null,
          status: truefundRes?.lead_status || null,
          fbLeads: null,
          city: null,
          state: null,
          approvals: [],
          loan: null,
          collections: [],
        },
      ],
    }]
      : [];

    return normalize({
      success: true,
      pancard,
      matchedTenants: Object.keys(result).length,
      data: {
        ...result,
        ...(truefundCustomer.length ? { truefund: truefundCustomer } : {}),
      },
    });
  }

  private getAllTenantDbUrls(): string[] {
    return Object.keys(process.env)
      .filter((key) => key.startsWith('TENANT') && key.endsWith('_DB'))
      .map((key) => process.env[key]!)
      .filter(Boolean);
  }

  private extractDbName(dbUrl: string): string {
    try {
      const url = new URL(dbUrl);
      return url.pathname.replace('/', '');
    } catch {
      return 'unknown';
    }
  }

  async dataMigration(body: { loanNo: string[] }) {
    try {
      console.log(body);
      const loanNo = body.loanNo;

      if (!Array.isArray(loanNo) || !loanNo.length) {
        return { success: false, message: 'loanNo array is required' };
      }

      const customer = await this.tenantPrisma.client.loan.findMany({
        where: { loanNo: { in: loanNo } },
        include: {
          lead: {
            include: {
              customer: {
                include: {
                  document: true,
                  accounts: true,
                  employer: true,
                  reference: true,
                  addresses: true,
                },
              },
              approvals: true,
              bankstatement: true,
              callHistories: true,
              callhistorylogs: true,
              collections: true,
              collectionFollowups: true,
              balanceHistory: true,
              eagreement: true,
              videokyc: true
              // Payout: {
              //   include: {
              //     webhookLogs: true,
              //     statusHistory: true
              //   }
              // },
            },
          },
        },
      });

      const leadIds = [
        ...new Set(customer.map((l) => l.lead?.leadID).filter(Boolean)),
      ];

      const customerIds = [
        ...new Set(
          customer.map((l) => l.lead?.customer?.customerID).filter(Boolean),
        ),
      ] as number[];

      const leadIdsnew = [
        ...new Set(
          customer.map((l) => l.lead?.leadID.toString()).filter(Boolean),
        ),
      ];

      const emandates = await this.tenantPrisma.client.emandates.findMany({
        where: {
          leadID: { in: leadIdsnew },
        },
      });

      const accountAgg = await this.tenantPrisma.client.account_agg.findMany({
        where: {
          customerId: { in: customerIds },
        },
      });

      const emailData = await this.tenantPrisma.client.notifications.findMany({
        where: {
          leadID: { in: leadIds },
        },
      });

      const enrichedLoans = customer.map((loan) => {
        const leadId = loan.lead?.leadID;
        const customerId = loan.lead?.customer?.customerID;

        return {
          ...loan,
          lead: {
            ...loan.lead,

            emandates: emandates.filter((e) => e.leadID === leadId.toString()),
            emailData: emailData.filter((c) => c.leadID === leadId),

            customer: {
              ...loan.lead.customer,
              accountAgg: accountAgg.filter((a) => a.customerId === customerId),
            },
          },
        };
      });




      // const dataDelete = await this.tenantPrisma.client.$transaction(
      //   async (tx) => {
      //     let count = 0;
      //     for (const loan of enrichedLoans) {
      //       console.timeLog(loan.loanNo);
      //       const {
      //         approvals,
      //         bankstatement,
      //         customer,
      //         callHistories,
      //         callhistorylogs,
      //         collections,
      //         emandates,
      //         emailData,
      //         collectionFollowups,
      //         // Payout,
      //         balanceHistory,
      //         eagreement,
      //         videokyc,
      //         ...lead
      //       } = loan.lead;





      //       if (emandates?.length) {
      //         for (const document of emandates) {
      //           const { id, ...docsRest } = document;

      //           await tx.emandates.delete({
      //             where: { id: id },
      //           });
      //         }
      //       }

      //       if (emailData?.length) {
      //         for (const document of emailData) {
      //           const { notificationID, ...docsRest } = document;

      //           await tx.notifications.delete({
      //             where: {
      //               notificationID: notificationID,
      //             },
      //           });
      //         }
      //       }

      //       if (collections?.length) {
      //         for (const document of collections) {
      //           const { collectionID, ...docsRest } = document;

      //           await tx.collection.delete({
      //             where: {
      //               collectionID: collectionID,
      //             },
      //           });
      //         }
      //       }

      //       if (collectionFollowups?.length) {
      //         for (const document of collectionFollowups) {
      //           const { reviewID, ...docRest } = document;

      //           await tx.collectionfollowup.delete({
      //             where: {
      //               reviewID: reviewID
      //             }
      //           })
      //         }
      //       }

      //       if (bankstatement?.length) {
      //         for (const document of bankstatement) {
      //           const { id, ...docsRest } = document;

      //           await tx.bankstatement.delete({
      //             where: {
      //               id: id,
      //             },
      //           });
      //         }
      //       }

      //       if (balanceHistory?.length) {
      //         for (const document of balanceHistory) {
      //           const { id, ...docsRest } = document;
      //           await tx.balance_history.delete({
      //             where: {
      //               id: id
      //             }
      //           })
      //         }
      //       }

      //       if (callhistorylogs?.length) {
      //         for (const document of callhistorylogs) {
      //           const { callHistoryID, ...docsRest } = document;

      //           await tx.callhistorylogs.delete({
      //             where: {
      //               callHistoryID: callHistoryID,
      //             },
      //           });
      //         }
      //       }

      //       await tx.loan.delete({
      //         where: {
      //           leadID: loan.leadID,
      //         },
      //       });

      //       await tx.eagreement.delete({
      //         where: {
      //           leadID: loan.leadID,
      //         },
      //       })

      //       await tx.videokyc.delete({
      //         where: {
      //           leadID: loan.leadID,
      //         },
      //       })

      //       // if (Payout?.webhookLogs?.length) {
      //       //   for (const document of Payout.webhookLogs) {
      //       //     console.log(document, "documentwebhookLogs");

      //       //     const { id, ...docsRest } = document;
      //       //     await tx.payoutWebhookLog.delete({
      //       //       where: {
      //       //         id: id
      //       //       }
      //       //     })
      //       //   }
      //       // }

      //       // if (Payout?.statusHistory?.length) {
      //       //   for (const document of Payout.statusHistory) {
      //       //     console.log(document, "documentstatusHistory");
      //       //     const { id, ...docsRest } = document;
      //       //     await tx.payoutStatusHistory.delete({
      //       //       where: {
      //       //         id: id
      //       //       }
      //       //     })
      //       //   }
      //       // }


      //       // if (Payout) {
      //       //   await tx.payout.delete({
      //       //     where: {
      //       //       id: Payout?.id,
      //       //     },
      //       //   });
      //       // }

      //       if (approvals?.length) {
      //         for (const document of approvals) {
      //           const { approvalID, ...docsRest } = document;
      //           await tx.approval.delete({
      //             where: { approvalID: approvalID },
      //           });
      //         }
      //       }

      //       console.log(loan.leadID, "loan.leadID");


      //       await tx.leads.delete({
      //         where: {
      //           leadID: Number(loan.leadID),
      //         },
      //       });

      //       console.timeEnd(loan.loanNo);
      //       count++;
      //       console.log(count);
      //     }
      //     return { success: true };
      //   },
      //   {
      //     timeout: 1800000, // 20 minutes
      //   },
      // );

      // return normalize({
      //   success: true,
      //   data: dataDelete,
      // });

      const targetPrisma = PrismaService.getClient(
        process.env.TARGET_DATABASE_URL!,
      );




      const data = await targetPrisma.$transaction(
        async (tx) => {
          let count = 0;
          for (const loan of enrichedLoans) {
            console.timeLog(loan.loanNo);
            const {
              approvals,
              bankstatement,
              customer,
              callHistories,
              callhistorylogs,
              collections,
              emandates,
              emailData,
              balanceHistory,
              eagreement,
              videokyc,
              collectionFollowups,
              ...lead
            } = loan.lead;
            const {
              document,
              accounts,
              employer,
              reference,
              accountAgg,
              addresses,
              ...customerD
            } = customer;

            const findCustomer = await tx.customer.findFirst({
              where: {
                pancard: customer.pancard,
              },
            });
            let newCustomerId: any;
            if (findCustomer) {
              newCustomerId = findCustomer.customerID;
            }

            const customerCreate = await tx.customer.create({
              data: {
                name: customer.name,
                firstName: customer.firstName,
                middlename: customer.middlename,
                lastName: customer.lastName,
                fatherName: customer.fatherName,
                gender: customer.gender,
                dob: customer.dob,
                mobile: customer.mobile,
                email: customer.email,
                pancard: customer.pancard,
                aadharNo: customer.aadharNo,
                password: customer.password,
                marrital: customer.marrital,
                profile: customer.profile,
                otp: customer.otp,
                isVerified: customer.isVerified,
                employeeType: customer.employeeType,
                createdDate: customer.createdDate,
                industry: customer.industry,
                designation: customer.designation,
                working_since: customer.working_since,
                salary_date: customer.salary_date,
                official_email: customer.official_email,
                education: customer.education,
                pan_cust_verified: customer.pan_cust_verified,
                dob_digit_match: customer.dob_digit_match,
                razorpay_cust_id: customer.razorpay_cust_id,
                reloaneligible: customer.reloaneligible,
                reloanremark: customer.reloanremark,
                fraudcheck: customer.fraudcheck,
                updatedAt: customer.updatedAt,
                customerappId: null,
                isBlocked: customer.isBlocked,
                utmSource: customer.utmSource,
                alternateMobile: customer.alternateMobile,
                current_address: customer.current_address,
                digioKid: customer.digioKid,
                digioMobileNumber: customer.digioMobileNumber,
                is_onboarded: customer.is_onboarded,
                last_login: customer.last_login,
                loanApplied: customer.loanApplied,
                permanent_address: customer.permanent_address,
                presalesassign: customer.presalesassign,
                companyName: customer.companyName,
                step: customer.step,
                razorpay_contact_id: customer.razorpay_contact_id,
              } as any,
            });

            newCustomerId = customerCreate.customerID;


            if (customer.document?.length) {
              for (const document of customer.document) {
                const { documentID, ...docsRest } = document;
                let docsData = {
                  ...docsRest,
                  customerID: newCustomerId,
                  customerappId: null,
                };

                const createDocument = await tx.document.create({
                  data: docsData,
                } as any);
              }
            }

            if (customer.accounts?.length) {
              const systemUserId = await this.globalService.getSystemUserId();

              for (const document of customer.accounts) {
                const { accountID, ...docsRest } = document;
                let accountsData = {
                  ...docsRest,
                  customerID: newCustomerId,
                  customerappId: null,
                  credatedBy: systemUserId,
                };

                const createDocument = await tx.customeraccount.create({
                  data: accountsData,
                } as any);
              }
            }

            if (customer.employer?.length) {
              for (const document of customer.employer) {
                const { employerID, ...docsRest } = document;
                let employerData = {
                  ...docsRest,
                  customerID: newCustomerId,
                  customerappId: null,
                  verifiedBy: 1,
                };

                const createDocument = await tx.employer.create({
                  data: employerData,
                } as any);
              }
            }

            if (customer.reference?.length) {
              const systemUserId = await this.globalService.getSystemUserId();

              for (const document of customer.reference) {
                const { referenceID, ...docsRest } = document;
                let referenceData = {
                  ...docsRest,
                  customerID: newCustomerId,
                  createdBy: systemUserId,
                };

                const createDocument = await tx.reference.create({
                  data: referenceData,
                } as any);
              }
            }
            if (customer.accountAgg?.length) {
              for (const document of customer.accountAgg) {
                const { id, ...docsRest } = document;
                let accountAggData = {
                  ...docsRest,
                  customerId: newCustomerId,
                  latest_bankstatement: null,
                };

                const createDocument = await tx.account_agg.create({
                  data: accountAggData,
                } as any);
              }
            }





            let newLeadId: any;

            const { leadID, ...leadData } = lead;


            const systemUserId = await this.globalService.getSystemUserId();

            let finaleadData = {
              ...leadData,
              customerID: newCustomerId,
              callAssign: systemUserId,
              creditAssign: systemUserId,
              collectionUID: systemUserId,
              sanctionalloUID: systemUserId,
            };
            const leadCreate = await tx.leads.create({
              data: finaleadData,
            } as any);

            newLeadId = leadCreate.leadID;

            if (approvals?.length) {
              const systemUserId = await this.globalService.getSystemUserId();

              for (const document of approvals) {
                const { approvalID, ...docsRest } = document;
                let approvalsData = {
                  ...docsRest,
                  customerID: newCustomerId,
                  leadID: newLeadId,
                  creditedBy: systemUserId,
                  disbursalaccountid: null,
                  sanctionalloUID: systemUserId,
                };

                const createDocument = await tx.approval.create({
                  data: approvalsData,
                } as any);
              }
            }

            if (bankstatement?.length) {
              const systemUserId = await this.globalService.getSystemUserId();

              for (const document of bankstatement) {
                const { id, ...docsRest } = document;
                let bankstatementData = {
                  ...docsRest,
                  customerID: newCustomerId,
                  leadID: newLeadId,
                  uploadBy: systemUserId,
                };

                const createDocument = await tx.bankstatement.create({
                  data: bankstatementData,
                } as any);
              }
            }

            if (callhistorylogs?.length) {
              const systemUserId = await this.globalService.getSystemUserId();

              for (const document of callhistorylogs) {
                const { callHistoryID, ...docsRest } = document;
                let callhistorylogsData = {
                  ...docsRest,
                  customerID: newCustomerId,
                  leadID: newLeadId,
                  calledBy: systemUserId,
                };

                const createDocument = await tx.callhistorylogs.create({
                  data: callhistorylogsData,
                } as any);
              }
            }

            if (collections?.length) {
              const systemUserId = await this.globalService.getSystemUserId();

              for (const document of collections) {
                const { collectionID, ...docsRest } = document;
                let collectionsData = {
                  ...docsRest,
                  customerID: newCustomerId.toString(),
                  leadID: newLeadId,
                  loanNo: loan.loanNo,
                  collectedBy: systemUserId,
                  collectionStatusby: systemUserId,
                };

                const createDocument = await tx.collection.create({
                  data: collectionsData,
                } as any);
              }
            }

            if (emandates?.length) {
              for (const document of emandates) {
                const { id, ...docsRest } = document;
                let emandatesData = {
                  ...docsRest,
                  customerID: newCustomerId.toString(),
                  leadID: newLeadId.toString(),
                };

                const createDocument = await tx.emandates.create({
                  data: emandatesData,
                } as any);
              }
            }

            if (emailData?.length) {
              for (const document of emailData) {
                const { notificationID, ...docsRest } = document;
                let emailData = {
                  ...docsRest,
                  customerID: newCustomerId,
                  leadID: newLeadId,
                };

                const createDocument = await tx.notifications.create({
                  data: emailData,
                } as any);
              }
            }

            if (collectionFollowups?.length) {
              const systemUserId = await this.globalService.getSystemUserId();

              for (const document of collectionFollowups) {
                const { reviewID, ...docRest } = document;
                let collectionFollowupsData = {
                  ...docRest,
                  customerID: Number(newCustomerId),
                  leadID: newLeadId,
                  loanNo: loan.loanNo,
                  createdBy: systemUserId,
                };

                const createDocument = await tx.collectionfollowup.create({
                  data: collectionFollowupsData,
                } as any);
              }
            }



            if (eagreement) {

              const { id, ...docsRest } = eagreement;
              let eagreementData = {
                ...docsRest,
                leadID: Number(newLeadId),
              };

              const createDocument = await tx.eagreement.create({
                data: eagreementData,
              } as any);

            }

            if (videokyc) {

              const { id, ...docsRest } = videokyc;
              let videokycData = {
                ...docsRest,
                leadID: Number(newLeadId),
              };

              const createDocument = await tx.videokyc.create({
                data: videokycData,
              } as any);

            }


            const loans = await tx.loan.create({
              data: {
                loanID: newLeadId,
                leadID: newLeadId,
                loanNo: loan.loanNo,
                customerID: newCustomerId,
                disbursalAmount: loan.disbursalAmount,
                disbursalDate: loan.disbursalDate,
                disbursalTime: loan.disbursalTime,
                disbursalRefrenceNo: loan.disbursalRefrenceNo,
                accountNo: loan.accountNo,
                accountType: loan.accountType,
                bankIfsc: loan.bankIfsc,
                bank: loan.bank,
                bankBranch: loan.bankBranch,
                chequeDetails: '',
                pdDate: loan.pdDate,
                pdDoneBy: loan.pdDoneBy,
                deduction: loan.deduction,
                remarks: loan.remarks,
                status: loan.status,
                rejReason: null,
                companyAccountNo: loan.companyAccountNo,
                ip: loan.ip,
                disbursedBy: systemUserId,
                createdDate: loan.createdDate,
                allocate_date: loan.allocate_date,
                allocated_by: null,
                acutalDisbursalAmount: loan.acutalDisbursalAmount,
                exported: loan.exported,
              },
            });
            console.timeEnd(loan.loanNo);
            count++;
            console.log(count);
          }

          return { success: true };
        },
        {
          timeout: 1800000, // 20 minutes
        },
      );

      return normalize({
        success: true,
        data: data,
      });
    } catch (err) {
      console.log(err);
    }
  }

  // async dataMigration(body: { pancard: string[] }) {
  //   try {
  //     console.log(body);
  //     const pancard = body.pancard;

  //     if (!Array.isArray(pancard) || !pancard.length) {
  //       return { success: false, message: 'pancard array is required' };
  //     }

  //     const customer = await this.tenantPrisma.client.customer.findMany({
  //       where: {
  //         pancard: { in: pancard },
  //       },
  //       include: {
  //         addresses: true,
  //       },
  //     });

  //     const targetPrisma = PrismaService.getClient(
  //       process.env.TARGET_DATABASE_URL!,
  //     );
  //     const data = await targetPrisma.$transaction(
  //       async (tx) => {
  //         let count = 0;
  //         for (const pan of customer) {
  //           console.log(count, 'count');

  //           const { addresses, ...customerD } = pan;

  //           const findCustomer = await tx.customer.findFirst({
  //             where: {
  //               pancard: customerD.pancard,
  //             },
  //             select: {
  //               customerID: true,
  //             },
  //           });

  //           if (!findCustomer) {
  //             console.log(`Customer not found for PAN ${customerD.pancard}`);
  //             continue;
  //           }
  //           const updatedAddresses = addresses.map((addr: any) => {
  //             const { addressID, customerID, ...rest } = addr;
  //             return {
  //               ...rest,
  //               customerID: findCustomer.customerID,
  //               customerappId: null,
  //             };
  //           });

  //           if (updatedAddresses.length > 0) {
  //             await tx.address.createMany({
  //               data: updatedAddresses,
  //             });
  //           }

  //           count++;
  //         }
  //         console.log(count);
  //         return { count };
  //       },
  //       {
  //         timeout: 1800000, // 20 minutes
  //       },
  //     );
  //   } catch (err) {
  //     console.log(err);
  //   }
  // }



  async handleFinEyeWebhook(body: any, clienttrnxid: string) {
    // const request_id = await this.generateRequestId(clienttrnxid || 'unknown');

    const startTime = Date.now();

    // const traceLog: any = {
    //   request_id,
    //   consent_id: body?.txn_id,
    //   clienttrnxid: clienttrnxid,
    //   api: 'pushDataWebhook',
    //   request_time: new Date().toISOString(),
    //   steps: [],
    //   status: 'PENDING',
    //   duration_ms: null,
    // };
    try {
      const { txn_id, status, result } = body;

      //      {
      //     "api_category": "Account Aggregator Suite",
      //     "api_name": "Fineye - Fetch Session Data",
      //     "datetime": "2026-07-02 14:31:59.294971",
      //     "message": "Success",
      //     "result": {
      //         "json": "https://fineye-aa-bucket.s3.ap-south-1.amazonaws.com/0f7d10f4-dd3e-4dfd-9b26-884639f64726/result.json?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIATTQT3QEA6RVEUZHP%2F20260702%2Fap-south-1%2Fs3%2Faws4_request&X-Amz-Date=20260702T143159Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=0cc76ecd9080936e23b3aface41ad4dd0164c58df5c7eb0efdd0884f613b6db5"
      //     },
      //     "status": "OKRES",
      //     "txn_id": "916175d2-5145-48b7-95a9-3a27bfbbefcd"
      // }

      // traceLog.steps.push({
      //   stage: 'WEBHOOK_RECEIVED',
      //   time: new Date().toISOString(),
      // });

      const agg = await this.tenantPrisma.client.account_agg.findFirst({
        where: { clienttrnxid: clienttrnxid },
      });

      if (!agg) {
        throw new NotFoundException('Account agg not found');
      }

      let uploadedFile: string | null = null;

      const rawTxns = await axios.get(result.json).then((res) => res.data);

      const transactions = Array.isArray(rawTxns)
        ? rawTxns
        : rawTxns && typeof rawTxns === 'object'
          ? [rawTxns]
          : [];

      if (!transactions.length) {
        // traceLog.steps.push({
        //   stage: 'TRANSACTION_NOT_FOUND',
        //   time: new Date().toISOString(),
        // });

        // const LOG_DIR = path.join(process.cwd(), 'AALOGS', 'webhook');

        // const date = new Date().toISOString().split('T')[0];

        // const dir = path.join(LOG_DIR, date);

        // if (!fs.existsSync(dir)) {
        //   fs.mkdirSync(dir, { recursive: true });
        // }

        // const filePath = path.join(dir, `${clienttrnxid}.json`);

        // await fs.promises.writeFile(filePath, JSON.stringify(body, null, 2));
      }
      // const holder = dataDetail?.jsonData?.Account?.Profile?.Holders?.Holder;

      let analyserResult: any = null;

      // if (transactions.length) {
      //   analyserResult = await this.analyser.callAnalyser(
      //     transactions,
      //     // holder,
      //     clienttxnid,
      //     traceLog,
      //   );
      // }

      const latestLead = await this.tenantPrisma.client.leads.findFirst({
        where: {
          customerID: Number(agg.customerId),
          status: {
            in: ['Document_Received', 'Approved', 'Approved_Process'],
          },
        },
        orderBy: {
          leadID: 'desc',
        },
      });

      const systemUserId = await this.globalService.getSystemUserId();


      const bankstatement = await this.tenantPrisma.client.bankstatement.create(
        {
          data: {
            customerID: Number(agg.customerId),
            leadID: latestLead?.leadID,
            // documentFile: uploadedFile,
            pushData: transactions[0] ?? {},
            uploadedDate: new Date(),
            uploadBy: systemUserId
          },
        },
      );

      // await this.tenantPrisma.client.bank_analysis.create({
      //   data: {
      //     statementId: bankstatement.id,
      //     customerID: Number(agg.customerId),
      //     clienttrnxid:
      //       analyserResult?.trxID || analyserResult?.data?.client_request_id,
      //     analysisData: analyserResult.data,
      //     status: 'SUCCEEDED',
      //   },
      // });

      // const preOfferBre =
      //   await this.tenantPrisma.client.credforge_bre_log.findFirst({
      //     where: {
      //       customerID: Number(agg.customerId),
      //     },
      //     select: {
      //       status: true,
      //       requestPayload: true,
      //     },
      //   });

      // if (preOfferBre?.status == 'Proceed to Bank') {
      //   const payload = {
      //     user_id: (preOfferBre?.requestPayload as any)?.user_id,
      //     reference_id: (preOfferBre?.requestPayload as any)?.reference_id,
      //     input_data: {
      //       lead_id: (preOfferBre?.requestPayload as any)?.input_data?.lead_id,
      //       declared_income: (preOfferBre?.requestPayload as any)?.input_data
      //         ?.declared_income,
      //       external: {
      //         bank_type: 'bank_bsa',
      //         bank_data: [
      //           {
      //             metadata: {
      //               currency: dataDetail?.jsonData?.Account?.Summary?.currency,
      //               bank_name: '',
      //               ifsc_code: dataDetail?.jsonData?.Account?.Summary?.ifscCode,
      //               account_type: dataDetail?.jsonData?.Account?.Summary?.type,
      //               employer_name: '',
      //               account_number:
      //                 dataDetail?.jsonData?.Account?.maskedAccNumber,
      //               account_holder_name:
      //                 dataDetail?.jsonData?.Account?.Profile?.Holders?.Holder
      //                   ?.name,
      //               statement_fetch_date: new Date(),
      //               statement_start_date:
      //                 dataDetail?.jsonData?.Account?.Transactions?.startDate,
      //               statement_end_date:
      //                 dataDetail?.jsonData?.Account?.Transactions?.endDate,
      //             },
      //             transaction_data:
      //               dataDetail?.jsonData?.Account?.Transactions?.Transaction ||
      //               [],
      //           },
      //         ],
      //       },
      //     },
      //   };
      //   await this.credforgeService.runBankBRE(payload, agg.customerId);
      // }

      await this.tenantPrisma.client.account_agg.update({
        where: { id: agg.id },
        data: {
          pushDataReceivedAt: new Date(),
          latest_bankstatement: bankstatement.id,
        },
      });

      // traceLog.steps.push({
      //   stage: 'DB_STORED',
      //   time: new Date().toISOString(),
      //   bankStatementId: bankstatement.id,
      //   leadId: latestLead?.leadID,
      // });

      // traceLog.status = 'SUCCESS';

      return {
        bankStatementId: bankstatement.id,
      }


    } catch (error: any) {


      console.error('Error handling push data:', error);

      // return ResponseHandler.error(
      //   error?.message || 'Failed to handle push data',
      //   body.clienttxnid,
      // );
    } finally {
      // traceLog.duration_ms = Date.now() - startTime;

      // await writeTraceLog(traceLog);
    }
  }
}
