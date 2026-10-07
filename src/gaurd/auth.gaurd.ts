import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../prisma/tenet-prisma.service';
import { HeadRoles, READ_ONLY_ROLES } from '../utility/enums';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly clsService: ClsService,
    private readonly tenantPrisma: TenantPrismaService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const authHeader = request.headers['authorization'];
    const accessToken = authHeader && authHeader.split(' ')[1];

    if (!accessToken) {
      throw new UnauthorizedException('No token provided');
    }

    try {

      const decoded: any = jwt.verify(
        accessToken,
        this.configService.get('ACCESS_TOKEN_SECRET'),
      );


      let user: any = {};

      if (decoded.tag) {
        user = await this.tenantPrisma.client.vendors.findUnique({
          where: {
            id: decoded.id
          },
          select: {
            id: true,
            email: true,
            tag: true,
            parentId: true,
            role: true
          }
        });

        const permissionIds: number[] = user?.role?.permissionIds || [];
        // delete user.role;

        let permissions: any = [];

        if (permissionIds.length > 0) {
          permissions = await this.tenantPrisma.client.dsa_permissions.findMany({
            where: {
              id: {
                in: permissionIds,
              },
            },
            select: {
              // id: true,
              name: true,
              // module: true,
            },
          });
        };

        user.permissions = permissions.map((permissions: { name: string }) => permissions.name);
      } else {
        user = await this.tenantPrisma.client.lms_users.findUnique({
          where: { userID: Number(decoded.id) },
        });
      }

      if (!user) {
        throw new UnauthorizedException('User not found');
      }


      if (user.session_id !== decoded.sessionId) {
        throw new UnauthorizedException(
          'Session expired. Logged in from another device.',
        );
      }

      const method = request.method;


      if (READ_ONLY_ROLES.includes(user.role) && method === "GET") {
        user.role = HeadRoles.READ_ROLE;
      }

      request.user = user;

      this.clsService.set('user', user.userID || user.id);
      this.clsService.set('role', user.role);
      this.clsService.set('tag', user.tag);
      this.clsService.set('parent_id', user.parentId);




      return true;
    } catch (error) {

      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}