import { CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException, InternalServerErrorException, } from '@nestjs/common';

export class PermissionGuard implements CanActivate {
    constructor(private requiredPermissions: string | string[]) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        try {
            const request = context.switchToHttp().getRequest();
            const user = request.user;

            if (!user) {
                throw new UnauthorizedException('User not authenticated');
            }

            const permissions: string[] = user.permissions || [];


            if (!permissions.length) {
                throw new ForbiddenException('No permissions assigned');
            }

            // normalize to array
            const required = Array.isArray(this.requiredPermissions) ? this.requiredPermissions : [this.requiredPermissions];

            const hasPermission = required.some((perm) =>
                permissions.includes(perm),
            );

            if (!hasPermission) {
                throw new ForbiddenException(`You do not have permission to perform this action.`,);
            }

            return true;
        } catch (error) {
            if (
                error instanceof UnauthorizedException ||
                error instanceof ForbiddenException
            ) {
                throw error;
            }

            console.error('PermissionGuard Error:', error);

            throw new InternalServerErrorException(
                'Something went wrong while checking permissions',
            );
        }
    }
}