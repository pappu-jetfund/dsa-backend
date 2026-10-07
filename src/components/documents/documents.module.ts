import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FileModule } from '../fileUploads/file.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.services';
import { MulterModule } from '@nestjs/platform-express';
import { PrismaService } from '../../prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    HttpModule,
    AuthModule,
    FileModule,
    MulterModule.register({
      limits: {
        fileSize: 50 * 1024 * 1024, // 50 MB
      },
    }),
  ],
  providers: [PrismaService, DocumentsService],
  controllers: [DocumentsController],
  exports: [DocumentsService]
})
export class DocumentsModule { }
