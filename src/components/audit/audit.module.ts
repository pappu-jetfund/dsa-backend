import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { SmsModule } from '../sms/sms.module';
import { GlobalModule } from '../../common/globalFunctions/global.module';



@Module({
    imports: [AuthModule, SmsModule, GlobalModule],
    providers: [PrismaService, AuditService],
    controllers: [AuditController],
})
export class AuditModule { }
