import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CreditBuilderCollectionService } from './creditbuilderCollection.Serivce';
import { CreditBuilderCollectionController } from './creditbuilderCollection.Controller';
import { BullMqModule } from '../../queue/queue.module';
import { MailModule } from '../../mail/mail.module';
import { FileModule } from '../../fileUploads/file.module';
import { AuthModule } from '../../auth/auth.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { CibilService } from '../../cibil/cibil.service';

@Module({
  imports: [AuthModule, FileModule, MailModule, BullMqModule, HttpModule],
  providers: [PrismaService, CreditBuilderCollectionService, CibilService],
  controllers: [CreditBuilderCollectionController],
})
export class CreditBuilderCollectionModule { }