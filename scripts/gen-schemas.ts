import * as fs from 'node:fs';
import * as path from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ConfigSchema } from '../src/config/schema.js';
import { ThemeSchema } from '../src/ui/theme/schema.js';

const schemasDir = path.resolve(process.cwd(), 'schemas');
fs.mkdirSync(schemasDir, { recursive: true });

const configJsonSchema = zodToJsonSchema(ConfigSchema, {
  name: 'ReEngineConfigV1',
  $refStrategy: 'none',
});
const themeJsonSchema = zodToJsonSchema(ThemeSchema, {
  name: 'ReEngineThemeV1',
  $refStrategy: 'none',
});

fs.writeFileSync(
  path.join(schemasDir, 'config.v1.schema.json'),
  JSON.stringify(configJsonSchema, null, 2) + '\n',
  'utf-8',
);
fs.writeFileSync(
  path.join(schemasDir, 'theme.v1.schema.json'),
  JSON.stringify(themeJsonSchema, null, 2) + '\n',
  'utf-8',
);
process.stdout.write(`Generated schemas in ${schemasDir}\n`);
