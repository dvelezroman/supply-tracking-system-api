import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  ParseIntPipe,
  ParseBoolPipe,
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
import { Packaging, UserRole } from '@prisma/client';
import { LotsService } from './lots.service';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { PatchPublicVisibilityDto } from './dto/patch-public-visibility.dto';
import { LinkRestaurantDto } from './dto/link-restaurant.dto';
import { LotListQueryDto } from './dto/lot-list-query.dto';
import { SuggestLotCodeQueryDto } from './dto/suggest-lot-code.query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { QrService } from '../../common/services/qr.service';
import { PdfService, QR_PER_PAGE, type QrPdfLayout } from '../../common/services/pdf.service';
import {
  RetailLabelPdfService,
  RetailLabelSides,
} from '../../common/services/retail-label-pdf.service';
import {
  checkRetailLabelReadiness,
  type RetailLabelEnvDefaults,
} from '../../common/label/retail-label.resolve';
import { ConfigService } from '@nestjs/config';

const MAX_COPIES = 500;

@ApiTags('lots')
@ApiBearerAuth('access-token')
@Controller('lots')
export class LotsController {
  constructor(
    private readonly lotsService: LotsService,
    private readonly qrService: QrService,
    private readonly pdfService: PdfService,
    private readonly retailLabelPdfService: RetailLabelPdfService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Register a new production lot' })
  @ApiResponse({ status: 201, description: 'Lot created with all 17 shrimp parameters' })
  @ApiResponse({ status: 409, description: 'Lot code already exists' })
  create(@Body() dto: CreateLotDto) {
    return this.lotsService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'List lots (paginated)',
    description:
      'Optional filters: `productId`, `search` (lot code / product name / SKU), `harvestFrom` & `harvestTo` (YYYY-MM-DD, UTC).',
  })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'harvestFrom', required: false })
  @ApiQuery({ name: 'harvestTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query() query: LotListQueryDto) {
    return this.lotsService.findAll(query);
  }

  @Get('suggest-lot-code')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Suggest next lot code for a product',
    description:
      'Returns the next canonical lot code for the given product, pool, harvest date, presentation, and packaging (first free `P{n}-{MMYY}-…` or `…-NN` suffix).',
  })
  @ApiResponse({ status: 200, description: 'Suggested lot code' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  suggestLotCode(@Query() query: SuggestLotCodeQueryDto) {
    return this.lotsService.suggestNextLotCode(query);
  }

  // ── Static `code/*` routes before `:id` so "code" is not captured as an id ──

  @Get('code/:lotCode')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a lot by its canonical lot code' })
  @ApiParam({ name: 'lotCode', example: 'P2-0226-PD-IQF-A' })
  @ApiResponse({ status: 404, description: 'Lot not found' })
  findByCode(@Param('lotCode') lotCode: string) {
    return this.lotsService.findByLotCode(lotCode);
  }

  @Get('code/:lotCode/history')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get full traceability history for a lot',
    description: 'Returns lot details + ordered event chain from harvest to delivery.',
  })
  @ApiParam({ name: 'lotCode', example: 'P2-0226-PD-IQF-A' })
  getHistory(@Param('lotCode') lotCode: string) {
    return this.lotsService.getHistory(lotCode);
  }

  @Get('code/:lotCode/qr')
  @UseGuards(JwtAuthGuard)
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
    const lot = await this.lotsService.findByLotCode(lotCode);

    const traceUrl = lot.publicTraceUrl ?? this.buildTraceUrl(lotCode);
    const png = await this.qrService.generatePng(traceUrl);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="qr-${lotCode}.png"`);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(png);
  }

  @Get('code/:lotCode/qr/pdf')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Generate packaging QR labels for a lot',
    description: `Returns a printable A4 PDF. Layout \`grid\` (default): 10×8 cm labels, up to ${QR_PER_PAGE} per page. Layout \`fullPage\`: one label per A4 portrait sheet, scaled to fill the page while keeping the 10×8 cm proportions (21×16.8 cm). Includes brand/logo, lot code, Code 128 barcode, QR (public trace URL), origin line, and net weight. Default copies=${QR_PER_PAGE}. Max ${MAX_COPIES} per request.`,
  })
  @ApiParam({ name: 'lotCode', example: 'P2-0226-PD-IQF-A' })
  @ApiQuery({
    name: 'copies',
    required: false,
    description: `Number of labels to generate (default: ${QR_PER_PAGE}, max: ${MAX_COPIES})`,
    example: 4,
  })
  @ApiQuery({
    name: 'layout',
    required: false,
    description: 'Label layout: grid (10×8 cm tiled) or fullPage (one label per A4, scaled to fill page)',
    enum: ['grid', 'fullPage'],
    example: 'grid',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'PDF file with packaging labels' })
  @ApiResponse({ status: 400, description: 'Invalid copies or layout' })
  @ApiResponse({ status: 404, description: 'Lot not found' })
  async getQrPdf(
    @Param('lotCode') lotCode: string,
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

    const lot = await this.lotsService.findByLotCode(lotCode);
    const traceUrl = lot.publicTraceUrl ?? this.buildTraceUrl(lotCode);

    const brandName =
      this.configService.get<string>('labelBrandName')?.trim() || lot.product.name;
    const logoUrl = this.configService.get<string>('labelLogoUrl')?.trim();

    const pdf = await this.pdfService.generateQrPdf(traceUrl, {
      lotCode,
      productDescriptor: this.buildProductDescriptor(lot),
      originLine: this.buildOriginLine(lot),
      netWeightKg: lot.weightKg,
      ...this.lotLabelFieldsFromLot(lot),
      copies,
      layout: pdfLayout,
      brandName,
      logoUrl: logoUrl || undefined,
    });

    const layoutSuffix = pdfLayout === 'fullPage' ? '-fullpage' : '';
    const filename = `qr-labels-${lotCode}-x${copies}${layoutSuffix}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  }

  @Get('code/:lotCode/retail-label/readiness')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Check if retail label PDF can be generated for this lot',
    description:
      'Validates lot label name, product retail fields (or SKU/env defaults) and LABEL_OWNER_RUC.',
  })
  @ApiParam({ name: 'lotCode', example: 'P2-0226-PD-IQF-A' })
  @ApiResponse({ status: 200, description: 'Readiness status' })
  @ApiResponse({ status: 404, description: 'Lot not found' })
  async getRetailLabelReadiness(@Param('lotCode') lotCode: string) {
    const lot = await this.lotsService.findByLotCode(lotCode);
    return checkRetailLabelReadiness(lot, lot.product, {
      ...this.retailLabelEnvDefaults(),
      ownerRuc: this.configService.get<string>('labelOwnerRuc'),
    });
  }

  @Get('code/:lotCode/retail-label/pdf')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Generate 12×18cm retail packaging labels (front/back) for Ecuador compliance',
    description:
      'Returns an A4 PDF with one 12cm×18cm label per page. Pages alternate front/back when sides=both. Requires product retail fields (GTIN, net weight) and LABEL_OWNER_RUC. Default copies=1, sides=both, includeTrace=true.',
  })
  @ApiParam({ name: 'lotCode', example: 'P2-0226-PD-IQF-A' })
  @ApiQuery({ name: 'copies', required: false, example: 1 })
  @ApiQuery({ name: 'sides', required: false, enum: ['both', 'front', 'back'] })
  @ApiQuery({ name: 'includeTrace', required: false, example: true })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'Retail label PDF' })
  @ApiResponse({ status: 400, description: 'Invalid parameters or missing product/config data' })
  @ApiResponse({ status: 404, description: 'Lot not found' })
  async getRetailLabelPdf(
    @Param('lotCode') lotCode: string,
    @Query('copies', new DefaultValuePipe(1), ParseIntPipe) copies: number,
    @Query('sides', new DefaultValuePipe('both')) sides: string,
    @Query('includeTrace', new DefaultValuePipe(true), ParseBoolPipe) includeTrace: boolean,
    @Res() res: Response,
  ) {
    if (copies < 1 || copies > MAX_COPIES) {
      throw new BadRequestException(`copies must be between 1 and ${MAX_COPIES}`);
    }

    const validSides: RetailLabelSides[] = ['both', 'front', 'back'];
    if (!validSides.includes(sides as RetailLabelSides)) {
      throw new BadRequestException(`sides must be one of: ${validSides.join(', ')}`);
    }

    const lot = await this.lotsService.findByLotCode(lotCode);
    const product = lot.product;

    const readiness = checkRetailLabelReadiness(lot, product, {
      ...this.retailLabelEnvDefaults(),
      ownerRuc: this.configService.get<string>('labelOwnerRuc'),
    });
    if (!readiness.ready || !readiness.resolved) {
      throw new BadRequestException({
        message:
          'No se puede generar la etiqueta retail. Configure el nombre de etiqueta del lote, el producto (SKU) o variables de entorno.',
        productId: readiness.productId,
        productSku: readiness.productSku,
        missing: readiness.missing,
        hint:
          'Edite el lote (labelName), PATCH /products/:id/retail-label (admin), ejecutar npm run backfill:retail-labels, o definir LABEL_OWNER_RUC y LABEL_DEFAULT_* en .env',
      });
    }

    const resolved = readiness.resolved;
    const ownerRuc = this.configService.get<string>('labelOwnerRuc')!.trim();

    const traceUrl = lot.publicTraceUrl ?? this.buildTraceUrl(lotCode);
    const brandName =
      this.configService.get<string>('labelBrandName')?.trim() || 'MAREA ALTA';
    const logoUrl = this.configService.get<string>('labelLogoUrl')?.trim();

    const pdf = await this.retailLabelPdfService.generateRetailLabelPdf({
      labelTitle: resolved.labelTitle,
      presentationSubtitle: RetailLabelPdfService.presentationSubtitle(lot.presentation),
      netWeightLine: RetailLabelPdfService.buildNetWeightLine(
        resolved.labelNetWeightOz,
        resolved.labelNetWeightLbs,
      ),
      gtin13: resolved.gtin13,
      brandName,
      logoUrl: logoUrl || undefined,
      lotCode: lot.lotCode,
      ...this.lotLabelFieldsFromLot(lot),
      manufacturingLine: RetailLabelPdfService.buildManufacturing({
        coPackerName: lot.coPacker.name,
        ownerLegalName:
          this.configService.get<string>('labelOwnerLegalName')?.trim() || 'MAREA ALTA',
        ownerRuc,
        ownerLocation:
          this.configService.get<string>('labelOwnerLocation')?.trim() ||
          'Portoviejo - Manabí - Ecuador',
      }),
      sanitaryArcsaLine: RetailLabelPdfService.buildSanitaryLine(
        resolved.labelSanitaryArcsa,
        this.configService.get<string>('labelArcsaNotification')?.trim() || 'En trámite',
      ),
      copies,
      sides: sides as RetailLabelSides,
      includeTrace,
      traceUrl: includeTrace ? traceUrl : undefined,
    });

    const filename = `retail-label-${lotCode}-x${copies}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  }

  @Patch(':id/public-visibility')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update which fields appear on the public QR trace page (admin)',
    description:
      'Merges partial flags into the lot snapshot. New lots copy defaults from the product at creation.',
  })
  @ApiResponse({ status: 200, description: 'Lot updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  patchPublicVisibility(
    @Param('id') id: string,
    @Body() body: PatchPublicVisibilityDto,
  ) {
    return this.lotsService.updatePublicVisibility(id, body.patch);
  }

  @Get(':id/restaurants')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List restaurants linked to this lot' })
  listRestaurantsOnLot(@Param('id') lotId: string) {
    return this.lotsService.listRestaurantsOnLot(lotId);
  }

  @Post(':id/restaurants')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Link a restaurant to this lot (append history row)' })
  addRestaurantToLot(
    @Param('id') lotId: string,
    @Body() body: LinkRestaurantDto,
  ) {
    return this.lotsService.addRestaurantToLot(lotId, body.restaurantId);
  }

  @Delete(':id/restaurants/:restaurantId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remove restaurant links to this lot' })
  removeRestaurantFromLot(
    @Param('id') lotId: string,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.lotsService.removeRestaurantFromLot(lotId, restaurantId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a lot by internal ID' })
  @ApiResponse({ status: 404, description: 'Lot not found' })
  findOne(@Param('id') id: string) {
    return this.lotsService.findById(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update lot attributes (lotCode and productId are immutable)' })
  @ApiResponse({ status: 404, description: 'Lot not found' })
  update(@Param('id') id: string, @Body() dto: UpdateLotDto) {
    return this.lotsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Delete a lot',
    description:
      'Hard-deletes all traceability events for this lot (including events previously soft-deleted), deletes only restaurants that were linked solely to this lot, then deletes the lot. Restaurant links to other lots are preserved.',
  })
  @ApiResponse({ status: 200, description: 'Lot deleted' })
  @ApiResponse({ status: 404, description: 'Lot not found' })
  remove(@Param('id') id: string) {
    return this.lotsService.remove(id);
  }

  private retailLabelEnvDefaults(): RetailLabelEnvDefaults {
    const oz = this.configService.get<number>('labelDefaultNetWeightOz');
    const lbs = this.configService.get<number>('labelDefaultNetWeightLbs');
    return {
      gtin13: this.configService.get<string>('labelDefaultGtin13') || undefined,
      netWeightOz: Number.isFinite(oz) ? oz : undefined,
      netWeightLbs: Number.isFinite(lbs) ? lbs : undefined,
      title: this.configService.get<string>('labelDefaultTitle') || undefined,
      sanitaryArcsa: this.configService.get<string>('labelArcsaNotification') || undefined,
    };
  }

  private buildTraceUrl(lotCode: string): string {
    const base = this.configService.get<string>('frontendUrl') ?? 'http://localhost:4200';
    return `${base.replace(/\/$/, '')}/trace/${encodeURIComponent(lotCode)}`;
  }

  private buildProductDescriptor(lot: {
    product: { name: string };
    packaging: Packaging;
  }): string {
    const pkg = lot.packaging === Packaging.IQF ? 'IQF' : 'Cajas';
    return `${lot.product.name} · ${pkg}`;
  }

  private buildOriginLine(lot: { farm: { name: string; location: string | null } }): string {
    const parts = [lot.farm.name?.trim(), lot.farm.location?.trim()].filter(Boolean) as string[];
    return parts.length ? parts.join(' — ') : '—';
  }

  private lotLabelFieldsFromLot(lot: {
    labelConservationText?: string | null;
    labelElaborationDate?: Date | null;
    labelExpirationDate?: Date | null;
    labelManufacturedBy?: string | null;
  }) {
    return {
      labelConservationText: lot.labelConservationText ?? null,
      labelElaborationDate: lot.labelElaborationDate ?? null,
      labelExpirationDate: lot.labelExpirationDate ?? null,
      labelManufacturedBy: lot.labelManufacturedBy ?? null,
    };
  }
}
