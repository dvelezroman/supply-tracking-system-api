import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';

export interface PublicBrandingDto {
  logoUrl: string | null;
  /** Landing / consumer home toolbar: brand name only (e.g. MAREA ALTA). */
  headerTitle: string;
  /** Operator app shell: brand + product suffix (e.g. MAREA ALTA Supply Tracking). */
  platformTitle: string;
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
      '`headerTitle` is for the landing toolbar (brand only from LABEL_BRAND_NAME unless PUBLIC_LANDING_TITLE / legacy PUBLIC_HEADER_TITLE). `platformTitle` is for the operator UI: `${LABEL_BRAND_NAME} Supply Tracking`.',
  })
  @ApiResponse({ status: 200, description: 'Branding payload' })
  branding(): PublicBrandingDto {
    const rawLogo = this.configService.get<string>('labelLogoUrl')?.trim();
    const brandRaw =
      this.configService.get<string>('labelBrandName')?.trim() || DEFAULT_BRAND_FOR_HEADER;
    const brandUpper = brandRaw.toUpperCase();

    const landingExplicit =
      this.configService.get<string>('publicLandingTitle')?.trim() ||
      this.configService.get<string>('publicHeaderTitle')?.trim();
    const headerTitle = landingExplicit || brandUpper;

    const platformTitle = `${brandUpper} ${HEADER_SUFFIX}`.trim();

    return {
      logoUrl: rawLogo && /^https?:\/\//i.test(rawLogo) ? rawLogo : null,
      headerTitle,
      platformTitle,
    };
  }
}
