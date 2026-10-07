import { Body, Controller, Get, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '../../gaurd/auth.gaurd';
import { FileInterceptor } from '@nestjs/platform-express';
import { SmsService } from './sms.service';
import { SendPaymentLinkDto } from './sms.dto';

@Controller('sms')
export class SmsController {
    constructor(private smsService: SmsService) { }

    @UseGuards(AuthGuard)
    @Post('send-payment-link')
    async sendPaymentLink(@Body() body: SendPaymentLinkDto, @Req() req: Request,) {
        return await this.smsService.sendPaymentLinkToCustomers(body, req);
    }

}
