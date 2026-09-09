import { findActiveSegment, getTrackWaveformSlice } from './waveformGenerator';
import { TrackDef, TrackSegment } from '../types';

export function testFindActiveSegment() {
  console.log('Testing findActiveSegment...');

  const segments: TrackSegment[] = [
    { id: '1', name: 'Intro', startSec: 0, endSec: 30, energy: 3, key: '8A', duration: 30, color: '#000' },
    { id: '2', name: 'Build', startSec: 30, endSec: 60, energy: 6, key: '8A', duration: 30, color: '#000' },
    { id: '3', name: 'Drop', startSec: 60, endSec: 120, energy: 9, key: '8A', duration: 60, color: '#000' },
    { id: '4', name: 'Breakdown', startSec: 150, endSec: 180, energy: 4, key: '8A', duration: 30, color: '#000' }, // Gap 120-150
  ];

  // 1. First segment start boundary
  let seg = findActiveSegment(segments, 0);
  console.assert(seg?.id === '1', `Expected seg 1 at time 0, got ${seg?.id}`);

  // 2. Mid segment
  seg = findActiveSegment(segments, 15);
  console.assert(seg?.id === '1', `Expected seg 1 at time 15, got ${seg?.id}`);

  // 3. Boundary transition (upper bound excluded: sliceTime < endSec)
  seg = findActiveSegment(segments, 30);
  console.assert(seg?.id === '2', `Expected seg 2 at time 30, got ${seg?.id}`);

  // 4. Drop segment
  seg = findActiveSegment(segments, 90);
  console.assert(seg?.id === '3', `Expected seg 3 at time 90, got ${seg?.id}`);

  // 5. Gap between segments (120 - 150)
  seg = findActiveSegment(segments, 135);
  console.assert(seg === undefined, `Expected undefined in gap at time 135, got ${seg?.id}`);

  // 6. After last segment
  seg = findActiveSegment(segments, 200);
  console.assert(seg === undefined, `Expected undefined after end at time 200, got ${seg?.id}`);

  // 7. Before first segment
  seg = findActiveSegment(segments, -5);
  console.assert(seg === undefined, `Expected undefined before start at time -5, got ${seg?.id}`);

  // 8. Empty array
  seg = findActiveSegment([], 10);
  console.assert(seg === undefined, `Expected undefined for empty array, got ${seg?.id}`);

  // 9. Unsorted segments fallback check
  const unsortedSegments: TrackSegment[] = [
    { id: '3', name: 'Drop', startSec: 60, endSec: 120, energy: 9, key: '8A', duration: 60, color: '#000' },
    { id: '1', name: 'Intro', startSec: 0, endSec: 30, energy: 3, key: '8A', duration: 30, color: '#000' },
    { id: '2', name: 'Build', startSec: 30, endSec: 60, energy: 6, key: '8A', duration: 30, color: '#000' },
  ];

  seg = findActiveSegment(unsortedSegments, 15);
  console.assert(seg?.id === '1', `Unsorted fallback expected seg 1 at time 15, got ${seg?.id}`);

  seg = findActiveSegment(unsortedSegments, 90);
  console.assert(seg?.id === '3', `Unsorted fallback expected seg 3 at time 90, got ${seg?.id}`);

  console.log('ALL findActiveSegment TESTS PASSED SUCCESSFULLY!');
}

testFindActiveSegment();
