import { ChapterDef } from '../types';
import { getHarmonicMatchScore } from '../lib/musicData';
import { Network } from 'lucide-react';

export function GraphView({ chapters }: { chapters: ChapterDef[] }) {
  const sequence = chapters.flatMap(c => c.tracks);
  
  if (sequence.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 h-full bg-bg-deep">
        <Network className="w-12 h-12 mb-4 opacity-20" />
        <p>Add tracks to chapters to see the flow graph.</p>
      </div>
    );
  }

  const PADDING_X = 100;
  const SPACING_X = 220;
  const MAX_HEIGHT = 450;
  
  const width = sequence.length * SPACING_X + PADDING_X * 2;
  
  return (
    <div className="flex-1 h-full overflow-auto bg-bg-deep relative">
      <div className="absolute top-6 left-6 z-10 bg-card-dark p-4 border border-border-subtle rounded-xl shadow-2xl">
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Legend</h3>
        <div className="flex flex-col gap-2 text-[10px] font-mono">
          <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-accent-green"></div> Perfect Match</div>
          <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-accent-purple"></div> Good Harmonic Match</div>
          <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-red-500" style={{borderStyle: 'dashed'}}></div> Key Clash</div>
        </div>
      </div>

      <div style={{ width, height: '100%', position: 'relative', minHeight: 600 }}>
        {/* SVG Connections */}
        <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
          {sequence.map((track, i) => {
            if (i === sequence.length - 1) return null;
            const nextTrack = sequence[i + 1];
            
            // X center of node is padding + (index * spacing) + (nodeWidth / 2)
            const x1 = PADDING_X + (i * SPACING_X) + 80;
            const y1 = MAX_HEIGHT - (track.energy * 35) + 35; 
            
            const x2 = PADDING_X + ((i + 1) * SPACING_X) + 80;
            const y2 = MAX_HEIGHT - (nextTrack.energy * 35) + 35;

            const match = getHarmonicMatchScore(track.key, nextTrack.key);
            let strokeColor = 'var(--color-border-subtle)';
            if (match === 'perfect') strokeColor = 'var(--color-accent-green)';
            else if (match === 'good') strokeColor = 'var(--color-accent-purple)';
            else strokeColor = '#ef4444'; 

            return (
              <line 
                key={i} 
                x1={x1} y1={y1} x2={x2} y2={y2} 
                stroke={strokeColor} 
                strokeWidth="3"
                strokeDasharray={match === 'clash' ? "5,5" : "0"}
                className="opacity-70"
              />
            );
          })}
        </svg>

        {/* Track Nodes */}
        {sequence.map((track, i) => {
          const x = PADDING_X + (i * SPACING_X);
          const y = MAX_HEIGHT - (track.energy * 35);

          return (
            <div 
              key={i} 
              className="absolute w-[160px] bg-card-dark border border-border-subtle p-4 rounded-xl shadow-xl shadow-black/50 hover:border-accent-purple/50 transition-colors"
              style={{ left: x, top: y }}
            >
              <div className="text-[10px] font-mono text-accent-purple mb-1">Node {i+1}</div>
              <h4 className="font-bold text-white text-sm truncate">{track.title}</h4>
              <p className="text-[10px] text-gray-500 truncate mb-3">{track.artist}</p>
              
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-accent-green bg-accent-green/10 px-1.5 py-0.5 rounded">{track.key}</span>
                <span className="text-gray-400 bg-border-subtle px-1.5 py-0.5 rounded">E: {track.energy}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
