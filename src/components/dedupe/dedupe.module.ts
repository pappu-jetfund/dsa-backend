import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';
import { DedupeService } from './dedupe.service';
import { DedupeController } from './dedupe.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { CibilService } from '../cibil/cibil.service';
import { CibilModule } from '../cibil/cibil.module';

@Module({
  imports: [AuthModule, MailModule, SmsModule, CibilModule],
  providers: [PrismaService, DedupeService,],
  controllers: [DedupeController],
})
export class DedupeModule { }
