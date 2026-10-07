import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { ExceptionsHandler } from '@nestjs/core/exceptions/exceptions-handler';

@Injectable()
export class CreditBuilderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const isCreditBuilderEnabled = process.env.IS_CREDIT_BUILDER === 'true';

    if (!isCreditBuilderEnabled) {
      throw new Error('Credit Builder is not active');
    }

    return true;
  }
}
