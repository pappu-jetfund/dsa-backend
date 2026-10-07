import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { VerificationService } from './verifications.service';
import { VerificationController } from './verification.controller';
import { SmsModule } from '../sms/sms.module';



@Module({
    imports: [HttpModule, ConfigModule, SmsModule],
    providers: [PrismaService, VerificationService],
    controllers: [VerificationController],
    exports: [VerificationService],
})
export class VerificationModule { }
