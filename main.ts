// main.ts — the program the harness runs: node /bot/main.ts (node 22).
// It reads every case from /input/cases.json, answers each one alone with
// run() from solve.js, and writes the answers in order to
// /output/answers.json. Outside a container, MAKEFUN_INPUT_DIR and
// MAKEFUN_OUTPUT_DIR stand in for /input and /output.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// Keep V8's incremental marking off for the whole run, set before solve.js
// is imported so all of its work runs under it.
setFlagsFromString('--no-incremental-marking');

type Solver = { run: (input: unknown) => unknown };
const solver = (await import(new URL('./solve.js', import.meta.url).href)) as Solver;

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

type Case = { id: string; input: unknown };
const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8')) as Case[];

const answers: unknown[] = [];
for (const c of cases) {
  answers.push(solver.run(c.input));
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));
