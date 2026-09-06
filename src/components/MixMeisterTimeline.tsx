import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, RotateCcw, Sliders, Zap, Waves, Scissors, Gauge, Clock, Music, ZoomIn, ZoomOut, Maximize2, Sparkles, ChevronRight } from 'lucide-react';
import { TrackDef, TransitionConfig, TransitionPresetType } from '../types';
import { evaluateKeyCompatibility, calculateTempoSync, evaluateEnvelope } from '../lib/djMixerLogic';
import { PRESET_META } from './DjSetPlayer';

interface MixMeisterTimelineProps {
  tracks: TrackDef[];
  transitions: TransitionConfig[];
  activeTransitionId?: string;
  onSelectTransition: (t: TransitionConfig) => void;
  onOpenTransitionStudio: (t: TransitionConfig) => void;
  onOpenTrackAnalysis?: (track: TrackDef) => void;
  currentTime?: number; // Current playback time of set in seconds
  onSeek?: (timeSec: number) => void;
}

export default function MixMeisterTimeline({
  tracks,
  transitions,
  activeTransitionId,
  onSelectTransition,
  onOpenTransitionStudio,
  onOpenTrackAnalysis,
  currentTime = 0,
  onSeek,
}: MixMeisterTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0); // 0.5x to 2.5x

  // Compute start and end times for each track in the set based on transitions overlap
  interface TrackLayout {
    track: TrackDef;
    index: number;
    startSec: number;
    durationSec: number;
    endSec: number;
    outgoingTransition?: TransitionConfig;
    incomingTransition?: TransitionConfig;
  }

  const trackLayouts: TrackLayout[] = [];
  let currentAccumulatedTime = 0;

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const duration = track.duration || 180; // default 3 mins if missing

    // Check if there is a transition from track i to track i+1
    const nextTrack = tracks[i + 1];
    let transitionDurationSec = 30; // default 30s
    let outTrans: TransitionConfig | undefined;

    if (nextTrack) {
      outTrans = transitions.find(t => 
        (t.sourceTrackId === track.id && t.targetTrackId === nextTrack.id) ||
        (t.sourceTrackId === track.id)
      );
      if (outTrans) {
        const bpm = track.bpm || 130;
        transitionDurationSec = (outTrans.durationBeats * (60 / bpm));
      }
    }

    const startSec = currentAccumulatedTime;
    const endSec = startSec + duration;

    trackLayouts.push({
      track,
      index: i + 1,
      startSec,
      durationSec: duration,
      endSec,
      outgoingTransition: outTrans,
    });

    // Next track starts (duration - overlap) after current track start
    currentAccumulatedTime = endSec - transitionDurationSec;
  }

  const totalSetDurationSec = trackLayouts.length > 0 ? trackLayouts[trackLayouts.length - 1].endSec : 300;

  // Pixels per second calculation
  // Base: 1200px for a 10-minute set = 2px/sec
  const pxPerSec = 2.2 * zoomLevel;
  const totalTimelineWidthPx = Math.max(1000, totalSetDurationSec * pxPerSec + 200);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const seekSec = Math.max(0, Math.min(totalSetDurationSec, clickX / pxPerSec));
    onSeek(seekSec);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0A0C10] overflow-hidden select-none relative">
      
      {/* ================= TIMELINE TOOLBAR ================= */}
      <div className="h-12 px-6 border-b border-[#242936] bg-[#0F1116] flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono">
              MixMeister Multi-Track Set Timeline
            </h3>
          </div>
          <div className="text-[11px] font-mono text-gray-400 flex items-center gap-2">
            <span>{tracks.length} Tracks im Set</span>
            <span>•</span>
            <span>Gesamtdauer: <strong className="text-white">{formatTime(totalSetDurationSec)}</strong></span>
            <span>•</span>
            <span>{transitions.length} Übergänge konfiguriert</span>
          </div>
        </div>

        {/* Zoom Controls & Hint */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-gray-500 hidden md:inline">
            Tipp: Klick auf Übergang öffnet den 3-Band EQ Hüllkurven-Editor
          </span>

          <div className="flex items-center gap-1 bg-[#161920] border border-[#242936] rounded-xl p-1">
            <button
              onClick={() => setZoomLevel(z => Math.max(0.4, z - 0.2))}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#242936]"
              title="Zeitleiste stauchen (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono font-bold text-gray-300 px-2">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel(z => Math.min(2.5, z + 0.2))}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#242936]"
              title="Zeitleiste dehnen (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ================= SCROLLABLE MULTI-TRACK LANES ================= */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative bg-[#0D0E12]"
      >
        <div 
          className="relative min-h-full pb-10"
          style={{ width: `${totalTimelineWidthPx}px` }}
        >
          {/* Global Time & Bar Ruler */}
          <div 
            onClick={handleRulerClick}
            className="sticky top-0 h-9 bg-[#161920] border-b border-[#242936] z-30 flex items-center px-2 cursor-pointer group shadow-md"
          >
            {/* 30-Second Interval Markers */}
            {Array.from({ length: Math.ceil(totalSetDurationSec / 15) + 1 }).map((_, idx) => {
              const sec = idx * 15;
              const x = sec * pxPerSec;
              const isMinute = sec % 60 === 0;

              return (
                <div 
                  key={`ruler-${sec}`}
                  className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none"
                  style={{ left: `${x}px` }}
                >
                  <div className={`w-[1px] ${isMinute ? 'h-4 bg-gray-400' : 'h-2 bg-gray-600'}`} />
                  {isMinute && (
                    <span className="text-[9px] font-mono font-bold text-gray-300 mt-0.5">
                      {formatTime(sec)}
                    </span>
                  )}
                </div>
              );
            })}

            {/* Red Playhead in Ruler */}
            <div 
              className="absolute top-0 bottom-0 w-3 -ml-1.5 flex items-center justify-center pointer-events-none transition-[left] duration-75 z-40"
              style={{ left: `${currentTime * pxPerSec}px` }}
            >
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[8px] border-t-red-500" />
            </div>
          </div>

          {/* Vertical Playhead Across All Lanes */}
          <div 
            className="absolute top-9 bottom-0 w-[2px] bg-red-500 z-30 pointer-events-none drop-shadow-[0_0_8px_rgba(239,68,68,0.9)] transition-[left] duration-75"
            style={{ left: `${currentTime * pxPerSec}px` }}
          />

          {/* ================= TRACK LANES ================= */}
          <div className="flex flex-col gap-2 p-3">
            {trackLayouts.map((layout, idx) => {
              const track = layout.track;
              const leftPx = layout.startSec * pxPerSec;
              const widthPx = layout.durationSec * pxPerSec;
              const nextLayout = trackLayouts[idx + 1];

              // Key compatibility with next track
              const keyComp = nextLayout ? evaluateKeyCompatibility(track.key, nextLayout.track.key) : null;
              const outTrans = layout.outgoingTransition;
              const isTransitionActive = outTrans && outTrans.id === activeTransitionId;

              // Overlap calculations
              let overlapWidthPx = 0;
              let overlapStartPx = 0;
              if (outTrans && nextLayout) {
                const bpm = track.bpm || 130;
                const overlapDurationSec = outTrans.durationBeats * (60 / bpm);
                overlapWidthPx = overlapDurationSec * pxPerSec;
                overlapStartPx = (layout.endSec - overlapDurationSec) * pxPerSec;
              }

              return (
                <div 
                  key={track.id} 
                  className="relative h-28 bg-[#12141A] border border-[#242936] rounded-xl overflow-hidden group shadow-lg flex items-center"
                >
                  {/* Left Track Info Strip (Sticky Left Anchor) */}
                  <div className="sticky left-0 w-64 h-full bg-[#161920]/95 border-r border-[#242936] p-2.5 z-20 flex items-center gap-3 backdrop-blur-md shadow-md shrink-0">
                    <div className="w-7 h-7 rounded-lg bg-black/50 border border-[#242936] flex items-center justify-center text-xs font-mono font-black text-cyan-400 shrink-0">
                      #{layout.index}
                    </div>

                    <div 
                      className="w-11 h-11 rounded-lg overflow-hidden border border-[#242936] shrink-0 cursor-pointer hover:opacity-80"
                      onClick={() => onOpenTrackAnalysis && onOpenTrackAnalysis(track)}
                      title="Open Analyzer"
                    >
                      {track.coverArt ? (
                        <img src={track.coverArt} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[#0D0E12] flex items-center justify-center">
                          <Music className="w-5 h-5 text-gray-500" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate max-w-[130px]">{track.title}</div>
                      <div className="text-[10px] text-gray-400 truncate max-w-[120px]">{track.artist}</div>
                      <div className="flex items-center gap-1.5 mt-1 font-mono text-[9px]">
                        <span className="px-1 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold">
                          {track.bpm} BPM
                        </span>
                        <span className="px-1 py-0.2 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30 font-bold">
                          {track.key}
                        </span>
                        <span className="text-gray-500">{formatTime(layout.durationSec)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Horizontal Waveform Strip across Time */}
                  <div 
                    className="absolute top-1 bottom-1 rounded-lg overflow-hidden border border-cyan-500/20 bg-[#0B0D12] flex items-center"
                    style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                  >
                    {/* Simulated Waveform Slices */}
                    <div className="w-full h-full flex items-center px-1 opacity-75">
                      {Array.from({ length: Math.min(240, Math.floor(widthPx / 3)) }).map((_, sIdx) => {
                        const hPct = Math.abs(Math.sin(sIdx * 0.2 + idx)) * 75 + 15;
                        return (
                          <div
                            key={sIdx}
                            className="flex-1 mx-[1px] bg-gradient-to-t from-cyan-600 via-cyan-400 to-cyan-200 rounded-sm"
                            style={{ height: `${hPct}%` }}
                          />
                        );
                      })}
                    </div>

                    {/* Track start/end cue flags */}
                    <div className="absolute top-1 left-2 px-1.5 py-0.2 bg-black/60 rounded text-[9px] font-mono text-cyan-300 border border-cyan-500/30">
                      START: {formatTime(layout.startSec)}
                    </div>
                  </div>

                  {/* ================= MIXMEISTER TRANSITION OVERLAP ZONE & ENVELOPE PREVIEW ================= */}
                  {outTrans && nextLayout && overlapWidthPx > 0 && (
                    <div 
                      onClick={() => onOpenTransitionStudio(outTrans)}
                      className={`absolute top-0 bottom-0 z-30 border-2 rounded-xl cursor-pointer transition-all flex flex-col justify-between p-2 group/zone ${
                        isTransitionActive 
                          ? 'border-purple-400 bg-purple-950/40 shadow-[0_0_24px_rgba(168,85,247,0.5)] ring-2 ring-purple-500/50' 
                          : 'border-cyan-400/80 bg-cyan-950/25 hover:border-purple-400 hover:bg-purple-950/30'
                      }`}
                      style={{ left: `${overlapStartPx}px`, width: `${overlapWidthPx}px` }}
                      title="Klick: 3-Band EQ Hüllkurven-Editor öffnen"
                    >
                      {/* Top Overlap Header */}
                      <div className="flex items-center justify-between z-10">
                        <div className="flex items-center gap-1.5 bg-black/80 px-2 py-0.5 rounded-md border border-[#242936] text-[10px] font-mono font-bold text-white">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                          <span>ÜBERGANG: {outTrans.preset.toUpperCase()}</span>
                          <span className="text-cyan-400">({outTrans.durationBeats} Beats)</span>
                        </div>

                        {keyComp && (
                          <div className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold border ${
                            keyComp.type === 'perfect' 
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                              : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          }`}>
                            {keyComp.label}
                          </div>
                        )}
                      </div>

                      {/* 3-Band EQ Envelope Mini-Preview (MixMeister SVG Overlay) */}
                      <div className="w-full h-12 relative my-auto pointer-events-none opacity-90 group-hover/zone:opacity-100">
                        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 40">
                          {/* Low / Bass Curve (Orange) */}
                          <path
                            d={outTrans.preset === 'bass-swap' 
                              ? 'M 0 5 L 48 5 L 50 35 L 100 35' 
                              : 'M 0 5 L 75 5 L 80 35 L 100 35'}
                            fill="none"
                            stroke="#F97316"
                            strokeWidth="2.5"
                          />
                          {/* Mid Curve (Yellow) */}
                          <path
                            d="M 0 8 L 30 8 L 70 24 L 100 35"
                            fill="none"
                            stroke="#EAB308"
                            strokeWidth="2"
                            strokeDasharray="2 1"
                          />
                          {/* High Curve (Blue) */}
                          <path
                            d="M 0 10 L 25 10 L 80 28 L 100 35"
                            fill="none"
                            stroke="#06B6D4"
                            strokeWidth="2"
                          />
                        </svg>
                      </div>

                      {/* Bottom Prompt / Edit Trigger */}
                      <button
                        id={`btn-edit-envelope-${outTrans.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTransitionStudio(outTrans);
                        }}
                        className="flex items-center justify-between text-[9px] font-mono text-gray-200 bg-black/80 hover:bg-purple-900/80 px-2 py-1 rounded-md z-30 transition-colors w-full border border-purple-500/30"
                      >
                        <span className="text-cyan-300 flex items-center gap-1 font-bold">
                          <Sliders className="w-3 h-3 text-purple-400" />
                          <span>Hüllkurven bearbeiten</span>
                        </span>
                        <ChevronRight className="w-3 h-3 text-purple-400 group-hover/zone:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  )}

                </div>
              );
            })}
          </div>

        </div>
      </div>

    </div>
  );
}
