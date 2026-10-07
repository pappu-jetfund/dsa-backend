import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';

@Injectable()
export class GlobalService {
    private readonly logger = new Logger(GlobalService.name);

    private cachedUser: any = null;

    constructor(
        private readonly configService: ConfigService,
        private readonly tenantPrisma: TenantPrismaService,
    ) { }

    async getSystemUser() {
        if (this.cachedUser) {
            return this.cachedUser;
        }

        const systemEmail = this.configService.get<any>('SYSTEM_EMAIL');

        if (!systemEmail) {
            throw new Error('SYSTEM_EMAIL is not configured');
        }

        const user = await this.tenantPrisma.client.lms_users.findUnique({
            where: {
                email: String(systemEmail),
            },
            select: {
                userID: true,
                email: true,
            }
        });
        if (!user) {
            throw new Error(`System user not found: ${systemEmail}`);
        }

        this.cachedUser = user;

        return user;
    }

    async getSystemUserId(): Promise<number> {
        const user: any = await this.getSystemUser();

        return Number(user.userID);
    }

    clearCache() {
        this.cachedUser = null;
    }
}