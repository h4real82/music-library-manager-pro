import { getTrackWaveformSlice } from '../src/lib/waveformGenerator';
import { TrackDef, TrackSegment } from '../src/types';

function generateTrack(segmentCount: number): TrackDef {
  const duration = 300; // 5 minutes
  const segments: TrackSegment[] = [];
  const segDuration = duration / segmentCount;

  for (let i = 0; i < segmentCount; i++) {
    const startSec = i * segDuration;
    const endSec = (i + 1) * segDuration;
    let name = 'verse';
    if (i % 5 === 0) name = 'intro';
    else if (i % 5 === 1) name = 'build';
    else if (i % 5 === 2) name = 'drop';
    else if (i % 5 === 3) name = 'breakdown';
    else if (i % 5 === 4) name = 'outro';

    segments.push({
      id: `seg_${i}`,
      name: `${name}_${i}`,
      energy: 5,
      key: '8A',
      duration: segDuration,
      startSec,
      endSec,
      color: '#ffffff'
    });
  }

  return {
    id: 'test_track',
    title: 'Test Track',
    artist: 'Test Artist',
    bpm: 128,
    key: '8A',
    energy: 8,
    duration,
    segments
  };
}

export function runBenchmark() {
  const segmentCounts = [10, 50, 200];
  const iterationsPerTrack = 100000;

  console.log(`--- WAVEFORM GENERATOR BENCHMARK (${iterationsPerTrack.toLocaleString()} slices) ---`);

  for (const count of segmentCounts) {
    const track = generateTrack(count);
    const start = performance.now();

    for (let i = 0; i < iterationsPerTrack; i++) {
      const sliceTime = (i / iterationsPerTrack) * track.duration!;
      getTrackWaveformSlice(track, null, sliceTime, track.duration!, 0, 60 / 128);
    }

    const elapsed = performance.now() - start;
    const opsPerSec = Math.round((iterationsPerTrack / elapsed) * 1000);
    console.log(`Segments: ${count.toString().padStart(4)} | Time: ${elapsed.toFixed(2).padStart(7)} ms | Ops/sec: ${opsPerSec.toLocaleString().padStart(10)}`);
  }
}

runBenchmark();
