import { addToLedger, isRejected, presentFacts, reconcileAi } from '../../shared/medical/anamnesis';
import { applyDrugCheck } from '../../shared/medical/drugcheck';
import { DialogueState, extractFacts } from '../../shared/medical/extract';
import type { Fact, Turn } from '../../shared/types';
import * as api from '../lib/api';

export type AiStatus = 'idle' | 'syncing' | 'ok' | 'error';

interface Hooks {
  turns(): Turn[];
  languageName(): string;
  /** Free-tier economy mode: fewer AI passes. */
  economy(): boolean;
  publish(facts: Fact[], rejected: Fact[], status: AiStatus, syncedAt: number | null): void;
}

const DEBOUNCE_MS = 1200;
// Economy mode waits for a pause in the conversation before the next AI pass
const ECONOMY_DEBOUNCE_MS = 3500;
const MAX_TURNS = 150;

/**
 * Live anamnesis as a ledger the nurse can rely on.
 *   Instant: deterministic extraction on every finished turn adds provisional items.
 *   AI: a debounced pass over the whole conversation (up to MAX_TURNS) confirms,
 *   refines and adds items. Rereading everything each time lets the AI see which
 *   question an answer belongs to ("Any allergies?" → "Yes. Amlodis, Avil.").
 * Confirmed items never disappear because a later pass left them out; they go
 * only when the conversation corrects them or the nurse removes them (those
 * are sent to the AI as rejected and never return). See reconcileAi().
 */
export class AnamnesisSync {
  private ledger: Fact[] = [];
  /** Creation time of the newest turn an AI pass has read. */
  private watermark = 0;
  private rejected: Fact[] = [];
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
    // A drug name the translation got wrong is filed under the name the speaker said
    const facts = applyDrugCheck(extractFacts({ id: turn.id, speaker: turn.speaker, text, at: turn.createdAt }, this.dialogue), turn.drugCheck ?? []);
    this.ledger = addToLedger(this.ledger, facts);
    this.emit();
    // Economy mode: the AI rereads the conversation after the patient answers. A nurse's
    // question alone is shown by the instant extraction and is read with the next answer.
    if (this.hooks.economy() && turn.speaker === 'nurse') return;
    this.schedule();
  }

  private schedule() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.sync();
    }, this.hooks.economy() ? ECONOMY_DEBOUNCE_MS : DEBOUNCE_MS);
  }

  private async sync() {
    if (this.inFlight) {
      this.again = true;
      return;
    }
    const done = this.hooks.turns().filter((t) => t.status === 'done' && (t.source || t.translation));
    const fresh = done.filter((t) => t.createdAt > this.watermark);
    if (fresh.length === 0) return;
    const recent = done.slice(-MAX_TURNS);
    const known = this.combined();
    const controller = new AbortController();
    this.inFlight = controller;
    this.setStatus('syncing');
    try {
      const res = await api.anamnesis(
        {
          languageName: this.hooks.languageName(),
          facts: known.map(({ category, text, negated }) => ({ category, text, negated })),
          turns: recent.map((t) => ({ id: t.id, speaker: t.speaker, source: t.source, translation: t.translation })),
          rejected: this.rejected.map(({ category, text }) => ({ category, text })),
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      // Everything up to the newest turn sent was read by this pass
      const mark = Math.max(...recent.map((t) => t.createdAt));
      const facts: Fact[] = res.facts.map((f) => ({
        ...f,
        origin: 'ai',
        at: mark,
        pinned: (f.category === 'allergy' && !f.negated) || undefined,
      }));
      this.ledger = reconcileAi(this.ledger, facts, res.retracted, mark);
      this.watermark = Math.max(this.watermark, mark);
      this.syncedAt = Date.now();
      this.setStatus('ok');
    } catch {
      // Keep the ledger as it is; the next turn retries
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

  private combined(): Fact[] {
    return presentFacts(this.ledger.filter((f) => !isRejected(f, this.rejected)));
  }

  private emit() {
    this.hooks.publish(this.combined(), this.rejected, this.status, this.syncedAt);
  }

  /** The nurse checked with the patient and removed this fact. */
  dismiss(fact: Fact) {
    this.rejected = [...this.rejected.filter((r) => r.key !== fact.key), fact];
    this.emit();
  }

  /** Undo a removal. */
  restore(fact: Fact) {
    this.rejected = this.rejected.filter((r) => r.key !== fact.key);
    this.emit();
  }

  /**
   * New or restored conversation. Restored facts are already confirmed up to
   * `watermark`, so only new turns trigger the next pass.
   */
  reset(facts: Fact[] = [], watermark = 0, rejected: Fact[] = []) {
    this.inFlight?.abort();
    this.inFlight = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.ledger = facts.map((f) => ({ ...f, settled: watermark ? true : f.settled }));
    this.watermark = watermark;
    this.rejected = rejected;
    this.dialogue = new DialogueState();
    this.status = 'idle';
    this.syncedAt = null;
    this.emit();
  }
}
