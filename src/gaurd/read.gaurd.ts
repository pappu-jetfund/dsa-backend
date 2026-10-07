import { Injectable, CanActivate, ExecutionContext, ForbiddenException, BadRequestException, } from '@nestjs/common';
import { READ_ONLY_ROLES } from '../utility/enums';

@Injectable()
export class MethodPermissionGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();

        const method = request.method;
        const user = request.user;

        if (!user) return true;

        const role = user.role;

        const isReadOnly = READ_ONLY_ROLES.includes(role);




        if (
            isReadOnly &&
            ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
        ) {
            throw new BadRequestException(
                `Role "${role}" does not have permission for ${method}. Only GET allowed.`,
            );
        }

        return true;
    }
}