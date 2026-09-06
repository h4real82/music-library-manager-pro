import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, Music, Sparkles, ChevronRight, ChevronLeft, Zap, Sliders, Waves, Scissors, Gauge } from 'lucide-react';
import { TrackDef, TransitionConfig, TransitionPresetType } from '../types';
import { globalDjSetEngine, TransitionState } from '../lib/djSetAudioEngine';
import { evaluateKeyCompatibility, calculateTempoSync } from '../lib/djMixerLogic';

interface DjSetPlayerProps {
  deckATrack: TrackDef | null;
  deckBTrack: TrackDef | null;
  activeTransition: TransitionConfig | null;
  transitions: TransitionConfig[];
  onSelectTransition: (t: TransitionConfig) => void;
  onOpenTrackAnalysis?: (track: TrackDef) => void;
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
}: DjSetPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [crossfaderProgress, setCrossfaderProgress] = useState(0); // 0.0 -> 1.0
  const [transitionState, setTransitionState] = useState<TransitionState | null>(null);
  const [isAutoTransitioning, setIsAutoTransitioning] = useState(false);
  const autoTransitionRef = useRef<number | null>(null);

  const activePreset: TransitionPresetType = activeTransition?.preset || 'bass-swap';
  const durationBeats = activeTransition?.durationBeats || 32;

  const sourceMixOutSec = activeTransition?.sourceTimeSec !== undefined
    ? activeTransition.sourceTimeSec 
    : Math.max(0, (deckATrack?.duration || 180) - (durationBeats * (60 / (deckATrack?.bpm || 130))));
  const targetMixInSec = activeTransition?.targetTimeSec !== undefined
    ? activeTransition.targetTimeSec
    : 0;

  // Sync tracks with engine
  useEffect(() => {
    if (deckATrack) {
      globalDjSetEngine.loadDeckA(deckATrack, sourceMixOutSec);
    }
  }, [deckATrack, sourceMixOutSec]);

  useEffect(() => {
    if (deckBTrack) {
      globalDjSetEngine.loadDeckB(deckBTrack, targetMixInSec);
    }
  }, [deckBTrack, targetMixInSec]);

  // Key and Tempo evaluation
  const keyComp = evaluateKeyCompatibility(deckATrack?.key, deckBTrack?.key);
  const tempoSync = calculateTempoSync(deckATrack?.bpm || 130, deckBTrack?.bpm || 130);

  // Update engine on crossfader change
  useEffect(() => {
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
  }, [crossfaderProgress, activePreset, activeTransition?.envelopes, durationBeats, sourceMixOutSec, targetMixInSec, isPlaying]);

  // Toggle play/pause
  const togglePlay = () => {
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

  return (
    <div className="fixed bottom-0 left-0 right-0 h-32 bg-[#0F1116] border-t border-[#242936] px-6 py-2 flex items-center justify-between z-50 shadow-[0_-12px_48px_rgba(0,0,0,0.85)] select-none">
      
      {/* ================= LEFT: DECK A (OUTGOING) ================= */}
      <div className="flex items-center gap-4 w-[28%] min-w-[280px]">
        {deckATrack ? (
          <div className="flex items-center gap-3.5 w-full bg-[#161920]/80 border border-[#242936] rounded-xl p-2.5">
            {/* Artwork */}
            <div 
              className="relative w-14 h-14 rounded-lg overflow-hidden border border-[#242936] flex-shrink-0 cursor-pointer group"
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
            </div>

            {/* Track Info & Live EQ */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-white truncate max-w-[150px]">{deckATrack.title}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  {deckATrack.bpm} BPM
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-400 mt-0.5">
                <span className="truncate max-w-[130px]">{deckATrack.artist}</span>
                <span className="font-mono text-purple-400">{deckATrack.key}</span>
              </div>

              {/* Live EQ Gauges Deck A */}
              <div className="flex items-center gap-1.5 mt-2 bg-[#0D0E12] p-1 rounded-md border border-[#242936]/60">
                <div className="flex-1 flex flex-col gap-0.5">
                  <div className="flex justify-between text-[8px] font-mono text-gray-500">
                    <span>LOW</span>
                    <span className={transitionState?.deckA.eqLow === 0 ? 'text-red-400 font-bold' : 'text-gray-400'}>
                      {transitionState?.deckA.eqLow === 0 ? 'MUTED' : `${Math.round((transitionState?.deckA.eqLow || 1) * 100)}%`}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#161920] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyan-500 transition-all duration-75"
                      style={{ width: `${(transitionState?.deckA.eqLow || 1) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-0.5">
                  <div className="flex justify-between text-[8px] font-mono text-gray-500">
                    <span>MID</span>
                    <span>{Math.round((transitionState?.deckA.eqMid || 1) * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-[#161920] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyan-400 transition-all duration-75"
                      style={{ width: `${(transitionState?.deckA.eqMid || 1) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-0.5">
                  <div className="flex justify-between text-[8px] font-mono text-gray-500">
                    <span>HIGH</span>
                    <span>{Math.round((transitionState?.deckA.eqHigh || 1) * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-[#161920] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyan-300 transition-all duration-75"
                      style={{ width: `${(transitionState?.deckA.eqHigh || 1) * 100}%` }}
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

      {/* ================= CENTER: TRANSITION HUB & CROSSFADER ================= */}
      <div className="flex flex-col items-center justify-between h-full flex-1 max-w-2xl px-6">
        
        {/* Top bar: Preset Badge, Phase & Transition Jumper */}
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <button 
              disabled={currentTransitionIdx <= 0}
              onClick={() => onSelectTransition(transitions[currentTransitionIdx - 1])}
              className="p-1 rounded text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              title="Vorheriger Übergang"
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
              onClick={() => onSelectTransition(transitions[currentTransitionIdx + 1])}
              className="p-1 rounded text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              title="Nächster Übergang"
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

          {/* Phase text */}
          <div className="text-xs font-mono font-bold text-gray-300 flex items-center gap-1.5">
            {transitionState?.isBassSwapped && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            )}
            <span className={transitionState?.isBassSwapped ? 'text-purple-400 font-extrabold' : 'text-gray-400'}>
              {transitionState?.phaseLabel || 'Ready'}
            </span>
          </div>

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

        {/* Center: Interactive Crossfader Rail */}
        <div className="w-full flex flex-col items-center gap-1 my-1">
          <div className="relative w-full h-8 bg-[#0D0E12] border border-[#242936] rounded-lg flex items-center px-2 group">
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
              value={crossfaderProgress}
              onChange={(e) => {
                cancelAutoTransition();
                setCrossfaderProgress(parseFloat(e.target.value));
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20"
            />

            {/* Animated Physical Crossfader Handle */}
            <div 
              className="absolute top-1 bottom-1 w-10 bg-gradient-to-b from-[#2E3445] to-[#1F232E] border-2 border-white/80 rounded shadow-[0_2px_10px_rgba(0,0,0,0.9)] flex items-center justify-center transition-[left] duration-75 pointer-events-none z-15"
              style={{ left: `calc(${crossfaderProgress * 100}% - ${crossfaderProgress * 40}px)` }}
            >
              <div className="w-1 h-4 bg-white/70 rounded-full" />
            </div>
          </div>

          <div className="flex justify-between w-full text-[9px] font-mono text-gray-500 px-1">
            <span className="text-cyan-400">Track A 100%</span>
            <span>{Math.round(crossfaderProgress * 100)}% Crossfader</span>
            <span className="text-emerald-400">Track B 100%</span>
          </div>
        </div>

        {/* Bottom Playback Bar */}
        <div className="flex items-center gap-4">
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

          <button
            onClick={togglePlay}
            className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-white hover:scale-105 hover:bg-purple-500 transition-all shadow-[0_0_20px_rgba(168,85,247,0.5)]"
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

      </div>

      {/* ================= RIGHT: DECK B (INCOMING) ================= */}
      <div className="flex items-center gap-4 w-[28%] min-w-[280px]">
        {deckBTrack ? (
          <div className="flex items-center gap-3.5 w-full bg-[#161920]/80 border border-[#242936] rounded-xl p-2.5">
            {/* Live EQ Gauges Deck B */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-white truncate max-w-[150px]">{deckBTrack.title}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {deckBTrack.bpm} BPM
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-400 mt-0.5">
                <span className="truncate max-w-[130px]">{deckBTrack.artist}</span>
                <span className="font-mono text-purple-400">{deckBTrack.key}</span>
              </div>

              {/* Live EQ Gauges Deck B */}
              <div className="flex items-center gap-1.5 mt-2 bg-[#0D0E12] p-1 rounded-md border border-[#242936]/60">
                <div className="flex-1 flex flex-col gap-0.5">
                  <div className="flex justify-between text-[8px] font-mono text-gray-500">
                    <span>LOW</span>
                    <span className={transitionState?.deckB.eqLow === 0 ? 'text-red-400 font-bold' : 'text-gray-400'}>
                      {transitionState?.deckB.eqLow === 0 ? 'MUTED' : `${Math.round((transitionState?.deckB.eqLow || 0) * 100)}%`}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#161920] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-75"
                      style={{ width: `${(transitionState?.deckB.eqLow || 0) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-0.5">
                  <div className="flex justify-between text-[8px] font-mono text-gray-500">
                    <span>MID</span>
                    <span>{Math.round((transitionState?.deckB.eqMid || 0) * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-[#161920] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-400 transition-all duration-75"
                      style={{ width: `${(transitionState?.deckB.eqMid || 0) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-0.5">
                  <div className="flex justify-between text-[8px] font-mono text-gray-500">
                    <span>HIGH</span>
                    <span>{Math.round((transitionState?.deckB.eqHigh || 0) * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-[#161920] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-300 transition-all duration-75"
                      style={{ width: `${(transitionState?.deckB.eqHigh || 0) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Artwork */}
            <div 
              className="relative w-14 h-14 rounded-lg overflow-hidden border border-[#242936] flex-shrink-0 cursor-pointer group"
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
            </div>
          </div>
        ) : (
          <div className="w-full h-20 bg-[#161920]/40 border border-dashed border-[#242936] rounded-xl flex items-center justify-center text-xs text-gray-500">
            Kein Deck B gewählt
          </div>
        )}
      </div>

    </div>
  );
}
