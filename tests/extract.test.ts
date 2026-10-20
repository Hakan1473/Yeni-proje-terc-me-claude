import { describe, expect, it } from 'vitest';
import { canonicalKey, DialogueState, extractFacts } from '../shared/medical/extract';
import type { Fact, Speaker } from '../shared/types';

function dialogue(lines: [Speaker, string][]): Fact[] {
  const state = new DialogueState();
  return lines.flatMap(([speaker, text], i) => extractFacts({ id: String(i), speaker, text, at: 1000 + i }, state));
}

const view = (facts: Fact[]) => facts.map((f) => `${f.category}${f.negated ? '!' : ''}: ${f.text}`);

describe('extractFacts', () => {
  it('extracts allergies and medications from one answer', () => {
    const facts = dialogue([
      ['nurse', 'Herhangi bir alerjiniz var mı?'],
      ['patient', 'Evet, penisiline alerjim var. Ama aspirin kullanıyorum.'],
    ]);
    expect(view(facts)).toEqual(['allergy: Penisilin', 'medication: Aspirin (asetilsalisilik asit)']);
    expect(facts[0].pinned).toBe(true);
  });

  it('never turns food or medication mentions into allergies without an allergy cue', () => {
    expect(view(dialogue([['patient', 'Kahvaltıda yumurta yedim ve her gün aspirin kullanıyorum.']]))).toEqual([
      'medication: Aspirin (asetilsalisilik asit)',
    ]);
  });

  it('keeps dose and frequency with the right drug', () => {
    expect(view(dialogue([['patient', 'Beloc 50 mg sabahları ve Glifor 1000 mg günde iki kez kullanıyorum.']]))).toEqual([
      'medication: Beloc (metoprolol) 50 mg · sabahları',
      'medication: Glifor (metformin) 1000 mg · günde iki kez',
    ]);
  });

  it('recognizes misheard brand names inside a medication context', () => {
    expect(view(dialogue([['patient', 'Ogmentin kullanıyorum.']]))).toEqual(['medication: Augmentin (amoksisilin-klavulanat)']);
    expect(view(dialogue([['patient', 'Parolamı unuttum.']]))).toEqual([]);
  });

  it('matches Turkish complaints with Turkish letters at word edges', () => {
    expect(view(dialogue([['patient', 'Göğüs ağrım var ve bulantı oldu.']]))).toEqual(['complaint: Göğüs ağrısı', 'complaint: Bulantı']);
  });

  it('scopes negation to its clause and keeps persistence verbs positive', () => {
    expect(view(dialogue([['patient', 'Üç gündür başım ağrıyor. Ateşim yok. Ağrım geçmiyor.']]))).toEqual([
      'complaint: Baş ağrısı (üç gündür)',
      'complaint!: Ateş',
    ]);
    expect(view(dialogue([['patient', 'Penisiline alerjim var, başka alerjim yok.']]))).toEqual([
      'allergy: Penisilin',
      'allergy!: Bilinen alerji yok',
    ]);
  });

  it('applies a negation to every drug in a comma list', () => {
    expect(view(dialogue([['patient', 'Parol, Beloc kullanmıyorum.']]))).toEqual([
      'medication!: Parol (parasetamol)',
      'medication!: Beloc (metoprolol)',
    ]);
  });

  it('treats inability verbs that describe a symptom as positive', () => {
    expect(view(dialogue([['patient', 'Nefes alamıyorum, su verebilir misiniz?']]))).toEqual([
      'complaint: Nefes darlığı',
      'need: Su istiyor',
    ]);
  });

  it('reads short answers through the previous question', () => {
    expect(view(dialogue([['nurse', 'Şeker hastası mısınız?'], ['patient', 'Evet.']]))).toEqual(['chronic: Diyabet (şeker hastalığı)']);
    expect(view(dialogue([['nurse', 'Alerjiniz var mı?'], ['patient', 'Penisilin.']]))).toEqual(['allergy: Penisilin']);
    expect(view(dialogue([['nurse', 'Alerjiniz var mı?'], ['patient', 'Hayır.']]))).toEqual(['allergy!: Bilinen alerji yok']);
    expect(view(dialogue([['nurse', 'Penisiline alerjiniz var mı?'], ['patient', 'Hayır, ama her gün aspirin kullanıyorum.']]))).toEqual([
      'medication: Aspirin (asetilsalisilik asit)',
      'allergy!: Penisilin',
    ]);
    // A long answer that merely mentions a drug does not turn it into an allergy
    expect(
      view(dialogue([['nurse', 'Alerjiniz var mı?'], ['patient', 'Bilmiyorum, geçen yıl doktor bana aspirin önermişti sanırım']])).filter((f) =>
        f.startsWith('allergy'),
      ),
    ).toEqual([]);
    // Naming drugs in reply to an allergy question lists allergies, even without "I am allergic"
    expect(view(dialogue([['nurse', 'İlaç alerjiniz var mı?'], ['patient', 'Evet. Amlodis, Avil.']]))).toEqual([
      'allergy: Amlodis (amlodipin)',
      'allergy: Avil (feniramin)',
    ]);
    expect(view(dialogue([['nurse', 'Herhangi bir alerjiniz var mı?'], ['patient', 'Evet, Xyzal ve çilek.']]))).toEqual([
      'allergy: Xyzal',
      'allergy: Çilek',
    ]);
    expect(view(dialogue([['nurse', 'Alerjiniz var mı?'], ['patient', 'Evet, penisiline.']]))).toEqual(['allergy: Penisilin']);
    // Taking a drug is still a medication
    expect(view(dialogue([['nurse', 'Alerjiniz var mı?'], ['patient', 'Yok, ama Avil kullanıyorum.']]))).toEqual([
      'medication: Avil (feniramin)',
      'allergy!: Bilinen alerji yok',
    ]);
    expect(view(dialogue([['nurse', 'Ağrınızı 1 ile 10 arasında puanlar mısınız?'], ['patient', 'Yedi.']]))).toEqual([
      'complaint: Ağrı şiddeti: 7/10',
    ]);
    expect(view(dialogue([['nurse', 'Sigara içiyor musunuz?'], ['patient', 'Hayır.']]))).toEqual(['habit!: Sigara kullanmıyor']);
  });

  it('assigns family history to the nearest family member', () => {
    expect(view(dialogue([['patient', 'Babamda kalp krizi, annemde diyabet var.']]))).toEqual([
      'family: Anne: Diyabet (şeker hastalığı)',
      'family: Baba: Kalp krizi',
    ]);
  });

  it('captures surgeries with their year and ignores planned ones', () => {
    expect(view(dialogue([['patient', '2018 yılında safra kesemi aldırdım.']]))).toEqual([
      'surgery: Kolesistektomi (safra kesesi ameliyatı) (2018)',
    ]);
    // A planned operation is information for the patient, not surgical history
    expect(view(dialogue([['nurse', 'Yarın safra kesesi ameliyatı olacaksınız.']]))).toEqual([
      'instruction: Yarın safra kesesi ameliyatı olacaksınız.',
    ]);
  });

  it('records smoking status including quitting', () => {
    expect(view(dialogue([['patient', 'Sigarayı beş yıl önce bıraktım.']]))).toEqual(['habit: Sigarayı bırakmış (beş yıl önce)']);
    expect(view(dialogue([['patient', 'Günde 1 paket sigara içiyorum, 20 yıldır.']]))).toEqual(['habit: Sigara: günde 1 paket, 20 yıldır']);
  });

  it('turns nurse imperatives and plans into instructions, skipping small talk', () => {
    expect(
      view(dialogue([['nurse', 'Merhaba. Kolunuzu düz tutun. Şimdi damar yolu açacağım. Merak etmeyin.']])),
    ).toEqual(['instruction: Kolunuzu düz tutun.', 'instruction: Şimdi damar yolu açacağım.']);
    expect(view(dialogue([['nurse', 'Triflow cihazını saatte bir kez kullanacaksınız.']]))).toEqual([
      'instruction: Triflow cihazını saatte bir kez kullanacaksınız.',
    ]);
  });

  it('does not treat the nurse giving a drug as the patient’s home medication', () => {
    expect(view(dialogue([['nurse', 'Size şimdi Parol vereceğim.']])).filter((f) => f.startsWith('medication'))).toEqual([]);
  });
});

describe('canonicalKey', () => {
  it('maps AI wording onto local keys', () => {
    expect(canonicalKey('medication', 'Parol 500 mg')).toBe('medication:parasetamol');
    expect(canonicalKey('chronic', 'Tip 2 Diyabet')).toBe('chronic:tip 2 diyabet');
    expect(canonicalKey('allergy', 'Penisilin')).toBe('allergy:penisilin');
    // Turkish letters in the body site, and the duration the display text carries
    expect(canonicalKey('complaint', 'Göğüs ağrısı (iki gündür)')).toBe(dialogue([['patient', 'Göğüs ağrım var.']])[0].key);
    expect(canonicalKey('complaint', 'Baş ağrısı')).toBe('complaint:bas agrisi');
  });
});
