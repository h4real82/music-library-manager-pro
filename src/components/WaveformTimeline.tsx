import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Pause, RotateCcw, Sliders, Zap, Waves, Scissors, Gauge, Clock, Music, ZoomIn, ZoomOut, Maximize2, Sparkles, ChevronRight, Wand2, Activity, MoveHorizontal, GripVertical, Download, Bookmark } from 'lucide-react';
import { TrackDef, TransitionConfig, TransitionPresetType } from '../types';
import { evaluateKeyCompatibility, calculateTempoSync, evaluateEnvelope, generateHarmonizedSet, generateDefaultEnvelopes } from '../lib/djMixerLogic';
import { PRESET_META } from './DjSetPlayer';
import { globalPerformanceEngine } from '../lib/performanceEngine';
import BeatgridRepairModal from './BeatgridRepairModal';

interface WaveformTimelineProps {
  tracks: TrackDef[];
  transitions: TransitionConfig[];
  activeTransitionId?: string;
  onSelectTransition: (t: TransitionConfig) => void;
  onOpenTransitionStudio: (t: TransitionConfig) => void;
  onOpenTrackAnalysis?: (track: TrackDef) => void;
  currentTime?: number; // Current playback time of set in seconds
  isPlaying?: boolean;
  onSeek?: (timeSec: number) => void;
  onTogglePlay?: () => void;
  onAutomix?: (orderedTracks: TrackDef[], newTransitions: TransitionConfig[]) => void;
  onTransitionsChange?: (transitions: TransitionConfig[]) => void;
  onTrackUpdated?: (track: TrackDef) => void;
  onOpenSetExport?: () => void;
  onSaveSetAsPlaylist?: () => void;
}

const TIMELINE_HEADER_WIDTH = 256; // Left sticky track info header width

interface TrackLayout {
  track: TrackDef;
  index: number;
  baselineStartSec: number;
  startSec: number;
  durationSec: number;
  endSec: number;
  outgoingTransition?: TransitionConfig;
  incomingTransition?: TransitionConfig;
}

interface TransitionOverlapZone {
  transition: TransitionConfig;
  sourceLayout: TrackLayout;
  targetLayout: TrackLayout;
  overlapStartSec: number;
  overlapEndSec: number;
  overlapDurationSec: number;
  overlapStartPx: number;
  overlapWidthPx: number;
  topPx: number;
  heightPx: number;
  keyComp: any;
}

export default function WaveformTimeline({
  tracks,
  transitions,
  activeTransitionId,
  onSelectTransition,
  onOpenTransitionStudio,
  onOpenTrackAnalysis,
  currentTime = 0,
  isPlaying = false,
  onSeek,
  onTogglePlay,
  onAutomix,
  onTransitionsChange,
  onTrackUpdated,
  onOpenSetExport,
  onSaveSetAsPlaylist,
}: WaveformTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0); // 0.4x to 2.5x
  const [perfConfig, setPerfConfig] = useState(() => globalPerformanceEngine.getConfig());

  useEffect(() => {
    const unsubscribe = globalPerformanceEngine.subscribe(setPerfConfig);
    return unsubscribe;
  }, []);

  // Manual slip / timing offsets for each track (in seconds)
  const [trackOffsets, setTrackOffsets] = useState<Record<string, number>>({});

  // Waveform Drag & Slip State
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [activeDragDeltaSec, setActiveDragDeltaSec] = useState<number>(0);

  // Beatgrid Repair Modal State
  const [beatgridRepairModal, setBeatgridRepairModal] = useState<{
    track: TrackDef;
    reference?: TrackDef | null;
  } | null>(null);

  // Pixels per second calculation (scales smoothly with zoom)
  const pxPerSec = 3.2 * zoomLevel;

  // Compute start and end times for each track in the set
  const trackLayouts: TrackLayout[] = useMemo(() => {
    const layouts: TrackLayout[] = [];

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const duration = track.duration || 180;

      let baselineStartSec = 0;
      let outTrans: TransitionConfig | undefined;
      let inTrans: TransitionConfig | undefined;

      if (i > 0) {
        const prevLayout = layouts[i - 1];
        const prevTrack = prevLayout.track;
        const prevBpm = prevTrack.bpm || 130;

        inTrans = transitions.find(t => 
          (t.sourceTrackId === prevTrack.id && t.targetTrackId === track.id) ||
          (t.sourceTrackId === prevTrack.id)
        );

        const durationBeats = inTrans?.durationBeats || 32;
        const transDurationSec = durationBeats * (60 / prevBpm);

        // Transition is firmly anchored to prevTrack's mixout position on the master timeline
        const prevMixoutSec = inTrans?.sourceTimeSec !== undefined
          ? inTrans.sourceTimeSec
          : Math.max(0, prevLayout.durationSec - transDurationSec);

        const transFrameStartSec = prevLayout.startSec + prevMixoutSec;

        const currMixinSec = inTrans?.targetTimeSec !== undefined
          ? inTrans.targetTimeSec
          : 0;

        // Baseline start lines up Track i's mixin point with the transition window
        baselineStartSec = Math.max(0, transFrameStartSec - currMixinSec);
      }

      if (i < tracks.length - 1) {
        const nextTrack = tracks[i + 1];
        outTrans = transitions.find(t => 
          (t.sourceTrackId === track.id && t.targetTrackId === nextTrack.id) ||
          (t.sourceTrackId === track.id)
        );
      }

      // Incorporate manual timeline slip offset
      const manualOffset = (trackOffsets[track.id] || 0) + (draggingTrackId === track.id ? activeDragDeltaSec : 0);
      const startSec = Math.max(0, baselineStartSec + manualOffset);
      const endSec = startSec + duration;

      layouts.push({
        track,
        index: i + 1,
        baselineStartSec,
        startSec,
        durationSec: duration,
        endSec,
        outgoingTransition: outTrans,
        incomingTransition: inTrans,
      });
    }
    return layouts;
  }, [tracks, transitions, trackOffsets, draggingTrackId, activeDragDeltaSec]);

  // Compute unified transition overlap zones that span ACROSS BOTH LANES
  // The transition frame STAYS ANCHORED to Track A (source track)
  const overlapZones: TransitionOverlapZone[] = useMemo(() => {
    const zones: TransitionOverlapZone[] = [];
    const LANE_HEIGHT = 112; // h-28 is 112px
    const LANE_GAP = 8;     // gap-2 is 8px
    const PADDING_TOP = 12; // p-3 is 12px

    for (let i = 0; i < trackLayouts.length - 1; i++) {
      const layoutA = trackLayouts[i];
      const layoutB = trackLayouts[i + 1];
      const trackA = layoutA.track;
      const bpmA = trackA.bpm || 130;

      const found = transitions.find(t => t.sourceTrackId === layoutA.track.id && t.targetTrackId === layoutB.track.id);
      const durationBeats = found?.durationBeats || 32;
      const transDurationSec = durationBeats * (60 / bpmA);

      // Anchored strictly to Track A's outro position!
      const mixoutSec = found?.sourceTimeSec !== undefined
        ? found.sourceTimeSec
        : Math.max(0, layoutA.durationSec - transDurationSec);

      const overlapStartSec = layoutA.startSec + mixoutSec;
      const overlapEndSec = overlapStartSec + transDurationSec;

      const trans: TransitionConfig = found || {
        id: `tr-${layoutA.track.id}-${layoutB.track.id}`,
        sourceTrackId: layoutA.track.id,
        targetTrackId: layoutB.track.id,
        sourceSlotId: 'outro',
        targetSlotId: 'intro',
        durationBeats,
        preset: 'bass-swap' as TransitionPresetType,
        envelopes: generateDefaultEnvelopes('bass-swap', durationBeats),
      };

      const keyComp = evaluateKeyCompatibility(layoutA.track.key, layoutB.track.key);

      zones.push({
        transition: trans,
        sourceLayout: layoutA,
        targetLayout: layoutB,
        overlapStartSec,
        overlapEndSec,
        overlapDurationSec: transDurationSec,
        overlapStartPx: overlapStartSec * pxPerSec,
        overlapWidthPx: transDurationSec * pxPerSec,
        topPx: PADDING_TOP + (i * (LANE_HEIGHT + LANE_GAP)),
        heightPx: (LANE_HEIGHT * 2) + LANE_GAP, // Spans both Lane i and Lane i+1!
        keyComp,
      });
    }
    return zones;
  }, [trackLayouts, transitions, pxPerSec]);

  const totalSetDurationSec = trackLayouts.length > 0 
    ? Math.max(...trackLayouts.map(l => l.endSec), 300) 
    : 300;

  const totalTimelineWidthPx = Math.max(1600, TIMELINE_HEADER_WIDTH + (totalSetDurationSec * pxPerSec) + 400);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + containerRef.current.scrollLeft - TIMELINE_HEADER_WIDTH;
    const seekSec = Math.max(0, Math.min(totalSetDurationSec, clickX / pxPerSec));
    onSeek(seekSec);
  };

  const handleAutomixClick = () => {
    if (!onAutomix || tracks.length < 2) return;
    const result = generateHarmonizedSet(tracks);
    onAutomix(result.orderedTracks, result.transitions);
  };

  // --- Waveform Horizontal Drag & Slip Handlers ---
  const handleWaveformPointerDown = (e: React.PointerEvent, trackId: string) => {
    e.stopPropagation();
    setDraggingTrackId(trackId);
    setDragStartX(e.clientX);
    setActiveDragDeltaSec(0);
  };

  useEffect(() => {
    if (!draggingTrackId) return;

    const handlePointerMove = (e: PointerEvent) => {
      const deltaPx = e.clientX - dragStartX;
      const deltaSec = deltaPx / pxPerSec;
      setActiveDragDeltaSec(deltaSec);
    };

    const handlePointerUp = (e: PointerEvent) => {
      const trackId = draggingTrackId;
      const trackIdx = trackLayouts.findIndex(l => l.track.id === trackId);

      if (trackIdx !== -1) {
        const layout = trackLayouts[trackIdx];
        const track = layout.track;

        // Reference track to synchronize phase and beats with (Deck A if available, else self)
        const refLayout = trackIdx > 0 ? trackLayouts[trackIdx - 1] : null;
        const refBpm = refLayout?.track.bpm || track.bpm || 130;
        const beatSec = 60 / refBpm;
        const barSec = beatSec * 4; // 1 bar = 4 beats

        // Snap to full 4-beat bar grid by default, or 1-beat grid if Shift is held
        const snapInterval = e.shiftKey ? beatSec : barSec;

        // Current raw start time of this track including activeDragDeltaSec
        const rawStart = layout.startSec;
        const refStart = refLayout ? refLayout.startSec : 0;

        // Snap to nearest bar/beat relative to reference track
        const elapsedFromRef = rawStart - refStart;
        const snappedElapsed = Math.round(elapsedFromRef / snapInterval) * snapInterval;
        const snappedStart = Math.max(0, refStart + snappedElapsed);

        // Record final offset relative to baselineStartSec
        const finalOffset = snappedStart - layout.baselineStartSec;

        setTrackOffsets(prev => ({
          ...prev,
          [trackId]: finalOffset,
        }));
      }

      setDraggingTrackId(null);
      setActiveDragDeltaSec(0);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingTrackId, dragStartX, pxPerSec, trackLayouts]);

  return (
    <div 
      className="flex-1 flex flex-col bg-[#0A0C10] overflow-hidden select-none relative"
    >
      
      {/* ================= TIMELINE TOOLBAR ================= */}
      <div className="h-12 px-6 border-b border-[#242936] bg-[#0F1116] flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'}`} />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-1.5">
              <span>Waveform Multi-Track Set Timeline</span>
            </h3>
          </div>

          {onTogglePlay && (
            <button
              onClick={onTogglePlay}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all shadow-md ${
                isPlaying 
                  ? 'bg-amber-600 hover:bg-amber-500 text-white' 
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
              title={isPlaying ? 'Set Pausieren' : 'Set von aktueller Position abspielen'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white ml-0.5" />}
              <span>{isPlaying ? 'PAUSE' : 'PLAY SET'}</span>
            </button>
          )}

          <div className="text-[11px] font-mono text-gray-400 flex items-center gap-2">
            <span className="text-cyan-400 font-bold">{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(totalSetDurationSec)}</span>
            <span>•</span>
            <span>{tracks.length} Tracks</span>
            <span>•</span>
            <span>{overlapZones.length} Übergänge</span>
          </div>
        </div>

        {/* Automix, Grid Mode & Zoom Controls */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-1 text-[10px] font-mono text-gray-400 bg-[#161920] px-2.5 py-1 rounded-lg border border-[#242936]">
            <MoveHorizontal className="w-3 h-3 text-purple-400" />
            <span>Wellenform packen zum Verschieben (Shift = freie Phase)</span>
          </div>

          {onAutomix && tracks.length >= 2 && (
            <button
              onClick={handleAutomixClick}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-purple-600/90 hover:bg-purple-500 text-white text-xs font-mono font-bold border border-purple-400/40 shadow-lg shadow-purple-900/30 transition-all hover:scale-105 active:scale-95"
              title="DJ.Studio Harmonize: Set automatisch nach Camelot-Rad & BPM harmonisieren"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-spin" />
              <span>Harmonize (Automix)</span>
            </button>
          )}

          {onOpenSetExport && (
            <button
              id="btn-waveform-export-set"
              onClick={onOpenSetExport}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#161920] hover:bg-[#242936] text-cyan-300 hover:text-white text-xs font-mono font-bold border border-cyan-500/40 shadow-md transition-all hover:scale-105 active:scale-95"
              title="DJ Set exportieren (CUE Sheet, M3U8 Playlist, Projekt-Datei)"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export</span>
            </button>
          )}

          {onSaveSetAsPlaylist && (
            <button
              id="btn-waveform-save-playlist"
              onClick={onSaveSetAsPlaylist}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#161920] hover:bg-[#242936] text-purple-300 hover:text-white text-xs font-mono font-bold border border-purple-500/40 shadow-md transition-all hover:scale-105 active:scale-95"
              title="Set direkt als Playlist in der linken Sidebar ablegen"
            >
              <Bookmark className="w-3.5 h-3.5 text-purple-400" />
              <span>Speichern</span>
            </button>
          )}

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
        data-timeline-scroll-container="true"
        className="flex-1 overflow-x-auto overflow-y-auto relative bg-[#0D0E12]"
      >
        <div 
          className="relative min-h-full pb-10"
          style={{ width: `${totalTimelineWidthPx}px` }}
        >
          {/* Global Time & Bar Ruler */}
          <div 
            onClick={handleRulerClick}
            className="sticky top-0 h-9 bg-[#161920] border-b border-[#242936] z-40 flex items-center cursor-pointer group shadow-md"
            style={{ width: `${totalTimelineWidthPx}px` }}
          >
            {/* Sticky Left Spacer for ZEIT / TAKTE */}
            <div className="sticky left-0 w-64 h-full bg-[#161920] border-r border-[#242936] z-50 flex items-center px-3 font-mono text-[10px] text-gray-400 font-bold uppercase tracking-wider shrink-0 shadow-md">
              <span>ZEIT / TAKTE</span>
            </div>

            {/* 15-Second Interval Markers */}
            {Array.from({ length: Math.ceil(totalSetDurationSec / 15) + 1 }).map((_, idx) => {
              const sec = idx * 15;
              const x = TIMELINE_HEADER_WIDTH + (sec * pxPerSec);
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
              id="timeline-master-playhead"
              className={`absolute top-0 bottom-0 flex flex-col items-center pointer-events-none z-40 ${isPlaying ? '' : 'transition-[left] duration-75'}`}
              style={{ left: `${TIMELINE_HEADER_WIDTH + (currentTime * pxPerSec)}px` }}
            >
              <div className="px-1.5 py-0.2 rounded bg-red-600 text-white font-mono font-black text-[9px] -translate-x-1/2 shadow-md border border-white/40 drop-shadow-[0_0_8px_rgba(239,68,68,0.9)] whitespace-nowrap mt-0.5">
                {formatTime(currentTime)}
              </div>
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[7px] border-t-red-500 -translate-x-1/2 drop-shadow-[0_0_6px_rgba(239,68,68,1)]" />
            </div>
          </div>

          {/* Vertical Playhead Needle Across All Lanes */}
          <div 
            id="timeline-playhead-needle"
            className={`absolute top-9 bottom-0 w-[2px] bg-red-500 z-30 pointer-events-none drop-shadow-[0_0_10px_rgba(239,68,68,1)] ${isPlaying ? '' : 'transition-[left] duration-75'}`}
            style={{ left: `${TIMELINE_HEADER_WIDTH + (currentTime * pxPerSec)}px` }}
          />

          {/* ================= TRACK LANES CONTAINER ================= */}
          <div className="relative p-3 flex flex-col gap-2">

            {/* TRACK LANES */}
            {trackLayouts.map((layout, idx) => {
              const track = layout.track;
              const waveformLeftPx = TIMELINE_HEADER_WIDTH + (layout.startSec * pxPerSec);
              const widthPx = layout.durationSec * pxPerSec;
              const isDraggingThis = draggingTrackId === track.id;

              // Waveform Peak Slices
              const maxSlices = perfConfig.waveformSliceGranularity;
              const sliceCount = Math.min(maxSlices, Math.max(40, Math.floor(widthPx / (320 / maxSlices))));
              const bpm = track.bpm || 130;
              const beatIntervalSec = 60 / bpm;
              const beatgridOffsetSec = (track.beatgridOffsetMs || 0) / 1000;

              return (
                <div 
                  key={track.id} 
                  className={`relative h-28 bg-[#12141A] border rounded-xl overflow-hidden group shadow-lg flex items-center transition-colors ${
                    isDraggingThis 
                      ? 'border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.3)] bg-[#171922]' 
                      : 'border-[#242936] hover:border-gray-600'
                  }`}
                  style={{ width: `${totalTimelineWidthPx}px` }}
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
                      
                      <div className="flex items-center gap-1.5 mt-1 font-mono text-[9px] flex-wrap">
                        <span className="px-1 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold">
                          {track.bpm} BPM
                        </span>
                        <span className="px-1 py-0.2 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30 font-bold">
                          {track.key}
                        </span>

                        {/* Beatgrid Repair Quick Button */}
                        <button
                          onClick={() => setBeatgridRepairModal({
                            track,
                            reference: trackLayouts[idx + 1]?.track || trackLayouts[idx - 1]?.track || null
                          })}
                          className="px-1.5 py-0.2 rounded bg-[#202534] hover:bg-purple-600 text-gray-300 hover:text-white border border-[#2F3648] transition-colors flex items-center gap-0.5"
                          title="Taktgitter / Phase reparieren"
                        >
                          <Activity className="w-2.5 h-2.5 text-purple-400" />
                          <span>Gitter</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ================= DRAGGABLE WAVEFORM STRIP ================= */}
                  <div 
                    data-waveform-strip="true"
                    data-track-id={track.id}
                    className={`waveform-lane-grab absolute top-1 bottom-1 rounded-lg overflow-hidden border bg-[#0B0D12] flex items-center transition-shadow ${
                      isDraggingThis
                        ? 'border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.5)] cursor-grabbing'
                        : 'border-cyan-500/20 hover:border-cyan-400/50 cursor-grab'
                    }`}
                    style={{ left: `${waveformLeftPx}px`, width: `${widthPx}px` }}
                    onPointerDown={(e) => handleWaveformPointerDown(e, track.id)}
                    title="Gedrückt halten & ziehen: Wellenform horizontal auf der Zeitleiste verschieben (rastet am Taktraster ein)"
                  >
                    {/* Visual Beatgrid Markers Overlay */}
                    <div className="absolute inset-0 pointer-events-none opacity-40">
                      {Array.from({ length: Math.min(120, Math.floor(layout.durationSec / beatIntervalSec)) }).map((_, bIdx) => {
                        const bTime = (bIdx * beatIntervalSec) + beatgridOffsetSec;
                        const bLeftPct = (bTime / layout.durationSec) * 100;
                        const isDownbeat = bIdx % 4 === 0;

                        return (
                          <div
                            key={bIdx}
                            className={`absolute top-0 bottom-0 ${isDownbeat ? 'w-[1.5px] bg-red-400/80' : 'w-[1px] bg-white/20'}`}
                            style={{ left: `${bLeftPct}%` }}
                          />
                        );
                      })}
                    </div>

                    {/* Authentic 3-Band Multi-Frequency Waveform Slices */}
                    <div className="w-full h-full flex items-center px-1">
                      {Array.from({ length: sliceCount }).map((_, sIdx) => {
                        const sliceTime = (sIdx / sliceCount) * layout.durationSec;
                        const relBeatTime = sliceTime - beatgridOffsetSec;
                        const beatPhase = ((relBeatTime / beatIntervalSec) % 1 + 1) % 1;
                        const isDownbeat = (Math.floor(relBeatTime / beatIntervalSec) % 4 === 0);
                        const kickTransient = Math.max(0, 1 - beatPhase * 3.2);

                        let energyMultiplier = 0.85;
                        if (track.segments && track.segments.length > 0) {
                          const seg = track.segments.find(s => sliceTime >= s.startSec && sliceTime <= s.endSec);
                          if (seg) {
                            if (seg.name.includes('Drop') || seg.name.includes('Peak')) energyMultiplier = 1.25;
                            else if (seg.name.includes('Break') || seg.name.includes('Build')) energyMultiplier = 0.6;
                            else if (seg.name.includes('Intro') || seg.name.includes('Outro')) energyMultiplier = 0.75;
                          }
                        }

                        const lowAmp = Math.min(1.0, (kickTransient * (isDownbeat ? 1.0 : 0.75)) * energyMultiplier);
                        const midAmp = Math.min(1.0, (Math.abs(Math.sin(sliceTime * 2.8 + idx)) * 0.4 + 0.3) * energyMultiplier);
                        const highAmp = Math.min(1.0, (Math.pow(Math.abs(Math.sin(sliceTime * 12 + idx)), 4) * 0.5 + 0.2) * energyMultiplier);

                        const totalHeightPct = Math.min(94, Math.max(12, (lowAmp * 0.5 + midAmp * 0.3 + highAmp * 0.2) * 100));

                        const isKickSlice = kickTransient > 0.45;
                        const barColor = isKickSlice
                          ? 'bg-gradient-to-t from-red-600 via-orange-400 to-amber-300'
                          : 'bg-gradient-to-t from-cyan-600 via-cyan-400 to-teal-300';

                        return (
                          <div
                            key={sIdx}
                            className={`flex-1 mx-[1px] rounded-sm transition-all ${barColor}`}
                            style={{ 
                              height: `${totalHeightPct}%`,
                              opacity: isKickSlice ? 0.95 : 0.65
                            }}
                          />
                        );
                      })}
                    </div>

                    {/* Track start/end cue flags */}
                    <div className="absolute top-1 left-2 flex items-center gap-1.5 bg-black/80 px-2 py-0.5 rounded text-[9px] font-mono text-cyan-300 border border-cyan-500/30 backdrop-blur-sm pointer-events-none">
                      <GripVertical className="w-3 h-3 text-purple-400" />
                      <span>START: {formatTime(layout.startSec)}</span>
                      {isDraggingThis && (
                        <span className="text-amber-300 font-bold ml-1">
                          ({activeDragDeltaSec >= 0 ? `+${activeDragDeltaSec.toFixed(1)}` : activeDragDeltaSec.toFixed(1)}s)
                        </span>
                      )}
                    </div>
                  </div>

                </div>
              );
            })}

            {/* ================= UNIFIED TRANSITION BOUNDING FRAMES SPANNING BOTH LANES ================= */}
            {overlapZones.map((zone, zIdx) => {
              const trans = zone.transition;
              const isTransitionActive = trans.id === activeTransitionId;
              const frameLeftPx = TIMELINE_HEADER_WIDTH + zone.overlapStartPx;

              return (
                <div
                  key={`unified-frame-${trans.id}-${zIdx}`}
                  data-transition-frame="true"
                  data-transition-id={trans.id}
                  className={`transition-bounding-frame absolute z-30 rounded-2xl border-2 transition-all cursor-pointer pointer-events-auto backdrop-blur-[1px] flex flex-col justify-between p-3 group/frame ${
                    isTransitionActive
                      ? 'border-purple-400 bg-purple-950/25 shadow-[0_0_35px_rgba(168,85,247,0.5)] ring-2 ring-purple-500/50'
                      : 'border-cyan-400/90 bg-cyan-950/20 hover:border-purple-400 hover:bg-purple-950/30 shadow-[0_0_25px_rgba(6,182,212,0.25)]'
                  }`}
                  style={{
                    top: `${zone.topPx}px`,
                    left: `${frameLeftPx}px`,
                    width: `${Math.max(160, zone.overlapWidthPx)}px`,
                    height: `${zone.heightPx}px`,
                  }}
                  onClick={() => {
                    onSelectTransition(trans);
                    if (onSeek) onSeek(zone.overlapStartSec);
                  }}
                  title="Klicken, um diesen Übergang auszuwählen und direkt anzuspringen"
                >
                  {/* TOP HEADER: TRANSITION INFO & BUTTONS */}
                  <div className="flex items-center justify-between z-20 gap-2 flex-wrap pointer-events-auto">
                    <div className="flex items-center gap-2 bg-black/90 px-2.5 py-1 rounded-lg border border-[#242936] text-[10px] font-mono font-bold text-white shadow-md">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                      <span>ÜBERGANG: {trans.preset.toUpperCase()}</span>
                      <span className="text-cyan-400 font-black">({trans.durationBeats} Beats • {zone.overlapDurationSec.toFixed(1)}s)</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {zone.keyComp && (
                        <div className={`px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold border ${
                          zone.keyComp.type === 'perfect' 
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                            : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                        }`}>
                          {zone.keyComp.label}
                        </div>
                      )}

                      {/* Cue Transition Immediately */}
                      <button
                        id={`btn-cue-transition-${trans.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTransition(trans);
                          if (onSeek) onSeek(zone.overlapStartSec);
                          if (!isPlaying && onTogglePlay) onTogglePlay();
                        }}
                        className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold shadow-md transition-all hover:scale-105 active:scale-95"
                        title="Übergang sofort anspringen und abspielen"
                      >
                        <Play className="w-3 h-3 fill-white" />
                        <span>Cue Mix</span>
                      </button>

                      {/* Quick Beatgrid Repair Button in Overlap Frame */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setBeatgridRepairModal({
                            track: zone.targetLayout.track,
                            reference: zone.sourceLayout.track,
                          });
                        }}
                        className="p-1 bg-black/80 hover:bg-purple-600 rounded text-gray-300 hover:text-white border border-[#242936] transition-colors"
                        title="Taktgitter beider Tracks abgleichen"
                      >
                        <Activity className="w-3 h-3 text-cyan-400" />
                      </button>

                      {/* Open Waveform Transition Overlap Studio */}
                      <button
                        id={`btn-edit-envelope-${trans.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTransitionStudio(trans);
                        }}
                        className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold shadow-md transition-all hover:scale-105 active:scale-95"
                        title="Waveform Transition Overlap Studio öffnen"
                      >
                        <Sliders className="w-3 h-3 text-cyan-300" />
                        <span>Hüllkurven</span>
                      </button>
                    </div>
                  </div>

                  {/* ================= 3-BAND EQ LINES ON BOTH WAVEFORMS ================= */}
                  <div className="flex-1 flex flex-col justify-between py-1 my-1 relative pointer-events-none">
                    
                    {/* Live Playhead Marker moving through the transition */}
                    {currentTime >= zone.overlapStartSec && currentTime <= zone.overlapEndSec && (
                      <div 
                        className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_12px_#fff] z-30 pointer-events-none transition-[left] duration-75"
                        style={{
                          left: `${Math.max(0, Math.min(100, ((currentTime - zone.overlapStartSec) / zone.overlapDurationSec) * 100))}%`
                        }}
                      >
                        <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-white shadow-md ring-2 ring-purple-400" />
                      </div>
                    )}

                    {/* UPPER SECTION: DECK A (OUTGOING TRACK) 3-BAND CURVES */}
                    <div className="relative h-14 w-full flex flex-col justify-center">
                      <div className="absolute top-0 left-1 text-[8px] font-mono font-bold text-gray-300 bg-black/75 px-1.5 py-0.2 rounded border border-white/10 z-10">
                        DECK A ({zone.sourceLayout.track.title})
                      </div>


                      <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 40">
                        {/* Outgoing Bass Curve (Orange) */}
                        <path
                          d={trans.preset === 'bass-swap' 
                            ? 'M 0 6 L 48 6 L 50 36 L 100 36' 
                            : 'M 0 6 L 65 6 L 85 36 L 100 36'}
                          fill="none"
                          stroke="#F97316"
                          strokeWidth="3"
                        />
                        {/* Outgoing Mid Curve (Yellow) */}
                        <path
                          d="M 0 12 L 30 12 L 70 28 L 100 36"
                          fill="none"
                          stroke="#EAB308"
                          strokeWidth="2.5"
                          strokeDasharray="3 1.5"
                        />
                        {/* Outgoing High Curve (Cyan) */}
                        <path
                          d="M 0 18 L 25 18 L 80 32 L 100 36"
                          fill="none"
                          stroke="#06B6D4"
                          strokeWidth="2.5"
                        />
                      </svg>
                    </div>

                    {/* HORIZONTAL TRANSITION SEPARATOR */}
                    <div className="w-full border-t border-dashed border-purple-400/40 my-0.5" />

                    {/* LOWER SECTION: DECK B (INCOMING TRACK) 3-BAND CURVES */}
                    <div className="relative h-14 w-full flex flex-col justify-center">
                      <div className="absolute top-0 left-1 text-[8px] font-mono font-bold text-gray-300 bg-black/75 px-1.5 py-0.2 rounded border border-white/10 z-10">
                        DECK B ({zone.targetLayout.track.title})
                      </div>

                      <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 40">
                        {/* Incoming Bass Curve (Orange) */}
                        <path
                          d={trans.preset === 'bass-swap' 
                            ? 'M 0 36 L 48 36 L 50 6 L 100 6' 
                            : 'M 0 36 L 15 36 L 35 6 L 100 6'}
                          fill="none"
                          stroke="#F97316"
                          strokeWidth="3"
                        />
                        {/* Incoming Mid Curve (Yellow) */}
                        <path
                          d="M 0 36 L 30 36 L 70 20 L 100 12"
                          fill="none"
                          stroke="#EAB308"
                          strokeWidth="2.5"
                          strokeDasharray="3 1.5"
                        />
                        {/* Incoming High Curve (Cyan) */}
                        <path
                          d="M 0 36 L 20 36 L 75 22 L 100 18"
                          fill="none"
                          stroke="#06B6D4"
                          strokeWidth="2.5"
                        />
                      </svg>
                    </div>

                  </div>

                  {/* BOTTOM FOOTER: EQ FREQUENCY LEGEND */}
                  <div className="flex items-center justify-between text-[8px] font-mono bg-black/85 px-2 py-1 rounded-md border border-[#242936] text-gray-300 pointer-events-auto">
                    <span className="flex items-center gap-1 text-orange-400 font-bold">
                      <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                      <span>Tief / Bass</span>
                    </span>
                    <span className="flex items-center gap-1 text-yellow-400 font-bold">
                      <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                      <span>Mitten</span>
                    </span>
                    <span className="flex items-center gap-1 text-cyan-400 font-bold">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
                      <span>Höhen</span>
                    </span>
                  </div>

                </div>
              );
            })}

          </div>

        </div>
      </div>

      {/* ================= BEATGRID REPAIR MODAL ================= */}
      {beatgridRepairModal && (
        <BeatgridRepairModal
          track={beatgridRepairModal.track}
          referenceTrack={beatgridRepairModal.reference}
          onSave={(updated) => {
            if (onTrackUpdated) {
              onTrackUpdated(updated);
            }
            setBeatgridRepairModal(null);
          }}
          onClose={() => setBeatgridRepairModal(null)}
        />
      )}

    </div>
  );
}
