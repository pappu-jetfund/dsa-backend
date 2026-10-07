import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { GoogleService } from './google.service';
import { AuthGuard } from '../../gaurd/auth.gaurd';

@Controller('google')
export class GoogleController {
  constructor(private googleService: GoogleService) { }

  @UseGuards(AuthGuard)
  @Get('locationAPI')
  async getlocation(@Query('body') body?: string) {
    return await this.googleService.getlocation(body);
  }
}
