import { describe, expect, it } from 'vitest';
import { appendFragment, normalizeTranscript } from '../shared/normalize';

const tr = (s: string) => normalizeTranscript(s, 'tr', { final: true });

describe('normalizeTranscript (Turkish)', () => {
  it.each([
    ['ağrınızvarmı', 'Ağrınız var mı?'],
    ['Kanbasıncınız yüksek', 'Kan basıncınız yüksek.'],
    ['alırmısınız ilacı', 'Alır mısınız ilacı?'],
    ['tansyonum yüksek ve agrim var', 'Tansiyonum yüksek ve ağrım var.'],
    ['ateşim 38,5 derece', 'Ateşim 38,5 °C.'],
    ['500mgparol aldım', '500 mg parol aldım.'],
    ['ben ben ben gittim', 'Ben gittim.'],
    ['ııı şey başım dönüyor', 'Başım dönüyor.'],
    ['merhaba.bugün nasılsınız', 'Merhaba. Bugün nasılsınız?'],
    ['sigara içiyormusunuz', 'Sigara içiyor musunuz?'],
    ['iyimisiniz', 'İyi misiniz?'],
    ['Geldimi doktor', 'Geldi mi doktor?'],
  ])('%s → %s', (input, expected) => {
    expect(tr(input)).toBe(expected);
  });

  it.each(['Yardımı unutmayın', 'yirmi yaşındayım', 'duvar boyandı', '90 derece açı', 'yavaş yavaş yürüyün', 'Bir şey yok'])(
    'leaves real words alone: %s',
    (input) => {
      const out = tr(input);
      expect(out.toLowerCase().replace(/[.?]$/, '')).toBe(input.toLowerCase());
    },
  );

  it('is idempotent', () => {
    for (const s of ['ağrınızvarmı', 'merhaba.bugün nasılsınız', 'ateşim 38,5 derece', 'Kanbasıncınız yüksek']) {
      expect(tr(tr(s))).toBe(tr(s));
    }
  });

  it('does not add terminal punctuation while streaming', () => {
    expect(normalizeTranscript('başım ağrıyor', 'tr')).toBe('Başım ağrıyor');
  });
});

describe('normalizeTranscript (other languages)', () => {
  it('fixes spacing and capitalization', () => {
    expect(normalizeTranscript('i have pain .it hurts', 'en', { final: true })).toBe('I have pain. It hurts.');
    expect(normalizeTranscript('do you have allergies', 'en', { final: true })).toBe('Do you have allergies?');
  });
  it('keeps French spacing before high punctuation', () => {
    expect(normalizeTranscript('J ai mal , très mal !', 'fr', { final: true })).toBe('J ai mal, très mal !');
  });
  it('does not touch scripts without spaces', () => {
    expect(normalizeTranscript('头疼', 'zh', { final: true })).toBe('头疼');
  });
});

describe('appendFragment', () => {
  it('inserts a space at word boundaries the service glued', () => {
    expect(appendFragment(appendFragment('Ağrınız', 'var'), ' mı?')).toBe('Ağrınız var mı?');
  });
  it('accepts cumulative transcripts', () => {
    expect(appendFragment('Hello how', 'Hello how are you')).toBe('Hello how are you');
  });
  it('keeps decimals together', () => {
    expect(appendFragment('38.', '5 derece')).toBe('38.5 derece');
  });
  it('never adds spaces in Chinese', () => {
    expect(appendFragment('我头', '疼')).toBe('我头疼');
  });
});
