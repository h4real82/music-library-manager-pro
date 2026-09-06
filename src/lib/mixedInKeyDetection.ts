import { TrackSegment, HotCue, WaveformData } from '../types';

export interface MixedInKeyStructureResult {
  hotCues: HotCue[];
  segments: TrackSegment[];
  suggestedMood: string;
  suggestedStyle: string;
}

/**
 * Intelligent Mixed In Key 11 structure and Cue Point detection engine.
 * Generates up to 8 professional Hot Cues quantized to musical phrasing (16/32 beat downbeats)
 * and detailed Macro-Sections spanning the full track duration.
 */
export function generateMixedInKeyStructure(params: {
  duration: number;
  bpm: number;
  camelotKey?: string;
  baseEnergy?: number;
  firstBeatSec?: number;
  waveform?: WaveformData;
}): MixedInKeyStructureResult {
  const duration = Math.max(30, params.duration || 180);
  const bpm = Math.max(60, Math.min(220, params.bpm || 124));
  const camelotKey = params.camelotKey || '8A';
  const baseEnergy = Math.max(1, Math.min(10, params.baseEnergy || 7));
  const firstBeatSec = Math.max(0, Math.min(4.0, params.firstBeatSec ?? 0.05));

  // Musical timing calculations
  const beatDuration = 60 / bpm;
  const barDuration = beatDuration * 4; // 1 bar (4/4 time)

  /**
   * Snaps a raw second timestamp to the nearest musical phrase boundary (4-bar or 8-bar downbeat)
   */
  const snapToPhrase = (targetSec: number, phraseBars: number = 8): number => {
    const phraseDuration = barDuration * phraseBars;
    const offset = Math.max(0, targetSec - firstBeatSec);
    const phraseIndex = Math.round(offset / phraseDuration);
    const snapped = firstBeatSec + phraseIndex * phraseDuration;
    return Math.max(firstBeatSec, Math.min(duration - 2, snapped));
  };

  // Analyze multi-band waveform if available to detect real energy inflection points
  let detectedCueTimes: number[] = [];

  if (params.waveform && params.waveform.overallEnvelope && params.waveform.overallEnvelope.length >= 600) {
    const { lowBand, midBand, highBand, overallEnvelope } = params.waveform;
    const points = overallEnvelope.length;
    const secPerPoint = duration / points;

    const getEnergyAtSec = (sec: number, band: Float32Array | number[] | ArrayLike<number>) => {
      const idx = Math.max(0, Math.min(points - 1, Math.round(sec / secPerPoint)));
      // 5-point smoothed average
      let sum = 0;
      let count = 0;
      for (let k = -2; k <= 2; k++) {
        const i = idx + k;
        if (i >= 0 && i < points) {
          sum += band[i];
          count++;
        }
      }
      return count > 0 ? sum / count : band[idx];
    };

    // 1. Cue 1: First Downbeat (after initial silence)
    let cue1 = firstBeatSec;
    for (let i = 0; i < Math.min(points, Math.round(10 / secPerPoint)); i++) {
      if (overallEnvelope[i] > 0.04) {
        cue1 = Math.max(0, i * secPerPoint);
        break;
      }
    }
    cue1 = Math.min(cue1, firstBeatSec);

    // 2. Cue 2: Kick / Bassline In (first surge in lowBand after cue 1)
    let cue2Target = duration * 0.12; // default ~12%
    for (let sec = cue1 + 6; sec < duration * 0.30; sec += 0.5) {
      const low = getEnergyAtSec(sec, lowBand);
      if (low > 0.32) {
        cue2Target = sec;
        break;
      }
    }
    const cue2 = Math.max(cue1 + barDuration * 4, snapToPhrase(cue2Target, 8));

    // 3. Cue 3: Verse / Melodic Entry (rise in midBand / vocals)
    let cue3Target = cue2 + (duration * 0.12);
    for (let sec = cue2 + barDuration * 8; sec < duration * 0.42; sec += 1.0) {
      const mid = getEnergyAtSec(sec, midBand);
      if (mid > 0.28) {
        cue3Target = sec;
        break;
      }
    }
    const cue3 = Math.max(cue2 + barDuration * 4, snapToPhrase(cue3Target, 8));

    // 4. Cue 5: Main Drop 1 (Search for peak lowBand explosion between 25% and 55% of track)
    let maxLow = 0;
    let drop1Target = duration * 0.38;
    for (let sec = cue3 + barDuration * 8; sec < duration * 0.55; sec += 0.5) {
      const low = getEnergyAtSec(sec, lowBand);
      if (low > maxLow) {
        maxLow = low;
        drop1Target = sec;
      }
    }
    const cue5 = Math.max(cue3 + barDuration * 8, snapToPhrase(drop1Target, 8));

    // 4. Cue 4: Build-Up 1 (16 or 32 beats before Drop 1)
    const cue4Target = Math.max(cue3 + barDuration * 4, cue5 - barDuration * 8);
    const cue4 = snapToPhrase(cue4Target, 4);

    // 5. Cue 6: Breakdown / Bridge (Look for lowBand cut in middle of track 45% - 75%)
    let minLow = 1.0;
    let breakTarget = duration * 0.58;
    for (let sec = cue5 + barDuration * 16; sec < duration * 0.78; sec += 1.0) {
      const low = getEnergyAtSec(sec, lowBand);
      const mid = getEnergyAtSec(sec, midBand);
      // Low drops, mid/harmonic sustains
      if (low < 0.22 && mid > 0.15 && low < minLow) {
        minLow = low;
        breakTarget = sec;
      }
    }
    const cue6 = Math.max(cue5 + barDuration * 12, snapToPhrase(breakTarget, 8));

    // 6. Cue 7: Peak Drop 2 / Climax (Explosion of energy following breakdown)
    let drop2Target = cue6 + barDuration * 16;
    let maxDrop2 = 0;
    for (let sec = cue6 + barDuration * 8; sec < duration * 0.88; sec += 0.5) {
      const low = getEnergyAtSec(sec, lowBand);
      if (low > maxDrop2) {
        maxDrop2 = low;
        drop2Target = sec;
      }
    }
    const cue7 = Math.max(cue6 + barDuration * 8, snapToPhrase(drop2Target, 8));

    // 7. Cue 8: Outro / Final Beat Fade (Last 12-20% of track where leads cut out)
    const outroTarget = Math.max(cue7 + barDuration * 16, duration * 0.86);
    const cue8 = Math.max(cue7 + barDuration * 8, snapToPhrase(outroTarget, 8));

    detectedCueTimes = [cue1, cue2, cue3, cue4, cue5, cue6, cue7, cue8];
  } else {
    // Musical phrasing heuristic model for electronic / pop / techno arrangements
    if (duration >= 200) {
      // Extended Mix (8 Cues)
      const c1 = firstBeatSec;
      const c2 = snapToPhrase(firstBeatSec + barDuration * 16, 8); // bar 17 (32s at 120)
      const c3 = snapToPhrase(c2 + barDuration * 16, 8);           // bar 33 (64s)
      const c4 = snapToPhrase(c3 + barDuration * 16, 4);           // bar 49 (96s)
      const c5 = snapToPhrase(c4 + barDuration * 8, 8);            // bar 57 (114s) Drop 1
      const c6 = snapToPhrase(duration * 0.56, 8);                 // Breakdown
      const c7 = snapToPhrase(duration * 0.72, 8);                 // Drop 2 Climax
      const c8 = snapToPhrase(duration * 0.86, 8);                 // Outro Beat Out
      detectedCueTimes = [c1, c2, c3, c4, c5, c6, c7, c8];
    } else if (duration >= 130) {
      // Radio / Club Edit (8 Cues compacted)
      const c1 = firstBeatSec;
      const c2 = snapToPhrase(firstBeatSec + barDuration * 8, 4);
      const c3 = snapToPhrase(c2 + barDuration * 8, 4);
      const c4 = snapToPhrase(duration * 0.32, 4);
      const c5 = snapToPhrase(duration * 0.42, 4);
      const c6 = snapToPhrase(duration * 0.60, 4);
      const c7 = snapToPhrase(duration * 0.75, 4);
      const c8 = snapToPhrase(duration * 0.88, 4);
      detectedCueTimes = [c1, c2, c3, c4, c5, c6, c7, c8];
    } else {
      // Short Track (< 130s, 6 Cues)
      const c1 = firstBeatSec;
      const c2 = snapToPhrase(duration * 0.15, 4);
      const c3 = snapToPhrase(duration * 0.32, 4);
      const c4 = snapToPhrase(duration * 0.50, 4);
      const c5 = snapToPhrase(duration * 0.72, 4);
      const c6 = snapToPhrase(duration * 0.88, 4);
      detectedCueTimes = [c1, c2, c3, c4, c5, c6];
    }
  }

  // Ensure strictly ascending order and at least 3.5 seconds between each cue
  const cleanedCues: number[] = [];
  for (let i = 0; i < detectedCueTimes.length; i++) {
    const t = Math.max(0, Math.min(duration - 1.5, detectedCueTimes[i]));
    if (cleanedCues.length === 0) {
      cleanedCues.push(t);
    } else {
      const prev = cleanedCues[cleanedCues.length - 1];
      if (t >= prev + 3.5) {
        cleanedCues.push(t);
      } else {
        const adjusted = snapToPhrase(prev + barDuration * 4, 4);
        if (adjusted < duration - 2 && adjusted > prev + 2.0) {
          cleanedCues.push(adjusted);
        }
      }
    }
  }

  // Standard Mixed In Key 11 Cue Definitions (Up to 8 Slots)
  const CUE_DEFINITIONS = [
    { name: 'Intro (1.1)', color: '#06B6D4' },        // Cyan (First Beat)
    { name: 'First Beat / Bass', color: '#10B981' },  // Emerald (Kick/Bass in)
    { name: 'Verse / Theme', color: '#84CC16' },      // Lime (Melody/Theme)
    { name: 'Build-Up 1', color: '#F59E0B' },         // Amber (Tension rise)
    { name: 'Main Drop 1', color: '#EF4444' },        // Red / Rose (First Drop / Climax)
    { name: 'Breakdown', color: '#A855F7' },          // Purple (Kick cut / Bridge)
    { name: 'Peak Drop 2', color: '#EC4899' },        // Pink (Second Peak / Climax)
    { name: 'Outro Beat Out', color: '#0EA5E9' }      // Sky Blue (Outro Mix Out)
  ];

  const hotCues: HotCue[] = cleanedCues.slice(0, 8).map((timeSec, idx) => {
    const def = CUE_DEFINITIONS[idx] || { name: `Cue ${idx + 1}`, color: '#06B6D4' };
    return {
      id: `cue_${idx + 1}`,
      slot: idx + 1,
      timeMs: Math.round(timeSec * 1000),
      type: 1,
      name: def.name,
      color: def.color
    };
  });

  // Generate continuous Macro-Sections (Bereiche) covering 100% of the track
  const SECTION_NAMES = [
    { name: 'Intro', color: '#3B82F6', energyDelta: -3 },
    { name: 'Bassline / Groove', color: '#06B6D4', energyDelta: -1 },
    { name: 'Verse 1 / Theme', color: '#10B981', energyDelta: 0 },
    { name: 'Build-Up 1', color: '#F59E0B', energyDelta: +1 },
    { name: 'Main Drop 1', color: '#EF4444', energyDelta: +2 },
    { name: 'Breakdown', color: '#A855F7', energyDelta: -2 },
    { name: 'Peak Drop 2', color: '#EC4899', energyDelta: +3 },
    { name: 'Outro', color: '#0EA5E9', energyDelta: -4 }
  ];

  const segments: TrackSegment[] = [];
  const boundaries = [0, ...hotCues.slice(1).map(c => c.timeMs / 1000), duration];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const startSec = boundaries[i];
    const endSec = boundaries[i + 1];
    const segDur = Math.max(0.1, endSec - startSec);
    const def = SECTION_NAMES[i] || { name: `Sektion ${i + 1}`, color: '#64748B', energyDelta: 0 };
    const segEnergy = Math.max(1, Math.min(10, baseEnergy + def.energyDelta));

    segments.push({
      id: `seg_${i + 1}_${def.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      name: def.name,
      energy: segEnergy,
      key: camelotKey,
      duration: Math.round(segDur * 100) / 100,
      startSec: Math.round(startSec * 100) / 100,
      endSec: Math.round(endSec * 100) / 100,
      color: def.color
    });
  }

  // Mood & Style
  const isMinor = camelotKey.endsWith('A');
  let suggestedStyle = 'Melodic House';
  let suggestedMood = 'Treibend & Euphorisch';

  if (bpm >= 134) {
    suggestedStyle = isMinor ? 'Peaktime Techno' : 'Hard Groove / Trance';
    suggestedMood = isMinor ? 'Dunkel & Industriell' : 'Euphorisch & Energetisch';
  } else if (bpm >= 126) {
    suggestedStyle = isMinor ? 'Peaktime Techno' : 'Tech House';
    suggestedMood = 'Treibend & Hypnotisch';
  } else if (bpm >= 120) {
    suggestedStyle = isMinor ? 'Deep Tech / Minimal' : 'Melodic House';
    suggestedMood = isMinor ? 'Hypnotisch & Deep' : 'Entspannt & Groovy';
  } else {
    suggestedStyle = 'Organic House / Downtempo';
    suggestedMood = 'Entspannt & Atmosphärisch';
  }

  return { hotCues, segments, suggestedMood, suggestedStyle };
}

/**
 * Ensures a track has full Mixed In Key 11 structure (up to 8 Hot Cues and detailed Macro-Sections)
 */
export function ensureMixedInKeyStructure(track: any): any {
  if (!track) return track;
  if (track.hotCues && track.hotCues.length >= 7 && track.segments && track.segments.length >= 7) {
    return track;
  }
  const result = generateMixedInKeyStructure({
    duration: track.duration || 210,
    bpm: track.bpm || 124,
    camelotKey: track.key || '8A',
    baseEnergy: track.energy || 7,
    firstBeatSec: track.firstBeatSec || 0.05
  });

  return {
    ...track,
    hotCues: (track.hotCues && track.hotCues.length >= 7) ? track.hotCues : result.hotCues,
    segments: (track.segments && track.segments.length >= 7) ? track.segments : result.segments
  };
}
