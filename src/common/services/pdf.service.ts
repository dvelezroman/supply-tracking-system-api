import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { QrService } from './qr.service';

// ── A4 page constants (points: 1pt = 1/72 inch) ──────────────────────────────
const PAGE_WIDTH  = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN      = 24;

// ── Grid configuration ────────────────────────────────────────────────────────
const COLS        = 5;
const QR_SIZE     = 90;   // QR image size in points
const LABEL_H     = 28;   // height reserved for lot code + product name below QR
const CELL_W      = (PAGE_WIDTH - MARGIN * 2) / COLS;   // ~109 pt
const CELL_H      = QR_SIZE + LABEL_H + 8;              // ~126 pt
const ROWS_PER_PAGE = Math.floor((PAGE_HEIGHT - MARGIN * 2) / CELL_H); // ~6
export const QR_PER_PAGE = COLS * ROWS_PER_PAGE;        // 30

export interface QrPdfOptions {
  lotCode:     string;
  productName: string;
  copies:      number;       // total number of QR labels to generate
}

@Injectable()
export class PdfService {
  constructor(private readonly qrService: QrService) {}

  /**
   * Generates a PDF buffer where every page contains a grid of QR codes
   * all pointing to the same lot's public traceability URL.
   */
  async generateQrPdf(url: string, opts: QrPdfOptions): Promise<Buffer> {
    const qrBuffer = await this.qrService.generatePng(url);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN, autoFirstPage: true });

      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.renderHeader(doc, opts);

      for (let i = 0; i < opts.copies; i++) {
        const posOnPage = i % QR_PER_PAGE;

        // Start a fresh page after the first one whenever a page fills up
        if (i > 0 && posOnPage === 0) {
          doc.addPage();
          this.renderHeader(doc, opts);
        }

        const col = posOnPage % COLS;
        const row = Math.floor(posOnPage / COLS);

        const headerH = 36; // space consumed by the page header
        const x = MARGIN + col * CELL_W + (CELL_W - QR_SIZE) / 2;
        const y = MARGIN + headerH + row * CELL_H;

        this.renderQrCell(doc, qrBuffer, x, y, opts);
      }

      doc.end();
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private renderHeader(doc: PDFKit.PDFDocument, opts: QrPdfOptions): void {
    doc
      .fontSize(9)
      .fillColor('#9e9e9e')
      .text(
        `Lote: ${opts.lotCode}  ·  ${opts.productName}  ·  ${opts.copies} etiquetas`,
        MARGIN,
        MARGIN,
        { align: 'center', width: PAGE_WIDTH - MARGIN * 2 },
      );

    doc
      .moveTo(MARGIN, MARGIN + 14)
      .lineTo(PAGE_WIDTH - MARGIN, MARGIN + 14)
      .strokeColor('#e0e0e0')
      .stroke();
  }

  private renderQrCell(
    doc: PDFKit.PDFDocument,
    qrBuffer: Buffer,
    x: number,
    y: number,
    opts: QrPdfOptions,
  ): void {
    // QR image
    doc.image(qrBuffer, x, y, { width: QR_SIZE, height: QR_SIZE });

    // Lot code below the QR
    doc
      .fontSize(6.5)
      .fillColor('#1a237e')
      .font('Helvetica-Bold')
      .text(opts.lotCode, x - 4, y + QR_SIZE + 3, {
        width: QR_SIZE + 8,
        align: 'center',
      });

    // Product name (truncated)
    const shortName =
      opts.productName.length > 22
        ? opts.productName.slice(0, 20) + '…'
        : opts.productName;

    doc
      .fontSize(5.5)
      .fillColor('#616161')
      .font('Helvetica')
      .text(shortName, x - 4, y + QR_SIZE + 13, {
        width: QR_SIZE + 8,
        align: 'center',
      });

    // Light border around the cell
    doc
      .rect(x - 4, y - 4, QR_SIZE + 8, CELL_H - 4)
      .strokeColor('#eeeeee')
      .lineWidth(0.5)
      .stroke();
  }
}
