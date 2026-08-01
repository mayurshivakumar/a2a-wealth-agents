#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultUrl = 'https://developers.openai.com/api/docs/guides/latest-model.md';
const defaultBaseUrl = 'https://developers.openai.com';

function parseArgs(argv) {
  const args = {
    source: process.env.LATEST_MODEL_URL || defaultUrl,
    baseUrl: process.env.LATEST_MODEL_BASE_URL || defaultBaseUrl,
  };

  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--source' || argv[index] === '--url') {
      args.source = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--base-url') {
      args.baseUrl = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

async function readSource(source) {
  if (source.startsWith('file://')) {
    return readFile(new URL(source), 'utf8');
  }

  if (!/^https?:\/\//.test(source)) {
    const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
    return readFile(path.resolve(scriptDirectory, '..', source), 'utf8');
  }

  const response = await fetch(source, {
    headers: { accept: 'text/markdown,text/plain,*/*' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${source}: ${response.status}`);
  }

  return response.text();
}

function parseInfo(markdown) {
  const indented = markdown.match(
    /^latestModelInfo:\s*\n((?:[ \t]+[^\n]+\n?)+)/m,
  );
  const commented = markdown.match(
    /<!--\s*latestModelInfo\s*\n([\s\S]*?)\n\s*-->/m,
  );
  const block = indented?.[1] ?? commented?.[1];

  if (!block) {
    throw new Error('latestModelInfo block was not found');
  }

  const info = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z][A-Za-z0-9_-]*):\s*(.+?)\s*$/);
    if (match) info[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return info;
}

function normalize(info, baseUrl) {
  if (!info.model || !info.migrationGuide || !info.promptingGuide) {
    throw new Error(
      'latestModelInfo must include model, migrationGuide, and promptingGuide',
    );
  }

  return {
    model: info.model,
    modelSlug: info.model.replace(/\./g, 'p'),
    migrationGuideUrl: new URL(info.migrationGuide, baseUrl).toString(),
    promptingGuideUrl: new URL(info.promptingGuide, baseUrl).toString(),
  };
}

try {
  const { source, baseUrl } = parseArgs(process.argv);
  const markdown = await readSource(source);
  process.stdout.write(`${JSON.stringify(normalize(parseInfo(markdown), baseUrl), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
