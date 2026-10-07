import { Injectable } from "@nestjs/common";
import { TenantPrismaService } from "../../prisma/tenet-prisma.service";
import { bucketKeyMap, RolesTypes } from "../../utility/enums";

@Injectable()
export class BucketService {
    constructor(
        private readonly tenantPrisma: TenantPrismaService,
    ) { }


    async getBucketUsers() {
        const settings = await this.tenantPrisma.client.settings.findMany();

        const getIds = (key: string) => {
            const item = settings.find((s) => s.key === key);
            return item?.userIds || [];
        };

        return {
            Calling: {
                call: getIds("last_call_assign_user_id"),
                presales: getIds("last_presales_assigned_userid"),
            },
            Credit: {
                sanctional: getIds("last_sanctionallo_user_id"),
                repeat: getIds("last_repeat_sanctionallo_user_id"),
            },
            Collection: {
                collection: getIds("last_collection_user_id"),
            },
        };
    }

    async updateBucketUsers(body: any) {
        const { type, subType, userIds } = body;

        const key = bucketKeyMap[type]?.[subType];

        if (!key) {
            throw new Error("Invalid bucket type");
        };


        return await this.tenantPrisma.client.settings.update({
            where: { key },
            data: {
                userIds,
            },
        });

    }
}