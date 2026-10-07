import { Module } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { AuthService } from '../auth/auth.service';
import { AuthModule } from '../auth/auth.module';
import { SmsModule } from '../sms/sms.module';
import { PrismaService } from '../../prisma/prisma.service';
import { CibilService } from '../cibil/cibil.service';
import { HttpModule } from '@nestjs/axios';
import { GoogleModule } from '../googleApi/google.module';

@Module({
  imports: [AuthModule, SmsModule, HttpModule, GoogleModule],
  providers: [PrismaService, CustomerService, CibilService],
  controllers: [CustomerController],
})
export class CustomerModule { }
