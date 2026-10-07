import { Module } from "@nestjs/common";
import { ESignDetail } from "./eSign.controller";   // <-- your controller file
import { DocumentsService } from "./eSign.services";
import { TenantPrismaService } from "../../prisma/tenet-prisma.service";

@Module({
    controllers: [ESignDetail],        // <-- use THIS controller
    providers: [DocumentsService, TenantPrismaService],
})
export class ESignModule { }
