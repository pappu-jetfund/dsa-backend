import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { AuthModule } from '../auth/auth.module';
import { FileModule } from '../fileUploads/file.module';
import { SmsModule } from '../sms/sms.module';
import { GoogleModule } from '../googleApi/google.module';
import { GoogleService } from '../googleApi/google.service';
import { RoleFilterService } from '../role-filter/role-filter.service';
import { DocumentsModule } from '../documents/documents.module';
import { HttpModule } from '@nestjs/axios';
import { CibilService } from '../cibil/cibil.service';
import { CronService } from './cronJobs.service';
import { DhwaniModule } from '../dhwani/dhwani.module';

@Module({
  imports: [AuthModule, FileModule, SmsModule, GoogleModule, DocumentsModule, HttpModule, DhwaniModule],
  providers: [PrismaService, LeadsService, RoleFilterService, CibilService, CronService],
  controllers: [LeadsController],
  exports: [LeadsService]
})
export class LeadsModule { }
