import { Module } from '@nestjs/common';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

@Module({
    imports: [
        BullBoardModule.forRoot({
            route: '/queues', // 🔥 dashboard URL
            adapter: ExpressAdapter,
        }),

        BullBoardModule.forFeature({
            name: 'icici-status',
            adapter: BullMQAdapter,
        }),

        BullBoardModule.forFeature({
            name: 'reloan-sms',
            adapter: BullMQAdapter
        }),

        BullBoardModule.forFeature({
            name: 'mail-queue',
            adapter: BullMQAdapter,
        }),
    ],
})
export class BullBoardSetupModule { }