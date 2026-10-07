import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../auth/auth.service';
import { HttpService } from '@nestjs/axios';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';

@Injectable()
export class GoogleService {
  private apiUrl: string;
  private apiKey: string;
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly clsService: ClsService,
    private configService: ConfigService,
    private readonly authService: AuthService,
    private readonly httpService: HttpService,
  ) {
    this.apiUrl = this.configService.get<string>('MAPS_API_URL', '');
    this.apiKey = this.configService.get<string>('MAPS_API_KEY', '');
  }

  async getlocation(body: any) {
    try {
      if (!body) {
        return {
          statusCode: 500,
          msg: 'LAT,LONG is Not Provided',
        };
      }

      const response = await this.httpService.axiosRef.get(
        `${this.apiUrl}=${body}&key=${this.apiKey}`,
      );
      const fullAddress = response.data.results[0].formatted_address;

      return { sucess: true, data: fullAddress };
    } catch (err) {
      return {
        sucess: false,
        msg: err,
      };
    }
  }
}
