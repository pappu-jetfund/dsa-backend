import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../../prisma/prisma.service';
import { BucketService } from './bucket.service';
import { BucketController } from './bucket.controller';



@Module({
    imports: [AuthModule,],
    providers: [PrismaService, BucketService],
    controllers: [BucketController],
})
export class BucketModule { }
