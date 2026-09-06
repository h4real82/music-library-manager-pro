# MuLiMa Pro — Music Library Manager Pro & DJ Set Studio

<div align="center">
  <h3>Professionelle KI-unterstützte Musik-Bibliothek, Harmonic Mixing & DJ Set Zeitleiste</h3>
  <p>Entwickelt für DJs, Producer und Musik-Kuratoren zur nahtlosen Vorbereitung von Live-Sets mit echten Techno-Mixing-Techniken.</p>
</div>

---

## ⚡ Schnellstart auf einem anderen PC

Du möchtest **MuLiMa Pro** auf einem anderen PC (z. B. Windows-Laptop, MacBook oder Linux-Workstation) installieren und starten? Das geht in wenigen Schritten:

### 🖥️ Option 1: 1-Klick Start (Windows)
1. Klone oder lade das Repository auf deinen PC herunter:
   ```bash
   git clone https://github.com/h4real82/music-library-manager-pro.git
   ```
2. Mache einen **Doppelklick auf `start.bat`**:
   - Das Skript prüft automatisch Node.js.
   - Installiert beim ersten Start alle benötigten Pakete (`npm install`).
   - Erstellt den Musik-Ordner `LIBRARY\`.
   - Öffnet deinen Browser automatisch auf `http://localhost:3000` und startet den Server.

---

### 💻 Option 2: Manuelle Installation (Windows, macOS, Linux)

#### Voraussetzungen
- [Node.js](https://nodejs.org/) (Version 18 oder höher) **oder** [Bun](https://bun.sh/)
- Ein moderner Webbrowser (Chrome, Edge, Brave, Firefox, Safari)

#### Schritte
```bash
# 1. Repository klonen
git clone https://github.com/h4real82/music-library-manager-pro.git
cd music-library-manager-pro

# 2. Abhängigkeiten installieren
npm install
# oder mit Bun:
# bun install

# 3. Entwicklungs-Server starten
npm run dev
# oder mit Bun:
# bun run dev
```
Öffne anschließend [http://localhost:3000](http://localhost:3000) im Browser.

---

### 🎵 Musikdateien hinzufügen
Es gibt zwei einfache Wege, um deine Musiksammlung in die App zu laden:

1. **Lokaler Ordner `LIBRARY/` (Empfohlen für Desktop-Betrieb)**:
   - Kopiere deine MP3-, WAV-, FLAC-, AAC- oder OGG-Dateien direkt in den Ordner `LIBRARY/` im Projektverzeichnis (Unterordner werden automatisch rekursiv durchsucht).
   - Die App liest Metadaten, BPM, Tonarten und Albumbilder direkt ein.
2. **Web-Import im Browser (HTML5 File API)**:
   - Klicke in der App oben links auf **"Library Manager"** oder den Import-Button.
   - Wähle **"Dateien importieren"** oder **"Ganzen Ordner importieren"**, oder ziehe Audio-Dateien per **Drag & Drop** in das Browser-Fenster.

---

## 🌐 Direkt im Browser betreiben über GitHub Pages

**MuLiMa Pro kann vollständig serverlos als moderne Web-App über GitHub Pages betrieben werden!**

Da die Audio-Engine, Wellenform-Generierung, Takt-Analyse und Set-Verwaltung auf **HTML5 Web Audio API** und **IndexedDB** basieren, läuft die App nach dem Deployment direkt im Browser:

### So aktivierst du GitHub Pages für dein Repository:

#### Option A: Automatisch über GitHub Actions
1. Gehe in deinem GitHub-Repository auf den Tab **Actions** ➔ **New workflow** ➔ **set up a workflow yourself**.
2. Nenne die Datei `deploy.yml` und füge folgenden Inhalt ein:
   ```yaml
   name: Deploy to GitHub Pages
   on:
     push:
       branches: [main]
   permissions:
     contents: read
     pages: write
     id-token: write
   concurrency:
     group: 'pages'
     cancel-in-progress: true
   jobs:
     build-and-deploy:
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 20
         - run: npm install
         - run: npm run build
         - uses: actions/configure-pages@v4
         - uses: actions/upload-pages-artifact@v3
           with:
             path: './dist'
         - id: deployment
           uses: actions/deploy-pages@v4
   ```
3. Gehe im Repository auf **Settings** ➔ **Pages** und stelle unter **Build and deployment / Source** auf **`GitHub Actions`** um.
4. Deine Web-App ist unter folgender URL live erreichbar:
   ```
   https://h4real82.github.io/music-library-manager-pro/
   ```

#### Option B: Lokaler Build & Push auf den `gh-pages` Branch
Falls du Actions nicht nutzen möchtest, kannst du die gebauten Dateien direkt deployen:
```bash
npm run build
npx gh-pages -d dist
```

> 💡 **Hinweis zum Betrieb auf GitHub Pages**:  
> Auf GitHub Pages läuft die App **100% autark im Browser**. Da kein lokaler Node-Server für den Festplatten-Ordner `LIBRARY/` vorhanden ist, lädst du deine Musikdateien einfach per Drag & Drop oder über *"Dateien / Ordner importieren"* in die App. Alle Analysen, BPM, Camelot-Tonarten, 720-Slice-Wellenformen und Sets werden in der lokalen Browser-Datenbank (**IndexedDB**) sicher gespeichert.

---

## 🎛️ Walkthrough: Alle Funktionen im Überblick

MuLiMa Pro vereint die Bibliotheksverwaltung von Rekordbox/Traktor mit der visuellen Mehrspur-Bearbeitung von Mixmeister und DJ.Studio.

### 1. Musik-Bibliothek & Intelligente Kuration
- **4 Ansichtsmodi**:
  - 🎴 **Cover View**: Große Vinyl-Cover-Karten mit direkter CUE- und BPM-Übersicht.
  - 📋 **List View**: Schnelle DJ-Tabelle mit **benutzerdefinierten Spalten** (Cover, Titel, Album, BPM, Key, Energy, Genre, Dauer, Aktionen nach Belieben ein-/ausblendbar).
  - 🌌 **Scatter Plot**: 2D-Energiediagramm nach BPM und Energy-Level.
  - 🕸️ **Graph Map**: Die interaktive Set-Baufläche.
- **Camelot Harmonic Wheel (1A – 12B)**:
  - Harmonische Tonarterkennung für fehlerfreies Key-Mixing (Perfect Match, +1/-1 Energy Shift, Relative Dur/Moll).
- **Intelligente Duplikate-Bereinigung**:
  - Erkennt Dubletten anhand von Dateipfaden, ID3-Signaturen und Bitraten und bereinigt diese mit einem Klick.
- **DJ-Filter**:
  - Filter nach BPM-Bereichen, Genres, Stimmungen oder Stilen (Warmup, Peaktime, Minimal, Psy Trance, Afterhour).

---

### 2. Track-Analyse & Precision Deck Studio
Klicke bei einem Track auf **"Studio"**, um in das Analyse-Deck zu wechseln:
- **720-Slice Fluid Waveform**: Hochauflösende, frequenzgetrennte Wellenform (Bässe, Mitten, Höhen farblich differenziert).
- **Hot-Cue Slots (1 – 5)**:
  - Slot 1: *Intro Mix In*
  - Slot 2: *Bass Entry*
  - Slot 3: *Main Drop*
  - Slot 4: *Peak Drop*
  - Slot 5: *Outro Mix Out*
- **Dynamische Loop-Slots**:
  - Setze beliebige Takt-Loops (1, 2, 4, 8, 16, 32 Beats).
  - Ein gespeicherter Loop ordnet sich automatisch chronologisch an die richtige Position in der Track-Struktur ein; nachfolgende Cues rücken auf.
- **3-Band Spektrum Visualizer**: Echzeit-Pegelanzeige für Bässe, Mitten und Höhen während der Wiedergabe.
- **DSP EQ-Rack**:
  - 3-Band Equalizer mit Kill-Switches für Low, Mid und High.
- **Online-Portale**:
  - Direkte Verknüpfungen zu Beatport, Discogs, Traxsource und Spotify zum Abgleich von Track-Informationen.

---

### 3. DJ Graph Map (Node Graph)
In der Graph-Map-Ansicht baust du dein Set visuell als Netzwerk zusammen:
- **2D-Canvas mit Zoom & Pan**:
  - Stufenloses Zoomen (Mausrad oder Toolbar-Buttons) und Verschieben der Arbeitsfläche.
- **Track-Knoten mit Ein- und Ausgangs-Ports**:
  - Jeder CUE- und Loop-Slot besitzt einen Connector-Punkt.
- **Stabiles Slot-Verbinden**:
  - **Click-to-Connect**: Klicke auf den rechten Ausgangs-Port von Slot A (z. B. *Outro Mix Out*); der Verbindungsmodus aktiviert sich und gültige Ziel-Slots pulsieren grün. Ein Klick auf Slot B (z. B. *Intro Mix In*) stellt die Verbindung her.
  - **Drag-and-Drop**: Ziehe eine Verbindungslinie mit der Maus direkt von Port zu Port.
- **5 Techno-Übergangstechniken als Presets**:
  1. 🎚️ **EQ-Wechsel (Equalizer Blend)**: Frequenzbänder beider Tracks werden über 32/64 Beats gegeneinander ausgespielt.
  2. ⚡ **Bass-Swap (Instant Low-End Switch)**: Tauscht die Bässe schlagartig exakt auf dem ersten Beat ("auf die Eins") der neuen Phrase aus (0-50ms Antiklick-Rampe).
  3. 🌊 **Filter-Sweep (HPF Transition)**: High-Pass Filter fährt von 20 Hz auf 2000 Hz hoch und lässt Track A dramatisch ausdünnen, bevor Track B droppt.
  4. ✂️ **Cut / Drop (Fader Slam)**: Abrupter Wechsel ohne Überlappung bei Breaks.
  5. 📈 **Gain Crossfade (Equal-Power)**: Sinus/Cosinus-Lautstärkekurve für konstanten Schalldruck ohne Pegel-Einbruch in der Mitte.

---

### 4. Waveform Timeline Studio (Mehrspur-Zeitleiste)
Schalte oben rechts auf **"Waveform Timeline"** um:
- **Mehrspurige DJ-Zeitleiste**:
  - Alle Tracks des Sets werden untereinander als Spuren auf einer globalen Zeit- und Taktleiste dargestellt.
- **Horizontales Verschieben (Wellenform packen)**:
  - Packe eine Wellenform mit der Maus und ziehe sie nach links oder rechts.
  - **Stationärer Übergangsrahmen**: Der Rahmen des Übergangs bleibt **fest an Track A verankert**. Track B gleitet horizontal unter dem Übergangsfenster hindurch!
  - **Takt-Raster Einrastung (Beatgrid Snap)**: Beim Loslassen rastet Track B automatisch am 4-Takt-Raster (Bars) relativ zu Track A ein. Beide Tracks laufen nach dem Verschieben absolut synchron im Takt! *(Halte Shift für 1-Beat-Schritte)*.
- **Gemeinsamer Übergangsrahmen über beide Spuren**:
  - Der Leucht-Rahmen umrandet Track A und Track B am Übergangsbereich.
  - Eingeblendete **3-Band EQ-Hüllkurven**:
    - 🟠 **Orange**: Tief / Bass
    - 🟡 **Gelb**: Mitten
    - 🔵 **Cyan**: Höhen
- **Waveform Transition Overlap Studio**:
  - Klicke auf den Button **"Hüllkurven"** am Übergangsrahmen, um ein Vollbild-Studio zu öffnen: Passe Kontrollpunkte der Frequenzen mit der Maus an und teste den Übergang mit dem integrierten Probehör-Player.

---

### 5. Taktgitter- & Phasen-Reparatur Studio
Falls Lieder mal nicht zu 100% synchron laufen oder das Taktgitter verschoben ist:
- Klicke auf den Button **"Gitter"** in der Zeitleiste oder im Player:
- **Phase Nudge**: Buttons für `±10 ms`, `±1/4 Beat` und `±1 Beat`.
- **Takt-Eins Neuausrichtung**: Setzt den ersten Schlag des Rasters exakt an die aktuelle Playhead-Position.
- **Auto Phase-Lock**: Synchronisiert die Phase von Deck B automatisch mit Deck A.
- **BPM-Korrektur**: Feintuning in `0.1`-Schritten, Halftime (`/2`) und Doubletime (`x2`).
- **Akustisches Metronom**: Integrierter Klick-Generator zum hörbaren Abgleich mit dem Beat.

---

### 6. DJ Set Player & M3U-Export
- **Globaler Set Player** am unteren Bildschirmrand:
  - Steuert Deck A und Deck B synchron.
  - Automatischer Crossfader fährt während des Übergangs nach den definierten Kurven.
  - **Phase Sync** Button gleicht Phasenunterschiede live an.
  - **M3U Export**: Exportiere das fertige Set mit einem Klick als M3U-Playliste für USB-Sticks, Pioneer CDJs oder DJ-Software.

---

## 🛠️ Technologie-Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Bundler & Server**: Vite 6, Connect / Express Middleware
- **Audio-Engine**: Web Audio API (BiquadFilterNode, GainNode, AudioBufferSourceNode, AnalyserNode)
- **Metadaten & ID3**: `jsmediatags`
- **Lokale Datenbank**: IndexedDB via `idb`
- **Testing & E2E**: Playwright Test Suite

---

## 📄 Lizenz
MIT License — Frei verwendbar für private und professionelle DJ-Sets.
