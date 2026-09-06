import { EnvelopePoint, TransitionEnvelopes, TransitionPresetType } from '../types';

export interface KeyCompatibilityResult {
  score: number; // 0 to 100
  label: string;
  type: 'perfect' | 'adjacent' | 'relative' | 'clash';
  description: string;
}

/**
 * Traktor / Serato / Camelot Key Mixing Evaluation
 */
export function evaluateKeyCompatibility(keyA?: string, keyB?: string): KeyCompatibilityResult {
  if (!keyA || !keyB) {
    return { score: 75, label: 'Unbekannt', type: 'adjacent', description: 'Tonart nicht hinterlegt' };
  }

  const parseCamelot = (k: string) => {
    const match = k.match(/(\d+)([AB])/i);
    if (!match) return null;
    return { num: parseInt(match[1]), letter: match[2].toUpperCase() };
  };

  const cA = parseCamelot(keyA);
  const cB = parseCamelot(keyB);

  if (!cA || !cB) {
    if (keyA === keyB) {
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
      description: `Beide Tracks in ${keyA}. Maximale harmonische Konsistenz.`
    };
  }

  // Relative Major / Minor (Same number, opposite letter e.g. 8A <-> 8B)
  if (cA.num === cB.num && cA.letter !== cB.letter) {
    return {
      score: 95,
      label: 'Relatives Dur/Moll',
      type: 'relative',
      description: `Wechsel von ${keyA} zu ${keyB}. Emotionaler Stimmungswechsel ohne Disharmonie.`
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
        ? `Modulation um +1 (${keyA} ➔ ${keyB}). Hebt die Tanzflächen-Energie an!`
        : `Modulation um -1 (${keyA} ➔ ${keyB}). Angenehmer Flow mit Beruhigungseffekt.`
    };
  }

  // Semi-tone clash
  if (diff >= 2 && diff <= 10) {
    return {
      score: 40,
      label: 'Harmonischer Clash',
      type: 'clash',
      description: `Achtung: ${keyA} und ${keyB} liegen weit auseinander. EQ-Trennung oder Filter empfohlen!`
    };
  }

  return {
    score: 60,
    label: 'Akzeptabel',
    type: 'adjacent',
    description: `Harmonischer Übergang von ${keyA} zu ${keyB}.`
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
 * MixMeister Envelope Point Evaluator
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
 * Generates default 3-Band MixMeister Envelope Curves based on the selected Preset
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

    case 'equal-power':
    default: {
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
  }
}
