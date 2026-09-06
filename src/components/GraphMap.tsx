import React, { useState, useRef, useEffect, MouseEvent } from 'react';
import { Play, Sparkles, ZoomIn, ZoomOut, Maximize2, Move, MousePointer, X, Check, Trash2, Sliders, Zap, Waves, Scissors, Gauge, LayoutGrid, Calendar } from 'lucide-react';
import { Track } from '../App';
import { TrackSegment } from '../lib/audioAnalysis';
import { HotCue, TransitionConfig, TransitionPresetType } from '../types';
import { PRESET_META } from './DjSetPlayer';
import TransitionOverlapStudio from './TransitionOverlapStudio';
import MixMeisterTimeline from './MixMeisterTimeline';
import { generateDefaultEnvelopes } from '../lib/djMixerLogic';

interface GraphMapProps {
  tracks: Track[];
  libraryTracks: Track[];
  onAddSuggested: (tracks: Track[]) => void;
  onPlaySegment: (track: Track, startSec: number) => void;
  onAnalyze: (track: Track) => void;
  transitions?: TransitionConfig[];
  activeTransitionId?: string;
  onTransitionsChange?: (transitions: TransitionConfig[]) => void;
  onSelectTransition?: (t: TransitionConfig) => void;
}

interface Point {
  x: number;
  y: number;
}

interface NodePos {
  x: number;
  y: number;
}

interface DraggingPortState {
  trackId: string;
  slotId: string;
  slotName: string;
  isRight: boolean;
  startPos: Point;
}

// Helper to get unified slots for a track (Hotcues + Segments fallback)
interface TrackSlotInfo {
  id: string;
  slotNumber: number;
  name: string;
  timeSec: number;
  color: string;
  isLoop?: boolean;
  loopLengthBeats?: number;
}

export default function GraphMap({
  tracks,
  libraryTracks,
  onAddSuggested,
  onPlaySegment,
  onAnalyze,
  transitions = [],
  activeTransitionId,
  onTransitionsChange,
  onSelectTransition,
}: GraphMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // View submode: 'timeline' (MixMeister Multi-Track) or 'canvas' (2D Node Graph)
  const [graphSubMode, setGraphSubMode] = useState<'timeline' | 'canvas'>('timeline');

  // Canvas Viewport Transform (Zoom & Pan)
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [toolMode, setToolMode] = useState<'select' | 'pan'>('select');
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  // Track node positions on the canvas
  const [positions, setPositions] = useState<Record<string, NodePos>>({});

  // Local transitions if not fully controlled from parent
  const [localTransitions, setLocalTransitions] = useState<TransitionConfig[]>(transitions);

  useEffect(() => {
    setLocalTransitions(transitions);
  }, [transitions]);

  const updateTransitions = (newTransitions: TransitionConfig[]) => {
    setLocalTransitions(newTransitions);
    if (onTransitionsChange) {
      onTransitionsChange(newTransitions);
    }
  };

  // Dragging states for nodes
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Slot-to-Slot Edge Drawing
  const [drawingPort, setDrawingPort] = useState<DraggingPortState | null>(null);
  const [currentCanvasMouse, setCurrentCanvasMouse] = useState<Point>({ x: 0, y: 0 });

  // Active Transition Config Modal / Popover on edge
  const [editingTransition, setEditingTransition] = useState<TransitionConfig | null>(null);
  const [modalPos, setModalPos] = useState<Point | null>(null);

  // Initialize layout positions for playlist tracks
  useEffect(() => {
    setPositions(prev => {
      const next = { ...prev };
      let changed = false;
      tracks.forEach((t, i) => {
        if (!next[t.id]) {
          const col = i % 4;
          const row = Math.floor(i / 4);
          next[t.id] = { x: 80 + (col * 310), y: 80 + (row * 360) };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [tracks]);

  // Convert screen clientX/Y to canvas coordinate space
  const screenToCanvas = (clientX: number, clientY: number): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  };

  // --- Canvas Zoom & Pan Handlers ---
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || toolMode === 'pan') {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(2.0, Math.max(0.35, zoom * zoomFactor));

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Zoom centered on cursor
        setPan(prev => ({
          x: mouseX - (mouseX - prev.x) * (newZoom / zoom),
          y: mouseY - (mouseY - prev.y) * (newZoom / zoom),
        }));
      }
      setZoom(newZoom);
    } else {
      // Regular pan via trackpad/wheel
      setPan(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  const handleContainerPointerDown = (e: React.PointerEvent) => {
    // If clicking directly on container background or in Pan mode or middle mouse
    if (e.target === containerRef.current || toolMode === 'pan' || e.button === 1 || e.spaceKey) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleContainerPointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    if (drawingPort) {
      const canvasPt = screenToCanvas(e.clientX, e.clientY);
      setCurrentCanvasMouse(canvasPt);
    }

    if (draggingNode) {
      const canvasPt = screenToCanvas(e.clientX, e.clientY);
      setPositions(prev => ({
        ...prev,
        [draggingNode]: {
          x: canvasPt.x - dragOffset.x,
          y: canvasPt.y - dragOffset.y,
        }
      }));
    }
  };

  const handleContainerPointerUp = () => {
    setIsPanning(false);
    setDraggingNode(null);
    setDrawingPort(null);
  };

  // Zoom HUD actions
  const handleZoomIn = () => setZoom(z => Math.min(2.0, z + 0.15));
  const handleZoomOut = () => setZoom(z => Math.max(0.35, z - 0.15));
  const handleResetZoom = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };
  const handleFitAll = () => {
    if (tracks.length === 0 || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    tracks.forEach(t => {
      const p = positions[t.id] || { x: 0, y: 0 };
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + 240);
      maxY = Math.max(maxY, p.y + 320);
    });

    const contentWidth = Math.max(400, maxX - minX + 100);
    const contentHeight = Math.max(300, maxY - minY + 100);
    const scaleX = rect.width / contentWidth;
    const scaleY = rect.height / contentHeight;
    const newZoom = Math.min(1.2, Math.max(0.4, Math.min(scaleX, scaleY)));

    setZoom(newZoom);
    setPan({
      x: (rect.width - (contentWidth * newZoom)) / 2 - (minX * newZoom),
      y: (rect.height - (contentHeight * newZoom)) / 2 - (minY * newZoom),
    });
  };

  // --- Node Dragging ---
  const handleNodePointerDown = (e: React.PointerEvent, trackId: string) => {
    if (toolMode === 'pan') return;
    e.stopPropagation();
    setSelectedNodeId(trackId);
    setDraggingNode(trackId);
    const canvasPt = screenToCanvas(e.clientX, e.clientY);
    const pos = positions[trackId] || { x: 0, y: 0 };
    setDragOffset({
      x: canvasPt.x - pos.x,
      y: canvasPt.y - pos.y,
    });
  };

  // --- Slot Ports and Edge Drawing ---
  const getTrackSlots = (track: Track): TrackSlotInfo[] => {
    const slots: TrackSlotInfo[] = [];

    if (track.hotCues && track.hotCues.length > 0) {
      track.hotCues.forEach((hc, idx) => {
        slots.push({
          id: hc.id || `slot-${idx + 1}`,
          slotNumber: hc.slot || idx + 1,
          name: hc.name || (hc.isLoop ? `Loop ${hc.loopLengthBeats || 4}B` : `Cue ${idx + 1}`),
          timeSec: hc.timeMs / 1000,
          color: hc.color || (hc.isLoop ? '#10B981' : '#A855F7'),
          isLoop: hc.isLoop,
          loopLengthBeats: hc.loopLengthBeats,
        });
      });
    } else if (track.segments && track.segments.length > 0) {
      track.segments.slice(0, 5).forEach((seg, idx) => {
        slots.push({
          id: seg.id,
          slotNumber: idx + 1,
          name: seg.name,
          timeSec: seg.startSec,
          color: seg.color || '#3B82F6',
        });
      });
    } else {
      // Default slots
      slots.push(
        { id: `s1-${track.id}`, slotNumber: 1, name: 'Intro Cue', timeSec: 0, color: '#3B82F6' },
        { id: `s2-${track.id}`, slotNumber: 2, name: 'Main Drop', timeSec: 32, color: '#EF4444' },
        { id: `s3-${track.id}`, slotNumber: 3, name: 'Outro Transition', timeSec: Math.max(60, (track.duration || 180) - 32), color: '#10B981' },
      );
    }
    return slots;
  };

  const handlePortPointerDown = (e: React.PointerEvent, track: Track, slot: TrackSlotInfo, isRight: boolean) => {
    e.stopPropagation();
    const canvasPt = screenToCanvas(e.clientX, e.clientY);
    setDrawingPort({
      trackId: track.id,
      slotId: slot.id,
      slotName: slot.name,
      isRight,
      startPos: canvasPt,
    });
    setCurrentCanvasMouse(canvasPt);
  };

  const handlePortPointerUp = (e: React.PointerEvent, targetTrack: Track, targetSlot: TrackSlotInfo) => {
    e.stopPropagation();
    if (!drawingPort) return;

    // Do not connect to self
    if (drawingPort.trackId === targetTrack.id) {
      setDrawingPort(null);
      return;
    }

    const sourceTrack = tracks.find(t => t.id === drawingPort.trackId);
    if (!sourceTrack) {
      setDrawingPort(null);
      return;
    }

    // Create new TransitionConfig with default 3-Band MixMeister envelopes
    const newTransition: TransitionConfig = {
      id: `tr-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      sourceTrackId: drawingPort.trackId,
      sourceSlotId: drawingPort.slotId,
      sourceSlotName: drawingPort.slotName,
      targetTrackId: targetTrack.id,
      targetSlotId: targetSlot.id,
      targetSlotName: targetSlot.name,
      durationBeats: 32, // Default 32 beats
      preset: 'bass-swap', // Default instant bass switch
      envelopes: generateDefaultEnvelopes('bass-swap', 32),
    };

    const updated = [...localTransitions.filter(t => 
      !(t.sourceTrackId === newTransition.sourceTrackId && t.targetTrackId === newTransition.targetTrackId)
    ), newTransition];

    updateTransitions(updated);
    setDrawingPort(null);

    // Auto-open transition configuration modal for this edge!
    setEditingTransition(newTransition);
    if (onSelectTransition) {
      onSelectTransition(newTransition);
    }
  };

  // Helper to compute port coordinates in canvas space
  const getNodePortCoord = (trackId: string, slotIndex: number, isRight: boolean): Point => {
    const pos = positions[trackId] || { x: 0, y: 0 };
    const nodeWidth = 230;
    const headerHeight = 44;
    const slotHeight = 36;
    const slotGap = 4;
    const padding = 8;

    const x = pos.x + (isRight ? nodeWidth : 0);
    const y = pos.y + headerHeight + padding + (slotIndex * (slotHeight + slotGap)) + (slotHeight / 2);
    return { x, y };
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div 
      className="absolute inset-0 bg-[#0D0E12] overflow-hidden select-none"
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      onPointerLeave={handleContainerPointerUp}
      style={{ cursor: toolMode === 'pan' || isPanning ? 'grabbing' : 'default' }}
    >
      {/* Background Matrix Grid */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #2A303F 1px, transparent 0)',
          backgroundSize: `${36 * zoom}px ${36 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      />

      {/* Top Right Submode Switcher (MixMeister Timeline vs Node Graph) */}
      <div className="absolute top-4 right-4 z-40 flex items-center gap-3">
        <div className="flex items-center gap-1 bg-[#161920]/90 border border-[#242936] p-1 rounded-xl shadow-xl backdrop-blur-md">
          <button
            onClick={() => setGraphSubMode('timeline')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              graphSubMode === 'timeline'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
            title="MixMeister Multi-Track Zeitleiste"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>MixMeister Timeline</span>
          </button>
          <button
            onClick={() => setGraphSubMode('canvas')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              graphSubMode === 'canvas'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
            title="2D Slot Node Graph"
          >
            <Move className="w-3.5 h-3.5 text-emerald-400" />
            <span>Node Graph</span>
          </button>
        </div>
      </div>

      {graphSubMode === 'timeline' ? (
        <div className="absolute inset-0 pt-16 flex flex-col">
          <MixMeisterTimeline
            tracks={tracks}
            transitions={localTransitions}
            activeTransitionId={activeTransitionId}
            onSelectTransition={(t) => {
              if (onSelectTransition) onSelectTransition(t);
            }}
            onOpenTransitionStudio={(t) => {
              setEditingTransition(t);
              if (onSelectTransition) onSelectTransition(t);
            }}
            onOpenTrackAnalysis={onAnalyze}
          />
        </div>
      ) : (
        <>
      {/* ================= FLOATING HUD / STEUERFELD ================= */}
      <div className="absolute top-4 left-4 z-40 flex items-center gap-1.5 bg-[#161920]/90 border border-[#242936] p-1.5 rounded-xl shadow-2xl backdrop-blur-md">
        <button
          onClick={() => setToolMode('select')}
          className={`p-2 rounded-lg text-xs font-bold transition-all ${
            toolMode === 'select' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
          }`}
          title="Auswahl / Drag-Modus (V)"
        >
          <MousePointer className="w-4 h-4" />
        </button>
        <button
          onClick={() => setToolMode('pan')}
          className={`p-2 rounded-lg text-xs font-bold transition-all ${
            toolMode === 'pan' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
          }`}
          title="Canvas Verschieben / Pan-Modus (H oder Leertaste)"
        >
          <Move className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-5 bg-[#242936] mx-1" />

        <button
          onClick={handleZoomIn}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#242936] transition-all"
          title="Vergrößern (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetZoom}
          className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold text-gray-300 hover:text-white hover:bg-[#242936] transition-all"
          title="Zoom auf 100% zurücksetzen"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#242936] transition-all"
          title="Verkleinern (-)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-5 bg-[#242936] mx-1" />

        <button
          onClick={handleFitAll}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#242936] transition-all"
          title="Alle Tracks zentrieren (Fit All)"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* ================= TRANSFORMED CANVAS CONTENT ================= */}
      <div
        className="absolute inset-0 origin-top-left pointer-events-auto"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          width: '10000px',
          height: '10000px',
        }}
      >
        {/* SVG LAYER FOR BEZIER TRANSITION EDGES */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
          <defs>
            <linearGradient id="edgeGradDefault" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06B6D4" />
              <stop offset="100%" stopColor="#A855F7" />
            </linearGradient>
            <linearGradient id="edgeGradActive" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22C55E" />
              <stop offset="100%" stopColor="#A855F7" />
            </linearGradient>
            <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Render Saved Transitions */}
          {localTransitions.map(tr => {
            const srcTrack = tracks.find(t => t.id === tr.sourceTrackId);
            const tgtTrack = tracks.find(t => t.id === tr.targetTrackId);
            if (!srcTrack || !tgtTrack) return null;

            const srcSlots = getTrackSlots(srcTrack);
            const tgtSlots = getTrackSlots(tgtTrack);

            const srcSlotIdx = Math.max(0, srcSlots.findIndex(s => s.id === tr.sourceSlotId));
            const tgtSlotIdx = Math.max(0, tgtSlots.findIndex(s => s.id === tr.targetSlotId));

            const start = getNodePortCoord(tr.sourceTrackId, srcSlotIdx, true);
            const end = getNodePortCoord(tr.targetTrackId, tgtSlotIdx, false);

            const dx = Math.abs(end.x - start.x) * 0.5;
            const cp1X = start.x + dx;
            const cp2X = end.x - dx;
            const pathD = `M ${start.x} ${start.y} C ${cp1X} ${start.y}, ${cp2X} ${end.y}, ${end.x} ${end.y}`;

            const isActive = tr.id === activeTransitionId;
            const presetMeta = PRESET_META[tr.preset] || PRESET_META['bass-swap'];

            return (
              <g key={tr.id} className="cursor-pointer pointer-events-auto">
                {/* Fat invisible hit area for easy clicking */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="24"
                  onClick={() => {
                    setEditingTransition(tr);
                    if (onSelectTransition) onSelectTransition(tr);
                  }}
                />

                {/* Visible Glow Line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={isActive ? '#A855F7' : presetMeta.color}
                  strokeWidth={isActive ? 4 : 2.5}
                  strokeDasharray={isActive ? '6 4' : undefined}
                  className={isActive ? 'animate-pulse' : 'opacity-80 hover:opacity-100 transition-opacity'}
                  filter={isActive ? 'url(#neonGlow)' : undefined}
                  onClick={() => {
                    setEditingTransition(tr);
                    if (onSelectTransition) onSelectTransition(tr);
                  }}
                />
              </g>
            );
          })}

          {/* Active Drawing Edge */}
          {drawingPort && (
            <path
              d={`M ${drawingPort.startPos.x} ${drawingPort.startPos.y} C ${drawingPort.startPos.x + 80} ${drawingPort.startPos.y}, ${currentCanvasMouse.x - 80} ${currentCanvasMouse.y}, ${currentCanvasMouse.x} ${currentCanvasMouse.y}`}
              fill="none"
              stroke="#A855F7"
              strokeWidth="3"
              strokeDasharray="6 4"
              className="opacity-90 animate-pulse"
              filter="url(#neonGlow)"
            />
          )}
        </svg>

        {/* TRANSITION BADGES PLACED AT THE CENTER OF EACH CURVE */}
        {localTransitions.map(tr => {
          const srcTrack = tracks.find(t => t.id === tr.sourceTrackId);
          const tgtTrack = tracks.find(t => t.id === tr.targetTrackId);
          if (!srcTrack || !tgtTrack) return null;

          const srcSlots = getTrackSlots(srcTrack);
          const tgtSlots = getTrackSlots(tgtTrack);
          const srcSlotIdx = Math.max(0, srcSlots.findIndex(s => s.id === tr.sourceSlotId));
          const tgtSlotIdx = Math.max(0, tgtSlots.findIndex(s => s.id === tr.targetSlotId));

          const start = getNodePortCoord(tr.sourceTrackId, srcSlotIdx, true);
          const end = getNodePortCoord(tr.targetTrackId, tgtSlotIdx, false);

          const midX = (start.x + end.x) / 2;
          const midY = (start.y + end.y) / 2;

          const isActive = tr.id === activeTransitionId;
          const presetMeta = PRESET_META[tr.preset] || PRESET_META['bass-swap'];
          const Icon = presetMeta.icon;

          return (
            <div
              key={`badge-${tr.id}`}
              className="absolute z-30 -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
              style={{ left: midX, top: midY }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingTransition(tr);
                  if (onSelectTransition) onSelectTransition(tr);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold font-mono tracking-wider transition-all shadow-xl backdrop-blur-md hover:scale-110 active:scale-95 ${
                  isActive 
                    ? 'bg-purple-900/90 border-purple-400 text-white ring-2 ring-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.7)]' 
                    : 'bg-[#161920]/95 border-[#2E3445] text-gray-200 hover:border-purple-400 hover:text-white'
                }`}
              >
                <Icon className="w-3 h-3" style={{ color: presetMeta.color }} />
                <span>{presetMeta.name}</span>
                <span className="px-1 py-0.2 bg-black/40 rounded text-[9px] text-gray-300">
                  {tr.durationBeats}B
                </span>
              </button>
            </div>
          );
        })}

        {/* ================= TRACK NODES WITH SLOTS ================= */}
        {tracks.map(track => {
          const pos = positions[track.id] || { x: 80, y: 80 };
          const isSelected = selectedNodeId === track.id;
          const slots = getTrackSlots(track);

          return (
            <div
              key={track.id}
              className={`absolute flex flex-col w-[230px] bg-[#161920] border rounded-2xl shadow-2xl z-20 transition-shadow ${
                isSelected 
                  ? 'border-purple-500 shadow-[0_0_24px_rgba(168,85,247,0.35)]' 
                  : 'border-[#242936] hover:border-gray-600'
              }`}
              style={{ left: pos.x, top: pos.y }}
            >
              {/* Node Header (Draggable) */}
              <div
                className="p-3 border-b border-[#242936] bg-[#0F1116] rounded-t-2xl cursor-grab active:cursor-grabbing select-none flex items-center justify-between gap-2"
                onPointerDown={(e) => handleNodePointerDown(e, track.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {track.coverArt ? (
                    <img src={track.coverArt} className="w-7 h-7 rounded object-cover border border-[#242936] flex-shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded bg-[#161920] border border-[#242936] flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-gray-400">DJ</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-white">{track.title}</div>
                    <div className="truncate text-[10px] text-gray-400">{track.artist}</div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    {track.bpm}
                  </span>
                  <span className="text-[9px] font-mono text-purple-400">{track.key}</span>
                </div>
              </div>

              {/* Slots List with Left/Right Connection Ports */}
              <div className="p-2 flex flex-col gap-1.5">
                <div className="flex justify-between text-[9px] font-mono uppercase tracking-wider text-gray-500 px-1">
                  <span>IN (Target)</span>
                  <span>CUE & LOOP SLOTS</span>
                  <span>OUT (Mix)</span>
                </div>

                {slots.map((slot, sIdx) => {
                  return (
                    <div
                      key={slot.id}
                      className="relative h-9 bg-[#0D0E12] border border-[#242936] rounded-lg flex items-center justify-between px-2.5 group hover:border-purple-500/80 transition-colors"
                    >
                      {/* Left Port (Input Connector) */}
                      <div
                        className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 bg-[#161920] border-2 border-[#242936] rounded-full cursor-crosshair hover:bg-emerald-500 hover:border-emerald-400 transition-all flex items-center justify-center group-hover:scale-110 z-30"
                        title={`Ziel: ${slot.name} anbinden`}
                        onPointerUp={(e) => handlePortPointerUp(e, track, slot)}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      </div>

                      {/* Center Info */}
                      <div className="flex items-center gap-1.5 min-w-0 pl-1">
                        <span 
                          className="w-4 h-4 rounded text-[9px] font-black flex items-center justify-center text-white flex-shrink-0"
                          style={{ backgroundColor: slot.color }}
                        >
                          {slot.slotNumber}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold text-white truncate max-w-[110px]">
                            {slot.name}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-mono text-gray-400">{formatSeconds(slot.timeSec)}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlaySegment(track, slot.timeSec);
                          }}
                          className="w-5 h-5 rounded-full bg-[#1F232E] hover:bg-purple-600 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Slot anspielen"
                        >
                          <Play className="w-2.5 h-2.5 ml-0.5" />
                        </button>
                      </div>

                      {/* Right Port (Output Connector) */}
                      <div
                        className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 bg-[#161920] border-2 border-[#242936] rounded-full cursor-crosshair hover:bg-purple-500 hover:border-purple-400 transition-all flex items-center justify-center group-hover:scale-110 z-30"
                        title={`Start: Übergang von ${slot.name} ziehen`}
                        onPointerDown={(e) => handlePortPointerDown(e, track, slot, true)}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Node Footer */}
              <div className="p-2 border-t border-[#242936] bg-[#0F1116]/50 rounded-b-2xl flex items-center justify-between">
                <button
                  onClick={() => onAnalyze(track)}
                  className="text-[10px] text-gray-400 hover:text-white font-mono hover:underline flex items-center gap-1"
                >
                  <span>Studio & Cues öffnen</span>
                </button>
                <span className="text-[9px] font-mono text-gray-500">
                  {formatSeconds(track.duration || 180)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      </>
      )}

      {/* ================= MIXMEISTER TRANSITION OVERLAP STUDIO MODAL ================= */}
      {editingTransition && (
        <TransitionOverlapStudio
          transition={editingTransition}
          sourceTrack={tracks.find(t => t.id === editingTransition.sourceTrackId)}
          targetTrack={tracks.find(t => t.id === editingTransition.targetTrackId)}
          onSave={(updated) => {
            const next = localTransitions.map(t => t.id === updated.id ? updated : t);
            updateTransitions(next);
            setEditingTransition(null);
            if (onSelectTransition) onSelectTransition(updated);
          }}
          onClose={() => setEditingTransition(null)}
          onDelete={(id) => {
            const next = localTransitions.filter(t => t.id !== id);
            updateTransitions(next);
            setEditingTransition(null);
          }}
        />
      )}

    </div>
  );
}
