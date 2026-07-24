// compress-plugin.test.ts
import { promises as fs } from 'fs';

import type {
  BuildResult,
  OnEndResult,
  OutputFile,
  PluginBuild,
} from 'esbuild';

import compressionPlugin from './esbuild-compressor'; // adjust the path if necessary

describe('compressionPlugin', () => {
  // Spy on fs.writeFile so we can verify its calls without writing to disk.
  let writeFileSpy: jest.SpyInstance;

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

  beforeEach(() => {
    writeFileSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue();
  });

  afterEach(() => {
    writeFileSpy.mockRestore();
  });

  test('compresses file with a compressible extension', async () => {
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

    // We expect two calls: one for the .gz file and one for the .br file.
    expect(writeFileSpy).toHaveBeenCalledTimes(2);
    expect(writeFileSpy).toHaveBeenCalledWith('test.js.gz', expect.any(Buffer));
    expect(writeFileSpy).toHaveBeenCalledWith('test.js.br', expect.any(Buffer));
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

    // No file should be written since the file matches the skip pattern.
    expect(writeFileSpy).not.toHaveBeenCalled();
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

    // Expect that no files were written because ".png" is not compressible.
    expect(writeFileSpy).not.toHaveBeenCalled();
  });

  test('does nothing if outputFiles is undefined', async () => {
    const plugin = compressionPlugin();
    plugin.setup(fakeBuild as PluginBuild);

    // Simulate a build result with no outputFiles.
    const result: BuildResult = {} as BuildResult;
    await onEndCallback(result);

    expect(writeFileSpy).not.toHaveBeenCalled();
  });
});
