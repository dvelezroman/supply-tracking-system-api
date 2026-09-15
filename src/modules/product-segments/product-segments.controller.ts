import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ProductSegmentsService } from './product-segments.service';
import { CreateProductSegmentDto } from './dto/create-product-segment.dto';
import { UpdateProductSegmentDto } from './dto/update-product-segment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('product-segments')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('product-segments')
export class ProductSegmentsController {
  constructor(private readonly productSegmentsService: ProductSegmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a product segment' })
  @ApiResponse({ status: 201, description: 'Segment created' })
  @ApiResponse({ status: 409, description: 'Name already exists' })
  create(@Body() dto: CreateProductSegmentDto) {
    return this.productSegmentsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all product segments' })
  findAll() {
    return this.productSegmentsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get segment by ID' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id') id: string) {
    return this.productSegmentsService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update segment name' })
  update(@Param('id') id: string, @Body() dto: UpdateProductSegmentDto) {
    return this.productSegmentsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete segment (products are unlinked)' })
  remove(@Param('id') id: string) {
    return this.productSegmentsService.remove(id);
  }
}
