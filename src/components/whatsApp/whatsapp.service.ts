import { ConfigService } from "@nestjs/config";
import { TenantPrismaService } from "../../prisma/tenet-prisma.service";
import { ClsService } from "nestjs-cls";
import { AuthService } from "../auth/auth.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class WhatsAppService {
    constructor(
        private readonly tenantPrisma: TenantPrismaService,
        private configService: ConfigService,
        private readonly clsService: ClsService,
        private readonly authService: AuthService,
    ) { }


}