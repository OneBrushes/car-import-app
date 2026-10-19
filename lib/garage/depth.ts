// Orden de dibujo de una escena isométrica (puro): lo que está más al fondo se dibuja antes. Portado tal cual de LOOSES & WINS (depth.ts).
import type { Rect } from './world';

export interface Placed { key: string; r: Rect }

const EPS = 1e-6;
/** a is entirely behind b (smaller x or smaller y, with no overlap on that axis) */
const behind = (a: Rect, b: Rect) => a.x1 <= b.x0 + EPS || a.y1 <= b.y0 + EPS;
const centre = (r: Rect) => r.x0 + r.x1 + r.y0 + r.y1;

/**
 * Back-to-front order for floor footprints. Only things that can cover each other on screen (their screen-x ranges
 * overlap) are compared; ties and overlapping footprints fall back to the centre depth. Topological order (Kahn), the
 * next item always being the ready one furthest back, so the result is stable when nothing changes.
 */
export function depthOrder<T extends Placed>(items: T[]): T[] {
  const n = items.length;
  const after: number[][] = Array.from({ length: n }, () => []);
  const need = new Array<number>(n).fill(0);
  const sx = items.map(({ r }) => [r.x0 - r.y1, r.x1 - r.y0]);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!(sx[i][0] < sx[j][1] - EPS && sx[j][0] < sx[i][1] - EPS)) continue;
      const a = items[i].r; const b = items[j].r;
      const ab = behind(a, b); const ba = behind(b, a);
      const first = ab && !ba ? i : ba && !ab ? j : centre(a) <= centre(b) ? i : j;
      const second = first === i ? j : i;
      after[first].push(second); need[second]++;
    }
  }
  const prio = items.map((it) => centre(it.r));
  const done = new Array<boolean>(n).fill(false);
  const out: T[] = [];
  for (let k = 0; k < n; k++) {
    let best = -1;
    for (let i = 0; i < n; i++) if (!done[i] && need[i] === 0 && (best < 0 || prio[i] < prio[best] || (prio[i] === prio[best] && items[i].key < items[best].key))) best = i;
    if (best < 0) {   // a cycle (overlapping footprints): take the one furthest back
      for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || prio[i] < prio[best])) best = i;
    }
    done[best] = true; out.push(items[best]);
    for (const j of after[best]) need[j]--;
  }
  return out;
}
