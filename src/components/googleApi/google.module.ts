import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FileModule } from '../fileUploads/file.module';
import { SmsModule } from '../sms/sms.module';
import { GoogleController } from './google.controller';
import { GoogleService } from './google.service';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [AuthModule, FileModule, SmsModule, HttpModule],
  providers: [PrismaService, GoogleService],
  controllers: [GoogleController],
  exports: [GoogleService],
})
export class GoogleModule { }
