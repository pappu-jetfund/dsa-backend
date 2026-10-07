import { Global, Module } from '@nestjs/common';
import { GlobalService } from './global.service';
import { PrismaService } from '../../prisma/prisma.service';

@Global()
@Module({
    providers: [PrismaService, GlobalService],
    exports: [GlobalService],
})
export class GlobalModule { }