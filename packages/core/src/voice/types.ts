export type SpeechLanguage = "auto" | "ru" | "uk" | "en";
export type VoicePhase =
  "idle" | "permission" | "listening" | "transcribing" | "review" | "thinking" | "speaking" | "error";
export interface SpeechCapabilities {
  id: string;
  name: string;
  local: boolean;
  available: boolean;
  languages: string[];
  streaming: boolean;
  partialTranscript: boolean;
  autoLanguage: boolean;
  reason?: string;
}
export interface InstalledVoice {
  id: string;
  name: string;
  language: string;
}
export interface SpeechToTextProvider {
  capabilities(): Promise<SpeechCapabilities>;
  transcribe(
    wav: Uint8Array,
    language: SpeechLanguage,
    signal: AbortSignal,
    partial?: (text: string) => void,
  ): Promise<string>;
}
export interface TextToSpeechProvider {
  capabilities(): Promise<SpeechCapabilities>;
  voices(): Promise<InstalledVoice[]>;
  synthesize(text: string, voice: string, speed: number, volume: number, signal: AbortSignal): Promise<Uint8Array>;
}
export interface VoiceSettings {
  microphone: string;
  language: SpeechLanguage;
  stt: "whisper" | "windows";
  tts: "windows";
  voice: string;
  speed: number;
  volume: number;
  behavior: "review" | "auto";
  shortcut: string;
  readAloud: boolean;
  storage: string;
  whisperExecutable: string;
  whisperModel: string;
}
export interface VoiceStatus {
  settings: VoiceSettings;
  stt: SpeechCapabilities[];
  tts: SpeechCapabilities[];
  voices: InstalledVoice[];
  localOnly: boolean;
  active: string | null;
  rawAudioPersistence: "NONE";
}
