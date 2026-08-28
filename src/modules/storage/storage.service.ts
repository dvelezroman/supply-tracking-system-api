import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

export type UploadedObject = {
  key: string;
  url: string;
};

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly localUploadsDir: string;
  private readonly useS3: boolean;

  constructor(private readonly config: ConfigService) {
    const accessKeyId = this.config.get<string>('aws.accessKeyId') ?? '';
    const secretAccessKey = this.config.get<string>('aws.secretAccessKey') ?? '';
    const region = this.config.get<string>('aws.region') ?? 'us-east-1';
    this.bucket = this.config.get<string>('aws.s3Bucket') ?? '';
    this.publicBaseUrl = (this.config.get<string>('aws.s3PublicBaseUrl') ?? '').replace(
      /\/$/,
      '',
    );
    this.localUploadsDir = path.join(process.cwd(), 'uploads', 'marketplace');

    this.useS3 = Boolean(accessKeyId && secretAccessKey && this.bucket);
    this.s3 = this.useS3
      ? new S3Client({
          region,
          credentials: { accessKeyId, secretAccessKey },
        })
      : null;

    if (!this.useS3) {
      this.logger.warn(
        'S3 credentials/bucket not configured — using local uploads/marketplace stub',
      );
    }
  }

  async upload(
    buffer: Buffer,
    contentType: string,
    originalName?: string,
  ): Promise<UploadedObject> {
    const ext = this.extensionFrom(contentType, originalName);
    const key = `marketplace/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext}`;

    if (this.useS3 && this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );
      const url = this.publicBaseUrl
        ? `${this.publicBaseUrl}/${key}`
        : `https://${this.bucket}.s3.amazonaws.com/${key}`;
      return { key, url };
    }

    const absPath = path.join(this.localUploadsDir, key.replace(/^marketplace\//, ''));
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, buffer);
    // Local stub URLs point at API static /uploads
    const apiBase = (
      process.env.API_PUBLIC_URL?.trim() ||
      `http://localhost:${this.config.get<string>('port') || 3000}`
    ).replace(/\/$/, '');
    const relative = key.replace(/^marketplace\//, '');
    const url = `${apiBase}/uploads/marketplace/${relative}`;
    return { key, url };
  }

  async delete(key: string): Promise<void> {
    if (!key) return;

    if (this.useS3 && this.s3) {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return;
    }

    const absPath = path.join(
      this.localUploadsDir,
      key.replace(/^marketplace\//, ''),
    );
    try {
      await fs.unlink(absPath);
    } catch {
      this.logger.warn(`Local file not found for delete: ${absPath}`);
    }
  }

  private extensionFrom(contentType: string, originalName?: string): string {
    if (originalName) {
      const fromName = path.extname(originalName).toLowerCase();
      if (fromName && fromName.length <= 8) return fromName;
    }
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    };
    return map[contentType] ?? '.bin';
  }
}
