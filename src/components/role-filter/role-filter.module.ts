import { Module } from "@nestjs/common";
import { RoleFilterService } from "./role-filter.service";

@Module({
    providers: [RoleFilterService],
    exports: [RoleFilterService],
})
export class RoleFilterModule { }