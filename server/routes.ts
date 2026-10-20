import { Type } from '@google/genai';
import { type Express, json, Router } from 'express';
import { getLanguage } from '../shared/languages';
import { combineLayers, mergeFacts } from '../shared/medical/anamnesis';
import { canonicalKey, DialogueState, extractFacts } from '../shared/medical/extract';
import { type TermInfo, type TermKind, termKey } from '../shared/medical/terms';
import { fuseSpeaker } from '../shared/speaker';
import { fold, words } from '../shared/text';
import type { AnamnesisRequest, ConversationSummary, Fact, FactCategory, Speaker } from '../shared/types';
import { VOICES } from '../shared/types';
import { generateJson, synthesize } from './ai';
import { config } from './config';
import { mockSpeech, mockTerm, mockTranslate } from './mock';
import { anamnesisInstruction, summaryInstruction, termInstruction, translateInstruction } from './prompts';
import { cleanString, hasAccess, rateLimit, requireAccess } from './security';

const TERM_KINDS: TermKind[] = ['drug', 'condition', 'symptom', 'procedure', 'allergen'];

/** Term cards are the same for every patient: answer repeats from memory. */
const termCache = new Map<string, TermInfo>();
const TERM_CACHE_MAX = 800;

const CATEGORIES: FactCategory[] = ['complaint', 'need', 'medication', 'allergy', 'chronic', 'surgery', 'habit', 'family', 'instruction'];

interface TurnInput {
  id: string;
  speaker: Speaker;
  source: string;
  translation?: string;
  context?: boolean;
}

function readTurns(raw: unknown, max: number): TurnInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-max)
    .map((t) => ({
      id: cleanString(t?.id, 80),
      speaker: (t?.speaker === 'patient' ? 'patient' : 'nurse') as Speaker,
      source: cleanString(t?.source, 1200),
      translation: cleanString(t?.translation, 1200) || undefined,
      context: t?.context === true,
    }))
    .filter((t) => t.source || t.translation);
}

/** The Turkish side of a turn, which is what clinical extraction reads. */
function turkishText(t: TurnInput): string {
  return t.speaker === 'nurse' ? t.source : (t.translation ?? '');
}

/** An AI fact is kept only if its quote can be found in the conversation. */
function isGrounded(evidence: string, turns: TurnInput[]): boolean {
  const ev = words(fold(evidence));
  if (ev.length === 0) return false;
  return turns.some((t) => {
    const hay = new Set(words(fold(`${t.source} ${t.translation ?? ''}`)));
    const hits = ev.filter((w) => hay.has(w)).length;
    return hits / ev.length >= 0.6;
  });
}

function localAnamnesis(turns: TurnInput[], known: Fact[]): Fact[] {
  const state = new DialogueState();
  let facts = known;
  turns.forEach((t, i) => {
    const text = turkishText(t);
    if (!text) return;
    const extracted = extractFacts({ id: t.id, speaker: t.speaker, text, at: Date.now() + i }, state);
    if (!t.context) facts = mergeFacts(facts, extracted);
  });
  return combineLayers(facts, null);
}

export function mountRoutes(app: Express): void {
  const api = Router();
  api.use(json({ limit: '256kb' }));

  api.get('/health', (_req, res) => {
    res.json({ ok: true, mock: config.mock, accessRequired: !!config.accessCode, liveModel: config.models.live });
  });

  api.post('/access', (req, res) => {
    res.json({ ok: hasAccess(cleanString(req.body?.code, 100)) });
  });

  api.use(requireAccess);

  // Text translation: fallback when the live channel stalls, and for typed messages
  api.post('/translate', rateLimit('translate', 90), async (req, res) => {
    const text = cleanString(req.body?.text, 1500);
    const lang = getLanguage(cleanString(req.body?.language, 10));
    if (!text) {
      res.status(400).json({ error: 'text_required' });
      return;
    }
    const hint = req.body?.speaker === 'patient' ? 'patient' : req.body?.speaker === 'nurse' ? 'nurse' : undefined;
    if (config.mock) {
      res.json(mockTranslate(text, lang, hint));
      return;
    }
    const out = await generateJson<{ sourceLanguage?: string; translation?: string }>({
      models: [config.models.fast, config.models.smart],
      system: translateInstruction(lang),
      input: { utterance: text, likelySpeaker: hint ?? 'unknown' },
      schema: {
        type: Type.OBJECT,
        properties: {
          sourceLanguage: { type: Type.STRING, description: `"tr" if the utterance is Turkish, otherwise its ISO code` },
          translation: { type: Type.STRING },
        },
        required: ['sourceLanguage', 'translation'],
      },
      timeoutMs: 7000,
    });
    if (!out?.translation) {
      res.status(502).json({ error: 'translation_failed' });
      return;
    }
    // The model's own language decision, cross-checked against both texts
    const modelSaysTurkish = out.sourceLanguage?.toLowerCase().startsWith('tr');
    const guess = fuseSpeaker(text, out.translation, lang.code);
    const speaker: Speaker = guess.confidence >= 0.9 ? guess.speaker : modelSaysTurkish ? 'nurse' : 'patient';
    res.json({ translation: out.translation.trim(), speaker });
  });

  // Live anamnesis: incremental AI pass over new turns + known facts
  api.post('/anamnesis', rateLimit('anamnesis', 40), async (req, res) => {
    const body = req.body as Partial<AnamnesisRequest>;
    const lang = cleanString(body?.languageName, 60) || 'Yabancı dil';
    const turns = readTurns(body?.turns, 60);
    const known: Fact[] = (Array.isArray(body?.facts) ? body.facts : [])
      .slice(0, 150)
      .filter((f) => CATEGORIES.includes(f?.category))
      .map((f) => {
        const text = cleanString(f.text, 160);
        return { key: canonicalKey(f.category, text), category: f.category, text, negated: !!f.negated, origin: 'ai' as const, at: 0 };
      });

    if (config.mock || turns.length === 0) {
      const facts = localAnamnesis(turns, known);
      res.json({ facts, retracted: [] });
      return;
    }

    const out = await generateJson<{
      facts?: { category: string; text: string; negated?: boolean; evidence?: string; turnId?: string }[];
      retracted?: string[];
    }>({
      models: [config.models.fast, config.models.smart],
      system: anamnesisInstruction,
      input: {
        patient_language: lang,
        known_facts: known.map(({ category, text, negated }) => ({ category, text, negated })),
        turns: turns.map((t) => ({
          turnId: t.id,
          speaker: t.speaker === 'nurse' ? 'Hemşire (Türkçe)' : `Hasta (${lang})`,
          said: t.source,
          turkish: turkishText(t) || undefined,
          context: t.context || undefined,
        })),
      },
      schema: {
        type: Type.OBJECT,
        properties: {
          facts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING, enum: CATEGORIES },
                text: { type: Type.STRING },
                negated: { type: Type.BOOLEAN },
                evidence: { type: Type.STRING },
                turnId: { type: Type.STRING },
              },
              required: ['category', 'text'],
            },
          },
          retracted: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['facts'],
      },
      timeoutMs: 12000,
      temperature: 0.1,
    });

    if (!out?.facts) {
      res.status(502).json({ error: 'anamnesis_failed' });
      return;
    }

    const knownKeys = new Set(known.map((f) => f.key));
    const facts = out.facts
      .filter((f) => CATEGORIES.includes(f.category as FactCategory) && cleanString(f.text, 160))
      .map((f) => {
        const category = f.category as FactCategory;
        const text = cleanString(f.text, 160);
        return {
          key: canonicalKey(category, text),
          category,
          text,
          negated: f.negated || undefined,
          evidence: cleanString(f.evidence, 200) || undefined,
          turnId: cleanString(f.turnId, 80) || undefined,
        };
      })
      // Grounding: every new fact must quote the conversation; carried-over facts must already be known
      .filter((f) => (f.evidence ? isGrounded(f.evidence, turns) : knownKeys.has(f.key)));

    const retracted = (out.retracted ?? [])
      .map((r) => cleanString(r, 160))
      .flatMap((r) => known.filter((k) => fold(k.text) === fold(r) || k.key === canonicalKey(k.category, r)).map((k) => k.key));

    res.json({ facts, retracted });
  });

  api.post('/summary', rateLimit('summary', 20), async (req, res) => {
    const lang = cleanString(req.body?.languageName, 60) || 'Yabancı dil';
    const turns = readTurns(req.body?.turns, 150);
    const fallback = summaryFromFacts(turns, lang);
    if (turns.length === 0 || config.mock) {
      res.json(fallback);
      return;
    }
    const out = await generateJson<Partial<ConversationSummary>>({
      models: [config.models.fast, config.models.smart],
      system: summaryInstruction,
      input: {
        patient_language: lang,
        dialogue: turns.map((t) => ({
          speaker: t.speaker === 'nurse' ? 'Sağlık personeli (Türkçe)' : `Hasta (${lang})`,
          said: t.source,
          translation: t.translation,
        })),
      },
      schema: {
        type: Type.OBJECT,
        properties: {
          briefSummaryTr: { type: Type.STRING, description: 'Görüşmeyi anlatan 1-2 kısa cümle' },
          patientChiefComplaints: { type: Type.ARRAY, items: { type: Type.STRING } },
          patientNeedsAndRequests: { type: Type.ARRAY, items: { type: Type.STRING } },
          clinicalInstructions: { type: Type.ARRAY, items: { type: Type.STRING } },
          vitalSignsAndDosages: { type: Type.ARRAY, items: { type: Type.STRING } },
          actionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['briefSummaryTr'],
      },
      timeoutMs: 16000,
    });
    if (!out?.briefSummaryTr) {
      res.json(fallback);
      return;
    }
    const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => cleanString(x, 300)).filter(Boolean) : []);
    res.json({
      briefSummaryTr: cleanString(out.briefSummaryTr, 800),
      patientChiefComplaints: list(out.patientChiefComplaints),
      patientNeedsAndRequests: list(out.patientNeedsAndRequests),
      clinicalInstructions: list(out.clinicalInstructions),
      vitalSignsAndDosages: list(out.vitalSignsAndDosages),
      actionItems: list(out.actionItems),
      targetLanguage: lang,
      timestamp: Date.now(),
    } satisfies ConversationSummary);
  });

  // Short reference card for a term the nurse tapped in the anamnesis
  api.post('/term', rateLimit('term', 60), async (req, res) => {
    const term = cleanString(req.body?.term, 80);
    const kind = TERM_KINDS.includes(req.body?.kind) ? (req.body.kind as TermKind) : 'condition';
    if (!term) {
      res.status(400).json({ error: 'term_required' });
      return;
    }
    const cacheKey = termKey({ term, kind });
    const cached = termCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }
    if (config.mock) {
      res.json(mockTerm(term, kind));
      return;
    }
    const out = await generateJson<Partial<TermInfo>>({
      models: [config.models.fast, config.models.smart],
      system: termInstruction,
      input: { term, kind },
      schema: {
        type: Type.OBJECT,
        properties: {
          known: { type: Type.BOOLEAN },
          summary: { type: Type.STRING },
          activeIngredient: { type: Type.STRING },
          drugClass: { type: Type.STRING },
          points: { type: Type.ARRAY, items: { type: Type.STRING } },
          nursing: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['known', 'summary'],
      },
      timeoutMs: 8000,
      temperature: 0.1,
    });
    if (!out) {
      res.status(502).json({ error: 'term_failed' });
      return;
    }
    const list = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => cleanString(x, 140)).filter(Boolean).slice(0, n) : []);
    const info: TermInfo = {
      term,
      kind,
      known: out.known !== false && !!cleanString(out.summary, 400),
      summary: cleanString(out.summary, 400),
      activeIngredient: kind === 'drug' ? cleanString(out.activeIngredient, 120) || undefined : undefined,
      drugClass: kind === 'drug' ? cleanString(out.drugClass, 80) || undefined : undefined,
      points: list(out.points, 3),
      nursing: list(out.nursing, 3),
    };
    if (info.known) {
      if (termCache.size >= TERM_CACHE_MAX) termCache.delete(termCache.keys().next().value as string);
      termCache.set(cacheKey, info);
    }
    res.json(info);
  });

  api.post('/tts', rateLimit('tts', 120), async (req, res) => {
    const text = cleanString(req.body?.text, 800);
    const voice = VOICES.includes(req.body?.voice) ? req.body.voice : 'Zephyr';
    if (!text) {
      res.status(400).json({ error: 'text_required' });
      return;
    }
    const audio = config.mock ? mockSpeech(text) : await synthesize(text, voice);
    res.json({ audio });
  });

  app.use('/api', api);
}

/** Deterministic summary used when the AI is unavailable (and in simulation mode). */
function summaryFromFacts(turns: TurnInput[], lang: string): ConversationSummary {
  const facts = localAnamnesis(turns, []);
  const pick = (c: FactCategory) => facts.filter((f) => f.category === c && !f.negated).map((f) => f.text);
  const complaints = pick('complaint');
  const doses = Array.from(
    new Set(
      turns.flatMap((t) =>
        Array.from(turkishText(t).matchAll(/\d+(?:[.,]\d+)?\s?(?:mg|ml|°C|mmHg|ünite)|\d{2,3}\/\d{2,3}/g)).map((m) => m[0]),
      ),
    ),
  );
  const meds = pick('medication');
  const patientTurns = turns.filter((t) => t.speaker === 'patient').length;
  const brief =
    complaints.length > 0
      ? `Hasta ${complaints.slice(0, 3).join(', ').toLocaleLowerCase('tr')} şikayetlerini bildirdi. Görüşmede ${turns.length} konuşma (${patientTurns} hasta) kaydedildi.`
      : `Görüşmede ${turns.length} konuşma (${patientTurns} hasta) kaydedildi.`;
  return {
    briefSummaryTr: brief,
    patientChiefComplaints: complaints,
    patientNeedsAndRequests: pick('need'),
    clinicalInstructions: pick('instruction'),
    vitalSignsAndDosages: [...meds, ...doses.filter((d) => !meds.some((m) => m.includes(d)))],
    actionItems: pick('instruction').filter((i) => /(?:acağ|eceğ|gerek|lazım)/u.test(i)),
    targetLanguage: lang,
    timestamp: Date.now(),
  };
}
