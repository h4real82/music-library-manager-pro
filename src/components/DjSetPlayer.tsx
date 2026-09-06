import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Music, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft, 
  Zap, 
  Sliders, 
  Waves, 
  Scissors, 
  Gauge, 
  Activity,
  Download,
  Bookmark,
  VolumeX,
  Volume2
} from 'lucide-react';
import { TrackDef, TransitionConfig, TransitionPresetType } from '../types';
import { globalDjSetEngine, TransitionState, SetTimeUpdateEvent } from '../lib/djSetAudioEngine';
import { evaluateKeyCompatibility, calculateTempoSync } from '../lib/djMixerLogic';
import BeatgridRepairModal from './BeatgridRepairModal';

interface DjSetPlayerProps {
  deckATrack: TrackDef | null;
  deckBTrack: TrackDef | null;
  activeTransition: TransitionConfig | null;
  transitions: TransitionConfig[];
  onSelectTransition: (t: TransitionConfig) => void;
  onOpenTrackAnalysis?: (track: TrackDef) => void;
  onTrackUpdated?: (track: TrackDef) => void;
  liveSetEvent?: SetTimeUpdateEvent | null;
  onOpenSetExport?: () => void;
  onSaveSetAsPlaylist?: () => void;
}

export const PRESET_META: Record<TransitionPresetType, { name: string; icon: any; color: string; desc: string }> = {
  'eq-blend': {
    name: 'EQ-Wechsel (Blend)',
    icon: Sliders,
    color: '#06B6D4', // cyan
    desc: '32/64 Beats Frequenz-Crossover mit zeitversetztem Bass-Tausch',
  },
  'bass-swap': {
    name: 'Bass-Swap (Instant)',
    icon: Zap,
    color: '#A855F7', // purple
    desc: 'Schlagartiger Low-End Switch auf der Eins ohne Bass-Überlagerung',
  },
  'filter-sweep': {
    name: 'HPF Filter-Sweep',
    icon: Waves,
    color: '#F59E0B', // amber
    desc: 'Biquad HPF Sweep (20 Hz -> 2000 Hz) mit dramatischer Resonanz Q',
  },
  'cut-drop': {
    name: 'Cut / Drop (Fader Slam)',
    icon: Scissors,
    color: '#EF4444', // red
    desc: 'Harter Schnitt direkt auf den Drop mit 5-10ms Knackschutz',
  },
  'equal-power': {
    name: 'Equal-Power Crossfade',
    icon: Gauge,
    color: '#22C55E', // green
    desc: 'Sinus/Cosinus-Kurve für konstanten Schalldruck ohne Mitten-Dip',
  },
};

export default function DjSetPlayer({
  deckATrack,
  deckBTrack,
  activeTransition,
  transitions,
  onSelectTransition,
  onOpenTrackAnalysis,
  onTrackUpdated,
  liveSetEvent,
  onOpenSetExport,
  onSaveSetAsPlaylist,
}: DjSetPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [crossfaderProgress, setCrossfaderProgress] = useState(0); // 0.0 -> 1.0
  const [transitionState, setTransitionState] = useState<TransitionState | null>(null);
  const [isAutoTransitioning, setIsAutoTransitioning] = useState(false);
  const [repairModalTrack, setRepairModalTrack] = useState<{ track: TrackDef; reference?: TrackDef } | null>(null);
  const autoTransitionRef = useRef<number | null>(null);

  // Quick Kill States for Deck A & Deck B
  const [killsA, setKillsA] = useState({ low: false, mid: false, high: false });
  const [killsB, setKillsB] = useState({ low: false, mid: false, high: false });

  const activePreset: TransitionPresetType = activeTransition?.preset || 'bass-swap';
  const durationBeats = activeTransition?.durationBeats || 32;

  const sourceMixOutSec = activeTransition?.sourceTimeSec !== undefined
    ? activeTransition.sourceTimeSec 
    : Math.max(0, (deckATrack?.duration || 180) - (durationBeats * (60 / (deckATrack?.bpm || 130))));
  const targetMixInSec = activeTransition?.targetTimeSec !== undefined
    ? activeTransition.targetTimeSec
    : 0;

  // Sync tracks with audio engine when not playing live set
  useEffect(() => {
    if (deckATrack && !liveSetEvent?.isPlaying) {
      globalDjSetEngine.loadDeckA(deckATrack, sourceMixOutSec);
    }
  }, [deckATrack, sourceMixOutSec, liveSetEvent?.isPlaying]);

  useEffect(() => {
    if (deckBTrack && !liveSetEvent?.isPlaying) {
      globalDjSetEngine.loadDeckB(deckBTrack, targetMixInSec);
    }
  }, [deckBTrack, targetMixInSec, liveSetEvent?.isPlaying]);

  // Key and Tempo evaluation
  const keyComp = evaluateKeyCompatibility(deckATrack?.key, deckBTrack?.key);
  const tempoSync = calculateTempoSync(deckATrack?.bpm || 130, deckBTrack?.bpm || 130);

  // Derive real-time values directly from live set playback event to avoid cascading effect loops
  const isSetPlaying = Boolean(liveSetEvent?.isPlaying);
  const activeCrossfaderProgress = (isSetPlaying && !isAutoTransitioning)
    ? (liveSetEvent?.crossfaderPosition ?? 0)
    : crossfaderProgress;
  const activeTransitionState = (isSetPlaying && !isAutoTransitioning)
    ? (liveSetEvent?.transitionState ?? transitionState)
    : transitionState;

  // Real-time On-Air Deck Activity Status (indicates which deck is currently outputting sound)
  const isDeckAActive = isPlaying && (activeCrossfaderProgress < 0.98);
  const isDeckBActive = isPlaying && (activeCrossfaderProgress > 0.02);

  // Sync isPlaying flag from set engine
  useEffect(() => {
    if (liveSetEvent && liveSetEvent.isPlaying !== undefined) {
      setIsPlaying(prev => prev === liveSetEvent.isPlaying ? prev : liveSetEvent.isPlaying);
    }
  }, [liveSetEvent?.isPlaying]);

  // Update engine on manual crossfader change when not in live set playback
  useEffect(() => {
    if (isSetPlaying) {
      return; // Live set playback loop controls engine state directly
    }

    const state = globalDjSetEngine.setProgress(
      crossfaderProgress, 
      activePreset, 
      activeTransition?.envelopes, 
      durationBeats
    );
    setTransitionState(state);

    if (isPlaying) {
      globalDjSetEngine.syncTransitionProgress(
        crossfaderProgress,
        activePreset,
        activeTransition?.envelopes,
        durationBeats,
        sourceMixOutSec,
        targetMixInSec,
        deckATrack?.bpm || 130,
        deckBTrack?.bpm || 130
      );
    }
  }, [crossfaderProgress, activePreset, activeTransition?.envelopes, durationBeats, sourceMixOutSec, targetMixInSec, isPlaying, isSetPlaying]);

  // Toggle play/pause
  const togglePlay = () => {
    if (liveSetEvent) {
      if (isPlaying) {
        globalDjSetEngine.pause();
        setIsPlaying(false);
      } else {
        globalDjSetEngine.play();
        setIsPlaying(true);
      }
      return;
    }

    if (isPlaying) {
      globalDjSetEngine.pause();
      setIsPlaying(false);
      if (isAutoTransitioning) {
        cancelAutoTransition();
      }
    } else {
      if (deckATrack) globalDjSetEngine.loadDeckA(deckATrack, sourceMixOutSec);
      if (deckBTrack) globalDjSetEngine.loadDeckB(deckBTrack, targetMixInSec);
      globalDjSetEngine.syncTransitionProgress(
        crossfaderProgress,
        activePreset,
        activeTransition?.envelopes,
        durationBeats,
        sourceMixOutSec,
        targetMixInSec,
        deckATrack?.bpm || 130,
        deckBTrack?.bpm || 130
      );
      globalDjSetEngine.play();
      setIsPlaying(true);
    }
  };

  const cancelAutoTransition = () => {
    if (autoTransitionRef.current) {
      cancelAnimationFrame(autoTransitionRef.current);
      autoTransitionRef.current = null;
    }
    setIsAutoTransitioning(false);
  };

  // Trigger automated transition audition (plays both tracks simultaneously through 0.0 -> 1.0 in beat-sync)
  const triggerAutoTransition = () => {
    cancelAutoTransition();
    setIsAutoTransitioning(true);

    if (deckATrack) globalDjSetEngine.loadDeckA(deckATrack, sourceMixOutSec);
    if (deckBTrack) globalDjSetEngine.loadDeckB(deckBTrack, targetMixInSec);

    const bpm = deckATrack?.bpm || 130;
    const secondsPerBeat = 60 / bpm;
    const totalTransitionDurationMs = durationBeats * secondsPerBeat * 1000;
    
    // Start from beginning of transition if already at end
    const startProgress = crossfaderProgress >= 0.98 ? 0 : crossfaderProgress;
    setCrossfaderProgress(startProgress);

    globalDjSetEngine.syncTransitionProgress(
      startProgress,
      activePreset,
      activeTransition?.envelopes,
      durationBeats,
      sourceMixOutSec,
      targetMixInSec,
      deckATrack?.bpm || 130,
      deckBTrack?.bpm || 130
    );

    if (!isPlaying) {
      globalDjSetEngine.play();
      setIsPlaying(true);
    }

    const startTime = performance.now();
    const remainingRange = 1.0 - startProgress;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const fraction = Math.min(1.0, elapsed / (totalTransitionDurationMs * remainingRange));
      const currentVal = startProgress + fraction * remainingRange;

      setCrossfaderProgress(currentVal);
      globalDjSetEngine.syncTransitionProgress(
        currentVal,
        activePreset,
        activeTransition?.envelopes,
        durationBeats,
        sourceMixOutSec,
        targetMixInSec,
        deckATrack?.bpm || 130,
        deckBTrack?.bpm || 130
      );

      if (fraction < 1.0) {
        autoTransitionRef.current = requestAnimationFrame(step);
      } else {
        setIsAutoTransitioning(false);
        autoTransitionRef.current = null;
      }
    };

    autoTransitionRef.current = requestAnimationFrame(step);
  };

  const currentPresetInfo = PRESET_META[activePreset] || PRESET_META['bass-swap'];
  const PresetIcon = currentPresetInfo.icon;
  const currentTransitionIdx = transitions.findIndex(t => t.id === activeTransition?.id);

  // Format dB / Mute
  const formatDb = (val: number, isKilled: boolean) => {
    if (isKilled || val <= 0.005) return 'MUTED';
    const db = Math.round(20 * Math.log10(val));
    if (db >= 0) return `0 dB`;
    return `${db} dB`;
  };

  // Compute actual displayed EQ levels factoring in quick-kills
  const eqLowA = killsA.low ? 0 : (activeTransitionState?.deckA.eqLow ?? 1.0);
  const eqMidA = killsA.mid ? 0 : (activeTransitionState?.deckA.eqMid ?? 1.0);
  const eqHighA = killsA.high ? 0 : (activeTransitionState?.deckA.eqHigh ?? 1.0);

  const eqLowB = killsB.low ? 0 : (activeTransitionState?.deckB.eqLow ?? 0.0);
  const eqMidB = killsB.mid ? 0 : (activeTransitionState?.deckB.eqMid ?? 0.0);
  const eqHighB = killsB.high ? 0 : (activeTransitionState?.deckB.eqHigh ?? 0.0);

  return (
    <div className="fixed bottom-0 left-0 right-0 h-[168px] bg-[#0F1116] border-t border-[#242936] px-6 py-2 flex items-center justify-between z-50 shadow-[0_-12px_48px_rgba(0,0,0,0.9)] select-none">
      
      {/* ================= LEFT: DECK A (OUTGOING / LIVE PLAYING) ================= */}
      <div className="flex items-center gap-4 w-[28%] min-w-[280px]">
        {deckATrack ? (
          <div className={`flex items-center gap-3.5 w-full bg-[#161920]/80 border rounded-xl p-2.5 shadow-md transition-all duration-300 ${
            isDeckAActive ? 'border-cyan-500/60 shadow-cyan-950/40 ring-1 ring-cyan-500/30' : 'border-[#242936] shadow-black/40'
          }`}>
            {/* Artwork */}
            <div 
              className={`relative w-14 h-14 rounded-lg overflow-hidden border flex-shrink-0 cursor-pointer group transition-all duration-300 ${
                isDeckAActive 
                  ? 'border-cyan-400 ring-2 ring-cyan-400/80 shadow-[0_0_15px_rgba(6,182,212,0.5)]' 
                  : 'border-[#242936]'
              }`}
              onClick={() => onOpenTrackAnalysis && onOpenTrackAnalysis(deckATrack)}
              title="Open Track Studio"
            >
              {deckATrack.coverArt ? (
                <img src={deckATrack.coverArt} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              ) : (
                <div className="w-full h-full bg-[#0D0E12] flex items-center justify-center">
                  <Music className="w-6 h-6 text-gray-500" />
                </div>
              )}
              <div className="absolute top-1 left-1 px-1 py-0.2 bg-black/80 rounded text-[9px] font-black text-cyan-400 font-mono">
                DECK A
              </div>

              {/* Active Playing Indicator on Cover */}
              {isDeckAActive && (
                <div className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/90 rounded border border-cyan-400/60 flex items-end gap-0.5 h-3 shadow-md" title="Deck A spielt aktuell Ton ab">
                  <span className="w-0.5 bg-cyan-400 rounded-full animate-[pulse_0.6s_infinite_ease-in-out]" style={{ height: '60%' }} />
                  <span className="w-0.5 bg-cyan-300 rounded-full animate-[pulse_0.4s_infinite_ease-in-out]" style={{ height: '100%' }} />
                  <span className="w-0.5 bg-cyan-400 rounded-full animate-[pulse_0.7s_infinite_ease-in-out]" style={{ height: '80%' }} />
                </div>
              )}
            </div>

            {/* Track Info & Live Interactive 3-Band EQ */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-white truncate max-w-[130px]">{deckATrack.title}</span>
                <div className="flex items-center gap-1">
                  {isDeckAActive ? (
                    <span className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/60 flex items-center gap-1 shadow-[0_0_8px_rgba(6,182,212,0.4)] animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                      <span>ON AIR</span>
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-gray-500 border border-[#242936]">
                      STANDBY
                    </span>
                  )}
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    {deckATrack.bpm} BPM
                  </span>
                  <button
                    onClick={() => setRepairModalTrack({ track: deckATrack, reference: deckBTrack || undefined })}
                    className="p-1 rounded bg-[#0D0E12] border border-[#242936] text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500/50 transition-colors"
                    title="Deck A Taktgitter & Beatgrid reparieren"
                  >
                    <Activity className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-400 mt-0.5">
                <span className="truncate max-w-[130px]">{deckATrack.artist}</span>
                <span className="font-mono text-purple-400">{deckATrack.key}</span>
              </div>

              {/* Live EQ Gauges Deck A (Color-coded: LOW Orange, MID Yellow, HIGH Cyan) */}
              <div className="flex items-center gap-1.5 mt-2 bg-[#0D0E12] p-1 rounded-md border border-[#242936]/60">
                {/* LOW (Orange) */}
                <div 
                  onClick={() => setKillsA(prev => ({ ...prev, low: !prev.low }))}
                  className="flex-1 flex flex-col gap-0.5 cursor-pointer group/low"
                  title="Click to Toggle LOW Kill/Mute"
                >
                  <div className="flex justify-between text-[8px] font-mono">
                    <span className="text-orange-400 font-bold group-hover/low:underline">LOW</span>
                    <span className={eqLowA === 0 ? 'text-red-400 font-bold' : 'text-gray-400'}>
                      {formatDb(eqLowA, killsA.low)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#161920] rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-75 ${eqLowA === 0 ? 'bg-red-500/40' : 'bg-orange-500'}`}
                      style={{ width: `${eqLowA * 100}%` }}
                    />
                  </div>
                </div>

                {/* MID (Yellow) */}
                <div 
                  onClick={() => setKillsA(prev => ({ ...prev, mid: !prev.mid }))}
                  className="flex-1 flex flex-col gap-0.5 cursor-pointer group/mid"
                  title="Click to Toggle MID Kill/Mute"
                >
                  <div className="flex justify-between text-[8px] font-mono">
                    <span className="text-yellow-400 font-bold group-hover/mid:underline">MID</span>
                    <span className={eqMidA === 0 ? 'text-red-400 font-bold' : 'text-gray-400'}>
                      {formatDb(eqMidA, killsA.mid)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#161920] rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-75 ${eqMidA === 0 ? 'bg-red-500/40' : 'bg-yellow-400'}`}
                      style={{ width: `${eqMidA * 100}%` }}
                    />
                  </div>
                </div>

                {/* HIGH (Cyan) */}
                <div 
                  onClick={() => setKillsA(prev => ({ ...prev, high: !prev.high }))}
                  className="flex-1 flex flex-col gap-0.5 cursor-pointer group/high"
                  title="Click to Toggle HIGH Kill/Mute"
                >
                  <div className="flex justify-between text-[8px] font-mono">
                    <span className="text-cyan-400 font-bold group-hover/high:underline">HIGH</span>
                    <span className={eqHighA === 0 ? 'text-red-400 font-bold' : 'text-gray-400'}>
                      {formatDb(eqHighA, killsA.high)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#161920] rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-75 ${eqHighA === 0 ? 'bg-red-500/40' : 'bg-cyan-400'}`}
                      style={{ width: `${eqHighA * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full h-20 bg-[#161920]/40 border border-dashed border-[#242936] rounded-xl flex items-center justify-center text-xs text-gray-500">
            Kein Deck A gewählt
          </div>
        )}
      </div>

      {/* ================= CENTER: TRANSITION HUB, CROSSFADER & ACTIONS ================= */}
      <div className="flex flex-col items-center justify-between h-[132px] flex-1 max-w-2xl px-4">
        
        {/* Top bar: Preset Badge, Phase & Transition Jumper */}
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <button 
              disabled={currentTransitionIdx <= 0}
              onClick={() => {
                const prev = transitions[currentTransitionIdx - 1];
                if (prev) {
                  onSelectTransition(prev);
                  if (prev.sourceTimeSec !== undefined) {
                    globalDjSetEngine.seekSet(prev.sourceTimeSec);
                  }
                }
              }}
              className="p-1 rounded text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              title="Vorheriger Übergang (mit Cue Seek)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div 
              className="flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold font-mono tracking-wider backdrop-blur-md shadow-sm"
              style={{ 
                borderColor: `${currentPresetInfo.color}60`,
                backgroundColor: `${currentPresetInfo.color}15`,
                color: currentPresetInfo.color 
              }}
            >
              <PresetIcon className="w-3.5 h-3.5" />
              <span>{currentPresetInfo.name}</span>
              <span className="opacity-60 text-[10px]">({durationBeats} Beats)</span>
            </div>
            <button 
              disabled={currentTransitionIdx >= transitions.length - 1}
              onClick={() => {
                const next = transitions[currentTransitionIdx + 1];
                if (next) {
                  onSelectTransition(next);
                  if (next.sourceTimeSec !== undefined) {
                    globalDjSetEngine.seekSet(next.sourceTimeSec);
                  }
                }
              }}
              className="p-1 rounded text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              title="Nächster Übergang (mit Cue Seek)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Camelot Key Match Pill */}
            {deckATrack && deckBTrack && (
              <div 
                className={`hidden lg:flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-bold ${
                  keyComp.type === 'perfect' 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                    : keyComp.type === 'adjacent' || keyComp.type === 'relative'
                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}
                title={keyComp.description}
              >
                <span>{keyComp.label}</span>
              </div>
            )}
          </div>

          {/* Real-Time Transition Phase Indicator */}
          <div className="text-xs font-mono font-bold text-gray-300 flex items-center gap-1.5">
            {activeTransitionState?.isBassSwapped && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            )}
            <span className={activeTransitionState?.isBassSwapped ? 'text-purple-400 font-extrabold animate-pulse' : 'text-gray-400'}>
              {activeTransitionState?.phaseLabel || (isPlaying ? 'Set Playing' : 'Ready')}
            </span>
          </div>

          {/* Transition Actions */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                if (deckATrack && deckBTrack) {
                  globalDjSetEngine.autoPhaseAlign(deckATrack.bpm, deckBTrack.bpm);
                }
              }}
              disabled={!deckATrack || !deckBTrack}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold tracking-wider bg-[#161920] border border-[#242936] text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-500/50 hover:text-white transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
              title="Taktgitter & Phase synchronisieren (Phase Lock)"
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Phase Sync</span>
            </button>

            {/* Audition Button */}
            <button
              onClick={triggerAutoTransition}
              disabled={!deckATrack || !deckBTrack}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold tracking-wider uppercase transition-all shadow-md ${
                isAutoTransitioning 
                  ? 'bg-purple-600 text-white animate-pulse shadow-[0_0_15px_rgba(168,85,247,0.6)]' 
                  : 'bg-[#242936] text-purple-300 hover:bg-purple-600/30 hover:text-white'
              }`}
              title="Spielt den Übergang automatisch mit der konfigurierten Taktlänge durch"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Mix Testen</span>
            </button>
          </div>
        </div>

        {/* Center: Interactive & Real-Time Animated Crossfader Rail */}
        <div className="w-full flex flex-col items-center gap-0.5 my-0.5">
          <div className="relative w-full h-7 bg-[#0D0E12] border border-[#242936] rounded-lg flex items-center px-2 group">
            {/* Background Curve Visualizer */}
            <div className="absolute inset-0 opacity-15 pointer-events-none flex items-center px-4">
              <div className="w-1/2 h-full flex items-center border-r border-gray-600/40">
                <span className="text-[10px] font-mono font-bold text-cyan-400">DECK A</span>
              </div>
              <div className="w-1/2 h-full flex items-center justify-end">
                <span className="text-[10px] font-mono font-bold text-emerald-400">DECK B</span>
              </div>
            </div>

            {/* Split marker on 50% */}
            <div className="absolute left-1/2 top-1 bottom-1 w-[1px] bg-[#242936] z-10 pointer-events-none" />

            {/* Range input for manual crossfading */}
            <input 
              type="range"
              min="0"
              max="1"
              step="0.005"
              value={activeCrossfaderProgress}
              onChange={(e) => {
                cancelAutoTransition();
                setCrossfaderProgress(parseFloat(e.target.value));
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20"
            />

            {/* Animated Physical Crossfader Handle */}
            <div 
              className="absolute top-1 bottom-1 w-10 bg-gradient-to-b from-[#2E3445] to-[#1F232E] border-2 border-white/80 rounded shadow-[0_2px_10px_rgba(0,0,0,0.9)] flex items-center justify-center transition-[left] duration-75 pointer-events-none z-15"
              style={{ left: `calc(${activeCrossfaderProgress * 100}% - ${activeCrossfaderProgress * 40}px)` }}
            >
              <div className="w-1 h-4 bg-white/70 rounded-full" />
            </div>
          </div>

          <div className="flex justify-between w-full text-[9px] font-mono text-gray-500 px-1">
            <span className={activeCrossfaderProgress < 0.5 ? 'text-cyan-400 font-bold' : 'text-gray-500'}>
              Deck A {Math.round((1 - activeCrossfaderProgress) * 100)}%
            </span>
            <span className="text-gray-400 font-bold">
              {Math.round(activeCrossfaderProgress * 100)}% Crossfader
            </span>
            <span className={activeCrossfaderProgress > 0.5 ? 'text-emerald-400 font-bold' : 'text-gray-500'}>
              Deck B {Math.round(activeCrossfaderProgress * 100)}%
            </span>
          </div>
        </div>

        {/* Bottom Playback & Export Actions Bar */}
        <div className="flex items-center justify-between w-full pt-0.5 pb-0.5">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                cancelAutoTransition();
                setCrossfaderProgress(0);
              }}
              className="text-gray-500 hover:text-white text-xs font-mono flex items-center gap-1 transition-colors"
              title="Reset to Track A"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Deck A Solo</span>
            </button>
          </div>

          {/* Play/Pause Button */}
          <div className="flex items-center gap-3">
            <button
              id="btn-djset-play-toggle"
              onClick={togglePlay}
              className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-white hover:scale-105 hover:bg-purple-500 transition-all shadow-[0_0_20px_rgba(168,85,247,0.5)]"
              title={isPlaying ? 'Pausieren' : 'Abspielen'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <button 
              onClick={() => {
                cancelAutoTransition();
                setCrossfaderProgress(1);
              }}
              className="text-gray-500 hover:text-white text-xs font-mono flex items-center gap-1 transition-colors"
              title="Snap to Track B"
            >
              <span>Deck B Solo</span>
            </button>
          </div>

          {/* Export & Save Buttons */}
          <div className="flex items-center gap-2">
            {onOpenSetExport && (
              <button
                id="btn-set-export-bottom"
                onClick={onOpenSetExport}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#161920] hover:bg-[#242936] border border-cyan-500/40 text-cyan-300 hover:text-white text-xs font-mono font-bold transition-all shadow-sm"
                title="Set Exportieren (CUE Sheet, M3U8, Projekt)"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <span>Set Export</span>
              </button>
            )}

            {onSaveSetAsPlaylist && (
              <button
                id="btn-save-set-playlist-bottom"
                onClick={onSaveSetAsPlaylist}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#161920] hover:bg-[#242936] border border-purple-500/40 text-purple-300 hover:text-white text-xs font-mono font-bold transition-all shadow-sm"
                title="Als Playlist in der linken Sidebar speichern"
              >
                <Bookmark className="w-3.5 h-3.5 text-purple-400" />
                <span>Playlist Speichern</span>
              </button>
            )}
          </div>
        </div>

      </div>

      {/* ================= RIGHT: DECK B (INCOMING / NEXT TRACK) ================= */}
      <div className="flex items-center gap-4 w-[28%] min-w-[280px]">
        {deckBTrack ? (
          <div className={`flex items-center gap-3.5 w-full bg-[#161920]/80 border rounded-xl p-2.5 shadow-md transition-all duration-300 ${
            isDeckBActive ? 'border-emerald-500/60 shadow-emerald-950/40 ring-1 ring-emerald-500/30' : 'border-[#242936] shadow-black/40'
          }`}>
            {/* Live Interactive 3-Band EQ & Track Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-white truncate max-w-[130px]">{deckBTrack.title}</span>
                <div className="flex items-center gap-1">
                  {isDeckBActive ? (
                    <span className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/60 flex items-center gap-1 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      <span>ON AIR</span>
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-gray-500 border border-[#242936]">
                      STANDBY
                    </span>
                  )}
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    {deckBTrack.bpm} BPM
                  </span>
                  <button
                    onClick={() => setRepairModalTrack({ track: deckBTrack, reference: deckATrack || undefined })}
                    className="p-1 rounded bg-[#0D0E12] border border-[#242936] text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-colors"
                    title="Deck B Taktgitter & Beatgrid reparieren"
                  >
                    <Activity className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-400 mt-0.5">
                <span className="truncate max-w-[130px]">{deckBTrack.artist}</span>
                <span className="font-mono text-purple-400">{deckBTrack.key}</span>
              </div>

              {/* Live EQ Gauges Deck B (Color-coded: LOW Orange, MID Yellow, HIGH Emerald) */}
              <div className="flex items-center gap-1.5 mt-2 bg-[#0D0E12] p-1 rounded-md border border-[#242936]/60">
                {/* LOW (Orange) */}
                <div 
                  onClick={() => setKillsB(prev => ({ ...prev, low: !prev.low }))}
                  className="flex-1 flex flex-col gap-0.5 cursor-pointer group/low"
                  title="Click to Toggle LOW Kill/Mute"
                >
                  <div className="flex justify-between text-[8px] font-mono">
                    <span className="text-orange-400 font-bold group-hover/low:underline">LOW</span>
                    <span className={eqLowB === 0 ? 'text-red-400 font-bold' : 'text-gray-400'}>
                      {formatDb(eqLowB, killsB.low)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#161920] rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-75 ${eqLowB === 0 ? 'bg-red-500/40' : 'bg-orange-500'}`}
                      style={{ width: `${eqLowB * 100}%` }}
                    />
                  </div>
                </div>

                {/* MID (Yellow) */}
                <div 
                  onClick={() => setKillsB(prev => ({ ...prev, mid: !prev.mid }))}
                  className="flex-1 flex flex-col gap-0.5 cursor-pointer group/mid"
                  title="Click to Toggle MID Kill/Mute"
                >
                  <div className="flex justify-between text-[8px] font-mono">
                    <span className="text-yellow-400 font-bold group-hover/mid:underline">MID</span>
                    <span className={eqMidB === 0 ? 'text-red-400 font-bold' : 'text-gray-400'}>
                      {formatDb(eqMidB, killsB.mid)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#161920] rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-75 ${eqMidB === 0 ? 'bg-red-500/40' : 'bg-yellow-400'}`}
                      style={{ width: `${eqMidB * 100}%` }}
                    />
                  </div>
                </div>

                {/* HIGH (Emerald) */}
                <div 
                  onClick={() => setKillsB(prev => ({ ...prev, high: !prev.high }))}
                  className="flex-1 flex flex-col gap-0.5 cursor-pointer group/high"
                  title="Click to Toggle HIGH Kill/Mute"
                >
                  <div className="flex justify-between text-[8px] font-mono">
                    <span className="text-emerald-400 font-bold group-hover/high:underline">HIGH</span>
                    <span className={eqHighB === 0 ? 'text-red-400 font-bold' : 'text-gray-400'}>
                      {formatDb(eqHighB, killsB.high)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#161920] rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-75 ${eqHighB === 0 ? 'bg-red-500/40' : 'bg-emerald-400'}`}
                      style={{ width: `${eqHighB * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Artwork */}
            <div 
              className={`relative w-14 h-14 rounded-lg overflow-hidden border flex-shrink-0 cursor-pointer group transition-all duration-300 ${
                isDeckBActive 
                  ? 'border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_15px_rgba(16,185,129,0.5)]' 
                  : 'border-[#242936]'
              }`}
              onClick={() => onOpenTrackAnalysis && onOpenTrackAnalysis(deckBTrack)}
              title="Open Track Studio"
            >
              {deckBTrack.coverArt ? (
                <img src={deckBTrack.coverArt} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              ) : (
                <div className="w-full h-full bg-[#0D0E12] flex items-center justify-center">
                  <Music className="w-6 h-6 text-gray-500" />
                </div>
              )}
              <div className="absolute top-1 right-1 px-1 py-0.2 bg-black/80 rounded text-[9px] font-black text-emerald-400 font-mono">
                DECK B
              </div>

              {/* Active Playing Indicator on Cover */}
              {isDeckBActive && (
                <div className="absolute bottom-1 left-1 px-1 py-0.5 bg-black/90 rounded border border-emerald-400/60 flex items-end gap-0.5 h-3 shadow-md" title="Deck B spielt aktuell Ton ab">
                  <span className="w-0.5 bg-emerald-400 rounded-full animate-[pulse_0.6s_infinite_ease-in-out]" style={{ height: '60%' }} />
                  <span className="w-0.5 bg-emerald-300 rounded-full animate-[pulse_0.4s_infinite_ease-in-out]" style={{ height: '100%' }} />
                  <span className="w-0.5 bg-emerald-400 rounded-full animate-[pulse_0.7s_infinite_ease-in-out]" style={{ height: '80%' }} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full h-20 bg-[#161920]/40 border border-dashed border-[#242936] rounded-xl flex items-center justify-center text-xs text-gray-500">
            Kein Deck B gewählt
          </div>
        )}
      </div>


      {/* Beatgrid Repair Studio Modal */}
      {repairModalTrack && (
        <BeatgridRepairModal
          track={repairModalTrack.track}
          referenceTrack={repairModalTrack.reference}
          onSave={(updated) => {
            if (onTrackUpdated) {
              onTrackUpdated(updated);
            }
            setRepairModalTrack(null);
          }}
          onClose={() => setRepairModalTrack(null)}
        />
      )}

    </div>
  );
}
