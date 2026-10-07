import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [AuthModule, HttpModule, SmsModule],
  providers: [PrismaService, AccountService],
  controllers: [AccountController],
})
export class AccountModule {}
