import React, { useState, useRef, useEffect, MouseEvent } from 'react';
import { Play, Sparkles } from 'lucide-react';
import { Track } from '../App';
import { TrackSegment } from '../lib/audioAnalysis';

interface GraphMapProps {
  tracks: Track[];
  libraryTracks: Track[];
  onAddSuggested: (tracks: Track[]) => void;
  onPlaySegment: (track: Track, startSec: number) => void;
  onAnalyze: (track: Track) => void;
}

interface Point {
  x: number;
  y: number;
}

interface NodePos {
  x: number;
  y: number;
}

interface Edge {
  id: string;
  sourceTrackId: string;
  sourceSegId: string;
  targetTrackId: string;
  targetSegId: string;
  isPerfect: boolean;
  isSuggested?: boolean;
}

export default function GraphMap({ tracks, libraryTracks, onAddSuggested, onPlaySegment, onAnalyze }: GraphMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track node positions
  const [positions, setPositions] = useState<Record<string, NodePos>>({});
  
  // Edges between segments
  const [edges, setEdges] = useState<Edge[]>([]);

  // Dragging states for nodes
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Dragging states for new edges
  const [drawingEdge, setDrawingEdge] = useState<{ trackId: string, segId: string, startPos: Point } | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<Point>({ x: 0, y: 0 });

  // Initialize positions for new tracks
  useEffect(() => {
    setPositions(prev => {
      const next = { ...prev };
      let changed = false;
      tracks.forEach((t, i) => {
        if (!next[t.id]) {
          next[t.id] = { x: 50 + (i * 200), y: 50 + (i * 50) };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [tracks]);

  // --- Node Dragging ---
  const handleNodePointerDown = (e: React.PointerEvent, trackId: string) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingNode(trackId);
    setDragOffset({
      x: e.clientX - (positions[trackId]?.x || 0),
      y: e.clientY - (positions[trackId]?.y || 0)
    });
  };

  const handleNodePointerMove = (e: React.PointerEvent) => {
    if (draggingNode) {
      setPositions(prev => ({
        ...prev,
        [draggingNode]: {
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        }
      }));
    }
  };

  const handleNodePointerUp = (e: React.PointerEvent) => {
    if (draggingNode) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setDraggingNode(null);
    }
  };

  // --- Edge Drawing ---
  const handlePortPointerDown = (e: React.PointerEvent, trackId: string, segId: string) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const startX = rect.left + rect.width / 2 - containerRect.left;
    const startY = rect.top + rect.height / 2 - containerRect.top;

    setDrawingEdge({ trackId, segId, startPos: { x: startX, y: startY } });
  };

  const handleContainerPointerMove = (e: React.PointerEvent) => {
    if (drawingEdge && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCurrentMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  const checkPerfectMatch = (segA: TrackSegment, segB: TrackSegment, trackA: Track, trackB: Track) => {
    // BPM +/- 3%
    const bpmDiffPercent = Math.abs(trackA.bpm - trackB.bpm) / trackA.bpm;
    
    // Accurate Camelot Key compatibility
    const parseCamelot = (k: string) => {
      const match = k.match(/(\d+)([AB])/i);
      if (!match) return null;
      return { num: parseInt(match[1]), letter: match[2].toUpperCase() };
    };

    let keyMatch = false;
    const k1 = parseCamelot(segA.key);
    const k2 = parseCamelot(segB.key);

    if (k1 && k2) {
      const numDiff = Math.abs(k1.num - k2.num);
      const isAdjacentNum = numDiff === 0 || numDiff === 1 || numDiff === 11; // handles 12 to 1 wrap
      const isSameLetter = k1.letter === k2.letter;
      const isExactNumDiffLetter = k1.num === k2.num && k1.letter !== k2.letter;
      
      keyMatch = (isAdjacentNum && isSameLetter) || isExactNumDiffLetter;
    } else {
      keyMatch = segA.key === segB.key;
    }

    const energyDiff = Math.abs(segA.energy - segB.energy);
    
    return bpmDiffPercent <= 0.03 && keyMatch && energyDiff <= 2;
  };

  const autoSuggestMixes = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedNodeId) {
      alert("Please select a track first by clicking on its header.");
      return;
    }

    const trackA = tracks.find(t => t.id === selectedNodeId);
    if (!trackA) return;

    const outroA = trackA.segments?.[(trackA.segments.length || 1) - 1];
    if (!outroA) return;

    const suggestedTracks: Track[] = [];
    const suggestedEdges: Edge[] = [];
    const newPositions: Record<string, NodePos> = {};
    const trackAPos = positions[selectedNodeId] || { x: 50, y: 50 };

    let offsetX = 300;
    let offsetY = -100;

    for (let i = 0; i < libraryTracks.length; i++) {
      const trackB = libraryTracks[i];
      if (trackA.id === trackB.id) continue;
      
      const introB = trackB.segments?.[0];
      if (introB) {
        if (checkPerfectMatch(outroA, introB, trackA, trackB)) {
          // Add to suggested if not already in graph
          if (!tracks.find(t => t.id === trackB.id) && !suggestedTracks.find(t => t.id === trackB.id)) {
            suggestedTracks.push(trackB);
            
            // Position them nicely around the selected node
            newPositions[trackB.id] = {
              x: trackAPos.x + offsetX,
              y: trackAPos.y + offsetY
            };
            offsetY += 150;
          }

          // Create edge
          const edgeId = `suggest-${outroA.id}-${introB.id}`;
          suggestedEdges.push({
            id: edgeId,
            sourceTrackId: trackA.id,
            sourceSegId: outroA.id,
            targetTrackId: trackB.id,
            targetSegId: introB.id,
            isPerfect: true,
            isSuggested: true
          });
        }
      }
    }
    
    if (suggestedTracks.length > 0) {
      setPositions(prev => ({ ...prev, ...newPositions }));
      onAddSuggested(suggestedTracks);
    }
    
    setEdges(prev => {
      const newEdges = [...prev];
      suggestedEdges.forEach(se => {
        if (!newEdges.find(e => e.sourceSegId === se.sourceSegId && e.targetSegId === se.targetSegId)) {
          newEdges.push(se);
        }
      });
      return newEdges;
    });
  };

  const handlePortPointerUp = (e: React.PointerEvent, targetTrackId: string, targetSegId: string) => {
    e.stopPropagation();
    if (drawingEdge) {
      if (drawingEdge.trackId !== targetTrackId) { // Don't connect to self
        const sourceTrack = tracks.find(t => t.id === drawingEdge.trackId);
        const sourceSeg = sourceTrack?.segments?.find(s => s.id === drawingEdge.segId);
        const targetTrack = tracks.find(t => t.id === targetTrackId);
        const targetSeg = targetTrack?.segments?.find(s => s.id === targetSegId);

        if (sourceSeg && targetSeg && sourceTrack && targetTrack) {
          const isPerfect = checkPerfectMatch(sourceSeg, targetSeg, sourceTrack, targetTrack);
          const newEdge: Edge = {
            id: `${drawingEdge.segId}-${targetSegId}`,
            sourceTrackId: drawingEdge.trackId,
            sourceSegId: drawingEdge.segId,
            targetTrackId,
            targetSegId,
            isPerfect
          };
          setEdges(prev => [...prev.filter(e => e.id !== newEdge.id), newEdge]);
        }
      }
      setDrawingEdge(null);
    }
  };

  const handleContainerPointerUp = () => {
    setDrawingEdge(null);
  };

  // Calculate path for SVG line
  const getPortPosition = (trackId: string, segIndex: number, totalSegs: number, isRight: boolean) => {
    const pos = positions[trackId] || { x: 0, y: 0 };
    // Node is 220px wide
    // Header is ~40px, each segment is 48px, gap is 4px
    const nodeX = pos.x;
    const nodeY = pos.y;
    
    const portX = nodeX + (isRight ? 220 : 0);
    const portY = nodeY + 40 + (segIndex * 52) + 24; // 40(header) + offset + 24(half segment)
    
    return { x: portX, y: portY };
  };

  if (tracks.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-gray-600 bg-[#0D0E12]">
        <p className="text-sm font-medium">Add tracks to the Chapter (Playlist) to view them in the Graph Map.</p>
      </div>
    );
  }

  return (
    <div 
      className="absolute inset-0 bg-[#0D0E12] overflow-hidden" 
      ref={containerRef}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      onPointerLeave={handleContainerPointerUp}
    >
      {/* Background Grid */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #242936 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }}
      />

      {/* Auto-Suggest Button */}
      <div className="absolute top-4 right-4 z-40">
        <button 
          onClick={autoSuggestMixes}
          className="flex items-center gap-2 px-4 py-2 bg-[#22C55E]/10 border border-[#22C55E] text-[#22C55E] rounded shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:bg-[#22C55E]/20 transition-all font-bold text-xs uppercase tracking-wider backdrop-blur-sm"
        >
          <Sparkles className="w-4 h-4" />
          Suggest Mixes
        </button>
      </div>

      {/* SVG for Edges */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {edges.map(edge => {
          const sourceTrack = tracks.find(t => t.id === edge.sourceTrackId);
          const targetTrack = tracks.find(t => t.id === edge.targetTrackId);
          if (!sourceTrack || !targetTrack) return null;
          
          const sourceIdx = sourceTrack.segments?.findIndex(s => s.id === edge.sourceSegId) || 0;
          const targetIdx = targetTrack.segments?.findIndex(s => s.id === edge.targetSegId) || 0;
          
          const start = getPortPosition(edge.sourceTrackId, sourceIdx, sourceTrack.segments?.length || 1, true);
          const end = getPortPosition(edge.targetTrackId, targetIdx, targetTrack.segments?.length || 1, false);

          // Bezier curve for sleek connections
          const cpX1 = start.x + Math.abs(end.x - start.x) / 2;
          const cpX2 = end.x - Math.abs(end.x - start.x) / 2;

          return (
            <path
              key={edge.id}
              d={`M ${start.x} ${start.y} C ${cpX1} ${start.y}, ${cpX2} ${end.y}, ${end.x} ${end.y}`}
              fill="none"
              stroke={edge.isSuggested ? '#22C55E' : edge.isPerfect ? '#22C55E' : '#A855F7'}
              strokeWidth={edge.isSuggested ? 3 : edge.isPerfect ? 3 : 2}
              strokeDasharray={edge.isSuggested ? "8 6" : undefined}
              className={edge.isSuggested ? "drop-shadow-[0_0_12px_rgba(34,197,94,1)] animate-pulse" : edge.isPerfect ? "drop-shadow-[0_0_8px_rgba(34,197,94,0.8)]" : "opacity-60"}
            />
          );
        })}

        {/* Drawing Edge */}
        {drawingEdge && (
          <path
            d={`M ${drawingEdge.startPos.x} ${drawingEdge.startPos.y} C ${drawingEdge.startPos.x + 100} ${drawingEdge.startPos.y}, ${currentMousePos.x - 100} ${currentMousePos.y}, ${currentMousePos.x} ${currentMousePos.y}`}
            fill="none"
            stroke="#A855F7"
            strokeWidth="2"
            strokeDasharray="5 5"
            className="opacity-80"
          />
        )}
      </svg>

      {/* Track Nodes */}
      {tracks.map((track) => {
        const pos = positions[track.id] || { x: 0, y: 0 };
        const isSelected = selectedNodeId === track.id;
        return (
          <div
            key={track.id}
            className={`absolute flex flex-col w-[220px] bg-[#161920] border rounded-xl shadow-xl z-30 cursor-pointer transition-colors ${
              isSelected ? 'border-[#A855F7] shadow-[0_0_20px_rgba(168,85,247,0.4)]' : 'border-[#242936] hover:border-[#A855F7]'
            }`}
            style={{ left: pos.x, top: pos.y, zIndex: draggingNode === track.id || isSelected ? 40 : 30 }}
            onClick={() => onAnalyze(track)}
          >
            {/* Header (Draggable) */}
            <div 
              className="p-2 border-b border-[#242936] bg-[#0D0E12] rounded-t-xl cursor-grab active:cursor-grabbing select-none flex items-center justify-between"
              onPointerDown={(e) => {
                handleNodePointerDown(e, track.id);
                setSelectedNodeId(track.id);
              }}
              onPointerMove={handleNodePointerMove}
              onPointerUp={handleNodePointerUp}
            >
              <div className="truncate text-xs font-bold text-white mr-2">{track.title}</div>
              <div className="text-[10px] font-mono text-[#22C55E] bg-[#22C55E]/10 px-1 rounded">{track.bpm}</div>
            </div>

            {/* Segments Stack */}
            <div className="p-2 flex flex-col gap-1 select-none">
              {track.segments?.map(seg => (
                <div 
                  key={seg.id} 
                  className="relative h-12 bg-[#0D0E12] border border-[#242936] rounded flex flex-col justify-center px-2 group hover:border-gray-500 transition-colors"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l opacity-80" style={{ backgroundColor: seg.color }} />
                  
                  {/* Left Port (Input) */}
                  <div 
                    className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-[#161920] border-2 border-[#242936] rounded-full cursor-crosshair hover:bg-[#A855F7] hover:border-[#A855F7] transition-colors z-20"
                    onPointerUp={(e) => handlePortPointerUp(e, track.id, seg.id)}
                  />

                  {/* Right Port (Output) */}
                  <div 
                    className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-[#161920] border-2 border-[#242936] rounded-full cursor-crosshair hover:bg-[#A855F7] hover:border-[#A855F7] transition-colors z-20"
                    onPointerDown={(e) => handlePortPointerDown(e, track.id, seg.id)}
                  />

                  <div className="flex items-center justify-between pl-2">
                    <div>
                      <div className="text-[10px] font-bold text-white">{seg.name}</div>
                      <div className="text-[9px] text-gray-400 font-mono">E{seg.energy} • {seg.key}</div>
                    </div>
                    
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlaySegment(track, seg.startSec);
                      }}
                      className="w-6 h-6 rounded-full bg-[#242936] flex items-center justify-center text-white hover:bg-[#A855F7] transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Play className="w-3 h-3 ml-0.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
