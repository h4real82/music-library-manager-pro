import { TrackDef } from '../types';

export function ScatterView({ tracks, onPlay }: { tracks: TrackDef[], onPlay: (t: TrackDef) => void }) {
  if (tracks.length === 0) {
    return (
      <div className="flex-1 flex flex-col p-8 bg-bg-deep text-white">
        <h2 className="text-2xl font-bold mb-2">Energy / Tempo Matrix</h2>
        <p className="text-gray-500">Add tracks to library to view plot.</p>
      </div>
    );
  }

  // Add slight padding to domains
  const minBpm = Math.min(...tracks.map(t => t.bpm)) - 5;
  const maxBpm = Math.max(...tracks.map(t => t.bpm)) + 5;

  return (
    <div className="flex-1 h-full flex flex-col p-8 bg-bg-deep text-white">
      <h2 className="text-2xl font-bold mb-2">Energy / Tempo Matrix</h2>
      <p className="text-gray-500 mb-8">Scatter map of your library (X: BPM, Y: Energy)</p>

      <div className="flex-1 relative bg-card-dark border border-border-subtle rounded-2xl p-8 mt-4 overflow-hidden shadow-2xl">
        {/* Grid Lines Pattern */}
        <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,255,255,1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,1)_1px,transparent_1px)] bg-[size:40px_40px]" />

        {/* Axes Labels */}
        <div className="absolute bottom-4 left-0 right-0 text-center text-gray-500 font-mono text-[10px] uppercase tracking-widest">
          BPM ({minBpm} - {maxBpm})
        </div>
        <div className="absolute left-[-30px] top-1/2 -rotate-90 text-gray-500 font-mono text-[10px] uppercase tracking-widest origin-center">
          Energy (1 - 10)
        </div>

        {/* Interactive Canvas Area */}
        <div className="relative w-full h-full border-l border-b border-border-subtle/50">
          {tracks.map(track => {
            // Map BPM to 0-100% horizontally
            const left = ((track.bpm - minBpm) / (maxBpm - minBpm)) * 100;
            // Map Energy (1-10) to 0-100% vertically (0 is bottom)
            const bottom = ((track.energy - 1) / 9) * 100;

            return (
              <div
                key={track.id}
                onClick={() => onPlay(track)}
                className="absolute w-4 h-4 -ml-2 -mb-2 bg-accent-purple rounded-full cursor-pointer hover:scale-150 transition-transform group shadow-[0_0_12px_var(--color-accent-purple)]"
                style={{ left: `${left}%`, bottom: `${bottom}%` }}
              >
                {/* Tooltip */}
                <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-bg-deep border border-border-subtle px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-20 transition-opacity shadow-xl">
                  <p className="font-bold text-white text-sm">{track.title}</p>
                  <p className="text-[10px] text-accent-green font-mono mt-1">
                    {track.bpm} BPM | {track.key} | Energy: {track.energy}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
