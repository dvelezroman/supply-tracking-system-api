import { BadRequestException } from '@nestjs/common';

export const PRODUCT_IMAGE_MAX_BYTES = 512 * 1024;
export const PRODUCT_IMAGE_MAX_COUNT = 6;

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export type SniffedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export function sniffProductImageMime(bytes: Buffer): SniffedImageType {
  if (bytes.length < 12) {
    throw new BadRequestException(
      'La imagen está vacía o es demasiado pequeña.',
    );
  }
  if (bytes.subarray(0, 3).equals(JPEG)) {
    return 'image/jpeg';
  }
  if (bytes.subarray(0, 4).equals(PNG)) {
    return 'image/png';
  }
  const riff = bytes.subarray(0, 4).toString('ascii') === 'RIFF';
  const webp = bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (riff && webp) {
    return 'image/webp';
  }
  throw new BadRequestException(
    'Formato no permitido. Usa JPG, PNG o WebP (máx. 512 KB).',
  );
}

export function assertProductImageSize(byteSize: number): void {
  if (byteSize < 32) {
    throw new BadRequestException(
      'La imagen está vacía o es demasiado pequeña.',
    );
  }
  if (byteSize > PRODUCT_IMAGE_MAX_BYTES) {
    throw new BadRequestException('La imagen supera 512 KB.');
  }
}
