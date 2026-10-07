import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenet-prisma.service';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { SmsService } from '../sms/sms.service';
import { ClsService } from 'nestjs-cls';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { penalConfig } from '../../common/config/penal.config';

@Injectable()
export class loanService {
    private readonly logger = new Logger(loanService.name);

    /**
     * In-memory cache for header/footer images so we don't
     * re-download them on every PDF request.
     * Key   : URL or local path
     * Value : Buffer (image bytes)
     */
    private readonly imageCache = new Map<string, Buffer>();

    constructor(
        private readonly tenantPrisma: TenantPrismaService,
        private configService: ConfigService,
        private readonly clsService: ClsService,
        private readonly authService: AuthService,
        private readonly smsService: SmsService,
    ) { }

    // =====================================================================
    // IMAGE LOADER (URL or local path → Buffer)
    // =====================================================================

    /**
     * Loads an image from a remote URL or local path and returns it
     * as a Buffer suitable for PDFKit's doc.image().
     *
     * Results are cached in-memory so repeated PDF generation doesn't
     * re-download the same asset.
     *
     * @param src  http(s):// URL, absolute path, or path relative to cwd
     * @returns    Buffer on success, null on failure (caller falls back)
     */
    private async loadImage(src?: string | null): Promise<Buffer | null> {
        if (!src) return null;

        // Cache hit
        const cached = this.imageCache.get(src);
        if (cached) return cached;

        try {
            let buffer: Buffer;

            if (/^https?:\/\//i.test(src)) {
                // ---- Remote URL ----
                const res = await fetch(src);

                if (!res.ok) {
                    throw new Error(
                        `HTTP ${res.status} ${res.statusText} while fetching ${src}`,
                    );
                }

                const arrayBuf = await res.arrayBuffer();
                buffer = Buffer.from(arrayBuf);
            } else {
                // ---- Local file ----
                const abs = path.isAbsolute(src)
                    ? src
                    : path.join(process.cwd(), src);

                if (!fs.existsSync(abs)) {
                    throw new Error(`Local file not found: ${abs}`);
                }

                buffer = fs.readFileSync(abs);
            }

            this.imageCache.set(src, buffer);
            return buffer;
        } catch (err) {
            this.logger.warn(
                `Failed to load image from "${src}": ${(err as Error).message}`,
            );
            return null;
        }
    }

    // =====================================================================
    // PDF GENERATION
    // =====================================================================

    async generateStatementPdf(data: {
        loan: any;
        roi: number;
        repayDate: Date | string | null;
        statementOfAccount: any[];
        summary: {
            principalOutstanding: number;
            interestOutstanding: number;
            penalInterestOutstanding: number;
            bounceChargesOutstanding: number;
            totalPayable: number;
        };
    }): Promise<Buffer> {
        // ---------------------------------------------------------------
        // Load header/footer images ASYNC before creating the PDFDocument
        // ---------------------------------------------------------------
        const headerUrl = this.configService.get<string>(
            'SERVER_DOMAIN_NAME_HEADER',
        );
        const footerUrl = this.configService.get<string>(
            'SERVER_DOMAIN_NAME_FOOTER',
        );

        const [headerBuffer, footerBuffer] = await Promise.all([
            this.loadImage(headerUrl),
            this.loadImage(footerUrl),
        ]);

        const companyName =
            this.configService.get<string>('COMPANY_NAME') ||
            'Your Company Name';
        const companyAddress =
            this.configService.get<string>('COMPANY_ADDRESS') ||
            'Company Address Line';
        const companyWebsite =
            this.configService.get<string>('COMPANY_WEBSITE') ||
            'www.example.com';

        // ---------------------------------------------------------------
        // Now build the PDF (same synchronous flow as before)
        // ---------------------------------------------------------------
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 0,
                    autoFirstPage: true,
                    bufferPages: true,
                    compress: true,
                });

                const chunks: Buffer[] = [];
                doc.on('data', (c) =>
                    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)),
                );
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                // ---------------------------------------------------------
                // LAYOUT
                // ---------------------------------------------------------

                const PAGE_W = doc.page.width;   // 595.28
                const PAGE_H = doc.page.height;  // 841.89

                const MARGIN_X = 40;
                const LEFT = MARGIN_X;
                const RIGHT = PAGE_W - MARGIN_X;
                const CONTENT_W = RIGHT - LEFT;

                // Header / footer band heights
                const HEADER_H = headerBuffer ? 90 : 110;
                const FOOTER_H = footerBuffer ? 70 : 60;

                const CONTENT_TOP = HEADER_H + 10;
                const CONTENT_BOTTOM = PAGE_H - FOOTER_H - 10;

                // ---------------------------------------------------------
                // COLORS
                // ---------------------------------------------------------

                const COLOR = {
                    primary: '#1F2937',
                    accent: '#2563EB',
                    text: '#111827',
                    muted: '#6B7280',
                    line: '#D1D5DB',
                    softBg: '#F9FAFB',
                    boxBorder: '#9CA3AF',
                    sectionBg: '#E5E7EB',
                    totalBg: '#F3F4F6',
                    totalLabel: '#374151',
                    white: '#FFFFFF',
                };

                // ---------------------------------------------------------
                // FORMATTERS
                // ---------------------------------------------------------

                const formatCurrency = (v: number) =>
                    `Rs. ${Number(v || 0).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}`;

                const formatDate = (d: any) => {
                    if (!d) return '-';
                    const p = new Date(d);
                    if (isNaN(p.getTime())) return '-';
                    return p.toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                    });
                };

                const formatDateTime = (d: any) => {
                    if (!d) return '-';
                    const p = new Date(d);
                    if (isNaN(p.getTime())) return '-';
                    return p.toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                    });
                };

                const truncate = (s: string, n: number) =>
                    s.length > n ? s.slice(0, n - 1) + '…' : s;

                const loanNo = data.loan?.loanNo || 'SOA';

                let y = CONTENT_TOP;

                // ---------------------------------------------------------
                // HEADER
                // ---------------------------------------------------------

                const drawHeader = () => {
                    if (headerBuffer) {
                        try {
                            doc.image(headerBuffer, 0, 0, {
                                width: PAGE_W,
                                height: HEADER_H,
                            });
                        } catch (e) {
                            this.logger.warn(
                                `Header image render failed: ${(e as Error).message}`,
                            );
                            drawVectorHeader();
                        }
                    } else {
                        drawVectorHeader();
                    }

                    doc
                        .moveTo(0, HEADER_H)
                        .lineTo(PAGE_W, HEADER_H)
                        .lineWidth(1)
                        .stroke(COLOR.accent);
                };

                const drawVectorHeader = () => {
                    doc.rect(0, 0, 6, HEADER_H).fill(COLOR.primary);

                    doc
                        .fillColor(COLOR.primary)
                        .font('Helvetica-Bold')
                        .fontSize(18)
                        .text(companyName, 20, 18, { lineBreak: false });

                    doc
                        .font('Helvetica')
                        .fontSize(8)
                        .fillColor(COLOR.muted)
                        .text(companyAddress, 20, 42, {
                            width: 380,
                            lineBreak: false,
                        });

                    doc
                        .font('Helvetica')
                        .fontSize(8)
                        .fillColor(COLOR.muted)
                        .text(companyWebsite, 20, 56, { lineBreak: false });

                    doc
                        .font('Helvetica-Bold')
                        .fontSize(13)
                        .fillColor(COLOR.primary)
                        .text('STATEMENT OF ACCOUNT', RIGHT - 220, 20, {
                            width: 220,
                            align: 'right',
                            lineBreak: false,
                        });

                    doc
                        .font('Helvetica')
                        .fontSize(8)
                        .fillColor(COLOR.muted)
                        .text(`Loan No: ${loanNo}`, RIGHT - 220, 42, {
                            width: 220,
                            align: 'right',
                            lineBreak: false,
                        });

                    doc
                        .font('Helvetica')
                        .fontSize(7)
                        .fillColor(COLOR.muted)
                        .text(
                            `Generated: ${formatDateTime(new Date())}`,
                            RIGHT - 260,
                            56,
                            { width: 260, align: 'right', lineBreak: false },
                        );

                    doc.fillColor(COLOR.text);
                };

                // ---------------------------------------------------------
                // FOOTER
                // ---------------------------------------------------------

                const drawFooter = (
                    pageNumber: number,
                    totalPages: number,
                ) => {
                    const footerTop = PAGE_H - FOOTER_H;

                    if (footerBuffer) {
                        try {
                            doc.image(footerBuffer, 0, footerTop, {
                                width: PAGE_W,
                                height: FOOTER_H,
                            });
                        } catch (e) {
                            this.logger.warn(
                                `Footer image render failed: ${(e as Error).message}`,
                            );
                            drawVectorFooter(footerTop);
                        }
                    } else {
                        drawVectorFooter(footerTop);
                    }

                    // Page number overlay (always on top)
                    doc
                        .font('Helvetica-Bold')
                        .fontSize(7)
                        .fillColor(COLOR.muted)
                        .text(
                            `Page ${pageNumber} of ${totalPages}`,
                            RIGHT - 120,
                            PAGE_H - 14,
                            { width: 120, align: 'right', lineBreak: false },
                        );

                    doc.fillColor(COLOR.text);
                };

                const drawVectorFooter = (footerTop: number) => {
                    doc
                        .moveTo(LEFT, footerTop)
                        .lineTo(RIGHT, footerTop)
                        .lineWidth(0.5)
                        .stroke(COLOR.line);

                    doc
                        .font('Helvetica')
                        .fontSize(7)
                        .fillColor(COLOR.muted)
                        .text(
                            `${companyName} • ${companyWebsite}`,
                            LEFT,
                            footerTop + 8,
                            { lineBreak: false },
                        );

                    doc
                        .font('Helvetica')
                        .fontSize(7)
                        .fillColor(COLOR.muted)
                        .text(
                            'This is a computer-generated statement.',
                            LEFT + 180,
                            footerTop + 8,
                            {
                                width: 200,
                                align: 'center',
                                lineBreak: false,
                            },
                        );

                    doc.fillColor(COLOR.text);
                };

                // ---------------------------------------------------------
                // PAGE MANAGEMENT
                // ---------------------------------------------------------

                const createNewPage = (withTableHeader = false) => {
                    doc.addPage();
                    y = CONTENT_TOP;
                    if (withTableHeader) drawTableHeader();
                };

                // ---------------------------------------------------------
                // SECTION TITLE / INFO / TABLE HEADER  (unchanged)
                // ---------------------------------------------------------

                const drawSectionTitle = (title: string) => {
                    if (y + 34 > CONTENT_BOTTOM) createNewPage();

                    doc.rect(LEFT, y, CONTENT_W, 24).fill(COLOR.sectionBg);
                    doc.rect(LEFT, y, 3, 24).fill(COLOR.accent);

                    doc
                        .fillColor(COLOR.text)
                        .font('Helvetica-Bold')
                        .fontSize(9)
                        .text(title, LEFT + 12, y + 8, { lineBreak: false });

                    doc.fillColor(COLOR.text);
                    y += 34;
                };

                const drawInfo = (
                    label: string,
                    value: string,
                    x: number,
                    width: number,
                ) => {
                    doc
                        .font('Helvetica')
                        .fontSize(7)
                        .fillColor(COLOR.muted)
                        .text(label.toUpperCase(), x, y, {
                            width,
                            lineBreak: false,
                        });

                    doc
                        .font('Helvetica-Bold')
                        .fontSize(9)
                        .fillColor(COLOR.text)
                        .text(truncate(value || '-', 30), x, y + 11, {
                            width,
                            lineBreak: false,
                        });

                    doc.fillColor(COLOR.text);
                };

                const drawTableHeader = () => {
                    doc.rect(LEFT, y, CONTENT_W, 25).fill(COLOR.primary);

                    doc
                        .fillColor(COLOR.white)
                        .font('Helvetica-Bold')
                        .fontSize(7);

                    doc.text('DATE', LEFT + 8, y + 9, {
                        width: 55,
                        lineBreak: false,
                    });
                    doc.text('DESCRIPTION', LEFT + 68, y + 9, {
                        width: 230,
                        lineBreak: false,
                    });
                    doc.text('DEBIT', LEFT + 300, y + 9, {
                        width: 65,
                        align: 'right',
                        lineBreak: false,
                    });
                    doc.text('CREDIT', LEFT + 370, y + 9, {
                        width: 65,
                        align: 'right',
                        lineBreak: false,
                    });
                    doc.text('BALANCE', LEFT + 440, y + 9, {
                        width: 75,
                        align: 'right',
                        lineBreak: false,
                    });

                    doc.fillColor(COLOR.text);
                    y += 25;
                };

                // =========================================================
                // PAGE 1 CONTENT
                // =========================================================

                y = CONTENT_TOP;

                drawSectionTitle('LOAN DETAILS');

                drawInfo(
                    'Loan Number',
                    String(data.loan?.loanNo || '-'),
                    45,
                    150,
                );
                drawInfo(
                    'Disbursal Amount',
                    formatCurrency(Number(data.loan?.disbursalAmount || 0)),
                    210,
                    150,
                );
                drawInfo(
                    'Disbursal Date',
                    formatDate(data.loan?.disbursalDate),
                    380,
                    150,
                );

                y += 43;

                let dpd = 0;
                if (data.repayDate) {
                    const today = new Date();
                    const repayDate = new Date(data.repayDate);
                    if (!isNaN(repayDate.getTime())) {
                        dpd = Math.max(
                            0,
                            Math.floor(
                                (today.getTime() - repayDate.getTime()) /
                                (1000 * 60 * 60 * 24),
                            ),
                        );
                    }
                }

                drawInfo(
                    'Interest Rate',
                    `${Number(data.roi || 0).toFixed(2)}% per day`,
                    45,
                    150,
                );
                drawInfo(
                    'Repayment Date',
                    formatDate(data.repayDate),
                    210,
                    150,
                );
                drawInfo('Current DPD', String(dpd), 380, 150);

                y += 50;

                drawSectionTitle('OUTSTANDING SUMMARY');

                const summaryItems = [
                    {
                        label: 'PRINCIPAL',
                        value: data.summary.principalOutstanding,
                    },
                    {
                        label: 'INTEREST',
                        value: data.summary.interestOutstanding,
                    },
                    {
                        label: 'PENAL INTEREST',
                        value: data.summary.penalInterestOutstanding,
                    },
                    {
                        label: 'BOUNCE CHARGES',
                        value: data.summary.bounceChargesOutstanding,
                    },
                ];

                const boxGap = 8;
                const boxWidth = (CONTENT_W - boxGap * 3) / 4;
                const boxHeight = 68;

                summaryItems.forEach((item, i) => {
                    const x = LEFT + i * (boxWidth + boxGap);

                    doc
                        .roundedRect(x, y, boxWidth, boxHeight, 4)
                        .lineWidth(0.7)
                        .stroke(COLOR.line);

                    doc.rect(x, y, boxWidth, 3).fill(COLOR.accent);

                    doc
                        .font('Helvetica')
                        .fontSize(7)
                        .fillColor(COLOR.muted)
                        .text(item.label, x + 10, y + 14, {
                            width: boxWidth - 20,
                            lineBreak: false,
                        });

                    doc
                        .font('Helvetica-Bold')
                        .fontSize(10)
                        .fillColor(COLOR.text)
                        .text(formatCurrency(item.value), x + 10, y + 38, {
                            width: boxWidth - 20,
                            lineBreak: false,
                        });
                });

                doc.fillColor(COLOR.text);
                y += 85;

                if (y + 55 > CONTENT_BOTTOM) createNewPage();

                doc.roundedRect(LEFT, y, CONTENT_W, 55, 5).fill(COLOR.totalBg);
                doc.rect(LEFT, y, 4, 55).fill(COLOR.primary);

                doc
                    .font('Helvetica-Bold')
                    .fontSize(9)
                    .fillColor(COLOR.totalLabel)
                    .text(
                        'TOTAL OUTSTANDING / PAYABLE',
                        LEFT + 18,
                        y + 20,
                        { lineBreak: false },
                    );

                doc
                    .font('Helvetica-Bold')
                    .fontSize(16)
                    .fillColor(COLOR.text)
                    .text(
                        formatCurrency(data.summary.totalPayable),
                        330,
                        y + 16,
                        { width: 210, align: 'right', lineBreak: false },
                    );

                doc.fillColor(COLOR.text);
                y += 80;

                // ---------------- TRANSACTION HISTORY ----------------

                drawSectionTitle('TRANSACTION HISTORY');
                drawTableHeader();

                const transactions = data.statementOfAccount || [];

                for (let i = 0; i < transactions.length; i++) {
                    const entry = transactions[i];
                    const narration = truncate(
                        String(entry.narration || '-'),
                        110,
                    );
                    const approxLines = Math.max(
                        1,
                        Math.min(2, Math.ceil(narration.length / 55)),
                    );
                    const rowHeight = approxLines * 11 + 14;

                    if (y + rowHeight > CONTENT_BOTTOM) {
                        createNewPage(true);
                    }

                    if (i % 2 === 0) {
                        doc
                            .rect(LEFT, y, CONTENT_W, rowHeight)
                            .fill(COLOR.softBg);
                    }

                    doc.font('Helvetica').fontSize(7).fillColor(COLOR.text);

                    doc.text(formatDate(entry.date), LEFT + 8, y + 9, {
                        width: 55,
                        lineBreak: false,
                    });

                    doc.text(narration, LEFT + 68, y + 8, {
                        width: 225,
                        lineBreak: true,
                    });

                    doc.text(
                        Number(entry.debit || 0) > 0
                            ? formatCurrency(Number(entry.debit))
                            : '-',
                        LEFT + 300,
                        y + 9,
                        { width: 65, align: 'right', lineBreak: false },
                    );

                    doc.text(
                        Number(entry.credit || 0) > 0
                            ? formatCurrency(Number(entry.credit))
                            : '-',
                        LEFT + 370,
                        y + 9,
                        { width: 65, align: 'right', lineBreak: false },
                    );

                    doc.text(
                        formatCurrency(Number(entry.balance || 0)),
                        LEFT + 440,
                        y + 9,
                        { width: 75, align: 'right', lineBreak: false },
                    );

                    doc
                        .moveTo(LEFT, y + rowHeight)
                        .lineTo(RIGHT, y + rowHeight)
                        .lineWidth(0.4)
                        .stroke(COLOR.line);

                    y += rowHeight;
                }

                // ---------------- FINAL OUTSTANDING ----------------

                if (y + 140 > CONTENT_BOTTOM) createNewPage();

                y += 20;

                doc
                    .font('Helvetica-Bold')
                    .fontSize(11)
                    .fillColor(COLOR.text)
                    .text('FINAL OUTSTANDING', LEFT, y, { lineBreak: false });

                y += 20;

                doc
                    .roundedRect(LEFT, y, CONTENT_W, 60, 5)
                    .lineWidth(0.8)
                    .stroke(COLOR.boxBorder);

                doc.rect(LEFT, y, 4, 60).fill(COLOR.accent);

                doc
                    .font('Helvetica')
                    .fontSize(9)
                    .fillColor(COLOR.totalLabel)
                    .text(
                        'Total amount payable as per this statement',
                        LEFT + 18,
                        y + 24,
                        { lineBreak: false },
                    );

                doc
                    .font('Helvetica-Bold')
                    .fontSize(16)
                    .fillColor(COLOR.text)
                    .text(
                        formatCurrency(data.summary.totalPayable),
                        330,
                        y + 20,
                        { width: 210, align: 'right', lineBreak: false },
                    );

                doc.fillColor(COLOR.text);
                y += 85;

                // ---------------- DISCLAIMER ----------------

                doc
                    .font('Helvetica')
                    .fontSize(7)
                    .fillColor(COLOR.muted)
                    .text(
                        'This Statement of Account is generated electronically based on the loan and transaction information available in our records as of the statement generation date.',
                        LEFT,
                        y,
                        { width: CONTENT_W, lineGap: 2 },
                    );

                y += 30;

                doc
                    .font('Helvetica')
                    .fontSize(7)
                    .fillColor(COLOR.muted)
                    .text(
                        `Statement Generated On: ${formatDateTime(new Date())}`,
                        LEFT,
                        y,
                        { lineBreak: false },
                    );

                // =========================================================
                // STAMP HEADER + FOOTER ON EVERY PAGE
                // =========================================================

                const range = doc.bufferedPageRange();
                const totalPages = range.count;

                for (let i = 0; i < totalPages; i++) {
                    doc.switchToPage(range.start + i);

                    // IMPORTANT: keep cursor inside content band so
                    // stamping header/footer can't trigger auto page-breaks.
                    doc.y = CONTENT_TOP;

                    drawHeader();
                    drawFooter(i + 1, totalPages);
                }

                doc.end();
            } catch (err) {
                reject(err);
            }
        });
    }

    async getStatementOfAccount(leadID: string, req: Request) {
        if (!leadID) throw new Error('leadID is Missing');

        const lead = await this.tenantPrisma.client.leads.findFirst({
            where: { leadID: Number(leadID) },
            select: {
                leadID: true,
                loan: {
                    select: {
                        loanNo: true,
                        disbursalAmount: true,
                        disbursalDate: true,
                    },
                },
                approvals: {
                    select: { roi: true, repayDate: true },
                },
                collections: {
                    where: { collectionStatus: 'Approved' },
                    orderBy: { collectedDate: 'asc' },
                },
            },
        });

        if (!lead) {
            return {
                success: false,
                statusCode: 200,
                message: 'Lead not found!',
            };
        }

        if (!lead.loan?.disbursalDate) {
            return {
                success: false,
                statusCode: 200,
                message: 'Pending for disbursement!',
            };
        }

        const domain = await this.smsService.getCurrentDomain(req);
        const config = penalConfig[domain] || penalConfig['localhost'];

        const dailyRate = Number(lead.approvals?.[0]?.roi || 0);
        const penalRate = parseFloat(config.interest.replace('%', ''));
        const bounceCharge = config.charges;

        const disbursalDate = new Date(lead.loan.disbursalDate);
        const dueDate = new Date(lead.approvals?.[0]?.repayDate);
        const today = new Date();

        const ledger: any[] = [];

        let principal = Number(lead.loan.disbursalAmount);
        let interestAccrued = 0;
        let penalInterestAccrued = 0;
        let bounceCharges = 0;
        let penaltyApplied = false;

        const collections = lead.collections || [];
        let collectionIndex = 0;

        for (
            let d = new Date(disbursalDate);
            d <= today;
            d.setDate(d.getDate() + 1)
        ) {
            const currentDate = new Date(d);

            const totalBalance =
                principal +
                interestAccrued +
                penalInterestAccrued +
                bounceCharges;

            if (totalBalance <= 0) break;

            const dpd = Math.floor(
                (currentDate.getTime() - dueDate.getTime()) /
                (1000 * 60 * 60 * 24),
            );

            if (currentDate <= dueDate) {
                const interest = (principal * dailyRate) / 100;
                interestAccrued += interest;

                ledger.push({
                    date: currentDate,
                    narration: `Interest @${dailyRate}% on Rs.${principal.toFixed(2)}`,
                    debit: interest,
                    credit: 0,
                    balance: Number(
                        (
                            principal +
                            interestAccrued +
                            penalInterestAccrued +
                            bounceCharges
                        ).toFixed(2),
                    ),
                });
            }

            if (dpd > 0) {
                if (!penaltyApplied) {
                    bounceCharges += bounceCharge;
                    penaltyApplied = true;

                    ledger.push({
                        date: currentDate,
                        narration: `Bounce charge Rs.${bounceCharge}`,
                        debit: bounceCharge,
                        credit: 0,
                        balance: Number(
                            (
                                principal +
                                interestAccrued +
                                penalInterestAccrued +
                                bounceCharges
                            ).toFixed(2),
                        ),
                    });
                }

                const penal = (principal * penalRate) / 100;
                penalInterestAccrued += penal;

                ledger.push({
                    date: currentDate,
                    narration: `Penal interest @${penalRate}% on Rs.${principal.toFixed(2)}`,
                    debit: penal,
                    credit: 0,
                    balance: Number(
                        (
                            principal +
                            interestAccrued +
                            penalInterestAccrued +
                            bounceCharges
                        ).toFixed(2),
                    ),
                });
            }

            while (
                collectionIndex < collections.length &&
                new Date(
                    collections[collectionIndex].collectedDate,
                ).toDateString() === currentDate.toDateString()
            ) {
                const c = collections[collectionIndex];

                let amount = 0;
                let narration = '';

                if (c.collectedMode === 'DISCOUNT') {
                    amount = Number(c.discountAmount || 0);
                    narration = `Discount Rs.${amount}`;
                } else {
                    amount = Number(c.collectedAmount || 0);
                    narration = `Payment Rs.${amount}`;
                }

                let remaining = amount;
                let pPaid = 0;
                let iPaid = 0;
                let penalPaid = 0;
                let chargePaid = 0;

                if (remaining > 0) {
                    iPaid = Math.min(interestAccrued, remaining);
                    interestAccrued -= iPaid;
                    remaining -= iPaid;
                }
                if (remaining > 0) {
                    pPaid = Math.min(principal, remaining);
                    principal -= pPaid;
                    remaining -= pPaid;
                }
                if (remaining > 0) {
                    penalPaid = Math.min(penalInterestAccrued, remaining);
                    penalInterestAccrued -= penalPaid;
                    remaining -= penalPaid;
                }
                if (remaining > 0) {
                    chargePaid = Math.min(bounceCharges, remaining);
                    bounceCharges -= chargePaid;
                    remaining -= chargePaid;
                }

                const breakdown =
                    `I:${iPaid.toFixed(2)}, ` +
                    `P:${pPaid.toFixed(2)}, ` +
                    `Penal:${penalPaid.toFixed(2)}, ` +
                    `C:${chargePaid.toFixed(2)}`;

                ledger.push({
                    date: currentDate,
                    narration: `${narration} (${breakdown})`,
                    debit: 0,
                    credit: amount,
                    balance: Number(
                        (
                            principal +
                            interestAccrued +
                            penalInterestAccrued +
                            bounceCharges
                        ).toFixed(2),
                    ),
                });

                collectionIndex++;
            }
        }

        return {
            success: true,
            statusCode: 200,
            data: {
                loan: lead.loan,
                roi: dailyRate,
                repayDate: lead.approvals?.[0]?.repayDate || null,
                statementOfAccount: ledger,
                summary: {
                    principalOutstanding: Number(principal.toFixed(2)),
                    interestOutstanding: Number(interestAccrued.toFixed(2)),
                    penalInterestOutstanding: Number(
                        penalInterestAccrued.toFixed(2),
                    ),
                    bounceChargesOutstanding: Number(bounceCharges.toFixed(2)),
                    totalPayable: Number(
                        (
                            principal +
                            interestAccrued +
                            penalInterestAccrued +
                            bounceCharges
                        ).toFixed(2),
                    ),
                },
            },
        };
    }
}