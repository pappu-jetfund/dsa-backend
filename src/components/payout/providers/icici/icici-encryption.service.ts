import * as crypto from 'crypto';
import * as fs from 'fs';

export class IciciEncryptionService {
  private publicKey: string;
  private privateKey: string;

  constructor(publicKeyPath: string, privateKeyPath: string) {
    this.publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    this.privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  }

  private random16() {
    return crypto.randomBytes(16);
  }

  encrypt(data: any) {
    try {
      console.log(data, "datain enctrption");

      const key = this.random16(); // RANDOMNO1
      const iv = this.random16(); // RANDOMNO2

      // RSA encrypt key
      const encryptedKey = crypto.publicEncrypt(
        {
          key: this.publicKey,
          padding: crypto.constants.RSA_PKCS1_PADDING,
        },
        key,
      );

      const encryptedKeyBase64 = encryptedKey.toString('base64');

      // prepare data
      const json = JSON.stringify(data);
      const combined = Buffer.concat([iv, Buffer.from(json)]);

      // AES encrypt
      const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
      let encryptedData = cipher.update(combined);
      encryptedData = Buffer.concat([encryptedData, cipher.final()]);

      const encryptedDataBase64 = encryptedData.toString('base64');

      console.log("sgdjsgdsjd");


      return {
        encryptedKey: encryptedKeyBase64,
        encryptedData: encryptedDataBase64,
      };
    } catch (err) {
      console.log(err, "err in encrption");

    }
  }

  decrypt(encryptedKey: string, encryptedData: string) {
    // decrypt AES key
    const aesKey = crypto.privateDecrypt(
      {
        key: this.privateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(encryptedKey, 'base64'),
    );

    const buffer = Buffer.from(encryptedData, 'base64');

    const iv = buffer.slice(0, 16);

    const decipher = crypto.createDecipheriv('aes-128-cbc', aesKey, iv);

    let decrypted = decipher.update(buffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    const final = decrypted.slice(16).toString();

    return JSON.parse(final);
  }
}
