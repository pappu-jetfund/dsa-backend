// payment-dates/payment-dates.module.ts

import { Module } from '@nestjs/common';
import { PaymentDatesController } from './payment-dates.controller';
import { PaymentDatesService } from './payment-dates.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
    controllers: [PaymentDatesController],
    providers: [PaymentDatesService, PrismaService],
    exports: [PaymentDatesService],
})
export class PaymentDatesModule { }