import { TrackSegment } from '../types';
import { generateMixedInKeyStructure } from './mixedInKeyDetection';

export type { TrackSegment };

export async function analyzeTrackSegments(url: string, baseKey: string, baseEnergy: number): Promise<TrackSegment[]> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onLoad);
      audio.removeEventListener('error', onError);
    };

    const onLoad = () => {
      cleanup();
      const dur = audio.duration || 180; // fallback to 3 mins if unknown
      
      const res = generateMixedInKeyStructure({
        duration: dur,
        bpm: 124,
        camelotKey: baseKey,
        baseEnergy: baseEnergy
      });
      resolve(res.segments);
    };

    const onError = () => {
      cleanup();
      resolve([]);
    };

    audio.addEventListener('loadedmetadata', onLoad);
    audio.addEventListener('error', onError);
    
    // Trigger load
    audio.currentTime = 0;
  });
}
