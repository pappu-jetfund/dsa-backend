import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(secret: string) {
    return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(data: any, secret: string): string {
    if (data === undefined) {
        // console.log("Encrypt: data is undefined");
        return ""
    }
    const iv = crypto.randomBytes(12);
    const key = crypto.createHash("sha256").update(secret).digest();

    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    const plaintext = Buffer.from(JSON.stringify(data), "utf8");

    const encrypted = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    if (authTag.length !== 16) {
        throw new Error("Invalid auth tag length");
    }

    const combined = Buffer.concat([encrypted, authTag]);

    return `${iv.toString("base64url")}:${combined.toString("base64url")}`;
}

export function decrypt(payload: string, secret: string): any {
    try {
        const [ivStr, combinedStr] = payload.split(":");

        const iv = Buffer.from(ivStr, "base64url");
        const combined = Buffer.from(combinedStr, "base64url");

        const key = getKey(secret);

        const encrypted = combined.subarray(0, combined.length - 16);
        const tag = combined.subarray(combined.length - 16);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final(),
        ]);

        return JSON.parse(decrypted.toString("utf8"));
    } catch (error) {
        // console.error("Decrypt error:", error);
        return null;
    }
}