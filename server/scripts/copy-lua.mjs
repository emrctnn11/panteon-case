// tsc doesn't copy non-TS assets into dist/. The redis/client.ts loader reads
// .lua files relative to its own compiled location, so they must land next to
// it in dist/core/scripts/ after every build.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(serverRoot, 'src', 'core', 'scripts');
const dest = join(serverRoot, 'dist', 'core', 'scripts');

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true, filter: (path) => !path.endsWith('.ts') });
