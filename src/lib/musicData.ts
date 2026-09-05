import { TrackDef } from '../types';

export const MOCK_TRACKS: TrackDef[] = [
  { id: '1', title: 'Neon Paradox', artist: 'Cyberthump', bpm: 128, key: '8A', energy: 9, vibe: 'Hypnotic' },
  { id: '2', title: 'Solstice Rising', artist: 'Lumina', bpm: 128, key: '8B', energy: 8, vibe: 'Euphoric' },
  { id: '3', title: 'Deep Resonance', artist: 'Void Walker', bpm: 124, key: '7A', energy: 5, vibe: 'Dark' },
  { id: '4', title: 'Chrome Jungle', artist: 'Mecha', bpm: 132, key: '9A', energy: 10, vibe: 'Aggressive' },
  { id: '5', title: 'Acid Rain', artist: '303 State', bpm: 130, key: '10A', energy: 8, vibe: 'Acid' },
  { id: '6', title: 'Morning Dew', artist: 'Ambient Chill', bpm: 118, key: '6B', energy: 3, vibe: 'Melancholic' },
  { id: '7', title: 'Galactic Groove', artist: 'Starfunk', bpm: 126, key: '8A', energy: 7, vibe: 'Groovy' },
  { id: '8', title: 'Velocity', artist: 'Overdrive', bpm: 135, key: '10B', energy: 9, vibe: 'Driving' },
  { id: '9', title: 'Silent Steps', artist: 'Ghost', bpm: 120, key: '7B', energy: 4, vibe: 'Minimal' },
  { id: '10', title: 'Solar Flare', artist: 'Apex', bpm: 128, key: '9B', energy: 8, vibe: 'Radiant' },
];

export function getHarmonicMatchScore(key1: string, key2: string): 'perfect' | 'good' | 'clash' {
  if (key1 === key2) return 'perfect';
  
  const num1 = parseInt(key1);
  const letter1 = key1.replace(/[0-9]/g, '');
  const num2 = parseInt(key2);
  const letter2 = key2.replace(/[0-9]/g, '');

  // Same number, different letter (e.g., 8A -> 8B)
  if (num1 === num2 && letter1 !== letter2) return 'good';
  
  // Adjacent numbers, same letter
  let diff = Math.abs(num1 - num2);
  if (diff === 11) diff = 1; // 12 to 1 is a distance of 1

  if (diff <= 1 && letter1 === letter2) return 'good';

  return 'clash';
}
