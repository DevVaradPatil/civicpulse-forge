// Microphone capture for spoken reports.
//
// Sarvam accepts what browsers actually produce (WebM/Opus, MP4/AAC), verified
// against the live API, so nothing is transcoded here — the recording is sent
// as captured.

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

      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (blob.size === 0) {
        throw new MicrophoneError("Nothing was recorded. Try again.");
      }
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
