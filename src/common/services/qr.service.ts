import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

@Injectable()
export class QrService {
  /**
   * Generates a QR code PNG buffer for the given URL.
   * Used to stream as an image response.
   */
  async generatePng(url: string): Promise<Buffer> {
    return QRCode.toBuffer(url, {
      type: 'png',
      width: 400,
      margin: 2,
      color: { dark: '#1a237e', light: '#ffffff' },
    });
  }

  /**
   * PNG for PDF labels: enough pixels for ~70pt draw on A4; smaller than 640px
   * cuts encode time and PDF size (same bitmap reused for every label on the sheet).
   */
  async generatePngForPdfLabel(url: string): Promise<Buffer> {
    return QRCode.toBuffer(url, {
      type: 'png',
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    });
  }

  /**
   * Generates a QR code as a base64 data URL.
   * Used to embed inline in JSON responses.
   */
  async generateDataUrl(url: string): Promise<string> {
    return QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: { dark: '#1a237e', light: '#ffffff' },
    });
  }
}
