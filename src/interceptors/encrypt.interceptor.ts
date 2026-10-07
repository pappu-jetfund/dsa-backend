import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map } from 'rxjs/operators';
import { encrypt } from '../utility/crypto';
import { Request } from 'express';

@Injectable()
export class EncryptInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.originalUrl.split('?')[0];
    if (path === '/metrics' || path.startsWith('/profiling')) {
      return next.handle();
    }

    const isEnabled = process.env.ENABLE_ENCRYPTION === 'true';

    if (!isEnabled) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        return {
          payload: encrypt(data, process.env.CRYPTO_SECRET || 'secret'),
        };
      }),
    );
  }
}
