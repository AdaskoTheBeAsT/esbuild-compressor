import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import * as zlib from 'node:zlib';

import type { OutputFile, Plugin } from 'esbuild';

import type { ZstdCompressionOptions } from './zstd-compressor';
import { compressZstd, resolveZstdOptions } from './zstd-compressor';

const gzip = promisify(zlib.gzip);
const brotliCompress = promisify(zlib.brotliCompress);

const defaultGzipOptions: zlib.ZlibOptions = {
  level: zlib.constants.Z_BEST_COMPRESSION,
};

const defaultBrotliOptions: zlib.BrotliOptions = {
  params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
    [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
  },
};

// File extensions to compress
const defaultCompressibleExtensions: string[] = [
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.svg',
  '.txt',
  '.json',
];

export type CompressionPluginOptions = {
  extensions?: string[];
  gzip?: boolean;
  gzipOptions?: zlib.ZlibOptions;
  brotli?: boolean;
  brotliOptions?: {
    params?: Record<string, number>;
  };
  zstd?: boolean;
  zstdOptions?: ZstdCompressionOptions;
  skipFilesPattern?: string;
};

function normalizeBrotliParams(
  params: Record<string, number>,
): Record<number, number> {
  const keyMap: { [key: string]: number } = {
    BROTLI_PARAM_QUALITY: zlib.constants.BROTLI_PARAM_QUALITY,
    BROTLI_PARAM_MODE: zlib.constants.BROTLI_PARAM_MODE,
    // Add any other Brotli parameters if needed.
  };

  const normalized: Record<number, number> = {};
  for (const key in params) {
    if (keyMap[key] !== undefined) {
      normalized[keyMap[key]] = params[key];
    } else {
      // If the key isn't recognized, try converting it to a number (or warn)
      const numKey = Number(key);
      if (!isNaN(numKey)) {
        normalized[numKey] = params[key];
      } else {
        console.warn(`Unknown Brotli parameter key: ${key}`);
      }
    }
  }
  return normalized;
}

function createCompressedOutputFile(
  path: string,
  contents: Uint8Array,
): OutputFile {
  return {
    path,
    contents,
    hash: createHash('sha256').update(contents).digest('hex'),
    get text() {
      return Buffer.from(contents).toString('utf8');
    },
  };
}

export default function compressionPlugin(
  options?: CompressionPluginOptions,
): Plugin {
  const compressibleExtensions =
    options?.extensions || defaultCompressibleExtensions;
  const gzipOptions = options?.gzipOptions || defaultGzipOptions;
  let brotliOptions: zlib.BrotliOptions = defaultBrotliOptions;
  if (options?.brotliOptions) {
    if (options.brotliOptions.params) {
      brotliOptions = {
        params: normalizeBrotliParams(options.brotliOptions.params),
      };
    }
  }
  const skipFilesRegExp = options?.skipFilesPattern
    ? new RegExp(options.skipFilesPattern)
    : undefined;
  const gzipEnabled = options?.gzip ?? true;
  const brotliEnabled = options?.brotli ?? true;
  const zstdOptions = resolveZstdOptions(options?.zstd, options?.zstdOptions);

  return {
    name: 'compress-plugin',
    setup(build) {
      build.onEnd(async (result) => {
        if (!result.outputFiles) {
          return;
        }

        const filesToCompress = [...result.outputFiles];
        const compressedFiles = await Promise.all(
          filesToCompress.map(async (outputFile) => {
            const extension = outputFile.path.slice(
              outputFile.path.lastIndexOf('.'),
            );

            if (
              skipFilesRegExp?.test(outputFile.path) ||
              !compressibleExtensions.includes(extension)
            ) {
              return [];
            }

            const [gzipped, brotli, zstd] = await Promise.all([
              gzipEnabled ? gzip(outputFile.contents, gzipOptions) : undefined,
              brotliEnabled
                ? brotliCompress(outputFile.contents, brotliOptions)
                : undefined,
              zstdOptions
                ? compressZstd(outputFile.contents, zstdOptions)
                : undefined,
            ]);

            const compressed: OutputFile[] = [];

            if (gzipped) {
              compressed.push(
                createCompressedOutputFile(`${outputFile.path}.gz`, gzipped),
              );
            }

            if (brotli) {
              compressed.push(
                createCompressedOutputFile(`${outputFile.path}.br`, brotli),
              );
            }

            if (zstd) {
              compressed.push(
                createCompressedOutputFile(`${outputFile.path}.zst`, zstd),
              );
            }

            return compressed;
          }),
        );

        result.outputFiles.push(...compressedFiles.flat());
      });
    },
  };
}
