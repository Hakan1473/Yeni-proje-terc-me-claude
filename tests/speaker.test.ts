import { describe, expect, it } from 'vitest';
import { classifySpeaker, fuseSpeaker } from '../shared/speaker';

const nurse: [string, string][] = [
  ['Ağrınız var mı?', 'az'],
  ['Başınız ağrıyor mu?', 'az'],
  ['Kolunuzu düz tutun lütfen', 'ku'],
  ['Derin nefes alın', 'tk'],
  ['Tansiyonunuzu ölçeceğim', 'ru'],
  ['En çok nereniz ağrıyor?', 'da'],
  ['Ben de anladım', 'fr'],
  ['Tamam', 'en'],
  ['Şimdi damar yolu açacağım, biraz acıyabilir', 'uz'],
  ['Merhaba, ben hemşireniz. Nasılsınız?', 'en'],
  ['İlaçlarınızı yemekten sonra için', 'de'],
];

const patient: [string, string][] = [
  ['Serê min diêşe, ez nikarim bêhna xwe bistînim', 'ku'],
  ['Ez şekir û tansiyonê heye', 'ku'],
  ['Mənim başım çox ağrıyır, ürəyim bulanır', 'az'],
  ['Başym agyrýar, ýüregim bulanýar', 'tk'],
  ['Boshim ogʻriyapti', 'uz'],
  ['Okay, thank you', 'en'],
  ['I have chest pain since yesterday', 'en'],
  ['Ich habe Schmerzen in der Brust', 'de'],
  ['У меня болит голова', 'ru'],
  ['أشعر بألم في صدري', 'ar'],
  ['J’ai mal à la tête depuis deux jours', 'fr'],
  ['Me duele mucho la cabeza', 'es'],
  ['Hasta mañana', 'es'],
  ['Saya sakit kepala', 'id'],
  ['頭が割れるように痛いです', 'ja'],
  ['我头疼', 'zh'],
  ['Boli me glava', 'hr'],
];

describe('classifySpeaker', () => {
  it.each(nurse)('nurse: %s (%s)', (text, lang) => {
    expect(classifySpeaker(text, lang).speaker).toBe('nurse');
  });

  it.each(patient)('patient: %s (%s)', (text, lang) => {
    expect(classifySpeaker(text, lang).speaker).toBe('patient');
  });

  it('is unsure about language-neutral text', () => {
    expect(classifySpeaker('Parol 500 mg', 'en').confidence).toBeLessThan(0.6);
  });
});

describe('fuseSpeaker', () => {
  it('uses the translation language when the source is ambiguous', () => {
    // A Turkish translation means the patient spoke
    expect(fuseSpeaker('Parol 500 mg', 'Parol 500 mg kullanıyorum.', 'en').speaker).toBe('patient');
    expect(fuseSpeaker('Parol 500 mg', 'I take Parol 500 mg.', 'en').speaker).toBe('nurse');
  });
});
