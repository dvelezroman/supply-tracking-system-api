import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { PublicTraceService } from './public-trace.service';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { QrService } from '../../common/services/qr.service';
import { PdfService, QR_PER_PAGE, type QrPdfLayout } from '../../common/services/pdf.service';
import { buildGlobalTraceEntryUrl } from '../../common/trace/trace-url.util';

const MAX_COPIES = 500;

@ApiTags('public')
@SkipEnvelope()
@Controller('public/trace')
export class PublicTraceController {
  constructor(
    private readonly publicTraceService: PublicTraceService,
    private readonly qrService: QrService,
    private readonly pdfService: PdfService,
    private readonly configService: ConfigService,
  ) {}

  @Get('restaurant/:slug')
  @ApiOperation({
    summary: 'Public trace by restaurant menu QR — no auth required',
    description:
      'Resolves the latest lot linked to this restaurant and returns the same payload as the lot trace, plus a restaurant object.',
  })
  @ApiParam({ name: 'slug', example: 'marea-alta-bistro' })
  @ApiResponse({ status: 200, description: 'Trace for the current supply lot' })
  @ApiResponse({ status: 404, description: 'Restaurant or linked lot not found' })
  getTraceByRestaurant(@Param('slug') slug: string) {
    return this.publicTraceService.getPublicTraceByRestaurantSlug(slug);
  }

  @Get('qr/pdf')
  @ApiOperation({
    summary: 'Global traceability QR label PDF — no auth required',
    description:
      'Printable A4 PDF with the single packaging QR that opens the lot-code lookup page. Does not include a lot code on the label.',
  })
  @ApiQuery({ name: 'copies', required: false, example: 4 })
  @ApiQuery({ name: 'layout', required: false, enum: ['grid', 'fullPage'] })
  @ApiProduces('application/pdf')
  async getGlobalQrPdf(
    @Query('copies', new DefaultValuePipe(QR_PER_PAGE), ParseIntPipe) copies: number,
    @Query('layout', new DefaultValuePipe('grid')) layout: string,
    @Res() res: Response,
  ) {
    if (copies < 1 || copies > MAX_COPIES) {
      throw new BadRequestException(`copies must be between 1 and ${MAX_COPIES}`);
    }
    const pdfLayout = layout as QrPdfLayout;
    if (pdfLayout !== 'grid' && pdfLayout !== 'fullPage') {
      throw new BadRequestException('layout must be "grid" or "fullPage"');
    }

    const traceUrl = buildGlobalTraceEntryUrl(this.configService);
    const brandName =
      this.configService.get<string>('labelBrandName')?.trim() || 'MAREA ALTA';
    const logoUrl = this.configService.get<string>('labelLogoUrl')?.trim();

    const pdf = await this.pdfService.generateGlobalQrPdf(traceUrl, {
      copies,
      layout: pdfLayout,
      brandName,
      logoUrl: logoUrl || undefined,
    });

    const layoutSuffix = pdfLayout === 'fullPage' ? '-fullpage' : '';
    const filename = `trace-qr-global-x${copies}${layoutSuffix}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  }

  @Get('qr')
  @ApiOperation({
    summary: 'Global traceability QR PNG — no auth required',
    description: 'PNG encoding the public trace lookup URL (/trace). Same QR for all packaging.',
  })
  @ApiProduces('image/png')
  @ApiResponse({ status: 200, description: 'Global trace QR PNG' })
  async getGlobalQr(@Res() res: Response) {
    const traceUrl = buildGlobalTraceEntryUrl(this.configService);
    const png = await this.qrService.generatePng(traceUrl);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'inline; filename="trace-qr-global.png"');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(png);
  }

  @Get(':lotCode')
  @ApiOperation({
    summary: 'Public traceability lookup — no auth required',
    description: 'Returns full lot info and event history. Intended for end-consumers scanning a QR code on the product packaging.',
  })
  @ApiParam({ name: 'lotCode', example: 'P2-0226-PD-IQF-A' })
  @ApiResponse({ status: 200, description: 'Full traceability data for the lot' })
  @ApiResponse({ status: 404, description: 'Lot not found' })
  getTrace(@Param('lotCode') lotCode: string) {
    return this.publicTraceService.getPublicTrace(lotCode);
  }
}
