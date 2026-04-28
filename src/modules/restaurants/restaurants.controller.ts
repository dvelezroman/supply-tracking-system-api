import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RestaurantsService } from './restaurants.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { RestaurantQueryDto } from './dto/restaurant-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('restaurants')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a restaurant (menu QR generated automatically)' })
  @ApiResponse({ status: 201, description: 'Restaurant created with QR fields' })
  @ApiResponse({ status: 409, description: 'Slug already in use' })
  create(@Body() dto: CreateRestaurantDto) {
    return this.restaurantsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List restaurants (paginated); QR PNG omitted from list rows' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query() query: RestaurantQueryDto) {
    return this.restaurantsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get restaurant by ID (includes menu QR data URL)' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id') id: string) {
    return this.restaurantsService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update restaurant (regenerates QR if slug changes)' })
  update(@Param('id') id: string, @Body() dto: UpdateRestaurantDto) {
    return this.restaurantsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete restaurant' })
  remove(@Param('id') id: string) {
    return this.restaurantsService.remove(id);
  }
}
