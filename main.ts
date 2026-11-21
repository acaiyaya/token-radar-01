// Token Radar (model radar-3): the entrypoint the grader runs.
//
//   node main.ts --input /input/snapshot.json        (output defaults to /output)
//
// It reads the sealed snapshot, prices every rankable pre-token protocol with the model in
// lib/model.ts, and writes five things to the output directory:
//   board.json    the ranked board: watchlist coverage plus the early radar below the floor
//   data.js       the same board as one script the static dashboard renders, no fetch, no network
//   dashboard/    this repository's dashboard, copied verbatim
//   screenshots/  this repository's screenshots of that dashboard, copied verbatim
//   dossier.json  the summary the judge reads, rebuilt by the vendored make.fun library from the
//                 finished output, so it is written last and matches byte for byte
//
// The board is checked against the gate's shape before anything is written: a board that misses
// a watchlist slug, breaks rank order, or carries an out-of-shape farm plan fails the run here,
// at build time, instead of at submission time. Two runs over the same snapshot produce the same
// bytes: the model iterates in sorted order wherever a tie is possible.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> or --name=<value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/** A dollar figure for the run summary, grouped and without cents. */
function usd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
if (!dashFiles.includes('index.html')) {
  process.stderr.write('token radar: dashboard/ holds no index.html: the judge opens the page before it reads the board\n');
  process.exit(1);
}

const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3 || shots.length > SCREENSHOT_CAPS.max) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3 or 4, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
  const bytes = statSync(join(out, 'screenshots', name)).size;
  if (bytes > SCREENSHOT_CAPS.max_bytes) {
    process.stderr.write(`token radar: screenshots/${name} is ${bytes} bytes: the cap is ${SCREENSHOT_CAPS.max_bytes}\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }));

const top = board.slice(0, 3).map((r) => `#${r.rank} ${r.name} ${usd(r.implied_value_usd)}`).join('; ');
process.stdout.write(
  `token radar ${radar.model_version}: ${snapshot.protocols.length} protocols scanned, ${snapshot.watchlist.length} on the watchlist, ` +
    `${board.length} rows ranked (${radar.early_size} beyond the watchlist), ${radar.live_size} live-token protocols set aside\n` +
    `token radar: global price-to-TVL multiple ${radar.global_multiple}x across ${radar.categories.length} categories; top of the board: ${top}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ` +
    `${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
