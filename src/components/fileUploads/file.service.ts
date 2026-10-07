import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { lookup as mimeLookup } from 'mime-types';
import { AwsCredentialIdentity } from '@aws-sdk/types';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { RekognitionClient, CompareFacesCommand, } from '@aws-sdk/client-rekognition';
@Injectable()
export class FileService {
  private readonly s3: S3Client;
  private readonly rekognition: RekognitionClient;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');

    // ✅ S3 Credentials
    const s3Credentials: AwsCredentialIdentity = {
      accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY')!,
    };

    // ✅ Rekognition Credentials
    const rekognitionCredentials: AwsCredentialIdentity = {
      accessKeyId: this.configService.get<string>('REKOGNITION_ACCESS_KEY_ID')!,
      secretAccessKey: this.configService.get<string>('REKOGNITION_SECRET_ACCESS_KEY')!,
    };

    // 🪣 S3 Client
    this.s3 = new S3Client({
      region,
      credentials: s3Credentials,
    });

    // 👁️ Rekognition Client
    this.rekognition = new RekognitionClient({
      region,
      credentials: rekognitionCredentials,
    });
  }

  async uploadFileToS3(
    fileBuffer: Buffer,
    fileName: string,
    documentType: string,
    customerId: string,
    leadId: string,
  ) {
    const bucket = this.configService.get<string>('AWS_BUCKET');

    const uniqueFileName = `${uuidv4()}-${fileName}`;

    const key = `${customerId}/${leadId}/${documentType}/${uniqueFileName}`;

    const contentType = mimeLookup(fileName) || 'application/octet-stream';

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await this.s3.send(command);

    const location = `https://${bucket}.s3.${this.configService.get(
      'AWS_REGION',
    )}.amazonaws.com/${key}`;

    return {
      key,
      url: location,
      fileName: uniqueFileName,
      path: `${customerId}/${leadId}/${documentType}`,
    };
  }

  async downloadFileFromS3(bucketName: string, key: string): Promise<Buffer | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      const response = await this.s3.send(command);

      if (!response.Body) {
        throw new Error('File not found or empty in S3');
      }

      const body: any = response.Body;

      // CASE 1: NodeJS stream
      if (typeof body.pipe === 'function') {
        return await this.streamToBuffer(body);
      }

      // CASE 2: Web ReadableStream
      if (body instanceof ReadableStream) {
        const webStream = body as ReadableStream<Uint8Array>;
        const reader = webStream.getReader();
        const chunks: Uint8Array[] = [];

        let done, value;
        while (true) {
          ({ done, value } = await reader.read());
          if (done) break;
          if (value) chunks.push(value);
        }

        return Buffer.concat(chunks);
      }

      // throw new Error('Unknown stream type returned from S3');
      console.error('Unknown stream type returned from S3');

      return null
    } catch (error) {
      console.error('Error downloading file from S3:', error);
      return null
    }
  }

  private streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];

      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', (err) => reject(err));
    });
  }

  async compareFaces(sourceDoc: any, targetDoc: any,) {
    try {

      // const bucket = this.configService.get<string>('AWS_BUCKET');


      // const command = new CompareFacesCommand({
      //   SourceImage: {
      //     S3Object: {
      //       Bucket: bucket,
      //       Name: sourceKey,
      //     },
      //   },
      //   TargetImage: {
      //     S3Object: {
      //       Bucket: bucket,
      //       Name: targetKey,
      //     },
      //   },
      //   SimilarityThreshold: 80,
      // });
      const isFaceCompareEnabled = this.configService.get<string>('ENABLE_FACE_COMPARE') === 'true';

      if (!isFaceCompareEnabled) {
        return {
          matches: [],
          unmatched: 1
        };
      }

      const command = new CompareFacesCommand({
        SourceImage: {
          Bytes: sourceDoc.buffer,
        },
        TargetImage: {
          Bytes: targetDoc.buffer,
        },
        SimilarityThreshold: 80,
      });

      const response = await this.rekognition.send(command);

      return {
        matches: response.FaceMatches?.map((match) => ({
          similarity: match.Similarity,
          confidence: match.Face?.Confidence,
          boundingBox: match.Face?.BoundingBox,
        })) || [],
        unmatched: response.UnmatchedFaces?.length || 0,
      };
    } catch (error) {
      console.error('Rekognition compare error:', error);
      // throw new Error('Face comparison failed');
      return {
        matches: []
      }
    }
  }

  async uploadUserFileToS3(fileBuffer: Buffer, fileName: string, userId: string, documentType: string = 'profile') {
    const bucket = this.configService.get<string>('AWS_BUCKET');

    const uniqueFileName = `${uuidv4()}-${fileName}`;

    const key = `lms_users/${userId}/${uniqueFileName}`;


    const contentType = mimeLookup(fileName) || 'application/octet-stream';

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await this.s3.send(command);

    const location = `https://${bucket}.s3.${this.configService.get(
      'AWS_REGION',
    )}.amazonaws.com/${key}`;

    return {
      key,
      url: location,
      fileName: uniqueFileName,
      path: `lms_users/${userId}/${documentType}`,
    };
  }

  async getPreSignedUrl(options: any) {
    try {
      const { key, expiresIn = 3600 } = options;

      if (!key) throw new BadRequestException('Key is required');

      const bucket = this.configService.get<string>('AWS_BUCKET');


      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.s3, command, { expiresIn });

      return {
        key,
        expiresIn,
        url,
      };
    } catch (error: any) {
      console.error(`S3 Signed URL Error: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate signed URL');
    }
  }

  getPublicUrl(key: string) {
    if (!key) {
      throw new BadRequestException('Key is required');
    }

    const bucketName = this.configService.get<string>('AWS_BUCKET');
    const region = this.configService.get<string>('AWS_REGION');

    const baseUrl = `https://${bucketName}.s3.${region}.amazonaws.com`;

    return `${baseUrl}/${key}`;
  }
}
