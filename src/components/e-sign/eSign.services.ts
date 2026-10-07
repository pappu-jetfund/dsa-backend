import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) { }

  async eSignDetails(leadID: any) {
    try {
      const eSignData = await this.tenantPrisma.client.eagreement.findUnique({
        where: { leadID: parseInt(leadID) },
      });

      if (!eSignData) {
        return { success: false, message: 'E-Sign Pending', data: null };
      }

      if (eSignData.status == 'pending') {
        return {
          success: false,
          message: 'E-Sign Pending',
          data: null,
        };
      }

      return { success: true, data: eSignData, statusCode: 200 };
    } catch (error) {
      console.error('Error in eSignDetails:', error);

      return {
        success: false,
        message: 'Something went wrong while fetching e-sign details',
      };
    }
  }
}
