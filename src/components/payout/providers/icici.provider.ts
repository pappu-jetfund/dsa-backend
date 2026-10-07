import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { IciciEncryptionService } from './icici/icici-encryption.service';
import { ICICI_CODE_MAP } from '../icici-codes';

@Injectable()
export class IciciProvider {
  private config: any;
  private encryption!: IciciEncryptionService;

  setConfig(config: any) {

    if (!config?.apiKey || !config?.baseUrl) {
      throw new Error('Invalid ICICI config');
    }

    this.config = config;

    this.encryption = new IciciEncryptionService(
      config.publicKeyPath,
      config.privateKeyPath,
    );
  }

  // 🔹 Helpers
  private formatDateTime() {
    return new Date()
      .toISOString()
      .replace(/[-:T.]/g, '')
      .slice(0, 14);
  }

  private generateRef() {
    return `IMPS${Date.now()}`;
  }

  // 🔹 Error handler (FIXED)
  private handleError(error: any) {

    console.log(error, "error in handle error");


    return {
      success: false,
      error: true,
      message: error?.response?.data?.fault?.faultstring || error?.message?.fault?.faultstring || "icici side error",
      statusCode: error?.response?.status,
    };
  }

  // 🔹 Response mapper (IMPORTANT)
  private mapIciciResponse(data: any) {
    const actCode = String(data.ActCode);

    const config =
      ICICI_CODE_MAP[actCode] || ICICI_CODE_MAP['DEFAULT'];

    return {
      status: config.status,
      category: config.category,
      isRetryable: config.retryable,
      needsStatusCheck: config.needsStatusCheck,
      message: data.Response || config.description,
      bankRRN: data.BankRRN || null,
      actCode,
      raw: data,
    };
  }

  // 🔹 Transfer API
  async transfer(input: any): Promise<any> {
    try {
      if (!this.config?.passCode || !this.config?.bcID) {
        throw new Error('ICICI config missing passCode/bcID');
      }



      const payload = {
        localTxnDtTime: this.formatDateTime(),
        beneAccNo: input.beneAccNo,
        beneIFSC: input.beneIFSC,
        amount: Number(input.amount).toFixed(2),
        tranRefNo: this.generateRef(),
        paymentRef: input.paymentRef || 'FTTransferP2A',
        senderName: input.senderName,
        mobile: input.mobile,
        retailerCode: this.config.retailerCode,
        passCode: this.config.passCode,
        bcID: this.config.bcID,
        aggrId: '',
        crpId: '',
        crpUsr: '',
      };

      console.log(payload, "payload");


      const { encryptedKey, encryptedData }: any = await this.encryption.encrypt(payload);

      console.log(encryptedKey, "encryptedKey");
      console.log(encryptedData, "encryptedData");




      console.log(this.config.baseUrl, "this.config.baseUrl");
      console.log(this.config.apiKey, "this.config.apiKey");


      const response = await axios.post(
        this.config.baseUrl,
        { encryptedKey, encryptedData },
        {
          headers: {
            'Content-Type': 'application/json',
            apikey: this.config.apiKey,
            'x-priority': '0100',
          },
        },
      );

      console.log(response.data, "aaya dsds");



      const decrypted = this.encryption.decrypt(
        response.data.encryptedKey,
        response.data.encryptedData,
      );

      console.log(decrypted, "decrypted");

      return {
        referenceId: payload.tranRefNo,
        ...this.mapIciciResponse(decrypted),
      };
    } catch (error: any) {
      return this.handleError(error);
    }
  }


  async status(transRefNo: string): Promise<any> {
    try {
      if (!transRefNo) {
        throw new Error('referenceId is required');
      }


      function convertToMMDDYYYY(dateStr) {
        const [day, month, year] = dateStr.split("/");
        return `${month}/${day}/${year}`;
      }
      const payload = {
        transRefNo: transRefNo,
        date: convertToMMDDYYYY(new Date().toLocaleDateString()),
        recon360: 'N',
        passCode: this.config.passCode,
        bcID: this.config.bcID,

      };
      const { encryptedKey, encryptedData }: any = await this.encryption.encrypt(payload);

      const response = await axios.post(
        this.config.statusCheckURL,
        { "requestId": "", "service": "", encryptedKey, "oaepHashingAlgorithm": "NONE", "iv": "", encryptedData, "clientInfo": "", "optionalParam": "" },
        {
          headers: {
            'Content-Type': 'application/json',
            apikey: this.config.apiKey,
            'x-priority': '0100',
          },
        },
      );

      const decrypted = this.encryption.decrypt(
        response.data.encryptedKey,
        response.data.encryptedData,
      );


      const res = decrypted.ImpsResponse;

      let status = 'PENDING';

      return {
        ...this.mapIciciResponse(res),
      };

      // return {
      //   success: true,
      //   transRefNo,
      //   status,
      //   bankRRN: res.BankRRN,
      //   message: res.Response,
      //   raw: decrypted,
      // };
    } catch (error: any) {
      return this.handleError(error);
    }
  }
}
