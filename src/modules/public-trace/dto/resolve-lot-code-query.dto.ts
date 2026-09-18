import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, Matches, Min } from 'class-validator';

const PRESENTATION_SEGMENTS = ['SO', 'BF', 'PD', 'PT'] as const;
const PACKAGING_SEGMENTS = ['IQF', 'CBX'] as const;

export class ResolveLotCodeQueryDto {
  @ApiProperty({ example: 1, description: 'Farm pool number (P{n})' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  poolNumber: number;

  @ApiProperty({ example: '0726', description: 'Harvest month+year MMYY' })
  @Matches(/^\d{4}$/)
  harvestMmyy: string;

  @ApiProperty({ example: 'PD', enum: PRESENTATION_SEGMENTS })
  @IsIn([...PRESENTATION_SEGMENTS])
  presentationSegment: (typeof PRESENTATION_SEGMENTS)[number];

  @ApiProperty({ example: 'IQF', enum: PACKAGING_SEGMENTS })
  @IsIn([...PACKAGING_SEGMENTS])
  packagingSegment: (typeof PACKAGING_SEGMENTS)[number];
}
