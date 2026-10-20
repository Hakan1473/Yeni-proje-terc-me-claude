import { describe, expect, it } from 'vitest';
import { checkNumbers, extractNumbers } from '../shared/numbers';

describe('extractNumbers', () => {
  it('reads digits, decimals, blood pressure and clock times', () => {
    expect(extractNumbers('Ateş 38,5, tansiyon 120/80, saat 08:00', 'tr')).toEqual([8, 38.5, 80, 120]);
  });
  it('reads Turkish number words next to units', () => {
    expect(extractNumbers('Günde iki kez beş yüz miligram', 'tr')).toEqual([2, 500]);
    expect(extractNumbers('İki buçuk tablet', 'tr')).toEqual([2.5]);
  });
  it('ignores Turkish words that only look like numbers', () => {
    expect(extractNumbers('Bugün yemek yedi mi?', 'tr')).toEqual([]);
    expect(extractNumbers('Bir tablet alın', 'tr')).toEqual([]);
  });
  it('reads English number words next to units', () => {
    expect(extractNumbers('Take five hundred milligrams twice, two and a half tablets', 'en')).toEqual([2.5, 500]);
    expect(extractNumbers('Put it on the table', 'en')).toEqual([]);
  });
});

describe('checkNumbers', () => {
  it('passes a faithful translation', () => {
    expect(checkNumbers('Günde iki kez 500 mg Parol alın.', 'tr', 'Take 500 mg of Parol twice a day, two times.', 'en')).toBeUndefined();
    expect(checkNumbers('Ateşiniz 38,5 derece.', 'tr', 'Your temperature is 38.5 degrees.', 'en')).toBeUndefined();
  });
  it('flags a changed dose', () => {
    expect(checkNumbers('500 mg Parol alın.', 'tr', 'Take 50 mg of Parol.', 'en')).toEqual({ missing: [500], extra: [50] });
  });
  it('flags a dropped number', () => {
    expect(checkNumbers('Tansiyonunuz 140/90.', 'tr', 'Your blood pressure is high.', 'en')).toEqual({ missing: [90, 140], extra: [] });
  });
  it('stays silent when the other side cannot be read', () => {
    expect(checkNumbers('500 mg Parol alın.', 'tr', 'Примите пятьсот миллиграммов парола.', 'ru')).toBeUndefined();
  });
});
