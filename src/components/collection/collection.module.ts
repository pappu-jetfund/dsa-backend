import { Module } from '@nestjs/common';


import { AuthModule } from '../auth/auth.module';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { FileModule } from '../fileUploads/file.module';
import { MailModule } from '../mail/mail.module';
import { PrismaService } from '../../prisma/prisma.service';
import { BullMqModule } from '../queue/queue.module';
import { CibilService } from '../cibil/cibil.service';
import { HttpModule } from '@nestjs/axios';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [AuthModule, FileModule, MailModule, BullMqModule, HttpModule, LeadsModule],
  providers: [PrismaService, CollectionService, CibilService],
  controllers: [CollectionController],
})
export class CollectionModule { }
