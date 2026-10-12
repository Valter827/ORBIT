import { useEffect, useRef, useState } from "react";
import "./voice.css";
import { Mic, MicOff, Volume2, Square } from "lucide-react";
import { core, errorText } from "./api";
import { Button, Modal } from "./components";
import { MicrophoneCapture, bytesToBase64, voiceShortcut } from "./voice-audio";
import type { VoicePhase, VoiceStatus } from "../../packages/core/src/voice/types";

type Response = { id: string; text: string; running: boolean; error?: string };
export function VoiceControls({
  visible,
  busy,
  response,
  send,
  stopModel,
  setup,
  testOnly = false,
}: {
  visible: boolean;
  busy: boolean;
  response?: Response | undefined;
  send: (text: string) => Promise<boolean>;
  stopModel: () => void;
  setup: () => void;
  testOnly?: boolean;
}) {
  const [status, setStatus] = useState<VoiceStatus>();
  const [phase, setPhase] = useState<VoicePhase>("idle"),
    [error, setError] = useState(""),
    [transcript, setTranscript] = useState("");
  const [consent, setConsent] = useState(false),
    [continuous, setContinuous] = useState(false),
    [level, setLevel] = useState(0);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const capture = useRef(new MicrophoneCapture()),
    audio = useRef<HTMLAudioElement | undefined>(undefined),
    objectUrl = useRef("");
  const epoch = useRef(0),
    currentPhase = useRef<VoicePhase>("idle"),
    mode = useRef(false),
    purpose = useRef<"chat" | "mic" | "transcription">("chat");
  const voiceTurn = useRef(false),
    handled = useRef(""),
    turnStart = useRef(0),
    transcriptAt = useRef(0),
    firstToken = useRef(false);
  const permissionGranted = useRef(false),
    busyRef = useRef(busy);
  busyRef.current = busy;
  const phaseTo = (p: VoicePhase) => {
    currentPhase.current = p;
    setPhase(p);
  };
  const playbackStop = () => {
    if (audio.current) {
      audio.current.pause();
      audio.current.src = "";
      audio.current = undefined;
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = "";
  };
  const stop = (model = true) => {
    const hadTurn = voiceTurn.current;
    epoch.current++;
    voiceTurn.current = false;
    mode.current = false;
    setContinuous(false);
    setConsent(false);
    capture.current.cancel();
    playbackStop();
    phaseTo("idle");
    setLevel(0);
    void core("voice.cancel").catch(() => {});
    if (model && (busyRef.current || hadTurn)) stopModel();
  };
  const refresh = () => {
    void core<VoiceStatus>("voice.status")
      .then(setStatus)
      .catch((e) => setError(errorText(e)));
  };
  useEffect(() => {
    refresh();
    const listener = () => {
      stop(false);
      refresh();
    };
    addEventListener("orbit-voice-settings", listener);
    return () => {
      removeEventListener("orbit-voice-settings", listener);
      epoch.current++;
      capture.current.cancel();
      playbackStop();
      void core("voice.cancel").catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!visible) stop(false);
  }, [visible]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop(false);
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
  const fail = (e: unknown) => {
    capture.current.cancel();
    playbackStop();
    mode.current = false;
    setContinuous(false);
    voiceTurn.current = false;
    phaseTo("error");
    setError(errorText(e));
  };
  const begin = async () => {
    if (busyRef.current || !visible || document.hidden || !status) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      fail("Microphone unavailable in this window.");
      return;
    }
    const ticket = ++epoch.current;
    setError("");
    setTranscript("");
    setMetrics({});
    turnStart.current = performance.now();
    phaseTo("permission");
    try {
      await capture.current.start(
        status.settings.microphone,
        setLevel,
        () => {
          void finish();
        },
        mode.current,
      );
      if (ticket !== epoch.current) return;
      permissionGranted.current = true;
      phaseTo("listening");
    } catch (e) {
      if (ticket !== epoch.current) return;
      fail(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone permission denied. Allow microphone access in Windows and this application."
          : e instanceof DOMException && e.name === "NotFoundError"
            ? "No microphone found."
            : e,
      );
    }
  };
  const requestStart = (kind: "chat" | "mic" | "transcription" = "chat", voiceMode = false) => {
    if (busyRef.current || !["idle", "error", "review"].includes(currentPhase.current)) return;
    purpose.current = kind;
    mode.current = voiceMode;
    setContinuous(voiceMode);
    const cap = status?.stt.find((p) => p.id === status.settings.stt);
    if (
      kind !== "mic" &&
      (!cap?.available ||
        (status!.settings.language === "auto" ? !cap.autoLanguage : !cap.languages.includes(status!.settings.language)))
    ) {
      fail(cap?.reason ?? "STT unavailable for the selected language. Open Voice settings.");
      return;
    }
    if (!permissionGranted.current) {
      phaseTo("permission");
      setConsent(true);
    } else void begin();
  };
  const submit = async () => {
    if (!transcript.trim() || busyRef.current) return;
    const ticket = epoch.current;
    phaseTo("thinking");
    voiceTurn.current = true;
    firstToken.current = false;
    const accepted = await send(transcript);
    if (ticket !== epoch.current) {
      if (accepted) stopModel();
      return;
    }
    if (!accepted) {
      voiceTurn.current = false;
      phaseTo("review");
      setError("Message was not sent yet. Check chat setup or the existing Internet permission prompt.");
    } else setTranscript("");
  };
  const finish = async () => {
    if (currentPhase.current !== "listening") return;
    const ticket = epoch.current,
      wav = capture.current.finish();
    setLevel(0);
    if (purpose.current === "mic") {
      wav.fill(0);
      phaseTo("idle");
      setError("Microphone test complete. Audio discarded; nothing was sent.");
      return;
    }
    phaseTo("transcribing");
    const at = performance.now();
    try {
      const result = await core<{ text: string }>("voice.transcribe", {
        id: crypto.randomUUID(),
        audio: bytesToBase64(wav),
        permission: true,
      });
      if (ticket !== epoch.current) return;
      transcriptAt.current = performance.now();
      setMetrics((m) => ({ ...m, stopToTranscriptMs: performance.now() - at }));
      setTranscript(result.text);
      phaseTo("review");
      if (purpose.current === "chat" && status?.settings.behavior === "auto") {
        phaseTo("thinking");
        voiceTurn.current = true;
        transcriptAt.current = performance.now();
        firstToken.current = false;
        const accepted = await send(result.text);
        if (ticket !== epoch.current) {
          if (accepted) stopModel();
          return;
        }
        if (!accepted) {
          voiceTurn.current = false;
          phaseTo("review");
          setError("Review the chat setup or Internet permission prompt before sending.");
        } else setTranscript("");
      }
    } catch (e) {
      if (ticket === epoch.current) fail(e);
    } finally {
      wav.fill(0);
    }
  };
  const speak = async (text: string) => {
    const ticket = epoch.current;
    playbackStop();
    phaseTo("speaking");
    setError("");
    const start = performance.now();
    try {
      const r = await core<{ audio: string; mime: string }>("voice.speak", { id: crypto.randomUUID(), text });
      if (ticket !== epoch.current || !visible || document.hidden) return;
      const bytes = Uint8Array.from(atob(r.audio), (c) => c.charCodeAt(0));
      objectUrl.current = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
      bytes.fill(0);
      const player = new Audio(objectUrl.current);
      audio.current = player;
      player.onplaying = () => setMetrics((m) => ({ ...m, modelEndToFirstAudioMs: performance.now() - start }));
      player.onended = () => {
        if (ticket !== epoch.current) return;
        playbackStop();
        phaseTo("idle");
        setMetrics((m) => ({ ...m, totalTurnMs: performance.now() - turnStart.current }));
        if (mode.current) void begin();
      };
      player.onerror = () => {
        if (ticket === epoch.current) fail("Playback failed. Check Windows default audio output.");
      };
      await player.play();
    } catch (e) {
      if (ticket === epoch.current) fail(e);
    }
  };
  useEffect(() => {
    if (!response || !voiceTurn.current) return;
    if (response.text && !firstToken.current) {
      firstToken.current = true;
      setMetrics((m) => ({ ...m, transcriptToFirstTokenMs: performance.now() - transcriptAt.current }));
    }
    if (response.running || response.id === handled.current) return;
    handled.current = response.id;
    voiceTurn.current = false;
    if (response.error) {
      fail("Model unavailable or response failed. See chat error details.");
      return;
    }
    if (status?.settings.readAloud || mode.current) void speak(response.text);
    else phaseTo("idle");
  }, [response?.id, response?.text, response?.running, response?.error]);
  const latest = useRef({ requestStart, finish, status, stop });
  latest.current = { requestStart, finish, status, stop };
  useEffect(() => {
    if (!visible || testOnly) return;
    let held = "";
    const down = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.repeat ||
        !latest.current.status ||
        !voiceShortcut(e, latest.current.status.settings.shortcut)
      )
        return;
      e.preventDefault();
      held = e.code;
      latest.current.requestStart();
    };
    const up = (e: KeyboardEvent) => {
      if (held && e.code === held) {
        held = "";
        e.preventDefault();
        if (currentPhase.current === "permission" && permissionGranted.current) latest.current.stop(false);
        else void latest.current.finish();
      }
    };
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
    };
  }, [visible, testOnly]);
  return (
    <section className={"voice-controls voice-" + phase} aria-label="COSMO Voice">
      <div className="actions">
        {!testOnly && (
          <button
            type="button"
            aria-label={phase === "listening" ? "Stop recording and transcribe" : "Start microphone recording"}
            title={"Push to talk · " + (status?.settings.shortcut ?? "Ctrl+Space")}
            disabled={busy || !status || !["idle", "error", "review", "listening"].includes(phase)}
            onClick={() => (phase === "listening" ? void finish() : requestStart())}
          >
            <Mic size={18} />
            {phase === "listening" ? "Finish recording" : "Microphone"}
          </button>
        )}
        {!testOnly && (
          <button
            type="button"
            aria-pressed={continuous}
            title="Visible conversation mode; microphone stops while COSMO speaks"
            disabled={busy && !continuous}
            onClick={() => (continuous ? stop() : requestStart("chat", true))}
          >
            Voice Mode {continuous ? "on" : "off"}
          </button>
        )}
        {testOnly && (
          <>
            <Button disabled={phase !== "idle" && phase !== "error"} onClick={() => requestStart("mic")}>
              Test microphone
            </Button>
            <Button disabled={phase !== "idle" && phase !== "error"} onClick={() => requestStart("transcription")}>
              Test transcription
            </Button>
            <Button
              disabled={phase !== "idle" && phase !== "error"}
              onClick={() => {
                turnStart.current = performance.now();
                void speak(
                  status?.settings.language === "en"
                    ? "Hello, COSMO."
                    : status?.settings.language === "uk"
                      ? "Привіт, COSMO."
                      : "Привет, COSMO.",
                );
              }}
            >
              Test voice
            </Button>
          </>
        )}
        {testOnly && phase === "listening" && <Button onClick={() => void finish()}>Finish recording</Button>}
        {!testOnly && response?.text && !busy && ["idle", "error"].includes(phase) && (
          <Button
            title="Read the latest response aloud"
            aria-label="Read response aloud"
            onClick={() => {
              turnStart.current = performance.now();
              void speak(response.text);
            }}
          >
            <Volume2 size={16} />
          </Button>
        )}
        {!["idle", "error"].includes(phase) && (
          <Button title="Stop microphone, transcription, response and speech" onClick={() => stop()}>
            <Square size={16} /> Stop Voice
          </Button>
        )}
        {!testOnly && <Button onClick={setup}>Voice settings</Button>}
      </div>
      <div role="status" aria-live="polite" className="voice-state">
        {phase === "listening" ? (
          <>
            <span className="voice-live-dot" />
            Listening · microphone active <meter min="0" max="0.2" value={level} aria-label="Microphone level" />
          </>
        ) : phase === "transcribing" ? (
          "Transcribing locally…"
        ) : phase === "thinking" ? (
          "Thinking · existing COSMO chat"
        ) : phase === "speaking" ? (
          "Speaking · microphone off"
        ) : phase === "permission" ? (
          "Waiting for microphone permission"
        ) : phase === "review" ? (
          "Transcript ready for review"
        ) : (
          <>
            <MicOff size={14} /> Microphone off
          </>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {transcript && (
        <div className="voice-transcript">
          <label>
            Recognized text
            <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} maxLength={20000} />
          </label>
          {!testOnly && (
            <Button disabled={busy || !transcript.trim()} onClick={() => void submit()}>
              Send transcript
            </Button>
          )}
          <Button
            onClick={() => {
              setTranscript("");
              stop(false);
            }}
          >
            Discard
          </Button>
        </div>
      )}
      {!!Object.keys(metrics).length && (
        <details>
          <summary>Voice latency (measured this turn)</summary>
          {Object.entries(metrics).map(([k, v]) => (
            <p key={k}>
              {k}: {Math.round(v)} ms
            </p>
          ))}
          <p>Chat first-token timing is observed through the existing 200 ms status poll.</p>
        </details>
      )}
      {consent && (
        <Modal title="Allow microphone for COSMO Voice?">
          <p>
            Audio is processed locally and discarded after transcription. No background recording.{" "}
            {continuous
              ? "Voice Mode will listen again after each spoken answer until you press Stop or leave this page."
              : "This starts one visible recording."}
          </p>
          <Button
            onClick={() => {
              setConsent(false);
              void begin();
            }}
          >
            Allow microphone and start
          </Button>
          <Button onClick={() => stop(false)}>Cancel</Button>
        </Modal>
      )}
    </section>
  );
}
