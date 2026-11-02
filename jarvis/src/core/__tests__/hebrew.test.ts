import { normalizePhone, parseDurationSeconds, similarity, stripFiller } from '../agent/hebrew';

describe('hebrew helpers', () => {
  it('normalizes Israeli phone numbers', () => {
    expect(normalizePhone('050-123 4567')).toBe('972501234567');
    expect(normalizePhone('+972 50 123 4567')).toBe('972501234567');
    expect(normalizePhone('00972501234567')).toBe('972501234567');
    expect(normalizePhone('123')).toBeNull();
  });
  it('parses durations', () => {
    expect(parseDurationSeconds('רבע שעה')).toBe(900);
    expect(parseDurationSeconds('3 שעות')).toBe(10800);
    expect(parseDurationSeconds('עשרים וחמש דקות')).toBe(1500);
    expect(parseDurationSeconds('דקה וחצי')).toBe(90);
    expect(parseDurationSeconds('שתי דקות וחצי')).toBe(150);
  });
  it('fuzzy-matches names', () => {
    expect(similarity('וואטסאפ', 'ווטסאפ')).toBeGreaterThan(0.8);
    expect(similarity('אמא', 'אמא ❤️')).toBeGreaterThan(0.6);
    expect(similarity('יוטיוב', 'ספוטיפיי')).toBeLessThan(0.5);
  });
  it('strips filler words', () => {
    expect(stripFiller("היי ג'רוויס, פתח וואטסאפ בבקשה!")).toBe('פתח וואטסאפ');
  });
});
