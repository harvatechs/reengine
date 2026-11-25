import * as fs from 'node:fs';
import * as path from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ConfigSchema } from '../src/config/schema.js';

const schemasDir = path.resolve(process.cwd(), 'schemas');
fs.mkdirSync(schemasDir, { recursive: true });

const configJsonSchema = zodToJsonSchema(ConfigSchema, {
  name: 'ReEngineConfigV1',
  $refStrategy: 'none',
});

const outPath = path.join(schemasDir, 'config.v1.schema.json');
fs.writeFileSync(outPath, JSON.stringify(configJsonSchema, null, 2) + '\n', 'utf-8');
process.stdout.write(`Generated ${outPath}\n`);
