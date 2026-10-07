import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { map, catchError } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const url = request.originalUrl;

    if (!url.includes('/dsa')) {
      return next.handle();
    }

    return next.handle().pipe(
      map((response) => {
        if (response?.status !== undefined) return response;

        return {
          status: 1,
          statusCode: 200,
          message: response?.message || 'Success',
          data: response?.data ?? response,
        };
      }),

      catchError((err) => {
        let message = 'Internal server error';
        let statusCode = 500;

        if (err instanceof HttpException) {
          statusCode = err.getStatus();

          const res = err.getResponse();

          if (typeof res === 'string') {
            message = res;
          } else {
            message = (res as any).message || message;
          }
        }

        return throwError(
          () =>
            new HttpException(
              {
                status: 0,
                statusCode,
                message,
                data: null,
              },
              statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
            ),
        );
      }),
    );
  }
}