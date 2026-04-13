import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as PDFDocument from 'pdfkit';
import { QrService } from './qr.service';

type BwipJsNode = { toBuffer(opts: Record<string, unknown>): Promise<Buffer> };

// ── A4 (pt) ─────────────────────────────────────────────────────────────────
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 22;
const HEADER_H = 18;
const GUTTER = 2;

/** 5×3 packaging labels per sheet (15 per A4 page). */
const COLS = 5;
const ROWS = 3;
export const QR_PER_PAGE = COLS * ROWS;

const TOTAL_W = PAGE_WIDTH - MARGIN * 2;
const TOTAL_H = PAGE_HEIGHT - MARGIN * 2 - HEADER_H;
const CELL_W = (TOTAL_W - GUTTER * (COLS - 1)) / COLS;
const CELL_H = (TOTAL_H - GUTTER * (ROWS - 1)) / ROWS;

/** Fondo blanco y borde fino (estilo etiqueta clásica / exportación). */
const PANEL_BG = '#FFFFFF';
const BORDER_COLOR = '#1a1a1a';
const TEXT = '#000000';
const MUTED = '#333333';
/** Marca / títulos en azul corporativo (legible en blanco y negro). */
const BRAND = '#1a237e';

/** ~24mm at print scale; do not shrink without re-validating phone scans. */
const QR_DRAW = 70;
const INNER_PAD = 5;
/** Espacio bajo el QR: texto de escaneo (puede ser 2 líneas) + aire + código de barras. */
const BELOW_QR_RESERVE = 30;
const TEXT_AFTER_GAP = 3;

export interface QrPdfOptions {
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
    const [qrBuffer, barcodeBuffer, logoBuffer] = await Promise.all([
      this.qrService.generatePngForPdfLabel(url),
      this.buildBarcode(opts.lotCode),
      this.fetchLogo(logoSource),
    ]);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });

      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      for (let i = 0; i < opts.copies; i++) {
        const posOnPage = i % QR_PER_PAGE;
        if (i > 0 && posOnPage === 0) doc.addPage();
        if (posOnPage === 0) this.renderPageHeader(doc, opts);
        const col = posOnPage % COLS;
        const row = Math.floor(posOnPage / COLS);
        const cellX = MARGIN + col * (CELL_W + GUTTER);
        const cellY = MARGIN + HEADER_H + row * (CELL_H + GUTTER);
        this.renderPackagingLabel(doc, cellX, cellY, CELL_W, CELL_H, {
          ...opts,
          qrBuffer,
          barcodeBuffer,
          logoBuffer,
        });
      }

      doc.end();
    });
  }

  private renderPageHeader(doc: PDFKit.PDFDocument, opts: QrPdfOptions): void {
    doc
      .font('Helvetica')
      .fontSize(6)
      .fillColor('#6B6B6B')
      .text(
        `Lote ${opts.lotCode} · ${opts.copies} etiqueta(s) · Imprimir a tamaño real (100 %) para un QR legible.`,
        MARGIN,
        MARGIN,
        { width: PAGE_WIDTH - MARGIN * 2, align: 'center' },
      );
    doc
      .moveTo(MARGIN, MARGIN + 11)
      .lineTo(PAGE_WIDTH - MARGIN, MARGIN + 11)
      .strokeColor('#D0D0D0')
      .lineWidth(0.35)
      .stroke();
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
    },
  ): void {
    const { qrBuffer, barcodeBuffer, logoBuffer } = ctx;
    const innerX = cellX + INNER_PAD;
    const innerY = cellY + INNER_PAD;
    const innerW = cellW - INNER_PAD * 2;
    const innerH = cellH - INNER_PAD * 2;

    doc.roundedRect(cellX, cellY, cellW, cellH, 2).fill(PANEL_BG);
    doc
      .roundedRect(cellX, cellY, cellW, cellH, 2)
      .strokeColor(BORDER_COLOR)
      .lineWidth(0.55)
      .stroke();

    const footTop = innerY + innerH - 18;
    let cy = innerY + 2;
    const brandName = ctx.brandName.toUpperCase();
    const maxLogoW = Math.min(68, innerW - 8);

    if (logoBuffer) {
      try {
        const lx = innerX + (innerW - maxLogoW) / 2;
        doc.image(logoBuffer, lx, cy, { fit: [maxLogoW, 12], align: 'center', valign: 'center' });
        cy += 14;
      } catch {
        this.drawLogoPlaceholder(doc, innerX + innerW / 2, cy + 5, maxLogoW);
        cy += 14;
      }
    } else {
      this.drawLogoPlaceholder(doc, innerX + innerW / 2, cy + 5, maxLogoW);
      cy += 14;
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(6.6)
      .fillColor(BRAND)
      .text(brandName, innerX, cy, { width: innerW, align: 'center', characterSpacing: 0.35, lineGap: 1 });
    cy = doc.y + TEXT_AFTER_GAP;

    doc
      .font('Helvetica-Bold')
      .fontSize(4.5)
      .fillColor(TEXT)
      .text('LOTE DE PRODUCCIÓN', innerX, cy, {
        width: innerW,
        align: 'center',
        lineGap: 0.5,
      });
    cy = doc.y + TEXT_AFTER_GAP;

    doc
      .font('Helvetica-Bold')
      .fontSize(7.2)
      .fillColor(TEXT)
      .text(ctx.lotCode, innerX, cy, {
        width: innerW,
        align: 'center',
        lineGap: 0.5,
      });
    cy = doc.y + TEXT_AFTER_GAP;

    /** QR primero (más visible al escanear), código de barras debajo — layout clásico de etiqueta. */
    const minQrTop = footTop - QR_DRAW - BELOW_QR_RESERVE;
    if (cy > minQrTop) cy = minQrTop;

    const qrX = innerX + (innerW - QR_DRAW) / 2;
    doc.rect(qrX - 1, cy - 1, QR_DRAW + 2, QR_DRAW + 2).strokeColor(BORDER_COLOR).lineWidth(0.35).stroke();
    doc.image(qrBuffer, qrX, cy, { width: QR_DRAW, height: QR_DRAW });
    cy += QR_DRAW + 5;

    const scanMsg = 'ESCANEAR PARA TRAZABILIDAD Y DETALLES DEL LOTE';
    doc.font('Helvetica').fontSize(3.8).fillColor(MUTED);
    const scanH = doc.heightOfString(scanMsg, {
      width: innerW,
      align: 'center',
      lineGap: 1,
    });
    const barcodeSlotH = 13;
    if (cy + scanH + 6 + barcodeSlotH <= footTop) {
      doc.text(scanMsg, innerX, cy, {
        width: innerW,
        align: 'center',
        lineGap: 1,
      });
      cy = doc.y + 6;
    }

    const bcW = Math.min(innerW - 6, 96);
    const minBcBottom = footTop - 0.5;
    if (cy + barcodeSlotH <= minBcBottom) {
      try {
        doc.image(barcodeBuffer, innerX + (innerW - bcW) / 2, cy, { width: bcW, height: barcodeSlotH });
        cy += barcodeSlotH + 2;
      } catch {
        doc.font('Helvetica').fontSize(5).fillColor(MUTED).text(ctx.lotCode, innerX, cy, {
          width: innerW,
          align: 'center',
        });
        cy = doc.y + TEXT_AFTER_GAP;
      }
    }

    const prod = this.truncate(ctx.productDescriptor, 52);
    doc.font('Helvetica').fontSize(4.7).fillColor(TEXT).text(prod, innerX, footTop, {
      width: innerW,
      align: 'center',
    });

    const origin = this.truncate(ctx.originLine || '—', 54);
    doc.font('Helvetica').fontSize(4.2).fillColor(MUTED).text(origin, innerX, footTop + 5.5, {
      width: innerW,
      align: 'center',
    });

    const wStr = Number.isInteger(ctx.netWeightKg)
      ? `${ctx.netWeightKg}`
      : ctx.netWeightKg.toFixed(2).replace(/\.?0+$/, '');
    doc
      .font('Helvetica-Bold')
      .fontSize(4.9)
      .fillColor(TEXT)
      .text(`PESO NETO: ${wStr} KG`, innerX, footTop + 11, { width: innerW, align: 'center' });
  }

  private truncate(s: string, max: number): string {
    const t = s.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max - 1)}…`;
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

  private async fetchLogo(url?: string): Promise<Buffer | null> {
    const u = url?.trim();
    if (!u || !/^https?:\/\//i.test(u)) return null;
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 10000);
      const res = await fetch(u, { signal: ac.signal, redirect: 'follow' });
      clearTimeout(timer);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 32 || buf.length > 8_000_000) return null;
      return buf;
    } catch (e) {
      this.logger.warn(`LABEL_LOGO_URL fetch failed: ${(e as Error).message}`);
      return null;
    }
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
