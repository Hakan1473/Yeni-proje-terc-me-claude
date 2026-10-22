import { cardTypeOf, type TermInfo, type TermKind } from '../shared/medical/terms';
import { classifySpeaker } from '../shared/speaker';
import { fold } from '../shared/text';
import type { FactCategory, Language, Speaker } from '../shared/types';
import { pcmToWav } from './ai';

/**
 * Simulation mode: lets the whole app run end-to-end without an API key
 * (demos, UI work, automated browser tests). Nothing here is used when a
 * real GEMINI_API_KEY is configured and MOCK_AI is not set.
 */

export interface ScriptTurn {
  speaker: Speaker;
  said: string;
  heard: string;
}

// A short ward conversation that exercises every feature: allergies, medication
// with dose, complaints with duration, chronic conditions, pain score, a deliberate dose mismatch
// (500 → 50) for the number guard, both tutorial videos, and a patient request.
export const DEMO_SCRIPT: ScriptTurn[] = [
  { speaker: 'nurse', said: 'Merhaba, ben hemşireniz Ayşe. Geçmiş olsun. Herhangi bir alerjiniz var mı?', heard: "Hello, I'm your nurse Ayşe. I hope you feel better soon. Do you have any allergies?" },
  { speaker: 'patient', said: "Yes, I'm allergic to penicillin. I take Beloc 50 mg every morning.", heard: 'Evet, penisiline alerjim var. Her sabah Beloc 50 mg kullanıyorum.' },
  { speaker: 'nurse', said: 'Anladım. Şikayetiniz nedir?', heard: 'I understand. What is your complaint?' },
  { speaker: 'patient', said: 'I have had chest pain for two days and I feel dizzy.', heard: 'İki gündür göğüs ağrım var ve başım dönüyor.' },
  { speaker: 'nurse', said: 'Kronik bir hastalığınız var mı?', heard: 'Do you have any chronic illnesses?' },
  { speaker: 'patient', said: 'I have high blood pressure and type 2 diabetes.', heard: 'Yüksek tansiyonum ve tip 2 diyabetim var.' },
  { speaker: 'nurse', said: 'Ağrınızı 1 ile 10 arasında puanlar mısınız?', heard: 'Could you rate your pain from 1 to 10?' },
  { speaker: 'patient', said: 'About seven.', heard: 'Yaklaşık yedi.' },
  { speaker: 'nurse', said: 'Şimdi size 500 mg Parol vereceğim ve damar yolu açacağım.', heard: 'I will now give you 50 mg of Parol and insert an IV line.' },
  { speaker: 'nurse', said: 'Bir şeye ihtiyacınız olursa lütfen yatağınızın yanındaki çağrı butonuna basın.', heard: 'If you need anything, please press the call button next to your bed.' },
  { speaker: 'patient', said: 'Could I have some water, please?', heard: 'Biraz su alabilir miyim lütfen?' },
  { speaker: 'nurse', said: 'Ameliyattan sonra Triflow cihazını saatte bir kez, 10 defa derin nefes çekerek kullanacaksınız.', heard: 'After the surgery, you will use the Triflow device once every hour, breathing in deeply 10 times.' },
];

export function mockTranslate(text: string, lang: Language, hint?: Speaker): { translation: string; speaker: Speaker } {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const hit = DEMO_SCRIPT.find((t) => norm(t.said) === norm(text) || norm(t.heard) === norm(text));
  if (hit) {
    const fromSaid = norm(hit.said) === norm(text);
    return { translation: fromSaid ? hit.heard : hit.said, speaker: fromSaid ? hit.speaker : hit.speaker === 'nurse' ? 'patient' : 'nurse' };
  }
  const speaker = hint ?? classifySpeaker(text, lang.code).speaker;
  return { translation: speaker === 'nurse' ? `[${lang.native}] ${text}` : `[Türkçe] ${text}`, speaker };
}

/**
 * Voice-like test signal: a few harmonics with a syllable-rate envelope.
 * Quiet on purpose; it only proves the audio path works.
 */
export function mockPcm(seconds: number, sampleRate = 24000): Buffer {
  const n = Math.max(1, Math.floor(seconds * sampleRate));
  const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const pitch = 170 + 25 * Math.sin(2 * Math.PI * 0.7 * t);
    const syllable = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4.5 * t) ** 2;
    const fade = Math.min(1, t / 0.05, (seconds - t) / 0.08);
    const v =
      (Math.sin(2 * Math.PI * pitch * t) + 0.5 * Math.sin(4 * Math.PI * pitch * t) + 0.25 * Math.sin(6 * Math.PI * pitch * t)) *
      syllable *
      Math.max(0, fade) *
      0.08;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2);
  }
  return buf;
}

export function mockSpeech(text: string): string {
  return pcmToWav(mockPcm(Math.min(4, 0.6 + text.length * 0.045))).toString('base64');
}

// Reference cards for the terms the demo conversation produces
const MOCK_TERMS: (Omit<TermInfo, 'term' | 'kind' | 'known'> & { match: string })[] = [
  {
    match: 'beloc',
    summary: 'Kalp hızını ve kan basıncını düşüren bir ilaçtır. Kalbin iş yükünü azaltır.',
    activeIngredient: 'Metoprolol süksinat',
    drugClass: 'Beta bloker',
    points: ['Hipertansiyon', 'Angina pektoris', 'Kalp ritim bozuklukları'],
    nursing: ['Uygulamadan önce nabız ve tansiyon ölçülmeli', 'Nabız 50/dk altındaysa hekime bildirilmeli', 'Ani bırakılmamalı'],
  },
  {
    match: 'penisilin',
    summary: 'Bakteriyel enfeksiyonların tedavisinde kullanılan beta-laktam grubu bir antibiyotiktir.',
    activeIngredient: 'Benzilpenisilin',
    drugClass: 'Beta-laktam antibiyotik',
    points: ['Boğaz enfeksiyonları', 'Sifiliz', 'Romatizmal ateş profilaksisi'],
    nursing: ['Alerjide anafilaksi riski: tüm penisilin türevlerinden kaçınılmalı', 'Sefalosporinlerle çapraz reaksiyon olabilir', 'Alerji bilekliği takılmalı'],
  },
  {
    match: 'hipertansiyon',
    summary: 'Kan basıncının sürekli olarak 140/90 mmHg ve üzerinde seyretmesidir. Kalp, beyin ve böbrek hastalıkları için önemli bir risk etkenidir.',
    points: ['Çoğu zaman belirti vermez', 'Baş ağrısı, ense ağrısı', 'Baş dönmesi, burun kanaması'],
    nursing: ['Tansiyon düzenli aralıklarla izlenmeli', '180/110 üzeri değerler hekime bildirilmeli', 'Tuz kısıtlaması hatırlatılmalı'],
  },
  {
    match: 'tip 2 diyabet',
    summary: 'Vücudun insüline yeterli yanıt verememesi sonucu kan şekerinin yükseldiği kronik bir metabolizma hastalığıdır.',
    points: ['Çok su içme, sık idrara çıkma', 'Yorgunluk', 'Yaraların geç iyileşmesi'],
    nursing: ['Kan şekeri takibi yapılmalı', 'Hipoglisemi belirtileri izlenmeli', 'Ayak bakımı ve cilt bütünlüğü kontrol edilmeli'],
  },
  {
    match: 'gogus agrisi',
    summary: 'Göğüs bölgesinde hissedilen ağrıdır. Kalp, akciğer, kas-iskelet veya sindirim sistemi kaynaklı olabilir.',
    points: ['Baskı, sıkışma veya yanma hissi', 'Kola, çeneye, sırta yayılabilir', 'Terleme, nefes darlığı eşlik edebilir'],
    nursing: ['Hemen EKG çekilmeli ve vital bulgular alınmalı', 'Ağrının yeri, süresi ve yayılımı sorulmalı', 'Hekime ivedi bildirilmeli'],
  },
  {
    match: 'bas donmesi',
    summary: 'Dengesizlik, sersemlik veya çevrenin dönüyormuş gibi hissedilmesidir.',
    points: ['Sersemlik, bayılacak gibi olma', 'Dengesizlik', 'Bulantı eşlik edebilir'],
    nursing: ['Düşme riskine karşı önlem alınmalı', 'Tansiyon ve kan şekeri kontrol edilmeli', 'Ayağa kalkarken yardım edilmeli'],
  },
];

const MOCK_PENICILLIN_ALLERGY: Omit<TermInfo, 'term' | 'kind' | 'known'> = {
  summary: 'Penisilin grubu beta-laktam antibiyotiklere alerji. Aynı halka yapısını taşıyan diğer antibiyotiklerle çapraz reaksiyon görülebilir.',
  drugClass: 'Beta-laktam antibiyotikler',
  crossReactions: ['Amoksisilin (Augmentin, Largopen) — yüksek risk', 'Ampisilin (Alfasilin) — yüksek risk', 'Sefalosporinler (Sefazolin, Seftriakson) — düşük-orta risk'],
  avoidList: ['Penisilin içeren kombinasyon preparatları'],
  reactionSigns: ['Kurdeşen, kaşıntı', 'Dudak ve dilde şişlik', 'Hırıltı, nefes darlığı', 'Tansiyon düşmesi (anafilaksi)'],
  nursing: ['Alerji bilekliği takılmalı', 'Antibiyotik orderları hekimle kontrol edilmeli', 'Acil set hazır olmalı'],
};

export function mockTerm(term: string, kind: TermKind, category?: FactCategory): TermInfo {
  const f = fold(term);
  if (cardTypeOf({ kind, category }) === 'allergy' && f.includes('penisilin')) {
    return { term, kind, category, known: true, origin: 'demo', ...MOCK_PENICILLIN_ALLERGY };
  }
  const hit = MOCK_TERMS.find((t) => f.includes(t.match));
  if (hit) {
    const { match: _match, ...card } = hit;
    return { term, kind, known: true, origin: 'demo', ...card };
  }
  return {
    term,
    kind,
    known: true,
    origin: 'demo',
    summary: 'Simülasyon modunda bu terim için örnek bilgi yok. Gerçek API anahtarıyla yapay zekâ burada internetten doğrulanmış kısa bir açıklama gösterir.',
  };
}
