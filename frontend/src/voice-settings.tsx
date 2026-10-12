import { useEffect, useState } from "react";
import { core, errorText } from "./api";
import { Button } from "./components";
import { VoiceControls } from "./voice";
import { shortcutValid } from "../../packages/core/src/voice/speech-text";
import type { VoiceSettings, VoiceStatus } from "../../packages/core/src/voice/types";
export function VoiceSettingsPanel({ conflicts, onChat }: { conflicts: string[]; onChat: () => void }) {
  const [status, setStatus] = useState<VoiceStatus>(),
    [draft, setDraft] = useState<VoiceSettings>(),
    [error, setError] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [saving, setSaving] = useState(false);
  const load = () => {
    void core<VoiceStatus>("voice.status")
      .then((s) => {
        setStatus(s);
        setDraft(s.settings);
      })
      .catch((e) => setError(errorText(e)));
  };
  useEffect(() => {
    load();
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((d) => setDevices(d.filter((x) => x.kind === "audioinput")))
      .catch(() => {});
  }, []);
  const update = <K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) =>
    setDraft((v) => v && { ...v, [key]: value });
  if (!draft || !status)
    return (
      <section>
        <h2>Voice</h2>
        <p role="status">{error || "Discovering local speech providers…"}</p>
        <Button onClick={load}>Retry</Button>
      </section>
    );
  const cap = status.stt.find((p) => p.id === draft.stt);
  return (
    <section className="voice-settings">
      <h2>COSMO Voice</h2>
      <p>Local-first speech. Existing COSMO brains, Memory, Knowledge and permissions remain in control.</p>
      <label>
        Microphone
        <select value={draft.microphone} onChange={(e) => update("microphone", e.target.value)}>
          <option value="">Windows default microphone</option>
          {devices
            .filter((d) => d.deviceId && d.deviceId !== "default")
            .map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || "Microphone " + (i + 1)}
              </option>
            ))}
        </select>
      </label>
      <Button
        onClick={() => {
          void navigator.mediaDevices
            ?.enumerateDevices()
            .then((d) => setDevices(d.filter((x) => x.kind === "audioinput")))
            .catch((e) => setError(errorText(e)));
        }}
      >
        Refresh devices (names available after permission)
      </Button>
      <label>
        STT provider
        <select value={draft.stt} onChange={(e) => update("stt", e.target.value as VoiceSettings["stt"])}>
          {status.stt.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.available ? "available" : "unavailable"}
            </option>
          ))}
        </select>
      </label>
      <p>{cap?.reason ?? "Languages: " + cap?.languages.join(", ")}</p>
      <label>
        Input language
        <select
          value={draft.language}
          onChange={(e) => update("language", e.target.value as VoiceSettings["language"])}
        >
          <option value="auto" disabled={!cap?.autoLanguage}>
            Auto {cap?.autoLanguage ? "(short audio may be ambiguous)" : "(unsupported)"}
          </option>
          <option value="ru">Russian</option>
          <option value="uk">Ukrainian</option>
          <option value="en">English</option>
        </select>
      </label>
      <label>
        TTS provider
        <select value={draft.tts} onChange={() => {}}>
          <option value="windows">Windows installed voices · local</option>
        </select>
      </label>
      <label>
        Voice
        <select value={draft.voice} onChange={(e) => update("voice", e.target.value)}>
          <option value="">Automatic · installed voice matching response language</option>
          {status.voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} · {v.language}
            </option>
          ))}
        </select>
      </label>
      {!status.voices.length && (
        <p role="status">TTS unavailable. Install a Windows speech voice through approved Windows settings.</p>
      )}
      <p>
        Only installed voices are listed. Missing RU/UK voices are not replaced with a cloud service. Explicitly
        selecting an English voice does not guarantee Russian/Ukrainian pronunciation.
      </p>
      <label>
        Speech speed: {draft.speed.toFixed(1)}×
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={draft.speed}
          onChange={(e) => update("speed", Number(e.target.value))}
        />
      </label>
      <label>
        Volume: {Math.round(draft.volume * 100)}%
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={draft.volume}
          onChange={(e) => update("volume", Number(e.target.value))}
        />
      </label>
      <label>
        Voice input behavior
        <select
          value={draft.behavior}
          onChange={(e) => update("behavior", e.target.value as VoiceSettings["behavior"])}
        >
          <option value="review">Review First</option>
          <option value="auto">Auto Send</option>
        </select>
      </label>
      <label>
        Push-to-talk shortcut
        <input value={draft.shortcut} onChange={(e) => update("shortcut", e.target.value)} />
      </label>
      <p>Window-local shortcut; active only on visible Chat. No global/background microphone hotkey.</p>
      <label className="check">
        <input type="checkbox" checked={draft.readAloud} onChange={(e) => update("readAloud", e.target.checked)} />
        Read voice-chat responses aloud
      </label>
      <p>
        Voice Mode listens again after playback; it is always off on startup. Barge-in is NOT IMPLEMENTED; use Stop.
        Output uses the Windows default device. STT and TTS currently generate final results, without partial transcript
        or streaming audio.
      </p>
      <Button onClick={onChat}>Open Chat for Voice Mode</Button>
      <details>
        <summary>Local runtime and storage</summary>
        <label>
          Voice storage
          <input value={draft.storage} onChange={(e) => update("storage", e.target.value)} />
        </label>
        <label>
          whisper-cli.exe
          <input value={draft.whisperExecutable} onChange={(e) => update("whisperExecutable", e.target.value)} />
        </label>
        <label>
          Multilingual GGML model
          <input value={draft.whisperModel} onChange={(e) => update("whisperModel", e.target.value)} />
        </label>
        <p>
          Runtime and model must be inside Voice storage. This panel never downloads or executes an installer. Whisper
          tiny is approximately 78 MB; base is approximately 148 MB. Use official whisper.cpp sources and request
          approval before any multi-GB download.
        </p>
      </details>
      {error && <p role="alert">{error}</p>}
      <div className="actions">
        <Button
          disabled={saving}
          onClick={() => {
            if (!shortcutValid(draft.shortcut, conflicts)) {
              setError("Shortcut conflicts with a system/editor or ORBIT shortcut.");
              return;
            }
            setSaving(true);
            setError("");
            void core("voice.settings", draft)
              .then(() => {
                dispatchEvent(new Event("orbit-voice-settings"));
                load();
                setError("Voice settings saved.");
              })
              .catch((e) => setError(errorText(e)))
              .finally(() => setSaving(false));
          }}
        >
          Save Voice settings
        </Button>
        <Button onClick={load}>Refresh providers</Button>
      </div>
      <h3>Quick tests</h3>
      <p>
        Save settings first. Microphone requires explicit permission; test recordings are discarded. Tests never send
        chat messages.
      </p>
      <VoiceControls
        visible
        busy={false}
        send={() => Promise.resolve(false)}
        stopModel={() => {}}
        setup={() => {}}
        testOnly
      />
      <p>
        Local Only: {status.localOnly ? "on" : "off"}. All speech providers in this release run locally. Raw microphone
        audio persistence: NONE.
      </p>
    </section>
  );
}
