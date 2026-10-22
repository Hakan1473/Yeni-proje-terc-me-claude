import { type TermInfo, type TermQuery, termKey } from '../../shared/medical/terms';
import * as api from './api';

// v3: one card type per anamnesis category; earlier cards (including stand-in ones) are discarded
const STORAGE = 'tr.terms.v3';
const OLD_STORAGE = ['tr.terms', 'tr.terms.v2'];
const TTL = 30 * 24 * 3600 * 1000;
const MAX = 300;

type Stored = Record<string, { at: number; info: TermInfo }>;

function load(): Stored {
  try {
    for (const k of OLD_STORAGE) localStorage.removeItem(k);
    return JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as Stored;
  } catch {
    return {};
  }
}

const stored = load();
const pending = new Map<string, Promise<TermInfo>>();

function persist(key: string, info: TermInfo) {
  stored[key] = { at: Date.now(), info };
  const keys = Object.keys(stored);
  if (keys.length > MAX) {
    for (const k of keys.sort((a, b) => stored[a].at - stored[b].at).slice(0, keys.length - MAX)) delete stored[k];
  }
  try {
    localStorage.setItem(STORAGE, JSON.stringify(stored));
  } catch {
    // Storage full or blocked: the in-memory copy still serves this session
  }
}

/** A card already on this device, so it can open without a spinner. */
export function cachedTerm(q: TermQuery): TermInfo | null {
  const hit = stored[termKey(q)];
  // A simulation sample is never a real answer
  if (!hit || (hit.info.origin !== 'web' && hit.info.origin !== 'ai')) return null;
  return Date.now() - hit.at < TTL ? hit.info : null;
}

/** Card for a term: device cache first, one request in flight per term. */
export function fetchTerm(q: TermQuery): Promise<TermInfo> {
  const key = termKey(q);
  const cached = cachedTerm(q);
  if (cached) return Promise.resolve(cached);
  let p = pending.get(key);
  if (!p) {
    p = api
      .term(q)
      .then((info) => {
        // Simulation samples are never kept: the real answer must replace them once a key is set
        // Only full answers are kept: simulation samples and stand-in reference cards are replaced next time
        if (info.known && (info.origin === 'web' || info.origin === 'ai')) persist(key, info);
        return info;
      })
      .finally(() => pending.delete(key));
    pending.set(key, p);
  }
  return p;
}

/** Warm the cache for terms that just appeared, one at a time, so a tap opens instantly. */
let queue: TermQuery[] = [];
let draining = false;

export function prefetchTerms(list: TermQuery[]) {
  for (const q of list) {
    const key = termKey(q);
    if (!cachedTerm(q) && !pending.has(key) && !queue.some((x) => termKey(x) === key)) queue.push(q);
  }
  if (draining) return;
  draining = true;
  // One lookup at a time, so background cards never compete with the interpreter for the AI quota
  void (async () => {
    while (queue.length) {
      const q = queue.shift() as TermQuery;
      await fetchTerm(q).catch(() => {});
    }
    draining = false;
  })();
}
