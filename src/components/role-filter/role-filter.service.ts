import { Injectable } from '@nestjs/common';
import { ROLE_FILTER_CONFIG } from './role-filter.config';

@Injectable()
export class RoleFilterService {
    getLeadWhereFilter(userId: number, role: string) {
        const where: any = {};


        switch (role) {
            case 'Credit Team':
                if (ROLE_FILTER_CONFIG.CREDIT_TEAM) {
                    where.sanctionalloUID = Number(userId);
                }
                break;

            case 'Calling Team':
                if (ROLE_FILTER_CONFIG.CALLING_TEAM) {
                    where.callAssign = Number(userId);
                }
                break;

            case 'Collection Team':
                if (ROLE_FILTER_CONFIG.COLLECTION_TEAM) {
                    where.collectionUID = Number(userId);
                }
                break;


            default:
                break;
        }

        return where;
    }
}