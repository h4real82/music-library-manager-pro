import { describe, it, expect } from 'vitest';
import { findActiveSegment, getTrackWaveformSlice } from './waveformGenerator';
import { TrackDef, TrackSegment } from '../types';

describe('findActiveSegment', () => {
  it('should find active segment accurately across timelines and boundary conditions', () => {
    const segments: TrackSegment[] = [
      { id: '1', name: 'Intro', startSec: 0, endSec: 30, energy: 3, key: '8A', duration: 30, color: '#000' },
      { id: '2', name: 'Build', startSec: 30, endSec: 60, energy: 6, key: '8A', duration: 30, color: '#000' },
      { id: '3', name: 'Drop', startSec: 60, endSec: 120, energy: 9, key: '8A', duration: 60, color: '#000' },
      { id: '4', name: 'Breakdown', startSec: 150, endSec: 180, energy: 4, key: '8A', duration: 30, color: '#000' }, // Gap 120-150
    ];

    expect(findActiveSegment(segments, 0)?.id).toBe('1');
    expect(findActiveSegment(segments, 15)?.id).toBe('1');
    expect(findActiveSegment(segments, 30)?.id).toBe('2');
    expect(findActiveSegment(segments, 90)?.id).toBe('3');
    expect(findActiveSegment(segments, 135)).toBeUndefined();
    expect(findActiveSegment(segments, 200)).toBeUndefined();
    expect(findActiveSegment(segments, -5)).toBeUndefined();
    expect(findActiveSegment([], 10)).toBeUndefined();
  });
});

describe('getTrackWaveformSlice', () => {
  const dummyTrack: TrackDef = {
    id: 'test-track-1',
    title: 'Festival Banger',
    artist: 'DJ Antigravity',
    album: 'Peak Time',
    duration: 180,
    bpm: 128,
    key: '11B',
    path: '/music/track1.mp3',
    genre: 'Tech House',
  };

  it('should compute valid waveform slice metrics with 2 arguments (track, sliceTime)', () => {
    const slice = getTrackWaveformSlice(dummyTrack, 30);
    expect(slice).toBeDefined();
    expect(slice.bodyAmp).toBeGreaterThan(0);
    expect(slice.needleAmp).toBeGreaterThan(0);
    expect(slice.coreAmp).toBeGreaterThan(0);
    expect(Number.isNaN(slice.bodyAmp)).toBe(false);
    expect(Number.isNaN(slice.needleAmp)).toBe(false);
    expect(typeof slice.isKick).toBe('boolean');
    expect(typeof slice.isDownbeat).toBe('boolean');
  });

  it('should compute valid waveform slice metrics with full arguments', () => {
    const slice = getTrackWaveformSlice(
      dummyTrack,
      null,
      60,
      180,
      0.05,
      60 / 128,
      null,
      0.1
    );
    expect(slice).toBeDefined();
    expect(slice.bodyAmp).toBeGreaterThanOrEqual(0.1);
    expect(slice.needleAmp).toBeGreaterThanOrEqual(0.1);
    expect(slice.needleAmp).toBeLessThanOrEqual(1.0);
    expect(Number.isNaN(slice.bodyAmp)).toBe(false);
  });

  it('should handle zero-duration and missing BPM safely without NaN or infinity', () => {
    const bareTrack = { id: 'bare' } as TrackDef;
    const slice = getTrackWaveformSlice(bareTrack, 10);
    expect(slice).toBeDefined();
    expect(Number.isNaN(slice.bodyAmp)).toBe(false);
    expect(Number.isNaN(slice.needleAmp)).toBe(false);
    expect(Number.isNaN(slice.coreAmp)).toBe(false);
    expect(Number.isNaN(slice.floorAmp)).toBe(false);
  });
});

