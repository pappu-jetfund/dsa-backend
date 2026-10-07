import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import Razorpay from 'razorpay';
import { TenantPrismaService } from '../../../prisma/tenet-prisma.service';
import { normalizeData } from '../../../utility/helper';


@Injectable()
export class CreditBuilderLeadsService {
  private razorpay: Razorpay;

  constructor(
    // private readonly httpService: HttpService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly clsService: ClsService,
    private configService: ConfigService,

  ) {
    this.razorpay = new Razorpay({
      key_id: this.configService.get<string>('RAZORPAY_KEY_ID', 'test'),
      key_secret: this.configService.get<string>('RAZORPAY_KEY_SECRET', 'test'),
    });
  }

  async getCreditBuilderProfile(leadID: number) {
    try {
      const lead =
        await this.tenantPrisma.client.credit_improve_leads.findUnique({
          where: {
            leadID,
          },
          include: {
            customer:true,
            creditApprovals: true,

            creditImproveLoan: true,

            creditImproveCollections: {
              orderBy: {
                createdDate: 'desc',
              },
            },

            creditImprovePayout: {
              include: {
                statusHistory: {
                  orderBy: {
                    createdAt: 'desc',
                  },
                },
              },
            },
          },
        });

      if (!lead) {
        return {
          statusCode: 404,
          message: 'Lead not found',
        };
      }

      return normalizeData({
        tabName: 'Profile',
        data: lead,
      });
    } catch (error) {
      throw error;
    }
  }
}
