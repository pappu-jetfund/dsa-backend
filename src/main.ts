import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import bodyParser from 'body-parser';

// ✅ ADD THESE IMPORTS
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { EncryptInterceptor } from './interceptors/encrypt.interceptor';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  app.enableCors();
  app.setGlobalPrefix('api/v1', {
    exclude: ['metrics', 'profiling', 'profiling/data', 'health'],
  });
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalInterceptors(new EncryptInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.use(bodyParser.text({ type: 'text/plain' }));
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));



  const connection = {
    host: configService.get<string>('REDIS_HOST'),
    port: Number(configService.get('REDIS_PORT')),
    password: configService.get<string>('REDIS_PASSWORD') || undefined,
    db: Number(configService.get('REDIS_DB') ?? 0),
  };



  const iciciQueue = new Queue('icici-status', {
    connection,
  });

  const reloanSmsQueue = new Queue('reloan-sms', {
    connection
  })
  const mailQueue = new Queue('mail-queue', {
    connection,
  });

  const cacheHealthQueue = new Queue('cache-health', {
    connection,
  });

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/queues');

  createBullBoard({
    queues: [new BullMQAdapter(iciciQueue),
    new BullMQAdapter(mailQueue),
    new BullMQAdapter(cacheHealthQueue),
    new BullMQAdapter(reloanSmsQueue),
    ],
    serverAdapter,
  });

  app.use('/queues', serverAdapter.getRouter());
  await app.listen(configService.get<number>('PORT') as number);

  console.log(`App running on port ${process.env.PORT}`);
  console.log(`Bull Board running on http://localhost:${process.env.PORT}/queues`);
}

bootstrap();
