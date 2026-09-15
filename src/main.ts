import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';
import { readAllowedCorsOrigins } from './config/cors.util';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

const DEV_JWT_PLACEHOLDER = 'default-secret-change-in-production';

function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const jwt = process.env.JWT_SECRET?.trim();
  if (!jwt || jwt === DEV_JWT_PLACEHOLDER) {
    throw new Error(
      'JWT_SECRET must be set to a strong, non-default value in production',
    );
  }
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required in production');
  }
}

type CorsOriginCallback = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => void;

function corsOriginOption(): boolean | CorsOriginCallback {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  const allowed = readAllowedCorsOrigins();
  if (allowed.length === 0) {
    throw new Error(
      'Set CORS_ORIGIN (comma-separated) or FRONTEND_URL in production for CORS',
    );
  }
  const allowedSet = new Set(allowed);
  return (origin, callback) => {
    if (!origin || allowedSet.has(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  };
}

async function bootstrap() {
  assertProductionEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const apiPrefix = process.env.API_PREFIX ?? 'api';
  const apiVersion = process.env.API_VERSION ?? 'v0';
  const globalPrefix = `${apiPrefix}/${apiVersion}`;

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  app.setGlobalPrefix(globalPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new ResponseInterceptor(app.get(Reflector)),
  );

  app.enableCors({
    origin: corsOriginOption(),
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Supply Tracking API')
    .setDescription('End-to-end product traceability — from origin to consumer')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addTag('auth', 'Authentication')
    .addTag('users', 'User management')
    .addTag('actors', 'Supply chain actors (suppliers, manufacturers, retailers…)')
    .addTag('products', 'Product catalogue')
    .addTag('lots', 'Production lots — the core traceable unit')
    .addTag('traceability', 'Traceability event log per lot')
    .addTag('public', 'Public endpoints — no authentication required')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${globalPrefix}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application running on  http://localhost:${port}/${globalPrefix}`);
  console.log(`Swagger docs available at http://localhost:${port}/${globalPrefix}/docs`);
}

bootstrap();
