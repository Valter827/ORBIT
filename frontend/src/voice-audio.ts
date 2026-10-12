/** In-memory PCM capture. No MediaRecorder files, uploads or localStorage audio. */
export class MicrophoneCapture {
  private stream: MediaStream | undefined;
  private context: AudioContext | undefined;
  private node: ScriptProcessorNode | undefined;
  private samples: Float32Array[] = [];
  private count = 0;
  private epoch = 0;
  async start(device: string, level: (value: number) => void, end: () => void, vad: boolean) {
    const epoch = ++this.epoch;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(device ? { deviceId: { exact: device } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    if (epoch !== this.epoch) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    try {
      const context = new AudioContext();
      await context.resume();
      if (epoch !== this.epoch) {
        stream.getTracks().forEach((t) => t.stop());
        void context.close();
        return;
      }
      this.context = context;
      const source = this.context.createMediaStreamSource(stream);
      // ScriptProcessor remains available in WebView2. Buffer is bounded to 60 s.
      this.node = this.context.createScriptProcessor(4096, 1, 1);
      const mute = this.context.createGain();
      mute.gain.value = 0;
      source.connect(this.node);
      this.node.connect(mute);
      mute.connect(this.context.destination);
      let speech = false,
        lastSpeech = performance.now();
      const started = performance.now();
      this.node.onaudioprocess = (event) => {
        if (epoch !== this.epoch || !this.context) return;
        const data = event.inputBuffer.getChannelData(0).slice();
        this.samples.push(data);
        this.count += data.length;
        const rms = Math.sqrt(data.reduce((n, x) => n + x * x, 0) / data.length);
        level(rms);
        if (rms > 0.025) {
          speech = true;
          lastSpeech = performance.now();
        }
        if (
          this.count >= this.context.sampleRate * 59 ||
          (vad && speech && performance.now() - lastSpeech > 1200) ||
          (vad && !speech && performance.now() - started > 15000)
        )
          end();
      };
    } catch (error) {
      this.cancel();
      throw error;
    }
  }
  finish(): Uint8Array {
    const rate = this.context?.sampleRate ?? 48000;
    const input = new Float32Array(this.count);
    let offset = 0;
    for (const part of this.samples) {
      input.set(part, offset);
      offset += part.length;
      part.fill(0);
    }
    this.samples = [];
    this.count = 0;
    this.release();
    const length = Math.min(960000, Math.floor((input.length * 16000) / rate));
    const bytes = new Uint8Array(44 + length * 2),
      view = new DataView(bytes.buffer);
    const ascii = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    ascii(0, "RIFF");
    view.setUint32(4, bytes.length - 8, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    ascii(36, "data");
    view.setUint32(40, length * 2, true);
    for (let i = 0; i < length; i++) {
      const start = Math.floor((i * rate) / 16000),
        end = Math.max(start + 1, Math.floor(((i + 1) * rate) / 16000));
      let sample = 0;
      for (let n = start; n < end && n < input.length; n++) sample += input[n] ?? 0;
      sample = Math.max(-1, Math.min(1, sample / (end - start)));
      view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    }
    input.fill(0);
    return bytes;
  }
  private release() {
    this.epoch++;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    if (this.node) {
      this.node.onaudioprocess = null;
      this.node.disconnect();
      this.node = undefined;
    }
    void this.context?.close();
    this.context = undefined;
  }
  cancel() {
    this.samples.forEach((b) => b.fill(0));
    this.samples = [];
    this.count = 0;
    this.release();
  }
}
export function bytesToBase64(bytes: Uint8Array) {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
export function voiceShortcut(event: KeyboardEvent, shortcut: string) {
  const parts = shortcut.toLowerCase().split("+"),
    key = parts.pop();
  return (
    !event.isComposing &&
    !event.metaKey &&
    event.ctrlKey === parts.includes("ctrl") &&
    event.altKey === parts.includes("alt") &&
    event.shiftKey === parts.includes("shift") &&
    (key === "space" ? event.code === "Space" : event.key.toLowerCase() === key)
  );
}
