import { Controller, Get, Post, Delete, Body, Query, Req, UseGuards, } from '@nestjs/common';
import { PaymentDatesService } from './payment-dates.service';
import { SavePaymentDatesDto } from './payment-dates.dto';
import { AuthGuard } from '../../gaurd/auth.gaurd';

@Controller('payment-dates')
export class PaymentDatesController {
    constructor(private readonly service: PaymentDatesService) { }

    @UseGuards(AuthGuard)
    @Get("/listing")
    async getDates() {
        return await this.service.getBlockedDates();
    }

    @UseGuards(AuthGuard)
    @Post("/add")
    async saveDates(
        @Body() body: SavePaymentDatesDto,
    ) {
        return this.service.saveBlockedDates(body);
    }

    @UseGuards(AuthGuard)
    @Delete("/delete")
    async deleteDate(@Query('date') date: string,) {
        return this.service.deleteDate(date);
    }
}