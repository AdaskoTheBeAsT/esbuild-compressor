import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

import type {
  BuildResult,
  OnEndResult,
  OutputFile,
  PluginBuild,
} from 'esbuild';
import sharp from 'sharp';

import { compressDirectory } from './directory-compressor';
import compressionPlugin from './esbuild-compressor'; // adjust the path if necessary

describe('compressionPlugin', () => {
  // We'll capture the onEnd callback here so that we can invoke it in our tests.
  let onEndCallback: (
    result: BuildResult,
  ) => OnEndResult | null | void | Promise<OnEndResult | null | void>;

  // A fake build object to pass into the plugin's setup.
  const fakeBuild: Partial<PluginBuild> = {
    onEnd(
      callback: (
        result: BuildResult,
      ) => OnEndResult | null | void | Promise<OnEndResult | null | void>,
    ): void {
      onEndCallback = callback;
    },
  };

  test('adds compressed output files for a compressible extension', async () => {
    // Create the plugin with default options.
    const plugin = compressionPlugin();
    plugin.setup(fakeBuild as PluginBuild);

    // Create a fake output file with a compressible extension (".js").
    const fakeOutputFile: OutputFile = {
      path: 'test.js',
      contents: Buffer.from('hello world'),
      hash: 'fake-hash',
      text: 'hello world',
    };

    // Simulate the result passed to onEnd.
    const result: BuildResult = {
      outputFiles: [fakeOutputFile],
      errors: [],
      warnings: [],
      metafile: {
        inputs: {},
        outputs: {},
      },
      mangleCache: {},
    };
    await onEndCallback(result);

    expect(result.outputFiles).toHaveLength(3);
    const gzipFile = result.outputFiles[1];
    const brotliFile = result.outputFiles[2];
    expect(gzipFile.path).toBe('test.js.gz');
    expect(brotliFile.path).toBe('test.js.br');
    expect(gunzipSync(gzipFile.contents).toString()).toBe('hello world');
    expect(brotliDecompressSync(brotliFile.contents).toString()).toBe(
      'hello world',
    );
  });

  test('skips files matching the skipFilesPattern', async () => {
    // Configure the plugin to skip files matching "skip-me.js".
    const plugin = compressionPlugin({ skipFilesPattern: 'skip-me\\.js$' });
    plugin.setup(fakeBuild as PluginBuild);

    // Create a fake output file that should be skipped.
    const fakeOutputFile: OutputFile = {
      path: 'skip-me.js',
      contents: Buffer.from('should be skipped'),
      hash: 'fake-hash',
      text: 'should be skipped',
    };

    const result: BuildResult = {
      outputFiles: [fakeOutputFile],
      errors: [],
      warnings: [],
      metafile: {
        inputs: {},
        outputs: {},
      },
      mangleCache: {},
    };
    await onEndCallback(result);

    expect(result.outputFiles).toHaveLength(1);
  });

  test('does not compress files with a non-compressible extension', async () => {
    const plugin = compressionPlugin();
    plugin.setup(fakeBuild as PluginBuild);

    // Use a file with an extension that is not in the compressible list (".png").
    const fakeOutputFile: OutputFile = {
      path: 'image.png',
      contents: Buffer.from('image data'),
      hash: 'fake-hash',
      text: 'should be skipped',
    };

    const result: BuildResult = {
      outputFiles: [fakeOutputFile],
      errors: [],
      warnings: [],
      metafile: {
        inputs: {},
        outputs: {},
      },
      mangleCache: {},
    };
    await onEndCallback(result);

    expect(result.outputFiles).toHaveLength(1);
  });

  test('does nothing if outputFiles is undefined', async () => {
    const plugin = compressionPlugin();
    plugin.setup(fakeBuild as PluginBuild);

    // Simulate a build result with no outputFiles.
    const result: BuildResult = {} as BuildResult;
    await onEndCallback(result);

    expect(result.outputFiles).toBeUndefined();
  });

  test('accepts custom Brotli parameters', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const plugin = compressionPlugin({
      brotliOptions: {
        params: {
          BROTLI_PARAM_QUALITY: 4,
          '1': 4,
          UNKNOWN_PARAMETER: 1,
        },
      },
    });
    plugin.setup(fakeBuild as PluginBuild);

    const result: BuildResult = {
      outputFiles: [
        {
          path: 'custom.js',
          contents: Buffer.from('custom options'),
          hash: 'fake-hash',
          text: 'custom options',
        },
      ],
      errors: [],
      warnings: [],
      metafile: { inputs: {}, outputs: {} },
      mangleCache: {},
    };
    await onEndCallback(result);

    expect(result.outputFiles).toHaveLength(3);
    expect(warnSpy).toHaveBeenCalledWith(
      'Unknown Brotli parameter key: UNKNOWN_PARAMETER',
    );
    warnSpy.mockRestore();
  });
});

describe('compressDirectory', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'esbuild-compressor-'));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  test('compresses final assets and creates configured image formats', async () => {
    await Promise.all([
      fs.writeFile(path.join(directory, 'main.js'), 'console.log("main");'),
      fs.writeFile(path.join(directory, 'styles.css'), 'body { color: red; }'),
      fs.writeFile(path.join(directory, 'env-config.js'), 'window.env = {};'),
      sharp({
        create: {
          width: 1,
          height: 1,
          channels: 3,
          background: '#ff0000',
        },
      })
        .png()
        .toFile(path.join(directory, 'logo.png')),
    ]);

    const result = await compressDirectory({
      directory,
      extensions: ['.js', '.css'],
      skipFilesPattern: 'env-config.*\\.js$',
      imageFormats: {
        avif: { quality: 50 },
        webp: { quality: 75 },
      },
    });

    expect(result.compressedFiles).toHaveLength(4);
    expect(result.imageFiles).toHaveLength(2);
    await expect(
      fs.access(path.join(directory, 'main.js.gz')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(directory, 'styles.css.br')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(directory, 'env-config.js.gz')),
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(directory, 'logo.avif')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(directory, 'logo.webp')),
    ).resolves.toBeUndefined();
  });

  test('uses defaults recursively and accepts custom compression options', async () => {
    const nestedDirectory = path.join(directory, 'nested');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    await fs.mkdir(nestedDirectory);
    await fs.writeFile(
      path.join(nestedDirectory, 'routes.json'),
      '{"routes":[]}',
    );

    const result = await compressDirectory({
      directory,
      gzipOptions: { level: 6 },
      brotliOptions: {
        params: {
          BROTLI_PARAM_QUALITY: 4,
          '1': 4,
          UNKNOWN_PARAMETER: 1,
        },
      },
    });

    expect(result.compressedFiles).toEqual([
      path.join(nestedDirectory, 'routes.json.gz'),
      path.join(nestedDirectory, 'routes.json.br'),
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      'Unknown Brotli parameter key: UNKNOWN_PARAMETER',
    );
    warnSpy.mockRestore();
  });

  test.each([
    ['avif', 'webp'],
    ['webp', 'avif'],
  ] as const)('can create only a %s image', async (format, missingFormat) => {
    await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: '#00ff00',
      },
    })
      .png()
      .toFile(path.join(directory, 'icon.png'));

    await compressDirectory({
      directory,
      imageFormats:
        format === 'avif'
          ? { avif: { quality: 50 } }
          : { webp: { quality: 75 } },
    });

    await expect(
      fs.access(path.join(directory, `icon.${format}`)),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(directory, `icon.${missingFormat}`)),
    ).rejects.toThrow();
  });
});
