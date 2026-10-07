import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [AuthModule, SmsModule],
  providers: [PrismaService, QueryService,],
  controllers: [QueryController],
})
export class QueryModule { }
