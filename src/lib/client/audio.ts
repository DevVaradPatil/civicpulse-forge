// Microphone capture for spoken reports.
//
// The browser records in whatever it supports (WebM/Opus on Chrome, MP4/AAC on
// Safari), then the clip is re-encoded to 16 kHz mono WAV before upload. Chrome's
// WebM carries no duration header and a "codecs=" suffix on its type, the likely
// cause of Sarvam's 400 invalid_request_error; WAV needs no codec sniffing and
// is sent at the sample rate Sarvam prefers. If the browser cannot decode its own recording, the
// original is sent instead.

/** Sarvam's synchronous endpoint rejects anything longer. */
export const MAX_RECORDING_SECONDS = 30;

export interface Recording {
  dataUrl: string;
  mimeType: string;
  bytes: number;
  seconds: number;
}

export class MicrophoneError extends Error {
  /** True when the browser can never grant this — don't offer a retry. */
  readonly permanent: boolean;
  constructor(message: string, permanent = false) {
    super(message);
    this.permanent = permanent;
  }
}

function pickMimeType(): string | undefined {
  // Ordered by how widely Sarvam's codec sniffing handles them.
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined") return undefined;
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function microphoneSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

/**
 * Starts recording and hands back a stop function. The caller decides when to
 * stop; `onTick` reports elapsed seconds so the UI can show a countdown, and
 * recording stops itself at the limit rather than failing at the API.
 */
export async function startRecording(onTick?: (seconds: number) => void): Promise<{
  stop: () => Promise<Recording>;
  cancel: () => void;
}> {
  if (!microphoneSupported()) {
    throw new MicrophoneError(
      "This browser cannot record audio. Use a photo report instead.",
      true,
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    const name = (err as DOMException)?.name ?? "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new MicrophoneError(
        "Microphone access was blocked. Allow it in your browser, or report with a photo.",
      );
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      throw new MicrophoneError("No microphone was found on this device.", true);
    }
    throw new MicrophoneError("The microphone could not be started.");
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const startedAt = Date.now();
  const elapsed = () => (Date.now() - startedAt) / 1000;

  recorder.start();

  const release = () => {
    for (const track of stream.getTracks()) track.stop();
  };

  let ticker: ReturnType<typeof setInterval> | null = null;
  let autoStop: ReturnType<typeof setTimeout> | null = null;
  const clearTimers = () => {
    if (ticker) clearInterval(ticker);
    if (autoStop) clearTimeout(autoStop);
    ticker = null;
    autoStop = null;
  };

  if (onTick) {
    onTick(0);
    ticker = setInterval(() => onTick(Math.min(MAX_RECORDING_SECONDS, elapsed())), 200);
  }

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  // Stop at the limit ourselves — a longer clip is rejected by the API.
  autoStop = setTimeout(() => {
    if (recorder.state === "recording") recorder.stop();
  }, MAX_RECORDING_SECONDS * 1000);

  return {
    async stop(): Promise<Recording> {
      const seconds = elapsed();
      if (recorder.state === "recording") recorder.stop();
      await stopped;
      clearTimers();
      release();

      const captured = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (captured.size === 0) {
        throw new MicrophoneError("Nothing was recorded. Try again.");
      }
      const blob = await toWav(captured).catch(() => captured);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new MicrophoneError("The recording could not be read."));
        reader.readAsDataURL(blob);
      });

      return {
        dataUrl,
        mimeType: blob.type,
        bytes: blob.size,
        seconds: Math.min(MAX_RECORDING_SECONDS, seconds),
      };
    },
    cancel() {
      clearTimers();
      if (recorder.state === "recording") recorder.stop();
      release();
    },
  };
}

/** Sarvam's preferred rate; also keeps a 30 s clip under 1 MB. */
const WAV_SAMPLE_RATE = 16_000;

/** Decodes a recording and re-encodes it as 16-bit PCM mono WAV. */
async function toWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void ctx.close();
  }

  // Resample and mix down to mono in one offline render.
  const length = Math.max(1, Math.ceil(decoded.duration * WAV_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, WAV_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);

  const dataBytes = samples.length * 2;
  const view = new DataView(new ArrayBuffer(44 + dataBytes));
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, WAV_SAMPLE_RATE, true);
  view.setUint32(28, WAV_SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}
