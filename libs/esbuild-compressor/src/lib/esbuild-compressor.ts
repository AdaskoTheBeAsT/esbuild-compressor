import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import * as zlib from 'node:zlib';

import type { OutputFile, Plugin } from 'esbuild';

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
  gzipOptions?: zlib.ZlibOptions;
  brotliOptions?: {
    params?: Record<string, number>;
  };
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

            const [gzipped, brotli] = await Promise.all([
              gzip(outputFile.contents, gzipOptions),
              brotliCompress(outputFile.contents, brotliOptions),
            ]);

            return [
              createCompressedOutputFile(`${outputFile.path}.gz`, gzipped),
              createCompressedOutputFile(`${outputFile.path}.br`, brotli),
            ];
          }),
        );

        result.outputFiles.push(...compressedFiles.flat());
      });
    },
  };
}
