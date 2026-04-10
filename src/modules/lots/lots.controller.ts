import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { IsOptional, IsUUID } from 'class-validator';
import { LotsService } from './lots.service';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { QrService } from '../../common/services/qr.service';
import { PdfService, QR_PER_PAGE } from '../../common/services/pdf.service';
import { ConfigService } from '@nestjs/config';

const MAX_COPIES = 500;

class LotQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  productId?: string;
}

@ApiTags('lots')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('lots')
export class LotsController {
  constructor(
    private readonly lotsService: LotsService,
    private readonly qrService: QrService,
    private readonly pdfService: PdfService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Register a new production lot' })
  @ApiResponse({ status: 201, description: 'Lot created with all 17 shrimp parameters' })
  @ApiResponse({ status: 409, description: 'Lot code already exists' })
  create(@Body() dto: CreateLotDto) {
    return this.lotsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List lots (paginated, optional filter by product)' })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query() query: LotQueryDto) {
    return this.lotsService.findAll(query.page, query.limit, query.productId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a lot by internal ID' })
  @ApiResponse({ status: 404, description: 'Lot not found' })
  findOne(@Param('id') id: string) {
    return this.lotsService.findById(id);
  }

  @Get('code/:lotCode')
  @ApiOperation({ summary: 'Get a lot by its canonical lot code' })
  @ApiParam({ name: 'lotCode', example: 'P2-0226-PD-IQF-A' })
  @ApiResponse({ status: 404, description: 'Lot not found' })
  findByCode(@Param('lotCode') lotCode: string) {
    return this.lotsService.findByLotCode(lotCode);
  }

  @Get('code/:lotCode/history')
  @ApiOperation({
    summary: 'Get full traceability history for a lot',
    description: 'Returns lot details + ordered event chain from harvest to delivery.',
  })
  @ApiParam({ name: 'lotCode', example: 'P2-0226-PD-IQF-A' })
  getHistory(@Param('lotCode') lotCode: string) {
    return this.lotsService.getHistory(lotCode);
  }

  @Get('code/:lotCode/qr')
  @ApiOperation({
    summary: 'Get QR code PNG for a lot',
    description: 'Returns a PNG image encoding the public traceability URL.',
  })
  @ApiParam({ name: 'lotCode', example: 'P2-0226-PD-IQF-A' })
  @ApiProduces('image/png')
  @ApiResponse({ status: 200, description: 'QR code PNG' })
  async getQrCode(
    @Param('lotCode') lotCode: string,
    @Res() res: Response,
  ) {
    await this.lotsService.findByLotCode(lotCode);

    const traceUrl = this.buildTraceUrl(lotCode);
    const png = await this.qrService.generatePng(traceUrl);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="qr-${lotCode}.png"`);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(png);
  }

  @Get('code/:lotCode/qr/pdf')
  @ApiOperation({
    summary: 'Generate a PDF sheet of QR code labels for a lot',
    description: `Returns a printable A4 PDF with N copies of the lot QR code arranged in a ${QR_PER_PAGE}-per-page grid (5 columns × 6 rows). All QR codes point to the same public traceability URL. Maximum ${MAX_COPIES} copies per request.`,
  })
  @ApiParam({ name: 'lotCode', example: 'P2-0226-PD-IQF-A' })
  @ApiQuery({
    name: 'copies',
    required: false,
    description: `Number of QR labels to generate (default: ${QR_PER_PAGE}, max: ${MAX_COPIES})`,
    example: 25,
  })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'PDF file with QR label grid' })
  @ApiResponse({ status: 400, description: 'copies must be between 1 and 500' })
  @ApiResponse({ status: 404, description: 'Lot not found' })
  async getQrPdf(
    @Param('lotCode') lotCode: string,
    @Query('copies', new DefaultValuePipe(QR_PER_PAGE), ParseIntPipe) copies: number,
    @Res() res: Response,
  ) {
    if (copies < 1 || copies > MAX_COPIES) {
      throw new BadRequestException(`copies must be between 1 and ${MAX_COPIES}`);
    }

    const lot = await this.lotsService.findByLotCode(lotCode);
    const traceUrl = this.buildTraceUrl(lotCode);

    const pdf = await this.pdfService.generateQrPdf(traceUrl, {
      lotCode,
      productName: lot.product.name,
      copies,
    });

    const filename = `qr-labels-${lotCode}-x${copies}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update lot attributes (lotCode and productId are immutable)' })
  @ApiResponse({ status: 404, description: 'Lot not found' })
  update(@Param('id') id: string, @Body() dto: UpdateLotDto) {
    return this.lotsService.update(id, dto);
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private buildTraceUrl(lotCode: string): string {
    const base = this.configService.get<string>('frontendUrl') ?? 'http://localhost:4200';
    return `${base}/trace/${lotCode}`;
  }
}
