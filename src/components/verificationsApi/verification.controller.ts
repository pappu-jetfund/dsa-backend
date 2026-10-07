import { Controller, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { VerificationService } from "./verifications.service";
import { AuthGuard } from "../../gaurd/auth.gaurd";


@Controller('verifications')
export class VerificationController {
    constructor(private VerificationService: VerificationService) { }



    // @UseGuards(AuthGuard)
    @Post("fetch-Employment-history")
    async fetchEmploymentHistory(
        @Query('leadId') leadId: string, @Req() req: Request
    ) {
        return this.VerificationService.fetchEmploymentHistory(leadId, req);
    }

    @UseGuards(AuthGuard)
    @Post('fetch-personal-profile')
    async fetchPersonalProfile(
        @Query('leadId') leadId: string, @Req() req: Request
    ) {
        return this.VerificationService.fetchPersonalProfile(leadId, req);
    }
}