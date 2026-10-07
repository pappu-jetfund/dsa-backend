import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AuthService } from '../auth/auth.service';
import { FileService } from '../fileUploads/file.service';
import * as fs from 'fs';
import * as path from 'path';
import * as mime from 'mime-types';
import { document_status } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly clsService: ClsService,
    private configService: ConfigService,
    private readonly authService: AuthService,
    private readonly fileService: FileService,
    private readonly httpService: HttpService,
  ) { }

  async downloadDocument(documentID: string, documentFile: string) {
    try {
      let document;

      const decodedDocumentFile = decodeURIComponent(documentFile);
      document = await this.tenantPrisma.client.document.findUnique({
        where: {
          documentID: Number(documentID),
          documentFile: decodedDocumentFile,
        },
        select: { documentFile: true },
      });

      if (!document) {
        document = await this.tenantPrisma.client.bankstatement.findUnique({
          where: {
            id: Number(documentID),
            documentFile: decodedDocumentFile,
          },
          select: { documentFile: true },
        });
      }

      if (!document) {
        return { statusCode: 404, message: 'Document not found' };
      }

      const { buffer, mimeType } = await this.resolveDocument(
        document.documentFile,
      );

      return {
        statusCode: 200,
        file: buffer.toString('base64'),
        contentType: mimeType,
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        message: error.message || 'Failed to Load Documents',
      };
    }
  }

  async resolveDocument(documentFile: string,): Promise<{ buffer: Buffer | string; mimeType: string }> {
    const localPath = '/home/projects/speedoloan-crm/uploads/kyc/';
    const localFilePath = path.join(localPath, documentFile);



    if (fs.existsSync(localFilePath)) {


      const buffer = await fs.promises.readFile(localFilePath);

      return {
        buffer,
        mimeType: mime.lookup(localFilePath) || 'application/octet-stream',
      };
    }


    const bucket: any = process.env.AWS_BUCKET;
    const s3Buffer = await this.fileService.downloadFileFromS3(
      bucket,
      documentFile,
    );

    return {
      buffer: s3Buffer || "",
      mimeType: mime.lookup(documentFile) || 'application/octet-stream',
    };
  }

  async getProfilePicture(leadId: string) {
    try {
      if (!leadId) {
        return { statusCode: 400, message: 'Lead ID is required' };
      }
      const lead = await this.tenantPrisma.client.leads.findUnique({
        where: { leadID: Number(leadId) },
        include: {
          customer: true,
        },
      });

      if (!lead) {
        return { statusCode: 404, message: 'Lead not found' };
      }
      const documents: any = await this.tenantPrisma.client.document.findFirst({
        where: {
          customerID: Number(lead.customer?.customerID),
          documentType: 'selfie',
        },
        select: {
          documentID: true,
          documentType: true,
          documentFile: true,
        },
        orderBy: {
          uploadedDate: "desc"
        }
      });

      if (!documents) {
        return {
          statusCode: 200,
          file: "",
          contentType: "",
        };
      }

      const { buffer, mimeType } = await this.resolveDocument(
        documents.documentFile,
      );

      return {
        statusCode: 200,
        file: buffer.toString('base64'),
        contentType: mimeType,
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        message: err.message || 'Failed to fetch Profle Picture',
      };
    }
  }

  async getKycVideo(id: string) {
    try {
      const videoDetails: any =
        await this.tenantPrisma.client.videokyc.findUnique({
          where: { id: Number(id) },
          select: { videoPath: true },
        });

      if (!videoDetails) {
        return { statusCode: 404, message: 'Document not found' };
      }

      const { buffer, mimeType } = await this.resolveDocumentVideo(
        videoDetails.videoPath,
      );

      return {
        statusCode: 200,
        buffer,
        contentType: mimeType,
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        message: err.message || 'Failed to fetch Video',
      };
    }
  }

  async resolveDocumentVideo(
    documentFile: string,
  ): Promise<{ buffer: Buffer | String; mimeType: string }> {
    const localPath = '/home/projects/speedoloan-crm/uploads/kyc-videos/';
    const localFilePath = path.join(localPath, documentFile);



    if (fs.existsSync(localFilePath)) {

      const buffer = await fs.promises.readFile(localFilePath);

      return {
        buffer,
        mimeType: mime.lookup(localFilePath) || 'application/octet-stream',
      };
    }


    const bucket: any = process.env.AWS_BUCKET;
    const s3Buffer = await this.fileService.downloadFileFromS3(
      bucket,
      documentFile,
    );

    return {
      buffer: s3Buffer || "",
      mimeType: mime.lookup(documentFile) || 'application/octet-stream',
    };
  }

  async uploadFilesWithTypes(
    body: any,
    files: Express.Multer.File[],
    leadId: string,
  ) {
    try {
      if (!leadId) {
        return {
          statusCode: 400,
          msg: 'leadId is required',
        };
      }

      const lead: any = await this.tenantPrisma.client.leads.findUnique({
        where: { leadID: Number(leadId) },
        include: {
          customer: true,
        },
      });

      if (!lead) {
        return { statusCode: 404, message: 'Lead not found' };
      }

      if (!files || files.length === 0) {
        return { statusCode: 400, msg: 'No file uploaded' };
      }

      if (!body.type) {
        return { statusCode: 400, msg: 'Document type is required' };
      }

      const allowedTypes = [
        'Payment Screenshot',
        'Bank Statement',
        'Salary Slip',
        'Aadhar Profile',
        'pan-card',
        'selfie',
        'other',
      ];

      if (!allowedTypes.includes(body.type)) {
        return {
          statusCode: 400,
          msg: `Invalid type. Allowed: ${allowedTypes.join(', ')}`,
        };
      }

      const userData = await this.clsService.get('user');

      const uploadedFiles: any[] = [];
      const documentEntries: any[] = [];

      const result = await this.tenantPrisma.client.$transaction(async (tx) => {
        for (const file of files) {
          const uploadResult = await this.fileService.uploadFileToS3(
            file.buffer,
            file.originalname,
            body.type,
            String(lead.customer.customerID),
            String(lead.leadID),
          );

          uploadedFiles.push(uploadResult);

          const documentData: any = {
            customerID: Number(lead.customer.customerID),
            documentType: body.type,
            documentFile: uploadResult.key,
            status: document_status.Pending,
            verifiedBy: Number(userData),
            uploadBy: Number(userData),
            uploadedDate: new Date(),
          };

          if (body.password) {
            documentData.password = body.password;
          }

          const docEntry = await tx.document.create({
            data: documentData,
          });

          documentEntries.push(docEntry);
        }

        return {
          uploadedFiles,
          documentEntries,
        };
      });

      return {
        statusCode: 200,
        message: 'Files uploaded & documents created successfully',
        data: result,
      };
    } catch (err: any) {
      console.error('Upload failed:', err);
      return {
        statusCode: 500,
        error: 'Failed to Uplaod Documents',
        details: err.message,
      };
    }
  }

  async uploadvideoKyc(leadId: string, files: Express.Multer.File[]) {
    try {
      if (!leadId) {
        return {
          statusCode: 400,
          msg: 'leadId is required',
        };
      }

      const lead: any = await this.tenantPrisma.client.leads.findUnique({
        where: { leadID: Number(leadId) },
        include: {
          customer: true,
        },
      });

      if (!lead) {
        return { statusCode: 404, message: 'Lead not found' };
      }

      const video: any = await this.tenantPrisma.client.videokyc.findUnique({
        where: { leadID: Number(leadId), status: 'completed' },
      });

      if (video) {
        return { statusCode: 404, message: 'Video is Already Present' };
      }

      if (!files || files.length === 0) {
        return { statusCode: 400, msg: 'No file uploaded' };
      }

      const uploadedFiles: any[] = [];
      const documentEntries: any[] = [];

      const userData = await this.clsService.get('user');

      const result = await this.tenantPrisma.client.$transaction(async (tx) => {
        for (const file of files) {
          const uploadResult = await this.fileService.uploadFileToS3(
            file.buffer,
            file.originalname,
            'kyc-videos',
            String(lead.customer.customerID),
            String(lead.leadID),
          );

          uploadedFiles.push(uploadResult);

          const docEntry = await tx.videokyc.create({
            data: {
              leadID: Number(lead.leadID),
              status: 'completed',
              completedAt: new Date(),
              videoPath: uploadResult.key,
              location: 'lms',
            } as any,
          });
          documentEntries.push(docEntry);

          const logs = await tx.callhistorylogs.create({
            data: {
              customerID: Number(lead.customer.customerID),
              leadID: Number(lead.leadID),
              callType: 'IVR',
              status: lead.status,
              remark: 'videoKycUpload',
              calledBy: userData,
              noteli: '',
            } as any,
          });
        }
        return {
          uploadedFiles,
          documentEntries,
        };
      });

      return {
        statusCode: 200,
        message: 'Files uploaded & documents created successfully',
        data: result,
      };
    } catch (err: any) {
      console.error('Upload failed:', err);
      return {
        statusCode: 500,
        error: 'Failed to Uplaod Documents',
        details: err.message,
      };
    }
  }


  async getEsign(leadID: number): Promise<Buffer> {
    if (!leadID) {
      throw new BadRequestException('Lead ID is required');
    }

    const documentData =
      await this.tenantPrisma.client.eagreement.findFirst({
        where: {
          leadID: Number(leadID),
          isSigned: true,
        },
        select: {
          document_id: true,
          isSigned: true,
        },
      });

    if (!documentData?.document_id) {
      throw new NotFoundException('Signed document not found');
    }

    try {
      const response = await this.httpService.axiosRef.get(
        'https://api.digio.in/v2/client/document/download',
        {
          params: { document_id: documentData.document_id },
          responseType: 'arraybuffer',
          timeout: 30_000, // 🔑 add a timeout so requests don't hang
          headers: {
            Accept: '*/*',
            Authorization:
              'Basic ' +
              Buffer.from(
                `${process.env.DIGIO_API_KEY}:${process.env.DIGIO_API_SECRET}`,
              ).toString('base64'),
          },
        },
      );

      const buf = Buffer.from(response.data);

      if (!buf.length) {
        throw new BadRequestException(
          'Digio returned an empty document',
        );
      }

      return buf;
    } catch (err: any) {
      // If it's already an HttpException we threw above, rethrow as-is.
      if (err instanceof BadRequestException) throw err;

      console.error(
        'Digio download failed:',
        err.response?.status,
        err.response?.data || err.message,
      );

      throw new BadRequestException(
        'Unable to download signed document from Digio',
      );
    }
  }
}
