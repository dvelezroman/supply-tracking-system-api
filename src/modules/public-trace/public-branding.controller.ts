import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';

export interface PublicBrandingDto {
  logoUrl: string | null;
  headerTitle: string;
}

const HEADER_SUFFIX = 'Supply Tracking';
const DEFAULT_BRAND_FOR_HEADER = 'MAREA ALTA';

@ApiTags('public')
@SkipEnvelope()
@Controller('public')
export class PublicBrandingController {
  constructor(private readonly configService: ConfigService) {}

  @Get('branding')
  @ApiOperation({
    summary: 'Public branding for the consumer site header',
    description:
      'Returns `logoUrl` from LABEL_LOGO_URL. `headerTitle` is PUBLIC_HEADER_TITLE if set, otherwise `${LABEL_BRAND_NAME.toUpperCase()} Supply Tracking` (default brand MAREA ALTA when LABEL_BRAND_NAME is unset).',
  })
  @ApiResponse({ status: 200, description: 'Branding payload' })
  branding(): PublicBrandingDto {
    const rawLogo = this.configService.get<string>('labelLogoUrl')?.trim();
    const explicit = this.configService.get<string>('publicHeaderTitle')?.trim();
    const brandRaw =
      this.configService.get<string>('labelBrandName')?.trim() || DEFAULT_BRAND_FOR_HEADER;
    const composed = `${brandRaw.toUpperCase()} ${HEADER_SUFFIX}`.trim();
    const headerTitle = explicit || composed;

    return {
      logoUrl: rawLogo && /^https?:\/\//i.test(rawLogo) ? rawLogo : null,
      headerTitle,
    };
  }
}
