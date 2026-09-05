import { DragEvent, ChangeEvent, useRef, useState } from 'react';
import { TrackDef } from '../types';
import { Play, UploadCloud, FolderSearch, Loader2, Music } from 'lucide-react';
import { extractMetadata, generateId } from '../lib/audioMetadata';
import { saveTrack } from '../lib/db';

export function Library({ tracks, onPlay, onAddTrack }: { tracks: TrackDef[], onPlay: (t: TrackDef) => void, onAddTrack: (t: TrackDef) => void }) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  async function* getFilesRecursively(entry: any): AsyncGenerator<any> {
    if (entry.kind === 'file') {
      yield entry;
    } else if (entry.kind === 'directory') {
      for await (const handle of entry.values()) {
        yield* getFilesRecursively(handle);
      }
    }
  }

  const processFile = async (file: File, handle?: any) => {
    const meta = await extractMetadata(file);
    const newTrack: TrackDef = {
      id: generateId(),
      title: meta.title,
      artist: meta.artist,
      bpm: meta.bpm || Math.floor(Math.random() * 20 + 120), // Mock if missing
      key: meta.key || `${Math.floor(Math.random() * 12 + 1)}${Math.random() > 0.5 ? 'A' : 'B'}`,
      energy: Math.floor(Math.random() * 6 + 4), 
      vibe: 'Analyzed',
      coverArt: meta.coverArt,
      fileHandle: handle,
      fileFallback: handle ? undefined : file
    };
    await saveTrack(newTrack);
    onAddTrack(newTrack);
  };

  const handleDirectoryPick = async () => {
    try {
      // In cross-origin iframes (like the AI Studio preview), showDirectoryPicker is blocked.
      const isIframe = window.self !== window.top;

      if ('showDirectoryPicker' in window && !isIframe) {
        let dirHandle;
        try {
          dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
        } catch (e: any) {
          if (e.name === 'SecurityError' || e.message?.includes('Cross origin')) {
            console.warn('Directory picker blocked by security policies. Falling back to standard input.');
            fallbackInputRef.current?.click();
            return;
          }
          throw e; // Re-throw if it's another error (like AbortError)
        }

        setIsScanning(true);
        setScanProgress(0);
        
        const filesToProcess = [];
        for await (const entry of getFilesRecursively(dirHandle)) {
          if (entry.name.match(/\.(mp3|wav|flac)$/i)) {
            filesToProcess.push(entry);
          }
        }
        
        setScanTotal(filesToProcess.length);
        
        // Process in chunks to not freeze the UI completely
        for (let i = 0; i < filesToProcess.length; i++) {
          const handle = filesToProcess[i];
          const file = await handle.getFile();
          await processFile(file, handle);
          setScanProgress(i + 1);
        }
      } else {
        // Fallback for iframes or unsupported browsers
        fallbackInputRef.current?.click();
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('Error scanning directory:', e);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleFallbackChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setIsScanning(true);
    setScanProgress(0);
    setScanTotal(files.length);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.match(/\.(mp3|wav|flac)$/i)) {
        await processFile(file);
      }
      setScanProgress(i + 1);
    }
    
    setIsScanning(false);
    if (fallbackInputRef.current) {
      fallbackInputRef.current.value = '';
    }
  };

  const handleFileDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files) as File[];
    const audioFiles = files.filter(f => f.type.startsWith('audio/'));
    
    for (const file of audioFiles) {
      await processFile(file);
    }
  };

  return (
    <div className="w-80 bg-card-dark border-r border-border-subtle flex flex-col h-full shrink-0">
      <div className="p-4 border-b border-border-subtle">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold tracking-tight">Library</h2>
        </div>
        
        <button 
          onClick={handleDirectoryPick}
          disabled={isScanning}
          className="w-full mb-4 bg-accent-purple/20 hover:bg-accent-purple/30 border border-accent-purple/50 text-accent-purple font-bold py-2 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm disabled:opacity-50"
        >
          {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderSearch className="w-4 h-4" />}
          Musik-Ordner wählen
        </button>

        <input 
          type="file" 
          ref={fallbackInputRef} 
          onChange={handleFallbackChange} 
          className="hidden" 
          webkitdirectory="true" 
          directory="true" 
          multiple 
        />

        {isScanning && (
          <div className="mb-4">
            <div className="flex justify-between text-[10px] text-gray-400 font-mono mb-1">
              <span>Scanne {scanProgress} von {scanTotal} Tracks...</span>
              <span>{Math.round((scanProgress / Math.max(scanTotal, 1)) * 100)}%</span>
            </div>
            <div className="h-1 w-full bg-border-subtle rounded-full overflow-hidden">
              <div 
                className="h-full bg-accent-purple transition-all duration-300" 
                style={{ width: `${(scanProgress / Math.max(scanTotal, 1)) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div 
          onDragOver={e => e.preventDefault()}
          onDrop={handleFileDrop}
          className="border-2 border-dashed border-border-subtle rounded-xl p-4 flex flex-col items-center justify-center text-gray-500 cursor-pointer hover:bg-border-subtle/30 hover:border-accent-purple/50 transition-colors"
        >
          <UploadCloud className="w-6 h-6 mb-2" />
          <span className="text-xs font-medium uppercase tracking-wider text-center">Drop Audio Files<br/>(WAV/MP3/FLAC)</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tracks.map(track => (
          <div 
            key={track.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('trackId', track.id)}
            className="bg-bg-deep border border-border-subtle p-3 rounded-xl hover:border-accent-purple/50 cursor-grab active:cursor-grabbing transition-colors flex gap-3"
          >
            {track.coverArt ? (
              <img src={track.coverArt} className="w-12 h-12 rounded object-cover border border-border-subtle shrink-0" alt="Cover" />
            ) : (
              <div className="w-12 h-12 rounded bg-border-subtle flex items-center justify-center shrink-0">
                <Music className="w-5 h-5 text-gray-500" />
              </div>
            )}
            
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start mb-1">
                <div className="truncate pr-2">
                  <h4 className="text-sm font-bold truncate text-white">{track.title}</h4>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest truncate">{track.artist}</p>
                </div>
                <button 
                  onClick={() => onPlay(track)} 
                  className="p-1.5 bg-border-subtle hover:bg-accent-purple text-white rounded-md transition-colors shrink-0"
                >
                  <Play className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="px-1.5 py-0.5 bg-border-subtle text-[10px] rounded text-gray-300 font-mono">{track.bpm}</span>
                <span className="px-1.5 py-0.5 bg-accent-green/10 border border-accent-green/20 text-[10px] rounded text-accent-green font-mono">{track.key}</span>
                <span className="px-1.5 py-0.5 bg-accent-purple/10 border border-accent-purple/20 text-[10px] rounded text-accent-purple font-mono">E:{track.energy}</span>
              </div>
            </div>
          </div>
        ))}
        {tracks.length === 0 && !isScanning && (
          <div className="text-center text-gray-500 text-sm mt-8 p-4 border border-border-subtle border-dashed rounded-xl">
            Keine Tracks geladen. Bitte wähle einen Ordner aus.
          </div>
        )}
      </div>
    </div>
  );
}
