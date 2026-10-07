import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../auth/auth.service';
import { normalize } from '../../utility/helper';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';

@Injectable()
export class CollectionFollowUpService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private configService: ConfigService,
    private readonly clsService: ClsService,
    private readonly authService: AuthService,
  ) { }

  async ptpCallPending({
    page,
    limit,
    search,
  }: {
    page: number;
    limit: number;
    search?: string;
  }) {
    try {
      const skip = (page - 1) * limit;

      const userData = await this.clsService.get('user');
      const today = new Date().toISOString().split('T')[0];

      const where: any = {
        StatusType: 'PTP',
        statusTypeDate: today,
      };

      if (search && search.trim() !== '') {
        const searchNumber = Number(search.trim());
        if (!isNaN(searchNumber)) {
          where.lead = {
            is: {
              customer: {
                is: {
                  mobile: searchNumber,
                },
              },
            },
          };
        }
      }

      const [data, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.collectionfollowup.findMany({
          where,
          skip,
          take: limit,
          orderBy: { reviewID: 'desc' },
          select: {
            reviewID: true,
            leadID: true,
            customerID: true,
            loanNo: true,
            followType: true,
            StatusType: true,
            statusTypeDate: true,
            remark: true,
            createdDate: true,
            lead: {
              select: {
                leadID: true,
                customerID: true,
                status: true,
                customer: {
                  select: {
                    customerID: true,
                    name: true,
                    mobile: true,
                    email: true,
                    addresses: {
                      select: {
                        type: true,
                        kyc_permanent_add: true,
                        address: true,
                      },
                    },
                    employer: {
                      select: {
                        employerName: true,
                        address: true,
                      },
                    },
                  },
                },
                loan: {
                  select: {
                    loanNo: true,
                  },
                },
                approvals: {
                  select: {
                    repayDate: true,
                    loanAmtApproved: true,
                  },
                },
              },
            },
          },
        }),
        this.tenantPrisma.client.collectionfollowup.count({ where }),
      ]);

      return normalize({
        statusCode: 200,
        data,
        meta: {
          page,
          limit,
          total,
        },
      });
    } catch (err: any) {
      return {
        statusCode: 500,
        success: false,
        message: err.message || 'Internal server error',
      };
    }
  }

  async preptpCallPending({
    page,
    limit,
    search,
    filters,
  }: {
    page: number;
    limit: number;
    search?: string;
    filters: {
      fromDate?: string;
      toDate?: string;
    };
  }) {
    try {
      const skip = (page - 1) * limit;

      const rep = filters?.fromDate ? new Date(filters.fromDate) : new Date();

      const fromDate = new Date(rep);
      fromDate.setDate(fromDate.getDate() + 1);
      const fromDateStr = fromDate.toISOString().split('T')[0];

      const toDate = new Date(rep);
      toDate.setDate(toDate.getDate() + 3);
      const toDateStr = toDate.toISOString().split('T')[0];

      const where: any = {
        StatusType: 'PTP',
        statusTypeDate: {
          gte: fromDateStr,
          lte: toDateStr,
        },
      };

      const [data, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.collectionfollowup.findMany({
          where,
          skip,
          take: limit,
          orderBy: { reviewID: 'desc' },
          select: {
            reviewID: true,
            leadID: true,
            customerID: true,
            loanNo: true,
            followType: true,
            StatusType: true,
            statusTypeDate: true,
            remark: true,
            createdDate: true,

            lead: {
              select: {
                leadID: true,
                customerID: true,
                status: true,

                customer: {
                  select: {
                    customerID: true,
                    name: true,
                    mobile: true,
                    email: true,

                    addresses: {
                      select: {
                        type: true,
                        kyc_permanent_add: true,
                        address: true,
                      },
                    },

                    employer: {
                      select: {
                        employerName: true,
                        address: true,
                      },
                    },
                  },
                },

                loan: {
                  select: {
                    loanNo: true,
                  },
                },

                approvals: {
                  select: {
                    repayDate: true,
                    loanAmtApproved: true,
                  },
                },
              },
            },
          },
        }),
        this.tenantPrisma.client.collectionfollowup.count({ where }),
      ]);

      return normalize({
        statusCode: 200,
        data,
        meta: {
          page,
          limit,
          total,
        },
      });
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async fipendingPending({
    page,
    limit,
    search,
    filters,
  }: {
    page: number;
    limit: number;
    search?: string;
    filters: {
      fromDate?: string;
      toDate?: string;
    };
  }) {
    try {
      const skip = (page - 1) * limit;

      const today = new Date().toISOString().split('T')[0];

      const where: any = {
        StatusType: {
          in: ['FI Home', 'FI Office'],
        },
        statusTypeDate: today,
      };

      const [data, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.collectionfollowup.findMany({
          where,
          skip,
          take: limit,
          orderBy: { reviewID: 'desc' },
          select: {
            reviewID: true,
            leadID: true,
            customerID: true,
            loanNo: true,
            followType: true,
            StatusType: true,
            statusTypeDate: true,
            remark: true,
            createdDate: true,

            lead: {
              select: {
                leadID: true,
                customerID: true,
                status: true,

                customer: {
                  select: {
                    customerID: true,
                    name: true,
                    mobile: true,
                    email: true,

                    addresses: {
                      select: {
                        type: true,
                        kyc_permanent_add: true,
                        address: true,
                      },
                    },

                    employer: {
                      select: {
                        employerName: true,
                        address: true,
                      },
                    },
                  },
                },

                loan: {
                  select: {
                    loanNo: true,
                  },
                },

                approvals: {
                  select: {
                    repayDate: true,
                    loanAmtApproved: true,
                  },
                },
              },
            },
          },
        }),
        this.tenantPrisma.client.collectionfollowup.count({ where }),
      ]);

      return normalize({
        statusCode: 200,
        data,
        meta: {
          page,
          limit,
          total,
        },
      });
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async prefipendingPending({
    page,
    limit,
    search,
    filters,
  }: {
    page: number;
    limit: number;
    search?: string;
    filters: {
      fromDate?: string;
      toDate?: string;
    };
  }) {
    try {
      const skip = (page - 1) * limit;

      const rep = filters?.fromDate ? new Date(filters.fromDate) : new Date();

      const fromDate = new Date(rep);
      fromDate.setDate(fromDate.getDate() + 1);
      const fromDateStr = fromDate.toISOString().split('T')[0];

      const toDate = new Date(rep);
      toDate.setDate(toDate.getDate() + 3);
      const toDateStr = toDate.toISOString().split('T')[0];

      const where: any = {
        StatusType: {
          in: ['FI Home', 'FI Office'],
        },
        statusTypeDate: {
          gte: fromDateStr,
          lte: toDateStr,
        },
      };

      const [data, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.collectionfollowup.findMany({
          where,
          skip,
          take: limit,
          orderBy: { reviewID: 'desc' },
          select: {
            reviewID: true,
            leadID: true,
            customerID: true,
            loanNo: true,
            followType: true,
            StatusType: true,
            statusTypeDate: true,
            remark: true,
            createdDate: true,

            lead: {
              select: {
                leadID: true,
                customerID: true,
                status: true,

                customer: {
                  select: {
                    customerID: true,
                    name: true,
                    mobile: true,
                    email: true,

                    addresses: {
                      select: {
                        type: true,
                        kyc_permanent_add: true,
                        address: true,
                      },
                    },

                    employer: {
                      select: {
                        employerName: true,
                        address: true,
                      },
                    },
                  },
                },

                loan: {
                  select: {
                    loanNo: true,
                  },
                },

                approvals: {
                  select: {
                    repayDate: true,
                    loanAmtApproved: true,
                  },
                },
              },
            },
          },
        }),
        this.tenantPrisma.client.collectionfollowup.count({ where }),
      ]);

      return normalize({
        statusCode: 200,
        data,
        meta: {
          page,
          limit,
          total,
        },
      });
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async callPending({
    page,
    limit,
    search,
    filters,
  }: {
    page: number;
    limit: number;
    search?: string;
    filters: {
      fromDate?: string;
      toDate?: string;
    };
  }) {
    try {
      const skip = (page - 1) * limit;

      const rep = filters?.fromDate ? new Date(filters.fromDate) : new Date();

      const fromDate = new Date(rep);
      fromDate.setDate(fromDate.getDate());
      const fromDateStr = fromDate.toISOString().split('T')[0];

      const toDate = new Date(rep);
      toDate.setDate(toDate.getDate());
      const toDateStr = toDate.toISOString().split('T')[0];

      const where: any = {
        StatusType: {
          notIn: ['FI Home', 'FI Office'],
        },
        statusTypeDate: {
          gte: fromDateStr,
          lte: toDateStr,
        },
      };

      const [data, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.collectionfollowup.findMany({
          where,
          skip,
          take: limit,
          orderBy: { reviewID: 'desc' },
          select: {
            reviewID: true,
            leadID: true,
            customerID: true,
            loanNo: true,
            followType: true,
            StatusType: true,
            statusTypeDate: true,
            remark: true,
            createdDate: true,

            lead: {
              select: {
                leadID: true,
                customerID: true,
                status: true,

                customer: {
                  select: {
                    customerID: true,
                    name: true,
                    mobile: true,
                    email: true,

                    addresses: {
                      select: {
                        type: true,
                        kyc_permanent_add: true,
                        address: true,
                      },
                    },

                    employer: {
                      select: {
                        employerName: true,
                        address: true,
                      },
                    },
                  },
                },

                loan: {
                  select: {
                    loanNo: true,
                  },
                },

                approvals: {
                  select: {
                    repayDate: true,
                    loanAmtApproved: true,
                  },
                },
              },
            },
          },
        }),
        this.tenantPrisma.client.collectionfollowup.count({ where }),
      ]);

      return normalize({
        statusCode: 200,
        data,
        meta: {
          page,
          limit,
          total,
        },
      });
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async fidonePending({
    page,
    limit,
    search,
    filters,
  }: {
    page: number;
    limit: number;
    search?: string;
    filters: {
      fromDate?: string;
      toDate?: string;
    };
  }) {
    try {
      const skip = (page - 1) * limit;

      const rep = filters?.fromDate ? new Date(filters.fromDate) : new Date();

      const fromDate = new Date(rep);
      fromDate.setDate(fromDate.getDate());
      const fromDateStr = fromDate.toISOString().split('T')[0];

      const toDate = new Date(rep);
      toDate.setDate(toDate.getDate());
      const toDateStr = toDate.toISOString().split('T')[0];

      const where: any = {
        StatusType: {
          in: ['FI Home', 'FI Office'],
        },
        statusTypeDate: {
          gte: fromDateStr,
          lte: toDateStr,
        },
      };

      const [data, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.collectionfollowup.findMany({
          where,
          skip,
          take: limit,
          orderBy: { reviewID: 'desc' },
          select: {
            reviewID: true,
            leadID: true,
            customerID: true,
            loanNo: true,
            followType: true,
            StatusType: true,
            statusTypeDate: true,
            remark: true,
            createdDate: true,

            lead: {
              select: {
                leadID: true,
                customerID: true,
                status: true,

                customer: {
                  select: {
                    customerID: true,
                    name: true,
                    mobile: true,
                    email: true,

                    addresses: {
                      select: {
                        type: true,
                        kyc_permanent_add: true,
                        address: true,
                      },
                    },

                    employer: {
                      select: {
                        employerName: true,
                        address: true,
                      },
                    },
                  },
                },

                loan: {
                  select: {
                    loanNo: true,
                  },
                },

                approvals: {
                  select: {
                    repayDate: true,
                    loanAmtApproved: true,
                  },
                },
              },
            },
          },
        }),
        this.tenantPrisma.client.collectionfollowup.count({ where }),
      ]);

      return normalize({
        statusCode: 200,
        data,
        meta: {
          page,
          limit,
          total,
        },
      });
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async ptpcallDone({
    page,
    limit,
    search,
    filters,
  }: {
    page: number;
    limit: number;
    search?: string;
    filters: {
      fromDate?: string;
      toDate?: string;
    };
  }) {
    try {
      const skip = (page - 1) * limit;

      const rep = filters?.fromDate ? new Date(filters.fromDate) : new Date();

      const fromDate = new Date(rep);
      fromDate.setDate(fromDate.getDate());
      const fromDateStr = fromDate.toISOString().split('T')[0];

      const toDate = new Date(rep);
      toDate.setDate(toDate.getDate());
      const toDateStr = toDate.toISOString().split('T')[0];

      const where: any = {
        StatusType: 'PTP',
        lead: {
          status: 'Closed',
        },
        statusTypeDate: {
          gte: fromDateStr,
          lte: toDateStr,
        },
      };

      const [data, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.collectionfollowup.findMany({
          where,
          skip,
          take: limit,
          orderBy: { reviewID: 'desc' },
          select: {
            reviewID: true,
            leadID: true,
            customerID: true,
            loanNo: true,
            followType: true,
            StatusType: true,
            statusTypeDate: true,
            remark: true,
            createdDate: true,

            lead: {
              select: {
                leadID: true,
                customerID: true,
                status: true,

                customer: {
                  select: {
                    customerID: true,
                    name: true,
                    mobile: true,
                    email: true,

                    addresses: {
                      select: {
                        type: true,
                        kyc_permanent_add: true,
                        address: true,
                      },
                    },

                    employer: {
                      select: {
                        employerName: true,
                        address: true,
                      },
                    },
                  },
                },

                loan: {
                  select: {
                    loanNo: true,
                  },
                },

                approvals: {
                  select: {
                    repayDate: true,
                    loanAmtApproved: true,
                  },
                },
              },
            },
          },
        }),
        this.tenantPrisma.client.collectionfollowup.count({ where }),
      ]);

      return normalize({
        statusCode: 200,
        data,
        meta: {
          page,
          limit,
          total,
        },
      });
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async callDone({
    page,
    limit,
    search,
    filters,
  }: {
    page: number;
    limit: number;
    search?: string;
    filters: {
      fromDate?: string;
      toDate?: string;
    };
  }) {
    try {
      const skip = (page - 1) * limit;

      const rep = filters?.fromDate ? new Date(filters.fromDate) : new Date();

      const fromDate = new Date(rep);
      fromDate.setDate(fromDate.getDate());
      const fromDateStr = fromDate.toISOString().split('T')[0];

      const toDate = new Date(rep);
      toDate.setDate(toDate.getDate());
      const toDateStr = toDate.toISOString().split('T')[0];

      const where: any = {
        lead: {
          status: 'Closed',
        },
        statusTypeDate: {
          gte: fromDateStr,
          lte: toDateStr,
        },
      };

      const [data, total] = await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.collectionfollowup.findMany({
          where,
          skip,
          take: limit,
          orderBy: { reviewID: 'desc' },
          select: {
            reviewID: true,
            leadID: true,
            customerID: true,
            loanNo: true,
            followType: true,
            StatusType: true,
            statusTypeDate: true,
            remark: true,
            createdDate: true,

            lead: {
              select: {
                leadID: true,
                customerID: true,
                status: true,

                customer: {
                  select: {
                    customerID: true,
                    name: true,
                    mobile: true,
                    email: true,

                    addresses: {
                      select: {
                        type: true,
                        kyc_permanent_add: true,
                        address: true,
                      },
                    },

                    employer: {
                      select: {
                        employerName: true,
                        address: true,
                      },
                    },
                  },
                },

                loan: {
                  select: {
                    loanNo: true,
                  },
                },

                approvals: {
                  select: {
                    repayDate: true,
                    loanAmtApproved: true,
                  },
                },
              },
            },
          },
        }),
        this.tenantPrisma.client.collectionfollowup.count({ where }),
      ]);

      return normalize({
        statusCode: 200,
        data,
        meta: {
          page,
          limit,
          total,
        },
      });
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
}
