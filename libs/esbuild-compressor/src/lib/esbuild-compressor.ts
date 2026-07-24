// compress-plugin.ts

import * as fs2 from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import * as zlib from 'zlib';

import type { Plugin } from 'esbuild';

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

type CompressionPluginOptions = {
  extensions?: string[];
  gzipOptions?: zlib.ZlibOptions;
  brotliOptions?: Record<string, number> & {
    params?: Record<string, number>;
  };
  skipFilesPattern?: string;
  outputDir?: string;
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

  const outdir = path.join(process.cwd(), options?.outputDir || '');

  return {
    name: 'compress-plugin',
    setup(build) {
      build.onEnd(async (result) => {
        if (!result.outputFiles) {
          return;
        }

        if (!fs2.existsSync(outdir)) {
          fs2.mkdirSync(outdir, { recursive: true });
        }

        console.log('outdir: ', outdir);

        await Promise.all(
          result.outputFiles.map(async (outputFile) => {
            let originalPath = outputFile.path;
            if (!path.isAbsolute(originalPath) && outdir) {
              // If the output file path is relative, join it with the outdir.
              // Assuming outdir is relative to process.cwd()
              originalPath = path.join(outdir, outputFile.path);
            } else {
              originalPath = path.join(outdir, path.basename(outputFile.path));
            }
            const extension = originalPath.slice(originalPath.lastIndexOf('.'));

            // If the file path matches the skip pattern, do nothing.
            if (skipFilesRegExp?.test(originalPath)) {
              console.log(`Skipping file: ${originalPath}`);
              return;
            }

            if (compressibleExtensions.includes(extension)) {
              const contents = outputFile.contents;
              const gzipped = await gzip(contents, gzipOptions);
              const brotli = await brotliCompress(contents, brotliOptions);

              await Promise.all([
                fs.writeFile(`${originalPath}.gz`, gzipped),
                fs.writeFile(`${originalPath}.br`, brotli),
              ]);
            }
          }),
        );
      });
    },
  };
}
