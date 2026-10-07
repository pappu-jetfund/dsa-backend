import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';

import { PrismaService } from '../../prisma/prisma.service';
import { SmsModule } from '../sms/sms.module';
import { loanService } from './loan.services';
import { loanController } from './loan.controllers';

@Module({
    imports: [AuthModule, SmsModule],
    providers: [PrismaService, loanService],
    controllers: [loanController],
})
export class loanModule { }
