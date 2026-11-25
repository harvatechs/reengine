import * as fs from 'node:fs';
import * as path from 'node:path';

const schemasDir = path.resolve(process.cwd(), 'schemas');
fs.mkdirSync(schemasDir, { recursive: true });
process.stdout.write(`Schemas directory ready: ${schemasDir}\n`);
