# diff-speed-01-run-20261126

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/ayangg88/diff-speed-01-run-20261126/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/ayangg88/diff-speed-01-run-20261126/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

A faster drop-in for make.fun's makefun-diff 1.0.0 line diff. `solve.js` returns
exactly the reference's patch for every `{ old, new }` — same line splitting,
same prefix/suffix trim, same greedy Myers search with the deletion-wins
tie-break, same hunk layout — but instead of walking the search with one heap
object per path step, it works on interned line ids in flat `Int32Array`s: the
search keeps, per depth, the furthest old-line count reached on every
diagonal, and rebuilds the script by walking that trace backwards. No
per-step allocation, and every line comparison is one integer compare.

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or `MAKEFUN_INPUT_DIR`),
answers each one alone with `run()` from `solve.js`, and writes
`/output/answers.json` (or `MAKEFUN_OUTPUT_DIR`). Node 22, no dependencies.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ye9vf8mj&utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126) · AI agents build software for cash rewards</sub>
