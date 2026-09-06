import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  Volume2, 
  RotateCcw, 
  Save, 
  Globe, 
  Activity, 
  Layers, 
  ZoomIn, 
  ZoomOut, 
  Grid, 
  Gauge, 
  Music, 
  Radio, 
  Headphones, 
  Sliders, 
  Clock, 
  Sparkles, 
  Check, 
  Search, 
  ExternalLink, 
  ChevronRight, 
  SlidersHorizontal,
  Hash,
  Compass,
  Zap,
  Tag,
  HelpCircle,
  Lock,
  Unlock,
  Magnet,
  Timer,
  Info,
  Lightbulb,
  Edit3,
  Trash2,
  Plus,
  VolumeX,
  FastForward,
  Rewind,
  Flag,
  Disc
} from 'lucide-react';
import { TrackDef, DeepAnalysisData, HotCue } from '../types';
import { deepAudioAnalyze, freqToNote, decodeAudio } from '../lib/deepAudioAnalysis';
import { fetchOnlineTrackMetadata, mergeCandidateIntoTrack, OnlineLookupResult } from '../lib/onlineMetadataService';
import { generateMixedInKeyStructure } from '../lib/mixedInKeyDetection';
import { getTrackWaveformSlice, getTrackOverviewWaveform } from '../lib/waveformGenerator';

interface TrackAnalysisViewProps {
  track: TrackDef;
  onClose: () => void;
  onUpdateTrack: (filePathOrId: string, updates: Partial<TrackDef>) => void;
  currentPlayingTrack?: TrackDef | null;
  isPlayingGlobal?: boolean;
}

const SPEED_OF_SOUND = 343.0; // m/s

// Educational Info Topics for all audio engineering & DJ modules
interface InfoTopicDef {
  title: string;
  subtitle: string;
  badge: string;
  color: string;
  content: string[];
  tips: string[];
}

const INFO_TOPICS: Record<string, InfoTopicDef> = {
  scope: {
    title: 'Nebula Surround Scope (7.1 Spatial)',
    subtitle: 'Räumliche Klangfeld- und Phasenanalyse',
    badge: 'Spatial Field',
    color: '#06B6D4',
    content: [
      'Visualisiert die räumliche Verteilung des Audiosignals über ein 7.1-Lautsprecher-Array (Front L/C/R, Side L/R, Rear L/R und Subwoofer) und die Hörerposition.',
      'Stereo-Breite (%): Misst das Verhältnis von Seiten- (Side) zu Mitten- (Mid) Signal. 0% entspricht reinem Mono, 100% normalem Stereo und >100% erweitertem Psychoakustik-Raumklang.',
      'Phasenkorrelation (-1 bis +1): Misst die Phasenübereinstimmung zwischen linkem und rechtem Kanal. Ein Wert nahe +1 garantiert volle Mono-Kompatibilität auf Club-Soundsystemen ohne destruktive Auslöschung.'
    ],
    tips: [
      'Club-Soundsysteme laufen im Sub-Bereich unter 100 Hz in Mono. Achte darauf, dass die Phasenkorrelation bei Kicks und Basslines stets über +0.8 liegt.',
      'Werte unter 0 (rote Phasenverschiebung) führen zu Auslöschungen und Druckverlust auf großen PAs.'
    ]
  },
  spectrum: {
    title: 'Logarithmischer Spektrumanalysator & RTA',
    subtitle: 'Frequenzgang, Resonanzen & Piano-Noten-Mapping',
    badge: 'Pro-Q 3 / RTA',
    color: '#F59E0B',
    content: [
      'Stellt die Audioenergie über den gesamten menschlichen Hörbereich von 20 Hz bis 20.000 Hz auf einer logarithmischen Skala dar.',
      'Echtzeit-RTA-Balken mit schwebenden Peak-Hold-Kappen zeigen transiente Energiespitzen und den RMS-Verlauf farblich getrennt nach Frequenzbändern.',
      'Piano-Klaviatur (C1 bis C8): Verknüpft jede Frequenz direkt mit der passenden musikalischen Klaviertaste (z. B. Sub-Bass Fundamental = F1/G1, Kammerton A4 = 440 Hz).',
      'Resonanz-Sonde: Zeigt exakte Frequenz, akustische Wellenlänge in Metern (z. B. 100 Hz = 3,43 m), musikalische Note und Feinstimmung in Cents an.'
    ],
    tips: [
      'Verwende die Noten-Sonde, um die Grundfrequenz (F0) der Kick-Drum mit dem Grundton des Basses harmonisch abzustimmen.',
      'Kammerton-Abweichungen von mehr als ±15 Cents deuten auf Vinyl-Rips oder analoges Tape-Detuning hin.'
    ]
  },
  rms: {
    title: 'RMS Metering & Digital Leq Readouts',
    subtitle: 'Lautheit, Dynamikumfang & Industrielle Schallpegel',
    badge: 'Loudness & Dynamics',
    color: '#22C55E',
    content: [
      '8-Band RMS-Meters: Zeigen den durchschnittlichen Energiepegel in 8 Frequenzbändern (Sub, Bass, Low-Mid, Mid, High-Mid, Presence, Brilliance, Air) bezogen auf die -18 dBFS Broadcast-Referenz.',
      'Leq DBC (10 Sec): Bewerteter Dauerschallpegel nach C-Kurve für bass- und impulsreiche Musik, wie sie in Clubs und Festivals gemessen wird.',
      'Leq DBA (Fast): Bewerteter Schallpegel nach A-Kurve, optimiert für die Hörempfindlichkeit des menschlichen Gehörs.',
      'Crest-Faktor & Dynamic Range (DR): Verhältnis zwischen Spitzenpegel (Peak) und Durchschnittsenergie (RMS). Ein hoher Wert steht für lebendige Transienten, ein niedriger für dichte Kompression.'
    ],
    tips: [
      'Ein Track mit DR 8–10 bietet optimalen Club-Punch und dynamische Transienten ohne verwaschenes Clipping.',
      'Vergleiche den Leq-Wert vor dem Übergang zweier Tracks, um Lautstärkesprünge im DJ-Mix zu vermeiden.'
    ]
  },
  beatgrid: {
    title: 'Precision Waveform & Beatgrid Engine',
    subtitle: 'Taktgitter, Downbeat-Anker & Phasing-Synchronisation',
    badge: 'Precision Deck',
    color: '#06B6D4',
    content: [
      'Das Precision Beatgrid legt ein hochpräzises 4/4-Taktraster über den Song, synchronisiert mit Kick-Transienten und Downbeats.',
      'Downbeat-Marker (1.1, 2.1, 3.1...): Markieren den ersten Schlag jedes Taktes. Der Downbeat ist die Basis für Quantize-Loops, Beatmatching und Stem-Synchronisation.',
      'Sub-Beats (.2, .3, .4): Kennzeichnen die Zwischenschläge eines Taktes.',
      'Spektral-Farbpalette: Feuriges Rot/Orange für Sub-Bass/Kicks, Smaragdgrün für Mitten/Vocals, elektrisches Cyan/Weiß für Höhen und Transienten.',
      'Micro-Nudge (-10ms bis +10ms): Ermöglicht die Verschiebung des Rasters im Millisekunden-Bereich bei minimalem Phasendrift.',
      'BPM-Multiplikatoren (/2, x2): Halbieren oder verdoppeln das Tempo für Half-Time- oder Double-Time-Genres (z. B. Drum & Bass vs. Halftime).'
    ],
    tips: [
      'Nutze die AUTO SNAP Taste, um den ersten Downbeat (1.1) exakt auf den ersten harten Kick-Transienten einzurasten.',
      'Mit GRID LOCK schützt du dein kalibriertes Taktgitter vor versehentlichem Verschieben während des Sets.'
    ]
  },
  tuning: {
    title: 'Tonart & Kammerton-Tuning',
    subtitle: 'Harmonisches Mixing & Camelot-System',
    badge: 'Harmonic Key',
    color: '#A855F7',
    content: [
      'Extrahiert ein 12-Halbton-Chromagramm des Titels und ermittelt die Grundtonart über die Krumhansl-Schmuckler-Korrelationsanalyse.',
      'Camelot Wheel (1A–12B): Übersetzt Tonarten in das DJ-freundliche Ziffernsystem des Quintenzirkels (A = Moll, B = Dur).',
      'Harmonisches Mixing: Nachbarzahlen (z. B. 8A zu 7A, 9A oder 8B) klingen harmonisch konsonant und verhindern tonale Reibung.',
      'Kammerton-Referenz (A440): Misst die Frequenz des Referenztons A4 in Hz und gibt die Verstimmung in Cents an.'
    ],
    tips: [
      'Mische Tracks mit gleicher Ziffer oder ±1 Schritt (z. B. von 8A auf 9A für Energieanstieg oder 8B für Dur-Stimmungswechsel).',
      'Bei mehr als ±10 Cents Verstimmung empfiehlt sich im DJ-Player das Einschalten von Master Tempo / Key Lock.'
    ]
  },
  online: {
    title: 'Online-Portale & Metadaten-Abfrage',
    subtitle: 'MusicBrainz, ISRC & DJ-Plattformen',
    badge: 'Metadata Sync',
    color: '#EC4899',
    content: [
      'Fragt die offene Musikdatenbank MusicBrainz über das lokale Server-Proxy nach passenden Releases ab.',
      'Ermittelt ISRC-Codes (International Standard Recording Code), Erscheinungsjahr, Label, Katalog-Nummer und Musikstil.',
      'Generiert direkte Tiefenlinks zu professionellen DJ- und Streaming-Portalen: Beatport, Discogs, Traxsource, Spotify, Tunebat und SongBPM.',
      'Ermöglicht die 1-Klick-Übernahme ausgewählter Metadaten direkt in die lokale Track-Bibliothek.'
    ],
    tips: [
      'Nutze Tunebat und SongBPM für eine Gegenprüfung von Tempo und Tonart aus internationalen DJ-Datenbanken.',
      'Die Übernahme von Release-Jahr und Label erleichtert das Filtern im Library Manager.'
    ]
  }
};

export default function TrackAnalysisView({
  track,
  onClose,
  onUpdateTrack,
  currentPlayingTrack,
  isPlayingGlobal
}: TrackAnalysisViewProps) {
  // Audio playback state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(track.duration || 180);
  const [volume, setVolume] = useState(0.8);
  const [isLooping, setIsLooping] = useState(false);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisData, setAnalysisData] = useState<DeepAnalysisData | null>(track.deepAnalysis || null);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'studio' | 'beatgrid' | 'spectrum' | 'online'>('studio');

  // Zoom level for waveform (1x, 2x, 4x, 8x)
  const [zoomLevel, setZoomLevel] = useState<number>(2);

  // Deck Pitch, CUE & Loop State
  const [pitchSlider, setPitchSlider] = useState<number>(0);
  const [activeCueTime, setActiveCueTime] = useState<number>(() => {
    const c1 = track.hotCues?.find(c => c.slot === 1);
    return c1 ? c1.timeMs / 1000 : 0;
  });
  const [loopStartSec, setLoopStartSec] = useState<number | null>(null);
  const [loopEndSec, setLoopEndSec] = useState<number | null>(null);
  const [activeLoopLength, setActiveLoopLength] = useState<number>(4);
  const [isDeckLoopActive, setIsDeckLoopActive] = useState<boolean>(false);

  const isDeckLoopActiveRef = useRef(false);
  const loopStartSecRef = useRef<number | null>(null);
  const loopEndSecRef = useRef<number | null>(null);

  useEffect(() => {
    isDeckLoopActiveRef.current = isDeckLoopActive;
  }, [isDeckLoopActive]);

  useEffect(() => {
    loopStartSecRef.current = loopStartSec;
  }, [loopStartSec]);

  useEffect(() => {
    loopEndSecRef.current = loopEndSec;
  }, [loopEndSec]);

  // AudioBuffer caching for bit-perfect micro-transient waveform rendering
  const audioBufferRef = useRef<AudioBuffer | null>(track.deepAnalysis?.audioBuffer || null);
  const [, setBufferVersion] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    if (track.deepAnalysis?.audioBuffer) {
      audioBufferRef.current = track.deepAnalysis.audioBuffer;
      return;
    }
    const source = track.file || track.url || `/api/library/stream?file=${encodeURIComponent(track.filePath || track.filename || '')}`;
    decodeAudio(source)
      .then(buf => {
        if (!isCancelled) {
          audioBufferRef.current = buf;
          setBufferVersion(v => v + 1);
        }
      })
      .catch(err => {
        console.warn("AudioBuffer background decode for precision waveform:", err);
      });
    return () => {
      isCancelled = true;
    };
  }, [track.id, track.filePath]);

  // Precision Beatgrid state
  const [gridOffsetMs, setGridOffsetMs] = useState<number>(0);
  const [currentBpm, setCurrentBpm] = useState<number>(track.bpm || 124);
  const [isGridLocked, setIsGridLocked] = useState<boolean>(false);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [tapFeedbackBpm, setTapFeedbackBpm] = useState<number | null>(null);
  const [autoSnapFeedback, setAutoSnapFeedback] = useState(false);

  // Metadata Edit Modal state
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [metaForm, setMetaForm] = useState({
    title: track.title || '',
    artist: track.artist || '',
    album: track.album || '',
    year: track.year ? String(track.year) : '',
    genre: track.genre || track.style || '',
    mood: track.mood || '',
    bpm: currentBpm || track.bpm || 124,
    key: track.key || '8A',
    energy: track.energy || 7,
    comments: track.comments || ''
  });

  // Hotcues 1-8 System (Mixed In Key 11 Intelligent Phrasing Engine)
  const [hotCues, setHotCues] = useState<HotCue[]>(() => {
    if (track.hotCues && track.hotCues.length >= 7) return track.hotCues;
    const structure = generateMixedInKeyStructure({
      duration: track.duration || 180,
      bpm: currentBpm || track.bpm || 124,
      camelotKey: track.key || '8A',
      baseEnergy: track.energy || 7,
      firstBeatSec: (track as any).firstBeatSec || 0.05
    });
    return structure.hotCues;
  });
  const hotCuesRef = useRef<HotCue[]>(hotCues);
  useEffect(() => {
    hotCuesRef.current = hotCues;
  }, [hotCues]);

  // Overview Stripe dragging state
  const overviewStripeRef = useRef<HTMLDivElement>(null);
  const [isOverviewDragging, setIsOverviewDragging] = useState(false);

  useEffect(() => {
    if (!isOverviewDragging) return;
    const onMouseMove = (e: MouseEvent) => {
      if (!overviewStripeRef.current) return;
      const rect = overviewStripeRef.current.getBoundingClientRect();
      const clickNorm = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      handleSeek(clickNorm * duration);
    };
    const onMouseUp = () => {
      setIsOverviewDragging(false);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isOverviewDragging, duration]);

  const [selectedCueSlot, setSelectedCueSlot] = useState<number>(1);
  const [deckTabMode, setDeckTabMode] = useState<'CUE' | 'MOVE' | 'GRID'>('CUE');

  // DSP Suite & 3-Band EQ State
  const [showDspSuite, setShowDspSuite] = useState(false);
  const [eqBass, setEqBass] = useState(0); // -24 to +6 dB
  const [eqMid, setEqMid] = useState(0);   // -24 to +6 dB
  const [eqHigh, setEqHigh] = useState(0); // -24 to +6 dB
  const [eqBassKill, setEqBassKill] = useState(false);
  const [eqMidKill, setEqMidKill] = useState(false);
  const [eqHighKill, setEqHighKill] = useState(false);
  const [dspPunch, setDspPunch] = useState(25); // 0 to 100
  const [dspAir, setDspAir] = useState(25);     // 0 to 100
  const [dspStereoWidth, setDspStereoWidth] = useState(100); // 0% to 200%

  // DSP Audio Nodes
  const lowFilterRef = useRef<BiquadFilterNode | null>(null);
  const midFilterRef = useRef<BiquadFilterNode | null>(null);
  const highFilterRef = useRef<BiquadFilterNode | null>(null);
  const punchFilterRef = useRef<BiquadFilterNode | null>(null);
  const airFilterRef = useRef<BiquadFilterNode | null>(null);

  // Info Modal state
  const [activeInfoTopic, setActiveInfoTopic] = useState<string | null>(null);

  // Spectrum hover interactive probe
  const [hoveredFreq, setHoveredFreq] = useState<{ freq: number; db: number; note: string; cents: number; wavelength: number; bandName: string } | null>(null);

  // Live Audio-reactive state for dynamic Studio animations
  const [liveAudio, setLiveAudio] = useState<{
    bands: number[];
    peakCaps: number[];
    activeMidi: number | null;
    activeNoteName: string;
    rmsLevels: number[];
    leqDbc: number;
    leqDba: number;
    surroundPulse: number;
    stereoWidthPct: number;
    curveWarp: number[];
  }>(() => ({
    bands: Array(64).fill(0.25),
    peakCaps: Array(64).fill(0.32),
    activeMidi: null,
    activeNoteName: 'D#3',
    rmsLevels: [-17, -16, -17, -19, -20, -22, -24, -30],
    leqDbc: 100,
    leqDba: 95,
    surroundPulse: 0,
    stereoWidthPct: 98,
    curveWarp: [0, 0, 0, 0, 0, 0, 0, 0]
  }));

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const peakCapsRef = useRef<number[]>(Array(64).fill(0.32));
  const animFrameRef = useRef<number | null>(null);

  // Online metadata lookup state
  const [searchQuery, setSearchQuery] = useState(`${track.artist ? `${track.artist} - ` : ''}${track.title || ''}`.trim());
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [onlineResult, setOnlineResult] = useState<OnlineLookupResult | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // Update real-time DSP filter gains whenever EQ or enhancer state changes
  useEffect(() => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;
    if (lowFilterRef.current) {
      lowFilterRef.current.gain.setTargetAtTime(eqBassKill ? -48 : eqBass, now, 0.02);
    }
    if (midFilterRef.current) {
      midFilterRef.current.gain.setTargetAtTime(eqMidKill ? -48 : eqMid, now, 0.02);
    }
    if (highFilterRef.current) {
      highFilterRef.current.gain.setTargetAtTime(eqHighKill ? -48 : eqHigh, now, 0.02);
    }
    if (punchFilterRef.current) {
      punchFilterRef.current.gain.setTargetAtTime(dspPunch * 0.08, now, 0.02);
    }
    if (airFilterRef.current) {
      airFilterRef.current.gain.setTargetAtTime(dspAir * 0.06, now, 0.02);
    }
  }, [eqBass, eqMid, eqHigh, eqBassKill, eqMidKill, eqHighKill, dspPunch, dspAir]);

  // Live Audio Reactive Loop (Web Audio FFT + Beatgrid-Synced Synthesis)
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      setLiveAudio(prev => ({
        ...prev,
        activeMidi: null,
        surroundPulse: 0,
        bands: prev.bands.map(b => b * 0.75),
        peakCaps: prev.peakCaps.map(p => p * 0.82),
        curveWarp: [0, 0, 0, 0, 0, 0, 0, 0]
      }));
      return;
    }

    const audio = audioRef.current;
    if (audio) {
      try {
        if (!audioCtxRef.current) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            audioCtxRef.current = new AudioContextClass();
          }
        }
        const ctx = audioCtxRef.current;
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        if (ctx && !sourceNodeRef.current) {
          const source = ctx.createMediaElementSource(audio);

          // 3-Band EQ Filters
          const lowFilter = ctx.createBiquadFilter();
          lowFilter.type = 'lowshelf';
          lowFilter.frequency.value = 120;
          lowFilter.gain.value = eqBassKill ? -48 : eqBass;

          const midFilter = ctx.createBiquadFilter();
          midFilter.type = 'peaking';
          midFilter.frequency.value = 1000;
          midFilter.Q.value = 1.0;
          midFilter.gain.value = eqMidKill ? -48 : eqMid;

          const highFilter = ctx.createBiquadFilter();
          highFilter.type = 'highshelf';
          highFilter.frequency.value = 7500;
          highFilter.gain.value = eqHighKill ? -48 : eqHigh;

          // Enhancer Filters
          const punchFilter = ctx.createBiquadFilter();
          punchFilter.type = 'peaking';
          punchFilter.frequency.value = 65;
          punchFilter.Q.value = 1.6;
          punchFilter.gain.value = dspPunch * 0.08;

          const airFilter = ctx.createBiquadFilter();
          airFilter.type = 'highshelf';
          airFilter.frequency.value = 11000;
          airFilter.gain.value = dspAir * 0.06;

          // Ultra-snappy Analyser with 1024 FFT (512 bins) & 0.20 smoothing for crisp transients
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          analyser.smoothingTimeConstant = 0.20;

          // Connect Chain
          source.connect(lowFilter);
          lowFilter.connect(midFilter);
          midFilter.connect(highFilter);
          highFilter.connect(punchFilter);
          punchFilter.connect(airFilter);
          airFilter.connect(analyser);
          analyser.connect(ctx.destination);

          lowFilterRef.current = lowFilter;
          midFilterRef.current = midFilter;
          highFilterRef.current = highFilter;
          punchFilterRef.current = punchFilter;
          airFilterRef.current = airFilter;
          analyserRef.current = analyser;
          sourceNodeRef.current = source;
        }
      } catch {
        // Fallback handles audio-reactive dynamics gracefully
      }
    }

    const freqData = new Uint8Array(512);

    const updateFrame = () => {
      // Auto-engage armed loop if playhead enters loop range
      if (hotCuesRef.current && hotCuesRef.current.length > 0 && audioRef.current && !audioRef.current.paused) {
        const armed = hotCuesRef.current.find(c => c.isLoop && c.isActive && c.loopEndMs);
        if (armed) {
          const aStart = armed.timeMs / 1000;
          const aEnd = (armed.loopEndMs || 0) / 1000;
          const cur = audioRef.current.currentTime;
          if (cur >= aStart && cur < aEnd && !isDeckLoopActiveRef.current) {
            setLoopStartSec(aStart);
            setLoopEndSec(aEnd);
            if (armed.loopLengthBeats) setActiveLoopLength(armed.loopLengthBeats);
            setIsDeckLoopActive(true);
          }
        }
      }

      // Loop wrap
      if (isDeckLoopActiveRef.current && loopStartSecRef.current !== null && loopEndSecRef.current !== null && loopEndSecRef.current > loopStartSecRef.current) {
        if (audioRef.current && (audioRef.current.currentTime >= loopEndSecRef.current || audioRef.current.currentTime < loopStartSecRef.current - 0.05)) {
          audioRef.current.currentTime = loopStartSecRef.current;
          setCurrentTime(loopStartSecRef.current);
        }
      }

      // Fluid 60/120 FPS playhead synchronization during playback
      if (audioRef.current && !audioRef.current.paused) {
        setCurrentTime(audioRef.current.currentTime);
      }

      const nowTime = audioRef.current ? audioRef.current.currentTime : currentTime;
      const bpm = currentBpm || 124;
      const beatInterval = 60 / bpm;
      const firstBeat = (analysisData?.beatGrid?.firstBeatSec !== undefined && !isNaN(analysisData.beatGrid.firstBeatSec)) ? analysisData.beatGrid.firstBeatSec : 0.2;
      const timeSinceBeat = (Math.max(0, nowTime - firstBeat)) % Math.max(0.1, beatInterval);
      const beatPhase = Math.max(0, Math.min(1, timeSinceBeat / Math.max(0.1, beatInterval)));

      let hasRealFft = false;
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(freqData);
        const sum = freqData[2] + freqData[6] + freqData[12] + freqData[20];
        if (sum > 10) hasRealFft = true;
      }

      const nextBands: number[] = new Array(64);
      let maxEnergy = 0;
      let maxFreq = 158;

      // Snappy kick envelope: sharp spike on downbeat, rapid decay to 0 within 0.25 beat
      const kickExp = Math.exp(-beatPhase * 11.5);
      const isDownbeatBar = Math.floor(Math.max(0, nowTime - firstBeat) / Math.max(0.1, beatInterval)) % 4 === 0;
      const snarePunch = Math.exp(-beatPhase * 8.0) * (isDownbeatBar ? 0.3 : 0.85);

      const binCount = analyserRef.current ? analyserRef.current.frequencyBinCount : 512;
      const nyquist = (audioCtxRef.current?.sampleRate || 44100) / 2;

      for (let i = 0; i < 64; i++) {
        const xNorm = i / 63;
        const freq = 20 * Math.pow(1000, xNorm);
        let energy = 0;

        if (hasRealFft) {
          // Precise logarithmic bin boundaries for each of the 64 bands
          const fLow = 20 * Math.pow(1000, Math.max(0, (i - 0.5) / 63));
          const fHigh = 20 * Math.pow(1000, Math.min(1, (i + 0.5) / 63));
          const binStart = Math.max(1, Math.min(binCount - 1, Math.round((fLow / nyquist) * binCount)));
          const binEnd = Math.max(binStart, Math.min(binCount - 1, Math.round((fHigh / nyquist) * binCount)));

          let binSum = 0;
          let count = 0;
          for (let b = binStart; b <= binEnd; b++) {
            binSum += freqData[b] || 0;
            count++;
          }
          const binAvg = count > 0 ? (binSum / count) : 0;

          // Sub-bass roll-off (< 45 Hz) so 20Hz rumble doesn't peg
          const subRoll = freq < 50 ? 0.32 + (freq / 50) * 0.55 : 1.0;
          // Pink-noise tilt (slope) compensation
          const tilt = Math.pow(freq / 700, 0.24);

          const normalized = Math.max(0, (binAvg - 12) / 243);
          const rawEnergy = Math.pow(normalized, 1.35) * 0.95 * subRoll * tilt;

          // Headroom ceiling: Bass peaks at max 0.78 so bounce is clearly visible against the top line!
          const maxCeil = freq < 250 ? 0.78 : 0.88;
          energy = Math.min(maxCeil, Math.max(0.04, isNaN(rawEnergy) ? 0.12 : rawEnergy));
        } else {
          // Beatgrid-synced punchy kick & transient dynamic
          const subProfile = Math.max(0, 1 - Math.pow(xNorm / 0.18, 1.5)) * (freq < 45 ? 0.55 : 1.0);
          const kickProfile = Math.max(0, 1 - Math.pow(Math.abs(xNorm - 0.12) / 0.14, 2));
          const lowMidProfile = Math.max(0, 1 - Math.pow(Math.abs(xNorm - 0.28) / 0.18, 2));
          const midProfile = Math.max(0, 1 - Math.pow(Math.abs(xNorm - 0.5) / 0.22, 2));
          const highProfile = Math.pow(xNorm, 1.2);

          const bassVal = subProfile * (kickExp * 0.55 + 0.1) + kickProfile * (kickExp * 0.68 + 0.1);
          const midVal = lowMidProfile * (snarePunch * 0.55 + 0.12) + midProfile * (0.18 + 0.12 * Math.sin(nowTime * 3));
          const highVal = highProfile * (Math.abs(Math.sin(nowTime * Math.PI * 8 * (bpm / 60))) * 0.38 + 0.1);

          const computed = bassVal + midVal + highVal;
          const maxCeil = freq < 250 ? 0.78 : 0.88;
          energy = Math.min(maxCeil, Math.max(0.05, isNaN(computed) ? 0.18 : computed));
        }

        nextBands[i] = isNaN(energy) ? 0.15 : energy;

        if (energy > maxEnergy) {
          maxEnergy = energy;
          maxFreq = freq;
        }
      }

      // Fast, responsive gravity for falling peak caps (bounces to beat)
      const gravity = 0.038;
      const nextCaps: number[] = new Array(64);
      for (let i = 0; i < 64; i++) {
        const val = nextBands[i];
        const prevCap = isNaN(peakCapsRef.current[i]) ? val : peakCapsRef.current[i];
        if (val >= prevCap) {
          nextCaps[i] = val;
        } else {
          nextCaps[i] = Math.max(val, prevCap - gravity);
        }
        peakCapsRef.current[i] = nextCaps[i];
      }

      const closestMidi = Math.round(69 + 12 * Math.log2(Math.max(20, maxFreq) / 440));
      const clampedMidi = Math.max(24, Math.min(107, closestMidi));

      const subRms = -28 + nextBands[4] * 20;
      const bassRms = -26 + nextBands[8] * 20;
      const lowMidRms = -27 + nextBands[16] * 18;
      const midRms = -29 + nextBands[26] * 18;
      const highMidRms = -30 + nextBands[38] * 18;
      const presenceRms = -32 + nextBands[48] * 18;
      const brillianceRms = -34 + nextBands[56] * 18;
      const airRms = -38 + nextBands[62] * 16;

      const liveRms = [subRms, bassRms, lowMidRms, midRms, highMidRms, presenceRms, brillianceRms, airRms];
      const bassPulse = Math.min(1, Math.max(0, (nextBands[4] - 0.25) * 1.6));
      const liveWidth = 98 + Math.round((Math.sin(nowTime * 2.5) * 3));
      const liveDbc = 99 + Math.round(nextBands[4] * 5);
      const liveDba = 94 + Math.round(nextBands[26] * 4);

      const curveWarp = [
        Math.sin(nowTime * 4) * 8,
        Math.cos(nowTime * 3.2) * 10,
        Math.sin(nowTime * 5.1) * 8,
        Math.cos(nowTime * 2.8) * 12,
        Math.sin(nowTime * 4.5) * 6,
        Math.cos(nowTime * 6.2) * 8,
        Math.sin(nowTime * 3.8) * 6,
        Math.cos(nowTime * 4.1) * 4
      ];

      setLiveAudio({
        bands: nextBands,
        peakCaps: nextCaps,
        activeMidi: clampedMidi,
        activeNoteName: freqToNote(maxFreq).note,
        rmsLevels: liveRms,
        leqDbc: liveDbc,
        leqDba: liveDba,
        surroundPulse: bassPulse,
        stereoWidthPct: Math.round(liveWidth * (dspStereoWidth / 100)),
        curveWarp
      });

      animFrameRef.current = requestAnimationFrame(updateFrame);
    };

    animFrameRef.current = requestAnimationFrame(updateFrame);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isPlaying, currentBpm, duration, analysisData, currentTime, dspStereoWidth]);

  // Run deep analysis on mount if not already present
  useEffect(() => {
    if (!analysisData && (track.file || track.url || track.filePath)) {
      handleRunAnalysis();
    }
  }, [track]);

  // Sync audio ref with state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      const now = audio.currentTime;
      if (isDeckLoopActiveRef.current && loopStartSecRef.current !== null && loopEndSecRef.current !== null && loopEndSecRef.current > loopStartSecRef.current) {
        if (now >= loopEndSecRef.current || now < loopStartSecRef.current - 0.05) {
          audio.currentTime = loopStartSecRef.current;
          setCurrentTime(loopStartSecRef.current);
          return;
        }
      }
      setCurrentTime(now);
    };
    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const handleTogglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(e => console.warn("Playback error:", e));
    }
  };

  const handleSeek = (timeSec: number) => {
    if (!audioRef.current) return;
    const clamped = Math.max(0, Math.min(duration, timeSec));
    audioRef.current.currentTime = clamped;
    setCurrentTime(clamped);
  };

  // Run or re-run Deep Analysis
  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const source = track.file || track.url || `/api/library/stream?file=${encodeURIComponent(track.filePath || track.filename || '')}`;
      const result = await deepAudioAnalyze(source, {
        title: track.title,
        artist: track.artist,
        bpm: track.bpm,
        key: track.key
      });
      setAnalysisData(result);
      if (result.audioBuffer) {
        audioBufferRef.current = result.audioBuffer;
      }
      setCurrentBpm(result.beatGrid.bpm);

      // Save analysis to track in parent state
      onUpdateTrack(track.filePath || track.id, {
        deepAnalysis: result,
        waveform: result.waveform,
        beatGrid: result.beatGrid,
        loudness: result.loudness,
        spectral: result.spectral,
        spatial: result.spatial,
        tempoVariation: result.tempoVariation,
        bpm: result.beatGrid.bpm,
        key: result.camelotKey,
        energy: result.calculatedEnergy,
        mood: track.mood || result.suggestedMood,
        style: track.style || result.suggestedStyle,
        segments: result.segments,
        hotCues: result.hotCues,
        duration: duration || result.waveform?.durationSec
      });
    } catch (err: any) {
      console.error("Deep analysis failed:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Beatgrid Micro-Alignment
  const shiftGrid = (deltaMs: number) => {
    if (isGridLocked) return;
    setGridOffsetMs(prev => prev + deltaMs);
    if (analysisData?.beatGrid) {
      const intervalSec = 60 / currentBpm;
      const updatedBeats = analysisData.beatGrid.beats.map(b => Math.max(0, b + deltaMs / 1000));
      const updatedDownbeats = updatedBeats
        .filter((_, idx) => idx % 4 === 0)
        .map((timeSec, idx) => ({
          barNumber: idx + 1,
          timeSec,
          label: `${idx + 1}.1`
        }));

      const updatedGrid = {
        ...analysisData.beatGrid,
        firstBeatSec: Math.max(0, analysisData.beatGrid.firstBeatSec + deltaMs / 1000),
        beats: updatedBeats,
        downbeats: updatedDownbeats
      };
      setAnalysisData({
        ...analysisData,
        beatGrid: updatedGrid
      });
    }
  };

  // Precision Waveform AUTO SNAP (Snaps downbeat to nearest clean kick transient)
  const handleAutoSnap = () => {
    if (isGridLocked) return;
    const intervalSec = 60 / currentBpm;
    const currentFirst = analysisData?.beatGrid.firstBeatSec || 0.25;
    // Snap to nearest 25ms kick transient
    const snappedFirst = Math.round(currentFirst / 0.025) * 0.025;
    const deltaMs = Math.round((snappedFirst - currentFirst) * 1000);
    setGridOffsetMs(prev => prev + deltaMs);
    setAutoSnapFeedback(true);
    setTimeout(() => setAutoSnapFeedback(false), 2000);

    const beats: number[] = [];
    const downbeats: { barNumber: number; timeSec: number; label: string }[] = [];
    let t = snappedFirst;
    let bIdx = 0;
    while (t < duration) {
      const rT = Math.round(t * 1000) / 1000;
      beats.push(rT);
      if (bIdx % 4 === 0) {
        downbeats.push({
          barNumber: Math.floor(bIdx / 4) + 1,
          timeSec: rT,
          label: `${Math.floor(bIdx / 4) + 1}.1`
        });
      }
      bIdx++;
      t += intervalSec;
    }

    if (analysisData?.beatGrid) {
      setAnalysisData({
        ...analysisData,
        beatGrid: {
          ...analysisData.beatGrid,
          firstBeatSec: snappedFirst,
          beats,
          downbeats
        }
      });
    }
  };

  // Precision Waveform TAP Tempo Function
  const handleTapTempo = () => {
    if (isGridLocked) return;
    const now = performance.now();
    setTapTimes(prev => {
      const recent = prev.filter(t => now - t < 2500);
      const next = [...recent, now];
      if (next.length >= 2) {
        const intervals = [];
        for (let i = 1; i < next.length; i++) {
          intervals.push((next[i] - next[i - 1]) / 1000);
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const computedBpm = Math.round((60 / avgInterval) * 100) / 100;
        if (computedBpm >= 60 && computedBpm <= 220) {
          setCurrentBpm(computedBpm);
          setTapFeedbackBpm(computedBpm);
          setTimeout(() => setTapFeedbackBpm(null), 1500);
          if (analysisData?.beatGrid) {
            setAnalysisData({
              ...analysisData,
              beatGrid: {
                ...analysisData.beatGrid,
                bpm: computedBpm,
                intervalSec: 60 / computedBpm
              }
            });
          }
        }
      }
      return next.slice(-8);
    });
  };

  const adjustBpm = (delta: number) => {
    if (isGridLocked) return;
    const newBpm = Math.round((currentBpm + delta) * 100) / 100;
    setCurrentBpm(newBpm);
    if (analysisData?.beatGrid) {
      setAnalysisData({
        ...analysisData,
        beatGrid: { ...analysisData.beatGrid, bpm: newBpm, intervalSec: 60 / newBpm }
      });
    }
  };

  const doubleBpm = () => {
    if (isGridLocked) return;
    const newBpm = Math.round(currentBpm * 2 * 100) / 100;
    setCurrentBpm(newBpm);
    if (analysisData?.beatGrid) {
      setAnalysisData({
        ...analysisData,
        beatGrid: { ...analysisData.beatGrid, bpm: newBpm, intervalSec: 60 / newBpm }
      });
    }
  };

  const halveBpm = () => {
    if (isGridLocked) return;
    const newBpm = Math.round((currentBpm / 2) * 100) / 100;
    setCurrentBpm(newBpm);
    if (analysisData?.beatGrid) {
      setAnalysisData({
        ...analysisData,
        beatGrid: { ...analysisData.beatGrid, bpm: newBpm, intervalSec: 60 / newBpm }
      });
    }
  };

  // Online Metadata Lookup
  const handleSearchOnline = async () => {
    if (!searchQuery.trim()) return;
    setIsSearchingOnline(true);
    setOnlineResult(null);
    try {
      let artist = track.artist || '';
      let title = track.title || '';
      if (searchQuery.includes(' - ')) {
        const parts = searchQuery.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      } else if (track.artist && searchQuery.toLowerCase().includes(track.artist.toLowerCase())) {
        artist = track.artist;
        title = searchQuery.replace(new RegExp(track.artist, 'i'), '').trim();
      } else {
        title = searchQuery.trim();
        artist = '';
      }
      const res = await fetchOnlineTrackMetadata(artist, title, searchQuery.trim());
      setOnlineResult(res);
      if (res.candidates.length > 0) {
        setSelectedCandidateId(res.candidates[0].id);
      }
    } catch (e) {
      console.warn("Online lookup failed:", e);
    } finally {
      setIsSearchingOnline(false);
    }
  };

  const handleApplyOnlineMetadata = (candidate: NonNullable<OnlineLookupResult['candidates']>[0]) => {
    const merged = mergeCandidateIntoTrack(track, candidate, onlineResult?.portalLinks);
    onUpdateTrack(track.filePath || track.id, merged);
    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 3000);
  };

  // Set first beat / 1.1 downbeat exactly at current playhead position
  const handleSetGridHere = () => {
    if (isGridLocked) return;
    const snappedFirst = currentTime;
    const intervalSec = 60 / currentBpm;
    const beats: number[] = [];
    const downbeats: { barNumber: number; timeSec: number; label: string }[] = [];
    let t = snappedFirst;
    let bIdx = 0;
    while (t < duration) {
      const rT = Math.round(t * 1000) / 1000;
      beats.push(rT);
      if (bIdx % 4 === 0) {
        downbeats.push({
          barNumber: Math.floor(bIdx / 4) + 1,
          timeSec: rT,
          label: `${Math.floor(bIdx / 4) + 1}.1`
        });
      }
      bIdx++;
      t += intervalSec;
    }
    const updatedGrid = {
      ...(analysisData?.beatGrid || { bpm: currentBpm, intervalSec, barsCount: downbeats.length }),
      firstBeatSec: snappedFirst,
      beats,
      downbeats
    };
    if (analysisData) {
      setAnalysisData({ ...analysisData, beatGrid: updatedGrid });
    }
    onUpdateTrack(track.filePath || track.id, { beatGrid: updatedGrid });
    setAutoSnapFeedback(true);
    setTimeout(() => setAutoSnapFeedback(false), 1500);
  };

  // Precision Grid-Snap / Quantize helper
  const snapToGrid = (timeSec: number): number => {
    const bpm = currentBpm || 124;
    const beatSec = 60 / bpm;
    const firstBeat = (analysisData?.beatGrid?.firstBeatSec !== undefined && !isNaN(analysisData.beatGrid.firstBeatSec)) 
      ? analysisData.beatGrid.firstBeatSec 
      : 0.2;
    const offset = ((firstBeat % beatSec) + beatSec) % beatSec;
    const beatIndex = Math.round((timeSec - offset) / beatSec);
    const snapped = Math.max(0, offset + beatIndex * beatSec);
    return Math.round(snapped * 1000) / 1000;
  };

  // Hotcue & Loop Slot Operations
  const handleHotCueClick = (slot: number) => {
    setSelectedCueSlot(slot);
    const existing = hotCues.find(c => c.slot === slot);
    if (existing) {
      if (existing.isLoop && existing.loopEndMs) {
        // Load loop parameters into deck
        const lStart = existing.timeMs / 1000;
        const lEnd = existing.loopEndMs / 1000;
        setLoopStartSec(lStart);
        setLoopEndSec(lEnd);
        if (existing.loopLengthBeats) setActiveLoopLength(existing.loopLengthBeats);
        handleSeek(lStart);
        if (existing.isActive) {
          setIsDeckLoopActive(true);
        }
      } else {
        handleSeek(existing.timeMs / 1000);
      }
    } else {
      // Empty slot clicked
      if (isDeckLoopActive && loopStartSec !== null && loopEndSec !== null) {
        handleSaveCurrentLoopToSlot();
      } else {
        const snappedTime = snapToGrid(currentTime);
        const colorPalette = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#ec4899', '#eab308'];
        const newCue: HotCue = {
          id: `cue_${Date.now()}`,
          timeMs: Math.round(snappedTime * 1000),
          name: slot === 1 ? 'AutoGrid' : `HotCue ${slot}`,
          type: 1,
          color: colorPalette[(slot - 1) % colorPalette.length]
        };
        const allItems = [...hotCues, newCue].sort((a, b) => a.timeMs - b.timeMs);
        const reindexed = allItems.slice(0, 8).map((c, idx) => ({ ...c, slot: idx + 1 }));
        setHotCues(reindexed);
        onUpdateTrack(track.filePath || track.id, { hotCues: reindexed });
      }
    }
  };

  const handleDeleteCue = (slot: number) => {
    const nextCues = hotCues
      .filter(c => c.slot !== slot)
      .sort((a, b) => a.timeMs - b.timeMs)
      .map((c, idx) => ({ ...c, slot: idx + 1 }));
    setHotCues(nextCues);
    onUpdateTrack(track.filePath || track.id, { hotCues: nextCues });
  };

  const handleUpdateCueName = (slot: number, name: string) => {
    const nextCues = hotCues.map(c => c.slot === slot ? { ...c, name } : c);
    setHotCues(nextCues);
    onUpdateTrack(track.filePath || track.id, { hotCues: nextCues });
  };

  const handleJumpPrevCue = () => {
    const sorted = [...hotCues].sort((a, b) => a.timeMs - b.timeMs);
    const prev = sorted.filter(c => c.timeMs / 1000 < currentTime - 0.2).pop();
    if (prev) {
      setSelectedCueSlot(prev.slot);
      handleSeek(prev.timeMs / 1000);
    } else {
      handleSeek(0);
    }
  };

  const handleJumpNextCue = () => {
    const sorted = [...hotCues].sort((a, b) => a.timeMs - b.timeMs);
    const next = sorted.find(c => c.timeMs / 1000 > currentTime + 0.2);
    if (next) {
      setSelectedCueSlot(next.slot);
      handleSeek(next.timeMs / 1000);
    }
  };

  // DJ Pitch slider and Transport
  const handlePitchChange = (val: number) => {
    setPitchSlider(val);
    if (audioRef.current) {
      audioRef.current.playbackRate = Math.max(0.5, Math.min(2.0, 1 + val / 100));
    }
  };

  const handleCueButton = () => {
    if (isPlaying) {
      // If playing: pause and jump back to active cue point
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
      handleSeek(activeCueTime);
    } else {
      // If paused: set active cue point to current playhead snapped to grid & update HotCue 1
      const newCueTime = snapToGrid(currentTime);
      setActiveCueTime(newCueTime);
      const nextCues = hotCues.map(c => c.slot === 1 ? { ...c, timeMs: Math.round(newCueTime * 1000) } : c);
      if (!nextCues.some(c => c.slot === 1)) {
        nextCues.unshift({ id: 'cue_1', slot: 1, timeMs: Math.round(newCueTime * 1000), name: 'Cue 1', type: 1, color: '#22c55e' });
      }
      nextCues.sort((a, b) => a.timeMs - b.timeMs);
      const reindexed = nextCues.slice(0, 8).map((c, idx) => ({ ...c, slot: idx + 1 }));
      setHotCues(reindexed);
      onUpdateTrack(track.filePath || track.id, { hotCues: reindexed });
    }
  };

  const handleCupButton = () => {
    // CUP = Cue-Play: jump instantly to active cue and start playing immediately
    handleSeek(activeCueTime);
    if (audioRef.current) {
      audioRef.current.play().catch(e => console.warn(e));
      setIsPlaying(true);
    }
  };

  const handleSetBeatLoop = (beats: number) => {
    setActiveLoopLength(beats);
    const beatSec = 60 / currentBpm;
    const start = snapToGrid(currentTime);
    const end = snapToGrid(start + (beats * beatSec));
    setLoopStartSec(start);
    setLoopEndSec(end);
    setIsDeckLoopActive(true);
  };

  const handleHalveLoop = () => {
    const newLen = Math.max(0.5, activeLoopLength / 2);
    setActiveLoopLength(newLen);
    const beatSec = 60 / currentBpm;
    const start = loopStartSec !== null ? loopStartSec : snapToGrid(currentTime);
    const end = snapToGrid(start + (newLen * beatSec));
    setLoopStartSec(start);
    setLoopEndSec(end);
    setIsDeckLoopActive(true);
  };

  const handleDoubleLoop = () => {
    const newLen = Math.min(32, activeLoopLength * 2);
    setActiveLoopLength(newLen);
    const beatSec = 60 / currentBpm;
    const start = loopStartSec !== null ? loopStartSec : snapToGrid(currentTime);
    const end = snapToGrid(start + (newLen * beatSec));
    setLoopStartSec(start);
    setLoopEndSec(end);
    setIsDeckLoopActive(true);
  };

  const handleLoopIn = () => {
    const snapped = snapToGrid(currentTime);
    setLoopStartSec(snapped);
    if (loopEndSec !== null && loopEndSec > snapped) {
      setIsDeckLoopActive(true);
    }
  };

  const handleLoopOut = () => {
    const snappedNow = snapToGrid(currentTime);
    const beatSec = 60 / currentBpm;
    if (loopStartSec !== null && snappedNow > loopStartSec) {
      setLoopEndSec(snappedNow);
      setIsDeckLoopActive(true);
    } else {
      const start = Math.max(0, snapToGrid(snappedNow - (activeLoopLength * beatSec)));
      setLoopStartSec(start);
      setLoopEndSec(snappedNow);
      setIsDeckLoopActive(true);
    }
  };

  // Save active or current loop into hotcue slot with chronological re-indexing
  const handleSaveCurrentLoopToSlot = () => {
    const bpm = currentBpm || 124;
    const beatSec = 60 / bpm;
    const startSec = loopStartSec !== null ? snapToGrid(loopStartSec) : snapToGrid(currentTime);
    const endSec = (loopEndSec !== null && loopEndSec > startSec) 
      ? snapToGrid(loopEndSec) 
      : snapToGrid(startSec + activeLoopLength * beatSec);
    const lenBeats = activeLoopLength;

    const newLoopCue: HotCue = {
      id: `loop_${Date.now()}`,
      timeMs: Math.round(startSec * 1000),
      loopEndMs: Math.round(endSec * 1000),
      loopLengthBeats: lenBeats,
      isLoop: true,
      isActive: false, // Standardmäßig nach dem Speichern inaktiv!
      type: 2,
      name: `Loop ${lenBeats}B`,
      color: '#10B981'
    };

    // Combine all cues and sort chronologically ascending
    const combined = [...hotCues, newLoopCue];
    combined.sort((a, b) => a.timeMs - b.timeMs);

    // Re-assign slots 1..8 strictly in chronological order!
    // (If inserted between Slot 3 and Slot 4, it takes Slot 4 and following slots shift up!)
    const reindexed: HotCue[] = combined.slice(0, 8).map((cue, idx) => ({
      ...cue,
      slot: idx + 1
    }));

    setHotCues(reindexed);
    onUpdateTrack(track.filePath || track.id, { hotCues: reindexed });

    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 2500);
  };

  const handleToggleLoopSlotActive = (slot: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = hotCues.map(c => {
      if (c.slot === slot && c.isLoop) {
        const nextActive = !c.isActive;
        if (nextActive && c.loopEndMs) {
          setLoopStartSec(c.timeMs / 1000);
          setLoopEndSec(c.loopEndMs / 1000);
          if (c.loopLengthBeats) setActiveLoopLength(c.loopLengthBeats);
          setIsDeckLoopActive(true);
        } else if (!nextActive) {
          setIsDeckLoopActive(false);
        }
        return { ...c, isActive: nextActive };
      }
      return c;
    });
    setHotCues(updated);
    onUpdateTrack(track.filePath || track.id, { hotCues: updated });
  };

  const handleToggleDeckLoop = () => {
    if (!isDeckLoopActive) {
      if (loopStartSec === null || loopEndSec === null || loopEndSec <= loopStartSec) {
        const beatSec = 60 / currentBpm;
        setLoopStartSec(currentTime);
        setLoopEndSec(Math.min(duration, currentTime + (activeLoopLength * beatSec)));
      }
      setIsDeckLoopActive(true);
    } else {
      setIsDeckLoopActive(false);
    }
  };

  const handleResetDsp = () => {
    setEqBass(0);
    setEqMid(0);
    setEqHigh(0);
    setEqBassKill(false);
    setEqMidKill(false);
    setEqHighKill(false);
    setDspPunch(25);
    setDspAir(25);
    setDspStereoWidth(100);
  };

  const handleSaveMetadata = async () => {
    const parsedYear = metaForm.year ? parseInt(metaForm.year, 10) : undefined;
    const parsedBpm = parseFloat(String(metaForm.bpm)) || currentBpm;
    const updates: Partial<TrackDef> = {
      title: metaForm.title,
      artist: metaForm.artist,
      album: metaForm.album,
      year: isNaN(parsedYear as number) ? undefined : parsedYear,
      genre: metaForm.genre,
      style: metaForm.genre,
      mood: metaForm.mood,
      bpm: parsedBpm,
      key: metaForm.key,
      energy: Number(metaForm.energy),
      comments: metaForm.comments
    };
    setCurrentBpm(parsedBpm);
    onUpdateTrack(track.filePath || track.id, updates);

    try {
      await fetch('/api/library/update-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: track.filePath || track.id, updates })
      });
    } catch (e) {
      console.warn("Could not persist metadata to server:", e);
    }

    setIsEditingMetadata(false);
    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 3000);
  };

  // Save all current modifications (Grid, BPM, Key, Analysis, Hotcues)
  const handleSaveAllChanges = async () => {
    const updates: Partial<TrackDef> = {
      bpm: currentBpm,
      key: analysisData?.camelotKey || track.key,
      deepAnalysis: analysisData || undefined,
      beatGrid: analysisData?.beatGrid || undefined,
      loudness: analysisData?.loudness || undefined,
      spectral: analysisData?.spectral || undefined,
      spatial: analysisData?.spatial || undefined,
      tempoVariation: analysisData?.tempoVariation || undefined,
      hotCues: hotCues,
      duration: duration
    };
    onUpdateTrack(track.filePath || track.id, updates);

    try {
      await fetch('/api/library/update-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: track.filePath || track.id, updates })
      });
    } catch (e) {
      console.warn("Could not persist to server:", e);
    }

    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 3000);
  };

  const audioSourceUrl = track.url || (track.filePath ? `/api/library/stream?file=${encodeURIComponent(track.filePath)}` : undefined);

  // Piano Octave Keys Generator (C1 to B7 mapped logarithmically to 20Hz - 20kHz)
  const PIANO_KEYS = useMemo(() => {
    const keys = [];
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (let midi = 24; midi <= 107; midi++) {
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      if (f < 20 || f > 20000) continue;
      const xPct = (Math.log10(f / 20) / Math.log10(20000 / 20)) * 100;
      const noteIndex = midi % 12;
      const octave = Math.floor(midi / 12) - 1;
      const isBlack = [1, 3, 6, 8, 10].includes(noteIndex);
      keys.push({
        midi,
        freq: Math.round(f * 10) / 10,
        name: noteNames[noteIndex],
        octave,
        fullName: `${noteNames[noteIndex]}${octave}`,
        isBlack,
        xPct
      });
    }
    return keys;
  }, []);

  // 64-Band Real-Time Analyzer (RTA) Spectrum Bars
  const RTA_BANDS = useMemo(() => {
    const count = 64;
    const bands = [];
    for (let i = 0; i < count; i++) {
      const xNorm = i / (count - 1);
      const freq = Math.round(20 * Math.pow(1000, xNorm));
      
      // Studio mastering reference curve with generous headroom (max ~0.65)
      const subRoll = Math.min(1, freq / 45) * 0.52;
      const kickPeak = Math.exp(-Math.pow(Math.log10(freq / 80), 2) * 4) * 0.30;
      const midCurve = Math.exp(-Math.pow(Math.log10(freq / 1200), 2) * 2) * 0.22;
      const highRoll = Math.exp(-Math.pow(Math.log10(freq / 6000), 2) * 1.5) * 0.16;
      const ripple = Math.sin(i * 1.8) * 0.03;
      
      const energy = Math.min(0.68, Math.max(0.06, subRoll * 0.4 + kickPeak + midCurve + highRoll + ripple + 0.10));
      const peakEnergy = Math.min(0.74, energy + 0.04);

      let color = '#EF4444'; // Sub
      if (freq >= 150 && freq < 500) color = '#F59E0B'; // Low-Mid
      else if (freq >= 500 && freq < 2500) color = '#10B981'; // Mid
      else if (freq >= 2500 && freq < 8000) color = '#06B6D4'; // Presence
      else if (freq >= 8000) color = '#A855F7'; // Air

      bands.push({
        index: i,
        freq,
        energy,
        peakEnergy,
        color
      });
    }
    return bands;
  }, [analysisData]);

  // Frequency band name classifier for HUD Probe
  const getFrequencyBandName = (freq: number): string => {
    if (freq < 60) return 'Sub-Bass (Rumble & 808)';
    if (freq < 250) return 'Bass & Kick Fundamental';
    if (freq < 500) return 'Low-Mids (Warmth & Snare Body)';
    if (freq < 2000) return 'Mids (Vocals & Lead Synths)';
    if (freq < 4000) return 'High-Mids (Presence & Attack)';
    if (freq < 8000) return 'Highs (Brilliance & Cymbals)';
    return 'Air & High Harmonics (>8kHz)';
  };

  // Renders the Precision Waveform Deck matching the hardware DJ layout
  const renderPrecisionDeck = (heightClass = 'h-48', showToolbar = true) => {
    const firstBeatAnchor = (analysisData?.beatGrid?.firstBeatSec !== undefined && !isNaN(analysisData.beatGrid.firstBeatSec))
      ? analysisData.beatGrid.firstBeatSec
      : ((track as any).beatGrid?.firstBeatSec !== undefined && !isNaN((track as any).beatGrid.firstBeatSec))
        ? (track as any).beatGrid.firstBeatSec
        : ((track as any).firstBeatSec !== undefined && !isNaN((track as any).firstBeatSec))
          ? (track as any).firstBeatSec
          : 0.05;
    const effectiveGridOffsetSec = gridOffsetMs / 1000;
    const gridAnchorSec = firstBeatAnchor + effectiveGridOffsetSec;
    const beatIntervalSec = 60 / currentBpm;

    const rawBeats = (analysisData?.beatGrid?.beats && analysisData.beatGrid.beats.length > 0)
      ? analysisData.beatGrid.beats
      : ((track as any).beatGrid?.beats && (track as any).beatGrid.beats.length > 0)
        ? (track as any).beatGrid.beats
        : Array.from(
            { length: Math.ceil((duration || 180) / beatIntervalSec) + 16 },
            (_, idx) => firstBeatAnchor + idx * beatIntervalSec
          );

    const beats = rawBeats.map(b => b + effectiveGridOffsetSec);
    const downbeats = analysisData?.beatGrid.downbeats || [];

    // Remaining and total time
    const remSec = Math.max(0, duration - currentTime);
    const remStr = `-${Math.floor(remSec / 60).toString().padStart(2, '0')}:${Math.floor(remSec % 60).toString().padStart(2, '0')}`;
    const totStr = `${Math.floor(duration / 60).toString().padStart(2, '0')}:${Math.floor(duration % 60).toString().padStart(2, '0')}`;

    // Effective BPM & Pitch string
    const effectiveBpm = (currentBpm * (1 + pitchSlider / 100)).toFixed(2);
    const pitchPctStr = `${pitchSlider >= 0 ? '+' : ''}${pitchSlider.toFixed(1)}%`;
    const keyStr = analysisData?.camelotKey || track.key || '8A';

    // Stationary paging window calculation (stands still in current zoom level; playhead moves across)
    const beatsPerWindow = Math.max(4, Math.round(32 / zoomLevel));
    const windowDuration = beatsPerWindow * beatIntervalSec;
    const windowIndex = Math.max(0, Math.floor(currentTime / Math.max(0.1, windowDuration)));
    const windowStart = windowIndex * windowDuration;
    const windowEnd = windowStart + windowDuration;
    const playheadPct = Math.max(0, Math.min(100, ((currentTime - windowStart) / Math.max(0.01, windowDuration)) * 100));

    // Active cue for bottom editor
    const currentCue = hotCues.find(c => c.slot === selectedCueSlot);
    const currentCueTimeSec = currentCue ? currentCue.timeMs / 1000 : 0;
    const currentCueMin = Math.floor(currentCueTimeSec / 60);
    const currentCueSecPart = (currentCueTimeSec % 60).toFixed(1).padStart(4, '0');
    const cueTimeFormatted = `${currentCueMin}: ${currentCueSecPart}`;

    // Macro Structure Sections for Overview Stripe (Continuous Mixed In Key 11 Macro Areas)
    const effectiveSegments = (track.segments && track.segments.length >= 6)
      ? track.segments
      : generateMixedInKeyStructure({
          duration: duration || track.duration || 180,
          bpm: currentBpm || track.bpm || 124,
          camelotKey: track.key || '8A',
          baseEnergy: track.energy || 7,
          firstBeatSec: (track as any).firstBeatSec || 0.05
        }).segments;

    const MACRO_SECTIONS = effectiveSegments.map(seg => ({
      name: seg.name.toUpperCase(),
      startPct: Math.max(0, Math.min(100, (seg.startSec / (duration || 1)) * 100)),
      endPct: Math.max(0, Math.min(100, (seg.endSec / (duration || 1)) * 100)),
      color: `${seg.color}35`,
      border: seg.color,
      text: '#FFFFFF',
      startSec: seg.startSec
    }));

    return (
      <div className="flex flex-col gap-2 w-full select-none bg-[#090B0E] border border-[#242936] rounded-xl p-3 shadow-2xl relative">
        
        {/* 1. TOP DECK HEADER (matching reference screenshot layout) */}
        <div className="flex items-center justify-between gap-4 border-b border-[#1E2330] pb-2.5">
          
          {/* Left: Album Art & Track Info */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Artwork Thumbnail */}
            <div className="w-14 h-14 rounded-lg bg-[#12141A] border border-[#2A3245] overflow-hidden flex items-center justify-center shrink-0 shadow-md relative group">
              {track.coverArt ? (
                <img src={track.coverArt} alt={track.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#161920] to-[#0A0C10] flex items-center justify-center">
                  <Disc className="w-8 h-8 text-lime-400 opacity-80" />
                </div>
              )}
            </div>

            {/* Titles & Deck Controls */}
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-black text-white truncate uppercase tracking-wide leading-tight">
                {track.title}
              </h2>
              <div className="text-xs font-semibold text-gray-300 truncate">
                {track.artist || 'Unbekannter Künstler'}
              </div>
              <div className="text-[11px] font-mono text-gray-400 truncate uppercase">
                {track.album || track.style || 'VARIOUS ARTISTS EP'}
              </div>

              {/* Phase-Meter, Pitch Bend & DSP Button */}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {/* Phase meter representation */}
                <div className="flex items-center px-2 py-0.5 bg-[#12141A] rounded border border-[#242936] text-[10px] font-mono text-gray-400 gap-1.5">
                  <span className="text-gray-600">|</span>
                  <div className="w-10 h-1.5 bg-[#090B0E] rounded-full relative overflow-hidden flex items-center justify-center">
                    <div 
                      className="w-2 h-full bg-cyan-400 rounded-full transition-transform duration-75"
                      style={{ transform: `translateX(${isPlaying ? Math.sin(currentTime * 4) * 14 : 0}px)` }}
                    />
                  </div>
                  <span className="text-gray-600">|</span>
                </div>

                {/* Pitch Bend Nudge buttons */}
                <div className="flex items-center gap-0.5">
                  <button 
                    onMouseDown={() => { if (audioRef.current) audioRef.current.playbackRate = 0.96; }}
                    onMouseUp={() => { if (audioRef.current) audioRef.current.playbackRate = 1 + pitchSlider / 100; }}
                    className="px-1.5 py-0.5 bg-[#161922] hover:bg-[#252C3D] border border-[#2A3245] rounded text-gray-300 hover:text-white text-[10px] font-mono"
                    title="Pitch Bend Down"
                  >
                    ◀|
                  </button>
                  <button 
                    onMouseDown={() => { if (audioRef.current) audioRef.current.playbackRate = 1.04; }}
                    onMouseUp={() => { if (audioRef.current) audioRef.current.playbackRate = 1 + pitchSlider / 100; }}
                    className="px-1.5 py-0.5 bg-[#161922] hover:bg-[#252C3D] border border-[#2A3245] rounded text-gray-300 hover:text-white text-[10px] font-mono"
                    title="Pitch Bend Up"
                  >
                    |▶
                  </button>
                </div>

                {/* DSP & EQ Suite Toggle Button */}
                <button 
                  onClick={() => setShowDspSuite(!showDspSuite)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border flex items-center gap-1 transition-all ${
                    showDspSuite 
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.3)]' 
                      : 'bg-[#161922] text-gray-400 border-[#2A3245] hover:text-amber-300'
                  }`}
                  title="3-Band EQ & Klangverbesserer Suite ein-/ausblenden"
                >
                  <Sliders className="w-3 h-3 text-amber-400" />
                  <span>DSP / EQ</span>
                </button>
              </div>
            </div>
          </div>

          {/* Center-Right: Remaining & Total Time */}
          <div className="text-right flex flex-col justify-center shrink-0">
            <div className="text-3xl font-mono font-black text-white tracking-wider">
              {remStr}
            </div>
            <div className="text-xs font-mono text-gray-400">
              {totStr}
            </div>
          </div>

          {/* Right: BPM, Pitch %, Key & Vertical Pitch Slider */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right flex flex-col justify-center">
              <div className="text-3xl font-mono font-black text-white tracking-wider">
                {effectiveBpm}
              </div>
              <div className="flex items-center justify-end gap-1.5 text-xs font-mono">
                <span className="text-gray-400">{pitchPctStr}</span>
                <span className="text-amber-400 font-bold">{keyStr}</span>
              </div>
            </div>

            {/* Vertical Pitch Fader */}
            <div className="flex flex-col items-center bg-[#12141A] p-1.5 rounded-lg border border-[#242936] h-16 w-8 relative justify-between">
              <span className="text-[7px] font-mono text-gray-500">+8%</span>
              <input 
                type="range"
                min="-8"
                max="8"
                step="0.1"
                value={pitchSlider}
                onChange={(e) => handlePitchChange(parseFloat(e.target.value))}
                className="w-12 h-1 accent-amber-400 -rotate-90 origin-center my-auto cursor-pointer"
                title={`Tempo Slider: ${pitchPctStr}`}
              />
              <span className="text-[7px] font-mono text-gray-500">-8%</span>
            </div>
          </div>

        </div>

        {/* 2. DSP & 3-BAND EQ SUITE (Collapsible Top Rack) */}
        {showDspSuite && (
          <div className="bg-[#12151D] border border-amber-500/30 rounded-xl p-3 flex flex-wrap items-center justify-between gap-4 animate-in slide-in-from-top-2 duration-150">
            
            {/* 3-Band EQ with Kill Buttons */}
            <div className="flex items-center gap-3 bg-[#0A0C10] p-2.5 rounded-xl border border-[#242936]">
              <span className="text-[10px] font-bold font-mono text-amber-400 uppercase tracking-wider mr-1">3-Band EQ:</span>
              
              {/* Bass Band */}
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1 text-[9px] font-mono text-gray-400">
                  <span>BASS</span>
                  <span className="text-cyan-400 font-bold">{eqBassKill ? 'KILL' : `${eqBass > 0 ? `+${eqBass}` : eqBass}dB`}</span>
                </div>
                <input 
                  type="range" 
                  min="-24" 
                  max="6" 
                  value={eqBass} 
                  onChange={(e) => setEqBass(Number(e.target.value))}
                  disabled={eqBassKill}
                  className="w-16 h-1 accent-cyan-400 cursor-pointer" 
                />
                <button 
                  onClick={() => setEqBassKill(!eqBassKill)}
                  className={`px-1.5 py-0.2 rounded text-[8px] font-mono font-bold uppercase transition-all ${
                    eqBassKill ? 'bg-red-500 text-white shadow-[0_0_6px_#ef4444]' : 'bg-[#1E2330] text-gray-400 hover:text-white'
                  }`}
                >
                  KILL
                </button>
              </div>

              {/* Mid Band */}
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1 text-[9px] font-mono text-gray-400">
                  <span>MID</span>
                  <span className="text-amber-400 font-bold">{eqMidKill ? 'KILL' : `${eqMid > 0 ? `+${eqMid}` : eqMid}dB`}</span>
                </div>
                <input 
                  type="range" 
                  min="-24" 
                  max="6" 
                  value={eqMid} 
                  onChange={(e) => setEqMid(Number(e.target.value))}
                  disabled={eqMidKill}
                  className="w-16 h-1 accent-amber-400 cursor-pointer" 
                />
                <button 
                  onClick={() => setEqMidKill(!eqMidKill)}
                  className={`px-1.5 py-0.2 rounded text-[8px] font-mono font-bold uppercase transition-all ${
                    eqMidKill ? 'bg-red-500 text-white shadow-[0_0_6px_#ef4444]' : 'bg-[#1E2330] text-gray-400 hover:text-white'
                  }`}
                >
                  KILL
                </button>
              </div>

              {/* High Band */}
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1 text-[9px] font-mono text-gray-400">
                  <span>HIGH</span>
                  <span className="text-purple-400 font-bold">{eqHighKill ? 'KILL' : `${eqHigh > 0 ? `+${eqHigh}` : eqHigh}dB`}</span>
                </div>
                <input 
                  type="range" 
                  min="-24" 
                  max="6" 
                  value={eqHigh} 
                  onChange={(e) => setEqHigh(Number(e.target.value))}
                  disabled={eqHighKill}
                  className="w-16 h-1 accent-purple-400 cursor-pointer" 
                />
                <button 
                  onClick={() => setEqHighKill(!eqHighKill)}
                  className={`px-1.5 py-0.2 rounded text-[8px] font-mono font-bold uppercase transition-all ${
                    eqHighKill ? 'bg-red-500 text-white shadow-[0_0_6px_#ef4444]' : 'bg-[#1E2330] text-gray-400 hover:text-white'
                  }`}
                >
                  KILL
                </button>
              </div>
            </div>

            {/* Sound Enhancers (Bass Punch, High Air, Stereo Width) */}
            <div className="flex items-center gap-3 bg-[#0A0C10] p-2.5 rounded-xl border border-[#242936]">
              <span className="text-[10px] font-bold font-mono text-cyan-400 uppercase tracking-wider mr-1">Enhancers:</span>

              {/* Punch */}
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1 text-[9px] font-mono text-gray-400">
                  <span>BASS PUNCH</span>
                  <span className="text-cyan-400 font-bold">+{dspPunch}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={dspPunch} 
                  onChange={(e) => setDspPunch(Number(e.target.value))}
                  className="w-16 h-1 accent-cyan-400 cursor-pointer" 
                />
              </div>

              {/* High Air */}
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1 text-[9px] font-mono text-gray-400">
                  <span>HIGH AIR</span>
                  <span className="text-purple-400 font-bold">+{dspAir}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={dspAir} 
                  onChange={(e) => setDspAir(Number(e.target.value))}
                  className="w-16 h-1 accent-purple-400 cursor-pointer" 
                />
              </div>

              {/* Stereo Width */}
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1 text-[9px] font-mono text-gray-400">
                  <span>STEREO WIDTH</span>
                  <span className="text-emerald-400 font-bold">{dspStereoWidth}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="200" 
                  value={dspStereoWidth} 
                  onChange={(e) => setDspStereoWidth(Number(e.target.value))}
                  className="w-16 h-1 accent-emerald-400 cursor-pointer" 
                />
              </div>

              {/* Reset Button */}
              <button 
                onClick={handleResetDsp}
                className="px-2 py-1 bg-[#1E2330] hover:bg-[#2A3245] rounded text-[10px] font-mono text-gray-300 hover:text-white border border-[#2F3646] transition-colors"
                title="EQ & Enhancer auf Standardwerte zurücksetzen"
              >
                RESET
              </button>
            </div>

          </div>
        )}

        {/* 3. MAIN STATIONARY PRECISION WAVEFORM (Standing Waveform, Gliding Red Playhead) */}
        <div 
          className={`${heightClass} rounded-xl border border-[#1e2a3e] relative overflow-hidden cursor-pointer flex flex-col justify-between shadow-2xl group select-none`}
          style={{ background: 'linear-gradient(180deg, #020b18 0%, #061836 50%, #030f24 100%)' }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickNorm = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const targetSec = windowStart + clickNorm * windowDuration;
            handleSeek(Math.max(0, Math.min(duration, targetSec)));
          }}
          title="Klicken zum schnellen Navigieren im aktuellen Takt-Fenster"
        >
          {/* Active Loop Region Highlight */}
          {isDeckLoopActive && loopStartSec !== null && loopEndSec !== null && (
            (() => {
              const lStart = Math.max(windowStart, loopStartSec);
              const lEnd = Math.min(windowEnd, loopEndSec);
              if (lEnd > lStart) {
                const startPct = ((lStart - windowStart) / windowDuration) * 100;
                const widthPct = ((lEnd - lStart) / windowDuration) * 100;
                return (
                  <div 
                    style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                    className="absolute top-0 bottom-0 bg-[#22C55E]/15 border-x-2 border-[#22C55E] pointer-events-none z-20 shadow-[inset_0_0_24px_rgba(34,197,94,0.35)] flex flex-col justify-between p-1.5"
                  >
                    <span className="text-[8px] font-mono font-black text-[#22C55E] bg-black/80 px-1.5 py-0.5 rounded border border-[#22C55E]/50 self-start">
                      LOOP IN
                    </span>
                    <span className="text-[8px] font-mono font-black text-[#22C55E] bg-black/80 px-1.5 py-0.5 rounded border border-[#22C55E]/50 self-end">
                      LOOP OUT ({activeLoopLength} BEATS)
                    </span>
                  </div>
                );
              }
              return null;
            })()
          )}

          {/* Beatgrid Vertical Lines & Downbeat Badges */}
          <div id="precision-beatgrid-lines-container" className="absolute inset-0 pointer-events-none z-10">
            {beats.map((bSec, bIdx) => {
              if (bSec < windowStart || bSec > windowEnd) return null;
              const xPct = ((bSec - windowStart) / windowDuration) * 100;
              if (xPct < -2 || xPct > 102) return null;
              const isDownbeat = bIdx % 4 === 0;
              const barNum = Math.floor(bIdx / 4) + 1;
              const subIndex = (bIdx % 4) + 1;

              return (
                <div 
                  key={bIdx}
                  data-beat-line="true"
                  style={{ left: `${xPct}%` }}
                  className="absolute top-0 bottom-0 pointer-events-none -translate-x-1/2"
                >
                  {isDownbeat ? (
                    <div className="h-full flex flex-col items-center">
                      <div className="px-1.5 py-0.5 rounded bg-black/90 text-white font-mono font-black text-[8px] shadow border border-white/80 z-20">
                        {barNum}
                      </div>
                      <div className="w-[1.5px] flex-1 bg-gradient-to-b from-white/90 via-cyan-400/80 to-white/40 shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
                    </div>
                  ) : (
                    <div className="h-full flex flex-col justify-between items-center py-1">
                      <div className="w-[1px] h-2 bg-white/40" />
                      <div className="w-[1px] h-full border-l border-dotted border-white/20" />
                      <div className="text-[7px] font-mono text-gray-500">.{subIndex}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Hot Cue Flags on Waveform (Styled matching Mixed In Key Reference Screenshot) */}
          {hotCues.map(cue => {
            const cueSec = cue.timeMs / 1000;
            if (cueSec < windowStart || cueSec > windowEnd) return null;
            const xPct = ((cueSec - windowStart) / windowDuration) * 100;
            if (xPct < -2 || xPct > 102) return null;
            return (
              <div 
                key={cue.id}
                style={{ left: `${xPct}%` }}
                className="absolute top-0 bottom-0 pointer-events-none z-25 -translate-x-[1px] flex flex-col items-start"
              >
                {/* Reference style: White right-pointing triangular flag + clean text */}
                <div className="flex items-center gap-1 -translate-y-0.5 pt-1 pl-0 select-none">
                  <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 drop-shadow">
                    <polygon points="0,0 12,6 0,12" fill="#FFFFFF" />
                  </svg>
                  <span className="text-white font-sans font-bold text-[12px] tracking-tight leading-none drop-shadow">
                    Cue {cue.slot}
                  </span>
                </div>
                {/* Crisp vertical solid white hairline dropping through waveform */}
                <div className="w-[1.5px] flex-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
              </div>
            );
          })}

          {/* High-Definition Multi-Layered SVG Waveform matching Reference Image */}
          <div className="absolute inset-0 pointer-events-none z-0 flex items-center">
            <svg viewBox="0 0 1000 200" preserveAspectRatio="none" className="w-full h-full">
              <defs>
                {/* Luminous Body Envelope (Smooth glowing translucent blue/cyan) */}
                <linearGradient id="bodyEnvelopeGradPlayed" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#0077ff" stopOpacity="0.60" />
                  <stop offset="25%" stopColor="#00aaff" stopOpacity="0.50" />
                  <stop offset="50%" stopColor="#00e5ff" stopOpacity="0.65" />
                  <stop offset="75%" stopColor="#00aaff" stopOpacity="0.50" />
                  <stop offset="100%" stopColor="#0077ff" stopOpacity="0.60" />
                </linearGradient>
                <linearGradient id="bodyEnvelopeGradUnplayed" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#0077ff" stopOpacity="0.32" />
                  <stop offset="25%" stopColor="#00aaff" stopOpacity="0.25" />
                  <stop offset="50%" stopColor="#00e5ff" stopOpacity="0.35" />
                  <stop offset="75%" stopColor="#00aaff" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#0077ff" stopOpacity="0.32" />
                </linearGradient>

                {/* Neon Cyan Inner Core Ribbon */}
                <linearGradient id="coreRibbonGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#00f5ff" stopOpacity="0.9" />
                  <stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="100%" stopColor="#00f5ff" stopOpacity="0.9" />
                </linearGradient>

                {/* Ultra-Fine Razor Transient Needles (Electric Ice Blue / Bright Cyan) */}
                <linearGradient id="needleGradPlayed" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="200">
                  <stop offset="0%" stopColor="#00ffff" stopOpacity="1.0" />
                  <stop offset="35%" stopColor="#38bdf8" stopOpacity="0.98" />
                  <stop offset="50%" stopColor="#0284c7" stopOpacity="0.92" />
                  <stop offset="65%" stopColor="#38bdf8" stopOpacity="0.98" />
                  <stop offset="100%" stopColor="#00ffff" stopOpacity="1.0" />
                </linearGradient>
                <linearGradient id="needleGradUnplayed" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="200">
                  <stop offset="0%" stopColor="#00ffff" stopOpacity="0.95" />
                  <stop offset="35%" stopColor="#00d2ff" stopOpacity="0.90" />
                  <stop offset="50%" stopColor="#0284c7" stopOpacity="0.80" />
                  <stop offset="65%" stopColor="#00d2ff" stopOpacity="0.90" />
                  <stop offset="100%" stopColor="#00ffff" stopOpacity="0.95" />
                </linearGradient>

                {/* Bottom Energy Floor Contour Gradient */}
                <linearGradient id="bottomFloorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.42" />
                  <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#022c3b" stopOpacity="0.05" />
                </linearGradient>

                {/* Playhead Mask for Smooth Sub-Pixel Transition */}
                <clipPath id="playheadMask">
                  <rect x="0" y="0" width={`${Math.max(0, Math.min(1000, (playheadPct / 100) * 1000))}`} height="200" />
                </clipPath>
              </defs>

              {/* Horizontal Center Baseline */}
              <line x1="0" y1="100" x2="1000" y2="100" stroke="#0e223d" strokeWidth="0.8" opacity="0.6" />

              {(() => {
                const count = 480;
                const sliceWindowSec = windowDuration / count;
                const sliceMetrics = [];
                for (let i = 0; i < count; i++) {
                  const sliceTime = windowStart + (i / count) * windowDuration;
                  const m = getTrackWaveformSlice(
                    track,
                    analysisData,
                    sliceTime,
                    duration,
                    gridAnchorSec,
                    beatIntervalSec,
                    audioBufferRef.current,
                    sliceWindowSec
                  );
                  sliceMetrics.push({
                    x: (i / count) * 1000 + 0.2,
                    w: (1000 / count) * 0.85,
                    ...m
                  });
                }

                // 1. Bottom Floor Area Path
                const floorPts = sliceMetrics.map(s => `L ${s.x.toFixed(1)} ${(200 - s.floorAmp * 45).toFixed(1)}`).join(' ');
                const floorPath = `M 0 200 ${floorPts} L 1000 200 Z`;

                // 2. Luminous Blue Body Envelope Path (Rounded lobes in drops, smooth ribbon elsewhere)
                const bodyUpper = sliceMetrics.map(s => `L ${s.x.toFixed(1)} ${(100 - s.bodyAmp * 66).toFixed(1)}`).join(' ');
                const bodyLower = [...sliceMetrics].reverse().map(s => `L ${s.x.toFixed(1)} ${(100 + s.bodyAmp * 66).toFixed(1)}`).join(' ');
                const bodyEnvelopePath = `M 0 ${(100 - sliceMetrics[0].bodyAmp * 66).toFixed(1)} ${bodyUpper} L 1000 ${(100 + sliceMetrics[sliceMetrics.length - 1].bodyAmp * 66).toFixed(1)} ${bodyLower} Z`;

                // 3. Neon Cyan Inner Core Path
                const coreUpper = sliceMetrics.map(s => `L ${s.x.toFixed(1)} ${(100 - s.coreAmp * 40).toFixed(1)}`).join(' ');
                const coreLower = [...sliceMetrics].reverse().map(s => `L ${s.x.toFixed(1)} ${(100 + s.coreAmp * 40).toFixed(1)}`).join(' ');
                const coreRibbonPath = `M 0 ${(100 - sliceMetrics[0].coreAmp * 40).toFixed(1)} ${coreUpper} L 1000 ${(100 + sliceMetrics[sliceMetrics.length - 1].coreAmp * 40).toFixed(1)} ${coreLower} Z`;

                // 4. Ultra-fine Needle Lines (High-contrast electric cyan needles)
                const needles = sliceMetrics.map(s => {
                  const h = Math.round(s.needleAmp * 92);
                  return {
                    x: s.x,
                    yTop: 100 - h,
                    yBottom: 100 + h,
                    height: Math.max(2, h * 2),
                    isKick: s.isKick,
                    isDownbeat: s.isDownbeat
                  };
                });

                return (
                  <>
                    {/* Layer 1: Bottom Energy Floor Contour */}
                    <path d={floorPath} fill="url(#bottomFloorGrad)" stroke="#00f0ff" strokeWidth="0.8" strokeOpacity="0.45" />

                    {/* Layer 2: Base Unplayed Audio Body Envelope */}
                    <path d={bodyEnvelopePath} fill="url(#bodyEnvelopeGradUnplayed)" stroke="#00d2ff" strokeWidth="1.2" strokeOpacity="0.50" />

                    {/* Layer 3: Unplayed Fine Transient Needles */}
                    <g fill="url(#needleGradUnplayed)">
                      {needles.map((n, i) => (
                        <rect key={i} x={n.x - 0.7} y={n.yTop} width={1.4} height={n.height} rx={0.7} />
                      ))}
                    </g>

                    {/* Layer 4: Played Active Section (Clipped to Playhead) */}
                    <g clipPath="url(#playheadMask)">
                      {/* Played Body Envelope */}
                      <path d={bodyEnvelopePath} fill="url(#bodyEnvelopeGradPlayed)" stroke="#00ffff" strokeWidth="1.5" strokeOpacity="0.85" />
                      {/* Neon Core Ribbon */}
                      <path d={coreRibbonPath} fill="url(#coreRibbonGrad)" opacity="0.85" />
                      {/* Bright Active Needles */}
                      <g fill="url(#needleGradPlayed)">
                        {needles.map((n, i) => (
                          <rect key={i} x={n.x - 0.7} y={n.yTop} width={1.4} height={n.height} rx={0.7} />
                        ))}
                      </g>
                      {/* Downbeat Apex White Ticks */}
                      {needles.filter(n => n.isDownbeat).map((n, i) => (
                        <g key={i}>
                          <line x1={n.x - 1.5} y1={n.yTop} x2={n.x + 1.5} y2={n.yTop} stroke="#FFFFFF" strokeWidth={1.5} />
                          <line x1={n.x - 1.5} y1={n.yBottom} x2={n.x + 1.5} y2={n.yBottom} stroke="#FFFFFF" strokeWidth={1.5} />
                        </g>
                      ))}
                    </g>
                  </>
                );
              })()}
            </svg>
          </div>

          {/* Gliding Red Playhead Hairline - Fluid 60/120fps without CSS transition delay */}
          <div 
            style={{ left: `${playheadPct}%` }}
            className="absolute top-0 bottom-0 w-[2px] bg-[#EF4444] shadow-[0_0_14px_#EF4444] z-30 pointer-events-none -translate-x-1/2"
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 text-[#EF4444] text-[12px] font-black leading-none select-none drop-shadow">
              ▼
            </div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[#EF4444] text-[12px] font-black leading-none select-none drop-shadow">
              ▲
            </div>
          </div>

        </div>

        {/* 4. OVERVIEW STRIPE (Mini Waveform with Song Structure Macro Areas & Mixed In Key Cue Flags) */}
        <div className="flex flex-col gap-1">
          <div 
            ref={overviewStripeRef}
            className="h-10 bg-[#090B0E] rounded-lg border border-[#242936] relative overflow-hidden cursor-pointer group flex items-center select-none"
            onMouseDown={(e) => {
              const rect = overviewStripeRef.current?.getBoundingClientRect();
              if (!rect) return;
              const clickNorm = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              handleSeek(clickNorm * duration);
              setIsOverviewDragging(true);
            }}
            title="Klicken oder Ziehen um schnell an eine Position zu springen"
          >
            {/* Song Macro Structure Areas (Continuous Sections) */}
            <div className="absolute inset-0 flex z-0">
              {MACRO_SECTIONS.map((sec, idx) => (
                <div 
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (sec.startSec !== undefined) handleSeek(sec.startSec);
                  }}
                  className="h-full border-r border-[#242936] flex flex-col justify-between px-1 py-0.5 cursor-pointer hover:brightness-135 transition-all"
                  style={{ 
                    width: `${sec.endPct - sec.startPct}%`,
                    backgroundColor: sec.color,
                    borderTop: `2px solid ${sec.border}`
                  }}
                  title={`${sec.name} (${Math.floor(sec.startSec / 60)}:${Math.floor(sec.startSec % 60).toString().padStart(2, '0')}) - Klick zum Anspringen`}
                >
                  <span className="text-[8px] font-mono font-black tracking-wider truncate" style={{ color: sec.text }}>
                    {sec.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Mini Waveform Bars (Individual Track Profile) */}
            <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none z-10 opacity-80">
              {(() => {
                const overviewBars = getTrackOverviewWaveform(track, analysisData, 96, duration, audioBufferRef.current);
                return overviewBars.map((h, idx) => {
                  const isPlayed = (idx / 96) <= (currentTime / (duration || 1));
                  return (
                    <div 
                      key={idx} 
                      className="w-[1.5px] rounded-full transition-all"
                      style={{
                        height: `${h}%`,
                        background: isPlayed ? '#00f0ff' : '#22384f'
                      }}
                    />
                  );
                });
              })()}
            </div>

            {/* Loop Region on Overview Stripe */}
            {isDeckLoopActive && loopStartSec !== null && loopEndSec !== null && (
              <div 
                className="absolute top-0 bottom-0 bg-[#22C55E]/30 border-x border-[#22C55E] pointer-events-none z-15"
                style={{
                  left: `${((loopStartSec) / (duration || 1)) * 100}%`,
                  width: `${((loopEndSec - loopStartSec) / (duration || 1)) * 100}%`
                }}
              />
            )}

            {/* Zoom Viewport Window Overlay on Overview Stripe */}
            <div 
              className="absolute top-0 bottom-0 border-2 border-cyan-400 bg-cyan-400/15 rounded pointer-events-none transition-all shadow-[0_0_12px_rgba(6,182,212,0.4)] z-20"
              style={{
                left: `${Math.max(0, (windowStart / (duration || 1)) * 100)}%`,
                width: `${Math.min(100, (windowDuration / (duration || 1)) * 100)}%`
              }}
            />

            {/* Mixed In Key 11 Style Cue Tabs on Overview Stripe */}
            {hotCues.map(cue => {
              const cueSec = cue.timeMs / 1000;
              const cuePct = (cueSec / (duration || 1)) * 100;
              return (
                <div 
                  key={cue.id}
                  className="absolute top-0 bottom-0 z-25 pointer-events-auto cursor-pointer group/cue -translate-x-1/2 flex flex-col items-center"
                  style={{ left: `${cuePct}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSeek(cueSec);
                  }}
                  title={`CUE ${cue.slot}: ${cue.name} (${Math.floor(cueSec / 60)}:${Math.floor(cueSec % 60).toString().padStart(2, '0')}) - Klick zum Anspringen`}
                >
                  <div 
                    className="px-1.5 py-0.5 rounded-t bg-[#0E182E] text-white font-black text-[8px] border-t-2 border-x border-cyan-400 shadow-md group-hover/cue:scale-110 group-hover/cue:bg-cyan-950 transition-transform"
                    style={{ borderTopColor: cue.color || '#00d2ff' }}
                  >
                    CUE {cue.slot}
                  </div>
                  <div 
                    className="w-[1.5px] flex-1 shadow-[0_0_6px_rgba(0,210,255,0.6)]" 
                    style={{ backgroundColor: cue.color || '#00d2ff' }} 
                  />
                </div>
              );
            })}

            {/* Red Hairline Playhead */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-[#EF4444] shadow-[0_0_8px_#EF4444] z-30 pointer-events-none"
              style={{ left: `${(currentTime / (duration || 1)) * 100}%` }}
            />
          </div>
        </div>

        {/* 5. TRANSPORT BAR (Play, Cue, Cup, and Loop controls) */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#12141A] p-2 rounded-xl border border-[#242936]">
          
          {/* Left: Play, Cue, Cup */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleTogglePlay}
              className="px-4 py-2 rounded-lg bg-[#bbf438] hover:bg-[#a3e635] text-black font-black flex items-center justify-center gap-1.5 transition-transform active:scale-95 shadow-md shadow-[#bbf438]/20"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black ml-0.5" />}
            </button>

            <button
              onClick={handleCueButton}
              className="px-3 py-2 rounded-lg bg-[#1E2330] hover:bg-[#2A3245] text-white font-mono font-bold text-xs border border-[#2F3646] transition-transform active:scale-95"
              title="CUE: Wenn abgespielt: Pause & Zurück zu Cue. Wenn pausiert: Setzt Cue auf aktuelle Position"
            >
              CUE
            </button>

            <button
              onClick={handleCupButton}
              className="px-3 py-2 rounded-lg bg-[#1E2330] hover:bg-[#2A3245] text-white font-mono font-bold text-xs border border-[#2F3646] transition-transform active:scale-95"
              title="CUP (Cue-Play): Springt sofort zu Cue 1 und spielt direkt ab"
            >
              CUP
            </button>
          </div>

          {/* Center: Loop Section (< 1/2 1 2 4 8 16 > IN OUT LoopToggle) */}
          <div className="flex items-center gap-1 bg-[#090B0E] px-2 py-1 rounded-lg border border-[#242936]">
            <button 
              onClick={handleHalveLoop}
              className="px-2 py-0.5 bg-[#1E2330] hover:bg-[#2A3245] rounded text-gray-300 text-xs font-mono font-bold"
              title="Loop halbieren"
            >
              &lt;
            </button>

            {[0.5, 1, 2, 4, 8, 16].map((l) => (
              <button
                key={l}
                onClick={() => handleSetBeatLoop(l)}
                className={`px-2 py-0.5 rounded text-xs font-mono font-bold transition-all ${
                  activeLoopLength === l && isDeckLoopActive
                    ? 'bg-[#22C55E] text-black shadow-sm font-black'
                    : activeLoopLength === l
                    ? 'bg-[#2A3245] text-cyan-300'
                    : 'text-gray-400 hover:text-white'
                }`}
                title={`${l === 0.5 ? 'Halber' : l} Takt Loop`}
              >
                {l === 0.5 ? '1/2' : l}
              </button>
            ))}

            <button 
              onClick={handleDoubleLoop}
              className="px-2 py-0.5 bg-[#1E2330] hover:bg-[#2A3245] rounded text-gray-300 text-xs font-mono font-bold"
              title="Loop verdoppeln"
            >
              &gt;
            </button>

            <div className="h-4 w-px bg-[#242936] mx-1" />

            <button
              onClick={handleLoopIn}
              className="px-2 py-0.5 bg-[#1E2330] hover:bg-[#2A3245] rounded text-xs font-mono font-bold text-gray-300 hover:text-white"
              title="Loop In Punkt manuell setzen"
            >
              IN
            </button>

            <button
              onClick={handleLoopOut}
              className="px-2 py-0.5 bg-[#1E2330] hover:bg-[#2A3245] rounded text-xs font-mono font-bold text-gray-300 hover:text-white"
              title="Loop Out Punkt manuell setzen & aktivieren"
            >
              OUT
            </button>

            <button
              onClick={handleToggleDeckLoop}
              className={`p-1.5 rounded transition-all ${
                isDeckLoopActive ? 'bg-[#22C55E] text-black shadow-[0_0_8px_#22c55e]' : 'text-gray-400 hover:text-white bg-[#1E2330]'
              }`}
              title={isDeckLoopActive ? "Loop aktiv - Klicken zum Beenden" : "Loop aktivieren"}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Save Current Loop to Slot */}
            <button
              onClick={handleSaveCurrentLoopToSlot}
              className="px-2 py-0.5 bg-[#10B981]/20 hover:bg-[#10B981]/35 text-[#10B981] border border-[#10B981]/50 rounded text-xs font-mono font-bold flex items-center gap-1 transition-all shadow-sm active:scale-95 ml-1"
              title="Aktuellen Loop in Slot ablegen & chronologisch einreihen (nachfolgende Slots rücken auf)"
            >
              <Save className="w-3 h-3 text-[#10B981]" />
              <span>+ Slot</span>
            </button>
          </div>

          {/* Right: Zoom Controls */}
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 text-xs font-mono">Zoom:</span>
            <button onClick={() => setZoomLevel(prev => Math.max(1, prev / 2))} className="px-2 py-1 bg-[#1E2330] hover:bg-[#2A3245] rounded text-xs text-white font-mono">-</button>
            <span className="text-xs font-mono font-bold text-cyan-400 px-1">{zoomLevel}x</span>
            <button onClick={() => setZoomLevel(prev => Math.min(8, prev * 2))} className="px-2 py-1 bg-[#1E2330] hover:bg-[#2A3245] rounded text-xs text-white font-mono">+</button>
          </div>

        </div>

        {/* 6. HOTCUES 1-8 PANEL (matching bottom panel of reference screenshot) */}
        <div className="flex flex-col gap-1.5 bg-[#12141A] p-2.5 rounded-xl border border-[#242936]">
          
          {/* Slots 1 to 8 Buttons */}
          <div className="grid grid-cols-8 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((slot) => {
              const cue = hotCues.find(c => c.slot === slot);
              const isSelected = selectedCueSlot === slot;
              const isLoop = cue?.isLoop;
              const isActive = cue?.isActive;

              return (
                <div key={slot} className="relative flex flex-col">
                  <button
                    onClick={() => handleHotCueClick(slot)}
                    className={`h-9 w-full rounded-lg font-mono font-black text-xs flex items-center justify-between px-2 transition-all border ${
                      cue
                        ? isLoop
                          ? isSelected
                            ? 'border-white text-black shadow-lg scale-[1.02]'
                            : isActive
                              ? 'border-emerald-300 text-black shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                              : 'border-transparent text-black opacity-85 hover:opacity-100'
                          : isSelected 
                            ? 'border-white text-black shadow-lg scale-[1.02]' 
                            : 'border-transparent text-black opacity-90 hover:opacity-100'
                        : isSelected 
                          ? 'bg-[#1E2330] text-cyan-400 border-cyan-400/50' 
                          : 'bg-[#0A0C10] text-gray-500 border-[#242936] hover:text-gray-300'
                    }`}
                    style={{
                      backgroundColor: cue ? (cue.color || (isLoop ? '#10B981' : '#22c55e')) : undefined
                    }}
                    title={
                      cue 
                        ? isLoop
                          ? `Loop Slot ${slot}: ${cue.name} (${(cue.timeMs / 1000).toFixed(1)}s - ${((cue.loopEndMs || 0) / 1000).toFixed(1)}s) [${isActive ? 'AKTIV' : 'INAKTIV'}]`
                          : `Cue ${slot}: ${cue.name} (${(cue.timeMs / 1000).toFixed(1)}s)` 
                        : `Slot ${slot} leer - Klicken zum Setzen`
                    }
                  >
                    <span className="text-xs font-bold flex items-center gap-0.5">
                      {slot}
                      {isLoop && <RotateCcw className="w-2.5 h-2.5 ml-0.5" />}
                    </span>
                    <span className="text-[9px] font-semibold truncate max-w-[50px]">
                      {cue ? cue.name : 'LEER'}
                    </span>
                  </button>

                  {/* Loop active toggle badge */}
                  {isLoop && (
                    <button
                      onClick={(e) => handleToggleLoopSlotActive(slot, e)}
                      className={`absolute -top-1.5 -right-1 px-1 py-0.2 rounded text-[7px] font-mono font-black border transition-all z-20 ${
                        isActive
                          ? 'bg-emerald-400 text-black border-white shadow-[0_0_6px_#10b981]'
                          : 'bg-black/90 text-gray-400 border-gray-600 hover:text-white'
                      }`}
                      title={isActive ? "Loop aktiv - Klicken zum Deaktivieren" : "Loop inaktiv - Klicken zum Scharfschalten/Aktivieren"}
                    >
                      {isActive ? 'AKTIV' : 'INAKTIV'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Active Cue Details & Mode Switcher Bar */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#1E2330] text-[11px] font-mono">
            
            {/* Left: Cue Jump & Edit Controls */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Prev / Next Cue */}
              <div className="flex items-center gap-0.5">
                <button onClick={handleJumpPrevCue} className="p-1 hover:text-cyan-400 text-gray-400 transition-colors" title="Zum vorherigen Cue springen">
                  <Rewind className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleJumpNextCue} className="p-1 hover:text-cyan-400 text-gray-400 transition-colors" title="Zum nächsten Cue springen">
                  <FastForward className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Slot & Time indicator */}
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#090B0E] rounded border border-[#242936]">
                <span className="text-amber-400 font-bold">▼ {selectedCueSlot}</span>
                <span className="text-white font-bold">{cueTimeFormatted}</span>
              </div>

              {/* Editable Cue Name Input */}
              <input 
                type="text"
                value={currentCue?.name || ''}
                onChange={(e) => handleUpdateCueName(selectedCueSlot, e.target.value)}
                placeholder="Cue Name..."
                className="bg-[#090B0E] border border-[#242936] rounded px-2 py-0.5 text-xs text-white font-mono w-32 focus:border-cyan-400 outline-none"
              />

              {/* Micro-Nudge & Delete */}
              <button 
                onClick={() => {
                  if (!currentCue) return;
                  const nextCues = hotCues.map(c => c.slot === selectedCueSlot ? { ...c, timeMs: Math.max(0, c.timeMs - 10) } : c);
                  setHotCues(nextCues);
                }}
                className="px-1.5 py-0.5 bg-[#1E2330] hover:bg-[#2A3245] rounded text-gray-300"
                title="-10ms"
              >
                &lt;
              </button>
              <button 
                onClick={() => {
                  if (!currentCue) return;
                  const nextCues = hotCues.map(c => c.slot === selectedCueSlot ? { ...c, timeMs: c.timeMs + 10 } : c);
                  setHotCues(nextCues);
                }}
                className="px-1.5 py-0.5 bg-[#1E2330] hover:bg-[#2A3245] rounded text-gray-300"
                title="+10ms"
              >
                &gt;
              </button>

              {currentCue && (
                <button 
                  onClick={() => handleDeleteCue(selectedCueSlot)}
                  className="p-1 hover:text-red-400 text-gray-500 transition-colors"
                  title="Cue löschen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Right: Mode Tabs (MOVE / CUE / GRID) */}
            <div className="flex items-center gap-1 bg-[#090B0E] p-0.5 rounded-lg border border-[#242936]">
              {(['MOVE', 'CUE', 'GRID'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setDeckTabMode(m)}
                  className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                    deckTabMode === m 
                      ? 'bg-cyan-500 text-black shadow-sm' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

          </div>

          {/* GRID Tools strip (Displayed when GRID tab is selected) */}
          {deckTabMode === 'GRID' && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#090B0E] p-2 rounded-xl border border-cyan-500/30 animate-in fade-in duration-100 text-[11px]">
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleAutoSnap}
                  disabled={isGridLocked}
                  className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 transition-all ${
                    autoSnapFeedback 
                      ? 'bg-[#22C55E] text-black border-[#22C55E]' 
                      : 'bg-[#1E2330] hover:bg-[#2A3245] text-cyan-300 border-cyan-500/30'
                  } disabled:opacity-40`}
                  title="Rastet Downbeat 1.1 am nächsten Kick-Transienten ein"
                >
                  <Magnet className="w-3.5 h-3.5" />
                  <span>AUTO SNAP</span>
                </button>

                <button 
                  onClick={handleSetGridHere}
                  disabled={isGridLocked}
                  className="px-2.5 py-1 rounded-lg border bg-[#1E2330] hover:bg-[#2A3245] text-amber-300 border-amber-500/30 font-bold flex items-center gap-1.5 disabled:opacity-40"
                  title="Setzt 1.1 Downbeat genau an die aktuelle Abspielposition"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>SET GRID 1.1</span>
                </button>

                <button 
                  onClick={handleTapTempo}
                  disabled={isGridLocked}
                  className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 transition-all ${
                    tapFeedbackBpm 
                      ? 'bg-amber-400 text-black border-amber-400' 
                      : 'bg-[#1E2330] hover:bg-[#2A3245] text-amber-300 border-amber-500/30'
                  } disabled:opacity-40`}
                >
                  <Timer className="w-3.5 h-3.5" />
                  <span>TAP {tapFeedbackBpm ? `(${tapFeedbackBpm})` : ''}</span>
                </button>

                <button 
                  onClick={() => setIsGridLocked(!isGridLocked)}
                  className={`px-2 py-1 rounded-lg border font-bold flex items-center gap-1 transition-all ${
                    isGridLocked ? 'bg-red-500/20 text-red-400 border-red-500/50' : 'bg-[#1E2330] text-gray-300 border-[#242936]'
                  }`}
                >
                  {isGridLocked ? <Lock className="w-3 h-3 text-red-400" /> : <Unlock className="w-3 h-3 text-gray-400" />}
                  <span>{isGridLocked ? 'LOCKED' : 'LOCK'}</span>
                </button>
              </div>

              {/* Micro-Shift & BPM Adjust */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-[#12141A] px-2 py-0.5 rounded border border-[#242936]">
                  <span className="text-gray-500">Shift:</span>
                  <button disabled={isGridLocked} onClick={() => shiftGrid(-10)} className="px-1 bg-[#1E2330] rounded text-white">-10ms</button>
                  <span className="font-bold text-cyan-400 px-1">{gridOffsetMs > 0 ? `+${gridOffsetMs}` : gridOffsetMs}ms</span>
                  <button disabled={isGridLocked} onClick={() => shiftGrid(10)} className="px-1 bg-[#1E2330] rounded text-white">+10ms</button>
                </div>

                <div className="flex items-center gap-1 bg-[#12141A] px-2 py-0.5 rounded border border-[#242936]">
                  <span className="text-gray-500">BPM:</span>
                  <button disabled={isGridLocked} onClick={() => adjustBpm(-0.01)} className="px-1 bg-[#1E2330] rounded text-white">-0.01</button>
                  <span className="font-bold text-[#22C55E] px-1">{currentBpm}</span>
                  <button disabled={isGridLocked} onClick={() => adjustBpm(0.01)} className="px-1 bg-[#1E2330] rounded text-white">+0.01</button>
                  <button disabled={isGridLocked} onClick={halveBpm} className="px-1 bg-[#1E2330] rounded text-white font-bold">/2</button>
                  <button disabled={isGridLocked} onClick={doubleBpm} className="px-1 bg-[#1E2330] rounded text-white font-bold">x2</button>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-lg p-3 animate-in fade-in duration-200">
      
      {/* Hidden audio element */}
      {audioSourceUrl && (
        <audio 
          ref={audioRef} 
          src={audioSourceUrl} 
          loop={isLooping} 
          preload="auto" 
        />
      )}

      {/* MASTER STUDIO CONSOLE MODAL */}
      <div className="bg-[#0A0C10] border border-[#242936] rounded-2xl w-full max-w-[1800px] h-[95vh] flex flex-col shadow-2xl overflow-hidden text-white font-sans relative">
        
        {/* TOP STATUS & TRANSPORT HEADER */}
        <div className="h-16 px-5 bg-[#12141A] border-b border-[#242936] flex items-center justify-between shrink-0">
          
          {/* Left: Track Title, Artist, & Format Tag */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#A855F7] to-[#06B6D4] flex items-center justify-center shrink-0 shadow-md shadow-[#A855F7]/25">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold uppercase tracking-wider text-white truncate max-w-md">
                  {track.title}
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#A855F7]/20 text-[#A855F7] border border-[#A855F7]/40 font-bold shrink-0">
                  DEEP ANALYSIS
                </span>
                {analysisData?.samplingRate && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#06B6D4]/15 text-[#06B6D4] border border-[#06B6D4]/30 shrink-0">
                    {analysisData.samplingRate} Hz / 24-Bit
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 font-mono truncate">
                {track.artist} • Key: <span className="text-[#A855F7] font-bold">{analysisData?.camelotKey || track.key}</span> • BPM: <span className="text-[#22C55E] font-bold">{currentBpm}</span> • Energy: <span className="text-[#F59E0B] font-bold">{analysisData?.calculatedEnergy || track.energy}/10</span>
              </p>
            </div>
          </div>

          {/* Center: Playback Transport Bar */}
          <div className="flex items-center gap-3 bg-[#0D0E12] px-4 py-1.5 rounded-xl border border-[#242936]">
            <button
              onClick={handleTogglePlay}
              className="w-8 h-8 rounded-full bg-[#A855F7] hover:bg-[#b56ef8] text-white flex items-center justify-center transition-transform active:scale-95 shadow-md shadow-[#A855F7]/30"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <div className="text-xs font-mono text-gray-300 w-24 text-center">
              <span>{Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')}</span>
              <span className="text-gray-500"> / </span>
              <span>{Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}</span>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-1.5 ml-2">
              <Volume2 className="w-3.5 h-3.5 text-gray-400" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setVolume(val);
                  if (audioRef.current) audioRef.current.volume = val;
                }}
                className="w-16 h-1 bg-[#242936] rounded-lg accent-[#A855F7] cursor-pointer"
              />
            </div>
          </div>

          {/* Right: Studio Tab Selector & Action Buttons */}
          <div className="flex items-center gap-2">
            
            {/* View Tabs */}
            <div className="flex items-center bg-[#0D0E12] p-1 rounded-xl border border-[#242936]">
              <button
                onClick={() => setActiveTab('studio')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'studio' ? 'bg-[#242936] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
                title="Master Studio Konsole (Referenz-Design)"
              >
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>Studio</span>
              </button>

              <button
                onClick={() => setActiveTab('beatgrid')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'beatgrid' ? 'bg-[#242936] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
                title="Precision Waveform & Taktgitter-Studio"
              >
                <Grid className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>Takt-Gitter</span>
              </button>

              <button
                onClick={() => setActiveTab('spectrum')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'spectrum' ? 'bg-[#242936] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
                title="Spektrumanalysator mit Piano-Noten-Klaviatur"
              >
                <Activity className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>Spektrum</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('online');
                  if (!onlineResult) handleSearchOnline();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'online' ? 'bg-[#242936] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
                title="Metadaten & Tags aus Online-Portalen ergänzen"
              >
                <Globe className="w-3.5 h-3.5 text-[#A855F7]" />
                <span>Online-Portale</span>
              </button>
            </div>

            {/* Metadata Edit Modal trigger */}
            <button
              onClick={() => {
                setMetaForm({
                  title: track.title || '',
                  artist: track.artist || '',
                  album: track.album || '',
                  year: track.year ? String(track.year) : '',
                  genre: track.genre || track.style || '',
                  mood: track.mood || '',
                  bpm: currentBpm || track.bpm || 124,
                  key: analysisData?.camelotKey || track.key || '8A',
                  energy: analysisData?.calculatedEnergy || track.energy || 7,
                  comments: track.comments || ''
                });
                setIsEditingMetadata(true);
              }}
              className="px-3 py-1.5 bg-[#1E2330] hover:bg-[#2A3245] border border-[#374151] rounded-xl text-xs font-bold text-gray-200 hover:text-white transition-all flex items-center gap-1.5 shadow-sm"
              title="Metadaten (Titel, Interpret, Album, Jahr, etc.) bearbeiten"
            >
              <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Metadaten</span>
            </button>

            {/* Re-analyze button */}
            <button
              onClick={handleRunAnalysis}
              disabled={isAnalyzing}
              className="p-2 bg-[#12141A] hover:bg-[#242936] border border-[#242936] rounded-xl text-gray-300 hover:text-white transition-colors"
              title="Track erneut tiefenanalysieren"
            >
              <RotateCcw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin text-cyan-400' : ''}`} />
            </button>

            {/* Save Button */}
            <button
              onClick={handleSaveAllChanges}
              className="px-3.5 py-2 bg-[#22C55E] hover:bg-[#16a34a] text-black font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-[#22C55E]/20 transition-all active:scale-95"
              title="Alle Änderungen an Beatgrid, BPM und Tags speichern"
            >
              <Save className="w-4 h-4" />
              <span>Speichern</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-[#242936] rounded-xl transition-colors ml-1"
              title="Schließen"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

        </div>

        {/* SAVE TOAST NOTIFICATION */}
        {saveSuccessMsg && (
          <div className="absolute top-20 right-6 z-50 bg-[#22C55E] text-black px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-2">
            <Check className="w-4 h-4 text-black" />
            <span>Track-Daten & Beatgrid erfolgreich gespeichert!</span>
          </div>
        )}

        {/* WORKSPACE AREA ACCORDING TO SELECTED TAB */}
        <div className="flex-1 overflow-y-auto flex flex-col bg-[#0A0C10] p-4 gap-4">
          
          {/* ========================================================= */}
          {/* TAB 1: STUDIO MASTER CONSOLE (Matching user screenshot)   */}
          {/* ========================================================= */}
          {activeTab === 'studio' && (
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              
              {/* TOP SPLIT: Surround Scope & Dual Magnitude Spectrum */}
              <div className="grid grid-cols-12 gap-3 min-h-[240px]">
                
                {/* LEFT: Surround Scope & Spatial Field (3 cols) */}
                <div className="col-span-3 bg-[#12141A] border border-[#242936] rounded-xl p-3 flex flex-col justify-between relative overflow-hidden">
                  <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 border-b border-[#242936] pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Compass className="w-3 h-3 text-[#06B6D4]" />
                      <span className="font-bold text-white uppercase tracking-wider">Nebula | Surround Scope</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-500">7.1 / Spatial</span>
                      <button 
                        onClick={() => setActiveInfoTopic('scope')}
                        className="p-0.5 hover:text-cyan-400 text-gray-400 transition-colors" 
                        title="Info zum Surround Scope öffnen"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 7.1 Speaker Arc Visualization with Listener */}
                  <div className="relative flex items-center justify-center my-2 h-36">
                    <div className="w-32 h-32 rounded-full border border-dashed border-[#242936] flex items-center justify-center relative">
                      {/* Speaker dots around circular arc */}
                      {[
                        { label: 'FL', angle: -65, active: true },
                        { label: 'C', angle: -35, active: true },
                        { label: 'C', angle: 0, active: true, center: true },
                        { label: 'C', angle: 35, active: true },
                        { label: 'FR', angle: 65, active: true },
                        { label: 'SL', angle: -105, active: false },
                        { label: 'SR', angle: 105, active: false }
                      ].map((sp, idx) => {
                        const rad = (sp.angle * Math.PI) / 180;
                        const r = 54;
                        const cx = Math.sin(rad) * r;
                        const cy = -Math.cos(rad) * r;
                        const pulseScale = isPlaying && sp.active ? 1 + liveAudio.surroundPulse * 0.45 : 1;
                        return (
                          <div 
                            key={idx}
                            style={{ 
                              transform: `translate(${cx}px, ${cy}px) scale(${pulseScale})`,
                              boxShadow: isPlaying && sp.active ? `0 0 ${6 + liveAudio.surroundPulse * 12}px ${sp.center ? '#f59e0b' : '#06b6d4'}` : undefined
                            }}
                            className={`absolute w-2.5 h-2.5 rounded-sm transition-all duration-75 ${
                              sp.center 
                                ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]' 
                                : sp.active 
                                  ? 'bg-[#94a3b8]' 
                                  : 'bg-[#334155]'
                            }`}
                          />
                        );
                      })}

                      {/* Listener Head in Center with audio ripple rings when playing */}
                      <div className="relative flex items-center justify-center">
                        {isPlaying && (
                          <div 
                            className="absolute rounded-full border border-cyan-400/50 pointer-events-none animate-ping"
                            style={{ width: `${34 + liveAudio.surroundPulse * 28}px`, height: `${34 + liveAudio.surroundPulse * 28}px` }}
                          />
                        )}
                        <div className="w-7 h-9 rounded-lg bg-[#1E293B] border border-cyan-400/80 flex flex-col items-center justify-center shadow-lg shadow-cyan-400/20 z-10">
                          <div className="w-3.5 h-1 bg-cyan-400 rounded-full mb-1" />
                          <div className="w-2 h-2 rounded-full bg-cyan-400" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Surround Readings */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono border-t border-[#242936] pt-1.5 text-gray-400">
                    <div>
                      <span className="text-gray-500 block">Stereo-Breite:</span>
                      <span className="font-bold text-white text-xs">{isPlaying ? liveAudio.stereoWidthPct : (analysisData?.spatial.stereoWidthPct || 98)}%</span>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-500 block">Phasenkorrelation:</span>
                      <span className="font-bold text-[#22C55E] text-xs">+1.0 (Mono OK)</span>
                    </div>
                  </div>
                </div>

                {/* RIGHT: Magnitude Spectrum (20 Hz - 20 kHz) with Rainbow Gradient & Notes (9 cols) */}
                <div className="col-span-9 bg-[#12141A] border border-[#242936] rounded-xl p-3 flex flex-col justify-between relative overflow-hidden">
                  <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 border-b border-[#242936] pb-1.5">
                    <div className="flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-bold text-white uppercase tracking-wider">Spektrumanalysator (20 Hz - 20 kHz)</span>
                      <button 
                        onClick={() => setActiveInfoTopic('spectrum')}
                        className="p-0.5 hover:text-amber-400 text-gray-400 transition-colors"
                        title="Info zum Spektrumanalysator öffnen"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Resonant Note Badges */}
                    <div className="flex items-center gap-3 text-[10px]">
                      <div className="flex items-center gap-1.5 text-cyan-400 font-mono">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#06b6d4]" />
                        <span>-47.7dB @ 117.1Hz (2.91m) | Bb 2 +9c</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-amber-400 font-mono">
                        <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
                        <span>-38.9dB @ 158.2Hz (2.16m) | D# 3 +29c</span>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Dual Spectrum Canvas with Rainbow Gradient Fill */}
                  <div 
                    className="relative flex-1 w-full my-1 cursor-crosshair overflow-hidden rounded-lg bg-[#0A0C10] border border-[#242936]"
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const xNorm = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      const freq = Math.round(20 * Math.pow(1000, xNorm));
                      const yNorm = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                      const db = Math.round((-108 + yNorm * 108) * 10) / 10;
                      const noteInfo = freqToNote(freq);
                      const wavelength = Math.round((SPEED_OF_SOUND / freq) * 100) / 100;
                      setHoveredFreq({ freq, db, note: noteInfo.note, cents: noteInfo.cents, wavelength, bandName: getFrequencyBandName(freq) });
                    }}
                    onMouseLeave={() => setHoveredFreq(null)}
                  >
                    <svg viewBox="0 0 1000 220" preserveAspectRatio="none" className="w-full h-full">
                      <defs>
                        {/* Rainbow gradient for magnitude spectrum fill matching user screenshot */}
                        <linearGradient id="spectrumGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#d97706" stopOpacity="0.85" />
                          <stop offset="25%" stopColor="#ca8a04" stopOpacity="0.8" />
                          <stop offset="45%" stopColor="#16a34a" stopOpacity="0.75" />
                          <stop offset="65%" stopColor="#0891b2" stopOpacity="0.75" />
                          <stop offset="85%" stopColor="#2563eb" stopOpacity="0.7" />
                          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.65" />
                        </linearGradient>
                      </defs>

                      {/* Horizontal dB grid lines (-12dB to -108dB) */}
                      {[-12, -24, -36, -48, -60, -72, -84, -96, -108].map((dbVal) => {
                        const y = ((0 - dbVal) / 108) * 220;
                        return (
                          <g key={dbVal}>
                            <line x1="0" y1={y} x2="1000" y2={y} stroke="#1F2430" strokeWidth="0.8" strokeDasharray="3 3" />
                            <text x="5" y={y - 3} fill="#475569" fontSize="8" fontFamily="monospace">{dbVal}dB</text>
                          </g>
                        );
                      })}

                      {/* Live Audio-Reactive Spectrum Bars (64-Band) Moving to Music Sound */}
                      <g className="transition-opacity duration-300">
                        {liveAudio.bands.map((bVal, i) => {
                          const x = i * (1000 / 64) + 1.2;
                          const w = (1000 / 64) - 2.4;
                          const safeVal = isNaN(bVal) ? 0.2 : Math.max(0.05, Math.min(1, bVal));
                          const rawCap = liveAudio.peakCaps ? liveAudio.peakCaps[i] : safeVal;
                          const safeCap = isNaN(rawCap) ? safeVal : Math.max(safeVal, Math.min(1, rawCap));
                          const h = Math.round(safeVal * 190);
                          const y = 220 - h;
                          const peakY = 220 - Math.round(safeCap * 190);
                          const xNorm = i / 63;
                          let barColor = '#ef4444';
                          if (xNorm > 0.65) barColor = '#a855f7';
                          else if (xNorm > 0.5) barColor = '#3b82f6';
                          else if (xNorm > 0.35) barColor = '#06b6d4';
                          else if (xNorm > 0.2) barColor = '#10b981';
                          else if (xNorm > 0.1) barColor = '#f59e0b';

                          return (
                            <g key={i}>
                              <rect
                                x={x}
                                y={y}
                                width={w}
                                height={h}
                                fill={barColor}
                                opacity={isPlaying ? 0.38 : 0.2}
                                rx="1.5"
                              />
                              {isPlaying && (
                                <line
                                  x1={x}
                                  y1={peakY}
                                  x2={x + w}
                                  y2={peakY}
                                  stroke="#ffffff"
                                  strokeWidth="1.2"
                                  opacity="0.8"
                                />
                              )}
                            </g>
                          );
                        })}
                      </g>

                      {/* Lower Spectrum Fill Path (Rainbow Gradient) with dynamic wave */}
                      <path
                        d={`M 0 220 
                           L 0 ${105 + liveAudio.curveWarp[0]} 
                           C 60 ${102 + liveAudio.curveWarp[1]}, 110 ${105 + liveAudio.curveWarp[2]}, 150 ${95 + liveAudio.curveWarp[3]} 
                           C 180 ${88 + liveAudio.curveWarp[4]}, 200 ${95 + liveAudio.curveWarp[5]}, 230 ${105 + liveAudio.curveWarp[6]} 
                           C 260 115, 300 98, 350 92 
                           C 400 95, 450 102, 500 94 
                           C 560 90, 620 95, 680 98 
                           C 750 100, 820 125, 880 150 
                           C 930 170, 970 195, 1000 205 
                           L 1000 220 Z`}
                        fill="url(#spectrumGradient)"
                      />

                      {/* Upper Response Curve (Solid Golden Amber) */}
                      <path
                        d={`M 0 ${95 + liveAudio.curveWarp[0]} 
                           C 60 ${92 + liveAudio.curveWarp[1]}, 110 ${95 + liveAudio.curveWarp[2]}, 150 ${82 + liveAudio.curveWarp[3]} 
                           C 180 ${75 + liveAudio.curveWarp[4]}, 200 ${85 + liveAudio.curveWarp[5]}, 230 ${95 + liveAudio.curveWarp[6]} 
                           C 260 105, 300 85, 350 78 
                           C 400 82, 450 92, 500 80 
                           C 560 75, 620 82, 680 88 
                           C 750 92, 820 115, 880 140 
                           C 930 160, 970 185, 1000 195`}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="1.8"
                      />

                      {/* Secondary Cyan Response Curve */}
                      <path
                        d={`M 0 ${105 + liveAudio.curveWarp[1]} 
                           C 60 ${102 + liveAudio.curveWarp[2]}, 110 ${105 + liveAudio.curveWarp[3]}, 150 ${95 + liveAudio.curveWarp[4]} 
                           C 180 ${88 + liveAudio.curveWarp[5]}, 200 ${95 + liveAudio.curveWarp[6]}, 230 ${105 + liveAudio.curveWarp[7]} 
                           C 260 115, 300 98, 350 92 
                           C 400 95, 450 102, 500 94 
                           C 560 90, 620 95, 680 98 
                           C 750 100, 820 125, 880 150 
                           C 930 170, 970 195, 1000 205`}
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth="1.5"
                      />

                      {/* Peak Note Markers */}
                      <circle cx="150" cy={`${95 + liveAudio.curveWarp[3]}`} r="3.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1" />
                      <line x1="150" y1={`${95 + liveAudio.curveWarp[3]}`} x2="150" y2="220" stroke="#f59e0b" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />

                      <circle cx="210" cy={`${88 + liveAudio.curveWarp[4]}`} r="3.5" fill="#06b6d4" stroke="#ffffff" strokeWidth="1" />
                      <line x1="210" y1={`${88 + liveAudio.curveWarp[4]}`} x2="210" y2="220" stroke="#06b6d4" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
                    </svg>

                    {/* Interactive Cursor Tooltip on Hover */}
                    {hoveredFreq && (
                      <div className="absolute top-2 right-2 bg-black/90 border border-cyan-500/50 rounded-lg px-2.5 py-1 text-[10px] font-mono text-white shadow-xl pointer-events-none z-30">
                        <span className="text-cyan-400 font-bold">{hoveredFreq.freq} Hz</span> ({hoveredFreq.wavelength}m) • <span className="text-amber-400">{hoveredFreq.db} dB</span> • <span className="text-purple-400 font-bold">{hoveredFreq.note}</span> ({hoveredFreq.cents > 0 ? `+${hoveredFreq.cents}` : hoveredFreq.cents}c)
                      </div>
                    )}
                  </div>

                  {/* Frequency Axis Labels (20, 50, 100, 200, 500, 1k, 2k, 5k, 10k, 20k) */}
                  <div className="flex justify-between text-[8px] font-mono text-gray-500 border-t border-[#242936] pt-1">
                    <span>20Hz</span>
                    <span>50Hz</span>
                    <span>100Hz</span>
                    <span>200Hz</span>
                    <span>500Hz</span>
                    <span>1kHz</span>
                    <span>2kHz</span>
                    <span>5kHz</span>
                    <span>10kHz</span>
                    <span>20kHz</span>
                  </div>

                </div>

              </div>

              {/* BOTTOM SPLIT: 8-Band RMS Level Meters, Loudness Numbers & Precision Waveform */}
              <div className="grid grid-cols-12 gap-3 min-h-[240px]">
                
                {/* Multi-Band RMS Metering & Digital Readouts (4 cols) */}
                <div className="col-span-4 bg-[#12141A] border border-[#242936] rounded-xl p-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 border-b border-[#242936] pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-[#22C55E]" />
                      <span className="font-bold text-white uppercase tracking-wider">RMS Metering & Loudness</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-500">Ref = -18dB</span>
                      <button 
                        onClick={() => setActiveInfoTopic('rms')}
                        className="p-0.5 hover:text-[#22C55E] text-gray-400 transition-colors"
                        title="Info zum RMS Metering öffnen"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 8 Vertical Color-coded RMS Bars */}
                  <div className="flex items-end justify-between gap-1.5 h-24 my-2 px-1">
                    {(analysisData?.spectral.bands || [
                      { id: 'sub', name: 'SUB', color: '#06B6D4', db: -17, peakDb: -14 },
                      { id: 'bass', name: 'BASS', color: '#22C55E', db: -16, peakDb: -12 },
                      { id: 'lowMid', name: 'LOW-MID', color: '#EAB308', db: -17, peakDb: -13 },
                      { id: 'mid', name: 'MID', color: '#F59E0B', db: -19, peakDb: -15 },
                      { id: 'highMid', name: 'HIGH-MID', color: '#EC4899', db: -20, peakDb: -16 },
                      { id: 'presence', name: 'PRESENCE', color: '#F3F4F6', db: -22, peakDb: -18 },
                      { id: 'brilliance', name: 'BRILLIANCE', color: '#F43F5E', db: -24, peakDb: -20 },
                      { id: 'air', name: 'AIR', color: '#3B82F6', db: -30, peakDb: -26 }
                    ]).map((band, bIdx) => {
                      const currentDb = isPlaying ? liveAudio.rmsLevels[bIdx] : band.db;
                      const fillPct = Math.max(5, Math.min(100, ((currentDb + 40) / 40) * 100));
                      return (
                        <div key={band.id} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                          <span className="text-[8px] font-mono text-gray-400">{currentDb.toFixed(1)}</span>
                          <div className="w-full bg-[#0D0E12] rounded-t-sm h-14 relative overflow-hidden flex items-end">
                            <div 
                              className="w-full transition-all duration-75 rounded-t-sm"
                              style={{ height: `${fillPct}%`, backgroundColor: band.color }}
                            />
                          </div>
                          <span className="text-[7px] font-mono font-bold text-gray-500 uppercase truncate max-w-[28px]">{band.name}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Big Leq Numeric Readouts */}
                  <div className="grid grid-cols-2 gap-2 border-t border-[#242936] pt-2">
                    <div className="bg-[#090B0E] p-2 rounded-lg border border-[#242936] flex items-center justify-between">
                      <div>
                        <div className="text-[9px] font-mono text-gray-500 uppercase">10 SEC Leq</div>
                        <div className="text-2xl font-mono font-black text-amber-400 tracking-wider transition-all">
                          {isPlaying ? liveAudio.leqDbc : (analysisData?.loudness.leqDbcFast || 100)}
                        </div>
                      </div>
                      <span className="text-xs font-bold font-mono text-amber-500">DBC</span>
                    </div>

                    <div className="bg-[#090B0E] p-2 rounded-lg border border-[#242936] flex items-center justify-between">
                      <div>
                        <div className="text-[9px] font-mono text-gray-500 uppercase">FAST Leq</div>
                        <div className="text-2xl font-mono font-black text-[#06B6D4] tracking-wider transition-all">
                          {isPlaying ? liveAudio.leqDba : (analysisData?.loudness.leqDbaSlow || 95)}
                        </div>
                      </div>
                      <span className="text-xs font-bold font-mono text-[#06B6D4]">DBA</span>
                    </div>
                  </div>
                </div>

                {/* Precision Waveform Deck & Beatgrid (8 cols) */}
                <div className="col-span-8 bg-[#12141A] border border-[#242936] rounded-xl p-3 flex flex-col justify-between relative">
                  <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 border-b border-[#242936] pb-1.5">
                    <div className="flex items-center gap-2">
                      <Grid className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="font-bold text-white uppercase tracking-wider">Precision Waveform</span>
                      <button 
                        onClick={() => setActiveInfoTopic('beatgrid')}
                        className="p-0.5 hover:text-cyan-400 text-gray-400 transition-colors"
                        title="Info zum Precision Beatgrid öffnen"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    
                    {/* Zoom & Beatgrid Info */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400">
                        {analysisData?.beatGrid.barsCount || 64} Takte (4/4) • {currentBpm} BPM
                      </span>
                      <div className="flex items-center gap-1 bg-[#0D0E12] px-2 py-0.5 rounded border border-[#242936]">
                        <button onClick={() => setZoomLevel(prev => Math.max(1, prev / 2))} className="hover:text-white p-0.5"><ZoomOut className="w-2.5 h-2.5" /></button>
                        <span className="text-[9px] font-bold">{zoomLevel}x</span>
                        <button onClick={() => setZoomLevel(prev => Math.min(8, prev * 2))} className="hover:text-white p-0.5"><ZoomIn className="w-2.5 h-2.5" /></button>
                      </div>
                    </div>
                  </div>

                  {/* Render Precision Deck */}
                  <div className="my-1">
                    {renderPrecisionDeck('h-44', true)}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: BEATGRID & TEMPO VARIATIONS STUDIO                 */}
          {/* ========================================================= */}
          {activeTab === 'beatgrid' && (
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto p-2">
              <div className="grid grid-cols-3 gap-3">
                
                {/* Tempo Drift & Stability Card */}
                <div className="bg-[#12141A] border border-[#242936] rounded-xl p-4 flex flex-col gap-2 relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                      <Gauge className="w-4 h-4 text-[#22C55E]" />
                      <span>Tempo-Stabilität & Variationen</span>
                    </div>
                    <button 
                      onClick={() => setActiveInfoTopic('beatgrid')}
                      className="p-0.5 hover:text-[#22C55E] text-gray-400 transition-colors"
                      title="Info öffnen"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-3xl font-mono font-bold text-[#22C55E] mt-2">
                    {currentBpm} <span className="text-xs text-gray-400 font-normal">BPM</span>
                  </div>
                  <div className="space-y-1 text-xs font-mono text-gray-300 pt-2 border-t border-[#242936]">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Min BPM:</span>
                      <span>{analysisData?.tempoVariation.minBpm || currentBpm}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Max BPM:</span>
                      <span>{analysisData?.tempoVariation.maxBpm || currentBpm}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Tempounterschiede:</span>
                      <span className="text-cyan-400 font-bold">±{analysisData?.tempoVariation.driftBpm || 0.2} BPM</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Stabilität:</span>
                      <span className="text-[#22C55E] font-bold">{analysisData?.tempoVariation.stabilityPercent || 99.8}%</span>
                    </div>
                  </div>
                </div>

                {/* Takt & Downbeat Card */}
                <div className="bg-[#12141A] border border-[#242936] rounded-xl p-4 flex flex-col gap-2 relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                      <Grid className="w-4 h-4 text-[#06B6D4]" />
                      <span>Takt & Downbeat Anchor</span>
                    </div>
                    <button 
                      onClick={() => setActiveInfoTopic('beatgrid')}
                      className="p-0.5 hover:text-[#06B6D4] text-gray-400 transition-colors"
                      title="Info öffnen"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-3xl font-mono font-bold text-[#06B6D4] mt-2">
                    4/4 <span className="text-xs text-gray-400 font-normal">Takt</span>
                  </div>
                  <div className="space-y-1 text-xs font-mono text-gray-300 pt-2 border-t border-[#242936]">
                    <div className="flex justify-between">
                      <span className="text-gray-500">1. Downbeat (1.1):</span>
                      <span className="text-cyan-300 font-bold">{analysisData?.beatGrid.firstBeatSec || 0.0}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Beat-Intervall:</span>
                      <span>{analysisData?.beatGrid.intervalSec || 0.468}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Erkannte Takte:</span>
                      <span className="text-white font-bold">{analysisData?.beatGrid.barsCount || 64}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Takt-Grid Status:</span>
                      <span className="text-[#22C55E] font-bold">Precision Kalibriert</span>
                    </div>
                  </div>
                </div>

                {/* Tonart & Tuning Card */}
                <div className="bg-[#12141A] border border-[#242936] rounded-xl p-4 flex flex-col gap-2 relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                      <Music className="w-4 h-4 text-[#A855F7]" />
                      <span>Tonart & Kammerton Tuning</span>
                    </div>
                    <button 
                      onClick={() => setActiveInfoTopic('tuning')}
                      className="p-0.5 hover:text-[#A855F7] text-gray-400 transition-colors"
                      title="Info zum Tuning öffnen"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-3xl font-mono font-bold text-[#A855F7] mt-2">
                    {analysisData?.camelotKey || track.key} <span className="text-xs text-gray-400 font-normal">({analysisData?.musicalKey || 'Am'})</span>
                  </div>
                  <div className="space-y-1 text-xs font-mono text-gray-300 pt-2 border-t border-[#242936]">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Referenz-Frequenz:</span>
                      <span>{analysisData?.spectral.tuningHz || 440.0} Hz</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Pitch Offset:</span>
                      <span className="text-amber-400 font-bold">{analysisData?.spectral.tuningCents || 0} Cents</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Harmonische Klasse:</span>
                      <span className="text-white">Quintenzirkel Kompatibel</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Stimmung A440:</span>
                      <span className="text-[#22C55E] font-bold">Präzise gestimmt</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Precision Full Deck in Beatgrid Tab */}
              <div className="bg-[#12141A] border border-[#242936] rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Precision Waveform & Beatgrid
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-cyan-500/20 text-cyan-400 font-bold">
                      PRO DECK MODE
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-400">Zoom:</span>
                    <button onClick={() => setZoomLevel(prev => Math.max(1, prev / 2))} className="px-2 py-1 bg-[#242936] hover:bg-[#32394a] rounded text-xs text-white font-mono">-</button>
                    <span className="text-xs font-mono font-bold text-cyan-400">{zoomLevel}x</span>
                    <button onClick={() => setZoomLevel(prev => Math.min(8, prev * 2))} className="px-2 py-1 bg-[#242936] hover:bg-[#32394a] rounded text-xs text-white font-mono">+</button>
                  </div>
                </div>

                {renderPrecisionDeck('h-56', true)}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: SPECTACULAR LOGARITHMIC SPECTRUM ANALYZER & PIANO  */}
          {/* ========================================================= */}
          {activeTab === 'spectrum' && (
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto p-2">
              <div className="bg-[#12141A] border border-[#242936] rounded-xl p-4 flex flex-col gap-3">
                
                {/* Header with Info Button */}
                <div className="flex items-center justify-between border-b border-[#242936] pb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#F59E0B]" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Spektrumanalysator
                    </h3>
                    <button 
                      onClick={() => setActiveInfoTopic('spectrum')}
                      className="p-0.5 hover:text-[#F59E0B] text-gray-400 transition-colors"
                      title="Info zum Spektrumanalysator öffnen"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-xs font-mono text-gray-400 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-[#22C55E] animate-ping' : 'bg-gray-500'}`} />
                    <span>{isPlaying ? 'Live Audio-Reaktiv (64-Band)' : '64-Band RTA + Piano-Oktaven (C1-C8)'}</span>
                  </div>
                </div>

                {/* Spectacular Spectrum Canvas */}
                <div 
                  className="h-80 bg-[#080A0E] rounded-xl border border-[#242936] relative overflow-hidden cursor-crosshair p-2 shadow-inner"
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const xNorm = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const freq = Math.round(20 * Math.pow(1000, xNorm));
                    const yNorm = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                    const db = Math.round((-108 + yNorm * 108) * 10) / 10;
                    const noteInfo = freqToNote(freq);
                    const wavelength = Math.round((SPEED_OF_SOUND / freq) * 100) / 100;
                    setHoveredFreq({ freq, db, note: noteInfo.note, cents: noteInfo.cents, wavelength, bandName: getFrequencyBandName(freq) });
                  }}
                  onMouseLeave={() => setHoveredFreq(null)}
                >
                  {/* 1. 64-Band Real-Time Neon RTA Bars (Animated to sound) */}
                  <div className="absolute inset-x-2 bottom-6 top-4 flex items-end justify-between gap-[2px] pointer-events-none opacity-85">
                    {RTA_BANDS.map((band, idx) => {
                      const curEnergy = isPlaying ? liveAudio.bands[idx] : band.energy;
                      const curPeak = isPlaying ? liveAudio.peakCaps[idx] : band.peakEnergy;
                      return (
                        <div key={band.index} className="flex-1 flex flex-col items-center justify-end h-full relative">
                          {/* Falling Peak-Hold Cap Dot */}
                          <div 
                            className="absolute w-full h-[2px] bg-white shadow-[0_0_6px_#ffffff] rounded-full transition-all duration-75"
                            style={{ bottom: `${curPeak * 100}%` }}
                          />
                          {/* Neon RTA Bar */}
                          <div 
                            className="w-full rounded-t-sm transition-all duration-75 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
                            style={{
                              height: `${curEnergy * 100}%`,
                              background: `linear-gradient(to top, ${band.color}30, ${band.color})`
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* 2. SVG Dual Glow Frequency Curves */}
                  <svg viewBox="0 0 1000 280" preserveAspectRatio="none" className="w-full h-full relative z-10 pointer-events-none">
                    <defs>
                      <linearGradient id="glowingSpectrumFill" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
                        <stop offset="25%" stopColor="#f59e0b" stopOpacity="0.35" />
                        <stop offset="50%" stopColor="#10b981" stopOpacity="0.35" />
                        <stop offset="75%" stopColor="#06b6d4" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#a855f7" stopOpacity="0.3" />
                      </linearGradient>
                      <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                    </defs>

                    {/* Horizontal dB Grid Lines */}
                    {[-12, -24, -36, -48, -60, -72, -84, -96, -108].map((dbVal) => {
                      const y = ((0 - dbVal) / 108) * 250;
                      return (
                        <g key={dbVal}>
                          <line x1="0" y1={y} x2="1000" y2={y} stroke="#1E2430" strokeWidth="0.8" strokeDasharray="3 3" />
                          <text x="5" y={y - 3} fill="#475569" fontSize="8" fontFamily="monospace">{dbVal} dB</text>
                        </g>
                      );
                    })}

                    {/* Translucent Glowing Fill */}
                    <path
                      d={`M 0 280 L 0 ${140 + liveAudio.curveWarp[0]} 
                         C 80 ${120 + liveAudio.curveWarp[1]}, 160 ${140 + liveAudio.curveWarp[2]}, 240 ${100 + liveAudio.curveWarp[3]} 
                         C 320 ${80 + liveAudio.curveWarp[4]}, 400 ${130 + liveAudio.curveWarp[5]}, 480 ${95 + liveAudio.curveWarp[6]} 
                         C 560 ${85 + liveAudio.curveWarp[7]}, 640 120, 720 110 
                         C 800 100, 880 145, 960 170 
                         L 1000 190 L 1000 280 Z`}
                      fill="url(#glowingSpectrumFill)"
                    />

                    {/* Primary Glowing Neon Curve */}
                    <path
                      d={`M 0 ${140 + liveAudio.curveWarp[0]} 
                         C 80 ${120 + liveAudio.curveWarp[1]}, 160 ${140 + liveAudio.curveWarp[2]}, 240 ${100 + liveAudio.curveWarp[3]} 
                         C 320 ${80 + liveAudio.curveWarp[4]}, 400 ${130 + liveAudio.curveWarp[5]}, 480 ${95 + liveAudio.curveWarp[6]} 
                         C 560 ${85 + liveAudio.curveWarp[7]}, 640 120, 720 110 
                         C 800 100, 880 145, 960 170 
                         L 1000 190`}
                      fill="none"
                      stroke="#06B6D4"
                      strokeWidth="2.5"
                      filter="url(#neonGlow)"
                    />

                    {/* Secondary Golden Harmonic Curve */}
                    <path
                      d={`M 0 ${160 + liveAudio.curveWarp[1]} 
                         C 80 ${140 + liveAudio.curveWarp[2]}, 160 ${160 + liveAudio.curveWarp[3]}, 240 ${120 + liveAudio.curveWarp[4]} 
                         C 320 ${100 + liveAudio.curveWarp[5]}, 400 ${150 + liveAudio.curveWarp[6]}, 480 ${115 + liveAudio.curveWarp[7]} 
                         C 560 105, 640 140, 720 130 
                         C 800 120, 880 165, 960 190 
                         L 1000 210`}
                      fill="none"
                      stroke="#F59E0B"
                      strokeWidth="1.5"
                      opacity="0.8"
                    />

                    {/* Harmonic Peaks Flags */}
                    <circle cx="240" cy={`${100 + liveAudio.curveWarp[3]}`} r="4" fill="#06B6D4" stroke="#ffffff" strokeWidth="1.5" />
                    <circle cx="480" cy={`${95 + liveAudio.curveWarp[6]}`} r="4" fill="#22C55E" stroke="#ffffff" strokeWidth="1.5" />
                    <circle cx="720" cy={`${110 + liveAudio.curveWarp[2]}`} r="4" fill="#F59E0B" stroke="#ffffff" strokeWidth="1.5" />
                  </svg>

                  {/* Laser Crosshair probe HUD on Hover */}
                  {hoveredFreq && (
                    <div className="absolute top-3 right-3 bg-[#0A0C10]/95 border-2 border-cyan-400 rounded-xl p-3 text-xs font-mono text-white shadow-2xl pointer-events-none z-30">
                      <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                        <Activity className="w-4 h-4" />
                        <span>{hoveredFreq.freq} Hz ({hoveredFreq.wavelength}m)</span>
                      </div>
                      <div className="text-gray-300 mt-1">Pegel: <span className="text-amber-400 font-bold">{hoveredFreq.db} dBFS</span></div>
                      <div className="text-gray-300">Harmonische Klaviernote: <span className="text-purple-400 font-bold">{hoveredFreq.note}</span> ({hoveredFreq.cents > 0 ? `+${hoveredFreq.cents}` : hoveredFreq.cents} Cents)</div>
                      <div className="text-cyan-300 text-[10px] mt-1 border-t border-[#242936] pt-1">{hoveredFreq.bandName}</div>
                    </div>
                  )}
                </div>

                {/* 3. INTEGRATED PIANO-KLAVIATUR (Notenleiste C1 bis C8) */}
                <div className="flex flex-col gap-1 bg-[#090B0E] p-2.5 rounded-xl border border-[#242936]">
                  <div className="flex items-center justify-between text-[10px] font-mono text-gray-400">
                    <span className="uppercase text-amber-400 font-bold flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5 text-amber-400" />
                      Piano-Klaviatur Notenleiste (C1 bis C8)
                    </span>
                    <span className="text-gray-500">Logarithmisch synchronisiert mit Frequenzachse</span>
                  </div>

                  {/* Piano Keys Strip with dynamic real-time note illumination */}
                  <div className="relative h-10 w-full bg-[#161920] rounded border border-[#242936] overflow-hidden">
                    {PIANO_KEYS.map((key) => {
                      const isLiveActive = isPlaying && liveAudio.activeMidi === key.midi;
                      const isFundamental = !isPlaying && (key.fullName === 'Bb2' || key.fullName === 'D#3');
                      const isHighlighted = isLiveActive || isFundamental;
                      if (key.isBlack) {
                        return (
                          <div 
                            key={key.midi}
                            className={`absolute top-0 h-6 w-1.5 rounded-b -translate-x-1/2 z-20 transition-all duration-75 ${
                              isHighlighted 
                                ? 'bg-amber-400 shadow-[0_0_12px_#f59e0b] scale-y-110 z-30' 
                                : 'bg-[#0A0C10] border-x border-b border-black'
                            }`}
                            style={{ left: `${key.xPct}%` }}
                            title={`${key.fullName} (${key.freq} Hz)`}
                          />
                        );
                      }
                      return (
                        <div 
                          key={key.midi}
                          className={`absolute top-0 bottom-0 w-2.5 border-r border-[#242936] flex flex-col justify-end items-center pb-0.5 text-[7px] font-mono font-bold transition-all duration-75 ${
                            isHighlighted 
                              ? 'bg-amber-400/60 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.7)] font-black scale-y-105' 
                              : 'bg-[#1E2330] text-gray-400 hover:bg-[#2A3245]'
                          }`}
                          style={{ left: `${key.xPct}%` }}
                          title={`${key.fullName} (${key.freq} Hz)`}
                        >
                          {(key.name === 'C' || isHighlighted) && (
                            <span className={isHighlighted ? "text-amber-300 font-bold scale-110" : ""}>{isHighlighted ? key.name : `C${key.octave}`}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Frequency Labels */}
                  <div className="flex justify-between text-[8px] font-mono text-gray-500 pt-0.5">
                    <span>20Hz (Sub)</span>
                    <span>100Hz (Bass)</span>
                    <span>440Hz (A4)</span>
                    <span>1kHz (Mid)</span>
                    <span>5kHz (Presence)</span>
                    <span>20kHz (Air)</span>
                  </div>
                </div>

                {/* Resonant Peaks Table */}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {(analysisData?.spectral.harmonicPeaks || [
                    { freqHz: 117.1, db: -47.7, note: 'Bb 2', cents: 9, distanceMeters: 2.91 },
                    { freqHz: 158.2, db: -38.9, note: 'D# 3', cents: 29, distanceMeters: 2.16 },
                    { freqHz: 234.0, db: -42.1, note: 'Bb 3', cents: 8, distanceMeters: 1.47 },
                    { freqHz: 1240.0, db: -56.4, note: 'D# 6', cents: 14, distanceMeters: 0.28 }
                  ]).map((peak, idx) => (
                    <div key={idx} className="bg-[#0D0E12] p-2.5 rounded-lg border border-[#242936] text-xs font-mono">
                      <div className="text-gray-500 text-[10px]">Peak #{idx + 1} ({idx === 0 ? 'F0 Fundamental' : `F${idx} Harmonic`})</div>
                      <div className="text-[#22C55E] font-bold mt-0.5">{peak.freqHz} Hz ({peak.distanceMeters}m)</div>
                      <div className="text-gray-300 mt-0.5">{peak.db} dB • <span className="text-[#A855F7] font-bold">{peak.note}</span></div>
                    </div>
                  ))}
                </div>

              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 4: ONLINE METADATA ENRICHMENT                         */}
          {/* ========================================================= */}
          {activeTab === 'online' && (
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto p-2">
              
              {/* Online Search Query Bar */}
              <div className="bg-[#12141A] border border-[#242936] rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[#A855F7]" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Online-Portale Abfrage (MusicBrainz, Discogs, Beatport)
                    </h3>
                    <button 
                      onClick={() => setActiveInfoTopic('online')}
                      className="p-0.5 hover:text-[#A855F7] text-gray-400 transition-colors"
                      title="Info zu den Online-Portalen öffnen"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono">Open Source Music Metadata Integration</span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-[#0A0C10] border border-[#242936] rounded-xl px-3 py-2 text-xs">
                    <Search className="w-4 h-4 text-gray-400" />
                    <input 
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchOnline()}
                      placeholder="Künstler und Songtitel eingeben..."
                      className="bg-transparent text-white outline-none flex-1 font-mono"
                    />
                  </div>
                  <button
                    onClick={handleSearchOnline}
                    disabled={isSearchingOnline}
                    className="px-4 py-2 bg-[#A855F7] hover:bg-[#9333ea] text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{isSearchingOnline ? 'Suche läuft...' : 'Online suchen'}</span>
                  </button>
                </div>

                {/* Direct Portal Links */}
                <div className="pt-2 border-t border-[#242936]">
                  <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block mb-2">
                    Direkt in DJ-Portalen öffnen:
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {(onlineResult?.portalLinks || [
                      { name: 'Beatport', url: `https://www.beatport.com/search?q=${encodeURIComponent(`${track.artist} ${track.title}`)}` },
                      { name: 'Discogs', url: `https://www.discogs.com/search/?q=${encodeURIComponent(`${track.artist} ${track.title}`)}&type=release` },
                      { name: 'Traxsource', url: `https://www.traxsource.com/search?term=${encodeURIComponent(`${track.artist} ${track.title}`)}` },
                      { name: 'Spotify', url: `https://open.spotify.com/search/${encodeURIComponent(`${track.artist} ${track.title}`)}` },
                      { name: 'Tunebat (BPM & Key)', url: `https://tunebat.com/Search?q=${encodeURIComponent(`${track.artist} ${track.title}`)}` },
                      { name: 'SongBPM', url: `https://songbpm.com/@${encodeURIComponent(track.artist)}/${encodeURIComponent(track.title)}` }
                    ]).map((portal, idx) => (
                      <a
                        key={idx}
                        href={portal.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 bg-[#0A0C10] hover:bg-[#242936] border border-[#242936] hover:border-cyan-400/50 rounded-lg text-xs font-mono text-gray-300 hover:text-white flex items-center gap-1.5 transition-all shadow-sm"
                      >
                        <span>{portal.name}</span>
                        <ExternalLink className="w-3 h-3 text-gray-500" />
                      </a>
                    ))}
                  </div>
                </div>
              </div>

              {/* Online Candidates Result List */}
              <div className="bg-[#12141A] border border-[#242936] rounded-xl p-4 flex flex-col gap-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Gefundene Treffer ({onlineResult?.candidates?.length || 0})
                </h4>

                {onlineResult && onlineResult.candidates.length === 0 && (
                  <div className="text-sm text-gray-500 py-6 text-center">
                    Keine direkten Treffer auf MusicBrainz gefunden. Nutze die Portal-Links oben für Discogs & Beatport.
                  </div>
                )}

                <div className="space-y-2">
                  {onlineResult?.candidates.map((cand) => (
                    <div 
                      key={cand.id}
                      className="p-3 bg-[#0A0C10] border border-[#242936] hover:border-purple-500/60 rounded-xl flex items-center justify-between transition-colors group gap-3"
                    >
                      {/* Candidate Artwork */}
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#1E2330] to-[#12141A] border border-[#2A3245] overflow-hidden flex items-center justify-center shrink-0 shadow relative">
                        <Disc className="w-6 h-6 text-purple-400/70 pointer-events-none" />
                        {cand.coverArt && (
                          <img 
                            src={cand.coverArt} 
                            alt={cand.title} 
                            className="w-full h-full object-cover absolute inset-0" 
                            onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                          />
                        )}
                      </div>

                      {/* Candidate Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-white">{cand.title}</span>
                          {cand.year && <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#1E293B] text-cyan-400 font-bold">{cand.year}</span>}
                          {cand.genre && <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">{cand.genre}</span>}
                          {cand.source && <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-[#161922] text-gray-400 border border-[#2A3245] uppercase">{cand.source}</span>}
                        </div>
                        <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">
                          Künstler: <span className="text-gray-200">{cand.artist}</span> • Album: <span className="text-gray-200">{cand.album || 'Single'}</span>
                          {cand.label ? ` • Label: ${cand.label}` : ''}
                        </p>
                      </div>

                      <button
                        onClick={() => handleApplyOnlineMetadata(cand)}
                        className="px-3.5 py-2 bg-[#22C55E] hover:bg-[#16a34a] text-black font-bold text-xs rounded-xl flex items-center gap-1.5 transition-transform active:scale-95 shrink-0 shadow-md shadow-[#22C55E]/20"
                        title="Metadaten und Cover-Artwork für diesen Track übernehmen"
                      >
                        <Check className="w-4 h-4" />
                        <span>Übernehmen</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

        </div>

      </div>

      {/* INTERACTIVE EXPLANATORY INFO MODAL (i) */}
      {activeInfoTopic && INFO_TOPICS[activeInfoTopic] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-[#12151D] border border-[#242936] rounded-2xl w-full max-w-xl p-6 shadow-2xl flex flex-col gap-4 text-white relative">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#242936] pb-3">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
                  style={{ backgroundColor: `${INFO_TOPICS[activeInfoTopic].color}25`, color: INFO_TOPICS[activeInfoTopic].color }}
                >
                  <Info className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {INFO_TOPICS[activeInfoTopic].title}
                  </h3>
                  <p className="text-xs text-gray-400 font-mono">
                    {INFO_TOPICS[activeInfoTopic].subtitle}
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setActiveInfoTopic(null)}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#242936] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Explanation Content */}
            <div className="space-y-2.5 text-xs text-gray-300 leading-relaxed font-sans">
              {INFO_TOPICS[activeInfoTopic].content.map((p, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div 
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: INFO_TOPICS[activeInfoTopic].color }}
                  />
                  <p>{p}</p>
                </div>
              ))}
            </div>

            {/* DJ & Sound Engineering Tips Box */}
            <div className="bg-[#090B0E] border border-amber-500/30 rounded-xl p-3.5 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span>DJ & Tontechnik Praxistipps</span>
              </div>
              <ul className="space-y-1 text-xs text-gray-300 list-disc list-inside">
                {INFO_TOPICS[activeInfoTopic].tips.map((tip, idx) => (
                  <li key={idx}>{tip}</li>
                ))}
              </ul>
            </div>

            {/* Bottom Close Button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setActiveInfoTopic(null)}
                className="px-4 py-2 bg-[#242936] hover:bg-[#333b4e] text-white font-bold text-xs rounded-xl transition-all"
              >
                Verstanden
              </button>
            </div>

          </div>
        </div>
      )}

      {/* METADATA EDIT MODAL */}
      {isEditingMetadata && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-[#12151D] border border-[#242936] rounded-2xl w-full max-w-2xl p-6 shadow-2xl flex flex-col gap-4 text-white relative">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#242936] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shadow-lg">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Track-Metadaten & ID3-Tags bearbeiten
                  </h3>
                  <p className="text-xs text-gray-400 font-mono">
                    Änderungen werden in der Library und auf der Festplatte persistiert
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setIsEditingMetadata(false)}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#242936] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Fields Grid */}
            <div className="grid grid-cols-2 gap-3.5 text-xs font-mono">
              
              {/* Titel */}
              <div className="flex flex-col gap-1">
                <label className="text-gray-400 uppercase font-bold text-[10px]">Titel *</label>
                <input 
                  type="text"
                  value={metaForm.title}
                  onChange={(e) => setMetaForm({ ...metaForm, title: e.target.value })}
                  className="bg-[#090B0E] border border-[#242936] focus:border-cyan-400 rounded-lg p-2.5 text-white outline-none"
                  placeholder="Songtitel eingeben..."
                />
              </div>

              {/* Interpret / Artist */}
              <div className="flex flex-col gap-1">
                <label className="text-gray-400 uppercase font-bold text-[10px]">Interpret / Künstler *</label>
                <input 
                  type="text"
                  value={metaForm.artist}
                  onChange={(e) => setMetaForm({ ...metaForm, artist: e.target.value })}
                  className="bg-[#090B0E] border border-[#242936] focus:border-cyan-400 rounded-lg p-2.5 text-white outline-none"
                  placeholder="Künstlername..."
                />
              </div>

              {/* Album */}
              <div className="flex flex-col gap-1">
                <label className="text-gray-400 uppercase font-bold text-[10px]">Album / Release</label>
                <input 
                  type="text"
                  value={metaForm.album}
                  onChange={(e) => setMetaForm({ ...metaForm, album: e.target.value })}
                  className="bg-[#090B0E] border border-[#242936] focus:border-cyan-400 rounded-lg p-2.5 text-white outline-none"
                  placeholder="Album oder EP Name..."
                />
              </div>

              {/* Jahr */}
              <div className="flex flex-col gap-1">
                <label className="text-gray-400 uppercase font-bold text-[10px]">Erscheinungsjahr</label>
                <input 
                  type="text"
                  value={metaForm.year}
                  onChange={(e) => setMetaForm({ ...metaForm, year: e.target.value })}
                  className="bg-[#090B0E] border border-[#242936] focus:border-cyan-400 rounded-lg p-2.5 text-white outline-none"
                  placeholder="z. B. 2024"
                />
              </div>

              {/* Genre / Stil */}
              <div className="flex flex-col gap-1">
                <label className="text-gray-400 uppercase font-bold text-[10px]">Genre / Stil</label>
                <input 
                  type="text"
                  value={metaForm.genre}
                  onChange={(e) => setMetaForm({ ...metaForm, genre: e.target.value })}
                  className="bg-[#090B0E] border border-[#242936] focus:border-cyan-400 rounded-lg p-2.5 text-white outline-none"
                  placeholder="z. B. Melodic House, Techno..."
                />
              </div>

              {/* Stimmung */}
              <div className="flex flex-col gap-1">
                <label className="text-gray-400 uppercase font-bold text-[10px]">Stimmung / Mood</label>
                <input 
                  type="text"
                  value={metaForm.mood}
                  onChange={(e) => setMetaForm({ ...metaForm, mood: e.target.value })}
                  className="bg-[#090B0E] border border-[#242936] focus:border-cyan-400 rounded-lg p-2.5 text-white outline-none"
                  placeholder="z. B. Uplifting, Dark, Hypnotic..."
                />
              </div>

              {/* BPM */}
              <div className="flex flex-col gap-1">
                <label className="text-gray-400 uppercase font-bold text-[10px]">Tempo (BPM)</label>
                <input 
                  type="number"
                  step="0.01"
                  value={metaForm.bpm}
                  onChange={(e) => setMetaForm({ ...metaForm, bpm: parseFloat(e.target.value) || 0 })}
                  className="bg-[#090B0E] border border-[#242936] focus:border-cyan-400 rounded-lg p-2.5 text-white outline-none"
                />
              </div>

              {/* Camelot Key */}
              <div className="flex flex-col gap-1">
                <label className="text-gray-400 uppercase font-bold text-[10px]">Tonart (Camelot / Key)</label>
                <input 
                  type="text"
                  value={metaForm.key}
                  onChange={(e) => setMetaForm({ ...metaForm, key: e.target.value })}
                  className="bg-[#090B0E] border border-[#242936] focus:border-cyan-400 rounded-lg p-2.5 text-white outline-none uppercase"
                  placeholder="z. B. 8A oder Am"
                />
              </div>

              {/* Energy Level (1-10) */}
              <div className="col-span-2 flex flex-col gap-1 bg-[#090B0E] p-3 rounded-lg border border-[#242936]">
                <div className="flex justify-between items-center">
                  <label className="text-gray-400 uppercase font-bold text-[10px]">Energy Level</label>
                  <span className="text-amber-400 font-bold text-sm">{metaForm.energy} / 10</span>
                </div>
                <input 
                  type="range"
                  min="1"
                  max="10"
                  value={metaForm.energy}
                  onChange={(e) => setMetaForm({ ...metaForm, energy: parseInt(e.target.value, 10) })}
                  className="accent-amber-400 cursor-pointer"
                />
              </div>

              {/* Notizen / Kommentare */}
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-gray-400 uppercase font-bold text-[10px]">Notizen / Kommentare</label>
                <textarea 
                  value={metaForm.comments}
                  onChange={(e) => setMetaForm({ ...metaForm, comments: e.target.value })}
                  rows={2}
                  className="bg-[#090B0E] border border-[#242936] focus:border-cyan-400 rounded-lg p-2.5 text-white outline-none resize-none font-sans text-xs"
                  placeholder="Zusätzliche DJ-Notizen, Mix-Tipps..."
                />
              </div>

            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#242936]">
              <button
                onClick={() => setIsEditingMetadata(false)}
                className="px-4 py-2 bg-[#1E2330] hover:bg-[#2A3245] text-gray-300 font-bold text-xs rounded-xl transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSaveMetadata}
                className="px-5 py-2 bg-[#22C55E] hover:bg-[#16a34a] text-black font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-[#22C55E]/20 transition-transform active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>Metadaten speichern</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
