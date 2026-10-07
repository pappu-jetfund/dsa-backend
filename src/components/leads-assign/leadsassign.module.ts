import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';
import { PrismaService } from '../../prisma/prisma.service';
import { LeadsAssignService } from './leadsassign.service';
import { LeadsAssignController } from './leadsassign.controller';



@Module({
    imports: [AuthModule, MailModule, SmsModule,],
    providers: [PrismaService, LeadsAssignService],
    controllers: [LeadsAssignController],
})
export class LeadsAssignModule { }
