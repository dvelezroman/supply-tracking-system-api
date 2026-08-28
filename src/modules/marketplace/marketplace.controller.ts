import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { memoryStorage } from 'multer';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateMarketplaceProductDto,
  MarketplaceProductQueryDto,
  UpdateMarketplaceProductDto,
  UpdateMarketplaceSettingsDto,
  AddMarketplaceImageByUrlDto,
} from './dto/marketplace.dto';
import { MarketplaceService } from './marketplace.service';

@ApiTags('marketplace')
@Controller('marketplace')
export class MarketplacePublicController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Public store flags (storeEnabled)' })
  getPublicSettings() {
    return this.marketplace.getPublicSettings();
  }

  @Get('products')
  @ApiOperation({ summary: 'List published marketplace products' })
  listPublic(@Query() query: MarketplaceProductQueryDto) {
    return this.marketplace.listPublic(
      query.page,
      query.limit,
      query.search,
      query.category,
    );
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'Get published product by slug' })
  @ApiResponse({ status: 404, description: 'Not found' })
  getBySlug(@Param('slug') slug: string) {
    return this.marketplace.findPublishedBySlug(slug);
  }
}

@ApiTags('marketplace-admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('marketplace/admin')
export class MarketplaceAdminController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get marketplace settings (admin)' })
  getSettings() {
    return this.marketplace.getAdminSettings();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Update marketplace settings (admin)' })
  updateSettings(@Body() dto: UpdateMarketplaceSettingsDto) {
    return this.marketplace.updateSettings(dto);
  }

  @Get('products')
  @ApiOperation({ summary: 'List all marketplace products (admin)' })
  list(@Query() query: MarketplaceProductQueryDto) {
    return this.marketplace.listAdmin(
      query.page,
      query.limit,
      query.search,
      query.published,
      query.category,
    );
  }

  @Post('products')
  @ApiOperation({ summary: 'Create marketplace product' })
  create(@Body() dto: CreateMarketplaceProductDto) {
    return this.marketplace.createProduct(dto);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get marketplace product by id' })
  getOne(@Param('id') id: string) {
    return this.marketplace.findProductById(id);
  }

  @Put('products/:id')
  @ApiOperation({ summary: 'Update marketplace product' })
  update(@Param('id') id: string, @Body() dto: UpdateMarketplaceProductDto) {
    return this.marketplace.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @ApiOperation({ summary: 'Delete marketplace product' })
  remove(@Param('id') id: string) {
    return this.marketplace.removeProduct(id);
  }

  @Post('products/:id/images')
  @ApiOperation({ summary: 'Upload product image to S3 (or local stub)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        isPrimary: { type: 'boolean' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('isPrimary') isPrimary?: string,
  ) {
    const primary =
      isPrimary === 'true' || isPrimary === '1' || isPrimary === 'yes';
    return this.marketplace.uploadImage(id, file, primary);
  }

  @Post('products/:id/images/url')
  @ApiOperation({
    summary: 'Add product image by public URL (no S3 upload)',
  })
  addImageByUrl(
    @Param('id') id: string,
    @Body() dto: AddMarketplaceImageByUrlDto,
  ) {
    return this.marketplace.addImageByUrl(id, dto.url, dto.isPrimary);
  }

  @Delete('products/:productId/images/:imageId')
  @ApiOperation({ summary: 'Delete product image' })
  deleteImage(
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.marketplace.deleteImage(productId, imageId);
  }

  @Patch('products/:productId/images/:imageId/primary')
  @ApiOperation({ summary: 'Set primary product image' })
  setPrimary(
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.marketplace.setPrimaryImage(productId, imageId);
  }
}
