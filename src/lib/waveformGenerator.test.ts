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
