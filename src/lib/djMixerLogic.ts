import { EnvelopePoint, TransitionEnvelopes, TransitionPresetType, TrackDef, TransitionConfig } from '../types';
import { getTrackWaveformSlice } from './waveformGenerator';

export interface KeyCompatibilityResult {
  score: number; // 0 to 100
  label: string;
  type: 'perfect' | 'adjacent' | 'relative' | 'clash';
  description: string;
}

// Full mapping of musical notes to standard Camelot codes
export const MUSICAL_KEY_TO_CAMELOT: Record<string, string> = {
  // Minor Keys (Camelot A)
  'ABM': '1A', 'G#M': '1A', 'ABMIN': '1A', 'G#MIN': '1A', 'ABMINOR': '1A', 'G#MINOR': '1A', 'ABMOLL': '1A', 'G#MOLL': '1A',
  'EBM': '2A', 'D#M': '2A', 'EBMIN': '2A', 'D#MIN': '2A', 'EBMINOR': '2A', 'D#MINOR': '2A', 'EBMOLL': '2A', 'D#MOLL': '2A',
  'BBM': '3A', 'A#M': '3A', 'BBMIN': '3A', 'A#MIN': '3A', 'BBMINOR': '3A', 'A#MINOR': '3A', 'BBMOLL': '3A', 'A#MOLL': '3A',
  'FM': '4A', 'FMIN': '4A', 'FMINOR': '4A', 'FMOLL': '4A',
  'CM': '5A', 'CMIN': '5A', 'CMINOR': '5A', 'CMOLL': '5A',
  'GM': '6A', 'GMIN': '6A', 'GMINOR': '6A', 'GMOLL': '6A',
  'DM': '7A', 'DMIN': '7A', 'DMINOR': '7A', 'DMOLL': '7A',
  'AM': '8A', 'AMIN': '8A', 'AMINOR': '8A', 'AMOLL': '8A',
  'EM': '9A', 'EMIN': '9A', 'EMINOR': '9A', 'EMOLL': '9A',
  'BM': '10A', 'BMIN': '10A', 'BMINOR': '10A', 'BMOLL': '10A', 'HM': '10A', 'HMIN': '10A', 'HMINOR': '10A', 'HMOLL': '10A',
  'F#M': '11A', 'GBM': '11A', 'F#MIN': '11A', 'GBMIN': '11A', 'F#MINOR': '11A', 'GBMINOR': '11A', 'F#MOLL': '11A', 'GBMOLL': '11A',
  'DBM': '12A', 'C#M': '12A', 'DBMIN': '12A', 'C#MIN': '12A', 'DBMINOR': '12A', 'C#MINOR': '12A', 'DBMOLL': '12A', 'C#MOLL': '12A',

  // Major Keys (Camelot B)
  'B': '1B', 'BMAJ': '1B', 'BMAJOR': '1B', 'BDUR': '1B', 'H': '1B', 'HMAJ': '1B', 'HMAJOR': '1B', 'HDUR': '1B',
  'F#': '2B', 'GB': '2B', 'F#MAJ': '2B', 'GBMAJ': '2B', 'F#MAJOR': '2B', 'GBMAJOR': '2B', 'F#DUR': '2B', 'GBDUR': '2B',
  'DB': '3B', 'C#': '3B', 'DBMAJ': '3B', 'C#MAJ': '3B', 'DBMAJOR': '3B', 'C#MAJOR': '3B', 'DBDUR': '3B', 'C#DUR': '3B',
  'AB': '4B', 'G#': '4B', 'ABMAJ': '4B', 'G#MAJ': '4B', 'ABMAJOR': '4B', 'G#MAJOR': '4B', 'ABDUR': '4B', 'G#DUR': '4B',
  'EB': '5B', 'D#': '5B', 'EBMAJ': '5B', 'D#MAJ': '5B', 'EBMAJOR': '5B', 'D#MAJOR': '5B', 'EBDUR': '5B', 'D#DUR': '5B',
  'BB': '6B', 'A#': '6B', 'BBMAJ': '6B', 'A#MAJ': '6B', 'BBMAJOR': '6B', 'A#MAJOR': '6B', 'BBDUR': '6B', 'A#DUR': '6B',
  'F': '7B', 'FMAJ': '7B', 'FMAJOR': '7B', 'FDUR': '7B',
  'C': '8B', 'CMAJ': '8B', 'CMAJOR': '8B', 'CDUR': '8B',
  'G': '9B', 'GMAJ': '9B', 'GMAJOR': '9B', 'GDUR': '9B',
  'D': '10B', 'DMAJ': '10B', 'DMAJOR': '10B', 'DDUR': '10B',
  'A': '11B', 'AMAJ': '11B', 'AMAJOR': '11B', 'ADUR': '11B',
  'E': '12B', 'EMAJ': '12B', 'EMAJOR': '12B', 'EDUR': '12B',
};

// Pre-populated caches for high-throughput Camelot normalization and parsing
const CAMELOT_NORM_CACHE = new Map<string, string | null>();
const CAMELOT_PARSE_CACHE = new Map<string, { num: number; letter: string } | null>();

for (let i = 1; i <= 12; i++) {
  const kA = `${i}A`;
  const kB = `${i}B`;
  CAMELOT_NORM_CACHE.set(kA, kA);
  CAMELOT_NORM_CACHE.set(kB, kB);
  CAMELOT_NORM_CACHE.set(`${i}a`, kA);
  CAMELOT_NORM_CACHE.set(`${i}b`, kB);
  CAMELOT_NORM_CACHE.set(i < 10 ? `0${i}A` : `${i}A`, kA);
  CAMELOT_NORM_CACHE.set(i < 10 ? `0${i}B` : `${i}B`, kB);
  CAMELOT_PARSE_CACHE.set(kA, { num: i, letter: 'A' });
  CAMELOT_PARSE_CACHE.set(kB, { num: i, letter: 'B' });
}

/**
 * Normalizes any key representation (Camelot e.g. '8A', Rekordbox/OpenKey e.g. '10m'/'7d',
 * or Musical Notes e.g. 'Am', 'C#m', 'F#') into standard Camelot format (e.g. '8A', '8B', '12A', '1B').
 */
export function normalizeToCamelot(key?: string | null): string | null {
  if (!key) return null;
  const cached = CAMELOT_NORM_CACHE.get(key);
  if (cached !== undefined) return cached;

  const raw = key.trim();
  if (!raw || raw === '-' || raw === '?' || raw.toLowerCase() === 'unknown') {
    CAMELOT_NORM_CACHE.set(key, null);
    return null;
  }

  // 1. Check for Camelot / Rekordbox / OpenKey pattern: 1-12 followed by A/B or M/D (case insensitive)
  // e.g. "8A", "8a", "08A", "10m", "7d", "12M", "1D", "8 A", "8-A", "8A / Am"
  const numLetterMatch = raw.match(/\b0?([1-9]|1[0-2])\s*[-/]?\s*([ABMDabmd])\b/);
  if (numLetterMatch) {
    const num = parseInt(numLetterMatch[1], 10);
    const char = numLetterMatch[2].toUpperCase();
    const letter = (char === 'M' || char === 'A') ? 'A' : 'B';
    const res = `${num}${letter}`;
    CAMELOT_NORM_CACHE.set(key, res);
    return res;
  }

  // 2. Fast lookup for musical note strings
  const clean = raw.toUpperCase()
    .replace(/[^A-Z0-9#]/g, '')
    .replace(/\s+/g, '');

  if (MUSICAL_KEY_TO_CAMELOT[clean]) {
    const res = MUSICAL_KEY_TO_CAMELOT[clean];
    CAMELOT_NORM_CACHE.set(key, res);
    return res;
  }

  // 3. Regex parser for musical notes with accidentals (#/b) and modes (m/min/minor/moll/maj/major/dur)
  const noteMatch = raw.match(/^([A-Ga-gHh])([#b]?)\s*(min(?:or)?|moll|maj(?:or)?|dur|m)?$/i);
  if (noteMatch) {
    const root = noteMatch[1].toUpperCase();
    const accidental = noteMatch[2] ? (noteMatch[2] === '#' ? '#' : 'B') : '';
    const mode = (noteMatch[3] || '').toLowerCase();
    const isMinor = mode.startsWith('m') || mode === 'moll';
    const lookupKey = `${root}${accidental}${isMinor ? 'M' : ''}`;
    if (MUSICAL_KEY_TO_CAMELOT[lookupKey]) {
      const res = MUSICAL_KEY_TO_CAMELOT[lookupKey];
      CAMELOT_NORM_CACHE.set(key, res);
      return res;
    }
  }

  CAMELOT_NORM_CACHE.set(key, null);
  return null;
}

/**
 * Fast cached parser for Camelot key string (e.g. '8A' -> { num: 8, letter: 'A' })
 */
export function parseCamelot(k?: string | null): { num: number; letter: string } | null {
  if (!k) return null;
  const cached = CAMELOT_PARSE_CACHE.get(k);
  if (cached !== undefined) return cached;

  const match = k.match(/(\d+)([AB])/i);
  if (!match) {
    CAMELOT_PARSE_CACHE.set(k, null);
    return null;
  }
  const parsed = { num: parseInt(match[1], 10), letter: match[2].toUpperCase() };
  CAMELOT_PARSE_CACHE.set(k, parsed);
  return parsed;
}

/**
 * Traktor / Serato / Camelot Key Mixing Evaluation
 */
export function evaluateKeyCompatibility(keyA?: string, keyB?: string): KeyCompatibilityResult {
  if (!keyA || !keyB) {
    return { score: 75, label: 'Unbekannt', type: 'adjacent', description: 'Tonart nicht hinterlegt' };
  }

  const normA = normalizeToCamelot(keyA);
  const normB = normalizeToCamelot(keyB);

  const cA = normA ? parseCamelot(normA) : null;
  const cB = normB ? parseCamelot(normB) : null;

  if (!cA || !cB) {
    if (keyA.trim().toUpperCase() === keyB.trim().toUpperCase()) {
      return { score: 100, label: 'Identisch', type: 'perfect', description: 'Exakt dieselbe Tonart' };
    }
    return { score: 60, label: 'Neutral', type: 'adjacent', description: 'Harmonische Kompatibilität prüfen' };
  }

  // Exact same key
  if (cA.num === cB.num && cA.letter === cB.letter) {
    return {
      score: 100,
      label: 'Perfekter Match',
      type: 'perfect',
      description: `Beide Tracks in ${normA}. Maximale harmonische Konsistenz.`
    };
  }

  // Relative Major / Minor (Same number, opposite letter e.g. 8A <-> 8B)
  if (cA.num === cB.num && cA.letter !== cB.letter) {
    return {
      score: 95,
      label: 'Relatives Dur/Moll',
      type: 'relative',
      description: `Wechsel von ${normA} zu ${normB}. Emotionaler Stimmungswechsel ohne Disharmonie.`
    };
  }

  // Adjacent (+1 or -1 on wheel, wrapping 12 to 1)
  const diff = Math.abs(cA.num - cB.num);
  const isAdjacentNum = diff === 1 || diff === 11;

  if (isAdjacentNum && cA.letter === cB.letter) {
    const isEnergyBoost = (cB.num === (cA.num % 12) + 1);
    return {
      score: 90,
      label: isEnergyBoost ? 'Energy Boost (+1)' : 'Energy Drop (-1)',
      type: 'adjacent',
      description: isEnergyBoost 
        ? `Modulation um +1 (${normA} ➔ ${normB}). Hebt die Tanzflächen-Energie an!`
        : `Modulation um -1 (${normA} ➔ ${normB}). Angenehmer Flow mit Beruhigungseffekt.`
    };
  }

  // Semi-tone clash
  if (diff >= 2 && diff <= 10) {
    return {
      score: 40,
      label: 'Harmonischer Clash',
      type: 'clash',
      description: `Achtung: ${normA} und ${normB} liegen weit auseinander. EQ-Trennung oder Filter empfohlen!`
    };
  }

  return {
    score: 60,
    label: 'Akzeptabel',
    type: 'adjacent',
    description: `Harmonischer Übergang von ${normA} zu ${normB}.`
  };
}

/**
 * Traktor / Serato Beat & Tempo Mixing Calculator
 */
export function calculateTempoSync(bpmA: number, bpmB: number) {
  const diffBpm = Math.abs(bpmA - bpmB);
  const percentDiff = (diffBpm / bpmA) * 100;
  const isSyncable = percentDiff <= 8.0; // Within +/- 8% standard DJ pitch range
  const pitchShift = ((bpmA - bpmB) / bpmB) * 100;

  return {
    diffBpm: parseFloat(diffBpm.toFixed(1)),
    percentDiff: parseFloat(percentDiff.toFixed(2)),
    pitchShift: parseFloat(pitchShift.toFixed(2)),
    isSyncable,
    recommendedTargetBpm: bpmA, // Slave deck B matches master deck A
  };
}

/**
 * Waveform Envelope Point Evaluator
 * Evaluates the value (0.0 to 1.0) at any given beat along the envelope timeline
 */
export function evaluateEnvelope(points: EnvelopePoint[], currentBeat: number): number {
  if (!points || points.length === 0) return 1.0;
  if (points.length === 1) return points[0].value;

  // If before first point
  if (currentBeat <= points[0].beat) return points[0].value;
  // If after last point
  if (currentBeat >= points[points.length - 1].beat) return points[points.length - 1].value;

  // Find segment
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    if (currentBeat >= p1.beat && currentBeat <= p2.beat) {
      const span = p2.beat - p1.beat;
      if (span === 0) return p2.value;
      const t = (currentBeat - p1.beat) / span;
      return p1.value + t * (p2.value - p1.value);
    }
  }

  return points[points.length - 1].value;
}

/**
 * Generates default 3-Band Waveform Envelope Curves based on the selected Preset
 */
export function generateDefaultEnvelopes(preset: TransitionPresetType, durationBeats: number): TransitionEnvelopes {
  const b = durationBeats;

  switch (preset) {
    case 'eq-blend': {
      // 1. Der klassische EQ-Wechsel (Equalizer Blend)
      return {
        // Bass: Track A remains on 1.0 until 80% (phrase start), then drops to 0. Track B rises from 0 to 1.0
        lowA: [
          { id: 'la-1', beat: 0, value: 1.0 },
          { id: 'la-2', beat: Math.max(0, b * 0.78), value: 1.0 },
          { id: 'la-3', beat: b * 0.8, value: 0.0 },
          { id: 'la-4', beat: b, value: 0.0 },
        ],
        lowB: [
          { id: 'lb-1', beat: 0, value: 0.0 },
          { id: 'lb-2', beat: Math.max(0, b * 0.78), value: 0.0 },
          { id: 'lb-3', beat: b * 0.8, value: 1.0 },
          { id: 'lb-4', beat: b, value: 1.0 },
        ],
        // Mids: Crossover from 20% to 80%
        midA: [
          { id: 'ma-1', beat: 0, value: 1.0 },
          { id: 'ma-2', beat: b * 0.2, value: 1.0 },
          { id: 'ma-3', beat: b * 0.8, value: 0.5 },
          { id: 'ma-4', beat: b, value: 0.0 },
        ],
        midB: [
          { id: 'mb-1', beat: 0, value: 0.0 },
          { id: 'mb-2', beat: b * 0.2, value: 0.3 },
          { id: 'mb-3', beat: b * 0.8, value: 0.8 },
          { id: 'mb-4', beat: b, value: 1.0 },
        ],
        // Highs: Crossover
        highA: [
          { id: 'ha-1', beat: 0, value: 1.0 },
          { id: 'ha-2', beat: b * 0.2, value: 1.0 },
          { id: 'ha-3', beat: b * 0.8, value: 0.5 },
          { id: 'ha-4', beat: b, value: 0.0 },
        ],
        highB: [
          { id: 'hb-1', beat: 0, value: 0.0 },
          { id: 'hb-2', beat: b * 0.2, value: 0.3 },
          { id: 'hb-3', beat: b * 0.8, value: 0.8 },
          { id: 'hb-4', beat: b, value: 1.0 },
        ],
        // Volume: smooth equal power curve
        volumeA: [
          { id: 'va-1', beat: 0, value: 1.0 },
          { id: 'va-2', beat: b * 0.5, value: 0.75 },
          { id: 'va-3', beat: b, value: 0.0 },
        ],
        volumeB: [
          { id: 'vb-1', beat: 0, value: 0.0 },
          { id: 'vb-2', beat: b * 0.5, value: 0.75 },
          { id: 'vb-3', beat: b, value: 1.0 },
        ],
      };
    }

    case 'bass-swap': {
      // 2. Der Bass-Swap (Instant Low-End Switch auf der Eins)
      const swapBeat = b * 0.5;
      return {
        // Low-End: Schlagartiger Tausch auf der Eins (50% der Übergangszone)
        lowA: [
          { id: 'la-1', beat: 0, value: 1.0 },
          { id: 'la-2', beat: Math.max(0, swapBeat - 0.2), value: 1.0 },
          { id: 'la-3', beat: swapBeat, value: 0.0 },
          { id: 'la-4', beat: b, value: 0.0 },
        ],
        lowB: [
          { id: 'lb-1', beat: 0, value: 0.0 },
          { id: 'lb-2', beat: Math.max(0, swapBeat - 0.2), value: 0.0 },
          { id: 'lb-3', beat: swapBeat, value: 1.0 },
          { id: 'lb-4', beat: b, value: 1.0 },
        ],
        // Mids: Vorbereitung & sanftes Ausfaden
        midA: [
          { id: 'ma-1', beat: 0, value: 1.0 },
          { id: 'ma-2', beat: swapBeat, value: 0.8 },
          { id: 'ma-3', beat: b, value: 0.0 },
        ],
        midB: [
          { id: 'mb-1', beat: 0, value: 0.0 },
          { id: 'mb-2', beat: swapBeat, value: 0.8 },
          { id: 'mb-3', beat: b, value: 1.0 },
        ],
        // Highs:
        highA: [
          { id: 'ha-1', beat: 0, value: 1.0 },
          { id: 'ha-2', beat: swapBeat, value: 0.8 },
          { id: 'ha-3', beat: b, value: 0.0 },
        ],
        highB: [
          { id: 'hb-1', beat: 0, value: 0.0 },
          { id: 'hb-2', beat: swapBeat, value: 0.8 },
          { id: 'hb-3', beat: b, value: 1.0 },
        ],
        volumeA: [
          { id: 'va-1', beat: 0, value: 1.0 },
          { id: 'va-2', beat: swapBeat, value: 1.0 },
          { id: 'va-3', beat: b, value: 0.0 },
        ],
        volumeB: [
          { id: 'vb-1', beat: 0, value: 0.0 },
          { id: 'vb-2', beat: swapBeat, value: 1.0 },
          { id: 'vb-3', beat: b, value: 1.0 },
        ],
      };
    }

    case 'filter-sweep': {
      // 3. Der Filter-Sweep (HPF / LPF Transition)
      return {
        // Bass drops away as HPF opens up
        lowA: [
          { id: 'la-1', beat: 0, value: 1.0 },
          { id: 'la-2', beat: b * 0.3, value: 0.7 },
          { id: 'la-3', beat: b * 0.7, value: 0.1 },
          { id: 'la-4', beat: b, value: 0.0 },
        ],
        lowB: [
          { id: 'lb-1', beat: 0, value: 0.0 },
          { id: 'lb-2', beat: b * 0.5, value: 0.2 },
          { id: 'lb-3', beat: b * 0.8, value: 0.8 },
          { id: 'lb-4', beat: b, value: 1.0 },
        ],
        // Mids & Highs build drama
        midA: [
          { id: 'ma-1', beat: 0, value: 1.0 },
          { id: 'ma-2', beat: b * 0.6, value: 0.9 },
          { id: 'ma-3', beat: b, value: 0.0 },
        ],
        midB: [
          { id: 'mb-1', beat: 0, value: 0.0 },
          { id: 'mb-2', beat: b * 0.4, value: 0.5 },
          { id: 'mb-3', beat: b, value: 1.0 },
        ],
        highA: [
          { id: 'ha-1', beat: 0, value: 1.0 },
          { id: 'ha-2', beat: b * 0.7, value: 1.2 }, // Resonance boost!
          { id: 'ha-3', beat: b, value: 0.0 },
        ],
        highB: [
          { id: 'hb-1', beat: 0, value: 0.0 },
          { id: 'hb-2', beat: b * 0.5, value: 0.6 },
          { id: 'hb-3', beat: b, value: 1.0 },
        ],
        volumeA: [
          { id: 'va-1', beat: 0, value: 1.0 },
          { id: 'va-2', beat: b * 0.8, value: 0.7 },
          { id: 'va-3', beat: b, value: 0.0 },
        ],
        volumeB: [
          { id: 'vb-1', beat: 0, value: 0.0 },
          { id: 'vb-2', beat: b * 0.4, value: 0.6 },
          { id: 'vb-3', beat: b, value: 1.0 },
        ],
      };
    }

    case 'cut-drop': {
      // 4. Der Cut / Drop (Fader Slam)
      const cutBeat = b * 0.5;
      return {
        lowA: [
          { id: 'la-1', beat: 0, value: 1.0 },
          { id: 'la-2', beat: Math.max(0, cutBeat - 0.1), value: 1.0 },
          { id: 'la-3', beat: cutBeat, value: 0.0 },
          { id: 'la-4', beat: b, value: 0.0 },
        ],
        lowB: [
          { id: 'lb-1', beat: 0, value: 0.0 },
          { id: 'lb-2', beat: Math.max(0, cutBeat - 0.1), value: 0.0 },
          { id: 'lb-3', beat: cutBeat, value: 1.0 },
          { id: 'lb-4', beat: b, value: 1.0 },
        ],
        midA: [
          { id: 'ma-1', beat: 0, value: 1.0 },
          { id: 'ma-2', beat: Math.max(0, cutBeat - 0.1), value: 1.0 },
          { id: 'ma-3', beat: cutBeat, value: 0.0 },
          { id: 'ma-4', beat: b, value: 0.0 },
        ],
        midB: [
          { id: 'mb-1', beat: 0, value: 0.0 },
          { id: 'mb-2', beat: Math.max(0, cutBeat - 0.1), value: 0.0 },
          { id: 'mb-3', beat: cutBeat, value: 1.0 },
          { id: 'mb-4', beat: b, value: 1.0 },
        ],
        highA: [
          { id: 'ha-1', beat: 0, value: 1.0 },
          { id: 'ha-2', beat: Math.max(0, cutBeat - 0.1), value: 1.0 },
          { id: 'ha-3', beat: cutBeat, value: 0.0 },
          { id: 'ha-4', beat: b, value: 0.0 },
        ],
        highB: [
          { id: 'hb-1', beat: 0, value: 0.0 },
          { id: 'hb-2', beat: Math.max(0, cutBeat - 0.1), value: 0.0 },
          { id: 'hb-3', beat: cutBeat, value: 1.0 },
          { id: 'hb-4', beat: b, value: 1.0 },
        ],
        volumeA: [
          { id: 'va-1', beat: 0, value: 1.0 },
          { id: 'va-2', beat: Math.max(0, cutBeat - 0.1), value: 1.0 },
          { id: 'va-3', beat: cutBeat, value: 0.0 },
          { id: 'va-4', beat: b, value: 0.0 },
        ],
        volumeB: [
          { id: 'vb-1', beat: 0, value: 0.0 },
          { id: 'vb-2', beat: Math.max(0, cutBeat - 0.1), value: 0.0 },
          { id: 'vb-3', beat: cutBeat, value: 1.0 },
          { id: 'vb-4', beat: b, value: 1.0 },
        ],
      };
    }

    case 'equal-power': {
      // 5. Volume-Fading mit Kurven (Equal-Power Gain Crossfade)
      return {
        lowA: [
          { id: 'la-1', beat: 0, value: 1.0 },
          { id: 'la-2', beat: b * 0.5, value: 0.71 },
          { id: 'la-3', beat: b, value: 0.0 },
        ],
        lowB: [
          { id: 'lb-1', beat: 0, value: 0.0 },
          { id: 'lb-2', beat: b * 0.5, value: 0.71 },
          { id: 'lb-3', beat: b, value: 1.0 },
        ],
        midA: [
          { id: 'ma-1', beat: 0, value: 1.0 },
          { id: 'ma-2', beat: b * 0.5, value: 0.71 },
          { id: 'ma-3', beat: b, value: 0.0 },
        ],
        midB: [
          { id: 'mb-1', beat: 0, value: 0.0 },
          { id: 'mb-2', beat: b * 0.5, value: 0.71 },
          { id: 'mb-3', beat: b, value: 1.0 },
        ],
        highA: [
          { id: 'ha-1', beat: 0, value: 1.0 },
          { id: 'ha-2', beat: b * 0.5, value: 0.71 },
          { id: 'ha-3', beat: b, value: 0.0 },
        ],
        highB: [
          { id: 'hb-1', beat: 0, value: 0.0 },
          { id: 'hb-2', beat: b * 0.5, value: 0.71 },
          { id: 'hb-3', beat: b, value: 1.0 },
        ],
        volumeA: [
          { id: 'va-1', beat: 0, value: 1.0 },
          { id: 'va-2', beat: b * 0.5, value: 0.71 },
          { id: 'va-3', beat: b, value: 0.0 },
        ],
        volumeB: [
          { id: 'vb-1', beat: 0, value: 0.0 },
          { id: 'vb-2', beat: b * 0.5, value: 0.71 },
          { id: 'vb-3', beat: b, value: 1.0 },
        ],
      };
    }

    case 'reverb-rise': {
      // 6. Reverb Wash / FX Riser Build
      return {
        lowA: [
          { id: 'la-1', beat: 0, value: 1.0 },
          { id: 'la-2', beat: b * 0.6, value: 1.0 },
          { id: 'la-3', beat: b * 0.75, value: 0.1 },
          { id: 'la-4', beat: b, value: 0.0 },
        ],
        lowB: [
          { id: 'lb-1', beat: 0, value: 0.0 },
          { id: 'lb-2', beat: b * 0.75, value: 0.0 },
          { id: 'lb-3', beat: b, value: 1.0 },
        ],
        midA: [
          { id: 'ma-1', beat: 0, value: 1.0 },
          { id: 'ma-2', beat: b * 0.5, value: 0.8 },
          { id: 'ma-3', beat: b, value: 0.0 },
        ],
        midB: [
          { id: 'mb-1', beat: 0, value: 0.0 },
          { id: 'mb-2', beat: b * 0.25, value: 0.4 },
          { id: 'mb-3', beat: b, value: 1.0 },
        ],
        highA: [
          { id: 'ha-1', beat: 0, value: 1.0 },
          { id: 'ha-2', beat: b * 0.75, value: 1.0 },
          { id: 'ha-3', beat: b, value: 0.0 },
        ],
        highB: [
          { id: 'hb-1', beat: 0, value: 0.0 },
          { id: 'hb-2', beat: b * 0.25, value: 0.5 },
          { id: 'hb-3', beat: b, value: 1.0 },
        ],
        volumeA: [
          { id: 'va-1', beat: 0, value: 1.0 },
          { id: 'va-2', beat: b * 0.75, value: 0.9 },
          { id: 'va-3', beat: b, value: 0.0 },
        ],
        volumeB: [
          { id: 'vb-1', beat: 0, value: 0.0 },
          { id: 'vb-2', beat: b * 0.25, value: 0.6 },
          { id: 'vb-3', beat: b, value: 1.0 },
        ],
      };
    }

    case 'vocal-swap': {
      // 7. Mid/Vocal Solo Swap
      return {
        lowA: [
          { id: 'la-1', beat: 0, value: 1.0 },
          { id: 'la-2', beat: b * 0.5, value: 0.8 },
          { id: 'la-3', beat: b, value: 0.0 },
        ],
        lowB: [
          { id: 'lb-1', beat: 0, value: 0.0 },
          { id: 'lb-2', beat: b * 0.5, value: 0.2 },
          { id: 'lb-3', beat: b, value: 1.0 },
        ],
        midA: [
          { id: 'ma-1', beat: 0, value: 1.0 },
          { id: 'ma-2', beat: b * 0.25, value: 1.0 },
          { id: 'ma-3', beat: b * 0.26, value: 0.0 },
          { id: 'ma-4', beat: b, value: 0.0 },
        ],
        midB: [
          { id: 'mb-1', beat: 0, value: 0.0 },
          { id: 'mb-2', beat: b * 0.25, value: 0.0 },
          { id: 'mb-3', beat: b * 0.26, value: 1.0 },
          { id: 'mb-4', beat: b, value: 1.0 },
        ],
        highA: [
          { id: 'ha-1', beat: 0, value: 1.0 },
          { id: 'ha-2', beat: b * 0.75, value: 0.5 },
          { id: 'ha-3', beat: b, value: 0.0 },
        ],
        highB: [
          { id: 'hb-1', beat: 0, value: 0.0 },
          { id: 'hb-2', beat: b * 0.25, value: 0.5 },
          { id: 'hb-3', beat: b, value: 1.0 },
        ],
        volumeA: [
          { id: 'va-1', beat: 0, value: 1.0 },
          { id: 'va-2', beat: b, value: 0.0 },
        ],
        volumeB: [
          { id: 'vb-1', beat: 0, value: 0.0 },
          { id: 'vb-2', beat: b, value: 1.0 },
        ],
      };
    }

    case 'progressive-filter': {
      // 8. Progressive Double Filter Sweep
      return {
        lowA: [
          { id: 'la-1', beat: 0, value: 1.0 },
          { id: 'la-2', beat: b * 0.6, value: 0.6 },
          { id: 'la-3', beat: b, value: 0.0 },
        ],
        lowB: [
          { id: 'lb-1', beat: 0, value: 0.0 },
          { id: 'lb-2', beat: b * 0.4, value: 0.4 },
          { id: 'lb-3', beat: b, value: 1.0 },
        ],
        midA: [
          { id: 'ma-1', beat: 0, value: 1.0 },
          { id: 'ma-2', beat: b * 0.5, value: 0.7 },
          { id: 'ma-3', beat: b, value: 0.0 },
        ],
        midB: [
          { id: 'mb-1', beat: 0, value: 0.0 },
          { id: 'mb-2', beat: b * 0.5, value: 0.5 },
          { id: 'mb-3', beat: b, value: 1.0 },
        ],
        highA: [
          { id: 'ha-1', beat: 0, value: 1.0 },
          { id: 'ha-2', beat: b * 0.5, value: 0.7 },
          { id: 'ha-3', beat: b, value: 0.0 },
        ],
        highB: [
          { id: 'hb-1', beat: 0, value: 0.0 },
          { id: 'hb-2', beat: b * 0.5, value: 0.5 },
          { id: 'hb-3', beat: b, value: 1.0 },
        ],
        volumeA: [
          { id: 'va-1', beat: 0, value: 1.0 },
          { id: 'va-2', beat: b * 0.8, value: 0.6 },
          { id: 'va-3', beat: b, value: 0.0 },
        ],
        volumeB: [
          { id: 'vb-1', beat: 0, value: 0.0 },
          { id: 'vb-2', beat: b * 0.2, value: 0.4 },
          { id: 'vb-3', beat: b, value: 1.0 },
        ],
      };
    }

    case 'ambient-fade': {
      // 9. Ambient Slow Crossfade
      return {
        lowA: [
          { id: 'la-1', beat: 0, value: 1.0 },
          { id: 'la-2', beat: b * 0.5, value: 0.7 },
          { id: 'la-3', beat: b, value: 0.0 },
        ],
        lowB: [
          { id: 'lb-1', beat: 0, value: 0.0 },
          { id: 'lb-2', beat: b * 0.5, value: 0.3 },
          { id: 'lb-3', beat: b, value: 1.0 },
        ],
        midA: [
          { id: 'ma-1', beat: 0, value: 1.0 },
          { id: 'ma-2', beat: b, value: 0.0 },
        ],
        midB: [
          { id: 'mb-1', beat: 0, value: 0.0 },
          { id: 'mb-2', beat: b, value: 1.0 },
        ],
        highA: [
          { id: 'ha-1', beat: 0, value: 1.0 },
          { id: 'ha-2', beat: b, value: 0.0 },
        ],
        highB: [
          { id: 'hb-1', beat: 0, value: 0.0 },
          { id: 'hb-2', beat: b, value: 1.0 },
        ],
        volumeA: [
          { id: 'va-1', beat: 0, value: 1.0 },
          { id: 'va-2', beat: b, value: 0.0 },
        ],
        volumeB: [
          { id: 'vb-1', beat: 0, value: 0.0 },
          { id: 'vb-2', beat: b, value: 1.0 },
        ],
      };
    }

    default: {
      return generateDefaultEnvelopes('bass-swap', durationBeats);
    }
  }
}

/**
/**
 * Analyzes track structure, cues, segments, and waveform energy to spot:
 * - Breakdown / quiet sections in Track A (ideal for starting an atmospheric or build transition)
 * - Drop sections in Track B (where the kick/bass explodes after an intro or build-up)
 */
export function analyzeTrackStructureForMix(
  track: TrackDef,
  bpm: number = 130
): {
  breakdownSec?: number;
  dropSec?: number;
  kickEntranceSec?: number;
  verseOrHookSec?: number;
  hasVocalOrMelodicMid: boolean;
  outroSec: number;
} {
  const duration = track.duration || 180;
  const beatSec = 60 / (bpm > 0 ? bpm : 130);
  const barSec = beatSec * 4;

  let breakdownSec: number | undefined;
  let dropSec: number | undefined;
  let kickEntranceSec: number | undefined;
  let verseOrHookSec: number | undefined;

  // 1. Check explicit Hot Cues
  if (track.hotCues && track.hotCues.length > 0) {
    const bCue = track.hotCues.find(c =>
      c.name && /break|quiet|ambient|bridge|down|solo/i.test(c.name)
    );
    if (bCue && bCue.timeMs > 0 && (bCue.timeMs / 1000) > duration * 0.35 && (bCue.timeMs / 1000) < duration - (barSec * 4)) {
      breakdownSec = Math.floor((bCue.timeMs / 1000) / barSec) * barSec;
    }

    const dCue = track.hotCues.find(c =>
      (c.name && /drop|kick|bass|main|hook|chorus/i.test(c.name)) || c.slot === 2 || c.slot === 3 || c.slot === 4
    );
    if (dCue && dCue.timeMs > 0 && (dCue.timeMs / 1000) >= barSec && (dCue.timeMs / 1000) < duration * 0.5) {
      dropSec = Math.floor((dCue.timeMs / 1000) / barSec) * barSec;
    }

    const vCue = track.hotCues.find(c =>
      c.name && /verse|vocal|melody|theme/i.test(c.name)
    );
    if (vCue && vCue.timeMs > 0 && (vCue.timeMs / 1000) >= barSec && (vCue.timeMs / 1000) < duration * 0.45) {
      verseOrHookSec = Math.floor((vCue.timeMs / 1000) / barSec) * barSec;
    }
  }

  // 2. Check Segments if not found via cues
  if (track.segments && track.segments.length > 0) {
    if (!breakdownSec) {
      const bSeg = track.segments.find(s => {
        const start = s.startSec ?? (s as any).start ?? 0;
        const name = s.name ?? (s as any).label ?? '';
        return start > duration * 0.35 &&
          start < duration - (barSec * 4) &&
          (/break|bridge|quiet|ambient|vocal/i.test(name) || (s.energy !== undefined && s.energy <= 4));
      });
      if (bSeg) {
        const start = bSeg.startSec ?? (bSeg as any).start ?? 0;
        breakdownSec = Math.floor(start / barSec) * barSec;
      }
    }

    if (!dropSec) {
      const dSeg = track.segments.find(s => {
        const start = s.startSec ?? (s as any).start ?? 0;
        const name = s.name ?? (s as any).label ?? '';
        return start >= 4 &&
          start <= Math.min(90, duration * 0.5) &&
          (/drop|climax|chorus/i.test(name) || (s.energy !== undefined && s.energy >= 7));
      });
      if (dSeg) {
        const start = dSeg.startSec ?? (dSeg as any).start ?? 0;
        dropSec = Math.floor(start / barSec) * barSec;
      }
    }

    if (!verseOrHookSec) {
      const vSeg = track.segments.find(s => {
        const start = s.startSec ?? (s as any).start ?? 0;
        const name = s.name ?? (s as any).label ?? '';
        return start >= barSec && start <= duration * 0.4 && /verse|hook|main|theme/i.test(name);
      });
      if (vSeg) {
        const start = vSeg.startSec ?? (vSeg as any).start ?? 0;
        verseOrHookSec = Math.floor(start / barSec) * barSec;
      }
    }
  }

  // 3. Waveform slice spotter
  // A. Spot Kick / Beat Entrance (skip ambient / beatless intro)
  const maxScanSec = Math.min(60, duration * 0.35);
  for (let t = 0; t < maxScanSec; t += beatSec) {
    const slice = getTrackWaveformSlice(track, t);
    if (slice.isKick || slice.needleAmp > 0.55) {
      if (t >= barSec) {
        kickEntranceSec = Math.floor(t / barSec) * barSec;
      }
      break;
    }
  }

  // B. Spot First Major Drop Spike (between 10s and 60s)
  if (!dropSec && duration > 30) {
    let initialLowEnergy = 0;
    let foundDrop: number | undefined;

    for (let t = barSec; t < maxScanSec; t += barSec) {
      const slice = getTrackWaveformSlice(track, t);
      const isLowSpike = slice.isKick || slice.needleAmp > 0.6;
      if (t <= barSec * 2) {
        initialLowEnergy = slice.needleAmp;
      } else if (isLowSpike && slice.needleAmp > initialLowEnergy + 0.22) {
        foundDrop = Math.floor(t / barSec) * barSec;
        break;
      }
    }
    if (foundDrop) dropSec = foundDrop;
  }

  // C. Spot Mid-Track Breakdown Valley (between 40% and 75% of track)
  if (!breakdownSec && duration > 90) {
    let minEnergy = 1.0;
    let minTime: number | undefined;

    for (let t = duration * 0.4; t < duration * 0.75; t += barSec * 2) {
      const slice = getTrackWaveformSlice(track, t);
      const avgAmp = (slice.bodyAmp + slice.needleAmp) / 2;
      if (avgAmp < minEnergy && avgAmp < 0.4) {
        minEnergy = avgAmp;
        minTime = Math.floor(t / barSec) * barSec;
      }
    }
    if (minTime) breakdownSec = minTime;
  }

  // Outro fallback phrase anchor (leave at least 2 bars buffer at track end)
  const outroSec = Math.max(0, Math.floor((duration - (barSec * 8)) / barSec) * barSec);

  const hasVocalOrMelodicMid = (track.deepAnalysis?.spectral?.spectralCentroidHz !== undefined &&
    track.deepAnalysis.spectral.spectralCentroidHz > 1200 &&
    track.deepAnalysis.spectral.spectralCentroidHz < 3500) ||
    (track.mood?.toLowerCase().includes('vocal') ?? false);

  return {
    breakdownSec,
    dropSec,
    kickEntranceSec,
    verseOrHookSec,
    hasVocalOrMelodicMid,
    outroSec,
  };
}

/**
 * DJ.Studio-inspired "Harmonize" Automix Generator
 * Optimizes playlist sequence based on Camelot Wheel harmonic compatibility & BPM,
 * and automatically sets up 32-beat phrase-aligned transitions with 3-band curves.
 */
export function generateHarmonizedSet(rawTracks: TrackDef[]): {
  orderedTracks: TrackDef[];
  transitions: TransitionConfig[];
} {
  if (rawTracks.length === 0) return { orderedTracks: [], transitions: [] };
  if (rawTracks.length === 1) return { orderedTracks: [rawTracks[0]], transitions: [] };

  // Score transition quality between two tracks
  const scoreTransitionPair = (src: TrackDef, tgt: TrackDef): number => {
    const keyComp = evaluateKeyCompatibility(src.key, tgt.key);
    const bpmA = src.bpm || 130;
    const bpmB = tgt.bpm || 130;
    const diffBpm = Math.abs(bpmA - bpmB);
    const energyA = Number(src.energy) || 6;
    const energyB = Number(tgt.energy) || 6;
    const energyDelta = energyB - energyA;

    let score = keyComp.score; // 0..100
    // BPM difference penalty (penalize large tempo steps)
    score -= diffBpm * 3.5;

    // Energy flow reward: gradual build or steady flow is rewarded
    if (energyDelta >= 0 && energyDelta <= 2) {
      score += 15;
    } else if (energyDelta < -2) {
      score -= Math.abs(energyDelta) * 6; // penalize sudden energy drops
    }

    return score;
  };

  // 1. Intelligent Track Ordering: Greedy path with 2-opt local search optimization
  const remaining = [...rawTracks];
  const ordered: TrackDef[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestScore = -9999;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const score = scoreTransitionPair(current, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }

  // 2-opt local optimization if <= 16 tracks to eliminate any remaining harmonic clashes
  if (ordered.length >= 4 && ordered.length <= 20) {
    let improved = true;
    let passes = 0;
    while (improved && passes < 10) {
      improved = false;
      passes++;
      for (let i = 1; i < ordered.length - 2; i++) {
        for (let j = i + 1; j < ordered.length - 1; j++) {
          const currentScore = scoreTransitionPair(ordered[i - 1], ordered[i]) + scoreTransitionPair(ordered[j], ordered[j + 1]);
          const swappedScore = scoreTransitionPair(ordered[i - 1], ordered[j]) + scoreTransitionPair(ordered[i], ordered[j + 1]);
          if (swappedScore > currentScore + 8) {
            // Reverse segment between i and j
            const segment = ordered.slice(i, j + 1).reverse();
            ordered.splice(i, segment.length, ...segment);
            improved = true;
          }
        }
      }
    }
  }

  // 2. Intelligent Transition Placement, Best Preset & Optimal Length
  const transitions: TransitionConfig[] = [];

  for (let i = 0; i < ordered.length - 1; i++) {
    const src = ordered[i];
    const tgt = ordered[i + 1];

    const keyComp = evaluateKeyCompatibility(src.key, tgt.key);
    const tempo = calculateTempoSync(src.bpm || 130, tgt.bpm || 130);
    const bpmA = src.bpm || 130;
    const bpmB = tgt.bpm || 130;
    const diffBpm = tempo.diffBpm;
    const energyA = Number(src.energy) || 6;
    const energyB = Number(tgt.energy) || 6;
    const energyDelta = energyB - energyA;

    // Analyze structural milestones (breakdowns, drop spikes, quiet parts)
    const structA = analyzeTrackStructureForMix(src, bpmA);
    const structB = analyzeTrackStructureForMix(tgt, bpmB);

    const beatSecA = 60 / bpmA;
    const barSecA = beatSecA * 4;
    const beatSecB = 60 / bpmB;
    const barSecB = beatSecB * 4;

    // A. Select Best Transition Preset & Duration using Professional DJ Mix Techniques
    let preset: TransitionPresetType = 'bass-swap';
    let durationBeats: number = 32;

    const isHarmonic = keyComp.type === 'perfect' || keyComp.type === 'relative';
    const isCompatible = isHarmonic || keyComp.type === 'adjacent';

    if (energyA <= 4 && energyB <= 4) {
      // 1. Ambient Slow Crossfade for chill/downtempo
      preset = 'ambient-fade';
      durationBeats = (src.duration && src.duration > 240) ? 64 : 48;
    } else if (diffBpm > 5) {
      // 2. Filter-Sweep for significant tempo changes or key clashes
      preset = 'filter-sweep';
      durationBeats = 16;
    } else if (structA.breakdownSec && structB.dropSec && structB.dropSec > 8) {
      // 3. Breakdown-to-Drop / Stimmung steigern: Layer under breakdown and bass-swap on drop!
      preset = 'bass-swap';
      durationBeats = 32;
    } else if (energyDelta >= 2) {
      // 4. Energy Build Riser
      preset = 'reverb-rise';
      durationBeats = 32;
    } else if (isHarmonic) {
      // 5. Long 3-Band EQ Blend for harmonic mixing
      preset = 'eq-blend';
      durationBeats = (src.duration && src.duration > 220) ? 64 : 32;
    } else if (structA.hasVocalOrMelodicMid || structB.hasVocalOrMelodicMid) {
      // 6. Mid/Vocal Solo Swap to prevent vocal clashing
      preset = 'vocal-swap';
      durationBeats = 32;
    } else if (isCompatible && energyDelta >= 0) {
      // 7. Classic Punchy Bass-Swap on the 1
      preset = 'bass-swap';
      durationBeats = 32;
    } else {
      // 8. Progressive Filter Sweep
      preset = 'filter-sweep';
      durationBeats = 32;
    }

    // B. Calculate Accurate Musical Timing & Cue Points
    const transDurationSec = durationBeats * beatSecA;
    const trackDurationA = src.duration || 180;
    const trackDurationB = tgt.duration || 180;

    // Determine mixout timestamp in Track A:
    let sourceTimeSec: number;
    let sourceSlotName = 'Outro Transition';
    let sourceSlotNumber = 8;
    const outroCue = src.hotCues?.find(c => 
      (c.name && /outro|mixout|out|breakdown|end/i.test(c.name)) || c.slot === 8 || c.slot === 7
    );

    if (outroCue && (outroCue.timeMs / 1000) >= transDurationSec && (outroCue.timeMs / 1000) <= trackDurationA - barSecA) {
      sourceTimeSec = Math.floor((outroCue.timeMs / 1000) / barSecA) * barSecA;
      sourceSlotName = outroCue.name || 'Outro Cue';
      sourceSlotNumber = outroCue.slot || 8;
    } else if (structA.breakdownSec && structA.breakdownSec >= trackDurationA * 0.45 && structA.breakdownSec + transDurationSec <= trackDurationA - barSecA) {
      sourceTimeSec = structA.breakdownSec;
      sourceSlotName = 'Breakdown Mixout';
      sourceSlotNumber = 7;
    } else if (trackDurationA > 210) {
      // In extended club tracks, mix out around 70-75% phrase boundary to keep DJ sets energetic
      const phraseSec = barSecA * 4;
      const targetOutroTime = trackDurationA * 0.72;
      let calculatedTime = Math.max(phraseSec, Math.floor(targetOutroTime / phraseSec) * phraseSec);
      if (calculatedTime + transDurationSec > trackDurationA - barSecA) {
        calculatedTime = Math.floor((trackDurationA - transDurationSec - barSecA) / barSecA) * barSecA;
      }
      sourceTimeSec = calculatedTime;
      sourceSlotName = 'Phrase Mixout';
      sourceSlotNumber = 7;
    } else {
      // Quantized to 4-beat bar phrase leaving 2 bars buffer at track end
      const rawOutroStart = Math.max(0, trackDurationA - transDurationSec - (barSecA * 2));
      sourceTimeSec = Math.floor(rawOutroStart / barSecA) * barSecA;
      sourceSlotName = 'Outro Transition';
      sourceSlotNumber = 8;
    }

    // Determine mixin timestamp in Track B:
    let targetTimeSec = 0;
    let targetSlotName = 'Intro Cue';
    let targetSlotNumber = 1;

    // Check for explicit hot cues first (drop, chorus, verse, hook, main, vocal)
    const dropCue = tgt.hotCues?.find(c => c.name && /drop|chorus|hook|main|vocal/i.test(c.name));
    const verseCue = tgt.hotCues?.find(c => (c.name && /verse|groove|beat/i.test(c.name)) || c.slot === 2 || c.slot === 3);
    const introCue = tgt.hotCues?.find(c => (c.name && /intro|mixin|in|kick|bass/i.test(c.name)) || c.slot === 1);

    if (preset === 'bass-swap' && structB.dropSec && structB.dropSec > transDurationSec) {
      // Align so Track B builds up during the mix and drops at the 3/4 mark of the transition
      const idealStart = Math.max(0, structB.dropSec - (transDurationSec * 0.75));
      targetTimeSec = Math.floor(idealStart / barSecB) * barSecB;
      targetSlotName = 'Drop Build-up';
      targetSlotNumber = 2;
    } else if (dropCue && (dropCue.timeMs / 1000) > 10 && (dropCue.timeMs / 1000) + transDurationSec < trackDurationB) {
      const cueSec = dropCue.timeMs / 1000;
      const leadIn = Math.min(cueSec, barSecB * 4);
      targetTimeSec = Math.floor((cueSec - leadIn) / barSecB) * barSecB;
      targetSlotName = dropCue.name || 'Drop Cue';
      targetSlotNumber = dropCue.slot || 2;
    } else if (structB.kickEntranceSec && structB.kickEntranceSec >= 8 && structB.kickEntranceSec < trackDurationB * 0.4) {
      // Skip empty ambient intro and mix right as the kick / groove enters
      targetTimeSec = structB.kickEntranceSec;
      targetSlotName = 'Kick Entrance';
      targetSlotNumber = 2;
    } else if (structB.verseOrHookSec && structB.verseOrHookSec >= 12 && structB.verseOrHookSec < trackDurationB * 0.4) {
      targetTimeSec = structB.verseOrHookSec;
      targetSlotName = 'Verse / Hook';
      targetSlotNumber = 3;
    } else if (verseCue && (verseCue.timeMs / 1000) > 8 && (verseCue.timeMs / 1000) < 45) {
      targetTimeSec = Math.floor((verseCue.timeMs / 1000) / barSecB) * barSecB;
      targetSlotName = verseCue.name || 'Verse Cue';
      targetSlotNumber = verseCue.slot || 2;
    } else if (introCue && introCue.timeMs > 0 && introCue.timeMs < 30000) {
      targetTimeSec = Math.floor((introCue.timeMs / 1000) / barSecB) * barSecB;
      targetSlotName = introCue.name || 'Intro Cue';
      targetSlotNumber = introCue.slot || 1;
    } else {
      targetTimeSec = 0;
      targetSlotName = 'Intro Start';
      targetSlotNumber = 1;
    }

    // Generate Envelopes and customize bass swap beat if drop point is known
    const envelopes = generateDefaultEnvelopes(preset, durationBeats);

    // If bass-swap and Track B's drop is known, time the bass swap exactly to Track B's kick spike!
    if (preset === 'bass-swap' && structB.dropSec && structB.dropSec > targetTimeSec) {
      const dropOffsetSec = structB.dropSec - targetTimeSec;
      if (dropOffsetSec > 0 && dropOffsetSec < transDurationSec) {
        const dropBeat = Math.max(4, Math.min(durationBeats - 4, Math.round(dropOffsetSec / beatSecB)));
        if (dropBeat > 0 && dropBeat < durationBeats) {
          envelopes.lowA = [
            { id: 'la-1', beat: 0, value: 1.0 },
            { id: 'la-2', beat: dropBeat, value: 1.0 },
            { id: 'la-3', beat: dropBeat + 0.05, value: 0.0 },
            { id: 'la-4', beat: durationBeats, value: 0.0 },
          ];
          envelopes.lowB = [
            { id: 'lb-1', beat: 0, value: 0.0 },
            { id: 'lb-2', beat: dropBeat, value: 0.0 },
            { id: 'lb-3', beat: dropBeat + 0.05, value: 1.0 },
            { id: 'lb-4', beat: durationBeats, value: 1.0 },
          ];
        }
      }
    }

    transitions.push({
      id: `tr-auto-${src.id}-${tgt.id}`,
      sourceTrackId: src.id,
      sourceSlotId: outroCue ? `slot-${outroCue.slot}-${src.id}` : `slot-${sourceSlotNumber}-${src.id}`,
      sourceSlotName,
      sourceSlotNumber,
      sourceTimeSec,
      targetTrackId: tgt.id,
      targetSlotId: `slot-${targetSlotNumber}-${tgt.id}`,
      targetSlotName,
      targetSlotNumber,
      targetTimeSec,
      durationBeats,
      durationSec: transDurationSec,
      preset,
      envelopes,
      tempoSync: true,
      bpmA: src.bpm,
      bpmB: tgt.bpm,
      targetBpm: src.bpm,
      pitchShiftPercent: tempo.pitchShift,
      keyCompatibility: {
        score: keyComp.score,
        label: keyComp.label,
        type: keyComp.type,
      },
    });
  }

  return { orderedTracks: ordered, transitions };
}

/**
 * 12 Camelot positions matching CamelotWheel.tsx
 */
export const CAMELOT_KEY_COLORS: Record<string, string> = {
  '12B': '#3B82F6', '12A': '#3B82F6',
  '1B': '#06B6D4',  '1A': '#06B6D4',
  '2B': '#0D9488',  '2A': '#0D9488',
  '3B': '#10B981',  '3A': '#10B981',
  '4B': '#84CC16',  '4A': '#84CC16',
  '5B': '#EAB308',  '5A': '#EAB308',
  '6B': '#F59E0B',  '6A': '#F59E0B',
  '7B': '#F97316',  '7A': '#F97316',
  '8B': '#EF4444',  '8A': '#EF4444',
  '9B': '#EC4899',  '9A': '#EC4899',
  '10B': '#D946EF', '10A': '#D946EF',
  '11B': '#8B5CF6', '11A': '#8B5CF6',
};

/**
 * Returns matching Camelot Wheel diagram color for any key badge
 */
export function getCamelotColor(key?: string): string {
  if (!key) return '#A855F7';
  const norm = normalizeToCamelot(key);
  if (norm && CAMELOT_KEY_COLORS[norm]) return CAMELOT_KEY_COLORS[norm];

  const clean = key.trim().toUpperCase();
  if (CAMELOT_KEY_COLORS[clean]) return CAMELOT_KEY_COLORS[clean];
  return '#A855F7';
}

/**
 * Returns numeric value for Camelot order (1A, 1B, 2A, 2B... 12B) for sorting
 */
export function parseCamelotOrder(key?: string): number {
  if (!key) return 999;
  const norm = normalizeToCamelot(key);
  if (!norm) return 900;
  const match = norm.match(/^(\d+)([AB])/);
  if (!match) return 900;
  const num = parseInt(match[1], 10);
  const isMajor = match[2] === 'B';
  return num * 2 + (isMajor ? 1 : 0);
}

/**
 * 10-level energy color scale matching DjFilters.tsx left sidebar
 */
export const ENERGY_LEVEL_COLORS = [
  '#06B6D4', // 1 - Cyan
  '#0EA5E9', // 2 - Sky
  '#3B82F6', // 3 - Blue
  '#10B981', // 4 - Emerald
  '#22C55E', // 5 - Green
  '#EAB308', // 6 - Yellow
  '#F59E0B', // 7 - Amber
  '#F97316', // 8 - Orange
  '#EC4899', // 9 - Pink
  '#F43F5E', // 10 - Rose
];

/**
 * Returns matching energy color corresponding to the left sidebar filter
 */
export function getEnergyColor(energy?: number): string {
  if (energy === undefined || energy === null || isNaN(energy)) return '#F59E0B';
  const level = Math.max(1, Math.min(10, Math.round(energy)));
  return ENERGY_LEVEL_COLORS[level - 1] || '#F59E0B';
}
