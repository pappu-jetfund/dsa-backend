import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FileModule } from '../fileUploads/file.module';
import { MailModule } from '../mail/mail.module';
import { CollectionFOllowUpController } from './followup.controller';
import { CollectionFollowUpService } from './followup.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [AuthModule],
  providers: [PrismaService, CollectionFollowUpService],
  controllers: [CollectionFOllowUpController],
})
export class CollectionFollowUpModule { }
