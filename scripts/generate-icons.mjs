import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '../public/icons');
const outputFile = join(__dirname, '../app/components/icons-map.ts');

const files = readdirSync(iconsDir)
  .filter(f => f.endsWith('.svg'))
  .sort();

const entries = files.map(file => {
  const name = basename(file, '.svg');
  const content = readFileSync(join(iconsDir, file), 'utf8')
    .replace(/\s+/g, ' ')   // collapse whitespace
    .replace(/> </g, '><')  // remove gaps between tags
    .trim();
  return `  '${name}': \`${content}\``;
});

const output = `// AUTO-GENERATED — do not edit manually.
// Add/edit SVGs in public/icons/ then run: npm run generate-icons
export const icons: Record<string, string> = {
${entries.join(',\n')},
};
`;

writeFileSync(outputFile, output);
console.log(`Generated icons-map.ts with ${files.length} icons.`);
