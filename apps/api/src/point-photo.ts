import { BadRequestException } from '@nestjs/common';

export const maxPointPhotoBytes = 20 * 1024 * 1024;
export const pointPhotoJsonLimit = '28mb';
const maxEncodedPhotoLength =
  Math.ceil(maxPointPhotoBytes / 3) * 4 + 'data:image/jpeg;base64,'.length;

// Read raster dimensions without allocating a decompressed bitmap.
export function validatePointPhoto(input: unknown): string {
  if (input === undefined || input === '') return '';
  const invalid = () =>
    new BadRequestException(
      'Use foto JPG, PNG ou WebP de até 20 MB e 4096 × 4096 pixels.',
    );
  if (typeof input !== 'string' || input.length > maxEncodedPhotoLength)
    throw invalid();
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
  if (!match) throw invalid();
  const data = Buffer.from(match[2]!, 'base64');
  if (data.length > maxPointPhotoBytes || data.toString('base64') !== match[2])
    throw invalid();
  let width = 0,
    height = 0;
  try {
    if (
      match[1] === 'png' &&
      data
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      data.toString('ascii', 12, 16) === 'IHDR' &&
      data.readUInt32BE(8) === 13 &&
      data.subarray(-8, -4).toString() === 'IEND'
    ) {
      width = data.readUInt32BE(16);
      height = data.readUInt32BE(20);
    } else if (
      match[1] === 'jpeg' &&
      data.readUInt16BE(0) === 0xffd8 &&
      data.readUInt16BE(data.length - 2) === 0xffd9
    ) {
      for (let offset = 2; offset + 8 < data.length;) {
        if (data[offset++] !== 0xff) break;
        while (data[offset] === 0xff) offset++;
        const marker = data[offset++]!;
        if (marker === 0xda || marker === 0xd9) break;
        const size = data.readUInt16BE(offset);
        if (size < 2 || offset + size > data.length) break;
        if ([0xc0, 0xc1, 0xc2].includes(marker)) {
          height = data.readUInt16BE(offset + 3);
          width = data.readUInt16BE(offset + 5);
          break;
        }
        offset += size;
      }
    } else if (
      match[1] === 'webp' &&
      data.toString('ascii', 0, 4) === 'RIFF' &&
      data.toString('ascii', 8, 12) === 'WEBP' &&
      data.readUInt32LE(4) + 8 === data.length
    ) {
      const type = data.toString('ascii', 12, 16);
      if (type === 'VP8X' && data.length >= 30 && !(data[20]! & 2)) {
        width = 1 + data.readUIntLE(24, 3);
        height = 1 + data.readUIntLE(27, 3);
      } else if (
        type === 'VP8 ' &&
        data.subarray(23, 26).equals(Buffer.from([157, 1, 42]))
      ) {
        width = data.readUInt16LE(26) & 16383;
        height = data.readUInt16LE(28) & 16383;
      } else if (type === 'VP8L' && data[20] === 47) {
        const bits = data.readUInt32LE(21);
        width = (bits & 16383) + 1;
        height = ((bits >>> 14) & 16383) + 1;
      }
    }
  } catch {
    throw invalid();
  }
  if (!width || !height || width > 4096 || height > 4096) throw invalid();
  return input;
}
