import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, } from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: any, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();

        let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';

        if (exception instanceof HttpException) {
            statusCode = exception.getStatus();

            const res = exception.getResponse();

            if (typeof res === 'string') {
                message = res;
            } else if (typeof res === 'object') {
                message = (res as any).message || message;
                if (Array.isArray(message)) {
                    message = message[0];
                }
            }
        } else if (exception?.message) {
            message = exception.message;
        }

        response.status(statusCode).json({
            status: 0,
            statusCode,
            message,
            data: null,
        });
    }
}