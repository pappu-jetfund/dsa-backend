import { Injectable } from '@nestjs/common';

@Injectable()
export class TenantResolverService {
    private tenantMapping: Record<string, string> = {};

    constructor() {
        this.loadTenants();
    }

    private loadTenants() {
        for (const key of Object.keys(process.env)) {
            if (key.startsWith('TENANT') && key.endsWith('_DOMAIN')) {
                const prefix = key.replace('_DOMAIN', '');

                const domain = process.env[key];
                const dbUrl = process.env[`${prefix}_DB`];

                if (domain && dbUrl) {
                    this.tenantMapping[domain] = dbUrl;
                }
            }
        }

        console.log('✅ Tenant Mapping Loaded:');
    }

    getDbUrl(domain: string): string {
        const cleanDomain = domain?.split(':')[0];

        const dbUrl = this.tenantMapping[cleanDomain];

        if (!dbUrl) {
            throw new Error(`Domain not registered: ${cleanDomain}`);
        }

        return dbUrl;
    }

    // Optional helper (for worker safety)
    isValidDomain(domain: string): boolean {
        const cleanDomain = domain?.split(':')[0];
        return !!this.tenantMapping[cleanDomain];
    }
}