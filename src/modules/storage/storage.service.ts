import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  isS3ObjectNotFoundError,
  publicObjectUrl,
  readS3StorageConfig,
  type S3StorageConfig,
} from './s3-storage.util';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;
  private readonly localUploadsDir: string;
  private readonly isProduction: boolean;

  constructor(private readonly config: ConfigService) {
    this.localUploadsDir = path.join(process.cwd(), 'uploads', 'marketplace');
    this.isProduction =
      (this.config.get<string>('nodeEnv') ?? process.env.NODE_ENV) ===
      'production';

    if (!readS3StorageConfig()) {
      if (this.isProduction) {
        this.logger.error(
          'S3 not configured in production — marketplace image uploads will fail',
        );
      } else {
        this.logger.warn(
          'S3 bucket not configured — using local uploads/marketplace stub',
        );
      }
    }
  }

  requireConfig(): S3StorageConfig {
    const config = readS3StorageConfig();
    if (!config) {
      throw new ServiceUnavailableException(
        'S3 no configurado. Define AWS_S3_BUCKET_NAME (bucket/carpeta) y S3_REGION (credenciales en secrets).',
      );
    }
    return config;
  }

  /** True when S3 env is present (bucket + region). */
  isS3Configured(): boolean {
    return readS3StorageConfig() !== null;
  }

  publicUrl(storageKey: string): string | null {
    const config = readS3StorageConfig();
    return publicObjectUrl(config?.publicBaseUrl ?? null, storageKey);
  }

  async putObject(input: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    if (this.isS3Configured()) {
      const config = this.requireConfig();
      try {
        await this.getClient(config).send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: input.key,
            Body: input.body,
            ContentType: input.contentType,
            ContentLength: input.body.length,
            CacheControl: 'public, max-age=31536000, immutable',
          }),
        );
        return;
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'unknown';
        this.logger.error(`s3 put failed key=${input.key}: ${detail}`);
        throw new ServiceUnavailableException('No se pudo subir la foto a S3.');
      }
    }

    if (this.isProduction) {
      throw new ServiceUnavailableException(
        'S3 no configurado. Define AWS_S3_BUCKET_NAME (bucket/carpeta) y S3_REGION.',
      );
    }

    await this.putLocal(input.key, input.body);
  }

  async getObject(
    key: string,
  ): Promise<{ body: Uint8Array; contentType: string }> {
    if (this.isS3Configured()) {
      const config = this.requireConfig();
      try {
        const result = await this.getClient(config).send(
          new GetObjectCommand({
            Bucket: config.bucket,
            Key: key,
          }),
        );
        const body = result.Body
          ? await result.Body.transformToByteArray()
          : new Uint8Array();
        return {
          body,
          contentType: result.ContentType ?? 'application/octet-stream',
        };
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'unknown';
        if (isS3ObjectNotFoundError(err)) {
          this.logger.warn(`s3 get missing key=${key}: ${detail}`);
          throw new NotFoundException(
            'La foto no existe en S3 (registro huérfano). Elimínela y vuelva a subir, o marque otra como principal.',
          );
        }
        this.logger.error(`s3 get failed key=${key}: ${detail}`);
        throw new ServiceUnavailableException('No se pudo leer la foto en S3.');
      }
    }

    if (this.isProduction) {
      throw new ServiceUnavailableException('S3 no configurado.');
    }

    return this.getLocal(key);
  }

  async deleteObject(key: string): Promise<void> {
    if (!key) return;

    if (this.isS3Configured()) {
      const config = this.requireConfig();
      try {
        await this.getClient(config).send(
          new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: key,
          }),
        );
        return;
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'unknown';
        this.logger.error(`s3 delete failed key=${key}: ${detail}`);
        throw new ServiceUnavailableException('No se pudo borrar la foto en S3.');
      }
    }

    if (this.isProduction) {
      return;
    }

    await this.deleteLocal(key);
  }

  /** @deprecated Prefer putObject + productImageObjectKey. Kept for callers expecting {key,url}. */
  async delete(key: string): Promise<void> {
    await this.deleteObject(key);
  }

  private getClient(config: S3StorageConfig): S3Client {
    if (this.client) {
      return this.client;
    }
    const credentials =
      config.accessKeyId && config.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          }
        : undefined;
    const connectionTimeoutMs = Number(
      this.config.get<string>('S3_CONNECTION_TIMEOUT_MS') ??
        process.env.S3_CONNECTION_TIMEOUT_MS ??
        10_000,
    );
    const requestTimeoutMs = Number(
      this.config.get<string>('S3_REQUEST_TIMEOUT_MS') ??
        process.env.S3_REQUEST_TIMEOUT_MS ??
        45_000,
    );
    this.client = new S3Client({
      region: config.region,
      credentials,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: connectionTimeoutMs,
        requestTimeout: requestTimeoutMs,
      }),
    });
    return this.client;
  }

  private localAbsPath(key: string): string {
    // Keys may be `mareaalta-marketplace/SKU/id.jpg` or legacy `marketplace/...`
    const relative = key
      .replace(/^mareaalta-marketplace\//, '')
      .replace(/^marketplace\//, '');
    return path.join(this.localUploadsDir, relative);
  }

  private async putLocal(key: string, body: Buffer): Promise<void> {
    const absPath = this.localAbsPath(key);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, body);
  }

  private async getLocal(
    key: string,
  ): Promise<{ body: Uint8Array; contentType: string }> {
    const absPath = this.localAbsPath(key);
    try {
      const buf = await fs.readFile(absPath);
      const ext = path.extname(absPath).toLowerCase();
      const contentType =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg';
      return { body: new Uint8Array(buf), contentType };
    } catch {
      throw new NotFoundException(
        `Local file not found for key=${key}`,
      );
    }
  }

  private async deleteLocal(key: string): Promise<void> {
    const absPath = this.localAbsPath(key);
    try {
      await fs.unlink(absPath);
    } catch {
      this.logger.warn(`Local file not found for delete: ${absPath}`);
    }
  }
}
