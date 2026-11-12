// Splits Supabase's generated database types into one file per area, so no file is too long
// to review. Reads the generator's output from a file argument or from standard input:
//
//   npx supabase gen types typescript --project-id <ref> | npm run db:types
//
// The result in src/lib/database/ is generated: change the schema, never these files.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = 'src/lib/database';
const HEADER = '// Generated from the live schema by scripts/db-types.mjs. Do not edit by hand.\n';

/** Which file each table's types go to. A table not listed here lands in "other". */
const GROUPS = {
  club: [
    'audit_log',
    'client_errors',
    'club_members',
    'clubs',
    'data_requests',
    'players',
    'teams',
  ],
  match: ['match_events', 'matches', 'stints'],
  training: ['observations', 'session_attendance', 'session_drills', 'sessions'],
};

const source = readFileSync(process.argv[2] ?? 0, 'utf8').replace(/\r\n/g, '\n');
const lines = source.split('\n');

/** The lines inside a four-space-indented `Name: {` block of the public schema. */
function block(name) {
  const start = lines.findIndex((line) => line === `    ${name}: {`);
  if (start < 0) throw new Error(`The input has no ${name} block.`);
  const end = lines.findIndex((line, index) => index > start && /^ {4}\};?$/.test(line));
  return lines.slice(start + 1, end);
}

function groupOf(table) {
  const found = Object.entries(GROUPS).find(([, tables]) => tables.includes(table));
  return found === undefined ? 'other' : found[0];
}

/** Table name to its lines, in the order the generator wrote them. */
function tablesByGroup() {
  const groups = new Map();
  let current = null;
  for (const line of block('Tables')) {
    const start = /^ {6}([a-z0-9_]+): \{$/.exec(line);
    if (start !== null) {
      const group = groupOf(start[1]);
      if (!groups.has(group)) groups.set(group, []);
      current = groups.get(group);
    }
    if (current === null) throw new Error('The Tables block does not start with a table.');
    current.push(line);
  }
  return groups;
}

/** A type alias whose body may refer to the shared enums and to Json. */
function typeFile(name, body) {
  const text = body.join('\n').replace(/Database\[["']public["']\]\[["']Enums["']\]/g, 'Enums');
  const imports = [
    /\bEnums\[/.test(text) ? "import type { Enums } from './enums';\n" : '',
    /\bJson\b/.test(text) ? "import type { Json } from './json';\n" : '',
  ].join('');
  return `${HEADER}${imports}\nexport type ${name} = {\n${text}\n};\n`;
}

const pascal = (word) => word.charAt(0).toUpperCase() + word.slice(1);
// Anchored to the start of a line: the generator's own comment mentions the key too.
const version = /^\s+PostgrestVersion: ["']([^"']+)["']/m.exec(source)?.[1];
if (version === undefined) throw new Error('The input does not state the PostgREST version.');

const groups = [...tablesByGroup()].sort(([a], [b]) => a.localeCompare(b));
mkdirSync(OUT, { recursive: true });
writeFileSync(
  `${OUT}/json.ts`,
  `${HEADER}\nexport type Json =\n  | string\n  | number\n  | boolean\n  | null\n  | { [key: string]: Json | undefined }\n  | Json[];\n`,
);
writeFileSync(`${OUT}/enums.ts`, typeFile('Enums', block('Enums')));
writeFileSync(`${OUT}/functions.ts`, typeFile('Functions', block('Functions')));
for (const [group, body] of groups) {
  writeFileSync(`${OUT}/tables.${group}.ts`, typeFile(`${pascal(group)}Tables`, body));
}

const tableImports = groups
  .map(([group]) => `import type { ${pascal(group)}Tables } from './tables.${group}';`)
  .join('\n');
const tableUnion = groups.map(([group]) => `${pascal(group)}Tables`).join(' & ');
writeFileSync(
  `${OUT}/index.ts`,
  `${HEADER}import type { Enums } from './enums';
import type { Functions } from './functions';
${tableImports}

export type { Json } from './json';

export type Database = {
  // Lets createClient pick the right options for this PostgREST version.
  __InternalSupabase: { PostgrestVersion: '${version}' };
  public: {
    Tables: ${tableUnion};
    Views: { [_ in never]: never };
    Functions: Functions;
    Enums: Enums;
    CompositeTypes: { [_ in never]: never };
  };
};
`,
);
process.stdout.write(`Wrote ${String(groups.length + 4)} files to ${OUT}.\n`);
