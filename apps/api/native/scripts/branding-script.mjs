// Writes the in-page branding script as the API's production build serves it:
// tsc compiles the TS sources like `pnpm build`, then the compiled
// getBrandingScript() bundles them.
import { rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const native = join(dirname(fileURLToPath(import.meta.url)), '..')
const api = join(native, '..')
const require = createRequire(join(api, 'package.json'))
const ts = require('typescript')

const config = ts.getParsedCommandLineOfConfigFile(join(api, 'tsconfig.json'), {}, ts.sys)
if (!config) throw new Error('could not read apps/api/tsconfig.json')

// Inside node_modules so the compiled script resolves esbuild from apps/api.
const outDir = join(api, 'node_modules/.cache/branding-script')
const engine = 'scraper/scrapeURL/engines/fire-engine'
rmSync(outDir, { recursive: true, force: true })
try {
  const program = ts.createProgram(
    [join(api, 'src', engine, 'brandingScript.ts'), join(api, 'src', engine, 'branding-script/index.ts')],
    { ...config.options, outDir },
  )
  const { emitSkipped } = program.emit()
  if (emitSkipped) throw new Error('tsc emitted nothing')
  const { getBrandingScript } = require(join(outDir, engine, 'brandingScript.js'))
  writeFileSync(join(native, 'src/scrape_url/engines/fire_engine/branding/script.js'), getBrandingScript())
} finally {
  rmSync(outDir, { recursive: true, force: true })
}
