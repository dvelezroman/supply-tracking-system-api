import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateMarketplaceOrderDto,
  MarketplaceOrderQueryDto,
} from './dto/create-order.dto';
import { MarketplaceService } from './marketplace.service';

@ApiTags('marketplace')
@Controller('marketplace/orders')
export class MarketplaceOrdersPublicController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Post()
  @ApiOperation({ summary: 'Place marketplace order (guest checkout)' })
  @ApiResponse({ status: 201, description: 'Order created' })
  @ApiResponse({ status: 409, description: 'Insufficient stock' })
  create(@Body() dto: CreateMarketplaceOrderDto) {
    return this.marketplace.placeOrder(dto);
  }

  @Get(':orderNumber')
  @ApiOperation({ summary: 'Public order confirmation lookup by order number' })
  getByNumber(@Param('orderNumber') orderNumber: string) {
    return this.marketplace.findOrderByNumberPublic(orderNumber);
  }
}

@ApiTags('marketplace-admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('marketplace/admin/orders')
export class MarketplaceOrdersAdminController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get()
  @ApiOperation({ summary: 'List marketplace orders' })
  list(@Query() query: MarketplaceOrderQueryDto) {
    return this.marketplace.listOrders(
      query.page,
      query.limit,
      query.status,
      query.search,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by id' })
  getOne(@Param('id') id: string) {
    return this.marketplace.findOrderById(id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel order and restock inventory' })
  cancel(@Param('id') id: string) {
    return this.marketplace.cancelOrder(id);
  }
}
