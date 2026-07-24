import { brotliDecompressSync, gunzipSync } from 'node:zlib';

import type {
  BuildResult,
  OnEndResult,
  OutputFile,
  PluginBuild,
} from 'esbuild';

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
});
