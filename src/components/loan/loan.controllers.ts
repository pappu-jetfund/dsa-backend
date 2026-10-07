import {
    Controller,
    Get,
    Logger,
    Param,
    Req,
    Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { loanService } from './loan.services';

@Controller('loan')
export class loanController {
    private readonly logger = new Logger(loanController.name);

    constructor(private readonly loanService: loanService) { }

    @Get('statement-of-account/:leadID/pdf')
    async downloadStatementPdf(
        @Param('leadID') leadID: string,
        @Res() res: Response,
        @Req() req: Request,
    ) {
        try {
            const soa = await this.loanService.getStatementOfAccount(
                leadID,
                req as any,
            );

            if (!soa.success) {
                return res.status(soa.statusCode || 400).json(soa);
            }

            if (!soa.data) {
                return res.status(500).json({
                    success: false,
                    statusCode: 500,
                    message: 'Statement data unavailable',
                });
            }

            const pdfBuffer =
                await this.loanService.generateStatementPdf(soa.data);

            const loanNo = soa.data.loan?.loanNo || leadID;

            if (res.headersSent) {
                this.logger.warn(
                    'SOA PDF: headers already sent, aborting',
                );
                return;
            }

            res.status(200);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="SOA-${loanNo}.pdf"`,
            );
            res.setHeader('Content-Length', pdfBuffer.length);
            res.setHeader(
                'Cache-Control',
                'no-cache, no-store, must-revalidate',
            );

            return res.end(pdfBuffer);
        } catch (error) {
            this.logger.error('SOA PDF ERROR:', error as any);

            if (res.headersSent) {
                try {
                    res.end();
                } catch {
                    /* swallow */
                }
                return;
            }

            return res.status(500).json({
                success: false,
                statusCode: 500,
                message: 'Failed to generate SOA PDF',
            });
        }
    }
}