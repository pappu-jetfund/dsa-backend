import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CibilService } from './cibil.service';
import { AuthGuard } from '../../gaurd/auth.gaurd';
import { MethodPermissionGuard } from '../../gaurd/read.gaurd';

@Controller('cibil')
export class CibilController {
  constructor(private CibilService: CibilService) {}

  @UseGuards(AuthGuard)
  @Post(':leadId/fetch-cibil')
  async fetchCibil(@Param('leadId') leadId: string, @Req() req: Request) {
    return await this.CibilService.fetchCibil(leadId, req);
  }

  @UseGuards(AuthGuard)
  @Post(':leadId/fetch-criff-softpull')
  async fetchCibilV2(@Param('leadId') leadId: string, @Req() req: Request) {
    return await this.CibilService.fetchCriffSoftpull(leadId, req);
  }
}
