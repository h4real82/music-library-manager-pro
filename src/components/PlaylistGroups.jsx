import React, { useState } from 'react';
import { 
  Layers, 
  Settings2, 
  ListFilter, 
  X, 
  Sparkles,
  Search,
  ExternalLink
} from 'lucide-react';

/**
 * PlaylistGroups Component (Filter-Only Main View)
 * 
 * Anzeige und Filterung von Gruppen auf der Hauptseite.
 * Die Erstellung und Verwaltung von Gruppen ist exklusiv im MuLiMa Pro Library Manager möglich.
 *
 * @param {Object} props
 * @param {Array<{id: string, name: string, color?: string}>} props.groups - Liste der vorhandenen Gruppen
 * @param {string|null} props.selectedGroup - ID der aktuell aktiven Filter-Gruppe (null = alle)
 * @param {Function} props.onSelectGroup - Callback beim Auswählen/Abwählen einer Gruppe: (groupId: string | null) => void
 * @param {Function} [props.onOpenManager] - Callback zum Öffnen des Library Managers im Gruppen-Tab: (tab?: string) => void
 * @param {Array<Object>} [props.tracks] - Track-Liste zur Berechnung der Track-Anzahl pro Gruppe
 * @param {string} [props.className] - Zusätzliche CSS-Klassen
 */
export default function PlaylistGroups({
  groups = [],
  selectedGroup = null,
  onSelectGroup = () => {},
  onOpenManager = () => {},
  tracks = [],
  className = ''
}) {
  const [searchQuery, setSearchQuery] = useState('');

  // Ermittelt die Anzahl der Tracks pro Gruppe
  const getTrackCountForGroup = (groupId) => {
    if (!tracks || !Array.isArray(tracks)) return 0;
    return tracks.filter(t => t.groups && t.groups.includes(groupId)).length;
  };

  // Gefilterte Gruppen für die optionale Suche
  const filteredGroupsList = groups.filter(g => 
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`flex flex-col bg-[#161920] border border-[#242936] rounded-xl overflow-hidden shadow-lg ${className}`}>
      
      {/* Header mit Titel & Manager-Shortcut */}
      <div className="p-3 border-b border-[#242936] flex items-center justify-between bg-[#12141a]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#A855F7]/10 text-[#A855F7] border border-[#A855F7]/20">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Gruppen
            </h3>
            <span className="text-[10px] px-1.5 py-0.2 bg-[#242936] text-gray-400 font-mono rounded-full font-normal">
              {groups.length}
            </span>
          </div>
        </div>

        {/* Manager Shortcut Button */}
        <button
          id="btn-manage-groups-in-manager"
          type="button"
          onClick={() => onOpenManager('groups')}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold text-gray-400 hover:text-white bg-[#0D0E12] hover:bg-[#242936] border border-[#242936] transition-all"
          title="Gruppen im Library Manager verwalten"
        >
          <Settings2 className="w-3 h-3 text-[#A855F7]" />
          <span>Verwalten</span>
        </button>
      </div>

      {/* Filter-Leiste (Alle Tracks / Filter Reset) */}
      <div className="px-2.5 py-2 bg-[#12141a] border-b border-[#242936] flex items-center justify-between text-xs">
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
            className="flex items-center gap-1 text-[10px] text-[#F43F5E] hover:text-[#fb7185] transition-colors font-medium"
            title="Filter aufheben"
          >
            <X className="w-3 h-3" />
            <span>Zurücksetzen</span>
          </button>
        )}
      </div>

      {/* Suchfeld bei mehr als 4 Gruppen */}
      {groups.length > 4 && (
        <div className="px-2.5 py-1.5 border-b border-[#242936] bg-[#0D0E12] flex items-center gap-1.5">
          <Search className="w-3 h-3 text-gray-500 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Gruppen durchsuchen..."
            className="w-full bg-transparent text-[11px] text-white placeholder-gray-500 outline-none"
          />
        </div>
      )}

      {/* Gruppen-Liste */}
      <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="p-5 text-center text-gray-500 flex flex-col items-center justify-center">
            <Sparkles className="w-7 h-7 text-[#A855F7]/30 mb-2" />
            <p className="text-xs font-medium text-gray-400">Keine Gruppen angelegt</p>
            <p className="text-[10px] text-gray-600 mt-1 max-w-[200px] mb-3">
              Gruppen können im Library Manager erstellt und Tracks zugewiesen werden.
            </p>
            <button
              onClick={() => onOpenManager('groups')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#A855F7]/15 hover:bg-[#A855F7]/25 text-[#A855F7] border border-[#A855F7]/40 text-xs font-bold transition-all"
            >
              <span>+ Im Manager anlegen</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        ) : filteredGroupsList.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-500">
            Keine Gruppe für "{searchQuery}" gefunden.
          </div>
        ) : (
          filteredGroupsList.map(group => {
            const isSelected = selectedGroup === group.id;
            const count = getTrackCountForGroup(group.id);
            const groupColor = group.color || '#A855F7';

            return (
              <button
                key={group.id}
                id={`group-item-${group.id}`}
                type="button"
                onClick={() => onSelectGroup(isSelected ? null : group.id)}
                className={`w-full group flex items-center justify-between p-2 rounded-lg transition-all text-left border ${
                  isSelected
                    ? 'bg-[#242936] border-[#A855F7] shadow-[0_0_12px_rgba(168,85,247,0.2)] text-white'
                    : 'bg-[#0D0E12]/60 hover:bg-[#242936]/70 border-[#242936] text-gray-300'
                }`}
              >
                {/* Farbpunkt & Gruppenname */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span 
                    className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform group-hover:scale-125"
                    style={{ 
                      backgroundColor: groupColor,
                      boxShadow: isSelected ? `0 0 8px ${groupColor}` : 'none'
                    }} 
                  />
                  <span className={`text-xs truncate ${isSelected ? 'font-bold text-white' : 'font-medium text-gray-300 group-hover:text-white'}`}>
                    {group.name}
                  </span>
                </div>

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
              </button>
            );
          })
        )}
      </div>

      {/* Footer Info wenn Filter aktiv */}
      {selectedGroup && (
        <div className="p-2 bg-[#0D0E12] border-t border-[#242936] text-[10px] text-gray-400 flex items-center justify-between">
          <span className="truncate">
            Aktiv: <strong className="text-white">{groups.find(g => g.id === selectedGroup)?.name}</strong>
          </span>
          <span className="font-mono text-gray-500 shrink-0">
            {getTrackCountForGroup(selectedGroup)} Tracks
          </span>
        </div>
      )}

    </div>
  );
}
