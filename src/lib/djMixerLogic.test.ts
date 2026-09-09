import { describe, it, expect } from 'vitest';
import { getCamelotColor, CAMELOT_KEY_COLORS } from './djMixerLogic';

describe('getCamelotColor', () => {
  describe('Standard Camelot Keys', () => {
    it('should return correct color for valid Camelot key (uppercase)', () => {
      expect(getCamelotColor('8A')).toBe('#EF4444');
      expect(getCamelotColor('11B')).toBe('#8B5CF6');
      expect(getCamelotColor('12B')).toBe('#3B82F6');
      expect(getCamelotColor('1A')).toBe('#06B6D4');
      expect(getCamelotColor('5B')).toBe('#EAB308');
    });

    it('should return correct colors for every mapped Camelot key in CAMELOT_KEY_COLORS', () => {
      Object.entries(CAMELOT_KEY_COLORS).forEach(([key, expectedColor]) => {
        expect(getCamelotColor(key)).toBe(expectedColor);
      });
    });
  });

  describe('Key Normalization', () => {
    it('should handle lowercase Camelot keys', () => {
      expect(getCamelotColor('8a')).toBe('#EF4444');
      expect(getCamelotColor('11b')).toBe('#8B5CF6');
      expect(getCamelotColor('12a')).toBe('#3B82F6');
    });

    it('should handle Camelot keys with leading/trailing whitespace or zeroes', () => {
      expect(getCamelotColor('  8A  ')).toBe('#EF4444');
      expect(getCamelotColor('08A')).toBe('#EF4444');
      expect(getCamelotColor(' 01b ')).toBe('#06B6D4');
    });

    it('should map musical key notations (e.g. Am, C, F#) to their Camelot color', () => {
      expect(getCamelotColor('Am')).toBe('#EF4444'); // 8A
      expect(getCamelotColor('C')).toBe('#EF4444');  // 8B
      expect(getCamelotColor('F#')).toBe('#0D9488'); // 2B
      expect(getCamelotColor('Fm')).toBe('#84CC16'); // 4A
      expect(getCamelotColor('C#m')).toBe('#3B82F6'); // 12A
      expect(getCamelotColor('Gmaj')).toBe('#EC4899'); // 9B -> Gmaj
    });

    it('should handle Rekordbox / OpenKey formats (e.g. 10m, 7d)', () => {
      expect(getCamelotColor('10m')).toBe('#D946EF'); // 10A
      expect(getCamelotColor('7d')).toBe('#F97316');  // 7B
    });
  });

  describe('Edge Cases and Fallbacks', () => {
    it('should return default fallback color (#A855F7) when key is undefined or null', () => {
      expect(getCamelotColor(undefined)).toBe('#A855F7');
      // @ts-ignore testing JavaScript runtime null pass
      expect(getCamelotColor(null)).toBe('#A855F7');
    });

    it('should return default fallback color (#A855F7) for empty or whitespace strings', () => {
      expect(getCamelotColor('')).toBe('#A855F7');
      expect(getCamelotColor('   ')).toBe('#A855F7');
    });

    it('should return default fallback color (#A855F7) for placeholder values', () => {
      expect(getCamelotColor('-')).toBe('#A855F7');
      expect(getCamelotColor('?')).toBe('#A855F7');
      expect(getCamelotColor('unknown')).toBe('#A855F7');
      expect(getCamelotColor('UNKNOWN')).toBe('#A855F7');
    });

    it('should return default fallback color (#A855F7) for invalid or unmapped key strings', () => {
      expect(getCamelotColor('INVALID_KEY')).toBe('#A855F7');
      expect(getCamelotColor('XYZ123')).toBe('#A855F7');
      expect(getCamelotColor('99Z')).toBe('#A855F7');
    });
  });
});
