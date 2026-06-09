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
/** Full-page layout: one 10×8 cm label per A4, scaled up to fill the sheet (same aspect ratio). */
const computeFullPageLabelRect = (pageW: number, pageH: number) => {
  const aspect = LABEL_W / LABEL_H;
  let w = pageW;
  let h = w / aspect;
  if (h > pageH) {
    h = pageH;
    w = h * aspect;
  }
  return { x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
};

export const FULL_PAGE_LABEL_RECT = computeFullPageLabelRect(A4_PORTRAIT_W, A4_PORTRAIT_H);

export type QrPdfLayout = 'grid' | 'fullPage';

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
  /** `grid`: 10×8 cm labels tiled on A4. `fullPage`: one label per A4 scaled to fill the sheet. */
  layout?: QrPdfLayout;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(
    private readonly qrService: QrService,
    private readonly configService: ConfigService,
  ) {}

  async generateQrPdf(url: string, opts: QrPdfOptions): Promise<Buffer> {
    const layout = opts.layout ?? 'grid';
    const logoSource = opts.logoUrl ?? this.configService.get<string>('labelLogoUrl') ?? '';
    const bitflowLogoSource = this.configService.get<string>('bitflowLogoUrl') ?? '';
    const bitflowSiteUrl = this.configService.get<string>('bitflowSiteUrl')?.trim() || 'bitflow.bid';
    const [qrBuffer, barcodeBuffer, logoBuffer, bitflowLogoBuffer] = await Promise.all([
      this.qrService.generatePngForPdfLabel(url, layout === 'fullPage' ? 640 : 400),
      this.buildBarcode(opts.lotCode, layout === 'fullPage' ? 3 : 2),
      fetchLabelLogo(logoSource),
      fetchLabelLogo(bitflowLogoSource, false),
    ]);

    const renderCtx = {
      ...opts,
      qrBuffer,
      barcodeBuffer,
      logoBuffer,
      bitflowLogoBuffer,
      bitflowSiteUrl,
    };

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const isFullPage = layout === 'fullPage';
      const pageW = isFullPage ? A4_PORTRAIT_W : PAGE_LAYOUT.pageW;
      const pageH = isFullPage ? A4_PORTRAIT_H : PAGE_LAYOUT.pageH;
      const doc = new PDFDocument({
        size: [pageW, pageH],
        margin: 0,
        autoFirstPage: true,
      });

      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      if (isFullPage) {
        const { x, y, w, h } = FULL_PAGE_LABEL_RECT;
        for (let i = 0; i < opts.copies; i++) {
          if (i > 0) doc.addPage();
          this.renderPackagingLabel(doc, x, y, w, h, renderCtx);
        }
      } else {
        for (let i = 0; i < opts.copies; i++) {
          const posOnPage = i % QR_PER_PAGE;
          if (i > 0 && posOnPage === 0) doc.addPage();
          const col = posOnPage % PAGE_LAYOUT.cols;
          const row = Math.floor(posOnPage / PAGE_LAYOUT.cols);
          const x = PAGE_LAYOUT.startX + col * (LABEL_W + GUTTER);
          const y = PAGE_LAYOUT.startY + row * (LABEL_H + GUTTER);
          this.renderPackagingLabel(doc, x, y, LABEL_W, LABEL_H, renderCtx);
        }
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
    const s = cellW / LABEL_W;
    const vExtra = Math.max(1, cellH / (LABEL_H * s));
    const vGap = (vExtra - 1) * 4;
    const innerX = cellX + INNER_PAD;
    const innerY = cellY + INNER_PAD;
    const innerW = cellW - INNER_PAD * 2;
    const innerH = cellH - INNER_PAD * 2;
    const leftW = Math.floor(innerW * 0.42);
    const gap = 7 * s;
    const pad = 6 * s;
    const leftX = innerX + pad;
    const leftInnerW = leftW - pad * 2;
    const rightX = leftX + leftW + gap;
    const rightW = innerW - leftW - gap - pad;
    const cornerR = 3 * s;
    const borderW = 0.75 * s;

    doc.roundedRect(cellX, cellY, cellW, cellH, cornerR).fill(PANEL_BG);
    doc
      .roundedRect(cellX, cellY, cellW, cellH, cornerR)
      .strokeColor(BORDER_COLOR)
      .lineWidth(borderW)
      .stroke();

    const headerX = innerX + pad;
    const headerW = innerW - pad * 2;
    let headerY = innerY + pad;
    doc
      .font('Helvetica-Bold')
      .fontSize(5.6 * s)
      .fillColor(MUTED)
      .text('PRODUCTO', headerX, headerY, {
        width: headerW,
        align: 'center',
      });
    headerY = doc.y + 1 * s;
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5 * s)
      .fillColor(TEXT)
      .text(this.truncate(ctx.productDescriptor, 52), headerX, headerY, {
        width: headerW,
        align: 'center',
        lineGap: 0.5 * s,
      });
    const contentStartY = doc.y + (8 + vGap) * s;

    let leftY = contentStartY;
    let rightY = contentStartY;
    const brandName = ctx.brandName.toUpperCase();
    const maxLogoW = Math.min(132 * s, rightW);

    doc
      .font('Helvetica-Bold')
      .fontSize(6.7 * s)
      .fillColor(TEXT)
      .text('ESCANEA MI TRAZABILIDAD', leftX, leftY, {
        width: leftInnerW,
        align: 'center',
        lineGap: 0.5 * s,
      });
    leftY = doc.y + (4 + vGap) * s;

    const qrDraw = Math.min(QR_DRAW * s * Math.min(vExtra, 2), leftInnerW - 2 * s, innerH * 0.38);
    const qrX = leftX + (leftInnerW - qrDraw) / 2;
    doc
      .rect(qrX - s, leftY - s, qrDraw + 2 * s, qrDraw + 2 * s)
      .strokeColor(BORDER_COLOR)
      .lineWidth(0.45 * s)
      .stroke();
    doc.image(qrBuffer, qrX, leftY, { width: qrDraw, height: qrDraw });
    leftY += qrDraw + (5 + vGap) * s;

    doc
      .font('Helvetica-Bold')
      .fontSize(5.8 * s)
      .fillColor(TEXT)
      .text('LOTE', leftX, leftY, {
        width: leftInnerW,
        align: 'center',
        lineGap: 0.5 * s,
      });
    leftY = doc.y + 1 * s;

    doc
      .font('Helvetica-Bold')
      .fontSize(8.9 * s)
      .fillColor(TEXT)
      .text(ctx.lotCode, leftX, leftY, {
        width: leftInnerW,
        align: 'center',
        lineGap: 0.6 * s,
      });
    leftY = doc.y + (6 + vGap) * s;

    const barcodeH = 28 * s;
    try {
      doc.image(barcodeBuffer, leftX, leftY, { fit: [leftInnerW, barcodeH], align: 'center' });
    } catch {
      doc
        .font('Helvetica')
        .fontSize(8 * s)
        .fillColor(MUTED)
        .text(ctx.lotCode, leftX, leftY + 9 * s, {
          width: leftInnerW,
          align: 'center',
        });
    }
    leftY += barcodeH + 2 * s + vGap * s;

    const conservationText = this.truncate(ctx.labelConservationText?.trim() ?? '', 40);
    doc
      .font('Helvetica')
      .fontSize(8.5 * s)
      .fillColor(TEXT)
      .text(conservationText, leftX, leftY, {
        width: leftInnerW,
        align: 'center',
        lineGap: 0.3 * s,
      });

    const logoH = 36 * s;
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, rightX + (rightW - maxLogoW) / 2, rightY, {
          fit: [maxLogoW, logoH],
          align: 'center',
          valign: 'center',
        });
        rightY += logoH + 2 * s;
      } catch {
        this.drawLogoPlaceholder(doc, rightX + rightW / 2, rightY + 6 * s, maxLogoW, s);
        rightY += 20 * s;
      }
    } else {
      this.drawLogoPlaceholder(doc, rightX + rightW / 2, rightY + 6 * s, maxLogoW, s);
      rightY += 20 * s;
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(10.8 * s)
      .fillColor(BRAND)
      .text(brandName, rightX, rightY, {
        width: rightW,
        align: 'center',
        characterSpacing: 0.35 * s,
        lineGap: 0.8 * s,
      });
    rightY = doc.y + (2 + vGap) * s;

    doc
      .font('Helvetica-Bold')
      .fontSize(5.4 * s)
      .fillColor(TEXT)
      .text('CONFIANZA TOTAL EN CADA ORIGEN', rightX, rightY, {
        width: rightW,
        align: 'center',
        lineGap: 0.4 * s,
      });
    rightY = doc.y + (8 + vGap) * s;

    const origin = this.truncate(ctx.originLine || '—', 70);
    doc
      .font('Helvetica')
      .fontSize(5.8 * s)
      .fillColor(MUTED)
      .text(origin, rightX, rightY, {
        width: rightW,
        align: 'center',
        lineGap: 0.4 * s,
      });
    rightY = doc.y + (4 + vGap) * s;

    const grams = Math.round(ctx.netWeightKg * 1000);
    const wStr = Number.isInteger(grams) ? `${grams}` : grams.toFixed(1).replace(/\.0$/, '');
    doc
      .font('Helvetica-Bold')
      .fontSize(8 * s)
      .fillColor(TEXT)
      .text(`PESO NETO: ${wStr} g`, rightX, rightY, {
        width: rightW,
        align: 'center',
      });
    rightY = doc.y + (5 + vGap) * s;

    const labelInfoLines = [
      buildLabelElaborationLine(ctx.labelElaborationDate),
      buildLabelExpirationLine(ctx.labelExpirationDate),
      buildLabelManufacturedByLine(ctx.labelManufacturedBy),
    ];
    for (const line of labelInfoLines) {
      doc
        .font('Helvetica')
        .fontSize(5.2 * s)
        .fillColor(TEXT)
        .text(this.truncate(line, 72), rightX, rightY, {
          width: rightW,
          align: 'center',
          lineGap: 0.3 * s,
        });
      rightY = doc.y + (2 + vGap * 0.5) * s;
    }

    const footerH = 20 * s;
    const footerY = innerY + innerH - footerH;
    const footerW = innerW - pad * 2;
    const footerX = innerX + pad;
    doc
      .moveTo(footerX, footerY - 3 * s)
      .lineTo(footerX + footerW, footerY - 3 * s)
      .strokeColor('#D0D0D0')
      .lineWidth(0.35 * s)
      .stroke();

    if (bitflowLogoBuffer) {
      try {
        const logoW = 24 * s;
        const logoX = footerX + (footerW - logoW) / 2;
        doc.image(bitflowLogoBuffer, logoX, footerY, {
          fit: [logoW, 8 * s],
          align: 'center',
          valign: 'center',
        });
      } catch {
        doc
          .font('Helvetica-Bold')
          .fontSize(5 * s)
          .fillColor(MUTED)
          .text('BITFLOW', footerX, footerY + 1.5 * s, {
            width: footerW,
            align: 'center',
          });
      }
    } else {
      doc
        .font('Helvetica-Bold')
        .fontSize(5 * s)
        .fillColor(MUTED)
        .text('BITFLOW', footerX, footerY + 1.5 * s, {
          width: footerW,
          align: 'center',
        });
    }

    doc
      .font('Helvetica')
      .fontSize(4.4 * s)
      .fillColor(MUTED)
      .text(this.cleanDisplayUrl(ctx.bitflowSiteUrl), footerX, footerY + 9 * s, {
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

  private drawLogoPlaceholder(
    doc: PDFKit.PDFDocument,
    centerX: number,
    centerY: number,
    maxW: number,
    scale = 1,
  ): void {
    const w = Math.min(maxW, 52 * scale);
    const x = centerX - w / 2;
    const y = centerY - 2 * scale;
    doc
      .rect(x, y, w, 10 * scale)
      .strokeColor(BORDER_COLOR)
      .lineWidth(0.35 * scale)
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(5 * scale)
      .fillColor(MUTED)
      .text('LOGO', x, y + 2.5 * scale, { width: w, align: 'center' });
  }

  private async buildBarcode(text: string, scale = 2): Promise<Buffer> {
    // Subpath `bwip-js/node` types exist but TS moduleResolution may not resolve them.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bwipjs = require('bwip-js/node') as BwipJsNode;
    return bwipjs.toBuffer({
      bcid: 'code128',
      text,
      scale,
      height: 8,
      includetext: true,
      textxalign: 'center',
      textsize: 5,
      textgaps: 2,
    });
  }
}
