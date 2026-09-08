export interface MulimaGroup {
  id: string;
  name: string;
  mood?: string;
  style?: string;
  color?: string;
  createdAt?: number;
}

export type DjoidGroup = MulimaGroup;

export interface TrackSegment {
  id: string;
  name: string;
  energy: number;
  key: string;
  duration: number;
  startSec: number;
  endSec: number;
  color: string;
}

export type HotCue = {
  id: string;
  slot?: number;
  timeMs: number;
  type: number;
  name: string;
  color?: string;
  isLoop?: boolean;
  loopEndMs?: number;
  loopLengthBeats?: number;
  isActive?: boolean;
};

// Precision Downbeat Marker
export interface DownbeatMarker {
  barNumber: number; // 1, 2, 3...
  timeSec: number;
  label: string;     // e.g. "1.1", "2.1", "3.1"
}

// Beatgrid details
export interface BeatGridData {
  bpm: number;
  timeSignature: string; // e.g. "4/4"
  firstBeatSec: number;  // downbeat offset in seconds
  intervalSec: number;   // seconds per beat
  beats: number[];       // array of beat timestamps (seconds)
  downbeats?: DownbeatMarker[];
  subBeats?: number[];   // sub-beat timestamps (beats .2, .3, .4)
  gridLocked?: boolean;
  stabilityScore: number; // 0 to 100%
  barsCount?: number;
}

// Tempo variations & drift
export interface TempoVariationData {
  minBpm: number;
  maxBpm: number;
  avgBpm: number;
  driftBpm: number; // max - min
  stabilityPercent: number; // 0 - 100%
  fluctuations?: { timeSec: number; instantBpm: number }[];
}

// Loudness & Dynamics
export interface LoudnessData {
  lufsIntegrated: number;  // e.g. -8.4 LUFS
  peakDb: number;          // dBFS true peak
  rmsDb: number;           // dBFS average RMS
  dynamicRange: number;    // DR score e.g. 8 (1 to 14)
  crestFactor: number;     // ratio of peak to RMS
  leqDbcFast?: number;     // e.g. 102 dB(C)
  leqDbaSlow?: number;     // e.g. 98 dB(A)
}

// Spectral band details
export interface SpectralBand {
  id: string;
  name: string;
  range: string;
  color: string;
  db: number;
  peakDb: number;
}

// Harmonic peak annotation (matching screenshot)
export interface HarmonicPeak {
  freqHz: number;
  db: number;
  note: string;     // e.g. "Bb 2"
  cents: number;    // e.g. +9
  distanceMeters?: number; // e.g. 2.91 m (acoustic wavelength)
}

// Spectral analysis
export interface SpectralData {
  bands: SpectralBand[];
  spectralCentroidHz: number;
  spectralRolloffHz: number;
  harmonicPeaks: HarmonicPeak[];
  tuningHz: number; // e.g. 440.2 Hz
  tuningCents: number; // e.g. +8 cents
  subBassEnergy: number; // 0 - 100
  bassEnergy: number;
  midEnergy: number;
  highEnergy: number;
}

// Spatial & Stereo field
export interface SpatialData {
  stereoWidthPct: number;    // 0% (mono) to 100% (normal) to 200% (super-wide)
  phaseCorrelation: number;  // -1.0 (anti-phase) to +1.0 (mono in-phase)
  midEnergy: number;         // Center/mono component
  sideEnergy: number;        // Side/stereo component
  channelBalanceDb: number;  // L/R balance in dB
}

// High-precision decimated waveform data (for instant multi-band rendering)
export interface WaveformData {
  sampleRate: number;
  durationSec: number;
  pointsCount: number;
  // Decimated peak envelopes normalized 0.0 - 1.0
  lowBand: Float32Array | number[];  // Bass / Kick (<250Hz) - Red/Orange
  midBand: Float32Array | number[];  // Vocals / Synths (250Hz - 2500Hz) - Green/Yellow
  highBand: Float32Array | number[]; // Hi-hats / Air (>2500Hz) - Blue/Cyan
  overallEnvelope: Float32Array | number[];
}

// Online Portal Metadata info
export interface OnlineMetadataInfo {
  matchedTitle?: string;
  matchedArtist?: string;
  album?: string;
  releaseDate?: string;
  year?: string;
  label?: string;
  catalogNumber?: string;
  genre?: string;
  tags?: string[];
  isrc?: string;
  musicBrainzId?: string;
  discogsUrl?: string;
  beatportUrl?: string;
  traxsourceUrl?: string;
  spotifyUrl?: string;
  tunebatUrl?: string;
  coverArtUrl?: string;
  fetchedAt?: number;
}

// Complete Deep Analysis Container
export interface DeepAnalysisData {
  analyzedAt: number;
  samplingRate: number;
  bitDepth?: number;
  channels: number;
  beatGrid: BeatGridData;
  tempoVariation: TempoVariationData;
  loudness: LoudnessData;
  spectral: SpectralData;
  spatial: SpatialData;
  waveform?: WaveformData;
  musicalKey: string;     // e.g. "Am"
  camelotKey: string;     // e.g. "8A"
  calculatedEnergy: number; // 1 to 10
  suggestedMood: string;
  suggestedStyle: string;
  audioBuffer?: AudioBuffer; // In-memory decoded AudioBuffer for bit-perfect transient rendering
}

export interface TrackDef {
  id: string;
  filename?: string;
  title: string;
  artist: string;
  album?: string;
  year?: string | number;
  genre?: string;
  label?: string;
  comments?: string;
  bpm: number;
  key: string;
  energy: number;
  vibe?: string;
  mood?: string;
  style?: string;
  groups?: string[];
  filePath?: string;
  fileSize?: number;
  format?: string;
  url?: string;
  coverArt?: string;
  gradient?: string;
  segments?: TrackSegment[];
  duration?: number;
  hotCues?: HotCue[];
  file?: File;
  fileFallback?: File;
  fileHandle?: any;
    // Deep Audio Analysis & Online Metadata Extensions
  deepAnalysis?: DeepAnalysisData;
  waveform?: WaveformData;
  beatGrid?: BeatGridData;
  loudness?: LoudnessData;
  spectral?: SpectralData;
  spatial?: SpatialData;
  tempoVariation?: TempoVariationData;
  onlineMetadata?: OnlineMetadataInfo;
  // DJ Beatgrid & Timeline Offset Extensions
  beatgridOffsetMs?: number;
  bpmFineTune?: number;
  timelineOffsetSec?: number;
}

export interface ChapterDef {
  id: string;
  name: string;
  tracks: TrackDef[];
}

export interface PlaylistDef {
  id: string;
  name: string;
  trackIds: string[];
}

export interface DuplicateCandidate {
  id: string;
  filePath: string;
  title: string;
  artist: string;
  fileSize?: number;
  duration?: number;
  format?: string;
  matchReason: 'identical_file' | 'same_metadata' | 'same_hash' | 'filename_match';
}

export interface DuplicateGroup {
  key: string;
  primaryTrack: TrackDef;
  duplicates: TrackDef[];
  reason: string;
}

// DJ Set Transitions & Presets
export type TransitionPresetType = 
  | 'eq-blend'           // 1. Klassischer EQ-Wechsel (Equalizer Blend)
  | 'bass-swap'          // 2. Bass-Swap (Instant Low-End Switch)
  | 'filter-sweep'       // 3. Filter-Sweep (HPF / LPF Transition)
  | 'cut-drop'           // 4. Cut / Drop (Fader Slam)
  | 'equal-power'        // 5. Volume-Fading mit Kurven (Gain Crossfade)
  | 'reverb-rise'        // 6. Reverb Wash / FX Riser Build
  | 'vocal-swap'         // 7. Mid/Vocal Solo Swap
  | 'progressive-filter' // 8. Progressive Double Filter Sweep
  | 'ambient-fade';      // 9. Ambient Slow Crossfade

export interface EnvelopePoint {
  id: string;
  beat: number;  // 0 .. durationBeats
  value: number; // 0.0 .. 1.0 (level or gain)
}

export interface TransitionEnvelopes {
  // 3-Band EQ Overlap Envelopes (Waveform style)
  lowA: EnvelopePoint[];    // Outgoing Bass (Orange)
  lowB: EnvelopePoint[];    // Incoming Bass (Orange)
  midA: EnvelopePoint[];    // Outgoing Mid (Yellow/Cyan)
  midB: EnvelopePoint[];    // Incoming Mid (Yellow/Cyan)
  highA: EnvelopePoint[];   // Outgoing High (Blue)
  highB: EnvelopePoint[];   // Incoming High (Blue)
  volumeA: EnvelopePoint[]; // Outgoing Volume Fader
  volumeB: EnvelopePoint[]; // Incoming Volume Fader
}

export interface TransitionConfig {
  id: string;
  sourceTrackId: string;
  sourceSlotId: string;
  sourceSlotName?: string;
  sourceSlotNumber?: number;
  sourceTimeSec?: number;
  targetTrackId: string;
  targetSlotId: string;
  targetSlotName?: string;
  targetSlotNumber?: number;
  targetTimeSec?: number;
  durationBeats: number; // 8, 16, 32, 64
  durationSec?: number;
  preset: TransitionPresetType;
  curveType?: 'equal-power' | 'linear' | 'cut';
  filterCutoffStart?: number;
  filterCutoffEnd?: number;
  // Waveform Overlap & Traktor / Serato Mixer Extensions
  envelopes?: TransitionEnvelopes;
  tempoSync?: boolean;
  bpmA?: number;
  bpmB?: number;
  targetBpm?: number;
  pitchShiftPercent?: number;
  keyCompatibility?: {
    score: number; // 0 to 100%
    label: string; // e.g. "Perfect Match", "Energy Boost +1", "Clash"
    type: 'perfect' | 'adjacent' | 'relative' | 'clash';
  };
}

export interface DjSetData {
  transitions: TransitionConfig[];
  activeTransitionId?: string;
  masterBpm?: number;
}
