# esbuild-compressor

Tools for creating pre-compressed `.gz` and `.br` assets from esbuild output or
from a completed build directory. It is maintained as an Nx library and
published as `@adaskothebeast/esbuild-compressor`.

## ✨ What it does

The package provides two complementary modes:

- An esbuild plugin that adds Gzip and Brotli variants to in-memory output
  files, for pipelines that pass every desired asset through esbuild.
- A post-build CLI that scans the final output directory. Use this with Angular
  application builds to compress JavaScript, CSS, HTML, JSON, and SVG files,
  and to create AVIF/WebP versions of PNG and JPEG images.

`js`, `mjs`, `cjs`, `css`, `html`, `svg`, `txt`, and `json`.

Compression uses Node's `zlib` implementation. By default it uses best Gzip
compression and maximum-quality text-mode Brotli compression.

## 🧰 Development setup

This repository uses Yarn 4.17.1 and Nx. Install dependencies, then use Nx to
run project tasks.

```bash
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

### Skipping files with `skipFilesPattern`

`skipFilesPattern` is a JavaScript regular-expression string that is tested
against each output file path. If it matches, the plugin leaves that file
unchanged and does not create its `.gz` or `.br` variants. Use it for assets
that must remain readable at runtime, are already compressed, or are served
with special handling.

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

## Esbuild plugin example

For a pipeline in which esbuild produces all the assets that need compression,
register the plugin in the build target's `options.plugins` array:

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
              }
            }
          }
        ],
        "outputPath": "dist/apps/ui"
      }
    }
  }
}
```

## Nx Angular application integration

Angular's `@nx/angular:application` builder produces JavaScript, global CSS,
and `index.html` in separate stages. Configure the post-build CLI so it sees the
completed browser directory and creates every derived asset.

Install version 2 or later:

```bash
yarn add --dev @adaskothebeast/esbuild-compressor@^2.0.0
```

Create `tools/ui-compression.config.cjs`:

```js
/** @type {import('@adaskothebeast/esbuild-compressor').DirectoryCompressionOptions} */
module.exports = {
  directory: 'dist/apps/ui/browser',
  extensions: ['.js', '.css', '.html', '.json', '.svg'],
  skipFilesPattern: 'env-config.*\\.js$',
  gzipOptions: { level: 9 },
  brotliOptions: {
    params: { BROTLI_PARAM_QUALITY: 11 },
  },
  imageExtensions: ['.png', '.jpg', '.jpeg'],
  imageFormats: {
    avif: { quality: 50 },
    webp: { quality: 75 },
  },
};
```

Choose one of the following integration patterns. Both run the compressor after
Angular has written the complete browser output; the difference is only the
command developers and CI invoke.

### Option A: explicit compression target

Add a target in the application's `project.json`:

```json
{
  "targets": {
    "compress": {
      "executor": "nx:run-commands",
      "dependsOn": ["build"],
      "options": {
        "command": "esbuild-compressor --config tools/ui-compression.config.cjs"
      }
    }
  }
}
```

Run `nx run ui:compress` to build and then generate the compressed artifacts.
The command writes `main.js.gz`, `main.js.br`, `styles.css.gz`,
`styles.css.br`, `index.html.gz`, and similar outputs alongside their source
assets. A `logo.png` input produces `logo.avif` and `logo.webp`. The skip
pattern applies to both compression and image conversion, so the example leaves
the injected `env-config` file untouched.

### Option B: keep `nx build` as the only command

If the deployment workflow must remain `nx build ui`, rename the current Angular
`build` target to `application-build`, then create a wrapper `build` target:

```json
{
  "targets": {
    "application-build": {
      "executor": "@nx/angular:application",
      "options": {
        "browser": "apps/ui/src/main.ts",
        "outputPath": "dist/apps/ui",
        "tsConfig": "apps/ui/tsconfig.app.json"
      }
    },
    "build": {
      "executor": "nx:run-commands",
      "options": {
        "commands": [
          "nx run ui:application-build",
          "esbuild-compressor --config tools/ui-compression.config.cjs"
        ]
      }
    }
  }
}
```

Keep all existing Angular build options and configurations on
`application-build`; the shortened example shows only the relevant fields. If a
`serve` target uses `buildTarget`, point it to `ui:application-build` so the dev
server continues to invoke the native Angular builder.

Remove the esbuild `plugins` entry from the Angular `application` target when
using either option. The directory compressor handles the final output
comprehensively, while the esbuild plugin only sees the JavaScript bundle stage.

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
