import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FileModule } from '../fileUploads/file.module';
import { ReportController } from './report.controller';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [AuthModule],
  providers: [PrismaService, ReportsService],
  controllers: [ReportController],
})
export class ReportsModule { }
