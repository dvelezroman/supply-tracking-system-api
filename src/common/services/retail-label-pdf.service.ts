import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Presentation } from '@prisma/client';
import * as PDFDocument from 'pdfkit';
import { QrService } from './qr.service';
import { fetchLabelLogo } from '../label/label-logo.util';
import {
  PRESENTATION_LABEL_SUBTITLE,
  INGREDIENTS_TEXT,
  CONSERVATION_TEXT,
  SEMAFORO_EXEMPTION_TEXT,
  formatNetWeightEs,
  buildManufacturingLine,
  buildSanitaryArcsaLine,
  buildLabelElaborationLine,
  buildLabelExpirationLine,
  buildLabelManufacturedByLine,
  formatLabelDateEs,
  type LotLabelFields,
} from '../label/retail-label.constants';

type BwipJsNode = { toBuffer(opts: Record<string, unknown>): Promise<Buffer> };

const CM_TO_PT = 28.3464567;
const A4_W = 595.28;
const A4_H = 841.89;
const PAGE_MARGIN = 28;

/** Retail bag label: 12 cm × 18 cm per face. */
export const RETAIL_LABEL_W = 12 * CM_TO_PT;
export const RETAIL_LABEL_H = 18 * CM_TO_PT;

const PANEL_BG = '#FFFFFF';
const BORDER_COLOR = '#1a1a1a';
const TEXT = '#000000';
const MUTED = '#333333';
const BRAND = '#1a237e';

const TRACE_QR_SIZE = 52;

export type RetailLabelSides = 'both' | 'front' | 'back';

export interface RetailLabelPdfOptions extends LotLabelFields {
  labelTitle: string;
  presentationSubtitle: string;
  netWeightLine: string;
  gtin13: string;
  brandName: string;
  logoUrl?: string;
  manufacturingLine: string;
  sanitaryArcsaLine: string;
  lotCode: string;
  copies: number;
  sides: RetailLabelSides;
  includeTrace: boolean;
  traceUrl?: string;
}

@Injectable()
export class RetailLabelPdfService {
  private readonly logger = new Logger(RetailLabelPdfService.name);

  constructor(
    private readonly qrService: QrService,
    private readonly configService: ConfigService,
  ) {}

  async generateRetailLabelPdf(opts: RetailLabelPdfOptions): Promise<Buffer> {
    const logoSource = opts.logoUrl ?? this.configService.get<string>('labelLogoUrl') ?? '';
    const [eanBuffer, logoBuffer, qrBuffer] = await Promise.all([
      this.buildEan13(opts.gtin13),
      fetchLabelLogo(logoSource),
      opts.includeTrace && opts.traceUrl
        ? this.qrService.generatePngForPdfLabel(opts.traceUrl)
        : Promise.resolve(null as Buffer | null),
    ]);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: [A4_W, A4_H],
        margin: 0,
        autoFirstPage: false,
      });

      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const labelX = (A4_W - RETAIL_LABEL_W) / 2;
      const labelY = (A4_H - RETAIL_LABEL_H) / 2;
      let pageIndex = 0;

      const addLabelPage = (render: () => void) => {
        doc.addPage();
        pageIndex++;
        render();
      };

      for (let i = 0; i < opts.copies; i++) {
        if (opts.sides === 'both' || opts.sides === 'front') {
          addLabelPage(() =>
            this.renderFront(doc, labelX, labelY, RETAIL_LABEL_W, RETAIL_LABEL_H, {
              ...opts,
              eanBuffer,
              logoBuffer,
            }),
          );
        }
        if (opts.sides === 'both' || opts.sides === 'back') {
          addLabelPage(() =>
            this.renderBack(doc, labelX, labelY, RETAIL_LABEL_W, RETAIL_LABEL_H, {
              ...opts,
              qrBuffer,
            }),
          );
        }
      }

      if (pageIndex === 0) {
        reject(new Error('Retail label PDF requires at least one page (copies/sides)'));
        return;
      }

      doc.end();
    });
  }

  private renderFront(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    ctx: RetailLabelPdfOptions & { eanBuffer: Buffer; logoBuffer: Buffer | null },
  ): void {
    const pad = 10;
    const innerX = x + pad;
    const innerW = w - pad * 2;
    let cy = y + pad;

    doc.roundedRect(x, y, w, h, 4).fill(PANEL_BG);
    doc.roundedRect(x, y, w, h, 4).strokeColor(BORDER_COLOR).lineWidth(0.75).stroke();

    if (ctx.logoBuffer) {
      try {
        const logoH = 48;
        doc.image(ctx.logoBuffer, innerX + (innerW - 120) / 2, cy, {
          fit: [120, logoH],
          align: 'center',
          valign: 'center',
        });
        cy += logoH + 6;
      } catch {
        cy += 4;
      }
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor(BRAND)
      .text(ctx.brandName.toUpperCase(), innerX, cy, { width: innerW, align: 'center' });
    cy = doc.y + 8;

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(TEXT)
      .text(ctx.labelTitle, innerX, cy, { width: innerW, align: 'center', lineGap: 1 });
    cy = doc.y + 4;

    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(ctx.presentationSubtitle, innerX, cy, { width: innerW, align: 'center', lineGap: 0.8 });
    cy = doc.y + 10;

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(TEXT)
      .text(ctx.netWeightLine, innerX, cy, { width: innerW, align: 'center' });
    cy = doc.y + 8;

    const labelInfoLines = [
      buildLabelElaborationLine(ctx.labelElaborationDate),
      buildLabelExpirationLine(ctx.labelExpirationDate),
      buildLabelManufacturedByLine(ctx.labelManufacturedBy),
    ];
    for (const line of labelInfoLines) {
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(TEXT)
        .text(line, innerX, cy, { width: innerW, align: 'center', lineGap: 0.4 });
      cy = doc.y + 4;
    }

    const conservationText = ctx.labelConservationText?.trim() ?? '';
    const eanImageH = 46;
    const conservationH = 12;
    const eanBandH = eanImageH + conservationH + 6;
    const eanY = y + h - pad - eanBandH;
    doc.rect(innerX, eanY, innerW, eanBandH).fill('#FFFFFF');
    doc.rect(innerX, eanY, innerW, eanBandH).strokeColor(BORDER_COLOR).lineWidth(0.35).stroke();

    try {
      doc.image(ctx.eanBuffer, innerX + 8, eanY + 3, {
        fit: [innerW - 16, eanImageH],
        align: 'center',
        valign: 'center',
      });
    } catch (e) {
      this.logger.warn(`EAN-13 render failed: ${(e as Error).message}`);
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(TEXT)
        .text(ctx.gtin13, innerX, eanY + 16, { width: innerW, align: 'center' });
    }

    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(TEXT)
      .text(conservationText, innerX, eanY + eanImageH + 2, {
        width: innerW,
        align: 'center',
        lineGap: 0.3,
      });
  }

  private renderBack(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    ctx: RetailLabelPdfOptions & { qrBuffer: Buffer | null },
  ): void {
    const pad = 10;
    const innerX = x + pad;
    const innerW = w - pad * 2;
    let cy = y + pad;

    doc.roundedRect(x, y, w, h, 4).fill(PANEL_BG);
    doc.roundedRect(x, y, w, h, 4).strokeColor(BORDER_COLOR).lineWidth(0.75).stroke();

    if (ctx.qrBuffer) {
      const qrX = x + w - pad - TRACE_QR_SIZE;
      doc.rect(qrX - 1, cy - 1, TRACE_QR_SIZE + 2, TRACE_QR_SIZE + 2).strokeColor(BORDER_COLOR).lineWidth(0.4).stroke();
      doc.image(ctx.qrBuffer, qrX, cy, { width: TRACE_QR_SIZE, height: TRACE_QR_SIZE });
      doc
        .font('Helvetica-Bold')
        .fontSize(4.5)
        .fillColor(MUTED)
        .text('TRAZABILIDAD', qrX, cy + TRACE_QR_SIZE + 2, { width: TRACE_QR_SIZE, align: 'center' });
    }

    const textW = ctx.qrBuffer ? innerW - TRACE_QR_SIZE - 8 : innerW;

    const writeBlock = (text: string, fontSize: number, bold = false) => {
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(fontSize)
        .fillColor(TEXT)
        .text(text, innerX, cy, { width: textW, align: 'left', lineGap: 0.6 });
      cy = doc.y + 5;
    };

    writeBlock(ctx.manufacturingLine, 5.2);
    writeBlock(INGREDIENTS_TEXT, 5.2, true);
    writeBlock(CONSERVATION_TEXT, 5);
    cy += 2;

    const stampH = 42;
    doc.rect(innerX, cy, textW, stampH).fill('#FFFFFF');
    doc.rect(innerX, cy, textW, stampH).strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor(TEXT)
      .text(`Lote: ${ctx.lotCode}`, innerX + 6, cy + 6, { width: textW - 12 })
      .text(
        `Fecha de Elaboración: ${formatLabelDateEs(ctx.labelElaborationDate)}`,
        innerX + 6,
        cy + 16,
        { width: textW - 12 },
      )
      .text(
        `Fecha de Vencimiento: ${formatLabelDateEs(ctx.labelExpirationDate)}`,
        innerX + 6,
        cy + 26,
        { width: textW - 12 },
      );
    cy += stampH + 6;

    writeBlock(SEMAFORO_EXEMPTION_TEXT, 4.8);
    writeBlock(ctx.sanitaryArcsaLine, 5.2, true);
  }

  private async buildEan13(gtin13: string): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bwipjs = require('bwip-js/node') as BwipJsNode;
    return bwipjs.toBuffer({
      bcid: 'ean13',
      text: gtin13,
      scale: 2,
      height: 10,
      includetext: true,
      textxalign: 'center',
      textsize: 8,
    });
  }

  /** Build subtitle from presentation enum. */
  static presentationSubtitle(presentation: Presentation): string {
    return PRESENTATION_LABEL_SUBTITLE[presentation];
  }

  /** Build options from product/lot fields and config. */
  static buildNetWeightLine(oz: number, lbs: number): string {
    return formatNetWeightEs(oz, lbs);
  }

  static buildManufacturing(opts: {
    coPackerName: string;
    ownerLegalName: string;
    ownerRuc: string;
    ownerLocation: string;
  }): string {
    return buildManufacturingLine(opts);
  }

  static buildSanitaryLine(productArcsa: string | null | undefined, envFallback: string): string {
    return buildSanitaryArcsaLine(productArcsa, envFallback);
  }
}
