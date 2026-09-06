import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { 
  Grid3X3, 
  ArrowLeftRight, 
  Search, 
  ListPlus, 
  Play, 
  Disc, 
  Activity, 
  Zap, 
  Music, 
  Sparkles, 
  MousePointer, 
  X,
  Layers,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Hand,
  RotateCcw
} from 'lucide-react';
import { Track } from '../App';
import { getCamelotColor, getEnergyColor } from '../lib/djMixerLogic';

export type MapperAxis = 'key' | 'bpm' | 'energy' | 'mood' | 'genre';
export type ColorMode = 'key' | 'energy' | 'genre';
export type ToolMode = 'lasso' | 'pan';

interface TrackMapperProps {
  tracks: Track[];
  onPlay: (track: Track) => void;
  onAddMultiple: (tracks: Track[]) => void;
  currentPlayingTrack?: Track | null;
  isPlaying?: boolean;
}

interface AxisOptionMeta {
  id: MapperAxis;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const AXIS_OPTIONS: AxisOptionMeta[] = [
  { 
    id: 'bpm', 
    label: 'BPM (Tempo)', 
    shortLabel: 'BPM', 
    icon: Activity, 
    description: 'Sortiert nach Geschwindigkeit (Beats per Minute)' 
  },
  { 
    id: 'energy', 
    label: 'Energy (1 - 10)', 
    shortLabel: 'Energy', 
    icon: Zap, 
    description: 'Intensität von Chilled (1) bis Peaktime (10)' 
  },
  { 
    id: 'key', 
    label: 'Key (Camelot Tonart)', 
    shortLabel: 'Key', 
    icon: Disc, 
    description: 'Harmonische Reihenfolge nach dem Camelot-Rad (1A - 12B)' 
  },
  { 
    id: 'genre', 
    label: 'Genre (Stilrichtung)', 
    shortLabel: 'Genre', 
    icon: Music, 
    description: 'Musikalische Gruppierung nach Genres' 
  },
  { 
    id: 'mood', 
    label: 'Mood (Stimmung)', 
    shortLabel: 'Mood', 
    icon: Sparkles, 
    description: 'Atmosphärische Stimmung der Tracks' 
  },
];

const GENRE_PALETTE = [
  '#06B6D4', '#A855F7', '#10B981', '#F59E0B', '#EC4899', 
  '#3B82F6', '#F43F5E', '#84CC16', '#8B5CF6', '#14B8A6'
];

/**
 * Deterministic micro-jitter to prevent dots from stacking perfectly on top of each other
 */
function getHashJitter(id: string, seed: number, maxOffset: number): number {
  let hash = seed * 31;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  const norm = ((Math.abs(hash) % 1000) / 1000); // 0 to 1
  return (norm - 0.5) * 2 * maxOffset; // -maxOffset to +maxOffset
}

/**
 * Parse Camelot Key to numeric 1..12 and minor/major offset
 */
function parseCamelotPosition(key?: string): { number: number; isMajor: boolean } {
  if (!key) return { number: 8, isMajor: false };
  const match = key.trim().match(/^(\d+)\s*([ABM]?)/i);
  if (!match) return { number: 8, isMajor: false };
  const num = parseInt(match[1], 10);
  const clampedNum = Math.max(1, Math.min(12, isNaN(num) ? 8 : num));
  const letter = (match[2] || 'A').toUpperCase();
  const isMajor = letter === 'B';
  return { number: clampedNum, isMajor };
}

export default function TrackMapper({
  tracks,
  onPlay,
  onAddMultiple,
  currentPlayingTrack,
  isPlaying = false,
}: TrackMapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotAreaRef = useRef<HTMLDivElement>(null);

  // Axis States (Default: X = BPM, Y = Energy)
  const [xAxis, setXAxis] = useState<MapperAxis>('bpm');
  const [yAxis, setYAxis] = useState<MapperAxis>('energy');

  // Color Mode (Default: Camelot Key Colors)
  const [colorMode, setColorMode] = useState<ColorMode>('key');

  // Zoom & Pan Engine States
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<ToolMode>('lasso');
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number }>({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });
  const isSpacePressedRef = useRef(false);

  // Measure plot area size in pixels for accurate tick/tooltip tracking
  const [plotSize, setPlotSize] = useState<{ width: number; height: number }>({ width: 800, height: 500 });

  useEffect(() => {
    if (!plotAreaRef.current) return;
    const updateSize = () => {
      if (plotAreaRef.current) {
        const rect = plotAreaRef.current.getBoundingClientRect();
        setPlotSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(plotAreaRef.current);
    return () => ro.disconnect();
  }, []);

  // Search Filter within Mapper
  const [searchQuery, setSearchQuery] = useState('');

  // Lasso State
  const [isDrawing, setIsDrawing] = useState(false);
  const isDrawingRef = useRef(false);
  const [lassoPoints, setLassoPoints] = useState<{ x: number; y: number }[]>([]);
  const lassoPointsRef = useRef<{ x: number; y: number }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredTrack, setHoveredTrack] = useState<Track | null>(null);

  // Keep fresh refs to avoid stale closure issues in event handlers
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

  // Dropdown menus for axes
  const [isXDropdownOpen, setIsXDropdownOpen] = useState(false);
  const [isYDropdownOpen, setIsYDropdownOpen] = useState(false);

  // Handle X-Axis selection with mutual exclusivity
  const handleSelectX = useCallback((newX: MapperAxis) => {
    if (newX === yAxis) {
      // Swap axes so they never have the same option
      setYAxis(xAxis);
    }
    setXAxis(newX);
    setIsXDropdownOpen(false);
  }, [xAxis, yAxis]);

  // Handle Y-Axis selection with mutual exclusivity
  const handleSelectY = useCallback((newY: MapperAxis) => {
    if (newY === xAxis) {
      // Swap axes so they never have the same option
      setXAxis(yAxis);
    }
    setYAxis(newY);
    setIsYDropdownOpen(false);
  }, [xAxis, yAxis]);

  // Swap Axes directly
  const handleSwapAxes = () => {
    const oldX = xAxis;
    setXAxis(yAxis);
    setYAxis(oldX);
  };

  // Zoom Helpers
  const handleZoomIn = () => {
    const centerX = plotSize.width / 2;
    const centerY = plotSize.height / 2;
    const nextZoom = Math.min(5.0, parseFloat((zoom * 1.3).toFixed(2)));
    const nextPanX = centerX - ((centerX - pan.x) * (nextZoom / zoom));
    const nextPanY = centerY - ((centerY - pan.y) * (nextZoom / zoom));
    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
  };

  const handleZoomOut = () => {
    const centerX = plotSize.width / 2;
    const centerY = plotSize.height / 2;
    const nextZoom = Math.max(0.8, parseFloat((zoom / 1.3).toFixed(2)));
    const nextPanX = centerX - ((centerX - pan.x) * (nextZoom / zoom));
    const nextPanY = centerY - ((centerY - pan.y) * (nextZoom / zoom));
    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
  };

  const handleResetZoom = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  // Mouse Wheel Zoom centered on cursor
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!plotAreaRef.current) return;
    const rect = plotAreaRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.15 : 0.87;
    const nextZoom = Math.max(0.8, Math.min(5.0, parseFloat((zoom * factor).toFixed(2))));
    if (nextZoom === zoom) return;

    const nextPanX = mouseX - ((mouseX - pan.x) * (nextZoom / zoom));
    const nextPanY = mouseY - ((mouseY - pan.y) * (nextZoom / zoom));

    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
  };

  // Extract distinct Genres from tracks
  const distinctGenres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tracks) {
      const g = (t.genre || '').trim();
      if (g) counts.set(g, (counts.get(g) || 0) + 1);
    }
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);
    if (sorted.length === 0) {
      return ['Techno', 'Melodic Techno', 'House', 'Deep House', 'Trance', 'Psy Trance', 'Andere'];
    }
    return sorted.slice(0, 8); // Top 8 genres
  }, [tracks]);

  // Extract distinct Moods from tracks
  const distinctMoods = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tracks) {
      const m = (t.mood || '').trim();
      if (m) counts.set(m, (counts.get(m) || 0) + 1);
    }
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);
    if (sorted.length === 0) {
      return ['Treibend', 'Euphorisch', 'Hypnotisch', 'Dunkel', 'Melancholisch', 'Entspannt'];
    }
    return sorted.slice(0, 8); // Top 8 moods
  }, [tracks]);

  // Calculate BPM domain
  const bpmDomain = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const t of tracks) {
      if (t.bpm && !isNaN(t.bpm)) {
        if (t.bpm < min) min = t.bpm;
        if (t.bpm > max) max = t.bpm;
      }
    }
    if (min === Infinity || max === -Infinity) {
      return { min: 100, max: 150 };
    }
    const minClamped = Math.max(60, Math.floor(min / 5) * 5);
    const maxClamped = Math.min(200, Math.ceil(max / 5) * 5);
    return {
      min: minClamped,
      max: maxClamped <= minClamped ? minClamped + 30 : maxClamped
    };
  }, [tracks]);

  // Map value to 0-100% position on an axis
  const getAxisPercent = useCallback((track: Track, axis: MapperAxis, isY: boolean): number => {
    let pct = 50;

    switch (axis) {
      case 'bpm': {
        const bpm = track.bpm || 120;
        const norm = (bpm - bpmDomain.min) / (bpmDomain.max - bpmDomain.min);
        pct = Math.max(0, Math.min(1, norm)) * 100;
        // Continuous axis has tiny jitter of ±0.4%
        pct += getHashJitter(track.id, isY ? 17 : 29, 0.4);
        break;
      }
      case 'energy': {
        const energy = track.energy || 5;
        // Energy 1 to 10
        const norm = (energy - 1) / 9;
        pct = Math.max(0, Math.min(1, norm)) * 100;
        // Discrete axis jitter ±2.2% so tracks in same energy level don't overlap
        pct += getHashJitter(track.id, isY ? 43 : 67, 2.2);
        break;
      }
      case 'key': {
        // Camelot 1 to 12
        const { number, isMajor } = parseCamelotPosition(track.key);
        const norm = (number - 1) / 11;
        pct = norm * 100;
        // Minor on one side (-1.5%), Major on the other (+1.5%)
        pct += (isMajor ? 1.5 : -1.5);
        // Discrete jitter ±1.2%
        pct += getHashJitter(track.id, isY ? 71 : 89, 1.2);
        break;
      }
      case 'genre': {
        const g = (track.genre || '').trim();
        let idx = distinctGenres.indexOf(g);
        if (idx === -1) idx = distinctGenres.length - 1;
        const norm = (idx + 0.5) / distinctGenres.length;
        pct = norm * 100;
        // Discrete lane jitter ±3.2%
        pct += getHashJitter(track.id, isY ? 101 : 113, 3.2);
        break;
      }
      case 'mood': {
        const m = (track.mood || '').trim();
        let idx = distinctMoods.indexOf(m);
        if (idx === -1) idx = distinctMoods.length - 1;
        const norm = (idx + 0.5) / distinctMoods.length;
        pct = norm * 100;
        // Discrete lane jitter ±3.2%
        pct += getHashJitter(track.id, isY ? 131 : 149, 3.2);
        break;
      }
    }

    // Clamp within 2% to 98%
    pct = Math.max(2, Math.min(98, pct));

    // For Y-Axis: Invert so higher values (or first buckets) are on top
    return isY ? (100 - pct) : pct;
  }, [bpmDomain, distinctGenres, distinctMoods]);

  // Compute 2D position for each track in 0-100% data space
  const trackPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const t of tracks) {
      const x = getAxisPercent(t, xAxis, false);
      const y = getAxisPercent(t, yAxis, true);
      map.set(t.id, { x, y });
    }
    return map;
  }, [tracks, xAxis, yAxis, getAxisPercent]);

  // Get color for a track based on active ColorMode
  const getTrackDotColor = useCallback((track: Track): string => {
    if (colorMode === 'key') {
      return getCamelotColor(track.key);
    }
    if (colorMode === 'energy') {
      return getEnergyColor(track.energy);
    }
    if (colorMode === 'genre') {
      const g = (track.genre || '').trim();
      const idx = distinctGenres.indexOf(g);
      return idx >= 0 ? GENRE_PALETTE[idx % GENRE_PALETTE.length] : '#8B5CF6';
    }
    return '#06B6D4';
  }, [colorMode, distinctGenres]);

  // Search filter matching
  const matchingTrackIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    const set = new Set<string>();
    for (const t of tracks) {
      if (
        t.title.toLowerCase().includes(q) ||
        (t.artist || '').toLowerCase().includes(q) ||
        (t.key || '').toLowerCase().includes(q) ||
        (t.genre || '').toLowerCase().includes(q) ||
        (t.mood || '').toLowerCase().includes(q) ||
        t.bpm?.toString().includes(q)
      ) {
        set.add(t.id);
      }
    }
    return set;
  }, [tracks, searchQuery]);

  // Ray-Casting Polygon Intersection
  const isPointInPolygon = (point: { x: number; y: number }, polygon: { x: number; y: number }[]) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Convert mouse event to percentage relative to the untransformed plot coordinate space (0-100%)
  const getPlotPercentCoords = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!plotAreaRef.current) return { x: 0, y: 0 };
    const rect = plotAreaRef.current.getBoundingClientRect();
    const curPan = panRef.current;
    const curZoom = zoomRef.current;
    // Invert pan and zoom to accurately obtain coordinates in the untransformed 0..100% data space
    const localX = (e.clientX - rect.left - curPan.x) / curZoom;
    const localY = (e.clientY - rect.top - curPan.y) / curZoom;
    const x = (localX / rect.width) * 100;
    const y = (localY / rect.height) * 100;
    return { x, y };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Check if panning action: Middle Click, Right Click, Spacebar pressed, or Tool is Pan
    const isPanAction = activeToolRef.current === 'pan' || e.button === 1 || e.button === 2 || isSpacePressedRef.current;

    if (isPanAction) {
      isPanningRef.current = true;
      setIsPanning(true);
      panStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
      return;
    }

    // Otherwise, it's lasso selection (Left click in lasso mode)
    if (e.button === 0) {
      isDrawingRef.current = true;
      setIsDrawing(true);
      const startPoint = getPlotPercentCoords(e);
      lassoPointsRef.current = [startPoint];
      setLassoPoints([startPoint]);
    }
  };

  // Global window listeners for butter-smooth dragging & lasso even beyond canvas bounds
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isPanningRef.current) {
        const dx = e.clientX - panStartRef.current.mouseX;
        const dy = e.clientY - panStartRef.current.mouseY;
        setPan({
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy,
        });
        return;
      }

      if (isDrawingRef.current) {
        const pt = getPlotPercentCoords(e);
        lassoPointsRef.current.push(pt);
        const poly = [...lassoPointsRef.current];
        setLassoPoints(poly);

        if (poly.length > 2) {
          const selected = new Set<string>();
          for (const t of tracks) {
            const pos = trackPositions.get(t.id);
            if (pos && isPointInPolygon(pos, poly)) {
              selected.add(t.id);
            }
          }
          setSelectedIds(selected);
        }
      }
    };

    const handleGlobalMouseUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanning(false);
        return;
      }

      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        setIsDrawing(false);
        const pts = lassoPointsRef.current;
        if (pts.length > 3) {
          const selected = tracks.filter(t => {
            const pos = trackPositions.get(t.id);
            return pos && isPointInPolygon(pos, pts);
          });
          if (selected.length > 0) {
            setSelectedIds(new Set(selected.map(t => t.id)));
            return;
          }
        }
        setSelectedIds(new Set());
        lassoPointsRef.current = [];
        setLassoPoints([]);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [tracks, trackPositions, getPlotPercentCoords]);

  // Add selected tracks to playlist
  const handleAddSelection = () => {
    const selectedTracks = tracks.filter(t => selectedIds.has(t.id));
    if (selectedTracks.length > 0) {
      onAddMultiple(selectedTracks);
      setSelectedIds(new Set());
      setLassoPoints([]);
    }
  };

  // Play first selected track
  const handlePlayFirstSelected = () => {
    const first = tracks.find(t => selectedIds.has(t.id));
    if (first) {
      onPlay(first);
    }
  };

  // Keyboard shortcut Space for pan and Esc to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        isSpacePressedRef.current = true;
      }
      if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setLassoPoints([]);
        setIsXDropdownOpen(false);
        setIsYDropdownOpen(false);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Generate Ticks for an Axis
  const getAxisTicks = useCallback((axis: MapperAxis, isY: boolean) => {
    switch (axis) {
      case 'bpm': {
        const step = Math.max(5, Math.round((bpmDomain.max - bpmDomain.min) / 7 / 5) * 5);
        const ticks: { val: string; pct: number; sub?: string }[] = [];
        for (let b = bpmDomain.min; b <= bpmDomain.max; b += step) {
          const norm = (b - bpmDomain.min) / (bpmDomain.max - bpmDomain.min);
          const pct = isY ? (100 - norm * 100) : (norm * 100);
          ticks.push({ val: `${b}`, pct, sub: 'BPM' });
        }
        return ticks;
      }
      case 'energy': {
        const ticks: { val: string; pct: number; sub?: string; color?: string }[] = [];
        for (let e = 1; e <= 10; e++) {
          const norm = (e - 1) / 9;
          const pct = isY ? (100 - norm * 100) : (norm * 100);
          ticks.push({ 
            val: `E${e}`, 
            pct, 
            sub: e === 1 ? 'Chilled' : e === 10 ? 'Peak' : undefined,
            color: getEnergyColor(e) 
          });
        }
        return ticks;
      }
      case 'key': {
        const ticks: { val: string; pct: number; color?: string }[] = [];
        for (let k = 1; k <= 12; k++) {
          const norm = (k - 1) / 11;
          const pct = isY ? (100 - norm * 100) : (norm * 100);
          ticks.push({ 
            val: `${k}A/B`, 
            pct, 
            color: getCamelotColor(`${k}A`) 
          });
        }
        return ticks;
      }
      case 'genre': {
        return distinctGenres.map((g, idx) => {
          const norm = (idx + 0.5) / distinctGenres.length;
          const pct = isY ? (100 - norm * 100) : (norm * 100);
          return {
            val: g,
            pct,
            color: GENRE_PALETTE[idx % GENRE_PALETTE.length]
          };
        });
      }
      case 'mood': {
        return distinctMoods.map((m, idx) => {
          const norm = (idx + 0.5) / distinctMoods.length;
          const pct = isY ? (100 - norm * 100) : (norm * 100);
          return {
            val: m,
            pct,
            color: '#EC4899'
          };
        });
      }
    }
  }, [bpmDomain, distinctGenres, distinctMoods]);

  const xTicks = useMemo(() => getAxisTicks(xAxis, false), [getAxisTicks, xAxis]);
  const yTicks = useMemo(() => getAxisTicks(yAxis, true), [getAxisTicks, yAxis]);

  const activeXMeta = AXIS_OPTIONS.find(o => o.id === xAxis)!;
  const activeYMeta = AXIS_OPTIONS.find(o => o.id === yAxis)!;

  const XIcon = activeXMeta.icon;
  const YIcon = activeYMeta.icon;

  return (
    <div 
      className="absolute inset-0 flex flex-col bg-[#0A0C10] overflow-hidden select-none"
      ref={containerRef}
    >
      {/* ================= TOP TOOLBAR ================= */}
      <div className="h-14 px-6 border-b border-[#242936] bg-[#0F1116] flex items-center justify-between shrink-0 z-30 shadow-md">
        
        {/* Left: Title, Track Counter & Search */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Grid3X3 className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">Track Mapper Matrix</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#161920] border border-[#242936] text-gray-400">
                  {tracks.length} Tracks
                </span>
              </div>
            </div>
          </div>

          {/* Quick Search / Highlight Field */}
          <div className="relative ml-2 hidden md:block">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Tracks im Raster hervorheben..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-7 py-1 rounded-lg bg-[#161920] border border-[#242936] text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/60 w-44 transition-all font-mono"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Center: Interactive X & Y Axis Selectors with Swap */}
        <div className="flex items-center gap-2 bg-[#161920] p-1 rounded-xl border border-[#242936] shadow-sm">
          
          {/* X-Axis Selector */}
          <div className="relative">
            <button
              id="btn-mapper-x-axis"
              onClick={() => {
                setIsXDropdownOpen(!isXDropdownOpen);
                setIsYDropdownOpen(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0D0E12] border border-[#242936] hover:border-cyan-500/50 text-xs font-mono font-bold text-white transition-all shadow-sm"
              title="X-Achse konfigurieren"
            >
              <span className="text-[10px] text-gray-500 uppercase">X:</span>
              <XIcon className="w-3.5 h-3.5 text-cyan-400" />
              <span>{activeXMeta.shortLabel}</span>
              <ChevronDown className="w-3 h-3 text-gray-500 ml-0.5" />
            </button>

            {isXDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-56 bg-[#161920] border border-[#242936] rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-2 py-1 text-[10px] font-mono text-gray-400 uppercase font-bold border-b border-[#242936] mb-1">
                  X-Achse wählen (Horizontal)
                </div>
                {AXIS_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const isCurrent = opt.id === xAxis;
                  const isOpposite = opt.id === yAxis;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleSelectX(opt.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono text-left transition-all ${
                        isCurrent 
                          ? 'bg-cyan-500/20 text-cyan-300 font-bold' 
                          : 'hover:bg-[#242936] text-gray-300 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`w-3.5 h-3.5 ${isCurrent ? 'text-cyan-400' : 'text-gray-400'}`} />
                        <span>{opt.label}</span>
                      </div>
                      {isOpposite && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Tauscht Y
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Swap Axes Button */}
          <button
            id="btn-mapper-swap-axes"
            onClick={handleSwapAxes}
            className="p-1.5 rounded-lg bg-[#0D0E12] border border-[#242936] text-gray-400 hover:text-white hover:border-cyan-500/50 hover:bg-cyan-500/10 transition-all active:scale-95"
            title="X- und Y-Achsen tauschen (⇄)"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
          </button>

          {/* Y-Axis Selector */}
          <div className="relative">
            <button
              id="btn-mapper-y-axis"
              onClick={() => {
                setIsYDropdownOpen(!isYDropdownOpen);
                setIsXDropdownOpen(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0D0E12] border border-[#242936] hover:border-emerald-500/50 text-xs font-mono font-bold text-white transition-all shadow-sm"
              title="Y-Achse konfigurieren"
            >
              <span className="text-[10px] text-gray-500 uppercase">Y:</span>
              <YIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span>{activeYMeta.shortLabel}</span>
              <ChevronDown className="w-3 h-3 text-gray-500 ml-0.5" />
            </button>

            {isYDropdownOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-56 bg-[#161920] border border-[#242936] rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-2 py-1 text-[10px] font-mono text-gray-400 uppercase font-bold border-b border-[#242936] mb-1">
                  Y-Achse wählen (Vertikal)
                </div>
                {AXIS_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const isCurrent = opt.id === yAxis;
                  const isOpposite = opt.id === xAxis;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleSelectY(opt.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono text-left transition-all ${
                        isCurrent 
                          ? 'bg-emerald-500/20 text-emerald-300 font-bold' 
                          : 'hover:bg-[#242936] text-gray-300 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`w-3.5 h-3.5 ${isCurrent ? 'text-emerald-400' : 'text-gray-400'}`} />
                        <span>{opt.label}</span>
                      </div>
                      {isOpposite && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Tauscht X
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Right: Tool Mode, Zoom Controls & Color Mode */}
        <div className="flex items-center gap-2.5">
          
          {/* Tool Mode: Lasso vs Pan */}
          <div className="flex items-center bg-[#161920] p-1 rounded-xl border border-[#242936] gap-1">
            <button
              id="btn-mapper-tool-lasso"
              onClick={() => setActiveTool('lasso')}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                activeTool === 'lasso' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
              title="Lasso-Modus (Maus ziehen um Tracks zur Playlist einzukreisen)"
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Lasso</span>
            </button>
            <button
              id="btn-mapper-tool-pan"
              onClick={() => setActiveTool('pan')}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                activeTool === 'pan' ? 'bg-cyan-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
              title="Pan-Modus (Klicken & Ziehen zum Verschieben - alternativ Rechtsklick oder Leertaste)"
            >
              <Hand className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Pan</span>
            </button>
          </div>

          {/* Zoom Engine Controls */}
          <div className="flex items-center bg-[#161920] p-1 rounded-xl border border-[#242936] gap-1">
            <button
              id="btn-mapper-zoom-out"
              onClick={handleZoomOut}
              disabled={zoom <= 0.8}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#242936] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Herauszoomen (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <button
              id="btn-mapper-zoom-reset"
              onClick={handleResetZoom}
              className="px-2 py-0.5 rounded text-[11px] font-mono font-bold text-cyan-300 hover:text-white hover:bg-cyan-500/20 transition-all"
              title="Zoom & Verschiebung zurücksetzen (100%)"
            >
              {Math.round(zoom * 100)}%
            </button>

            <button
              id="btn-mapper-zoom-in"
              onClick={handleZoomIn}
              disabled={zoom >= 5.0}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#242936] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Heranzoomen (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Color Mode Selector */}
          <div className="flex items-center bg-[#161920] p-1 rounded-xl border border-[#242936] gap-1">
            <span className="text-[10px] font-mono text-gray-500 px-1 hidden 2xl:inline">FARBE:</span>
            <button
              onClick={() => setColorMode('key')}
              className={`px-2 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1 ${
                colorMode === 'key' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
              title="Punkte nach Camelot-Tonart einfärben"
            >
              <Disc className="w-3 h-3 text-cyan-300" />
              <span>Key</span>
            </button>
            <button
              onClick={() => setColorMode('energy')}
              className={`px-2 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1 ${
                colorMode === 'energy' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
              title="Punkte nach Energy-Level (1-10) einfärben"
            >
              <Zap className="w-3 h-3 text-amber-300" />
              <span>Energy</span>
            </button>
            <button
              onClick={() => setColorMode('genre')}
              className={`px-2 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1 ${
                colorMode === 'genre' ? 'bg-cyan-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
              title="Punkte nach Musikgenre einfärben"
            >
              <Layers className="w-3 h-3 text-emerald-300" />
              <span>Genre</span>
            </button>
          </div>

        </div>

      </div>

      {/* ================= MAIN 2D RASTER WORKSPACE ================= */}
      <div 
        className="flex-1 relative overflow-hidden bg-[#0A0C10] select-none pb-20"
      >
        {/* Left Y-Axis Header Label */}
        <div className="absolute left-2 top-4 z-20 pointer-events-none flex items-center gap-1.5 font-mono text-[10px] text-emerald-400 font-bold bg-[#161920]/80 px-2 py-0.5 rounded border border-emerald-500/30 backdrop-blur-sm shadow-md">
          <YIcon className="w-3 h-3 text-emerald-400" />
          <span>Y: {activeYMeta.label}</span>
        </div>

        {/* Bottom X-Axis Header Label */}
        <div className="absolute right-4 bottom-24 z-20 pointer-events-none flex items-center gap-1.5 font-mono text-[10px] text-cyan-400 font-bold bg-[#161920]/80 px-2 py-0.5 rounded border border-cyan-500/30 backdrop-blur-sm shadow-md">
          <XIcon className="w-3 h-3 text-cyan-400" />
          <span>X: {activeXMeta.label}</span>
        </div>

        {/* Inner Plot Area: Clipped Viewport with Zoom and Pan Handling */}
        <div 
          ref={plotAreaRef}
          id="mapper-plot-viewport"
          onMouseDown={handleMouseDown}
          onWheel={handleWheel}
          onContextMenu={(e) => {
            if (isPanning || activeTool === 'pan') e.preventDefault();
          }}
          className={`absolute left-24 right-8 top-10 bottom-28 overflow-hidden ${
            isPanning ? 'cursor-grabbing' : activeTool === 'pan' ? 'cursor-grab' : 'cursor-crosshair'
          }`}
        >
          {/* Zoomable & Pannable Matrix Canvas Layer */}
          <div
            className="absolute inset-0 origin-top-left will-change-transform transition-transform duration-75"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              width: '100%',
              height: '100%',
            }}
          >
            {/* Background Radial Matrix Dots Grid */}
            <div 
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage: 'radial-gradient(circle at 1px 1px, #3B4254 1px, transparent 0)',
                backgroundSize: '24px 24px',
              }}
            />

            {/* SVG GRID LINES & LASSO POLYGON */}
            <svg 
              viewBox="0 0 100 100" 
              preserveAspectRatio="none" 
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              {/* Horizontal Grid Lines (Y-Axis) */}
              {yTicks.map((tick, idx) => (
                <line 
                  key={`yline-${idx}`} 
                  x1="0" 
                  y1={tick.pct} 
                  x2="100" 
                  y2={tick.pct} 
                  stroke="#1E2330" 
                  strokeWidth={0.15 / zoom} 
                  strokeDasharray="2 2"
                  vectorEffect="non-scaling-stroke" 
                />
              ))}

              {/* Vertical Grid Lines (X-Axis) */}
              {xTicks.map((tick, idx) => (
                <line 
                  key={`xline-${idx}`} 
                  x1={tick.pct} 
                  y1="0" 
                  x2={tick.pct} 
                  y2="100" 
                  stroke="#1E2330" 
                  strokeWidth={0.15 / zoom} 
                  strokeDasharray="2 2"
                  vectorEffect="non-scaling-stroke" 
                />
              ))}

              {/* LASSO ENCLOSED PATH */}
              {lassoPoints.length > 1 && (
                <polygon 
                  points={lassoPoints.map(p => `${p.x},${p.y}`).join(' ')} 
                  fill="rgba(168, 85, 247, 0.15)" 
                  stroke="#A855F7" 
                  strokeWidth={2 / zoom} 
                  vectorEffect="non-scaling-stroke" 
                  strokeDasharray="4 4"
                  className="animate-pulse"
                />
              )}
            </svg>

            {/* TRACK DOTS (Expanded distance with zoom, inversely scaled dots) */}
            {tracks.map(track => {
              const pos = trackPositions.get(track.id) || { x: 50, y: 50 };
              const isSelected = selectedIds.has(track.id);
              const isCurrentlyPlaying = isPlaying && currentPlayingTrack?.id === track.id;
              const isMatched = matchingTrackIds === null || matchingTrackIds.has(track.id);
              const dotColor = getTrackDotColor(track);

              // Inversely scale dot size slightly so dots don't blow up as you zoom in
              const dotScale = Math.max(0.5, 1 / Math.pow(zoom, 0.45));

              return (
                <div
                  key={track.id}
                  className={`absolute w-3.5 h-3.5 -ml-[7px] -mt-[7px] rounded-full cursor-pointer transition-all duration-150 pointer-events-auto group ${
                    isSelected 
                      ? 'scale-150 ring-4 ring-emerald-400 z-30 shadow-[0_0_20px_rgba(16,185,129,0.8)]' 
                      : isCurrentlyPlaying
                      ? 'scale-150 ring-4 ring-cyan-400 z-30 shadow-[0_0_24px_rgba(6,182,212,1)] animate-pulse'
                      : isMatched
                      ? 'hover:scale-[1.8] border border-white/40 z-10 hover:z-40'
                      : 'opacity-15 pointer-events-none scale-75'
                  }`}
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    backgroundColor: isSelected ? '#10B981' : isCurrentlyPlaying ? '#06B6D4' : dotColor,
                    boxShadow: isMatched && !isSelected && !isCurrentlyPlaying ? `0 0 10px ${dotColor}60` : undefined,
                    transform: `scale(${dotScale})`,
                  }}
                  onMouseEnter={() => setHoveredTrack(track)}
                  onMouseLeave={() => setHoveredTrack(null)}

                  onClick={(e) => {
                    e.stopPropagation();
                    onPlay(track);
                  }}
                >
                  {/* Playing Radar Ping Indicator */}
                  {isCurrentlyPlaying && (
                    <span className="absolute inset-0 rounded-full bg-cyan-400 animate-ping opacity-75 pointer-events-none" />
                  )}
                </div>
              );
            })}
          </div>

          {/* HOVER TOOLTIP CARD: Rendered outside transform so it never scales or distorts */}
          {hoveredTrack && (() => {
            const pos = trackPositions.get(hoveredTrack.id) || { x: 50, y: 50 };
            const screenX = (pos.x / 100) * plotSize.width * zoom + pan.x;
            const screenY = (pos.y / 100) * plotSize.height * zoom + pan.y;

            // Only show if inside visible viewport
            if (screenX < -20 || screenX > plotSize.width + 20 || screenY < -20 || screenY > plotSize.height + 20) {
              return null;
            }

            const isAbove = screenY > 120;
            const isRight = screenX < plotSize.width * 0.75;

            return (
              <div 
                className="absolute z-50 pointer-events-none bg-[#161920]/95 border border-[#242936] p-3 rounded-2xl shadow-2xl backdrop-blur-md flex flex-col gap-2 w-64 animate-in fade-in zoom-in-95 duration-150"
                style={{
                  left: `${screenX}px`,
                  top: `${screenY}px`,
                  transform: `translate(${isRight ? '14px' : '-105%'}, ${isAbove ? '-105%' : '14px'})`
                }}
              >
                <div className="flex items-center gap-2.5">
                  {hoveredTrack.coverArt ? (
                    <img src={hoveredTrack.coverArt} className="w-10 h-10 rounded-lg object-cover border border-[#242936]" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-[#0D0E12] border border-[#242936] flex items-center justify-center">
                      <Music className="w-5 h-5 text-gray-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-white truncate drop-shadow">{hoveredTrack.title}</div>
                    <div className="text-[11px] text-gray-400 truncate">{hoveredTrack.artist || 'Unbekannter Künstler'}</div>
                  </div>
                </div>

                {/* Metadata Pills */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[#242936]">
                  {/* Key Badge */}
                  <span 
                    className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border shadow-sm"
                    style={{
                      backgroundColor: `${getCamelotColor(hoveredTrack.key)}20`,
                      borderColor: `${getCamelotColor(hoveredTrack.key)}60`,
                      color: getCamelotColor(hoveredTrack.key)
                    }}
                  >
                    {hoveredTrack.key || '8A'}
                  </span>

                  {/* BPM Badge */}
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#0D0E12] border border-[#242936] text-cyan-300">
                    {hoveredTrack.bpm || 120} BPM
                  </span>

                  {/* Energy Badge */}
                  <span 
                    className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border"
                    style={{
                      backgroundColor: `${getEnergyColor(hoveredTrack.energy)}20`,
                      borderColor: `${getEnergyColor(hoveredTrack.energy)}60`,
                      color: getEnergyColor(hoveredTrack.energy)
                    }}
                  >
                    ⚡ {hoveredTrack.energy || 5}/10
                  </span>
                </div>

                {/* Genre & Mood Chips */}
                {(hoveredTrack.genre || hoveredTrack.mood) && (
                  <div className="flex items-center gap-1.5 text-[9px] font-mono text-gray-400 truncate">
                    {hoveredTrack.genre && <span className="text-gray-300">🎵 {hoveredTrack.genre}</span>}
                    {hoveredTrack.genre && hoveredTrack.mood && <span>•</span>}
                    {hoveredTrack.mood && <span className="text-purple-300">✨ {hoveredTrack.mood}</span>}
                  </div>
                )}

                <div className="text-[9px] font-mono text-gray-500 pt-1 border-t border-[#242936]/60 flex items-center justify-between">
                  <span>Klick = Track abspielen</span>
                  <Play className="w-2.5 h-2.5 text-cyan-400" />
                </div>
              </div>
            );
          })()}

        </div>

        {/* LEFT Y-AXIS LABELS: Dynamically Tracking Pan and Zoom */}
        <div className="absolute left-0 top-10 bottom-28 w-24 overflow-hidden pointer-events-none font-mono text-[9px] text-gray-500 pr-2">
          {yTicks.map((tick, idx) => {
            const tickY = (tick.pct / 100) * plotSize.height * zoom + pan.y;
            if (tickY < -15 || tickY > plotSize.height + 15) return null;

            return (
              <div 
                key={`ytick-${idx}`}
                className="absolute right-2 -translate-y-1/2 flex items-center gap-1 transition-all duration-75"
                style={{ top: `${tickY}px` }}
              >
                <span 
                  className="font-bold truncate max-w-[82px] text-right"
                  style={{ color: tick.color || '#9CA3AF' }}
                >
                  {tick.val}
                </span>
                <div className="w-1.5 h-[1px] bg-gray-600" />
              </div>
            );
          })}
        </div>

        {/* BOTTOM X-AXIS LABELS: Dynamically Tracking Pan and Zoom */}
        <div className="absolute left-24 right-8 bottom-16 h-8 overflow-hidden pointer-events-none font-mono text-[9px] text-gray-500 pt-2">
          {xTicks.map((tick, idx) => {
            const tickX = (tick.pct / 100) * plotSize.width * zoom + pan.x;
            if (tickX < -30 || tickX > plotSize.width + 30) return null;

            return (
              <div 
                key={`xtick-${idx}`}
                className="absolute -translate-x-1/2 flex flex-col items-center gap-0.5 transition-all duration-75"
                style={{ left: `${tickX}px` }}
              >
                <div className="w-[1px] h-1.5 bg-gray-600" />
                <span 
                  className="font-bold whitespace-nowrap text-center"
                  style={{ color: tick.color || '#9CA3AF' }}
                >
                  {tick.val}
                </span>
              </div>
            );
          })}
        </div>

      </div>

      {/* ================= FLOATING SELECTION BULK ACTION HUD ================= */}
      {selectedIds.size > 0 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-[#161920]/95 border-2 border-purple-500 text-white px-5 py-3 rounded-2xl flex items-center gap-4 shadow-[0_12px_48px_rgba(168,85,247,0.4)] animate-in slide-in-from-bottom-6 duration-200 z-50 pointer-events-auto backdrop-blur-md">
          
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-white font-mono font-black text-xs shadow-md">
              {selectedIds.size}
            </div>
            <div>
              <div className="text-xs font-bold text-white">Tracks eingekreist</div>
              <div className="text-[10px] font-mono text-purple-300">Bereit für Playlist & Set</div>
            </div>
          </div>

          <div className="h-6 w-[1px] bg-[#242936]" />

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              id="btn-mapper-add-to-playlist"
              onClick={handleAddSelection}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-bold shadow-md shadow-purple-900/40 transition-all hover:scale-105 active:scale-95"
              title="Markierte Tracks zur Playlist hinzufügen"
            >
              <ListPlus className="w-3.5 h-3.5" />
              <span>+ Zur Playlist hinzufügen</span>
            </button>

            <button
              onClick={handlePlayFirstSelected}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#242936] hover:bg-[#2E3445] text-cyan-300 hover:text-white text-xs font-mono font-bold transition-all hover:scale-105 active:scale-95 border border-cyan-500/30"
              title="Ersten markierten Track sofort abspielen"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Abspielen</span>
            </button>

            <button
              onClick={() => {
                setSelectedIds(new Set());
                setLassoPoints([]);
              }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Auswahl aufheben (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

        </div>
      )}

    </div>
  );
}
