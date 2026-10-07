export class CacheKey {
    static custom(...parts: (string | number)[]) {
        return parts.join(':');
    }

    static lead(
        tenant: string,
        leadID: number,
        tab: string,
    ) {
        return [
            'lms',
            tenant,
            'lead',
            tab,
            leadID,
        ].join(':');
    }

    static customer(
        tenant: string,
        customerID: number,
    ) {
        return [
            'lms',
            tenant,
            'customer',
            customerID,
        ].join(':');
    }

    static loan(
        tenant: string,
        loanID: number,
    ) {
        return [
            'lms',
            tenant,
            'loan',
            loanID,
        ].join(':');
    }

    static user(
        tenant: string,
        userID: number,
    ) {
        return [
            'lms',
            tenant,
            'user',
            userID,
        ].join(':');
    }
}