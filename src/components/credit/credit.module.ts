import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SmsModule } from '../sms/sms.module';
import { CreditService } from './credit.service';
import { CreditController } from './credit.controller';
import { MailModule } from '../mail/mail.module';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [AuthModule, SmsModule, MailModule],
  providers: [PrismaService, CreditService],
  controllers: [CreditController],
})
export class CreditModule { }
