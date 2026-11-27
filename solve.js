// solve.js — a faster drop-in for make.fun's makefun-diff 1.0.0.
//
// run(input) returns exactly makefun-diff 1.0.0's patch of { old, new } as one
// JSON string: the same line splitting, the same common prefix/suffix trim,
// the same greedy Myers search with the same tie-break (a deletion wins over
// an insertion when both reach the same point, no edge pruning, snakes run as
// far as equal lines go), and the same hunk layout with 3 lines of context.
//
// Where the reference walks the search with one heap object per path step,
// this module works on interned line ids in flat Int32Arrays: the search
// keeps, for every depth d, the furthest old-line count reached on every
// diagonal (a single growing flat array, V[d] at offset d*d), and the script
// is rebuilt by walking that trace backwards. No per-step allocation, and
// every line comparison is one integer compare.

const KEEP = '=';
const DELETE = '-';
const INSERT = '+';
const CONTEXT = 3;

/** A text's lines, each carrying its "\n" except a last line without one. */
function tokenize(text) {
  const parts = text.split('\n');
  const lines = [];
  const last = parts.length - 1;
  for (let i = 0; i < last; i++) lines.push(parts[i] + '\n');
  if (parts[last] !== '') lines.push(parts[last]);
  return lines;
}

/** A line as the patch writes it, with "%" after a line that had no newline. */
function written(op, line) {
  return line.endsWith('\n') ? op + line : op + line + '\n%\n';
}

/**
 * The edit runs of the middle slices a and b (Int32Array of line ids), in
 * order: [{ kind, count }]. The forward pass stores, per depth d, the
 * furthest old-line count on each diagonal; the backward pass replays the
 * same choices the forward pass made, so the script is the reference's own.
 */
function editRuns(a, b) {
  const n = a.length;
  const m = b.length;

  // Padded copies: a distinct sentinel past each end (-1 and -2, never equal
  // to a line id and never equal to each other), so a snake is one bare
  // comparison per step and needs no bounds checks.
  const ap = new Int32Array(n + 1);
  ap.set(a);
  ap[n] = -1;
  const bp = new Int32Array(m + 1);
  bp.set(b);
  bp[m] = -2;

  // The trace: one row per depth, rows[d][k + d] the furthest old-line count
  // on diagonal k (or -1 when no path reaches it). Rows grow one at a time,
  // so nothing is ever copied, and each depth pins its two rows in locals.
  const rows = [];
  // Depth 0: the opening snake from the first lines.
  let x = 0;
  while (ap[x] === bp[x]) x++;
  rows[0] = new Int32Array(1);
  rows[0][0] = x;
  let D = 0;
  let K = 0;
  if (x !== n || x !== m) {
    const maxD = n + m;
    outer: for (let d = 1; d <= maxD; d++) {
      const vp = rows[d - 1];
      const vc = new Int32Array(2 * d + 1);
      rows[d] = vc;
      const prevOff = d - 1;
      // The two edge diagonals take one candidate each; the interior takes
      // both. Running indices step by 2 as k does, so no index arithmetic
      // runs inside the loop.
      let iIns = 0; // vp[-(d-1)]
      let iDel = 0; // vp[-(d-1)], first interior deletion source
      let iW = 0; // vc[-d]
      // k = -d: only the insertion's path can reach it.
      {
        const ins = vp[iIns];
        let x0 = -1;
        if (ins >= 0 && ins + d - 1 < m) x0 = ins;
        if (x0 < 0) {
          vc[iW] = -1;
        } else {
          let y0 = x0 + d;
          while (ap[x0] === bp[y0]) {
            x0++;
            y0++;
          }
          vc[iW] = x0;
          if (x0 === n && y0 === m) {
            D = d;
            K = -d;
            break outer;
          }
        }
      }
      iIns += 2;
      iW += 2;
      for (let k = -d + 2; k <= d - 2; k += 2) {
        const delPrev = vp[iDel];
        const insPrev = vp[iIns];
        const xd = delPrev >= 0 && delPrev < n ? delPrev + 1 : -1;
        const xi = insPrev >= 0 && insPrev - k - 1 < m ? insPrev : -1;
        const x0in = xd >= xi ? xd : xi;
        if (x0in < 0) {
          vc[iW] = -1;
        } else {
          let x0 = x0in;
          let y0 = x0 - k;
          while (ap[x0] === bp[y0]) {
            x0++;
            y0++;
          }
          vc[iW] = x0;
          if (x0 === n && y0 === m) {
            D = d;
            K = k;
            break outer;
          }
        }
        iDel += 2;
        iIns += 2;
        iW += 2;
      }
      // k = +d: only the deletion's path can reach it.
      {
        const del = vp[2 * prevOff];
        let x0 = -1;
        if (del >= 0 && del < n) x0 = del + 1;
        if (x0 < 0) {
          vc[2 * d] = -1;
        } else {
          let y0 = x0 - d;
          while (ap[x0] === bp[y0]) {
            x0++;
            y0++;
          }
          vc[2 * d] = x0;
          if (x0 === n && y0 === m) {
            D = d;
            K = d;
            break outer;
          }
        }
      }
    }
    if (D === 0) {
      throw new Error('makefun-diff: the search ended without reaching both ends');
    }
  }

  // Walk the trace back: one edit and the snake after it per depth.
  const steps = [];
  let k = K;
  let X = rows[D][K + D];
  for (let d = D; d >= 1; d--) {
    const vp = rows[d - 1];
    const delPrev = k > -d ? vp[k - 1 + (d - 1)] : -1;
    const insPrev = k < d ? vp[k + 1 + (d - 1)] : -1;
    const canDel = delPrev >= 0 && delPrev < n;
    const canIns = insPrev >= 0 && insPrev - (k + 1) < m;
    let xMove;
    let edit;
    if (canDel && (!canIns || delPrev >= insPrev - 1)) {
      xMove = delPrev + 1;
      edit = DELETE;
      k = k - 1;
    } else {
      xMove = insPrev;
      edit = INSERT;
      k = k + 1;
    }
    steps.push({ keep: X - xMove, edit });
    X = vp[k + (d - 1)];
  }

  // Forward order: the opening snake, then per depth one edit and its snake.
  const runs = [];
  const push = (kind, count) => {
    if (count <= 0) return;
    const lastRun = runs[runs.length - 1];
    if (lastRun !== undefined && lastRun.kind === kind) lastRun.count += count;
    else runs.push({ kind, count });
  };
  push(KEEP, X);
  for (let i = steps.length - 1; i >= 0; i--) {
    push(steps[i].edit, 1);
    push(KEEP, steps[i].keep);
  }
  return runs;
}

/** make.fun's own patch of input.old into input.new. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  const aLines = tokenize(input.old);
  const bLines = tokenize(input.new);
  const n = aLines.length;
  const m = bLines.length;

  // One id per distinct line, shared by both texts, so the search compares
  // integers instead of re-scanning long lines.
  const ids = new Map();
  const a = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let id = ids.get(aLines[i]);
    if (id === undefined) {
      id = ids.size;
      ids.set(aLines[i], id);
    }
    a[i] = id;
  }
  const b = new Int32Array(m);
  for (let j = 0; j < m; j++) {
    let id = ids.get(bLines[j]);
    if (id === undefined) {
      id = ids.size;
      ids.set(bLines[j], id);
    }
    b[j] = id;
  }

  // The common prefix, then the common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) suffix++;

  const runs = [];
  if (prefix > 0) runs.push({ kind: KEEP, count: prefix });
  runs.push(...editRuns(a.subarray(prefix, n - suffix), b.subarray(prefix, m - suffix)));
  if (suffix > 0) runs.push({ kind: KEEP, count: suffix });

  // The change runs: each a stretch of deletions and insertions between keeps.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    if (r.kind === KEEP) {
      o += r.count;
      p += r.count;
      continue;
    }
    let c = changes[changes.length - 1];
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (r.kind === DELETE) {
      c.dels += r.count;
      o += r.count;
      deleted += r.count;
    } else {
      c.ins += r.count;
      p += r.count;
      inserted += r.count;
    }
  }

  // The hunks: change runs at most 2 * CONTEXT kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks[hunks.length - 1];
    const prev = h !== undefined ? h[h.length - 1] : undefined;
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * CONTEXT) h.push(c);
    else hunks.push([c]);
  }

  const out = [`makefun-diff/1 old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - CONTEXT);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(CONTEXT, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) out.push(written(KEEP, aLines[at]));
      for (let i = 0; i < c.dels; i++) out.push(written(DELETE, aLines[c.o + i]));
      for (let i = 0; i < c.ins; i++) out.push(written(INSERT, bLines[c.p + i]));
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) out.push(written(KEEP, aLines[at]));
  }
  return out.join('');
}
