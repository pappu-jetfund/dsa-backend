import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';

@Injectable()
export class DhwaniCronService {

    private readonly logger = new Logger(DhwaniCronService.name);
    private readonly BASE_URL = process.env.DHWANI_API_URL;
    private readonly API_KEY = process.env.DHWANI_API_KEY;

    async triggerBulkCalls(payload: any) {
        try {

            const response = await axios.post(
                `${this.BASE_URL}/api/v1/bulk-calls/`,
                payload,
                // {
                //     "agent": payload.agent,
                //     "calls": [
                //         {
                //             "phone_number": "8218299028",
                //             "name": "Himanshu",
                //             "reason": "- [outstanding amount] — 17,899.2 - [due date] — 22 July 2026 - [offers] — Upto 20% waiver on Loan till date interest  Upto 40 to 50% Discount on processing fees on new loan Can Increase the loan limit upto 10% to 20% - [customer gender] — Male"
                //         }
                //     ]
                // },
                {
                    headers: {
                        Authorization: `Bearer ${this.API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                },
            );


            return response.data;
        } catch (error: any) {
            // this.logger.error('Bulk call API failed', error?.response?.data || error);
            console.error('Bulk call API failed', error?.response?.data || error)
        }
    };
}