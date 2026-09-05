export type TrackSegment = {
  id: string;
  name: string;
  energy: number;
  key: string;
  duration: number;
  startSec: number;
  endSec: number;
  color: string;
};

function alterKey(key: string) {
  const match = key.match(/(\d+)([AB])/);
  if (!match) return key;
  let num = parseInt(match[1]);
  num = num === 12 ? 1 : num + 1;
  return `${num}${match[2]}`;
}

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
      
      const segments: TrackSegment[] = [
        { id: Math.random().toString(36).substring(2,9), name: 'Intro', energy: Math.max(1, baseEnergy - 3), key: baseKey, duration: dur * 0.15, startSec: 0, endSec: dur * 0.15, color: '#3b82f6' },
        { id: Math.random().toString(36).substring(2,9), name: 'Build-Up', energy: Math.max(1, baseEnergy - 1), key: baseKey, duration: dur * 0.15, startSec: dur * 0.15, endSec: dur * 0.30, color: '#a855f7' },
        { id: Math.random().toString(36).substring(2,9), name: 'Drop 1', energy: Math.min(10, baseEnergy + 2), key: baseKey, duration: dur * 0.30, startSec: dur * 0.30, endSec: dur * 0.60, color: '#ef4444' },
        { id: Math.random().toString(36).substring(2,9), name: 'Break', energy: Math.max(1, baseEnergy - 2), key: alterKey(baseKey), duration: dur * 0.20, startSec: dur * 0.60, endSec: dur * 0.80, color: '#f59e0b' },
        { id: Math.random().toString(36).substring(2,9), name: 'Outro', energy: Math.max(1, baseEnergy - 4), key: baseKey, duration: dur * 0.20, startSec: dur * 0.80, endSec: dur, color: '#10b981' },
      ];
      resolve(segments);
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
