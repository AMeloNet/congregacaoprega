import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ignored = new Set(['.git', 'node_modules', 'dist', 'coverage']);
function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const file = join(dir, entry.name);
    return entry.isDirectory()
      ? markdownFiles(file)
      : extname(file) === '.md'
        ? [file]
        : [];
  });
}

let broken = 0;
for (const file of markdownFiles(root)) {
  const content = readFileSync(file, 'utf8');
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    if (!existsSync(resolve(dirname(file), decodeURIComponent(target)))) {
      process.stderr.write(
        `Broken link: ${file.slice(root.length + 1)} -> ${target}\n`,
      );
      broken++;
    }
  }
}
if (broken) process.exitCode = 1;
else process.stdout.write('Local Markdown links valid.\n');
