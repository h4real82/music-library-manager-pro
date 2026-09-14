import { describe, it, expect } from 'vitest';
import { getCamelotColor, CAMELOT_KEY_COLORS, analyzeTrackStructureForMix, generateHarmonizedSet } from './djMixerLogic';

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

describe('analyzeTrackStructureForMix', () => {
  it('should detect cues, breakdowns and outro positions', () => {
    const track = {
      id: 'trk-1',
      title: 'Deep Groove',
      artist: 'DJ Antigravity',
      bpm: 128,
      key: '8A',
      duration: 180,
      hotCues: [
        { slot: 1, name: 'Intro', timeMs: 0 },
        { slot: 4, name: 'Main Drop', timeMs: 30000 },
        { slot: 8, name: 'Outro Mix', timeMs: 150000 },
      ],
    };

    const struct = analyzeTrackStructureForMix(track as any, 128);
    expect(struct.dropSec).toBe(30);
    expect(struct.outroSec).toBeGreaterThan(120);
  });

  it('should detect quiet breakdown from segments if available', () => {
    const track = {
      id: 'trk-2',
      title: 'Melodic Journey',
      artist: 'Artist',
      bpm: 120,
      key: '9A',
      duration: 240,
      segments: [
        { id: 's1', name: 'Intro', startSec: 0, endSec: 96, duration: 96, energy: 6, key: '9A', color: '#fff' },
        { id: 's2', name: 'Breakdown Melody', startSec: 96, endSec: 144, duration: 48, energy: 3, key: '9A', color: '#fff' },
        { id: 's3', name: 'Drop', startSec: 48, endSec: 96, duration: 48, energy: 9, key: '9A', color: '#fff' },
      ],
    };

    const struct = analyzeTrackStructureForMix(track as any, 120);
    expect(struct.breakdownSec).toBe(96);
    expect(struct.dropSec).toBe(48);
  });
});

describe('generateHarmonizedSet', () => {
  it('should generate harmonized sequence with diverse transitions, tempoSync, and envelopes', () => {
    const tracks = [
      {
        id: '1',
        title: 'Track One',
        artist: 'Artist A',
        bpm: 126,
        key: '8A',
        energy: 5,
        duration: 200,
        hotCues: [{ slot: 8, name: 'Outro', timeMs: 160000 }],
      },
      {
        id: '2',
        title: 'Track Two',
        artist: 'Artist B',
        bpm: 128,
        key: '9A', // Harmonic step +1
        energy: 7,
        duration: 220,
        hotCues: [
          { slot: 1, name: 'Intro', timeMs: 0 },
          { slot: 2, name: 'Drop', timeMs: 15000 },
        ],
      },
      {
        id: '3',
        title: 'Track Three',
        artist: 'Artist C',
        bpm: 124,
        key: '9B', // Relative major
        energy: 4,
        duration: 180,
      },
    ];

    const result = generateHarmonizedSet(tracks as any);
    expect(result.orderedTracks.length).toBe(3);
    expect(result.transitions.length).toBe(2);

    result.transitions.forEach(tr => {
      expect(tr.tempoSync).toBe(true);
      expect(tr.durationSec).toBeGreaterThan(0);
      expect(tr.envelopes).toBeDefined();
      expect(tr.envelopes.volumeA.length).toBeGreaterThan(0);
      expect(tr.envelopes.volumeB.length).toBeGreaterThan(0);
    });

    // Check that first transition has targetBpm and pitchShiftPercent defined
    const tr1 = result.transitions[0];
    expect(tr1.targetBpm).toBeDefined();
    expect(tr1.pitchShiftPercent).toBeDefined();
  });
});

