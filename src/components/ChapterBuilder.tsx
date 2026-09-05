import { ChapterDef } from '../types';
import { Trash2, Plus } from 'lucide-react';

export function ChapterBuilder({ chapters, onDrop, onRemove, onAddChapter }: { 
  chapters: ChapterDef[], 
  onDrop: (chapterId: string, trackId: string) => void,
  onRemove: (chapterId: string, trackIdx: number) => void,
  onAddChapter: () => void
}) {
  return (
    <div className="flex-1 h-full overflow-y-auto p-8 bg-bg-deep">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold">Set Chapters</h2>
        <button 
          onClick={onAddChapter}
          className="flex items-center gap-2 px-4 py-2 bg-border-subtle hover:bg-border-subtle/80 text-white rounded-lg text-sm font-bold transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Chapter
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
        {chapters.map(chapter => {
          const avgEnergy = chapter.tracks.length 
            ? (chapter.tracks.reduce((sum, t) => sum + t.energy, 0) / chapter.tracks.length).toFixed(1) 
            : '0.0';

          return (
            <div 
              key={chapter.id}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                const trackId = e.dataTransfer.getData('trackId');
                if (trackId) onDrop(chapter.id, trackId);
              }}
              className="bg-card-dark border border-border-subtle rounded-2xl p-4 flex flex-col h-[500px]"
            >
              <div className="flex justify-between items-center border-b border-border-subtle pb-4 mb-4">
                <h3 className="font-bold text-lg">{chapter.name}</h3>
                <div className="text-xs px-2 py-1 bg-border-subtle rounded-md font-mono text-accent-purple">
                  Avg E: {avgEnergy}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3">
                {chapter.tracks.length === 0 && (
                  <div className="h-full flex items-center justify-center text-gray-500 text-sm border-2 border-dashed border-border-subtle rounded-xl p-4 text-center">
                    Drag tracks here to build chapter
                  </div>
                )}
                {chapter.tracks.map((track, idx) => (
                  <div key={idx} className="bg-bg-deep border border-border-subtle p-3 rounded-xl flex justify-between items-center group">
                    <div className="truncate pr-2">
                      <p className="text-sm font-bold text-gray-200 truncate">{track.title}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="text-[10px] text-gray-500 font-mono">{track.key}</span>
                        <span className="text-[10px] text-gray-500 font-mono">E:{track.energy}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => onRemove(chapter.id, idx)} 
                      className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
