import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { BucketService } from "./bucket.service";
import { AuthGuard } from "../../gaurd/auth.gaurd";
import { MethodPermissionGuard } from "../../gaurd/read.gaurd";

@Controller('bucket')
export class BucketController {
    constructor(
        private bucketService: BucketService,

    ) { }

    @UseGuards(AuthGuard, MethodPermissionGuard)
    @Get("/list")
    async getBuckets() {
        return this.bucketService.getBucketUsers();
    }

    @UseGuards(AuthGuard, MethodPermissionGuard)
    @Post("/update")
    async updateBucket(@Body() body: any) {
        return this.bucketService.updateBucketUsers(body);
    }

}