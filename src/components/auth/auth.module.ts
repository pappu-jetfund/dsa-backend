import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailModule } from '../mail/mail.module';
import { FileModule } from '../fileUploads/file.module';
import { FaceModule } from '../face/face.module';
import { BullMqModule } from '../queue/queue.module';

@Module({
  imports: [MailModule, FileModule, FaceModule, BullMqModule],
  providers: [PrismaService, AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule { }
