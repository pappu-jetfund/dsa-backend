import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { DocumentsService } from './documents.services';
import type { Response } from 'express';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../../gaurd/auth.gaurd';
import { MethodPermissionGuard } from '../../gaurd/read.gaurd';

@Controller('documents')
export class DocumentsController {
  constructor(private DocumentsService: DocumentsService) { }

  @UseGuards(AuthGuard)
  @Get(':documentID/download')
  async downloadDocument(
    @Param('documentID') documentID: string,
    @Query('documentFile') documentFile: string,
  ) {
    return await this.DocumentsService.downloadDocument(
      documentID,
      documentFile,
    );
  }

  @UseGuards(AuthGuard)
  @Get(':leadID/profile-pitcure')
  async getProfilePicture(@Param('leadID') leadID: string) {
    return await this.DocumentsService.getProfilePicture(leadID);
  }

  @UseGuards(AuthGuard)
  @Get(':id/viewKycVideo')
  async getKycVideo(@Param('id') id: string, @Res() res: Response) {
    const result: any = await this.DocumentsService.getKycVideo(id);

    if (result.statusCode !== 200) {
      return {
        statusCode: 500,
        message: result.message || 'Failed to fetch Video',
      };
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Length', result.buffer.length);

    return res.send(result.buffer);
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post(':leadId/upload-documents')
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: {
        fileSize: 50 * 1024 * 1024, // 50 MB
      },
    }),
  )
  async uploadFilesWithTypes(
    @Body() body: any,
    @Param('leadId') leadId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return await this.DocumentsService.uploadFilesWithTypes(
      body,
      files,
      leadId,
    );
  }

  @UseGuards(AuthGuard, MethodPermissionGuard)
  @Post(':leadId/upload-videoKyc')
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: {
        fileSize: 50 * 1024 * 1024, // 50 MB
      },
    }),
  )
  async uploadvideoKyc(
    @Param('leadId') leadId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return await this.DocumentsService.uploadvideoKyc(leadId, files);
  }


  @UseGuards(AuthGuard)
  @Get(':leadId/download-esign')
  async download(
    @Param('leadId') leadId: number,
    @Res() res: Response,
  ) {
    try {
      const file = await this.DocumentsService.getEsign(Number(leadId));

      // Guard: if something already responded, stop.
      if (res.headersSent) {
        // this.logger.warn(
        //   `esign ${leadId}: headers already sent, aborting`,
        // );
        return;
      }

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="esign-${leadId}.pdf"`,
        'Content-Length': String(file.length),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });

      return res.end(file);
    } catch (error) {

      // If we already wrote the response, do NOT try to write again.
      if (res.headersSent) {
        try {
          res.end();
        } catch {
          /* swallow */
        }
        return;
      }

      // Otherwise send a clean JSON error.
      return res.status(500).json({
        success: false,
        statusCode: 500,
        message: 'Unable to download signed document',
      });
    }
  }

}
