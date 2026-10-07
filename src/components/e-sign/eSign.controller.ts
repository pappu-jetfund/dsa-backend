import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { DocumentsService } from "./eSign.services";
import { AuthGuard } from "../../gaurd/auth.gaurd";



@Controller('e-sign')
export class ESignDetail {
  constructor(
    private readonly documentsService: DocumentsService
  ) { }

  @UseGuards(AuthGuard)
  @Get("esign/:leadID")
  async getEsignDetails(@Param("leadID") leadID: string) {
    return this.documentsService.eSignDetails(leadID);
  }
}

