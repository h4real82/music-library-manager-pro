import React, { useState, useRef, useEffect, MouseEvent } from 'react';
import { Play, Pause, RotateCcw, X, Check, Trash2, Plus, Sliders, Zap, Waves, Scissors, Gauge, Info, Music } from 'lucide-react';
import { TrackDef, TransitionConfig, TransitionEnvelopes, EnvelopePoint, TransitionPresetType } from '../types';
import { evaluateKeyCompatibility, calculateTempoSync, generateDefaultEnvelopes, evaluateEnvelope } from '../lib/djMixerLogic';
import { PRESET_META } from './DjSetPlayer';
import { globalDjSetEngine } from '../lib/djSetAudioEngine';
import { getTrackWaveformSlice } from '../lib/waveformGenerator';

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
  const lastDragEndRef = useRef<number>(0);

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

  // BPM constants for Deck A and B
  const bpmA = sourceTrack?.bpm || 130;
  const bpmB = targetTrack?.bpm || 130;

  // Canvas coordinates
  const canvasWidth = 760;
  const canvasHeight = 240;
  const laneHeight = canvasHeight / 2; // 120px for Deck A, 120px for Deck B

  const beatToX = (b: number) => {
    return (b / Math.max(1, beats)) * canvasWidth;
  };

  // Convert value (0..1) to Y within a lane
  const valToY = (val: number, laneIndex: 0 | 1) => {
    const top = laneIndex * laneHeight + 10;
    const height = laneHeight - 20;
    return top + (1 - val) * height;
  };

  const yToVal = (svgY: number, laneIndex: 0 | 1) => {
    const top = laneIndex * laneHeight + 10;
    const height = laneHeight - 20;
    const norm = 1 - (svgY - top) / height;
    return Math.max(0, Math.min(1, Math.round(norm * 100) / 100));
  };

  // --- Point Dragging Handlers with Window-Level Event Tracking & Sub-Pixel Precision ---
  const handlePointerDownPoint = (
    e: React.PointerEvent,
    deck: 'A' | 'B',
    type: 'low' | 'mid' | 'high' | 'volume',
    pointId: string
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingPoint({ deck, type, pointId });
  };

  // Global window pointer listener ensures dragging never drops even on fast cursor flick
  useEffect(() => {
    if (!draggingPoint) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const svgY = normY * canvasHeight;

      // Snap to 1/4 beat by default, or smooth 0.01 precision if Shift is held
      const rawBeat = normX * beats;
      const newBeat = e.shiftKey
        ? Math.max(0, Math.min(beats, Math.round(rawBeat * 100) / 100))
        : Math.max(0, Math.min(beats, Math.round(rawBeat * 4) / 4));
      const laneIndex = draggingPoint.deck === 'A' ? 0 : 1;
      const newVal = yToVal(svgY, laneIndex);

      setEnvelopes(prev => {
        const key = `${draggingPoint.type}${draggingPoint.deck}` as keyof TransitionEnvelopes;
        const list = [...prev[key]];
        const targetIdx = list.findIndex(p => p.id === draggingPoint.pointId);
        if (targetIdx === -1) return prev;

        const isFirst = targetIdx === 0;
        const isLast = targetIdx === list.length - 1;

        // Clamp intermediate points strictly between previous and next points to prevent point flipping / jitter
        let clampedBeat = newBeat;
        if (isFirst) {
          clampedBeat = 0;
        } else if (isLast) {
          clampedBeat = beats;
        } else {
          const minB = (list[targetIdx - 1]?.beat ?? 0) + 0.1;
          const maxB = (list[targetIdx + 1]?.beat ?? beats) - 0.1;
          if (minB <= maxB) {
            clampedBeat = Math.max(minB, Math.min(maxB, newBeat));
          }
        }

        list[targetIdx] = {
          ...list[targetIdx],
          beat: clampedBeat,
          value: newVal,
        };

        return {
          ...prev,
          [key]: list,
        };
      });
    };

    const handleWindowPointerUp = () => {
      lastDragEndRef.current = Date.now();
      setDraggingPoint(null);
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [draggingPoint, beats, canvasWidth, canvasHeight, laneHeight]);

  // High-Resolution Aligned Waveform Slices for Deck A (Mix-out section)
  const wfSlicesA = useMemo(() => {
    if (!sourceTrack) return [];
    const count = 160;
    const durSec = beats * (60 / bpmA);
    const baseTime = transition.sourceTimeSec !== undefined
      ? transition.sourceTimeSec
      : Math.max(0, (sourceTrack.duration || 180) - durSec);
    const audioBuf = sourceTrack.deepAnalysis?.audioBuffer || null;
    const sliceDur = durSec / count;

    const list = [];
    for (let i = 0; i < count; i++) {
      const sliceTime = baseTime + (i / count) * durSec;
      const m = getTrackWaveformSlice(
        sourceTrack,
        sourceTrack.deepAnalysis || null,
        sliceTime,
        sourceTrack.duration || 180,
        (sourceTrack as any).firstBeatSec || (sourceTrack.deepAnalysis?.beatGrid?.firstBeatSec ?? 0.05),
        60 / bpmA,
        audioBuf,
        sliceDur
      );
      list.push({
        x: (i / count) * canvasWidth,
        ...m
      });
    }
    return list;
  }, [sourceTrack, beats, bpmA, transition.sourceTimeSec, canvasWidth]);

  // High-Resolution Aligned Waveform Slices for Deck B (Mix-in section)
  const wfSlicesB = useMemo(() => {
    if (!targetTrack) return [];
    const count = 160;
    const durSec = beats * (60 / bpmB);
    const baseTime = transition.targetTimeSec !== undefined ? transition.targetTimeSec : 0;
    const audioBuf = targetTrack.deepAnalysis?.audioBuffer || null;
    const sliceDur = durSec / count;

    const list = [];
    for (let i = 0; i < count; i++) {
      const sliceTime = baseTime + (i / count) * durSec;
      const m = getTrackWaveformSlice(
        targetTrack,
        targetTrack.deepAnalysis || null,
        sliceTime,
        targetTrack.duration || 180,
        (targetTrack as any).firstBeatSec || (targetTrack.deepAnalysis?.beatGrid?.firstBeatSec ?? 0.05),
        60 / bpmB,
        audioBuf,
        sliceDur
      );
      list.push({
        x: (i / count) * canvasWidth,
        ...m
      });
    }
    return list;
  }, [targetTrack, beats, bpmB, transition.targetTimeSec, canvasWidth]);

  // Precision Multi-Layer Waveform Paths for Deck A (Mix-out)
  const deckAPrecisionPaths = useMemo(() => {
    if (!wfSlicesA || wfSlicesA.length === 0) return null;
    const centerY = laneHeight / 2; // 60
    const maxBodyAmp = 46;
    const maxCoreAmp = 22;

    const bodyUpper = wfSlicesA.map(s => `L ${s.x.toFixed(1)} ${(centerY - s.bodyAmp * maxBodyAmp).toFixed(1)}`).join(' ');
    const bodyLower = [...wfSlicesA].reverse().map(s => `L ${s.x.toFixed(1)} ${(centerY + s.bodyAmp * maxBodyAmp).toFixed(1)}`).join(' ');
    const bodyEnvelope = `M 0 ${(centerY - wfSlicesA[0].bodyAmp * maxBodyAmp).toFixed(1)} ${bodyUpper} L ${canvasWidth} ${(centerY + wfSlicesA[wfSlicesA.length - 1].bodyAmp * maxBodyAmp).toFixed(1)} ${bodyLower} Z`;

    const coreUpper = wfSlicesA.map(s => `L ${s.x.toFixed(1)} ${(centerY - s.coreAmp * maxCoreAmp).toFixed(1)}`).join(' ');
    const coreLower = [...wfSlicesA].reverse().map(s => `L ${s.x.toFixed(1)} ${(centerY + s.coreAmp * maxCoreAmp).toFixed(1)}`).join(' ');
    const coreRibbon = `M 0 ${(centerY - wfSlicesA[0].coreAmp * maxCoreAmp).toFixed(1)} ${coreUpper} L ${canvasWidth} ${(centerY + wfSlicesA[wfSlicesA.length - 1].coreAmp * maxCoreAmp).toFixed(1)} ${coreLower} Z`;

    const needles = wfSlicesA.map(s => {
      const h = Math.max(1, Math.round(s.needleAmp * 50));
      return {
        x: s.x,
        yTop: centerY - h,
        height: Math.max(2, h * 2),
        isKick: s.isKick || (s.kickAmp !== undefined && s.kickAmp > 0.45),
      };
    });

    return { bodyEnvelope, coreRibbon, needles };
  }, [wfSlicesA, laneHeight, canvasWidth]);

  // Precision Multi-Layer Waveform Paths for Deck B (Mix-in)
  const deckBPrecisionPaths = useMemo(() => {
    if (!wfSlicesB || wfSlicesB.length === 0) return null;
    const centerY = laneHeight + laneHeight / 2; // 180
    const maxBodyAmp = 46;
    const maxCoreAmp = 22;

    const bodyUpper = wfSlicesB.map(s => `L ${s.x.toFixed(1)} ${(centerY - s.bodyAmp * maxBodyAmp).toFixed(1)}`).join(' ');
    const bodyLower = [...wfSlicesB].reverse().map(s => `L ${s.x.toFixed(1)} ${(centerY + s.bodyAmp * maxBodyAmp).toFixed(1)}`).join(' ');
    const bodyEnvelope = `M 0 ${(centerY - wfSlicesB[0].bodyAmp * maxBodyAmp).toFixed(1)} ${bodyUpper} L ${canvasWidth} ${(centerY + wfSlicesB[wfSlicesB.length - 1].bodyAmp * maxBodyAmp).toFixed(1)} ${bodyLower} Z`;

    const coreUpper = wfSlicesB.map(s => `L ${s.x.toFixed(1)} ${(centerY - s.coreAmp * maxCoreAmp).toFixed(1)}`).join(' ');
    const coreLower = [...wfSlicesB].reverse().map(s => `L ${s.x.toFixed(1)} ${(centerY + s.coreAmp * maxCoreAmp).toFixed(1)}`).join(' ');
    const coreRibbon = `M 0 ${(centerY - wfSlicesB[0].coreAmp * maxCoreAmp).toFixed(1)} ${coreUpper} L ${canvasWidth} ${(centerY + wfSlicesB[wfSlicesB.length - 1].coreAmp * maxCoreAmp).toFixed(1)} ${coreLower} Z`;

    const needles = wfSlicesB.map(s => {
      const h = Math.max(1, Math.round(s.needleAmp * 50));
      return {
        x: s.x,
        yTop: centerY - h,
        height: Math.max(2, h * 2),
        isKick: s.isKick || (s.kickAmp !== undefined && s.kickAmp > 0.45),
      };
    });

    return { bodyEnvelope, coreRibbon, needles };
  }, [wfSlicesB, laneHeight, canvasWidth]);

  // Add new control point on click
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (draggingPoint || !canvasRef.current || Date.now() - lastDragEndRef.current < 200) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const svgY = normY * canvasHeight;

    const laneIndex = svgY < laneHeight ? 0 : 1;
    const deck: 'A' | 'B' = laneIndex === 0 ? 'A' : 'B';
    const clickBeat = Math.max(0, Math.min(beats, Math.round((normX * beats) * 4) / 4));
    const clickVal = yToVal(svgY, laneIndex as 0 | 1);

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
      globalDjSetEngine.pause();
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

      if (sourceTrack && targetTrack) {
        globalDjSetEngine.loadDeckA(sourceTrack, transition.sourceTimeSec || 0);
        globalDjSetEngine.loadDeckB(targetTrack, transition.targetTimeSec || 0);
        globalDjSetEngine.syncTransitionProgress(
          startBeat / beats,
          selectedPreset,
          envelopes,
          beats,
          transition.sourceTimeSec || 0,
          transition.targetTimeSec || 0,
          sourceTrack.bpm || 130,
          targetTrack.bpm || 130
        );
        globalDjSetEngine.play();
      }

      const startTime = performance.now() - (startBeat / beats) * totalDurationMs;

      const step = (now: number) => {
        const elapsed = now - startTime;
        const currentB = (elapsed / totalDurationMs) * beats;

        if (currentB <= beats) {
          setAuditionBeat(currentB);
          if (sourceTrack && targetTrack) {
            globalDjSetEngine.syncTransitionProgress(
              currentB / beats,
              selectedPreset,
              envelopes,
              beats,
              transition.sourceTimeSec || 0,
              transition.targetTimeSec || 0,
              sourceTrack.bpm || 130,
              targetTrack.bpm || 130
            );
          }
          auditionRafRef.current = requestAnimationFrame(step);
        } else {
          setAuditionBeat(beats);
          setIsPlaying(false);
          globalDjSetEngine.pause();
          auditionRafRef.current = null;
        }
      };

      auditionRafRef.current = requestAnimationFrame(step);
    }
  };

  // Clean up animation frame and stop audio
  useEffect(() => {
    return () => {
      if (auditionRafRef.current) cancelAnimationFrame(auditionRafRef.current);
      globalDjSetEngine.pause();
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

  // SVG Control Points helper with enlarged 28px tactile grab halo and transform-origin stabilization
  const renderControlPoints = (
    points: EnvelopePoint[],
    deck: 'A' | 'B',
    type: 'low' | 'mid' | 'high',
    laneIndex: 0 | 1,
    color: string,
    isDiamond: boolean = false
  ) => {
    return points.map(pt => {
      const cx = beatToX(pt.beat);
      const cy = valToY(pt.value, laneIndex);
      const isBeingDragged = draggingPoint?.pointId === pt.id;

      return (
        <g
          key={pt.id}
          className="cursor-grab active:cursor-grabbing group/pt select-none"
          onPointerDown={(e) => handlePointerDownPoint(e, deck, type, pt.id)}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => handleDeletePoint(e, deck, type, pt.id)}
          title={`Beat: ${pt.beat.toFixed(2)} | Pegel: ${(pt.value * 100).toFixed(0)}% (Ziehen zum Verschieben, Shift+Ziehen für stufenlos, Rechtsklick zum Löschen)`}
        >
          {/* Invisible enlarged hit target (28px diameter) for effortless tactile grabbing */}
          <circle cx={cx} cy={cy} r="14" fill="transparent" />

          {/* Hover / Active Drag Glow Halo */}
          <circle
            cx={cx}
            cy={cy}
            r={isBeingDragged ? "9" : "7"}
            fill="none"
            stroke={color}
            strokeWidth={isBeingDragged ? "2.5" : "1.5"}
            opacity={isBeingDragged ? "0.9" : "0"}
            className="group-hover/pt:opacity-80 transition-all duration-150"
          />

          {/* Graphic Symbol: Diamond for Low/Bass, Circle for Mid/High */}
          {isDiamond ? (
            <polygon
              points={`${cx},${cy - 5.5} ${cx + 5.5},${cy} ${cx},${cy + 5.5} ${cx - 5.5},${cy}`}
              fill={color}
              stroke="#FFFFFF"
              strokeWidth="1.5"
              className={`transition-transform duration-100 ${isBeingDragged ? 'scale-125' : 'group-hover/pt:scale-110'}`}
              style={{ transformOrigin: `${cx}px ${cy}px` }}
            />
          ) : (
            <circle
              cx={cx}
              cy={cy}
              r={isBeingDragged ? "5.5" : "4.5"}
              fill={color}
              stroke="#FFFFFF"
              strokeWidth="1.5"
              className={`transition-all duration-100 ${isBeingDragged ? 'scale-125' : 'group-hover/pt:scale-110'}`}
              style={{ transformOrigin: `${cx}px ${cy}px` }}
            />
          )}
        </g>
      );
    });
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
      <div className="w-full max-w-5xl bg-[#12141A] border border-[#2E3445] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        
        {/* ================= MODAL HEADER: DJ MIXER INTEL ================= */}
        <div className="p-4 border-b border-[#242936] bg-[#0A0C10] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Waveform Transition Overlap Studio</h2>
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
            aria-label="Close transition overlap studio"
            className="w-8 h-8 rounded-xl text-gray-400 hover:text-white hover:bg-[#242936] flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
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
              <span>{sourceTrack?.bpm || 130} ➔ {tempoSync.recommendedTargetBpm} BPM</span>
              <span className="text-[9px] text-gray-500 font-mono">({tempoSync.pitchShift >= 0 ? '+' : ''}{tempoSync.pitchShift}%)</span>
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

        {/* ================= CONTROLS & PRESET BUTTONS (Wrapped & Contained) ================= */}
        <div className="px-6 py-3 bg-[#0D0E12] border-b border-[#242936] flex items-center justify-between gap-3 flex-wrap">
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

        {/* ================= WAVEFORM MULTI-TRACK OVERLAP WAVEFORM & CURVES CANVAS ================= */}
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
            >
              <defs>
                {/* Precision Waveform Slices Patterns for Deck A */}
                <linearGradient id="studioWaveDeckA" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#0077ff" stopOpacity="0.40" />
                  <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#0077ff" stopOpacity="0.40" />
                </linearGradient>
                <linearGradient id="studioCoreA" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.75" />
                  <stop offset="50%" stopColor="#cffafe" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.75" />
                </linearGradient>

                {/* Precision Waveform Slices Patterns for Deck B */}
                <linearGradient id="studioWaveDeckB" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#059669" stopOpacity="0.40" />
                  <stop offset="50%" stopColor="#10b981" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0.40" />
                </linearGradient>
                <linearGradient id="studioCoreB" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.75" />
                  <stop offset="50%" stopColor="#d1fae5" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#34d399" stopOpacity="0.75" />
                </linearGradient>
              </defs>

              {/* Background Precision Waveform Representation for Lane A (Mix-out Audio Slices & Transients) */}
              {deckAPrecisionPaths && (
                <g className="pointer-events-none select-none">
                  {/* Body Envelope */}
                  <path d={deckAPrecisionPaths.bodyEnvelope} fill="url(#studioWaveDeckA)" />
                  {/* Core Ribbon */}
                  <path d={deckAPrecisionPaths.coreRibbon} fill="url(#studioCoreA)" />
                  {/* Transient Needles & Kicks */}
                  {deckAPrecisionPaths.needles.map((needle, i) => (
                    <rect
                      key={`a-ndl-${i}`}
                      x={needle.x - 0.75}
                      y={needle.yTop}
                      width={1.5}
                      height={needle.height}
                      fill={needle.isKick ? '#f43f5e' : '#06b6d4'}
                      opacity={needle.isKick ? 0.95 : 0.65}
                    />
                  ))}
                </g>
              )}

              {/* Background Precision Waveform Representation for Lane B (Mix-in Audio Slices & Transients) */}
              {deckBPrecisionPaths && (
                <g className="pointer-events-none select-none">
                  {/* Body Envelope */}
                  <path d={deckBPrecisionPaths.bodyEnvelope} fill="url(#studioWaveDeckB)" />
                  {/* Core Ribbon */}
                  <path d={deckBPrecisionPaths.coreRibbon} fill="url(#studioCoreB)" />
                  {/* Transient Needles & Kicks */}
                  {deckBPrecisionPaths.needles.map((needle, i) => (
                    <rect
                      key={`b-ndl-${i}`}
                      x={needle.x - 0.75}
                      y={needle.yTop}
                      width={1.5}
                      height={needle.height}
                      fill={needle.isKick ? '#f59e0b' : '#10b981'}
                      opacity={needle.isKick ? 0.95 : 0.65}
                    />
                  ))}
                </g>
              )}

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
                  {renderControlPoints(envelopes.lowA, 'A', 'low', 0, '#F97316', true)}
                </>
              )}

              {(activeLayer === 'all' || activeLayer === 'mid') && (
                <>
                  {renderEnvelopePath(envelopes.midA, 0, '#EAB308')}
                  {renderControlPoints(envelopes.midA, 'A', 'mid', 0, '#EAB308', false)}
                </>
              )}

              {(activeLayer === 'all' || activeLayer === 'high') && (
                <>
                  {renderEnvelopePath(envelopes.highA, 0, '#06B6D4')}
                  {renderControlPoints(envelopes.highA, 'A', 'high', 0, '#06B6D4', false)}
                </>
              )}

              {/* Deck B Envelopes (Lane 1) */}
              {(activeLayer === 'all' || activeLayer === 'low') && (
                <>
                  {renderEnvelopePath(envelopes.lowB, 1, '#F97316')}
                  {renderControlPoints(envelopes.lowB, 'B', 'low', 1, '#F97316', true)}
                </>
              )}

              {(activeLayer === 'all' || activeLayer === 'mid') && (
                <>
                  {renderEnvelopePath(envelopes.midB, 1, '#EAB308')}
                  {renderControlPoints(envelopes.midB, 'B', 'mid', 1, '#EAB308', false)}
                </>
              )}

              {(activeLayer === 'all' || activeLayer === 'high') && (
                <>
                  {renderEnvelopePath(envelopes.highB, 1, '#06B6D4')}
                  {renderControlPoints(envelopes.highB, 'B', 'high', 1, '#06B6D4', false)}
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
