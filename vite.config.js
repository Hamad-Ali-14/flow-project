import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Dev-only helper. Vite does NOT read `.env.example`; it only loads .env, .env.local and the
// .env.[mode] variants. If Supabase settings were put in .env.example and no real env file exists,
// the app would silently look "not connected". This prints a clear warning at startup.
// It prints variable NAMES only, never values.
function envFileHint() {
  return {
    name: 'flow-env-file-hint',
    configResolved(config) {
      if (config.command !== 'serve') return;
      const dir = config.envDir || config.root;
      const has = file => fs.existsSync(path.join(dir, file));
      if (['.env', '.env.local', '.env.development', '.env.development.local'].some(has)) return;
      if (!has('.env.example')) return;
      const text = fs.readFileSync(path.join(dir, '.env.example'), 'utf8');
      const filled = /^\s*VITE_SUPABASE_\w+\s*=\s*(?!https:\/\/YOUR-PROJECT|YOUR-)\S+/m.test(text);
      if (filled) {
        config.logger.warn(
          '\n  [flow] Supabase settings were found in .env.example, but Vite does not read that file.\n' +
          '  Copy the VITE_SUPABASE_* lines into .env.local (project root) and restart `npm run dev`.\n',
        );
      }
    },
  };
}

export default defineConfig({ plugins: [envFileHint()] });
