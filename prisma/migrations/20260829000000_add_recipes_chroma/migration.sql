-- Recipes catalogue + likes (embeddings stored in ChromaDB, not Postgres)

-- CreateEnum
CREATE TYPE "RecipeStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RecipeSourceType" AS ENUM ('MANUAL', 'API_IMPORT', 'SCRAPE', 'SEED');

-- CreateTable
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "cuisine" TEXT,
    "region" TEXT,
    "language" TEXT NOT NULL DEFAULT 'es',
    "difficulty" TEXT,
    "prepMinutes" INTEGER,
    "cookMinutes" INTEGER,
    "servings" INTEGER,
    "ingredients" JSONB NOT NULL DEFAULT '[]',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "tips" TEXT,
    "techniques" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dietaryTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suitablePresentations" "Presentation"[] DEFAULT ARRAY[]::"Presentation"[],
    "imageUrl" TEXT,
    "sourceType" "RecipeSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "attribution" TEXT,
    "license" TEXT,
    "status" "RecipeStatus" NOT NULL DEFAULT 'DRAFT',
    "contentHash" TEXT,
    "searchText" TEXT,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_products" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_likes" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_chunks" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "chromaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingest_jobs" (
    "id" TEXT NOT NULL,
    "sourceType" "RecipeSourceType" NOT NULL,
    "sourceUrl" TEXT,
    "query" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultRecipeId" TEXT,
    "error" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_ingest_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recipes_slug_key" ON "recipes"("slug");
CREATE INDEX "recipes_status_idx" ON "recipes"("status");
CREATE INDEX "recipes_category_idx" ON "recipes"("category");
CREATE INDEX "recipes_likeCount_idx" ON "recipes"("likeCount");
CREATE INDEX "recipes_publishedAt_idx" ON "recipes"("publishedAt");
CREATE INDEX "recipes_contentHash_idx" ON "recipes"("contentHash");
CREATE INDEX "recipe_products_productId_idx" ON "recipe_products"("productId");
CREATE UNIQUE INDEX "recipe_products_recipeId_productId_key" ON "recipe_products"("recipeId", "productId");
CREATE INDEX "recipe_likes_createdAt_idx" ON "recipe_likes"("createdAt");
CREATE INDEX "recipe_likes_recipeId_idx" ON "recipe_likes"("recipeId");
CREATE UNIQUE INDEX "recipe_likes_recipeId_clientKey_key" ON "recipe_likes"("recipeId", "clientKey");
CREATE INDEX "recipe_chunks_recipeId_idx" ON "recipe_chunks"("recipeId");
CREATE UNIQUE INDEX "recipe_chunks_recipeId_chunkIndex_key" ON "recipe_chunks"("recipeId", "chunkIndex");
CREATE INDEX "recipe_ingest_jobs_status_idx" ON "recipe_ingest_jobs"("status");

-- AddForeignKey
ALTER TABLE "recipe_products" ADD CONSTRAINT "recipe_products_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipe_products" ADD CONSTRAINT "recipe_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipe_likes" ADD CONSTRAINT "recipe_likes_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipe_chunks" ADD CONSTRAINT "recipe_chunks_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
