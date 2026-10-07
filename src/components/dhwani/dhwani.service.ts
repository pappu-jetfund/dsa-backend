import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';

@Injectable()
export class DhwaniService {
    constructor(
        private readonly tenantPrisma: TenantPrismaService,
    ) { }
    private readonly logger = new Logger(DhwaniService.name);


    private parseDate(dateStr: string): Date {
        const [datePart, timePart] = dateStr.split(' ');
        const [day, month, year] = datePart.split('-').map(Number);
        const [hours, minutes, seconds] = timePart.split(':').map(Number);

        return new Date(year, month - 1, day, hours, minutes, seconds);
    }

    async handleWebhook(body: any) {
        try {

            const { event, batch_id, batch_status, completed_at, summary, calls = [], } = body;

            if (event === 'batch.completed') {

                const batch = await this.tenantPrisma.client.ai_call_batches.update({
                    where: { batchId: String(batch_id) },
                    data: {
                        status: batch_status,
                        completedAt: completed_at ? this.parseDate(completed_at) : new Date(),
                        completedCalls: summary?.completed || 0,
                        failedCalls: summary?.failed || 0,
                    },
                });

            }

            for (const call of calls) {
                const { call_id, status, duration_seconds, call_started_at, completed_at, recording_url, hangup_cause, ai_analysis, } = call;

                const res = await this.tenantPrisma.client.ai_call_logs.updateMany({
                    where: { callId: call_id },
                    data: {
                        status,
                        duration: duration_seconds || 0,
                        callStartedAt: call_started_at ? this.parseDate(call_started_at) : null,
                        completedAt: completed_at ? this.parseDate(completed_at) : null,
                        recordingUrl: recording_url,
                        hangupCause: hangup_cause,
                    },
                });


                if (ai_analysis) {
                    const ai = await this.tenantPrisma.client.ai_call_analysis.upsert({
                        where: { callId: call_id },
                        update: {
                            summary: ai_analysis.summary,
                            tentativeDate: ai_analysis.tentative_date ? new Date(ai_analysis.tentative_date) : null,
                            customerConfirmationStatus: ai_analysis.customer_confirmation_status,
                            transcript: call.transcript || null,
                        },
                        create: {
                            callId: call_id,
                            summary: ai_analysis.summary,
                            tentativeDate: ai_analysis.tentative_date ? new Date(ai_analysis.tentative_date) : null,
                            customerConfirmationStatus: ai_analysis.customer_confirmation_status,
                            transcript: call.transcript || null,
                        },
                    });

                }
            }

            console.log('✅ Webhook processed');

        } catch (error: any) {
            console.error('❌ Webhook service error:', error.message);
        }
    }
}