import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  X, Play, Pause, RotateCcw, Check, Sparkles, Sliders, Activity, Zap, Volume2, 
  ArrowLeft, ArrowRight, ChevronsLeft, ChevronsRight, ZoomIn, ZoomOut, Move, Eye, 
  Layers, Compass
} from 'lucide-react';
import { TrackDef } from '../types';
import { getTrackWaveformSlice } from '../lib/waveformGenerator';

interface BeatgridRepairModalProps {
  track: TrackDef;
  referenceTrack?: TrackDef | null;
  onSave: (updatedTrack: TrackDef) => void;
  onClose: () => void;
}

export default function BeatgridRepairModal({
  track,
  referenceTrack,
  onSave,
  onClose,
}: BeatgridRepairModalProps) {
  const [bpm, setBpm] = useState<number>(track.bpm || 130);
  const [offsetMs, setOffsetMs] = useState<number>(track.beatgridOffsetMs || 0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [metronomeEnabled, setMetronomeEnabled] = useState<boolean>(true);
  const [zoomBars, setZoomBars] = useState<number>(8); // 4, 8, 16, 32 bars
  const [viewMode, setViewMode] = useState<'single' | 'stacked'>(referenceTrack ? 'stacked' : 'single');
  const [interactionMode, setInteractionMode] = useState<'scrub' | 'gridDrag'>('scrub');

  // Raw AudioBuffers for bit-perfect physical waveform rendering
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(track.deepAnalysis?.audioBuffer || null);
  const [refAudioBuffer, setRefAudioBuffer] = useState<AudioBuffer | null>(referenceTrack?.deepAnalysis?.audioBuffer || null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastClickBeatRef = useRef<number>(-1);
  const canvasRef = useRef<SVGSVGElement | null>(null);
  const isDraggingRef = useRef<'scrub' | 'gridDrag' | null>(null);
  const dragStartDataRef = useRef<{ clientX: number; initialOffsetMs: number; initialTimeSec: number }>({
    clientX: 0,
    initialOffsetMs: 0,
    initialTimeSec: 0,
  });

  const beatDurationSec = 60 / (bpm > 0 ? bpm : 130);
  const barDurationSec = beatDurationSec * 4;
  const visibleDurationSec = zoomBars * barDurationSec;
  const currentOffsetSec = offsetMs / 1000;

  // View window centered on playhead
  const startTimeSec = Math.max(0, currentTimeSec - visibleDurationSec / 2);
  const endTimeSec = startTimeSec + visibleDurationSec;

  const canvasWidth = 840;
  const singleLaneHeight = 140;
  const stackedLaneHeight = 85;

  // Initialize preview audio element
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = track.url || (track.filePath ? `/api/tracks/audio?path=${encodeURIComponent(track.filePath)}` : '');
    audioRef.current = audio;

    const onTimeUpdate = () => {
      if (audio) setCurrentTimeSec(audio.currentTime);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', () => setIsPlaying(false));

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [track]);

  // 60 FPS smooth playhead animation during playback
  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;
    const update = () => {
      if (audioRef.current) {
        setCurrentTimeSec(audioRef.current.currentTime);
      }
      animId = requestAnimationFrame(update);
    };
    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  // Asynchronously decode active track PCM audio buffer if not cached
  useEffect(() => {
    if (track.deepAnalysis?.audioBuffer) {
      setAudioBuffer(track.deepAnalysis.audioBuffer);
      return;
    }
    const audioSrc = track.url || (track.filePath ? `/api/tracks/audio?path=${encodeURIComponent(track.filePath)}` : '');
    if (!audioSrc) return;

    let isMounted = true;
    (async () => {
      try {
        const res = await fetch(audioSrc);
        const arrayBuf = await res.arrayBuffer();
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = audioCtxRef.current || new AudioCtx();
        audioCtxRef.current = ctx;
        const decoded = await ctx.decodeAudioData(arrayBuf);
        if (isMounted) setAudioBuffer(decoded);
      } catch {}
    })();
    return () => { isMounted = false; };
  }, [track]);

  // Asynchronously decode reference track PCM audio buffer if present
  useEffect(() => {
    if (!referenceTrack) return;
    if (referenceTrack.deepAnalysis?.audioBuffer) {
      setRefAudioBuffer(referenceTrack.deepAnalysis.audioBuffer);
      return;
    }
    const audioSrc = referenceTrack.url || (referenceTrack.filePath ? `/api/tracks/audio?path=${encodeURIComponent(referenceTrack.filePath)}` : '');
    if (!audioSrc) return;

    let isMounted = true;
    (async () => {
      try {
        const res = await fetch(audioSrc);
        const arrayBuf = await res.arrayBuffer();
        const ctx = audioCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = ctx;
        const decoded = await ctx.decodeAudioData(arrayBuf);
        if (isMounted) setRefAudioBuffer(decoded);
      } catch {}
    })();
    return () => { isMounted = false; };
  }, [referenceTrack]);

  // Metronome Sound Generator using Web Audio API
  const playClick = (isDownbeat: boolean) => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(isDownbeat ? 880 : 440, ctx.currentTime);

      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch {}
  };

  // Metronome tick detection
  useEffect(() => {
    if (!isPlaying || !metronomeEnabled) return;
    const adjustedTime = currentTimeSec - (offsetMs / 1000);
    if (adjustedTime < 0) return;

    const currentBeat = Math.floor(adjustedTime / beatDurationSec);
    if (currentBeat !== lastClickBeatRef.current) {
      lastClickBeatRef.current = currentBeat;
      const isDownbeat = ((currentBeat % 4) + 4) % 4 === 0;
      playClick(isDownbeat);
    }
  }, [currentTimeSec, isPlaying, metronomeEnabled, offsetMs, beatDurationSec]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleNudge = (deltaMs: number) => {
    setOffsetMs(prev => prev + deltaMs);
  };

  const handleSetDownbeatAtPlayhead = () => {
    const currentPos = currentTimeSec;
    const currentBarPhase = currentPos % barDurationSec;
    const newOffsetMs = Math.round(currentBarPhase * 1000);
    setOffsetMs(newOffsetMs);
  };

  const handleAutoPhaseAlignWithPartner = () => {
    if (!referenceTrack) return;
    const partnerBpm = referenceTrack.bpm || 130;
    const partnerBeatSec = 60 / partnerBpm;
    const partnerOffsetSec = (referenceTrack.beatgridOffsetMs || 0) / 1000;

    const myBeatSec = 60 / bpm;
    const diffSec = (partnerOffsetSec % partnerBeatSec) - (offsetMs / 1000 % myBeatSec);
    const newOffsetMs = Math.round((offsetMs + (diffSec * 1000)));
    setOffsetMs(newOffsetMs);
  };

  // Tap Tempo state & handler
  const tapTimesRef = useRef<number[]>([]);
  const [tapDisplayCount, setTapDisplayCount] = useState<number>(0);
  const handleTapTempo = () => {
    const now = performance.now();
    const recentTaps = tapTimesRef.current.filter(t => now - t < 2500);
    recentTaps.push(now);
    tapTimesRef.current = recentTaps;
    setTapDisplayCount(recentTaps.length);

    if (recentTaps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < recentTaps.length; i++) {
        intervals.push((recentTaps[i] - recentTaps[i - 1]) / 1000);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avgInterval > 0) {
        const calculatedBpm = Math.round((60 / avgInterval) * 10) / 10;
        if (calculatedBpm >= 50 && calculatedBpm <= 220) {
          setBpm(calculatedBpm);
        }
      }
    }
  };

  // Compute High-Definition Waveform Slices for Active Track
  const activeTrackWaveform = useMemo(() => {
    const sliceCount = 180;
    const sliceDur = visibleDurationSec / sliceCount;
    const slices = [];

    for (let i = 0; i < sliceCount; i++) {
      const sliceTime = startTimeSec + (i / sliceCount) * visibleDurationSec;
      const m = getTrackWaveformSlice(
        track,
        track.deepAnalysis || null,
        sliceTime,
        track.duration || 180,
        currentOffsetSec,
        beatDurationSec,
        audioBuffer,
        sliceDur
      );
      slices.push({
        x: (i / sliceCount) * canvasWidth,
        ...m,
      });
    }

    const currentLaneH = viewMode === 'stacked' ? stackedLaneHeight : singleLaneHeight;
    const centerY = currentLaneH / 2;
    const maxBodyAmp = currentLaneH * 0.40;
    const maxCoreAmp = currentLaneH * 0.20;

    const bodyUpper = slices.map(s => `L ${s.x.toFixed(1)} ${(centerY - s.bodyAmp * maxBodyAmp).toFixed(1)}`).join(' ');
    const bodyLower = [...slices].reverse().map(s => `L ${s.x.toFixed(1)} ${(centerY + s.bodyAmp * maxBodyAmp).toFixed(1)}`).join(' ');
    const bodyEnvelope = `M 0 ${(centerY - slices[0].bodyAmp * maxBodyAmp).toFixed(1)} ${bodyUpper} L ${canvasWidth} ${(centerY + slices[slices.length - 1].bodyAmp * maxBodyAmp).toFixed(1)} ${bodyLower} Z`;

    const coreUpper = slices.map(s => `L ${s.x.toFixed(1)} ${(centerY - s.coreAmp * maxCoreAmp).toFixed(1)}`).join(' ');
    const coreLower = [...slices].reverse().map(s => `L ${s.x.toFixed(1)} ${(centerY + s.coreAmp * maxCoreAmp).toFixed(1)}`).join(' ');
    const coreRibbon = `M 0 ${(centerY - slices[0].coreAmp * maxCoreAmp).toFixed(1)} ${coreUpper} L ${canvasWidth} ${(centerY + slices[slices.length - 1].coreAmp * maxCoreAmp).toFixed(1)} ${coreLower} Z`;

    const needles = slices.map(s => {
      const h = Math.max(1, Math.round(s.needleAmp * (currentLaneH * 0.44)));
      return {
        x: s.x,
        yTop: centerY - h,
        height: Math.max(2, h * 2),
        isKick: s.isKick || (s.kickAmp !== undefined && s.kickAmp > 0.45),
      };
    });

    return { bodyEnvelope, coreRibbon, needles, laneHeight: currentLaneH };
  }, [track, visibleDurationSec, startTimeSec, currentOffsetSec, beatDurationSec, audioBuffer, viewMode, canvasWidth]);

  // Compute Reference Track Waveform (if stacked mode)
  const refTrackWaveform = useMemo(() => {
    if (!referenceTrack || viewMode !== 'stacked') return null;
    const sliceCount = 180;
    const sliceDur = visibleDurationSec / sliceCount;
    const refBpm = referenceTrack.bpm || 130;
    const refBeatSec = 60 / refBpm;
    const refOffsetSec = (referenceTrack.beatgridOffsetMs || 0) / 1000;
    const slices = [];

    for (let i = 0; i < sliceCount; i++) {
      const sliceTime = startTimeSec + (i / sliceCount) * visibleDurationSec;
      const m = getTrackWaveformSlice(
        referenceTrack,
        referenceTrack.deepAnalysis || null,
        sliceTime,
        referenceTrack.duration || 180,
        refOffsetSec,
        refBeatSec,
        refAudioBuffer,
        sliceDur
      );
      slices.push({
        x: (i / sliceCount) * canvasWidth,
        ...m,
      });
    }

    const currentLaneH = stackedLaneHeight;
    const centerY = currentLaneH / 2;
    const maxBodyAmp = currentLaneH * 0.40;
    const maxCoreAmp = currentLaneH * 0.20;

    const bodyUpper = slices.map(s => `L ${s.x.toFixed(1)} ${(centerY - s.bodyAmp * maxBodyAmp).toFixed(1)}`).join(' ');
    const bodyLower = [...slices].reverse().map(s => `L ${s.x.toFixed(1)} ${(centerY + s.bodyAmp * maxBodyAmp).toFixed(1)}`).join(' ');
    const bodyEnvelope = `M 0 ${(centerY - slices[0].bodyAmp * maxBodyAmp).toFixed(1)} ${bodyUpper} L ${canvasWidth} ${(centerY + slices[slices.length - 1].bodyAmp * maxBodyAmp).toFixed(1)} ${bodyLower} Z`;

    const coreUpper = slices.map(s => `L ${s.x.toFixed(1)} ${(centerY - s.coreAmp * maxCoreAmp).toFixed(1)}`).join(' ');
    const coreLower = [...slices].reverse().map(s => `L ${s.x.toFixed(1)} ${(centerY + s.coreAmp * maxCoreAmp).toFixed(1)}`).join(' ');
    const coreRibbon = `M 0 ${(centerY - slices[0].coreAmp * maxCoreAmp).toFixed(1)} ${coreUpper} L ${canvasWidth} ${(centerY + slices[slices.length - 1].coreAmp * maxCoreAmp).toFixed(1)} ${coreLower} Z`;

    const needles = slices.map(s => {
      const h = Math.max(1, Math.round(s.needleAmp * (currentLaneH * 0.44)));
      return {
        x: s.x,
        yTop: centerY - h,
        height: Math.max(2, h * 2),
        isKick: s.isKick || (s.kickAmp !== undefined && s.kickAmp > 0.45),
      };
    });

    return { bodyEnvelope, coreRibbon, needles, laneHeight: currentLaneH, bpm: refBpm, offsetSec: refOffsetSec, beatSec: refBeatSec };
  }, [referenceTrack, viewMode, visibleDurationSec, startTimeSec, refAudioBuffer, canvasWidth]);

  // Compute Beatgrid Vertical Lines within the visible window
  const activeBeatLines = useMemo(() => {
    const lines = [];
    const firstBeatIdx = Math.floor((startTimeSec - currentOffsetSec) / beatDurationSec);
    const lastBeatIdx = Math.ceil((endTimeSec - currentOffsetSec) / beatDurationSec);

    for (let b = firstBeatIdx; b <= lastBeatIdx; b++) {
      const beatTimeSec = currentOffsetSec + (b * beatDurationSec);
      if (beatTimeSec < startTimeSec || beatTimeSec > endTimeSec) continue;

      const x = ((beatTimeSec - startTimeSec) / visibleDurationSec) * canvasWidth;
      const isDownbeat = ((b % 4) + 4) % 4 === 0;
      const barNumber = Math.floor(b / 4) + 1;
      const beatInBar = (((b % 4) + 4) % 4) + 1;

      lines.push({
        x,
        beatTimeSec,
        isDownbeat,
        barNumber,
        beatInBar,
      });
    }
    return lines;
  }, [startTimeSec, endTimeSec, currentOffsetSec, beatDurationSec, visibleDurationSec, canvasWidth]);

  // Reference Track Beatgrid Lines
  const refBeatLines = useMemo(() => {
    if (!refTrackWaveform) return [];
    const lines = [];
    const refOffset = refTrackWaveform.offsetSec;
    const refBeatSec = refTrackWaveform.beatSec;
    const firstBeatIdx = Math.floor((startTimeSec - refOffset) / refBeatSec);
    const lastBeatIdx = Math.ceil((endTimeSec - refOffset) / refBeatSec);

    for (let b = firstBeatIdx; b <= lastBeatIdx; b++) {
      const beatTimeSec = refOffset + (b * refBeatSec);
      if (beatTimeSec < startTimeSec || beatTimeSec > endTimeSec) continue;

      const x = ((beatTimeSec - startTimeSec) / visibleDurationSec) * canvasWidth;
      const isDownbeat = ((b % 4) + 4) % 4 === 0;
      const barNumber = Math.floor(b / 4) + 1;
      const beatInBar = (((b % 4) + 4) % 4) + 1;

      lines.push({
        x,
        beatTimeSec,
        isDownbeat,
        barNumber,
        beatInBar,
      });
    }
    return lines;
  }, [refTrackWaveform, startTimeSec, endTimeSec, visibleDurationSec, canvasWidth]);

  // Playhead position on the SVG canvas
  const playheadX = ((currentTimeSec - startTimeSec) / visibleDurationSec) * canvasWidth;

  // Interactive mouse / drag handlers for scrubbing & sliding the beatgrid
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!canvasRef.current) return;
    canvasRef.current.setPointerCapture(e.pointerId);

    const isGridDrag = e.shiftKey || interactionMode === 'gridDrag';
    isDraggingRef.current = isGridDrag ? 'gridDrag' : 'scrub';
    dragStartDataRef.current = {
      clientX: e.clientX,
      initialOffsetMs: offsetMs,
      initialTimeSec: currentTimeSec,
    };

    if (!isGridDrag) {
      // Direct scrub to click position
      const rect = canvasRef.current.getBoundingClientRect();
      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const targetTime = startTimeSec + (normX * visibleDurationSec);
      if (audioRef.current) {
        audioRef.current.currentTime = Math.max(0, Math.min(track.duration || 180, targetTime));
      }
      setCurrentTimeSec(targetTime);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDraggingRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    if (isDraggingRef.current === 'gridDrag') {
      const deltaX = e.clientX - dragStartDataRef.current.clientX;
      const deltaSec = (deltaX / rect.width) * visibleDurationSec;
      const newOffsetMs = Math.round(dragStartDataRef.current.initialOffsetMs + (deltaSec * 1000));
      setOffsetMs(newOffsetMs);
    } else if (isDraggingRef.current === 'scrub') {
      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const targetTime = startTimeSec + (normX * visibleDurationSec);
      if (audioRef.current) {
        audioRef.current.currentTime = Math.max(0, Math.min(track.duration || 180, targetTime));
      }
      setCurrentTimeSec(targetTime);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (canvasRef.current && canvasRef.current.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
    isDraggingRef.current = null;
  };

  const handleSave = () => {
    const updated: TrackDef = {
      ...track,
      bpm,
      beatgridOffsetMs: offsetMs,
    };
    onSave(updated);
    onClose();
  };

  const totalCanvasHeight = viewMode === 'stacked' && refTrackWaveform
    ? stackedLaneHeight * 2 + 16 // 2 lanes + divider
    : singleLaneHeight;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200 select-none">
      <div className="bg-[#12141A] border border-[#2A303F] rounded-2xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden shadow-purple-950/40">
        
        {/* MODAL HEADER */}
        <div className="p-4 border-b border-[#242936] bg-[#161920] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-white font-mono flex items-center gap-2">
                <span>Taktgitter & Phasen-Reparatur</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-900/60 text-purple-300 border border-purple-400/30">
                  Performance Waveform Studio
                </span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Multi-Layer Performance Waveform mit echter Transienten- und Kick-Erkennung wie in DJ Studio / Mixmeister.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close beatgrid repair modal"
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-[#242936] transition-colors focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TRACK & SYNC OVERVIEW BAR */}
        <div className="px-6 py-3 bg-[#0D0E12] border-b border-[#242936] flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {track.coverArt ? (
              <img src={track.coverArt} className="w-10 h-10 rounded-lg object-cover border border-[#242936]" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-[#161920] border border-[#242936] flex items-center justify-center text-gray-500">
                DJ
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate max-w-xs">{track.title}</div>
              <div className="text-[11px] text-gray-400 truncate max-w-xs">{track.artist}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            {/* BPM display */}
            <div className="flex items-center gap-2 bg-[#161920] px-3 py-1.5 rounded-xl border border-[#242936]">
              <span className="text-gray-400">BPM:</span>
              <span className="text-cyan-400 font-black">{bpm.toFixed(1)}</span>
            </div>

            {/* Beatgrid Offset display */}
            <div className="flex items-center gap-2 bg-[#161920] px-3 py-1.5 rounded-xl border border-[#242936]">
              <span className="text-gray-400">Taktverschiebung:</span>
              <span className={`font-black ${offsetMs === 0 ? 'text-gray-400' : offsetMs > 0 ? 'text-purple-400' : 'text-amber-400'}`}>
                {offsetMs > 0 ? `+${offsetMs}` : offsetMs} ms
              </span>
              <span className="text-[10px] text-gray-500">
                ({(offsetMs / (beatDurationSec * 1000)).toFixed(2)} Beats)
              </span>
            </div>

            {/* Reference Track Sync Badge */}
            {referenceTrack && (
              <div className="flex items-center gap-2 bg-purple-950/30 px-3 py-1.5 rounded-xl border border-purple-500/30 text-purple-300">
                <span className="text-gray-400">Partner:</span>
                <span className="font-bold truncate max-w-[110px]">{referenceTrack.title}</span>
                <span className="text-cyan-400 font-bold">({referenceTrack.bpm} BPM)</span>
              </div>
            )}
          </div>
        </div>

        {/* PERFORMANCE WAVEFORM & BEATGRID CANVAS */}
        <div className="p-6 flex-1 flex flex-col gap-3 overflow-y-auto">
          
          {/* Waveform Controls Header */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <span>Visual Beatgrid & Transient Monitor</span>
                <span className="text-[10px] text-purple-400 font-normal hidden sm:inline">
                  • Rote Striche = Takt-Eins (Downbeat) • Cyan/Weiße = Viertel • Rote Nadeln = Kick-Schläge
                </span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Reference Track Stacked Toggle */}
              {referenceTrack && (
                <div className="flex bg-[#161920] border border-[#242936] rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode('stacked')}
                    className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition-all ${
                      viewMode === 'stacked' 
                        ? 'bg-purple-600 text-white shadow-sm' 
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                    title="Beide Tracks übereinander anzeigen für perfekten Phasen-Vergleich"
                  >
                    Beide Decks
                  </button>
                  <button
                    onClick={() => setViewMode('single')}
                    className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition-all ${
                      viewMode === 'single' 
                        ? 'bg-purple-600 text-white shadow-sm' 
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Nur Track
                  </button>
                </div>
              )}

              {/* Interaction Mode: Scrub vs Grid Drag */}
              <div className="flex bg-[#161920] border border-[#242936] rounded-lg p-0.5">
                <button
                  onClick={() => setInteractionMode('scrub')}
                  className={`px-2 py-1 rounded text-[11px] font-mono font-bold flex items-center gap-1 transition-all ${
                    interactionMode === 'scrub' 
                      ? 'bg-cyan-600 text-white shadow-sm' 
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                  title="Klicken & Ziehen setzt die Abspielposition"
                >
                  <Compass className="w-3 h-3" />
                  <span>Scrub</span>
                </button>
                <button
                  onClick={() => setInteractionMode('gridDrag')}
                  className={`px-2 py-1 rounded text-[11px] font-mono font-bold flex items-center gap-1 transition-all ${
                    interactionMode === 'gridDrag' 
                      ? 'bg-purple-600 text-white shadow-sm' 
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                  title="Klicken & Ziehen verschiebt das Taktgitter direkt mit der Maus (auch via Shift+Drag)"
                >
                  <Move className="w-3 h-3" />
                  <span>Grid Ziehen</span>
                </button>
              </div>

              {/* Zoom Buttons */}
              <div className="flex items-center gap-1 bg-[#161920] border border-[#242936] rounded-lg p-0.5 text-xs font-mono">
                {[4, 8, 16].map(bars => (
                  <button
                    key={bars}
                    onClick={() => setZoomBars(bars)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                      zoomBars === bars ? 'bg-[#242936] text-cyan-300' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {bars}T
                  </button>
                ))}
              </div>

              {/* Metronome Toggle */}
              <button
                onClick={() => setMetronomeEnabled(!metronomeEnabled)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all ${
                  metronomeEnabled 
                    ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50' 
                    : 'bg-[#161920] text-gray-500 border border-[#242936]'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Metronom {metronomeEnabled ? 'EIN' : 'AUS'}</span>
              </button>
            </div>
          </div>

          {/* Interactive Multi-Layer SVG Performance Waveform Canvas */}
          <div className="bg-[#0B0D12] border border-[#242936] rounded-xl p-3 relative overflow-hidden shadow-inner flex flex-col gap-2">
            
            {/* Top Bar Ruler with Bar Markers */}
            <div className="relative h-6 bg-[#12141C] rounded-t-lg border border-[#242936] flex items-center px-2 overflow-hidden select-none">
              <div className="w-full relative h-full">
                {activeBeatLines.filter(l => l.isDownbeat).map((line, idx) => (
                  <div
                    key={`ruler-${idx}`}
                    className="absolute top-0 bottom-0 flex flex-col justify-center transform -translate-x-1/2 pointer-events-none"
                    style={{ left: `${(line.x / canvasWidth) * 100}%` }}
                  >
                    <span className="text-[9px] font-mono font-bold text-red-400 bg-red-950/70 border border-red-500/40 px-1 py-0.2 rounded shadow-sm">
                      Bar {line.barNumber}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* SVG Waveform Lanes Container */}
            <div className="relative bg-[#08090D] rounded-b-lg overflow-hidden border border-[#242936]">
              
              {/* Lane Labels */}
              {viewMode === 'stacked' && refTrackWaveform && (
                <>
                  <div className="absolute top-2 left-3 z-20 flex items-center gap-1.5 pointer-events-none bg-black/60 px-2 py-0.5 rounded border border-purple-500/30">
                    <span className="text-[10px] font-mono font-bold text-purple-300">
                      DECK A (Referenz): {referenceTrack?.title}
                    </span>
                  </div>

                  <div className="absolute top-[98px] left-3 z-20 flex items-center gap-1.5 pointer-events-none bg-black/60 px-2 py-0.5 rounded border border-cyan-500/30">
                    <span className="text-[10px] font-mono font-bold text-cyan-300">
                      DECK B (In Bearbeitung): {track.title}
                    </span>
                  </div>
                </>
              )}

              <svg
                ref={canvasRef}
                viewBox={`0 0 ${canvasWidth} ${totalCanvasHeight}`}
                className="w-full h-[220px] cursor-crosshair select-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                <defs>
                  {/* Deck B (Active Track) Performance Gradients */}
                  <linearGradient id="bgRepairBodyGradTrack" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#0284c7" stopOpacity="0.45" />
                    <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.65" />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity="0.45" />
                  </linearGradient>
                  <linearGradient id="bgRepairCoreGradTrack" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.85" />
                    <stop offset="50%" stopColor="#cffafe" stopOpacity="1.0" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.85" />
                  </linearGradient>

                  {/* Deck A (Reference Track) Performance Gradients */}
                  <linearGradient id="bgRepairBodyGradRef" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.40" />
                    <stop offset="50%" stopColor="#a855f7" stopOpacity="0.60" />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.40" />
                  </linearGradient>
                  <linearGradient id="bgRepairCoreGradRef" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#c084fc" stopOpacity="0.80" />
                    <stop offset="50%" stopColor="#f3e8ff" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#c084fc" stopOpacity="0.80" />
                  </linearGradient>

                  {/* Downbeat Line Glow Filter */}
                  <filter id="bgDownbeatGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* ================= LANE 1: REFERENCE TRACK (if stacked) ================= */}
                {viewMode === 'stacked' && refTrackWaveform && (
                  <g>
                    {/* Lane 1 Background Center Line */}
                    <line 
                      x1="0" 
                      y1={stackedLaneHeight / 2} 
                      x2={canvasWidth} 
                      y2={stackedLaneHeight / 2} 
                      stroke="rgba(255,255,255,0.08)" 
                      strokeWidth="1" 
                    />

                    {/* Reference Beatgrid Lines */}
                    {refBeatLines.map((line, idx) => (
                      <g key={`ref-beat-${idx}`} className="pointer-events-none">
                        <line
                          x1={line.x}
                          y1="0"
                          x2={line.x}
                          y2={stackedLaneHeight}
                          stroke={line.isDownbeat ? '#a855f7' : 'rgba(255,255,255,0.25)'}
                          strokeWidth={line.isDownbeat ? 2 : 1}
                          strokeDasharray={line.isDownbeat ? undefined : '2 2'}
                        />
                      </g>
                    ))}

                    {/* Reference Waveform Body Envelope */}
                    <path d={refTrackWaveform.bodyEnvelope} fill="url(#bgRepairBodyGradRef)" />
                    {/* Reference Core Ribbon */}
                    <path d={refTrackWaveform.coreRibbon} fill="url(#bgRepairCoreGradRef)" />
                    {/* Reference Needles */}
                    {refTrackWaveform.needles.map((needle, i) => (
                      <rect
                        key={`ref-ndl-${i}`}
                        x={needle.x - 0.75}
                        y={needle.yTop}
                        width={1.5}
                        height={needle.height}
                        fill={needle.isKick ? '#f43f5e' : '#a855f7'}
                        opacity={needle.isKick ? 0.95 : 0.65}
                      />
                    ))}

                    {/* Divider between Lane 1 and Lane 2 */}
                    <line 
                      x1="0" 
                      y1={stackedLaneHeight + 8} 
                      x2={canvasWidth} 
                      y2={stackedLaneHeight + 8} 
                      stroke="#242936" 
                      strokeWidth="2" 
                    />
                  </g>
                )}

                {/* ================= ACTIVE TRACK WAVEFORM LANE ================= */}
                <g transform={viewMode === 'stacked' && refTrackWaveform ? `translate(0, ${stackedLaneHeight + 16})` : undefined}>
                  {/* Lane Center Zero Crossing Guide */}
                  <line 
                    x1="0" 
                    y1={activeTrackWaveform.laneHeight / 2} 
                    x2={canvasWidth} 
                    y2={activeTrackWaveform.laneHeight / 2} 
                    stroke="rgba(255,255,255,0.12)" 
                    strokeWidth="1" 
                  />

                  {/* Active Track Beatgrid Vertical Lines */}
                  {activeBeatLines.map((line, idx) => (
                    <g key={`act-beat-${idx}`} className="pointer-events-none">
                      <line
                        x1={line.x}
                        y1="0"
                        x2={line.x}
                        y2={activeTrackWaveform.laneHeight}
                        stroke={line.isDownbeat ? '#ef4444' : 'rgba(255,255,255,0.45)'}
                        strokeWidth={line.isDownbeat ? 2 : 1}
                        strokeDasharray={line.isDownbeat ? undefined : '2 3'}
                        filter={line.isDownbeat ? 'url(#bgDownbeatGlow)' : undefined}
                      />
                      {line.isDownbeat && (
                        <circle
                          cx={line.x}
                          cy={activeTrackWaveform.laneHeight / 2}
                          r="3"
                          fill="#ef4444"
                          filter="url(#bgDownbeatGlow)"
                        />
                      )}
                    </g>
                  ))}

                  {/* Active Waveform Body Envelope */}
                  <path d={activeTrackWaveform.bodyEnvelope} fill="url(#bgRepairBodyGradTrack)" />
                  {/* Active Core Ribbon */}
                  <path d={activeTrackWaveform.coreRibbon} fill="url(#bgRepairCoreGradTrack)" />
                  {/* Active Needles with Kick Highlights */}
                  {activeTrackWaveform.needles.map((needle, i) => (
                    <rect
                      key={`act-ndl-${i}`}
                      x={needle.x - 0.75}
                      y={needle.yTop}
                      width={1.5}
                      height={needle.height}
                      fill={needle.isKick ? '#ef4444' : '#06b6d4'}
                      opacity={needle.isKick ? 0.95 : 0.65}
                    />
                  ))}
                </g>

                {/* ================= AUDIO PLAYHEAD NEEDLE ================= */}
                <g className="pointer-events-none select-none">
                  {/* Playhead Vertical Line across all lanes */}
                  <line
                    x1={playheadX}
                    y1="0"
                    x2={playheadX}
                    y2={totalCanvasHeight}
                    stroke="#facc15"
                    strokeWidth="2"
                    className="drop-shadow-[0_0_6px_rgba(250,204,21,0.9)]"
                  />
                  {/* Top Triangle Arrow */}
                  <polygon
                    points={`${playheadX - 5},0 ${playheadX + 5},0 ${playheadX},8`}
                    fill="#facc15"
                  />
                  {/* Bottom Triangle Arrow */}
                  <polygon
                    points={`${playheadX - 5},${totalCanvasHeight} ${playheadX + 5},${totalCanvasHeight} ${playheadX},${totalCanvasHeight - 8}`}
                    fill="#facc15"
                  />
                </g>
              </svg>
            </div>

            {/* Interaction Hint */}
            <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 px-1">
              <span>
                Zeit: <strong className="text-white">{currentTimeSec.toFixed(2)}s</strong> | Zoom: {zoomBars} Takte ({(visibleDurationSec).toFixed(1)}s)
              </span>
              <span className="text-gray-500">
                💡 <strong className="text-gray-300">Tipp:</strong> Klicke auf die Wellenform zum Abspielen. Halte <strong className="text-purple-300">[Shift]</strong> gedrückt zum Verschieben des Taktgitters.
              </span>
            </div>
          </div>

          {/* REPAIR TOOLS CONTROLS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* COLUMN 1: PHASE NUDGE */}
            <div className="p-4 bg-[#161920] border border-[#242936] rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-purple-400" />
                  <span>Phase Nudge (Verschiebung)</span>
                </span>
                <span className="text-[10px] font-mono text-gray-400">
                  {offsetMs > 0 ? `+${offsetMs}` : offsetMs} ms
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                Schiebe das Taktgitter millimetergenau nach links oder rechts:
              </p>

              <div className="grid grid-cols-2 gap-2">
                {/* 1ms micro-nudge */}
                <button
                  onClick={() => handleNudge(-1)}
                  className="px-2 py-1.5 bg-[#0D0E12] hover:bg-[#242936] text-gray-200 rounded-lg text-xs font-mono font-bold border border-[#242936] transition-colors flex items-center justify-center gap-1"
                  title="Mikro-Justierung: -1 ms"
                >
                  <ArrowLeft className="w-2.5 h-2.5 text-purple-400" />
                  <span>-1 ms</span>
                </button>
                <button
                  onClick={() => handleNudge(1)}
                  className="px-2 py-1.5 bg-[#0D0E12] hover:bg-[#242936] text-gray-200 rounded-lg text-xs font-mono font-bold border border-[#242936] transition-colors flex items-center justify-center gap-1"
                  title="Mikro-Justierung: +1 ms"
                >
                  <span>+1 ms</span>
                  <ArrowRight className="w-2.5 h-2.5 text-purple-400" />
                </button>

                {/* 10ms nudge */}
                <button
                  onClick={() => handleNudge(-10)}
                  className="px-2 py-1.5 bg-[#0D0E12] hover:bg-[#242936] text-gray-200 rounded-lg text-xs font-mono font-bold border border-[#242936] transition-colors flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3 text-purple-400" />
                  <span>-10 ms</span>
                </button>
                <button
                  onClick={() => handleNudge(10)}
                  className="px-2 py-1.5 bg-[#0D0E12] hover:bg-[#242936] text-gray-200 rounded-lg text-xs font-mono font-bold border border-[#242936] transition-colors flex items-center justify-center gap-1"
                >
                  <span>+10 ms</span>
                  <ArrowRight className="w-3 h-3 text-purple-400" />
                </button>

                {/* 1/4 Beat Nudge */}
                <button
                  onClick={() => handleNudge(-Math.round(beatDurationSec * 250))}
                  className="px-2 py-1.5 bg-[#0D0E12] hover:bg-[#242936] text-gray-200 rounded-lg text-xs font-mono font-bold border border-[#242936] transition-colors flex items-center justify-center gap-1"
                >
                  <ChevronsLeft className="w-3 h-3 text-cyan-400" />
                  <span>-1/4 Beat</span>
                </button>
                <button
                  onClick={() => handleNudge(Math.round(beatDurationSec * 250))}
                  className="px-2 py-1.5 bg-[#0D0E12] hover:bg-[#242936] text-gray-200 rounded-lg text-xs font-mono font-bold border border-[#242936] transition-colors flex items-center justify-center gap-1"
                >
                  <span>+1/4 Beat</span>
                  <ChevronsRight className="w-3 h-3 text-cyan-400" />
                </button>

                {/* 1 Full Beat Nudge */}
                <button
                  onClick={() => handleNudge(-Math.round(beatDurationSec * 1000))}
                  className="px-2 py-1.5 bg-[#0D0E12] hover:bg-[#242936] text-gray-200 rounded-lg text-xs font-mono font-bold border border-[#242936] transition-colors flex items-center justify-center gap-1"
                >
                  <ChevronsLeft className="w-3.5 h-3.5 text-amber-400" />
                  <span>-1 Beat</span>
                </button>
                <button
                  onClick={() => handleNudge(Math.round(beatDurationSec * 1000))}
                  className="px-2 py-1.5 bg-[#0D0E12] hover:bg-[#242936] text-gray-200 rounded-lg text-xs font-mono font-bold border border-[#242936] transition-colors flex items-center justify-center gap-1"
                >
                  <span>+1 Beat</span>
                  <ChevronsRight className="w-3.5 h-3.5 text-amber-400" />
                </button>
              </div>

              <button
                onClick={() => setOffsetMs(0)}
                className="w-full py-1 text-[10px] font-mono text-gray-500 hover:text-gray-300 transition-colors text-center"
              >
                Verschiebung auf 0 ms zurücksetzen
              </button>
            </div>

            {/* COLUMN 2: DOWNBEAT ANCHOR & AUTO-ALIGN */}
            <div className="p-4 bg-[#161920] border border-[#242936] rounded-xl flex flex-col justify-between gap-3">
              <div>
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Takt-Eins & Auto-Align</span>
                </span>
                <p className="text-[11px] text-gray-400 mt-1">
                  Setze den ersten Takt-Schlag („Eins“) oder gleiche die Phase automatisch an:
                </p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={handleSetDownbeatAtPlayhead}
                  className="w-full py-2 bg-gradient-to-r from-amber-600/30 to-red-600/30 hover:from-amber-600/50 hover:to-red-600/50 text-amber-200 border border-amber-500/40 rounded-xl text-xs font-mono font-bold transition-all flex items-center justify-center gap-2 shadow-sm active:scale-98"
                  title="Setzt den Downbeat Marker exakt auf die aktuelle Abspielposition"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Takt-Eins hier setzen</span>
                </button>

                {referenceTrack && (
                  <button
                    onClick={handleAutoPhaseAlignWithPartner}
                    className="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-mono font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-purple-900/30 active:scale-98"
                    title="Richtet die Phase von Deck B exakt am Taktgitter von Deck A aus"
                  >
                    <Zap className="w-3.5 h-3.5 text-yellow-300" />
                    <span>Auto-Phase Lock mit Partner</span>
                  </button>
                )}

                {/* TAP TEMPO BUTTON */}
                <button
                  onClick={handleTapTempo}
                  className="w-full py-1.5 bg-[#0D0E12] hover:bg-[#242936] border border-cyan-500/30 hover:border-cyan-500/60 rounded-xl text-xs font-mono font-bold text-cyan-300 transition-all flex items-center justify-center gap-2 active:scale-95"
                  title="Klicke im Takt der Musik, um das Tempo (BPM) zu bestimmen"
                >
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span>TAP TEMPO {tapDisplayCount > 1 ? `(${tapDisplayCount})` : ''}</span>
                </button>
              </div>

              <span className="text-[10px] text-gray-500 font-mono">
                Tipp: Bei Phasenverschiebungen im Mix klicke auf Auto-Phase Lock.
              </span>
            </div>

            {/* COLUMN 3: BPM FINE-TUNING */}
            <div className="p-4 bg-[#161920] border border-[#242936] rounded-xl flex flex-col justify-between gap-3">
              <div>
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span>BPM Feintuning</span>
                </span>
                <p className="text-[11px] text-gray-400 mt-1">
                  Justiere das Tempo, falls das Taktgitter mit der Zeit wegläuft:
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 my-1">
                <button
                  onClick={() => setBpm(b => Math.round((b - 0.1) * 10) / 10)}
                  className="px-2 py-1 bg-[#0D0E12] hover:bg-[#242936] text-gray-300 rounded font-mono font-bold text-xs border border-[#242936]"
                >
                  -0.1
                </button>
                <input
                  type="number"
                  step="0.1"
                  value={bpm}
                  onChange={(e) => setBpm(parseFloat(e.target.value) || bpm)}
                  className="w-24 bg-[#0D0E12] border border-[#242936] rounded px-2 py-1 text-center font-mono font-black text-cyan-300 text-sm focus:border-cyan-500 outline-none"
                />
                <button
                  onClick={() => setBpm(b => Math.round((b + 0.1) * 10) / 10)}
                  className="px-2 py-1 bg-[#0D0E12] hover:bg-[#242936] text-gray-300 rounded font-mono font-bold text-xs border border-[#242936]"
                >
                  +0.1
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setBpm(b => Math.round(b / 2 * 10) / 10)}
                  className="flex-1 py-1 bg-[#0D0E12] hover:bg-[#242936] text-gray-400 hover:text-white rounded text-[11px] font-mono border border-[#242936]"
                  title="Halbes Tempo (/2)"
                >
                  /2 (Halftime)
                </button>
                <button
                  onClick={() => setBpm(b => Math.round(b * 2 * 10) / 10)}
                  className="flex-1 py-1 bg-[#0D0E12] hover:bg-[#242936] text-gray-400 hover:text-white rounded text-[11px] font-mono border border-[#242936]"
                  title="Doppeltes Tempo (x2)"
                >
                  x2 (Double)
                </button>
              </div>
            </div>

          </div>

        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 border-t border-[#242936] bg-[#161920] flex items-center justify-between">
          <button
            onClick={togglePlay}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all shadow-md ${
              isPlaying 
                ? 'bg-amber-600 hover:bg-amber-500 text-white' 
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
            <span>{isPlaying ? 'PAUSE' : 'VORHÖREN'}</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-mono text-gray-400 hover:text-white transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white text-xs font-mono font-bold shadow-lg shadow-purple-900/30 transition-all hover:scale-105 active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Taktgitter Speichern & Anwenden</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
