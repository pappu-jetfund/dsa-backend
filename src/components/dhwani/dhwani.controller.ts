import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { DhwaniService } from './dhwani.service';



@Controller('dhwani')
export class DhwaniController {
  constructor(
    private readonly dhwaniService: DhwaniService,
  ) { }

  @Post('webhook')
  async handleWebhook(
    @Body() body: any,
  ) {
    try {
      await this.dhwaniService.handleWebhook(body);

      return {
        success: true,
        message: 'Webhook processed successfully',
      };

    } catch (error: any) {
      return {
        success: false,
        message: 'Webhook processing failed',
        error: error.message,
      };
    }
  }
}
