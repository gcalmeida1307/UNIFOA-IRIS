import type { Run } from '../types.js';
import { tokenize } from '../../data/processing/text.js';

/** Aggregate only repeated topics; never return raw questions or individual users. */
export function themesForRuns(runs: Run[], days = 30, now = Date.now()) {
  const since = now - days * 86400000;
  const rows = new Map<string, { theme: string; consultations: number; useful: number; poor: number; abstained: number }>();
  let total = 0;
  for (const run of runs) {
    if (Date.parse(run.createdAt) < since || !run.sources.length && run.status === 'completed') continue;
    total++;
    const terms = new Set(tokenize(run.question).filter(term => term.length >= 4 && term.length <= 24 && !/\d/.test(term)));
    for (const theme of terms) {
      const item = rows.get(theme) ?? { theme, consultations: 0, useful: 0, poor: 0, abstained: 0 };
      item.consultations++;
      if (run.feedback === 1) item.useful++;
      if (run.feedback === -1) item.poor++;
      if (run.status === 'abstained') item.abstained++;
      rows.set(theme, item);
    }
  }
  return { periodDays: days, totalQueries: total, topThemes: [...rows.values()].filter(item => item.consultations >= 2).sort((a, b) => b.consultations - a.consultations || a.theme.localeCompare(b.theme)).slice(0, 12) };
}
