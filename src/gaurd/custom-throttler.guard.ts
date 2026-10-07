import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: Record<string, any>): Promise<string> {

        if (req.user?.id) {
            return `user-${req.user.id}`;
        }

        const authHeader = req.headers['authorization'];

        if (authHeader) {
            const token = authHeader.split(' ')[1];
            if (token) {
                return `token-${token}`;
            }
        }


        if (req.body?.email) {
            return `email-${req.body.email}`;
        }


        if (req.body?.mobile_number) {
            return `mobile-${req.body.mobile_number}`;
        }

        // 4. fallback
        return req.ip;
        // return `user-${req.user.id}-route-${req.route.path}`;
    }
}