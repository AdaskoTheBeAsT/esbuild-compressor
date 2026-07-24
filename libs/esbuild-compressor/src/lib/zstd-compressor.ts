import { promisify } from 'node:util';
import * as zlib from 'node:zlib';

export type ZstdCompressionOptions = {
  params?: Record<string, number>;
};

export const defaultZstdCompressionLevel = 19;

const zstdCompressAsync =
  typeof zlib.zstdCompress === 'function'
    ? promisify(zlib.zstdCompress)
    : undefined;

const zstdParameterKeys = new Map<string, number>(
  Object.entries(zlib.constants)
    .filter(
      (entry): entry is [string, number] =>
        entry[0].startsWith('ZSTD_c_') && typeof entry[1] === 'number',
    )
    .map(([key, value]) => [key, value]),
);

export function isZstdSupported(): boolean {
  return zstdCompressAsync !== undefined;
}

export function normalizeZstdParams(
  params: Record<string, number>,
): Record<number, number> {
  const normalized: Record<number, number> = {};

  for (const [key, value] of Object.entries(params)) {
    const mappedKey = zstdParameterKeys.get(key);
    if (mappedKey !== undefined) {
      normalized[mappedKey] = value;
      continue;
    }

    const numericKey = Number(key);
    if (!Number.isNaN(numericKey)) {
      normalized[numericKey] = value;
    } else {
      console.warn(`Unknown Zstd parameter key: ${key}`);
    }
  }

  return normalized;
}

export function resolveZstdOptions(
  enabled: boolean | undefined,
  options: ZstdCompressionOptions | undefined,
): zlib.ZstdOptions | undefined {
  if (enabled === false || (enabled === undefined && options === undefined)) {
    return undefined;
  }

  if (!isZstdSupported()) {
    console.warn(
      'Zstandard compression requires a Node.js runtime with zlib.zstdCompress; skipping .zst output.',
    );
    return undefined;
  }

  return {
    params: options?.params
      ? normalizeZstdParams(options.params)
      : {
          [zlib.constants.ZSTD_c_compressionLevel]: defaultZstdCompressionLevel,
        },
  };
}

export async function compressZstd(
  contents: Uint8Array,
  options: zlib.ZstdOptions,
): Promise<Buffer> {
  if (!zstdCompressAsync) {
    throw new Error(
      'Zstandard compression is not available in this Node.js runtime.',
    );
  }

  return zstdCompressAsync(contents, options);
}
