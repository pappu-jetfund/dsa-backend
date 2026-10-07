import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PayoutModule } from '../payout/payout.module';
import { IciciProcessor, ReloanSmsProcessor } from './queue.processor';
import { SmsModule } from '../sms/sms.module';
import { MailModule } from '../mail/mail.module';
import { ConfigService } from '@nestjs/config';

@Module({
    imports: [
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                connection: {
                    host: config.get('REDIS_HOST'),
                    port: Number(config.get('REDIS_PORT')),
                    password: config.get('REDIS_PASSWORD'),
                },
            }),
        }),

        BullModule.registerQueue(
            { name: 'icici-status' },
            { name: 'reloan-sms' },
            { name: 'mail-queue' },
        ),
        PayoutModule,
        SmsModule,
        MailModule
    ],
    exports: [BullModule],
    providers: [IciciProcessor, ReloanSmsProcessor],
})
export class BullMqModule { }