import { Module } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { PrismaService } from '../../../prisma/prisma.service';

@Module({
    controllers: [VendorsController],
    providers: [VendorsService, PrismaService],
    exports: [VendorsService],
})
export class VendorsModule { }