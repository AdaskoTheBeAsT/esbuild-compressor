# esbuild-compressor

An esbuild plugin that creates pre-compressed `.gz` and `.br` versions of build
outputs. It is maintained as an Nx library and published as
`@adaskothebeast/esbuild-compressor`.

## ✨ What it does

After esbuild finishes a build, the plugin examines its output files and writes
Gzip and Brotli variants for supported asset types:

`js`, `mjs`, `cjs`, `css`, `html`, `svg`, `txt`, and `json`.

Compression uses Node's `zlib` implementation. By default it uses best Gzip
compression and maximum-quality text-mode Brotli compression.

## 🧰 Development setup

This repository uses Yarn 4.17.1 and Nx. Enable Corepack, install dependencies,
then use Nx to run project tasks.

```bash
corepack enable
yarn install
```

## 🚀 Common commands

Run these commands from the repository root.

| Task | Command |
| --- | --- |
| Build the library | `yarn nx build esbuild-compressor` |
| Run unit tests | `yarn nx test esbuild-compressor` |
| Lint the library | `yarn nx lint esbuild-compressor` |
| Format files | `yarn prettier --write .` |

## 🗂️ Project layout

```text
libs/esbuild-compressor/
├── src/
│   ├── index.ts                     # Library entry point
│   └── lib/
│       ├── esbuild-compressor.ts    # Plugin implementation
│       └── esbuild-compressor.spec.ts
├── jest.config.ts
├── project.json                     # Nx build target
└── tsconfig.*.json
```

## ⚙️ Plugin configuration

The plugin accepts an optional configuration object:

| Option | Purpose |
| --- | --- |
| `extensions` | File extensions eligible for compression. |
| `gzipOptions` | Node `zlib` options for Gzip output. |
| `brotliOptions` | Brotli options, including `params`. |
| `skipFilesPattern` | Regular-expression pattern for files to leave uncompressed. |
| `outputDir` | Directory in which generated compressed files are written. |

### Option details

#### `extensions`

An array of filename extensions that are eligible for compression. The extension
is taken from the generated output filename, including its leading dot. The
default list is `.js`, `.mjs`, `.cjs`, `.css`, `.html`, `.svg`, `.txt`, and
`.json`.

Use this option to narrow compression to the assets that your deployment serves
with `Content-Encoding` support:

```json
{
  "extensions": [".js", ".css", ".html"]
}
```

#### `gzipOptions`

Options forwarded to Node's `zlib.gzip` function. This accepts the same values
as [`zlib.ZlibOptions`](https://nodejs.org/api/zlib.html#class-options), such as
`level`, `strategy`, or `chunkSize`. If omitted, the plugin uses Node's
best-compression level (`zlib.constants.Z_BEST_COMPRESSION`).

```json
{
  "gzipOptions": {
    "level": 9
  }
}
```

#### `brotliOptions`

Options for Node's Brotli compressor. Configure Brotli parameters under
`params`; keys can use the symbolic Node constant names shown below, or their
numeric constant values. The plugin maps `BROTLI_PARAM_QUALITY` and
`BROTLI_PARAM_MODE` to their Node `zlib.constants` equivalents. At present,
only the nested `params` object is read; other `brotliOptions` properties are
not applied.

```json
{
  "brotliOptions": {
    "params": {
      "BROTLI_PARAM_QUALITY": 11,
      "BROTLI_PARAM_MODE": 1
    }
  }
}
```

When omitted, the plugin uses maximum Brotli quality and text mode. Confirm
compression-time and output-size trade-offs for your application before using
the maximum quality level in every build.

#### `outputDir`

The directory in which `.gz` and `.br` assets are written. It is resolved from
the process working directory and created when it does not exist. In an Nx
build, align it with the target's `outputPath`:

```json
{
  "outputPath": "dist/apps/ui",
  "plugins": [
    {
      "options": {
        "outputDir": "dist/apps/ui"
      }
    }
  ]
}
```

For absolute esbuild output paths, the plugin writes compressed files directly
to `outputDir` using each output filename. Choose a dedicated output directory
when assets with the same filename could otherwise collide.

### Skipping files with `skipFilesPattern`

`skipFilesPattern` is a JavaScript regular-expression string that is tested
against each output file's resolved path. If it matches, the plugin leaves that
file unchanged and does not create its `.gz` or `.br` variants. Use it for
assets that must remain readable at runtime, are already compressed, or are
served with special handling.

In `project.json`, escape regular-expression backslashes because the value is a
JSON string. For example, this pattern skips the Angular `env-config` bundle
and any hashed variant of it:

```json
{
  "skipFilesPattern": "env-config.*\\.js$"
}
```

The equivalent regular expression is `env-config.*\.js$`: it matches paths
ending in `env-config.js` and names such as `env-config.abc123.js`. The `$`
anchor prevents similarly named files with another extension from matching.

## 🅰️ Nx Angular esbuild example

For an Angular application built with `@nx/angular:browser-esbuild`, register the
plugin in the build target's `options.plugins` array. This example is based on
the `apps/ui/project.json` configuration in the Angular esbuild sample:

```json
{
  "targets": {
    "build": {
      "executor": "@nx/angular:browser-esbuild",
      "options": {
        "plugins": [
          {
            "path": "node_modules/@adaskothebeast/esbuild-compressor/src/lib/esbuild-compressor.js",
            "options": {
              "extensions": [".js", ".css", ".html"],
              "skipFilesPattern": "env-config.*\\.js$",
              "gzipOptions": {
                "level": 9
              },
              "brotliOptions": {
                "params": {
                  "BROTLI_PARAM_QUALITY": 11
                }
              },
              "outputDir": "dist/apps/ui"
            }
          }
        ],
        "outputPath": "dist/apps/ui"
      }
    }
  }
}
```

Set `outputDir` to the same directory as the application's `outputPath` so the
compressed files are written alongside the generated assets. The sample skips
the injected `env-config` bundle, while compressing JavaScript, CSS, and HTML.

When changing the plugin, add or update coverage in
`src/lib/esbuild-compressor.spec.ts` and run the build, lint, and test commands
before opening a pull request.

## ✅ Contribution expectations

- Keep changes focused and covered by tests where behavior changes.
- Run Prettier before committing; import ordering is handled by the configured
  Prettier plugin.
- Do not commit generated build output, coverage reports, or compressed test
  artifacts.

## 📄 License

MIT. See [LICENSE](LICENSE).
