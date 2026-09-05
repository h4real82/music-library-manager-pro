import React, { useRef, useEffect, useState } from 'react';
import { X, Download, Play, Trash2, Plus, Activity } from 'lucide-react';
import { Track, HotCue } from '../App';

interface Props {
  track: Track;
  onClose: () => void;
  audioRef: React.RefObject<HTMLAudioElement>;
  duration: number;
  currentTime: number;
  onUpdateTrack: (id: string, updates: Partial<Track>) => void;
}

export default function AnalyzerPanel({ track, onClose, audioRef, duration, currentTime, onUpdateTrack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clickX: number; cueId: string | null } | null>(null);
  const [editingCue, setEditingCue] = useState<{ id: string; name: string; x: number; y: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSpectrogram, setShowSpectrogram] = useState(false);

  useEffect(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    setIsPlaying(!audio.paused);
    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [audioRef]);

  // High-End Aurora-Waveform Canvas with Optional Spectrogram Heatmap Overlay
  const drawProAuroraWaveform = (canvas: HTMLCanvasElement, dur: number, currTime: number, withSpectrogram: boolean) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    const w = canvas.width;
    const h = canvas.height;
    
    // 1. Canvas komplett leeren
    ctx.clearRect(0, 0, w, h);
    
    // 2. ERSTE EBENE: Die weiche Energie-Aura (Hintergrund-Glow)
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(168, 85, 247, 0.45)'; // Violettes Glühen
    ctx.fillStyle = 'rgba(22, 25, 32, 0.5)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // 3. ZWEITE EBENE: Horizontaler Aurora-Farbverlauf (Exakt wie im Screenshot)
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, '#f43f5e');   // Neon Pink/Magenta (Links - Hohe Energie/Drop)
    gradient.addColorStop(0.4, '#a855f7'); // Deep Purple (Mitte - Übergänge)
    gradient.addColorStop(1, '#06b6d4');   // Cyan/Hellblau (Rechts - Melodischer Ausklang)
    
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.5; // Ultra-feines, hochfrequentes Linien-Grid
    ctx.lineCap = 'round';
    
    const lineCount = 200; // Hohe Pixeldichte für feine Abstimmung
    const playheadX = dur > 0 ? (currTime / dur) * w : 0;
    
    for (let i = 0; i < lineCount; i++) {
      const x = (i / lineCount) * w;
      
      // Mathematische Simulation von Frequenz-Peaks (Herz/Lautstärke)
      // Erzeugt organische Hügel und plötzliche laute Ausschläge (Sub-Bass Drops)
      const baseWave = Math.sin((i / lineCount) * Math.PI * 2) * 0.25;
      const microDetail = Math.cos((i / lineCount) * Math.PI * 12) * 0.15;
      // Deterministische Peak-Verteilung basierend auf Index zur Vermeidung von Flimmern
      const seed = Math.sin(i * 99.123 + (track.bpm || 120)) * 10000;
      const rnd = seed - Math.floor(seed);
      const randomPeak = rnd > 0.88 ? 0.35 : 0.05; // Dynamische Lautstärke-Ausschläge
      
      // Amplituden-Höhe berechnen und skalieren
      let amplitude = (Math.abs(baseWave) + Math.abs(microDetail) + randomPeak) * (h * 0.75);
      if (amplitude > h * 0.9) amplitude = h * 0.9; // Clipping-Schutz

      // Visuelle Abgrenzung: Bereits abgespielte Parts leuchten voll, zukünftige Parts sind leicht transparent
      ctx.globalAlpha = x < playheadX ? 1.0 : 0.35;
      
      // Die feinen, symmetrisch gespiegelten Frequenzlinien zeichnen
      ctx.beginPath();
      ctx.moveTo(x, h / 2 - amplitude / 2);
      ctx.lineTo(x, h / 2 + amplitude / 2);
      ctx.stroke();
    }

    // 4. SPECTROGRAM FREQUENCY HEATMAP OVERLAY (Wenn aktiviert)
    if (withSpectrogram) {
      ctx.save();
      const numCols = Math.min(160, Math.max(60, Math.floor(w / 4)));
      const colWidth = w / numCols;
      const numBins = 24;
      const binHeight = h / numBins;

      for (let c = 0; c < numCols; c++) {
        const colX = c * colWidth;
        const colProgress = c / numCols;
        const isPast = colX < playheadX;
        const colAlphaBase = isPast ? 0.7 : 0.35;

        // Frequenz-Bins von oben (hohe Frequenzen ~ 20kHz) nach unten (Sub-Bass ~ 20Hz)
        for (let b = 0; b < numBins; b++) {
          const binY = b * binHeight;
          const freqNorm = 1 - (b / numBins); // 1.0 = Highs, 0.0 = Sub-Bass
          
          // Spektralenergie-Modulation basierend auf BPM, Energy-Rating und Harmonischen
          const harmonic = Math.sin(colProgress * Math.PI * (6 + freqNorm * 14) + (track.bpm || 120) * 0.05);
          const bassThump = Math.exp(-Math.pow((freqNorm - 0.15) * 5.5, 2)) * Math.abs(Math.sin(colProgress * Math.PI * 18));
          const midPresence = Math.exp(-Math.pow((freqNorm - 0.48) * 4.2, 2)) * (0.35 + 0.65 * Math.abs(harmonic));
          const highAir = Math.exp(-Math.pow((freqNorm - 0.82) * 5.5, 2)) * (0.2 + 0.5 * Math.abs(Math.cos(colProgress * Math.PI * 26)));
          
          const energyBoost = (track.energy || 5) / 10;
          let intensity = (bassThump * 0.85 + midPresence * 0.75 + highAir * 0.55) * (0.55 + energyBoost * 0.45);
          intensity = Math.max(0, Math.min(1, intensity));

          if (intensity > 0.12) {
            // Spektrogramm Heatmap Palette: Tiefviolett -> Neon Magenta -> Flammen-Orange -> Laser-Gelb/Weiß
            let heatColor = '';
            if (intensity < 0.3) {
              heatColor = `rgba(124, 58, 237, ${intensity * colAlphaBase * 0.75})`; // Deep Violet
            } else if (intensity < 0.6) {
              heatColor = `rgba(236, 72, 153, ${intensity * colAlphaBase * 0.85})`; // Neon Magenta
            } else if (intensity < 0.84) {
              heatColor = `rgba(249, 115, 22, ${intensity * colAlphaBase * 0.9})`;  // Flame Orange
            } else {
              heatColor = `rgba(254, 240, 138, ${intensity * colAlphaBase * 0.95})`; // Laser Yellow
            }

            ctx.fillStyle = heatColor;
            ctx.fillRect(colX, binY, colWidth + 0.5, binHeight + 0.5);
          }
        }
      }

      // Subtile Frequenz-Rasterlinien & Labels
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      
      const freqs = [
        { label: '10 kHz (Highs)', y: h * 0.18 },
        { label: '1.5 kHz (Mids)', y: h * 0.52 },
        { label: '120 Hz (Sub/Bass)', y: h * 0.85 },
      ];

      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.textAlign = 'right';

      freqs.forEach(f => {
        ctx.beginPath();
        ctx.moveTo(0, f.y);
        ctx.lineTo(w, f.y);
        ctx.stroke();
        ctx.fillText(f.label, w - 8, f.y - 3);
      });

      ctx.setLineDash([]);
      ctx.restore();
    }

    // 5. Hot Cues & Flaggen
    const trackCues = track.hotCues || [];
    if (trackCues.length > 0) {
      ctx.font = 'bold 11px sans-serif';
      trackCues.forEach(cue => {
        const x = ((cue.timeMs / 1000) / (dur || 1)) * w;
        
        // Vertikale Marker-Linie
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 1, 0, 2, h);
        
        // Flaggen-Form
        const text = `▶ ${cue.name}`;
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = '#A855F7';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + tw + 10, 0);
        ctx.lineTo(x + tw + 10, 22);
        ctx.lineTo(x, 22);
        ctx.fill();
        
        // Slot Text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, x + 4, 15);
      });
    }

    // 6. DRITTE EBENE: Der schwebende Playhead
    // Zeichne eine dünne, leuchtend weiße vertikale Linie für die aktuelle Position
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId: number | null = null;
    let isSubscribed = true;

    const render = () => {
      if (!isSubscribed || !canvasRef.current) return;
      const audio = audioRef.current;
      const currentAudioTime = audio ? audio.currentTime : currentTime;
      const currentAudioDuration = audio && audio.duration && !isNaN(audio.duration) ? audio.duration : duration;
      
      drawProAuroraWaveform(canvasRef.current, currentAudioDuration, currentAudioTime, showSpectrogram);

      if (audio && !audio.paused) {
        animId = requestAnimationFrame(render);
      }
    };

    // Initial render
    render();

    // Resize observer to handle dynamic container resizing
    const resizeObserver = new ResizeObserver(() => {
      render();
    });
    resizeObserver.observe(canvas);

    const audio = audioRef.current;
    if (audio) {
      const handlePlay = () => {
        if (animId) cancelAnimationFrame(animId);
        animId = requestAnimationFrame(render);
      };
      const handlePause = () => {
        if (animId) cancelAnimationFrame(animId);
        render();
      };
      const handleSeeked = () => render();
      const handleTimeUpdate = () => {
        if (audio.paused) render();
      };

      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);
      audio.addEventListener('seeked', handleSeeked);
      audio.addEventListener('timeupdate', handleTimeUpdate);

      if (!audio.paused) {
        animId = requestAnimationFrame(render);
      }

      return () => {
        isSubscribed = false;
        resizeObserver.disconnect();
        if (animId) cancelAnimationFrame(animId);
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('pause', handlePause);
        audio.removeEventListener('seeked', handleSeeked);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
      };
    }

    return () => {
      isSubscribed = false;
      resizeObserver.disconnect();
      if (animId) cancelAnimationFrame(animId);
    };
  }, [track, currentTime, duration, track.hotCues, isPlaying, showSpectrogram]);

  if (!track) return null;

  const getHitCue = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    const trackCues = track.hotCues || [];
    for (const cue of trackCues) {
       const x = (cue.timeMs / 1000) / (duration || 1) * rect.width;
       if (clickX >= x - 5 && clickX <= x + 80 && clickY >= 0 && clickY <= 30) {
           return cue;
       }
    }
    return null;
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const cue = getHitCue(e);
    setContextMenu({ x: e.clientX, y: e.clientY, clickX, cueId: cue ? cue.id : null });
    setEditingCue(null);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cue = getHitCue(e);
    if (cue) {
      setEditingCue({ id: cue.id, name: cue.name, x: e.clientX, y: e.clientY });
      setContextMenu(null);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (contextMenu) setContextMenu(null);
    if (editingCue) {
      setEditingCue(null);
      return;
    }

    const cue = getHitCue(e);
    if (cue) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));

    const audio = audioRef.current;
    const effectiveDuration = audio && audio.duration && !isNaN(audio.duration) ? audio.duration : duration;

    if (audio && effectiveDuration > 0) {
      const targetTime = ratio * effectiveDuration;
      audio.currentTime = targetTime;
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Left click only
    
    if (contextMenu) setContextMenu(null);
    if (editingCue) {
      setEditingCue(null);
      return;
    }

    const cue = getHitCue(e);
    if (cue) return; // Ignore scrub if clicked on a flag

    if (!audioRef.current || !duration) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = (clickX / rect.width) * duration;
    audioRef.current.currentTime = newTime;
  };

  const handleDeleteCue = (id: string) => {
    const newCues = (track.hotCues || []).filter(c => c.id !== id);
    onUpdateTrack(track.id, { hotCues: newCues });
    setContextMenu(null);
  };

  const handleAddCueAtContext = () => {
    if (!contextMenu || !canvasRef.current || !duration) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const timeMs = Math.floor((contextMenu.clickX / rect.width) * duration * 1000);
    const newId = `cue-${Date.now()}`;
    const existingSlots = (track.hotCues || []).map(c => c.slot || 0);
    const nextSlot = Math.max(0, ...existingSlots) + 1;
    
    const newCue: HotCue = { id: newId, name: `Cue ${nextSlot}`, timeMs, type: 0, slot: nextSlot };
    const newCues = [...(track.hotCues || []), newCue];
    onUpdateTrack(track.id, { hotCues: newCues });
    setContextMenu(null);
  };

  const handleRenameCue = (id: string, newName: string) => {
    const newCues = (track.hotCues || []).map(c => c.id === id ? { ...c, name: newName } : c);
    onUpdateTrack(track.id, { hotCues: newCues });
  };

  const handleSetCueBtn = (slot: number) => {
    if (!audioRef.current) return;
    const timeMs = Math.floor(audioRef.current.currentTime * 1000);
    const currentTrackCues = track.hotCues || [];
    
    const existingIdx = currentTrackCues.findIndex(c => c.slot === slot);
    const newCues = [...currentTrackCues];
    
    if (existingIdx >= 0) {
      newCues[existingIdx] = { ...newCues[existingIdx], timeMs };
    } else {
      newCues.push({ id: `cue-${Date.now()}`, slot, timeMs, type: 0, name: `Cue ${slot}` });
    }
    
    onUpdateTrack(track.id, { hotCues: newCues });
  };

  const exportNml = () => {
     const trackCues = track.hotCues || [];
     const cueXml = trackCues.map(c => `      <CUE_V2 NAME="${c.name}" START="${c.timeMs}" TYPE="${c.type}" DISH="1"/>`).join('\n');
     
     const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<NML VERSION="19">
  <COLLECTION>
    <ENTRY TYPE="AUDIO">
      <TITLE>${track.title}</TITLE>
${cueXml}
    </ENTRY>
  </COLLECTION>
</NML>`;
     
     const blob = new Blob([xml], { type: 'application/xml' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `${track.title.replace(/[^a-z0-9]/gi, '_')}_cues.nml`;
     a.click();
     URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed bottom-20 left-0 right-0 h-[380px] bg-[#161920] border-t border-[#242936] z-50 p-6 flex flex-col shadow-[0_-20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-10 duration-300">
      <div className="flex justify-between items-start mb-4 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white">{track.title}</h2>
          <div className="text-sm font-mono text-gray-400 mt-1 flex gap-4">
            <span><span className="text-[#A855F7]">BPM:</span> {track.bpm}</span>
            <span><span className="text-[#22C55E]">KEY:</span> {track.key}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            id="btn-toggle-spectrogram"
            onClick={() => setShowSpectrogram(prev => !prev)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded font-bold text-sm transition-all border shadow-sm ${
              showSpectrogram 
                ? 'bg-gradient-to-r from-amber-500/20 via-pink-500/20 to-purple-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.25)]' 
                : 'bg-[#242936] hover:bg-[#2e3446] text-gray-300 border-[#333a4d]'
            }`}
            title="Toggle frequency heatmap overlay"
          >
            <Activity className={`w-4 h-4 ${showSpectrogram ? 'text-amber-400 animate-pulse' : 'text-gray-400'}`} />
            <span>Toggle Spectrogram</span>
            {showSpectrogram && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5 animate-ping" />
            )}
          </button>
          <button onClick={exportNml} className="flex items-center gap-2 bg-[#242936] hover:bg-[#A855F7] text-white px-4 py-2 rounded font-bold text-sm transition-colors shadow-sm border border-[#333a4d]">
            <Download className="w-4 h-4" /> Export to Traktor (.nml)
          </button>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-white bg-[#0D0E12] border border-[#242936] hover:border-gray-500 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 relative bg-[#0D0E12] rounded-lg overflow-hidden border border-[#242936] mb-4">
          <canvas 
            ref={canvasRef} 
            id="analyzer-waveform-canvas"
            className="absolute inset-0 w-full h-full cursor-pointer"
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
          />
          
          {/* Center Play Button Overlay */}
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-16 bg-white/10 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(34,211,238,0.3)]">
                <Play className="w-8 h-8 text-white ml-1" fill="currentColor"/>
              </div>
            </div>
          )}

          {/* Context Menu Overlay */}
          {contextMenu && (
            <div 
              className="fixed bg-[#161920] border border-[#242936] shadow-2xl rounded-md p-1 z-50 min-w-[140px]"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onMouseLeave={() => setContextMenu(null)}
            >
              {contextMenu.cueId ? (
                <button 
                  onClick={() => handleDeleteCue(contextMenu.cueId!)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded transition-colors text-left"
                >
                  <Trash2 className="w-4 h-4" /> Delete Cue
                </button>
              ) : (
                <button 
                  onClick={handleAddCueAtContext}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-[#242936] rounded transition-colors text-left"
                >
                  <Plus className="w-4 h-4" /> Add Cue Here
                </button>
              )}
            </div>
          )}

          {/* Inline Edit Overlay */}
          {editingCue && (
            <input
              autoFocus
              className="fixed z-50 bg-white text-black text-[11px] font-bold px-1 py-0.5 outline-none border border-cyan-400 shadow-lg"
              style={{ left: editingCue.x, top: editingCue.y - 10 }}
              value={editingCue.name}
              onChange={e => setEditingCue({ ...editingCue, name: e.target.value })}
              onBlur={() => {
                handleRenameCue(editingCue.id, editingCue.name);
                setEditingCue(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleRenameCue(editingCue.id, editingCue.name);
                  setEditingCue(null);
                }
              }}
            />
          )}
        </div>
        
        <div className="grid grid-cols-8 gap-2 shrink-0">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(slot => {
            const existing = (track.hotCues || []).find(c => c.slot === slot);
            return (
              <button 
                key={slot}
                onClick={() => handleSetCueBtn(slot)}
                className={`h-12 rounded flex flex-col items-center justify-center border transition-all ${
                  existing 
                    ? 'bg-[#22d3ee]/10 border-[#22d3ee] text-[#22d3ee] hover:bg-[#22d3ee]/20 shadow-[0_0_10px_rgba(34,211,238,0.2)]' 
                    : 'bg-[#0D0E12] border-[#242936] text-gray-500 hover:border-gray-500 hover:text-white'
                }`}
              >
                <span className="text-[10px] uppercase font-bold tracking-wider">Set Cue {slot}</span>
                {existing && <span className="text-[9px] font-mono mt-0.5">{(existing.timeMs / 1000).toFixed(2)}s</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
