import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { browserDataDocuments } from '../src/browser-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, 'data', name));
const catalogBytes = read('public-catalog.json'), sourcesBytes = read('public-sources.json');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const documents = browserDataDocuments(JSON.parse(catalogBytes), JSON.parse(sourcesBytes), {
  catalogSha256: sha256(catalogBytes), sourcesSha256: sha256(sourcesBytes)
});
for (const [relative, document] of documents) {
  const target = path.join(root, 'dist', relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(document) + '\n');
}
console.log(JSON.stringify({ browserDocuments: documents.size }));
