import React, { useState, useRef, useEffect, MouseEvent } from 'react';
import { Play, Pause, RotateCcw, X, Check, Trash2, Plus, Sliders, Zap, Waves, Scissors, Gauge, Info, Music } from 'lucide-react';
import { TrackDef, TransitionConfig, TransitionEnvelopes, EnvelopePoint, TransitionPresetType } from '../types';
import { evaluateKeyCompatibility, calculateTempoSync, generateDefaultEnvelopes, evaluateEnvelope } from '../lib/djMixerLogic';
import { PRESET_META } from './DjSetPlayer';

interface TransitionOverlapStudioProps {
  transition: TransitionConfig;
  sourceTrack?: TrackDef;
  targetTrack?: TrackDef;
  onSave: (updated: TransitionConfig) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
}

type ActiveLayer = 'all' | 'low' | 'mid' | 'high' | 'volume';

export default function TransitionOverlapStudio({
  transition,
  sourceTrack,
  targetTrack,
  onSave,
  onClose,
  onDelete,
}: TransitionOverlapStudioProps) {
  const durationBeats = transition.durationBeats || 32;

  // Initialize or generate envelopes
  const [envelopes, setEnvelopes] = useState<TransitionEnvelopes>(() => {
    if (transition.envelopes) {
      return JSON.parse(JSON.stringify(transition.envelopes));
    }
    return generateDefaultEnvelopes(transition.preset || 'bass-swap', durationBeats);
  });

  const [selectedPreset, setSelectedPreset] = useState<TransitionPresetType>(transition.preset || 'bass-swap');
  const [beats, setBeats] = useState<number>(durationBeats);
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>('all');
  
  // Audition Playhead
  const [isPlaying, setIsPlaying] = useState(false);
  const [auditionBeat, setAuditionBeat] = useState(0);
  const auditionRafRef = useRef<number | null>(null);

  // Dragging Point
  const [draggingPoint, setDraggingPoint] = useState<{
    deck: 'A' | 'B';
    type: 'low' | 'mid' | 'high' | 'volume';
    pointId: string;
  } | null>(null);

  const canvasRef = useRef<SVGSVGElement>(null);

  // Key and Tempo evaluation
  const keyComp = evaluateKeyCompatibility(sourceTrack?.key, targetTrack?.key);
  const tempoSync = calculateTempoSync(sourceTrack?.bpm || 130, targetTrack?.bpm || 130);

  // Re-generate default envelopes when preset or beat length changes
  const applyPresetEnvelopes = (preset: TransitionPresetType, newBeats: number = beats) => {
    setSelectedPreset(preset);
    const def = generateDefaultEnvelopes(preset, newBeats);
    setEnvelopes(def);
  };

  const handleBeatsChange = (newBeats: number) => {
    setBeats(newBeats);
    // Scale or regenerate envelopes for new length
    applyPresetEnvelopes(selectedPreset, newBeats);
  };

  // Canvas coordinates
  const canvasWidth = 760;
  const canvasHeight = 240;
  const laneHeight = canvasHeight / 2; // 120px for Deck A, 120px for Deck B

  const beatToX = (b: number) => {
    return (b / beats) * canvasWidth;
  };

  const xToBeat = (x: number) => {
    const raw = (x / canvasWidth) * beats;
    return Math.max(0, Math.min(beats, Math.round(raw * 4) / 4)); // snap to 1/4 beat
  };

  // Convert value (0..1) to Y within a lane
  const valToY = (val: number, laneIndex: 0 | 1) => {
    const top = laneIndex * laneHeight + 10;
    const height = laneHeight - 20;
    return top + (1 - val) * height;
  };

  const yToVal = (y: number, laneIndex: 0 | 1) => {
    const top = laneIndex * laneHeight + 10;
    const height = laneHeight - 20;
    const norm = 1 - (y - top) / height;
    return Math.max(0, Math.min(1, Math.round(norm * 100) / 100));
  };

  // --- Point Dragging Handlers ---
  const handlePointerDownPoint = (
    e: React.PointerEvent,
    deck: 'A' | 'B',
    type: 'low' | 'mid' | 'high' | 'volume',
    pointId: string
  ) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraggingPoint({ deck, type, pointId });
  };

  const handlePointerMoveCanvas = (e: React.PointerEvent) => {
    if (!draggingPoint || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newBeat = xToBeat(x);
    const laneIndex = draggingPoint.deck === 'A' ? 0 : 1;
    const newVal = yToVal(y, laneIndex);

    setEnvelopes(prev => {
      const key = `${draggingPoint.type}${draggingPoint.deck}` as keyof TransitionEnvelopes;
      const list = [...prev[key]];
      const targetIdx = list.findIndex(p => p.id === draggingPoint.pointId);
      if (targetIdx === -1) return prev;

      // First and last points cannot move beat
      const isFirst = targetIdx === 0;
      const isLast = targetIdx === list.length - 1;

      list[targetIdx] = {
        ...list[targetIdx],
        beat: isFirst ? 0 : isLast ? beats : newBeat,
        value: newVal,
      };

      // Keep sorted by beat
      list.sort((a, b) => a.beat - b.beat);

      return {
        ...prev,
        [key]: list,
      };
    });
  };

  const handlePointerUpCanvas = (e: React.PointerEvent) => {
    if (draggingPoint) {
      setDraggingPoint(null);
    }
  };

  // Add new control point on click
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (draggingPoint || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const laneIndex = y < laneHeight ? 0 : 1;
    const deck: 'A' | 'B' = laneIndex === 0 ? 'A' : 'B';
    const clickBeat = xToBeat(x);
    const clickVal = yToVal(y, laneIndex as 0 | 1);

    const type: 'low' | 'mid' | 'high' | 'volume' = activeLayer === 'all' ? 'low' : activeLayer;
    const key = `${type}${deck}` as keyof TransitionEnvelopes;

    const newPt: EnvelopePoint = {
      id: `pt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      beat: clickBeat,
      value: clickVal,
    };

    setEnvelopes(prev => {
      const list = [...prev[key], newPt].sort((a, b) => a.beat - b.beat);
      return { ...prev, [key]: list };
    });
  };

  // Delete control point on right click or double click
  const handleDeletePoint = (
    e: React.MouseEvent,
    deck: 'A' | 'B',
    type: 'low' | 'mid' | 'high' | 'volume',
    pointId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const key = `${type}${deck}` as keyof TransitionEnvelopes;
    setEnvelopes(prev => {
      const list = prev[key];
      // Don't delete if only 2 points left
      if (list.length <= 2) return prev;
      return {
        ...prev,
        [key]: list.filter(p => p.id !== pointId),
      };
    });
  };

  // --- Audition Preview ---
  const toggleAudition = () => {
    if (isPlaying) {
      setIsPlaying(false);
      if (auditionRafRef.current) {
        cancelAnimationFrame(auditionRafRef.current);
        auditionRafRef.current = null;
      }
    } else {
      setIsPlaying(true);
      const bpm = sourceTrack?.bpm || 130;
      const beatDurationSec = 60 / bpm;
      const totalDurationMs = beats * beatDurationSec * 1000;

      const startBeat = auditionBeat >= beats - 0.5 ? 0 : auditionBeat;
      setAuditionBeat(startBeat);

      const startTime = performance.now() - (startBeat / beats) * totalDurationMs;

      const step = (now: number) => {
        const elapsed = now - startTime;
        const currentB = (elapsed / totalDurationMs) * beats;

        if (currentB <= beats) {
          setAuditionBeat(currentB);
          auditionRafRef.current = requestAnimationFrame(step);
        } else {
          setAuditionBeat(beats);
          setIsPlaying(false);
          auditionRafRef.current = null;
        }
      };

      auditionRafRef.current = requestAnimationFrame(step);
    }
  };

  // Clean up animation frame
  useEffect(() => {
    return () => {
      if (auditionRafRef.current) cancelAnimationFrame(auditionRafRef.current);
    };
  }, []);

  // Compute live preview levels at current audition beat
  const liveLowA = evaluateEnvelope(envelopes.lowA, auditionBeat);
  const liveLowB = evaluateEnvelope(envelopes.lowB, auditionBeat);
  const liveMidA = evaluateEnvelope(envelopes.midA, auditionBeat);
  const liveMidB = evaluateEnvelope(envelopes.midB, auditionBeat);
  const liveHighA = evaluateEnvelope(envelopes.highA, auditionBeat);
  const liveHighB = evaluateEnvelope(envelopes.highB, auditionBeat);

  // SVG Line helper
  const renderEnvelopePath = (points: EnvelopePoint[], laneIndex: 0 | 1, color: string, isMuted: boolean = false) => {
    if (points.length < 2) return null;
    let d = `M ${beatToX(points[0].beat)} ${valToY(points[0].value, laneIndex)}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${beatToX(points[i].beat)} ${valToY(points[i].value, laneIndex)}`;
    }

    return (
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={isMuted ? 1.5 : 2.5}
        strokeOpacity={isMuted ? 0.35 : 0.95}
        className="transition-all pointer-events-none"
      />
    );
  };

  const handleSaveAll = () => {
    const updated: TransitionConfig = {
      ...transition,
      durationBeats: beats,
      preset: selectedPreset,
      envelopes,
      bpmA: sourceTrack?.bpm,
      bpmB: targetTrack?.bpm,
      targetBpm: tempoSync.recommendedTargetBpm,
      pitchShiftPercent: tempoSync.pitchShift,
      keyCompatibility: {
        score: keyComp.score,
        label: keyComp.label,
        type: keyComp.type,
      },
    };
    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-4xl bg-[#12141A] border border-[#2E3445] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        
        {/* ================= MODAL HEADER: DJ MIXER INTEL ================= */}
        <div className="p-4 border-b border-[#242936] bg-[#0A0C10] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">MixMeister Transition Overlap Studio</h2>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-mono font-bold">
                  3-Band EQ Curves
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Multi-Track Wellenform-Überlappung mit interaktiven Bass-, Mitten- und Höhen-Hüllkurven
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-gray-400 hover:text-white hover:bg-[#242936] flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ================= TRACKS & HARMONIC KEY MATCHING BAR ================= */}
        <div className="px-6 py-3 bg-[#161920] border-b border-[#242936] flex items-center justify-between gap-4 text-xs font-mono">
          
          {/* Deck A Track */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-[10px] font-bold">DECK A</span>
            <span className="font-bold text-white truncate max-w-[160px]">{sourceTrack?.title || 'Track A'}</span>
            <span className="text-gray-400">{sourceTrack?.bpm} BPM</span>
            <span className="px-1.5 py-0.5 rounded bg-[#0D0E12] border border-[#242936] text-purple-400 font-bold">{sourceTrack?.key || '8A'}</span>
          </div>

          {/* Key Compatibility & Tempo Sync Center Pills */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Camelot Key Pill */}
            <div 
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold ${
                keyComp.type === 'perfect' 
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : keyComp.type === 'adjacent' || keyComp.type === 'relative'
                  ? 'bg-purple-500/15 border-purple-500/40 text-purple-400'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
              }`}
              title={keyComp.description}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{keyComp.label}</span>
              <span className="opacity-70">({keyComp.score}%)</span>
            </div>

            {/* Tempo Sync Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0D0E12] border border-[#242936] text-gray-300 text-[11px]">
              <Gauge className="w-3.5 h-3.5 text-cyan-400" />
              <span>SYNC: {tempoSync.recommendedTargetBpm} BPM</span>
              <span className="text-[10px] text-gray-500 font-normal">
                ({tempoSync.pitchShift >= 0 ? `+${tempoSync.pitchShift}` : tempoSync.pitchShift}%)
              </span>
            </div>
          </div>

          {/* Deck B Track */}
          <div className="flex items-center justify-end gap-2.5 min-w-0 flex-1">
            <span className="px-1.5 py-0.5 rounded bg-[#0D0E12] border border-[#242936] text-purple-400 font-bold">{targetTrack?.key || '8A'}</span>
            <span className="text-gray-400">{targetTrack?.bpm} BPM</span>
            <span className="font-bold text-white truncate max-w-[160px]">{targetTrack?.title || 'Track B'}</span>
            <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold">DECK B</span>
          </div>

        </div>

        {/* ================= CONTROLS & PRESET BUTTONS ================= */}
        <div className="px-6 py-3 bg-[#0D0E12] border-b border-[#242936] flex items-center justify-between gap-4">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase text-gray-500 mr-1">PRESET:</span>
            {(Object.keys(PRESET_META) as TransitionPresetType[]).map(pKey => {
              const info = PRESET_META[pKey];
              const Icon = info.icon;
              const isSelected = selectedPreset === pKey;

              return (
                <button
                  key={pKey}
                  onClick={() => applyPresetEnvelopes(pKey, beats)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all border ${
                    isSelected
                      ? 'bg-purple-600 border-purple-400 text-white shadow-md'
                      : 'bg-[#161920] border-[#242936] text-gray-400 hover:text-white hover:border-gray-500'
                  }`}
                  title={info.desc}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: isSelected ? '#FFFFFF' : info.color }} />
                  <span>{info.name.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>

          {/* Overlap Duration Beats */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase text-gray-500 mr-1">BEATS:</span>
            {[8, 16, 32, 64, 128].map(b => (
              <button
                key={b}
                onClick={() => handleBeatsChange(b)}
                className={`px-2 py-1 rounded-lg text-xs font-mono font-bold border transition-all ${
                  beats === b
                    ? 'bg-cyan-600 border-cyan-400 text-white shadow-sm'
                    : 'bg-[#161920] border-[#242936] text-gray-400 hover:text-white'
                }`}
              >
                {b}B
              </button>
            ))}
          </div>

          {/* Layer Selector */}
          <div className="flex items-center gap-1 bg-[#161920] p-1 rounded-xl border border-[#242936]">
            {[
              { id: 'all' as const, label: 'Alle', color: '#A855F7' },
              { id: 'low' as const, label: 'Bass (Low)', color: '#F97316' },
              { id: 'mid' as const, label: 'Mitte (Mid)', color: '#EAB308' },
              { id: 'high' as const, label: 'Höhen (High)', color: '#06B6D4' },
              { id: 'volume' as const, label: 'Vol', color: '#22C55E' },
            ].map(layer => (
              <button
                key={layer.id}
                onClick={() => setActiveLayer(layer.id)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
                  activeLayer === layer.id
                    ? 'bg-[#242936] text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                style={{ color: activeLayer === layer.id ? layer.color : undefined }}
              >
                {layer.label}
              </button>
            ))}
          </div>
        </div>

        {/* ================= MIXMEISTER MULTI-TRACK OVERLAP WAVEFORM & CURVES CANVAS ================= */}
        <div className="p-6 flex flex-col gap-2 overflow-y-auto bg-[#0A0C10]">
          
          {/* Top Beat / Bar Ruler */}
          <div className="relative h-6 bg-[#161920] rounded-t-xl border border-[#242936] flex items-center px-2">
            <div className="w-full flex justify-between text-[10px] font-mono text-gray-400 px-1 select-none">
              {Array.from({ length: 9 }).map((_, idx) => {
                const beatVal = Math.round((idx / 8) * beats);
                const barVal = Math.floor(beatVal / 4) + 1;
                return (
                  <span key={idx} className="flex flex-col items-center">
                    <span className="text-gray-300 font-bold">Bar {barVal}</span>
                    <span className="text-[9px] text-gray-500 font-normal">Beat {beatVal}</span>
                  </span>
                );
              })}
            </div>
            {/* Playhead marker in ruler */}
            <div 
              className="absolute top-0 bottom-0 w-2 -ml-1 flex items-center justify-center pointer-events-none transition-[left] duration-75"
              style={{ left: `${(auditionBeat / beats) * 100}%` }}
            >
              <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-red-500" />
            </div>
          </div>

          {/* Interactive SVG Canvas */}
          <div className="relative border border-[#242936] rounded-b-xl overflow-hidden bg-[#0D0E12]">
            
            {/* Lane 1 Label (Deck A Outgoing) */}
            <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
              <span className="px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/40 rounded text-[10px] font-bold text-cyan-400 font-mono">
                DECK A: {sourceTrack?.title || 'Outgoing Track'}
              </span>
              <span className="text-[10px] font-mono text-gray-500">Ausblenden / Übergang</span>
            </div>

            {/* Lane 2 Label (Deck B Incoming) */}
            <div className="absolute top-[128px] left-3 z-20 flex items-center gap-2 pointer-events-none">
              <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/40 rounded text-[10px] font-bold text-emerald-400 font-mono">
                DECK B: {targetTrack?.title || 'Incoming Track'}
              </span>
              <span className="text-[10px] font-mono text-gray-500">Einblenden / Übernahme</span>
            </div>

            {/* Horizontal Split Line */}
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-[#242936] z-10 pointer-events-none" />

            {/* SVG Elements */}
            <svg
              ref={canvasRef}
              viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              className="w-full h-[240px] cursor-crosshair select-none"
              onClick={handleCanvasClick}
              onPointerMove={handlePointerMoveCanvas}
              onPointerUp={handlePointerUpCanvas}
            >
              <defs>
                {/* Waveform Slices Patterns */}
                <linearGradient id="waveDeckA" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.05" />
                </linearGradient>
                <linearGradient id="waveDeckB" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              {/* Background Waveform Representation for Lane A */}
              <g opacity="0.35">
                {Array.from({ length: 120 }).map((_, idx) => {
                  const x = (idx / 120) * canvasWidth;
                  const h = Math.abs(Math.sin(idx * 0.35)) * 45 + 10;
                  return (
                    <rect
                      key={`wa-${idx}`}
                      x={x}
                      y={laneHeight / 2 - h / 2}
                      width={canvasWidth / 120 - 1}
                      height={h}
                      fill="#06B6D4"
                      rx="1"
                    />
                  );
                })}
              </g>

              {/* Background Waveform Representation for Lane B */}
              <g opacity="0.35">
                {Array.from({ length: 120 }).map((_, idx) => {
                  const x = (idx / 120) * canvasWidth;
                  const h = Math.abs(Math.cos(idx * 0.4)) * 45 + 10;
                  return (
                    <rect
                      key={`wb-${idx}`}
                      x={x}
                      y={laneHeight + laneHeight / 2 - h / 2}
                      width={canvasWidth / 120 - 1}
                      height={h}
                      fill="#10B981"
                      rx="1"
                    />
                  );
                })}
              </g>

              {/* Vertical Beat Grid Lines */}
              {Array.from({ length: beats + 1 }).map((_, bIdx) => {
                const x = beatToX(bIdx);
                const isBar = bIdx % 4 === 0;
                return (
                  <line
                    key={`grid-${bIdx}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={canvasHeight}
                    stroke={isBar ? '#2E3445' : '#1A1E29'}
                    strokeWidth={isBar ? 1.5 : 0.8}
                    strokeDasharray={isBar ? undefined : '2 2'}
                  />
                );
              })}

              {/* ENVELOPE CURVES & NODES */}

              {/* Deck A Envelopes (Lane 0) */}
              {(activeLayer === 'all' || activeLayer === 'low') && (
                <>
                  {renderEnvelopePath(envelopes.lowA, 0, '#F97316')}
                  {envelopes.lowA.map(pt => (
                    <polygon
                      key={pt.id}
                      points={`${beatToX(pt.beat)},${valToY(pt.value, 0) - 5} ${beatToX(pt.beat) + 5},${valToY(pt.value, 0)} ${beatToX(pt.beat)},${valToY(pt.value, 0) + 5} ${beatToX(pt.beat) - 5},${valToY(pt.value, 0)}`}
                      fill="#F97316"
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                      className="cursor-pointer hover:scale-125 transition-transform"
                      onPointerDown={(e) => handlePointerDownPoint(e, 'A', 'low', pt.id)}
                      onContextMenu={(e) => handleDeletePoint(e, 'A', 'low', pt.id)}
                    />
                  ))}
                </>
              )}

              {(activeLayer === 'all' || activeLayer === 'mid') && (
                <>
                  {renderEnvelopePath(envelopes.midA, 0, '#EAB308')}
                  {envelopes.midA.map(pt => (
                    <circle
                      key={pt.id}
                      cx={beatToX(pt.beat)}
                      cy={valToY(pt.value, 0)}
                      r="4.5"
                      fill="#EAB308"
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                      className="cursor-pointer hover:scale-125 transition-transform"
                      onPointerDown={(e) => handlePointerDownPoint(e, 'A', 'mid', pt.id)}
                      onContextMenu={(e) => handleDeletePoint(e, 'A', 'mid', pt.id)}
                    />
                  ))}
                </>
              )}

              {(activeLayer === 'all' || activeLayer === 'high') && (
                <>
                  {renderEnvelopePath(envelopes.highA, 0, '#06B6D4')}
                  {envelopes.highA.map(pt => (
                    <circle
                      key={pt.id}
                      cx={beatToX(pt.beat)}
                      cy={valToY(pt.value, 0)}
                      r="4.5"
                      fill="#06B6D4"
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                      className="cursor-pointer hover:scale-125 transition-transform"
                      onPointerDown={(e) => handlePointerDownPoint(e, 'A', 'high', pt.id)}
                      onContextMenu={(e) => handleDeletePoint(e, 'A', 'high', pt.id)}
                    />
                  ))}
                </>
              )}

              {/* Deck B Envelopes (Lane 1) */}
              {(activeLayer === 'all' || activeLayer === 'low') && (
                <>
                  {renderEnvelopePath(envelopes.lowB, 1, '#F97316')}
                  {envelopes.lowB.map(pt => (
                    <polygon
                      key={pt.id}
                      points={`${beatToX(pt.beat)},${valToY(pt.value, 1) - 5} ${beatToX(pt.beat) + 5},${valToY(pt.value, 1)} ${beatToX(pt.beat)},${valToY(pt.value, 1) + 5} ${beatToX(pt.beat) - 5},${valToY(pt.value, 1)}`}
                      fill="#F97316"
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                      className="cursor-pointer hover:scale-125 transition-transform"
                      onPointerDown={(e) => handlePointerDownPoint(e, 'B', 'low', pt.id)}
                      onContextMenu={(e) => handleDeletePoint(e, 'B', 'low', pt.id)}
                    />
                  ))}
                </>
              )}

              {(activeLayer === 'all' || activeLayer === 'mid') && (
                <>
                  {renderEnvelopePath(envelopes.midB, 1, '#EAB308')}
                  {envelopes.midB.map(pt => (
                    <circle
                      key={pt.id}
                      cx={beatToX(pt.beat)}
                      cy={valToY(pt.value, 1)}
                      r="4.5"
                      fill="#EAB308"
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                      className="cursor-pointer hover:scale-125 transition-transform"
                      onPointerDown={(e) => handlePointerDownPoint(e, 'B', 'mid', pt.id)}
                      onContextMenu={(e) => handleDeletePoint(e, 'B', 'mid', pt.id)}
                    />
                  ))}
                </>
              )}

              {(activeLayer === 'all' || activeLayer === 'high') && (
                <>
                  {renderEnvelopePath(envelopes.highB, 1, '#06B6D4')}
                  {envelopes.highB.map(pt => (
                    <circle
                      key={pt.id}
                      cx={beatToX(pt.beat)}
                      cy={valToY(pt.value, 1)}
                      r="4.5"
                      fill="#06B6D4"
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                      className="cursor-pointer hover:scale-125 transition-transform"
                      onPointerDown={(e) => handlePointerDownPoint(e, 'B', 'high', pt.id)}
                      onContextMenu={(e) => handleDeletePoint(e, 'B', 'high', pt.id)}
                    />
                  ))}
                </>
              )}

              {/* Audition Vertical Red Playhead */}
              <line
                x1={beatToX(auditionBeat)}
                y1={0}
                x2={beatToX(auditionBeat)}
                y2={canvasHeight}
                stroke="#EF4444"
                strokeWidth="2.5"
                className="pointer-events-none drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]"
              />
            </svg>

          </div>

          {/* Legend & Instructions */}
          <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 px-1 py-1">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-[#F97316] inline-block" />
                <span>Bass / Low EQ</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-[#EAB308] inline-block" />
                <span>Mitten / Mid EQ</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-[#06B6D4] inline-block" />
                <span>Höhen / High EQ</span>
              </span>
            </div>
            <div className="text-gray-500">
              Klick auf Linie: Punkt hinzufügen • Ziehen: Pegel/Takt anpassen • Rechtsklick: Punkt entfernen
            </div>
          </div>

        </div>

        {/* ================= REAL-TIME AUDITION & EQ METERS BAR ================= */}
        <div className="px-6 py-3 bg-[#161920] border-t border-[#242936] flex items-center justify-between">
          
          {/* Deck A Live Meters */}
          <div className="flex items-center gap-3 w-1/3">
            <span className="text-[10px] font-mono text-cyan-400 font-bold">DECK A:</span>
            <div className="flex items-center gap-2 flex-1">
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-[8px] font-mono text-gray-500">LOW {Math.round(liveLowA * 100)}%</span>
                <div className="h-1.5 bg-[#0D0E12] rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 transition-all duration-75" style={{ width: `${liveLowA * 100}%` }} />
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-[8px] font-mono text-gray-500">MID {Math.round(liveMidA * 100)}%</span>
                <div className="h-1.5 bg-[#0D0E12] rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-500 transition-all duration-75" style={{ width: `${liveMidA * 100}%` }} />
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-[8px] font-mono text-gray-500">HIGH {Math.round(liveHighA * 100)}%</span>
                <div className="h-1.5 bg-[#0D0E12] rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-400 transition-all duration-75" style={{ width: `${liveHighA * 100}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Center Audition Transport Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAuditionBeat(0)}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg transition-colors"
              title="Auf Beat 0 zurücksetzen"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={toggleAudition}
              className="px-4 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white font-bold font-mono text-xs flex items-center gap-2 shadow-lg transition-all"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              <span>{isPlaying ? 'Pause' : 'Übergang Anhören'}</span>
            </button>

            <span className="text-xs font-mono font-bold text-gray-300 w-16 text-center">
              Beat {Math.round(auditionBeat)} / {beats}
            </span>
          </div>

          {/* Deck B Live Meters */}
          <div className="flex items-center gap-3 w-1/3 justify-end">
            <div className="flex items-center gap-2 flex-1">
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-[8px] font-mono text-gray-500">LOW {Math.round(liveLowB * 100)}%</span>
                <div className="h-1.5 bg-[#0D0E12] rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 transition-all duration-75" style={{ width: `${liveLowB * 100}%` }} />
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-[8px] font-mono text-gray-500">MID {Math.round(liveMidB * 100)}%</span>
                <div className="h-1.5 bg-[#0D0E12] rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-500 transition-all duration-75" style={{ width: `${liveMidB * 100}%` }} />
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-[8px] font-mono text-gray-500">HIGH {Math.round(liveHighB * 100)}%</span>
                <div className="h-1.5 bg-[#0D0E12] rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-400 transition-all duration-75" style={{ width: `${liveHighB * 100}%` }} />
                </div>
              </div>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 font-bold">DECK B:</span>
          </div>

        </div>

        {/* ================= MODAL FOOTER ================= */}
        <div className="p-4 border-t border-[#242936] bg-[#0A0C10] flex items-center justify-between">
          {onDelete ? (
            <button
              onClick={() => {
                onDelete(transition.id);
                onClose();
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Übergang Löschen</span>
            </button>
          ) : <div />}

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSaveAll}
              className="flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-xl transition-all font-mono"
            >
              <Check className="w-4 h-4" />
              <span>Hüllkurven Speichern & Anwenden</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
