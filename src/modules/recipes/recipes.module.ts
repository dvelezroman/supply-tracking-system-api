import { Module } from '@nestjs/common';
import { RecipeChatService } from './recipe-chat.service';
import { RecipeEmbeddingsService } from './recipe-embeddings.service';
import { RecipeIngestService } from './recipe-ingest.service';
import {
  RecipeChatController,
  RecipesAdminController,
  RecipesPublicController,
} from './recipes.controller';
import { RecipesRepository } from './recipes.repository';
import { RecipesService } from './recipes.service';

@Module({
  controllers: [
    RecipesPublicController,
    RecipeChatController,
    RecipesAdminController,
  ],
  providers: [
    RecipesRepository,
    RecipesService,
    RecipeEmbeddingsService,
    RecipeIngestService,
    RecipeChatService,
  ],
  exports: [RecipesService, RecipeChatService, RecipeEmbeddingsService],
})
export class RecipesModule {}
