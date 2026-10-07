import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FileModule } from '../fileUploads/file.module';
import { CibilService } from './cibil.service';
import { CibilController } from './cibil.controller';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [AuthModule, FileModule, HttpModule],
  providers: [PrismaService, CibilService],
  controllers: [CibilController],
  exports: [CibilService]
})
export class CibilModule { }
