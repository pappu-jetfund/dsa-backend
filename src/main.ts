import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import bodyParser from 'body-parser';
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


  await app.listen(configService.get<number>('PORT') as number);

  console.log(`App running on port ${process.env.PORT}`);
}

bootstrap();
