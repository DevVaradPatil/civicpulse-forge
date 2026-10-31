"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Camera,
  Upload,
  MapPin,
  Loader2,
  CheckCircle2,
  TriangleAlert,
  RefreshCw,
  Send,
  Mic,
  Square,
  Languages,
} from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { SeverityBadge } from "@/components/ui/badge";
import { CATEGORY_LIST, type IssueCategory, BENGALURU } from "@/lib/domain";
import type { TriageResult } from "@/lib/types";
import { fileToCompressedDataUrl, getPosition } from "@/lib/client/image";
import {
  startRecording,
  microphoneSupported,
  MicrophoneError,
  MAX_RECORDING_SECONDS,
  type Recording,
} from "@/lib/client/audio";
import { useAuth } from "@/components/auth-provider";

type Phase = "idle" | "analyzing" | "review" | "submitting" | "done";

/** Rejected in the browser so a huge file never stalls the page or the upload. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export default function ReportPage() {
  const { displayName, saveDisplayName, authedFetch } = useAuth();
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [categoryHint, setCategoryHint] = useState<IssueCategory | "">("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<string>("");
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [category, setCategory] = useState<IssueCategory>("other");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationSource, setLocationSource] = useState<"device" | "approximate" | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string>("");
  const [createdId, setCreatedId] = useState<string>("");
  const [reporter, setReporter] = useState<string>("");

  // ---- spoken reports
  const [audio, setAudio] = useState<Recording | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState<{ text: string; language: string | null } | null>(
    null,
  );
  const [micSupported, setMicSupported] = useState(true);
  const recorderRef = useRef<Awaited<ReturnType<typeof startRecording>> | null>(null);

  // Checked after mount: it touches navigator, which the server does not have.
  useEffect(() => {
    setMicSupported(microphoneSupported());
  }, []);

  async function beginRecording() {
    setError("");
    setTriage(null);
    setTranscript(null);
    setCreatedId("");
    setElapsed(0);
    try {
      recorderRef.current = await startRecording(setElapsed);
      setRecording(true);
      captureLocation();
    } catch (e) {
      setError(
        e instanceof MicrophoneError ? e.message : "The microphone could not be started.",
      );
      if (e instanceof MicrophoneError && e.permanent) setMicSupported(false);
    }
  }

  function cancelRecording() {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRecording(false);
    setElapsed(0);
  }

  async function stopRecording() {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    setRecording(false);

    let clip: Recording;
    try {
      clip = await rec.stop();
    } catch (e) {
      setError(e instanceof MicrophoneError ? e.message : "The recording could not be saved.");
      return;
    }
    setAudio(clip);
    setPhase("analyzing");

    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: clip.dataUrl,
          mimeType: clip.mimeType,
          categoryHint: categoryHint || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not process that recording");

      setTranscript({ text: String(data.transcript ?? ""), language: data.language ?? null });
      const result = data as TriageResult;
      setTriage(result);
      setCategory(result.category);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not process that recording");
      setPhase("idle");
    }
  }

  useEffect(() => {
    if (displayName) setReporter(displayName);
  }, [displayName]);

  async function captureLocation() {
    setLocating(true);
    setGeoDenied(false);
    try {
      const pos = await getPosition();
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setLocationSource("device");
    } catch {
      // No silent fallback: pinning the city centre and calling it the
      // reporter's location would put a coordinate in the database that
      // nothing measured. The reporter is told, and has to opt in.
      setCoords(null);
      setLocationSource(null);
      setGeoDenied(true);
    } finally {
      setLocating(false);
    }
  }

  /** The reporter accepts a city-centre pin, which is stored as approximate. */
  function useApproximateLocation() {
    setCoords({ ...BENGALURU.center });
    setLocationSource("approximate");
    setGeoDenied(false);
  }

  async function onPick(file: File) {
    setError("");
    setTriage(null);
    setCreatedId("");
    setAudio(null);
    setTranscript(null);

    // Validate before doing any work: the picker's `accept` is a hint, not a
    // guarantee, and a huge file would stall the browser before any upload.
    if (!file.type.startsWith("image/")) {
      setError(`That file is ${file.type || "not an image"}. Please choose a photo.`);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. Please choose one under ${
          MAX_UPLOAD_BYTES / 1024 / 1024
        } MB.`,
      );
      return;
    }

    setPhase("analyzing");
    captureLocation();

    try {
      let dataUrl: string;
      try {
        dataUrl = await fileToCompressedDataUrl(file);
      } catch {
        throw new Error("That image could not be read. It may be corrupted — try another photo.");
      }
      setPreview(dataUrl);

      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: dataUrl,
          categoryHint: categoryHint || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Triage failed");

      const result = data as TriageResult;
      setTriage(result);
      setCategory(result.category);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPhase(preview ? "review" : "idle");
    }
  }

  async function submit() {
    if (!triage) return;
    if (!preview && !audio) {
      setError("Add a photo or a voice recording before submitting.");
      return;
    }
    if (!coords) {
      setError("A location is needed before this report can be submitted.");
      return;
    }
    setPhase("submitting");
    setError("");
    if (reporter && reporter !== displayName) await saveDisplayName(reporter);
    try {
      const res = await authedFetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: preview || undefined,
          mimeType: "image/jpeg",
          audioBase64: audio?.dataUrl,
          audioMimeType: audio?.mimeType,
          transcript: transcript?.text,
          transcriptLanguage: transcript?.language ?? undefined,
          lat: coords.lat,
          lng: coords.lng,
          triage: { ...triage, category },
          reporterName: reporter || displayName || undefined,
          locationSource: locationSource ?? "approximate",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save report");
      setCreatedId(data.issue.id);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save report");
      setPhase("review");
    }
  }

  function reset() {
    cancelRecording();
    setAudio(null);
    setTranscript(null);
    setPhase("idle");
    setPreview("");
    setTriage(null);
    setCoords(null);
    setCreatedId("");
    setError("");
    if (cameraRef.current) cameraRef.current.value = "";
    if (uploadRef.current) uploadRef.current.value = "";
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Report an issue</h1>
      <p className="mt-1 text-sm text-muted">
        Take or upload a photo. AI will categorize it and rate its severity.
      </p>

      {/* Hidden inputs: camera vs gallery/files */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />

      {/* Optional category pre-selection (improves AI accuracy) */}
      {phase !== "done" && (
        <div className="mt-6">
          <label htmlFor="cat-hint" className="text-sm font-medium">
            Issue type{" "}
            <span className="font-normal text-muted">(optional — helps the AI)</span>
          </label>
          <select
            id="cat-hint"
            value={categoryHint}
            onChange={(e) => setCategoryHint(e.target.value as IssueCategory | "")}
            className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <option value="">Let AI detect automatically</option>
            {CATEGORY_LIST.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Photo / voice picker */}
      <div className="mt-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Reported issue"
            className="aspect-video w-full rounded-lg border border-border object-cover"
          />
        ) : audio ? (
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Mic className="h-4 w-4 text-brand" />
              Voice report · {audio.seconds.toFixed(0)}s
            </div>
            <audio controls src={audio.dataUrl} className="mt-3 w-full" />
          </div>
        ) : recording ? (
          <div className="rounded-lg border-2 border-brand bg-brand/5 p-6 text-center">
            <div className="flex items-center justify-center gap-2 text-brand">
              <span className="h-3 w-3 animate-pulse rounded-full bg-sev-high" />
              <span className="font-medium">Listening… {elapsed.toFixed(0)}s</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              Speak in any language. Stops automatically at {MAX_RECORDING_SECONDS}s.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Button onClick={stopRecording}>
                <Square className="h-4 w-4" /> Stop &amp; transcribe
              </Button>
              <Button variant="secondary" onClick={cancelRecording}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <button
              onClick={() => cameraRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-surface text-muted hover:border-brand hover:text-brand sm:aspect-video"
            >
              <Camera className="h-7 w-7" />
              <span className="text-sm font-medium">Take photo</span>
            </button>
            <button
              onClick={() => uploadRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-surface text-muted hover:border-brand hover:text-brand sm:aspect-video"
            >
              <Upload className="h-7 w-7" />
              <span className="text-sm font-medium">Upload image</span>
            </button>
            {/* Spoken reports: no typing, and no need to use English. */}
            <button
              onClick={beginRecording}
              disabled={!micSupported}
              title={
                micSupported
                  ? "Describe the problem out loud, in any Indian language"
                  : "This browser cannot record audio"
              }
              className="col-span-2 flex aspect-video flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-surface text-muted hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-1 sm:aspect-video"
            >
              <Mic className="h-7 w-7" />
              <span className="text-sm font-medium">Speak it</span>
              <span className="text-[11px]">Kannada · Hindi · English</span>
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-sev-high/30 bg-sev-high/10 px-3 py-2 text-sm text-sev-high">
          <TriangleAlert className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Analyzing */}
      {phase === "analyzing" && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-brand" />
          Triage agent is analyzing the photo…
        </div>
      )}

      {/* Review */}
      {(phase === "review" || phase === "submitting") && triage && (
        <div className="mt-6 space-y-5">
          {!triage.isCivicIssue && (
            <div className="flex items-center gap-2 rounded-lg border border-sev-med/30 bg-sev-med/10 px-3 py-2 text-sm text-sev-med">
              <TriangleAlert className="h-4 w-4" />
              This may not be a civic issue. You can still submit if it is.
            </div>
          )}

          {/* What the citizen actually said, kept in their own words. */}
          {transcript && transcript.text && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Languages className="h-4 w-4 text-brand" />
                Heard{transcript.language ? ` in ${transcript.language}` : ""}
              </div>
              <p className="mt-2 text-sm italic text-muted">&ldquo;{transcript.text}&rdquo;</p>
              <p className="mt-2 text-xs text-muted">
                Transcribed by Sarvam AI. The summary below is written from these words only.
              </p>
            </div>
          )}

          <div className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-medium">{triage.title}</h2>
              <SeverityBadge severity={triage.severity} />
            </div>
            <p className="mt-1 text-sm text-muted">{triage.description}</p>
            {triage.hazards.length > 0 && (
              <ul className="mt-3 space-y-1">
                {triage.hazards.map((h) => (
                  <li key={h} className="flex items-center gap-1.5 text-sm text-fg">
                    <TriangleAlert className="h-3.5 w-3.5 text-sev-high" />
                    {h}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">
              AI confidence: {Math.round(triage.confidence * 100)}%
            </p>
          </div>

          {/* Category override */}
          <div>
            <label className="text-sm font-medium">Category</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORY_LIST.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    category === c.id
                      ? "border-brand bg-brand text-brand-fg"
                      : "border-border bg-bg hover:bg-surface"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Location — never silently substituted */}
          <div className="text-sm">
            {locating ? (
              <span className="flex items-center gap-2 text-muted">
                <Loader2 className="h-4 w-4 animate-spin text-brand" />
                Getting your location…
              </span>
            ) : coords && locationSource === "device" ? (
              <span className="flex items-center gap-2 text-muted">
                <MapPin className="h-4 w-4 text-brand" />
                Location captured ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)})
              </span>
            ) : coords && locationSource === "approximate" ? (
              <div className="flex items-start gap-2 rounded-lg border border-sev-med/30 bg-sev-med/10 px-3 py-2 text-sev-med">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p>
                    Using the Bengaluru city centre — this is <strong>not</strong> your measured
                    location. The report will be marked as approximate.
                  </p>
                  <button onClick={captureLocation} className="mt-1 font-medium underline">
                    Try my location again
                  </button>
                </div>
              </div>
            ) : geoDenied ? (
              <div className="flex items-start gap-2 rounded-lg border border-sev-med/30 bg-sev-med/10 px-3 py-2 text-sev-med">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p>
                    We could not get your location. A report needs one, and we will not guess it
                    for you.
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-3">
                    <button onClick={captureLocation} className="font-medium underline">
                      Try again
                    </button>
                    <button onClick={useApproximateLocation} className="font-medium underline">
                      Use city centre (marked approximate)
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <span className="flex items-center gap-2 text-muted">
                <MapPin className="h-4 w-4" />
                Location not captured yet.
                <button onClick={captureLocation} className="font-medium underline">
                  Get location
                </button>
              </span>
            )}
          </div>

          {/* Reporter name (optional, for leaderboard) */}
          <div>
            <label htmlFor="reporter" className="text-sm font-medium">
              Your name{" "}
              <span className="font-normal text-muted">(optional, for the leaderboard)</span>
            </label>
            <input
              id="reporter"
              value={reporter}
              onChange={(e) => setReporter(e.target.value)}
              placeholder="Anonymous"
              maxLength={40}
              className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
          </div>

          <div className="flex gap-3">
            <Button
              onClick={submit}
              disabled={phase === "submitting" || !coords}
              title={coords ? undefined : "A location is needed before submitting"}
            >
              {phase === "submitting" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit report
            </Button>
            <Button variant="secondary" onClick={reset}>
              <RefreshCw className="h-4 w-4" />
              Start over
            </Button>
          </div>
        </div>
      )}

      {/* Done */}
      {phase === "done" && (
        <div className="mt-6 rounded-lg border border-status-resolved/30 bg-status-resolved/10 p-5 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-status-resolved" />
          <h2 className="mt-2 font-medium">Report submitted</h2>
          <p className="mt-1 text-sm text-muted">
            Thanks for making Bengaluru better. The community can now verify it.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <LinkButton href={`/issue/${createdId}`}>View issue</LinkButton>
            <LinkButton href="/map" variant="secondary">
              See the map
            </LinkButton>
          </div>
          <button
            onClick={reset}
            className="mt-3 text-sm text-brand hover:underline"
          >
            Report another
          </button>
        </div>
      )}
    </div>
  );
}
