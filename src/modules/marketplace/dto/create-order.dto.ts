import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export enum OrderPaymentMethodDto {
  EMAIL = 'EMAIL',
  PAYPAL = 'PAYPAL',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CARD = 'CARD',
}

export class CreateOrderItemDto {
  @ApiProperty({ description: 'Marketplace product id (UUID or stable string id)' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty: number;
}

export class CreateMarketplaceOrderDto {
  @ApiProperty({ example: 'Ana Pérez' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  customerName: string;

  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail()
  customerEmail: string;

  @ApiPropertyOptional({
    example: '+593995710556',
    description:
      'Ecuador WhatsApp E.164 (+593 + 9 digits starting with 9, no trunk 0). Required for EMAIL / BANK_TRANSFER.',
  })
  @ValidateIf(
    (o: CreateMarketplaceOrderDto) =>
      (o.paymentMethod ?? OrderPaymentMethodDto.EMAIL) !==
      OrderPaymentMethodDto.PAYPAL,
  )
  @IsString()
  @IsNotEmpty({ message: 'customerPhone is required for offline payment methods' })
  @MaxLength(40)
  customerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({
    enum: OrderPaymentMethodDto,
    default: OrderPaymentMethodDto.EMAIL,
  })
  @IsOptional()
  @IsEnum(OrderPaymentMethodDto)
  paymentMethod?: OrderPaymentMethodDto;

  @ApiPropertyOptional({
    default: true,
    description: 'When false, skip customer WhatsApp notifications for this order',
  })
  @IsOptional()
  @IsBoolean()
  notifyWhatsapp?: boolean;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}

export class CapturePayPalOrderDto {
  @ApiProperty({ description: 'PayPal order id (token from return URL)' })
  @IsString()
  @IsNotEmpty()
  paypalOrderId: string;

  @ApiPropertyOptional({ description: 'Mock HMAC signature (mock mode only)' })
  @IsOptional()
  @IsString()
  sig?: string;
}

export class ConfirmPayphonePaymentDto {
  @ApiProperty({
    description: 'Payphone transaction id from redirect query `id`',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  payphoneId: number;

  @ApiProperty({
    description: 'clientTransactionId from redirect (maps to Payphone clientTxId)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  clientTransactionId: string;
}

export class MarketplaceOrderQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({
    enum: [
      'PENDING',
      'EMAILED',
      'CANCELLED',
      'AWAITING_PAYMENT',
      'PAID',
      'PAYMENT_FAILED',
    ],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
