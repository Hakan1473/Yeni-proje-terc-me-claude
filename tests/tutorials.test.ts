import { describe, expect, it } from 'vitest';
import { detectTutorial } from '../shared/tutorials';

describe('detectTutorial', () => {
  it.each([
    ['Merhabalar, hemşire çağrı butonunu kullanarak beni istediğiniz zaman çağırabilirsiniz.', 'nurse_call'],
    ['Herhangi bir şikayetiniz olursa lütfen çağrı butonuna basın.', 'nurse_call'],
    ['Yataktan kalkmadan önce bu butona basarak bize haber verin.', 'nurse_call'],
    ['Herhangi bir şikayetiniz var mı? Olursa çağrı butonuna basın.', 'nurse_call'],
    ['Triflow cihazını bu şekilde ağzınıza alıp derin nefes çekerek kullanacaksınız.', 'triflow'],
    ['Solunum egzersiz cihazını saatte bir kez 10 defa çekin.', 'triflow'],
    ['Triflow ile derin nefes alıp üç topu da havada tutmaya çalışın.', 'triflow'],
  ])('teaching: %s', (text, kind) => {
    expect(detectTutorial(text)).toBe(kind);
  });

  it.each([
    'Beni hemşire çağrı butonunu kullanarak siz mi çağırdınız?',
    'Hemşire çağrı butonunu siz mi aktif ettiniz?',
    'Hemşire çağrı butonu bozuldu mu?',
    'Triflow cihazını kullanıyor musunuz?',
    'Triflow cihazını en son ne zaman kullandınız?',
    'Triflow nerede?',
    'Derin nefes alın.',
  ])('not teaching: %s', (text) => {
    expect(detectTutorial(text)).toBeUndefined();
  });

  it('also reads the translation', () => {
    expect(detectTutorial('…', 'Please press the call button whenever you need help.')).toBe('nurse_call');
  });
});
