import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  ChatMessageDto,
  CreateRecipeDto,
  ImportApiDto,
  ImportUrlDto,
  LinkProductsDto,
  PopularQueryDto,
  RecipeLikeDto,
  RecipeQueryDto,
  SetRecipeStatusDto,
  UpdateRecipeDto,
} from './dto/recipe.dto';
import { RecipeChatService } from './recipe-chat.service';
import { RecipeIngestService } from './recipe-ingest.service';
import { RecipesService } from './recipes.service';

@ApiTags('recipes-public')
@Controller('public/recipes')
export class RecipesPublicController {
  constructor(private readonly recipes: RecipesService) {}

  @Get()
  @ApiOperation({ summary: 'Search published recipes' })
  search(@Query() query: RecipeQueryDto) {
    return this.recipes.searchPublic(query);
  }

  @Get('popular')
  @ApiOperation({ summary: 'Most liked published recipes' })
  popular(@Query() query: PopularQueryDto) {
    return this.recipes.popular(query.limit ?? 6);
  }

  @Get('trending')
  @ApiOperation({ summary: 'Trending recipes by recent likes' })
  trending(@Query() query: PopularQueryDto) {
    return this.recipes.trending(query.limit ?? 6);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Published recipe detail' })
  getOne(@Param('slug') slug: string) {
    return this.recipes.getPublishedBySlug(slug);
  }

  @Get(':slug/like-status')
  @ApiOperation({ summary: 'Whether clientKey liked this recipe' })
  @ApiHeader({ name: 'x-client-key', required: true })
  likeStatus(
    @Param('slug') slug: string,
    @Headers('x-client-key') clientKey: string,
    @Query('clientKey') clientKeyQuery?: string,
  ) {
    return this.recipes.likeStatus(slug, clientKey || clientKeyQuery || '');
  }

  @Post(':slug/like')
  @ApiOperation({ summary: 'Like a published recipe' })
  like(@Param('slug') slug: string, @Body() dto: RecipeLikeDto) {
    return this.recipes.like(slug, dto.clientKey);
  }

  @Delete(':slug/like')
  @ApiOperation({ summary: 'Unlike a published recipe' })
  unlike(@Param('slug') slug: string, @Body() dto: RecipeLikeDto) {
    return this.recipes.unlike(slug, dto.clientKey);
  }
}

@ApiTags('recipes-chat')
@Controller('public/chat')
export class RecipeChatController {
  constructor(private readonly chat: RecipeChatService) {}

  @Post()
  @ApiOperation({ summary: 'Mary RAG chat over published recipes' })
  ask(@Body() dto: ChatMessageDto) {
    return this.chat.chat(dto.message, dto.lang ?? 'es');
  }
}

@ApiTags('recipes-admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('recipes/admin')
export class RecipesAdminController {
  constructor(
    private readonly recipes: RecipesService,
    private readonly ingest: RecipeIngestService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List recipes (admin)' })
  list(@Query() query: RecipeQueryDto) {
    return this.recipes.listAdmin(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create recipe' })
  create(@Body() dto: CreateRecipeDto) {
    return this.recipes.create(dto);
  }

  @Post('import/api')
  @ApiOperation({ summary: 'Import shrimp recipes from TheMealDB' })
  importApi(@Body() dto: ImportApiDto) {
    return this.ingest.importFromMealDb(dto.query ?? 'shrimp');
  }

  @Post('import/url')
  @ApiOperation({ summary: 'Import recipe from allowlisted URL' })
  importUrl(@Body() dto: ImportUrlDto) {
    return this.ingest.importFromUrl(dto.url);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get recipe by id' })
  getOne(@Param('id') id: string) {
    return this.recipes.getAdminById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update recipe' })
  update(@Param('id') id: string, @Body() dto: UpdateRecipeDto) {
    return this.recipes.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change recipe status (publish / archive)' })
  setStatus(@Param('id') id: string, @Body() dto: SetRecipeStatusDto) {
    return this.recipes.setStatus(id, dto.status);
  }

  @Put(':id/products')
  @ApiOperation({ summary: 'Replace linked products' })
  linkProducts(@Param('id') id: string, @Body() dto: LinkProductsDto) {
    return this.recipes.linkProducts(id, dto.productIds);
  }

  @Post(':id/reindex')
  @ApiOperation({ summary: 'Re-embed recipe chunks for RAG' })
  reindex(@Param('id') id: string) {
    return this.recipes.reindex(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete recipe' })
  remove(@Param('id') id: string) {
    return this.recipes.remove(id);
  }
}
