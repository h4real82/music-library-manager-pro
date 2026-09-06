import React, { useState, useEffect, useRef } from 'react';

// 1. ABSOLUTER AUDIO AUDIO-FIX (Global verankert, wird nie zerstört)
const audioInstance = typeof window !== 'undefined' ? new Audio() : null;
if (audioInstance) audioInstance.volume = 0.9;

export function MulimaDashboard({ tracks, setTracks }) {
  // 2. STATES FÜR GRUPPEN & FILTER
  const [groups, setGroups] = useState(['Warmup', 'Peaktime', 'Afterhour']);
  const [newGroupName, setNewGroupName] = useState('');
  const [activeGroup, setActiveGroup] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Audio-Steuerung
  const playTrack = (track) => {
    if (!audioInstance) return;
    if (currentTrack?.id === track.id) {
      if (isPlaying) { audioInstance.pause(); setIsPlaying(false); }
      else { audioInstance.play(); setIsPlaying(true); }
    } else {
      audioInstance.pause();
      audioInstance.src = track.url;
      audioInstance.load();
      audioInstance.play().then(() => setIsPlaying(true)).catch(e => console.log(e));
      setCurrentTrack(track);
    }
  };

  // Gruppe erstellen (New)
  const addGroup = () => {
    if (newGroupName.trim() && !groups.includes(newGroupName)) {
      setGroups([...groups, newGroupName.trim()]);
      setNewGroupName('');
    }
  };

  // Gruppe löschen (Delete)
  const deleteGroup = (nameToDelete) => {
    setGroups(groups.filter(g => g !== nameToDelete));
    if (activeGroup === nameToDelete) setActiveGroup(null);
  };

  // Track einer Gruppe zuweisen (Edit/Assign)
  const toggleTrackGroup = (trackId, groupName) => {
    setTracks(tracks.map(t => {
      if (t.id === trackId) {
        const currentGroups = t.groups || [];
        const nextGroups = currentGroups.includes(groupName)
          ? currentGroups.filter(g => g !== groupName)
          : [...currentGroups, groupName];
        return { ...t, groups: nextGroups };
      }
      return t;
    }));
  };

  // 3. FILTER-LOGIK FÜR DIE LIBRARY
  const filteredTracks = tracks.filter(t => !activeGroup || (t.groups && t.groups.includes(activeGroup)));

  return (
    <div className="flex h-screen bg-[#0D0E12] text-white font-sans overflow-hidden">
      {/* SIDEBAR LINKS: GRUPPEN MANAGER */}
      <div className="w-64 bg-[#161920] border-r border-[#242936] p-4 flex flex-col gap-4">
        <h3 className="text-sm font-bold text-gray-400 tracking-wider uppercase">Custom Groups</h3>
        
        {/* Neue Gruppe anlegen */}
        <div className="flex gap-2">
          <input 
            type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Gruppe..." className="bg-[#0D0E12] border border-[#242936] rounded px-2 py-1 text-xs w-full focus:outline-none"
          />
          <button onClick={addGroup} className="bg-purple-600 px-3 py-1 rounded text-xs font-bold hover:bg-purple-700">+</button>
        </div>

        {/* Gruppenliste */}
        <div className="flex flex-col gap-1 overflow-y-auto flex-1">
          <button 
            onClick={() => setActiveGroup(null)}
            className={`text-left text-xs p-2 rounded ${!activeGroup ? 'bg-purple-600/20 text-purple-400 font-bold' : 'hover:bg-[#0D0E12]'}`}
          >
            📁 Alle Tracks
          </button>
          {groups.map(g => (
            <div key={g} className={`flex items-center justify-between text-xs p-1 rounded ${activeGroup === g ? 'bg-purple-600/20 text-purple-400 font-bold' : 'hover:bg-[#0D0E12]'}`}>
              <button onClick={() => setActiveGroup(g)} className="flex-1 text-left p-1">{g}</button>
              <button onClick={() => deleteGroup(g)} className="text-gray-500 hover:text-red-400 px-2">✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* TRACK GRID INTERFACE */}
      <div className="flex-1 p-6 overflow-y-auto pb-32">
        <h2 className="text-xl font-bold mb-4">{activeGroup ? `Gruppe: ${activeGroup}` : 'Library'}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredTracks.map(track => (
            <div key={track.id} className="bg-[#161920] border border-[#242936] p-3 rounded-xl flex flex-col gap-2 relative group">
              <div onClick={() => playTrack(track)} className="aspect-square w-full rounded-lg bg-gradient-to-tr from-purple-900 to-cyan-900 flex items-center justify-center cursor-pointer relative overflow-hidden">
                <span className="text-2xl">{currentTrack?.id === track.id && isPlaying ? '⏸' : '▶'}</span>
                <div className="absolute top-2 left-2 bg-black/60 px-1.5 py-0.5 rounded text-[10px] font-mono">{track.key || '8A'}</div>
              </div>
              <div className="text-xs font-bold truncate">{track.name}</div>
              
              {/* Dropdown für Gruppenzuweisung */}
              <div className="flex flex-wrap gap-1 mt-1">
                {groups.map(g => (
                  <button 
                    key={g} onClick={() => toggleTrackGroup(track.id, g)}
                    className={`text-[9px] px-1.5 py-0.5 rounded border ${track.groups?.includes(g) ? 'bg-purple-600 border-purple-500 text-white' : 'border-[#242936] text-gray-400 hover:bg-[#0D0E12]'}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
