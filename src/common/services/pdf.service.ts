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

/** 5×5 packaging labels per sheet (plan). */
const COLS = 5;
const ROWS = 5;
export const QR_PER_PAGE = COLS * ROWS;

const TOTAL_W = PAGE_WIDTH - MARGIN * 2;
const TOTAL_H = PAGE_HEIGHT - MARGIN * 2 - HEADER_H;
const CELL_W = (TOTAL_W - GUTTER * (COLS - 1)) / COLS;
const CELL_H = (TOTAL_H - GUTTER * (ROWS - 1)) / ROWS;

const PANEL_BG = '#F2F0E9';
/** Dashed border = crop guide (recorte). */
const CUT_GUIDE_DASH_ON = 2.4;
const CUT_GUIDE_DASH_OFF = 2;
const CUT_GUIDE_COLOR = '#7A7873';
const TEXT = '#141414';
const MUTED = '#4A4A4A';
const BRAND = '#E87A5D';
const ACCENT_BLUE = '#21A0B2';
const ACCENT_ORANGE = '#E87A5D';

/** ~24mm at print scale within 5×5 grid; do not shrink without re-validating phone scans. */
const QR_DRAW = 66;
const INNER_PAD = 5;

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

    doc.roundedRect(cellX, cellY, cellW, cellH, 3).fill(PANEL_BG);
    doc.save();
    doc.lineJoin('round').lineWidth(0.55).strokeColor(CUT_GUIDE_COLOR);
    doc.dash(CUT_GUIDE_DASH_ON, { space: CUT_GUIDE_DASH_OFF });
    doc.roundedRect(cellX, cellY, cellW, cellH, 3).stroke();
    doc.undash();
    doc.restore();

    const footTop = innerY + innerH - 16;
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
      .text(brandName, innerX, cy, { width: innerW, align: 'center', characterSpacing: 0.35 });
    cy += 8;

    doc.font('Helvetica-Bold').fontSize(4.5).fillColor(TEXT).text('LOTE DE PRODUCCIÓN', innerX, cy, {
      width: innerW,
      align: 'center',
    });
    cy += 5.5;

    doc.font('Helvetica-Bold').fontSize(7).fillColor(TEXT).text(ctx.lotCode, innerX, cy, {
      width: innerW,
      align: 'center',
    });
    cy += 8.5;

    const bcW = Math.min(innerW - 6, 94);
    try {
      doc.image(barcodeBuffer, innerX + (innerW - bcW) / 2, cy, { width: bcW, height: 12 });
    } catch {
      doc.font('Helvetica').fontSize(5).fillColor(MUTED).text(ctx.lotCode, innerX, cy, {
        width: innerW,
        align: 'center',
      });
    }
    cy += 14;

    const minQrTop = footTop - QR_DRAW - 14;
    if (cy > minQrTop) cy = minQrTop;

    const qrX = innerX + (innerW - QR_DRAW) / 2;
    doc.roundedRect(qrX - 2, cy - 2, QR_DRAW + 4, QR_DRAW + 4, 2).fill('#FFFFFF');
    doc.roundedRect(qrX - 2, cy - 2, QR_DRAW + 4, QR_DRAW + 4, 2).strokeColor('#E8E6E0').lineWidth(0.4).stroke();
    doc.image(qrBuffer, qrX, cy, { width: QR_DRAW, height: QR_DRAW });
    cy += QR_DRAW + 3;

    if (cy + 4.5 <= footTop - 0.5) {
      doc
        .font('Helvetica')
        .fontSize(3.8)
        .fillColor(MUTED)
        .text('ESCANEAR PARA TRAZABILIDAD Y DETALLES DEL LOTE', innerX, cy, {
          width: innerW,
          align: 'center',
          lineGap: 0.2,
        });
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
      .text(`PESO NETO: ${wStr} KG e`, innerX, footTop + 11, { width: innerW, align: 'center' });
  }

  private truncate(s: string, max: number): string {
    const t = s.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max - 1)}…`;
  }

  private drawLogoPlaceholder(doc: PDFKit.PDFDocument, centerX: number, centerY: number, maxW: number): void {
    const w = Math.min(maxW, 52);
    const x = centerX - w / 2;
    const y = centerY - 4;
    doc
      .moveTo(x, y + 6)
      .quadraticCurveTo(x + w * 0.35, y - 1, x + w * 0.55, y + 5)
      .quadraticCurveTo(x + w * 0.78, y + 11, x + w, y + 4)
      .strokeColor(ACCENT_BLUE)
      .lineWidth(1.05)
      .stroke();
    doc.circle(centerX + w * 0.12, y + 5, 2.8).fill(ACCENT_ORANGE);
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
