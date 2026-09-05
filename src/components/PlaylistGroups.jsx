import React, { useState } from 'react';
import { 
  Folder, 
  Plus, 
  Tag, 
  Filter, 
  Edit2, 
  Trash2, 
  Check, 
  X, 
  Layers, 
  Music, 
  Sparkles, 
  Hash,
  ChevronRight,
  ListFilter
} from 'lucide-react';

const PRESET_COLORS = [
  { name: 'Purple', bg: 'bg-[#A855F7]', text: 'text-[#A855F7]', border: 'border-[#A855F7]/40', glow: 'rgba(168,85,247,0.3)', hex: '#A855F7' },
  { name: 'Cyan', bg: 'bg-[#06B6D4]', text: 'text-[#06B6D4]', border: 'border-[#06B6D4]/40', glow: 'rgba(6,182,212,0.3)', hex: '#06B6D4' },
  { name: 'Rose', bg: 'bg-[#F43F5E]', text: 'text-[#F43F5E]', border: 'border-[#F43F5E]/40', glow: 'rgba(244,63,94,0.3)', hex: '#F43F5E' },
  { name: 'Green', bg: 'bg-[#22C55E]', text: 'text-[#22C55E]', border: 'border-[#22C55E]/40', glow: 'rgba(34,197,94,0.3)', hex: '#22C55E' },
  { name: 'Amber', bg: 'bg-[#F59E0B]', text: 'text-[#F59E0B]', border: 'border-[#F59E0B]/40', glow: 'rgba(245,158,11,0.3)', hex: '#F59E0B' },
  { name: 'Blue', bg: 'bg-[#3B82F6]', text: 'text-[#3B82F6]', border: 'border-[#3B82F6]/40', glow: 'rgba(59,130,246,0.3)', hex: '#3B82F6' },
];

/**
 * PlaylistGroups Component
 * 
 * Ermöglicht das Erstellen, Bearbeiten, Löschen und Filtern eigener Musik-Gruppen/Tags.
 *
 * @param {Object} props
 * @param {Array<{id: string, name: string, color?: string}>} props.groups - Liste der vorhandenen Gruppen
 * @param {string|null} props.selectedGroup - ID der aktuell aktiven Filter-Gruppe (null = alle)
 * @param {Function} props.onSelectGroup - Callback beim Auswählen/Abwählen einer Gruppe: (groupId: string | null) => void
 * @param {Function} props.onCreateGroup - Callback beim Erstellen: (group: {id: string, name: string, color: string}) => void
 * @param {Function} props.onDeleteGroup - Callback beim Löschen: (groupId: string) => void
 * @param {Function} [props.onUpdateGroup] - Callback beim Umbenennen/Farbänderung: (id: string, updates: Object) => void
 * @param {Array<Object>} [props.tracks] - Optionale Track-Liste zur automatischen Berechnung der Track-Anzahl pro Gruppe
 * @param {string} [props.className] - Zusätzliche CSS-Klassen
 */
export default function PlaylistGroups({
  groups = [],
  selectedGroup = null,
  onSelectGroup = () => {},
  onCreateGroup = () => {},
  onDeleteGroup = () => {},
  onUpdateGroup = () => {},
  tracks = [],
  className = ''
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedColorHex, setSelectedColorHex] = useState(PRESET_COLORS[0].hex);
  
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editName, setEditName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Ermittelt die Anzahl der Tracks pro Gruppe
  const getTrackCountForGroup = (groupId) => {
    if (!tracks || !Array.isArray(tracks)) return 0;
    return tracks.filter(t => t.groups && t.groups.includes(groupId)).length;
  };

  // Erstellen abschließen
  const handleSubmitCreate = (e) => {
    if (e) e.preventDefault();
    const trimmed = newGroupName.trim();
    if (!trimmed) return;

    const newGroup = {
      id: 'grp_' + Math.random().toString(36).substring(2, 9),
      name: trimmed,
      color: selectedColorHex,
      createdAt: Date.now()
    };

    onCreateGroup(newGroup);
    setNewGroupName('');
    setIsCreating(false);
    // Optional direkt auswählen
    onSelectGroup(newGroup.id);
  };

  // Bearbeiten speichern
  const handleSaveEdit = (groupId) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditingGroupId(null);
      return;
    }
    onUpdateGroup(groupId, { name: trimmed });
    setEditingGroupId(null);
    setEditName('');
  };

  // Gefilterte Gruppen für die Suche
  const filteredGroupsList = groups.filter(g => 
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`flex flex-col bg-[#161920] border border-[#242936] rounded-xl overflow-hidden shadow-lg ${className}`}>
      
      {/* Header */}
      <div className="p-3.5 border-b border-[#242936] flex items-center justify-between bg-[#12141a]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#A855F7]/10 text-[#A855F7] border border-[#A855F7]/20">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
              Eigene Gruppen
              <span className="text-[10px] px-1.5 py-0.2 bg-[#242936] text-gray-400 font-mono rounded-full font-normal">
                {groups.length}
              </span>
            </h3>
          </div>
        </div>

        <button
          id="btn-create-new-group"
          onClick={() => {
            setIsCreating(!isCreating);
            if (!isCreating) {
              setNewGroupName('');
            }
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-sm ${
            isCreating 
              ? 'bg-[#242936] text-gray-300 hover:text-white' 
              : 'bg-[#A855F7] hover:bg-[#b56ef8] text-white shadow-[#A855F7]/20'
          }`}
          title="Neue Gruppe erstellen"
        >
          {isCreating ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          <span>{isCreating ? 'Abbrechen' : 'Neu'}</span>
        </button>
      </div>

      {/* Formular zur Gruppenerstellung */}
      {isCreating && (
        <form 
          onSubmit={handleSubmitCreate} 
          className="p-3 bg-[#0D0E12] border-b border-[#242936] flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="flex items-center gap-2">
            <Tag className="w-3.5 h-3.5 text-[#A855F7] shrink-0" />
            <input
              id="input-new-group-name"
              autoFocus
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Gruppenname (z. B. Peaktime Drops, Vocal)..."
              className="flex-1 bg-[#161920] border border-[#242936] focus:border-[#A855F7] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 outline-none transition-colors"
            />
          </div>

          {/* Farbwahl */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-gray-400 font-mono">Akzentfarbe:</span>
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map(c => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setSelectedColorHex(c.hex)}
                  className={`w-5 h-5 rounded-full transition-transform flex items-center justify-center ${c.bg} ${
                    selectedColorHex === c.hex 
                      ? 'scale-125 ring-2 ring-white shadow-[0_0_8px_' + c.glow + ']' 
                      : 'opacity-70 hover:opacity-100 hover:scale-110'
                  }`}
                  title={c.name}
                >
                  {selectedColorHex === c.hex && <Check className="w-3 h-3 text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-2.5 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-[#242936] transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={!newGroupName.trim()}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#22C55E] hover:bg-[#1eb053] disabled:opacity-40 disabled:hover:bg-[#22C55E] text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Erstellen</span>
            </button>
          </div>
        </form>
      )}

      {/* Filter-Leiste (Filter Übersicht & Reset) */}
      <div className="px-3 py-2 bg-[#12141a] border-b border-[#242936] flex items-center justify-between text-xs">
        <button
          id="btn-filter-all-groups"
          onClick={() => onSelectGroup(null)}
          className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
            selectedGroup === null
              ? 'bg-[#A855F7]/20 border border-[#A855F7] text-white shadow-[0_0_10px_rgba(168,85,247,0.2)] font-bold'
              : 'bg-[#0D0E12] border border-[#242936] text-gray-400 hover:text-white hover:border-gray-500'
          }`}
        >
          <ListFilter className="w-3 h-3 text-[#A855F7]" />
          <span>Alle Tracks</span>
          <span className="font-mono text-[10px] text-gray-400">({tracks.length})</span>
        </button>

        {selectedGroup && (
          <button
            onClick={() => onSelectGroup(null)}
            className="flex items-center gap-1 text-[11px] text-[#F43F5E] hover:text-[#fb7185] transition-colors font-medium"
            title="Filter aufheben"
          >
            <X className="w-3 h-3" />
            <span>Filter aufheben</span>
          </button>
        )}
      </div>

      {/* Suchfeld bei mehreren Gruppen */}
      {groups.length > 5 && (
        <div className="px-3 py-1.5 border-b border-[#242936] bg-[#0D0E12]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Gruppen durchsuchen..."
            className="w-full bg-[#161920] border border-[#242936] rounded px-2 py-1 text-[11px] text-white placeholder-gray-500 outline-none focus:border-[#A855F7]"
          />
        </div>
      )}

      {/* Gruppen-Liste */}
      <div className="p-2 space-y-1 max-h-72 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="p-6 text-center text-gray-500 flex flex-col items-center justify-center">
            <Sparkles className="w-8 h-8 text-[#A855F7]/30 mb-2" />
            <p className="text-xs font-medium text-gray-400">Keine Gruppen vorhanden</p>
            <p className="text-[10px] text-gray-600 mt-1 max-w-[200px]">
              Klicke oben auf "+ Neu", um deine Tracks nach Stimmung, Drops oder Set-Phasen zu gruppieren.
            </p>
          </div>
        ) : filteredGroupsList.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-500">
            Keine passende Gruppe für "{searchQuery}" gefunden.
          </div>
        ) : (
          filteredGroupsList.map(group => {
            const isSelected = selectedGroup === group.id;
            const isEditing = editingGroupId === group.id;
            const count = getTrackCountForGroup(group.id);
            const groupColor = group.color || '#A855F7';

            return (
              <div
                key={group.id}
                id={`group-item-${group.id}`}
                onClick={() => {
                  if (!isEditing) {
                    onSelectGroup(isSelected ? null : group.id);
                  }
                }}
                className={`group flex items-center justify-between p-2 rounded-lg transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-[#242936] border-[#A855F7] shadow-[0_0_12px_rgba(168,85,247,0.15)] text-white'
                    : 'bg-[#0D0E12]/50 hover:bg-[#242936]/70 border-[#242936] text-gray-300'
                }`}
              >
                {/* Bearbeiten-Modus */}
                {isEditing ? (
                  <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(group.id);
                        if (e.key === 'Escape') setEditingGroupId(null);
                      }}
                      className="flex-1 bg-[#161920] border border-[#A855F7] rounded px-2 py-1 text-xs text-white outline-none"
                    />
                    <button
                      onClick={() => handleSaveEdit(group.id)}
                      className="p-1 rounded hover:bg-[#22C55E]/20 text-[#22C55E]"
                      title="Speichern"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingGroupId(null)}
                      className="p-1 rounded hover:bg-[#F43F5E]/20 text-gray-400 hover:text-[#F43F5E]"
                      title="Abbrechen"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Normal-Ansicht mit Farbpunkt & Name */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                        style={{ 
                          backgroundColor: groupColor,
                          boxShadow: isSelected ? `0 0 8px ${groupColor}` : 'none'
                        }} 
                      />
                      <span className={`text-xs font-medium truncate ${isSelected ? 'font-bold text-white' : 'text-gray-300 group-hover:text-white'}`}>
                        {group.name}
                      </span>
                    </div>

                    {/* Rechte Seite: Counter & Aktionen */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Track Counter Badge */}
                      <span 
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                          isSelected 
                            ? 'bg-[#A855F7]/30 text-white font-bold' 
                            : 'bg-[#161920] text-gray-500 group-hover:text-gray-300'
                        }`}
                      >
                        {count}
                      </span>

                      {/* Action Buttons (Hover) */}
                      <div 
                        className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" 
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => {
                            setEditingGroupId(group.id);
                            setEditName(group.name);
                          }}
                          className="p-1 rounded text-gray-500 hover:text-white hover:bg-[#161920] transition-colors"
                          title="Gruppe umbenennen"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onDeleteGroup(group.id)}
                          className="p-1 rounded text-gray-500 hover:text-[#F43F5E] hover:bg-[#F43F5E]/10 transition-colors"
                          title="Gruppe löschen"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info / Status */}
      {selectedGroup && (
        <div className="p-2.5 bg-[#0D0E12] border-t border-[#242936] text-[11px] text-gray-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-[#A855F7]">
            <Filter className="w-3.5 h-3.5 animate-pulse" />
            <span className="font-medium truncate">
              Filter aktiv: <span className="text-white font-bold">{groups.find(g => g.id === selectedGroup)?.name}</span>
            </span>
          </div>
          <span className="font-mono text-[10px] text-gray-500">
            {getTrackCountForGroup(selectedGroup)} Treffer
          </span>
        </div>
      )}

    </div>
  );
}
