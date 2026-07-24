import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import * as zlib from 'node:zlib';

import type { AvifOptions, WebpOptions } from 'sharp';
import sharp from 'sharp';

import type { CompressionPluginOptions } from './esbuild-compressor';

const gzip = promisify(zlib.gzip);
const brotliCompress = promisify(zlib.brotliCompress);

const defaultCompressibleExtensions = [
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.svg',
  '.txt',
  '.json',
];

const defaultImageExtensions = ['.png', '.jpg', '.jpeg'];

type ImageFormatOptions = {
  avif?: AvifOptions;
  webp?: WebpOptions;
};

export type DirectoryCompressionOptions = CompressionPluginOptions & {
  directory: string;
  imageExtensions?: string[];
  imageFormats?: ImageFormatOptions;
};

export type DirectoryCompressionResult = {
  compressedFiles: string[];
  imageFiles: string[];
};

function normalizeBrotliParams(
  params: Record<string, number>,
): Record<number, number> {
  const keyMap: Record<string, number> = {
    BROTLI_PARAM_QUALITY: zlib.constants.BROTLI_PARAM_QUALITY,
    BROTLI_PARAM_MODE: zlib.constants.BROTLI_PARAM_MODE,
  };

  const normalized: Record<number, number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (keyMap[key] !== undefined) {
      normalized[keyMap[key]] = value;
      continue;
    }

    const numericKey = Number(key);
    if (!Number.isNaN(numericKey)) {
      normalized[numericKey] = value;
    } else {
      console.warn(`Unknown Brotli parameter key: ${key}`);
    }
  }

  return normalized;
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

export async function compressDirectory(
  options: DirectoryCompressionOptions,
): Promise<DirectoryCompressionResult> {
  const directory = path.resolve(options.directory);
  const compressibleExtensions = new Set(
    (options.extensions ?? defaultCompressibleExtensions).map((extension) =>
      extension.toLowerCase(),
    ),
  );
  const imageExtensions = new Set(
    (options.imageExtensions ?? defaultImageExtensions).map((extension) =>
      extension.toLowerCase(),
    ),
  );
  const skipFilesRegExp = options.skipFilesPattern
    ? new RegExp(options.skipFilesPattern)
    : undefined;
  const gzipOptions = options.gzipOptions ?? {
    level: zlib.constants.Z_BEST_COMPRESSION,
  };
  const brotliOptions: zlib.BrotliOptions = options.brotliOptions?.params
    ? { params: normalizeBrotliParams(options.brotliOptions.params) }
    : {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]:
            zlib.constants.BROTLI_MAX_QUALITY,
          [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
        },
      };
  const result: DirectoryCompressionResult = {
    compressedFiles: [],
    imageFiles: [],
  };

  for (const filePath of await listFiles(directory)) {
    const relativePath = path
      .relative(directory, filePath)
      .split(path.sep)
      .join('/');
    if (skipFilesRegExp?.test(relativePath)) {
      continue;
    }

    const extension = path.extname(filePath).toLowerCase();
    if (compressibleExtensions.has(extension)) {
      const contents = await fs.readFile(filePath);
      const [gzipped, brotli] = await Promise.all([
        gzip(contents, gzipOptions),
        brotliCompress(contents, brotliOptions),
      ]);
      const gzipPath = `${filePath}.gz`;
      const brotliPath = `${filePath}.br`;
      await Promise.all([
        fs.writeFile(gzipPath, gzipped),
        fs.writeFile(brotliPath, brotli),
      ]);
      result.compressedFiles.push(gzipPath, brotliPath);
    }

    if (!imageExtensions.has(extension) || !options.imageFormats) {
      continue;
    }

    const imageBasePath = path.join(
      path.dirname(filePath),
      path.basename(filePath, extension),
    );
    if (options.imageFormats.avif) {
      const outputPath = `${imageBasePath}.avif`;
      await sharp(filePath).avif(options.imageFormats.avif).toFile(outputPath);
      result.imageFiles.push(outputPath);
    }
    if (options.imageFormats.webp) {
      const outputPath = `${imageBasePath}.webp`;
      await sharp(filePath).webp(options.imageFormats.webp).toFile(outputPath);
      result.imageFiles.push(outputPath);
    }
  }

  return result;
}
