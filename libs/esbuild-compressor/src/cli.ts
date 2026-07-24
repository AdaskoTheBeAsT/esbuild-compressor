#!/usr/bin/env node

import * as path from 'node:path';

import { compressDirectory } from './lib/directory-compressor';
import type { DirectoryCompressionOptions } from './lib/directory-compressor';

function getConfigPath(args: string[]): string | undefined {
  const configIndex = args.indexOf('--config');
  return configIndex === -1 ? undefined : args[configIndex + 1];
}

async function main(): Promise<void> {
  const configPath = getConfigPath(process.argv.slice(2));
  if (!configPath) {
    throw new Error('Usage: esbuild-compressor --config <path-to-config.cjs>');
  }

  const absoluteConfigPath = path.resolve(configPath);
  const loadedConfig = require(absoluteConfigPath);
  const options = (loadedConfig.default ??
    loadedConfig) as DirectoryCompressionOptions;
  const result = await compressDirectory(options);

  console.log(
    `Generated ${result.compressedFiles.length} compressed and ${result.imageFiles.length} image files.`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
