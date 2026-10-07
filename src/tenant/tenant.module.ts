import { Global, Module } from '@nestjs/common';
import { TenantResolverService } from './tenant-resolver.service';

@Global()
@Module({
    providers: [TenantResolverService],
    exports: [TenantResolverService],
})
export class TenantModule { }