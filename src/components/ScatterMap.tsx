import React, { useState, useRef, useCallback } from 'react';
import { ListPlus, Play } from 'lucide-react';
import { Track } from '../App';

interface ScatterMapProps {
  tracks: Track[];
  onPlay: (track: Track) => void;
  onAddMultiple: (tracks: Track[]) => void;
}

export default function ScatterMap({ tracks, onPlay, onAddMultiple }: ScatterMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [lassoPoints, setLassoPoints] = useState<{x: number, y: number}[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredTrack, setHoveredTrack] = useState<Track | null>(null);

  // Math helpers to map BPM/Energy to 0-100% space
  // BPM: 100 to 150
  const getX = (bpm: number) => Math.max(0, Math.min(100, ((bpm - 100) / 50) * 100));
  // Energy: 1 to 10 (inverted so 10 is at top)
  const getY = (energy: number) => Math.max(0, Math.min(100, (1 - ((energy - 1) / 9)) * 100));

  const getEventPercentCoords = (e: React.MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDrawing(true);
    setLassoPoints([getEventPercentCoords(e)]);
    setSelectedIds(new Set());
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    setLassoPoints(prev => [...prev, getEventPercentCoords(e)]);
  };

  const isPointInPolygon = (point: {x: number, y: number}, vs: {x: number, y: number}[]) => {
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      let xi = vs[i].x, yi = vs[i].y;
      let xj = vs[j].x, yj = vs[j].y;
      let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (lassoPoints.length > 2) {
      // Find tracks within polygon
      const selected = tracks.filter(t => {
        const p = { x: getX(t.bpm), y: getY(t.energy) };
        return isPointInPolygon(p, lassoPoints);
      });
      
      if (selected.length > 0) {
        setSelectedIds(new Set(selected.map(t => t.id)));
        onAddMultiple(selected);
        // Visual glow persists for a moment then resets
        setTimeout(() => {
          setSelectedIds(new Set());
          setLassoPoints([]);
        }, 800);
      } else {
        setLassoPoints([]);
      }
    } else {
      setLassoPoints([]);
    }
  };

  const handleAddSelection = () => {
    const tracksToAdd = tracks.filter(t => selectedIds.has(t.id));
    onAddMultiple(tracksToAdd);
    setSelectedIds(new Set());
    setLassoPoints([]);
  };

  // Grid lines definition
  const xLines = [100, 110, 120, 130, 140, 150];
  const yLines = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  return (
    <div 
      className="absolute inset-0 cursor-crosshair overflow-hidden select-none bg-[#0D0E12]"
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* BACKGROUND GRID (SVG) */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
        {/* Y-Axis Lines (Energy) */}
        {yLines.map(energy => {
          const y = getY(energy);
          return (
            <line key={`y-${energy}`} x1="0" y1={y} x2="100" y2={y} stroke="#242936" strokeWidth="0.2" vectorEffect="non-scaling-stroke" />
          );
        })}
        {/* X-Axis Lines (BPM) */}
        {xLines.map(bpm => {
          const x = getX(bpm);
          return (
            <line key={`x-${bpm}`} x1={x} y1="0" x2={x} y2="100" stroke="#242936" strokeWidth="0.2" vectorEffect="non-scaling-stroke" />
          );
        })}
        
        {/* LASSO PATH */}
        {lassoPoints.length > 0 && (
          <polygon 
            points={lassoPoints.map(p => `${p.x},${p.y}`).join(' ')} 
            fill="rgba(168, 85, 247, 0.15)" 
            stroke="#A855F7" 
            strokeWidth="2" 
            vectorEffect="non-scaling-stroke" 
            strokeDasharray="4 4"
            className="animate-pulse"
          />
        )}
      </svg>

      {/* LABELS */}
      <div className="absolute inset-0 pointer-events-none font-mono text-[9px] text-gray-600">
        {yLines.map(energy => (
          <div key={`yl-${energy}`} className="absolute left-2 -translate-y-1/2" style={{ top: `${getY(energy)}%` }}>E{energy}</div>
        ))}
        {xLines.map(bpm => (
          <div key={`xl-${bpm}`} className="absolute bottom-2 -translate-x-1/2" style={{ left: `${getX(bpm)}%` }}>{bpm}</div>
        ))}
      </div>

      {/* TRACK DOTS */}
      {tracks.map(track => {
        const isSelected = selectedIds.has(track.id);
        const x = getX(track.bpm);
        const y = getY(track.energy);
        
        return (
          <div
            key={track.id}
            className={`absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full cursor-pointer transition-all duration-200 pointer-events-auto ${
              isSelected 
                ? 'shadow-[0_0_20px_#22C55E] scale-150 border-2 border-[#22C55E] z-20 bg-[#22C55E]' 
                : 'hover:scale-[1.8] hover:shadow-[0_0_15px_#A855F7] border border-white/30 z-10 hover:z-30'
            }`}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              background: isSelected ? undefined : (track.gradient || '#A855F7')
            }}
            onMouseEnter={() => setHoveredTrack(track)}
            onMouseLeave={() => setHoveredTrack(null)}
            onMouseDown={(e) => e.stopPropagation()} // Prevent lasso start
            onClick={(e) => {
              e.stopPropagation();
              onPlay(track);
            }}
          />
        );
      })}

      {/* TOOLTIP */}
      {hoveredTrack && (
        <div 
          className="absolute z-50 pointer-events-none bg-[#161920] border border-[#242936] p-3 rounded-xl shadow-2xl flex flex-col gap-1 w-48 animate-in fade-in duration-200"
          style={{
            left: `${getX(hoveredTrack.bpm)}%`,
            top: `${getY(hoveredTrack.energy)}%`,
            transform: 'translate(-50%, -120%)'
          }}
        >
          <div className="text-xs font-bold text-white truncate drop-shadow-md">{hoveredTrack.title}</div>
          <div className="text-[10px] text-gray-400 truncate drop-shadow-md">{hoveredTrack.artist}</div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#242936]">
            <span className="text-[10px] font-mono text-[#22C55E] bg-[#22C55E]/10 px-1.5 py-0.5 rounded">{hoveredTrack.key}</span>
            <span className="text-[10px] font-mono text-gray-300">{hoveredTrack.bpm} BPM</span>
          </div>
        </div>
      )}

      {/* BULK ACTION PANEL */}
      {selectedIds.size > 0 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[#A855F7] text-white px-6 py-3 rounded-full flex items-center gap-4 shadow-[0_10px_40px_rgba(168,85,247,0.4)] animate-in slide-in-from-bottom-8 z-50 pointer-events-auto">
          <span className="font-bold text-sm tracking-wide">{selectedIds.size} Tracks ausgewählt</span>
          <button 
            onClick={(e) => { e.stopPropagation(); handleAddSelection(); }}
            className="bg-white text-[#A855F7] hover:bg-gray-100 px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 transition-transform hover:scale-105 active:scale-95 shadow-sm"
          >
            <ListPlus className="w-3.5 h-3.5" /> Zum Chapter
          </button>
        </div>
      )}
    </div>
  );
}
