import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines, Download, FileAudio, Music2, Pause, Play, RotateCcw,
  SlidersHorizontal, Upload, Volume2, Waves
} from "lucide-react";

const FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const DEFAULT_EQ = Array(10).fill(0);

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function encodeWav(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const frames = audioBuffer.length;
  const bytesPerSample = 2;
  const dataSize = frames * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channelData = Array.from({ length: channels }, (_, i) => audioBuffer.getChannelData(i));
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function renderProcessedAudio(file, speed, eqValues, onProgress) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Este navegador no admite Web Audio.");

  const decodeContext = new AudioContextClass();
  try {
    const data = await file.arrayBuffer();
    const decoded = await decodeContext.decodeAudioData(data.slice(0));
    const renderedDuration = decoded.duration / speed;
    const frameCount = Math.ceil(renderedDuration * decoded.sampleRate);
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineContext) throw new Error("La exportación no está disponible en este navegador.");

    const offline = new OfflineContext(
      decoded.numberOfChannels,
      frameCount,
      decoded.sampleRate
    );

    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.playbackRate.value = speed;

    let previous = source;
    FREQUENCIES.forEach((frequency, index) => {
      const filter = offline.createBiquadFilter();
      filter.type = index === 0 ? "lowshelf" : index === FREQUENCIES.length - 1 ? "highshelf" : "peaking";
      filter.frequency.value = Math.min(frequency, decoded.sampleRate / 2);
      filter.Q.value = 1.4;
      filter.gain.value = eqValues[index];
      previous.connect(filter);
      previous = filter;
    });

    previous.connect(offline.destination);
    source.start(0);
    onProgress?.(25);
    const rendered = await offline.startRendering();
    onProgress?.(90);
    return encodeWav(rendered);
  } finally {
    await decodeContext.close().catch(() => {});
  }
}

export default function App() {
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceRef = useRef(null);
  const filtersRef = useRef([]);
  const objectUrlRef = useRef(null);

  const [file, setFile] = useState(null);
  const [speed, setSpeed] = useState(1);
  const [eq, setEq] = useState(DEFAULT_EQ);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [message, setMessage] = useState("Listo para importar música");
  const [error, setError] = useState("");

  const eqLabels = useMemo(() => FREQUENCIES.map((frequency) =>
    frequency >= 1000 ? `${frequency / 1000}k` : `${frequency}`
  ), []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => setCurrentTime(audio.currentTime || 0);
    const loaded = () => setDuration(audio.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("timeupdate", update);
    audio.addEventListener("loadedmetadata", loaded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onPause);
    return () => {
      audio.removeEventListener("timeupdate", update);
      audio.removeEventListener("loadedmetadata", loaded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onPause);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = speed;
      audio.preservesPitch = false;
      audio.mozPreservesPitch = false;
      audio.webkitPreservesPitch = false;
    }
  }, [speed]);

  useEffect(() => {
    filtersRef.current.forEach((filter, index) => {
      if (audioContextRef.current && filter) {
        filter.gain.setTargetAtTime(eq[index], audioContextRef.current.currentTime, 0.015);
      }
    });
  }, [eq]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
  }, []);

  async function setupAudioGraph() {
    if (audioContextRef.current) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Tu navegador no admite Web Audio.");
    const context = new AudioContextClass();
    const source = context.createMediaElementSource(audioRef.current);
    let previous = source;
    const filters = FREQUENCIES.map((frequency, index) => {
      const filter = context.createBiquadFilter();
      filter.type = index === 0 ? "lowshelf" : index === FREQUENCIES.length - 1 ? "highshelf" : "peaking";
      filter.frequency.value = Math.min(frequency, context.sampleRate / 2);
      filter.Q.value = 1.4;
      filter.gain.value = eq[index];
      previous.connect(filter);
      previous = filter;
      return filter;
    });
    previous.connect(context.destination);
    audioContextRef.current = context;
    sourceRef.current = source;
    filtersRef.current = filters;
  }

  async function handleFile(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith("audio/")) {
      setError("Selecciona un archivo de audio válido.");
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(selected);
    objectUrlRef.current = url;
    setFile(selected);
    setError("");
    setMessage("Pista cargada correctamente");
    setCurrentTime(0);
    setDuration(0);
    audioRef.current.src = url;
    audioRef.current.load();
    try {
      await setupAudioGraph();
    } catch (err) {
      setError(err.message || "No se pudo iniciar el procesamiento de audio.");
    }
  }

  async function togglePlayback() {
    if (!file) return;
    try {
      await setupAudioGraph();
      if (audioContextRef.current.state === "suspended") await audioContextRef.current.resume();
      if (audioRef.current.paused) await audioRef.current.play();
      else audioRef.current.pause();
    } catch (err) {
      setError(err.message || "No se pudo reproducir el audio.");
    }
  }

  async function restart() {
    if (!file) return;
    audioRef.current.currentTime = 0;
    await togglePlaybackIfPaused();
  }

  async function togglePlaybackIfPaused() {
    if (audioRef.current.paused) {
      try {
        await setupAudioGraph();
        if (audioContextRef.current.state === "suspended") await audioContextRef.current.resume();
        await audioRef.current.play();
      } catch (err) {
        setError(err.message || "No se pudo reproducir el audio.");
      }
    }
  }

  function resetAll() {
    setSpeed(1);
    setEq(DEFAULT_EQ);
    setError("");
    setMessage("Ajustes restablecidos");
  }

  function setBand(index, value) {
    setEq((previous) => previous.map((item, i) => i === index ? Number(value) : item));
  }

  async function downloadAudio() {
    if (!file || exporting) return;
    setError("");
    setExporting(true);
    setExportProgress(5);
    setMessage("Procesando audio para exportación...");
    try {
      const blob = await renderProcessedAudio(file, speed, eq, setExportProgress);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const baseName = file.name.replace(/\.[^.]+$/, "") || "audio";
      anchor.href = url;
      anchor.download = `${baseName}_ChipeoPresionV2.wav`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setExportProgress(100);
      setMessage("Audio exportado correctamente");
    } catch (err) {
      setError(err.message || "No se pudo exportar el audio. Prueba con otro archivo.");
      setMessage("Error al exportar");
    } finally {
      setExporting(false);
      setTimeout(() => setExportProgress(0), 1200);
    }
  }

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="/" aria-label="Chipeo Presion V2 Music Studio">
          <div className="brand-mark"><AudioLines size={25} /></div>
          <div>
            <div className="brand-name">CHIPEO PRESION <span>V2</span></div>
            <div className="brand-subtitle">MUSIC STUDIO · AUDIO CONTROL</div>
          </div>
        </a>
        <div className="edition">V2 EDITION</div>
      </header>

      <main className="studio">
        <section className="intro">
          <div className="eyebrow"><span className="live-dot" /> AUDIO WORKSPACE</div>
          <h1>Tu música. <span>Tu sonido.</span></h1>
          <p>Controla velocidad, tono y ecualización. Exporta el resultado con tus ajustes aplicados.</p>
        </section>

        <section className={`upload-zone ${file ? "has-file" : ""}`} onClick={() => fileInputRef.current?.click()}>
          <input ref={fileInputRef} type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac" onChange={handleFile} />
          <div className="upload-icon"><Upload size={23} /></div>
          <div className="upload-copy">
            <strong>{file ? "CAMBIAR ARCHIVO DE AUDIO" : "IMPORTAR TU MÚSICA"}</strong>
            <span>{file ? "Selecciona otra pista para comenzar de nuevo" : "MP3, WAV, OGG, M4A y otros formatos compatibles con tu navegador"}</span>
          </div>
          <div className="select-file">{file ? "CAMBIAR" : "SELECCIONAR"} <span>↗</span></div>
        </section>

        <section className="track-panel">
          <div className="track-info">
            <div className="track-art"><Music2 size={24} /></div>
            <div className="track-meta">
              <strong title={file?.name}>{file?.name || "Ninguna pista cargada"}</strong>
              <span>{file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB · ${message}` : message}</span>
            </div>
            <div className="track-status"><span /> {file ? "TRACK LOADED" : "READY"}</div>
          </div>
          <div className="timeline">
            <span>{formatTime(currentTime)}</span>
            <input
              aria-label="Posición de reproducción"
              type="range"
              min="0"
              max={duration || 0}
              step="0.01"
              value={Math.min(currentTime, duration || 0)}
              disabled={!file || !duration}
              style={{ "--range-progress": `${progress}%` }}
              onChange={(event) => {
                const value = Number(event.target.value);
                audioRef.current.currentTime = value;
                setCurrentTime(value);
              }}
            />
            <span>{formatTime(duration)}</span>
          </div>
          <div className="player-actions">
            <button className="icon-button" onClick={restart} disabled={!file} aria-label="Reiniciar"><RotateCcw size={18} /></button>
            <button className="play-button" onClick={togglePlayback} disabled={!file}>
              {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
              {playing ? "PAUSAR" : "REPRODUCIR"}
            </button>
            <div className="volume-note"><Volume2 size={16} /> AUDIO LOCAL</div>
          </div>
          <audio ref={audioRef} preload="metadata" />
        </section>

        <div className="section-heading">
          <div><SlidersHorizontal size={18} /><h2>PROCESAMIENTO DE AUDIO</h2></div>
          <span>AJUSTES EN TIEMPO REAL</span>
        </div>

        <section className="speed-panel">
          <div className="control-title">
            <div><span className="control-icon"><Waves size={17} /></span><strong>VELOCIDAD Y TONO</strong></div>
            <output>{speed.toFixed(2)}×</output>
          </div>
          <input
            className="main-range"
            type="range"
            min="0.5"
            max="2"
            step="0.01"
            value={speed}
            style={{ "--range-progress": `${((speed - 0.5) / 1.5) * 100}%` }}
            onChange={(event) => setSpeed(Number(event.target.value))}
          />
          <div className="range-labels"><span>0.50× LENTO</span><span>1.00× NORMAL</span><span>2.00× RÁPIDO</span></div>
          <p className="helper-text">La velocidad y el tono cambian juntos: más lento suena más grave y más rápido suena más agudo.</p>
        </section>

        <section className="eq-panel">
          <div className="eq-header">
            <div><div className="eq-symbol"><AudioLines size={18} /></div><div><h2>EQUALIZADOR</h2><span>10 BANDAS · −12 dB A +12 dB</span></div></div>
            <button className="text-button" onClick={() => setEq(DEFAULT_EQ)}>EQ PLANO <RotateCcw size={14} /></button>
          </div>
          <div className="eq-grid">
            {FREQUENCIES.map((frequency, index) => (
              <div className="eq-band" key={frequency}>
                <strong>{eqLabels[index]}</strong>
                <div className="slider-wrap">
                  <input
                    aria-label={`${frequency} Hz`}
                    type="range"
                    min="-12"
                    max="12"
                    step="0.5"
                    value={eq[index]}
                    onChange={(event) => setBand(index, event.target.value)}
                  />
                </div>
                <small>{eq[index] > 0 ? "+" : ""}{eq[index].toFixed(1)} dB</small>
              </div>
            ))}
          </div>
          <div className="eq-footer"><span>31 Hz</span><span>FRECUENCIA</span><span>16 kHz</span></div>
        </section>

        <section className="export-panel">
          <div className="export-copy">
            <div className="export-icon"><FileAudio size={20} /></div>
            <div><strong>EXPORTAR AUDIO MODIFICADO</strong><span>Descarga tu pista con velocidad y ecualización aplicadas.</span></div>
          </div>
          <button className="download-button" onClick={downloadAudio} disabled={!file || exporting}>
            <Download size={17} /> {exporting ? "PROCESANDO..." : "DESCARGAR WAV"}
          </button>
          {exporting && <div className="export-progress"><span style={{ width: `${exportProgress}%` }} /></div>}
          <div className="format-note">FORMATO WAV · PROCESAMIENTO EN TU NAVEGADOR · SIN SUBIR TU AUDIO A UN SERVIDOR</div>
        </section>

        {error && <div className="error-message" role="alert">{error}</div>}
        <div className="bottom-bar"><span>CHIPEO PRESION V2</span><span>MADE FOR MUSIC LOVERS</span></div>
      </main>
      <footer>CHIPEO PRESION V2 MUSIC STUDIO <span>·</span> Los archivos se procesan localmente en tu dispositivo.</footer>
    </div>
  );
}