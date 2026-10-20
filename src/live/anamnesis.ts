import { type AiLayer, combineLayers, mergeFacts } from '../../shared/medical/anamnesis';
import { DialogueState, extractFacts } from '../../shared/medical/extract';
import type { Fact, Turn } from '../../shared/types';
import * as api from '../lib/api';

export type AiStatus = 'idle' | 'syncing' | 'ok' | 'error';

interface Hooks {
  turns(): Turn[];
  languageName(): string;
  publish(facts: Fact[], status: AiStatus, syncedAt: number | null): void;
}

const DEBOUNCE_MS = 1400;
const CONTEXT_TURNS = 4;

/**
 * Two-layer live anamnesis.
 *   Local layer: deterministic extraction on every finished turn (instant).
 *   AI layer: debounced, incremental pass that sends only turns the AI has
 *   not seen yet plus the current fact list, so cost grows linearly with the
 *   conversation instead of quadratically. See combineLayers() for merging.
 */
export class AnamnesisSync {
  private local: Fact[] = [];
  private ai: AiLayer | null = null;
  private dialogue = new DialogueState();
  private timer: number | null = null;
  private inFlight: AbortController | null = null;
  private again = false;
  private status: AiStatus = 'idle';
  private syncedAt: number | null = null;

  constructor(private readonly hooks: Hooks) {}

  onTurn(turn: Turn) {
    const text = turn.speaker === 'nurse' ? turn.source : turn.translation;
    if (!text?.trim()) return;
    const facts = extractFacts({ id: turn.id, speaker: turn.speaker, text, at: turn.createdAt }, this.dialogue);
    this.local = mergeFacts(this.local, facts);
    this.emit();
    this.schedule();
  }

  private schedule() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.sync();
    }, DEBOUNCE_MS);
  }

  private async sync() {
    if (this.inFlight) {
      this.again = true;
      return;
    }
    const done = this.hooks.turns().filter((t) => t.status === 'done' && (t.source || t.translation));
    const watermark = this.ai?.watermark ?? 0;
    const fresh = done.filter((t) => t.createdAt > watermark);
    if (fresh.length === 0) return;
    const first = done.indexOf(fresh[0]);
    const context = done.slice(Math.max(0, first - CONTEXT_TURNS), first);
    const known = combineLayers(this.local, this.ai);
    const controller = new AbortController();
    this.inFlight = controller;
    this.setStatus('syncing');
    try {
      const res = await api.anamnesis(
        {
          languageName: this.hooks.languageName(),
          facts: known.map(({ category, text, negated }) => ({ category, text, negated })),
          turns: [
            ...context.map((t) => ({ id: t.id, speaker: t.speaker, source: t.source, translation: t.translation, context: true })),
            ...fresh.map((t) => ({ id: t.id, speaker: t.speaker, source: t.source, translation: t.translation })),
          ],
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const mark = Math.max(...fresh.map((t) => t.createdAt));
      const facts: Fact[] = res.facts.map((f) => ({
        ...f,
        origin: 'ai',
        at: mark,
        pinned: f.category === 'allergy' && !f.negated,
      }));
      // An allergy confirmed earlier survives a later pass that forgot it, unless retracted
      for (const prev of this.ai?.facts ?? []) {
        if (prev.pinned && !facts.some((f) => f.key === prev.key) && !res.retracted.includes(prev.key)) facts.push(prev);
      }
      this.ai = { facts, retracted: res.retracted, watermark: mark };
      this.syncedAt = Date.now();
      this.setStatus('ok');
    } catch {
      // Keep both layers as they are; the next turn retries
      if (!controller.signal.aborted) this.setStatus('error');
    } finally {
      if (this.inFlight === controller) this.inFlight = null;
      if (this.again) {
        this.again = false;
        this.schedule();
      }
    }
  }

  private setStatus(status: AiStatus) {
    this.status = status;
    this.emit();
  }

  private emit() {
    this.hooks.publish(combineLayers(this.local, this.ai), this.status, this.syncedAt);
  }

  /**
   * New or restored conversation. Restored facts become an already-reviewed
   * AI layer up to `watermark`, so only new turns are sent next time.
   */
  reset(facts: Fact[] = [], watermark = 0) {
    this.inFlight?.abort();
    this.inFlight = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.local = watermark ? [] : facts;
    this.ai = watermark ? { facts, retracted: [], watermark } : null;
    this.dialogue = new DialogueState();
    this.status = 'idle';
    this.syncedAt = null;
    this.emit();
  }
}
