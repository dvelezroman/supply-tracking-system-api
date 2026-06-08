import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as PDFDocument from 'pdfkit';
import { QrService } from './qr.service';
import { fetchLabelLogo } from '../label/label-logo.util';
import {
  buildLabelElaborationLine,
  buildLabelExpirationLine,
  buildLabelManufacturedByLine,
  type LotLabelFields,
} from '../label/retail-label.constants';

type BwipJsNode = { toBuffer(opts: Record<string, unknown>): Promise<Buffer> };

const CM_TO_PT = 28.3464567;
const A4_PORTRAIT_W = 595.28;
const A4_PORTRAIT_H = 841.89;
const MARGIN = 20;
const GUTTER = 8;
/** Fixed physical label size: 10cm width x 8cm height. */
const LABEL_W = 10 * CM_TO_PT;
const LABEL_H = 8 * CM_TO_PT;

type PageLayout = {
  pageW: number;
  pageH: number;
  cols: number;
  rows: number;
  gridW: number;
  gridH: number;
  startX: number;
  startY: number;
  capacity: number;
};

const computeLayout = (pageW: number, pageH: number): PageLayout => {
  const cols = Math.max(1, Math.floor((pageW - MARGIN * 2 + GUTTER) / (LABEL_W + GUTTER)));
  const rows = Math.max(1, Math.floor((pageH - MARGIN * 2 + GUTTER) / (LABEL_H + GUTTER)));
  const gridW = cols * LABEL_W + (cols - 1) * GUTTER;
  const gridH = rows * LABEL_H + (rows - 1) * GUTTER;
  return {
    pageW,
    pageH,
    cols,
    rows,
    gridW,
    gridH,
    startX: (pageW - gridW) / 2,
    startY: (pageH - gridH) / 2,
    capacity: cols * rows,
  };
};

const PORTRAIT_LAYOUT = computeLayout(A4_PORTRAIT_W, A4_PORTRAIT_H);
const LANDSCAPE_LAYOUT = computeLayout(A4_PORTRAIT_H, A4_PORTRAIT_W);
const PAGE_LAYOUT =
  LANDSCAPE_LAYOUT.capacity > PORTRAIT_LAYOUT.capacity ? LANDSCAPE_LAYOUT : PORTRAIT_LAYOUT;

export const QR_PER_PAGE = PAGE_LAYOUT.capacity;

/** Fondo blanco y borde fino (estilo etiqueta clásica / exportación). */
const PANEL_BG = '#FFFFFF';
const BORDER_COLOR = '#1a1a1a';
const TEXT = '#000000';
const MUTED = '#333333';
/** Marca / títulos en azul corporativo (legible en blanco y negro). */
const BRAND = '#1a237e';

/** ~31mm at print scale (compact layout for extra label fields). */
const QR_DRAW = 88;
const INNER_PAD = 0;

export interface QrPdfOptions extends LotLabelFields {
  lotCode: string;
  productDescriptor: string;
  originLine: string;
  netWeightKg: number;
  copies: number;
  brandName: string;
  logoUrl?: string;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(
    private readonly qrService: QrService,
    private readonly configService: ConfigService,
  ) {}

  async generateQrPdf(url: string, opts: QrPdfOptions): Promise<Buffer> {
    const logoSource = opts.logoUrl ?? this.configService.get<string>('labelLogoUrl') ?? '';
    const bitflowLogoSource = this.configService.get<string>('bitflowLogoUrl') ?? '';
    const bitflowSiteUrl = this.configService.get<string>('bitflowSiteUrl')?.trim() || 'bitflow.bid';
    const [qrBuffer, barcodeBuffer, logoBuffer, bitflowLogoBuffer] = await Promise.all([
      this.qrService.generatePngForPdfLabel(url),
      this.buildBarcode(opts.lotCode),
      fetchLabelLogo(logoSource),
      fetchLabelLogo(bitflowLogoSource, false),
    ]);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: [PAGE_LAYOUT.pageW, PAGE_LAYOUT.pageH],
        margin: 0,
        autoFirstPage: true,
      });

      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      for (let i = 0; i < opts.copies; i++) {
        const posOnPage = i % QR_PER_PAGE;
        if (i > 0 && posOnPage === 0) doc.addPage();
        const col = posOnPage % PAGE_LAYOUT.cols;
        const row = Math.floor(posOnPage / PAGE_LAYOUT.cols);
        const x = PAGE_LAYOUT.startX + col * (LABEL_W + GUTTER);
        const y = PAGE_LAYOUT.startY + row * (LABEL_H + GUTTER);
        this.renderPackagingLabel(doc, x, y, LABEL_W, LABEL_H, {
          ...opts,
          qrBuffer,
          barcodeBuffer,
          logoBuffer,
          bitflowLogoBuffer,
          bitflowSiteUrl,
        });
      }

      doc.end();
    });
  }

  private renderPackagingLabel(
    doc: PDFKit.PDFDocument,
    cellX: number,
    cellY: number,
    cellW: number,
    cellH: number,
    ctx: QrPdfOptions & {
      qrBuffer: Buffer;
      barcodeBuffer: Buffer;
      logoBuffer: Buffer | null;
      bitflowLogoBuffer: Buffer | null;
      bitflowSiteUrl: string;
    },
  ): void {
    const { qrBuffer, barcodeBuffer, logoBuffer, bitflowLogoBuffer } = ctx;
    const innerX = cellX + INNER_PAD;
    const innerY = cellY + INNER_PAD;
    const innerW = cellW - INNER_PAD * 2;
    const innerH = cellH - INNER_PAD * 2;
    const leftW = Math.floor(innerW * 0.42);
    const gap = 7;
    const leftX = innerX + 6;
    const leftInnerW = leftW - 12;
    const rightX = leftX + leftW + gap;
    const rightW = innerW - leftW - gap - 6;

    doc.roundedRect(cellX, cellY, cellW, cellH, 3).fill(PANEL_BG);
    doc
      .roundedRect(cellX, cellY, cellW, cellH, 3)
      .strokeColor(BORDER_COLOR)
      .lineWidth(0.75)
      .stroke();

    const headerX = innerX + 6;
    const headerW = innerW - 12;
    let headerY = innerY + 6;
    doc.font('Helvetica-Bold').fontSize(5.6).fillColor(MUTED).text('PRODUCTO', headerX, headerY, {
      width: headerW,
      align: 'center',
    });
    headerY = doc.y + 1;
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(TEXT)
      .text(this.truncate(ctx.productDescriptor, 52), headerX, headerY, {
      width: headerW,
      align: 'center',
      lineGap: 0.5,
    });
    const contentStartY = doc.y + 8;

    let leftY = contentStartY;
    let rightY = contentStartY;
    const brandName = ctx.brandName.toUpperCase();
    const maxLogoW = Math.min(132, rightW);

    // Left rail: helper text + QR + barcode.
    doc
      .font('Helvetica-Bold')
      .fontSize(6.7)
      .fillColor(TEXT)
      .text('ESCANEA MI TRAZABILIDAD', leftX, leftY, {
        width: leftInnerW,
        align: 'center',
        lineGap: 0.5,
      });
    leftY = doc.y + 4;

    const qrDraw = Math.min(QR_DRAW, leftInnerW - 2);
    const qrX = leftX + (leftInnerW - qrDraw) / 2;
    doc.rect(qrX - 1, leftY - 1, qrDraw + 2, qrDraw + 2).strokeColor(BORDER_COLOR).lineWidth(0.45).stroke();
    doc.image(qrBuffer, qrX, leftY, { width: qrDraw, height: qrDraw });
    leftY += qrDraw + 5;

    doc
      .font('Helvetica-Bold')
      .fontSize(5.8)
      .fillColor(TEXT)
      .text('LOTE', leftX, leftY, {
        width: leftInnerW,
        align: 'center',
        lineGap: 0.5,
      });
    leftY = doc.y + 1;

    doc.font('Helvetica-Bold').fontSize(8.9).fillColor(TEXT).text(ctx.lotCode, leftX, leftY, {
      width: leftInnerW,
      align: 'center',
      lineGap: 0.6,
    });
    leftY = doc.y + 6;

    try {
      doc.image(barcodeBuffer, leftX, leftY, { fit: [leftInnerW, 28], align: 'center' });
    } catch {
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(ctx.lotCode, leftX, leftY + 9, {
        width: leftInnerW,
        align: 'center',
      });
    }
    leftY += 30;

    const conservationText = this.truncate(ctx.labelConservationText?.trim() ?? '', 40);
    doc
      .font('Helvetica')
      .fontSize(4.8)
      .fillColor(TEXT)
      .text(conservationText, leftX, leftY, { width: leftInnerW, align: 'center', lineGap: 0.2 });

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, rightX + (rightW - maxLogoW) / 2, rightY, {
          fit: [maxLogoW, 36],
          align: 'center',
          valign: 'center',
        });
        rightY += 38;
      } catch {
        this.drawLogoPlaceholder(doc, rightX + rightW / 2, rightY + 6, maxLogoW);
        rightY += 20;
      }
    } else {
      this.drawLogoPlaceholder(doc, rightX + rightW / 2, rightY + 6, maxLogoW);
      rightY += 20;
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(10.8)
      .fillColor(BRAND)
      .text(brandName, rightX, rightY, {
        width: rightW,
        align: 'center',
        characterSpacing: 0.35,
        lineGap: 0.8,
      });
    rightY = doc.y + 2;

    doc
      .font('Helvetica-Bold')
      .fontSize(5.4)
      .fillColor(TEXT)
      .text('CONFIANZA TOTAL EN CADA ORIGEN', rightX, rightY, {
        width: rightW,
        align: 'center',
        lineGap: 0.4,
      });
    rightY = doc.y + 2;

    doc.font('Helvetica-Bold').fontSize(5.4).fillColor(TEXT).text('Sociedad Jaramillo Minaya', rightX, rightY, {
      width: rightW,
      align: 'center',
      lineGap: 0.4,
    });
    rightY = doc.y + 1;

    doc.font('Helvetica').fontSize(5.2).fillColor(MUTED).text('El Oro, Ecuador', rightX, rightY, {
      width: rightW,
      align: 'center',
      lineGap: 0.4,
    });
    rightY = doc.y + 8;

    const origin = this.truncate(ctx.originLine || '—', 70);
    doc.font('Helvetica').fontSize(5.8).fillColor(MUTED).text(origin, rightX, rightY, {
      width: rightW,
      align: 'center',
      lineGap: 0.4,
    });
    rightY = doc.y + 4;

    const grams = Math.round(ctx.netWeightKg * 1000);
    const wStr = Number.isInteger(grams) ? `${grams}` : grams.toFixed(1).replace(/\.0$/, '');
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(TEXT)
      .text(`PESO NETO: ${wStr} g`, rightX, rightY, {
        width: rightW,
        align: 'center',
      });
    rightY = doc.y + 5;

    const labelInfoLines = [
      buildLabelElaborationLine(ctx.labelElaborationDate),
      buildLabelExpirationLine(ctx.labelExpirationDate),
      buildLabelManufacturedByLine(ctx.labelManufacturedBy),
    ];
    for (const line of labelInfoLines) {
      doc
        .font('Helvetica')
        .fontSize(5.2)
        .fillColor(TEXT)
        .text(this.truncate(line, 72), rightX, rightY, {
          width: rightW,
          align: 'center',
          lineGap: 0.3,
        });
      rightY = doc.y + 2;
    }

    const footerY = innerY + innerH - 20;
    const footerW = innerW - 12;
    const footerX = innerX + 6;
    doc.moveTo(footerX, footerY - 3).lineTo(footerX + footerW, footerY - 3).strokeColor('#D0D0D0').lineWidth(0.35).stroke();

    if (bitflowLogoBuffer) {
      try {
        const logoW = 24;
        const logoX = footerX + (footerW - logoW) / 2;
        doc.image(bitflowLogoBuffer, logoX, footerY, { fit: [logoW, 8], align: 'center', valign: 'center' });
      } catch {
        doc.font('Helvetica-Bold').fontSize(5).fillColor(MUTED).text('BITFLOW', footerX, footerY + 1.5, {
          width: footerW,
          align: 'center',
        });
      }
    } else {
      doc.font('Helvetica-Bold').fontSize(5).fillColor(MUTED).text('BITFLOW', footerX, footerY + 1.5, {
        width: footerW,
        align: 'center',
      });
    }

    doc.font('Helvetica').fontSize(4.4).fillColor(MUTED).text(this.cleanDisplayUrl(ctx.bitflowSiteUrl), footerX, footerY + 9, {
      width: footerW,
      align: 'center',
    });
  }

  private truncate(s: string, max: number): string {
    const t = s.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max - 1)}…`;
  }

  private cleanDisplayUrl(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return 'bitflow.bid';
    return trimmed.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }

  private drawLogoPlaceholder(doc: PDFKit.PDFDocument, centerX: number, centerY: number, maxW: number): void {
    const w = Math.min(maxW, 52);
    const x = centerX - w / 2;
    const y = centerY - 2;
    doc
      .rect(x, y, w, 10)
      .strokeColor(BORDER_COLOR)
      .lineWidth(0.35)
      .stroke();
    doc.font('Helvetica').fontSize(5).fillColor(MUTED).text('LOGO', x, y + 2.5, { width: w, align: 'center' });
  }

  private async buildBarcode(text: string): Promise<Buffer> {
    // Subpath `bwip-js/node` types exist but TS moduleResolution may not resolve them.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bwipjs = require('bwip-js/node') as BwipJsNode;
    return bwipjs.toBuffer({
      bcid: 'code128',
      text,
      scale: 2,
      height: 8,
      includetext: true,
      textxalign: 'center',
      textsize: 5,
      textgaps: 2,
    });
  }
}
