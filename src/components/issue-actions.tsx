"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  ThumbsUp,
  Loader2,
  Wrench,
  Upload,
  ShieldCheck,
  ShieldX,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONFIRMATIONS_TO_VERIFY } from "@/lib/domain";
import { useAuth } from "@/components/auth-provider";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { fileToCompressedDataUrl } from "@/lib/client/image";
import type { Issue, VerificationResult } from "@/lib/types";

export function IssueActions({ issue: initial }: { issue: Issue }) {
  const { uid, displayName, authedFetch } = useAuth();
  const [issue, setIssue] = useState<Issue>(initial);
  const [busy, setBusy] = useState<null | "confirm" | "progress" | "resolve">(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const proofRef = useRef<HTMLInputElement>(null);

  const remaining = Math.max(0, CONFIRMATIONS_TO_VERIFY - issue.confirmations);

  // Reflect whether the current user has already confirmed this issue.
  useEffect(() => {
    if (uid && issue.confirmedBy?.includes(uid)) setConfirmed(true);
  }, [uid, issue.confirmedBy]);

  async function confirm() {
    setBusy("confirm");
    try {
      const r = await authedFetch(`/api/issues/${issue.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setIssue(d.issue);
      setConfirmed(true);
      if (d.counted) {
        toast.success(
          d.issue.status === "verified"
            ? "Confirmed — issue is now verified! +5 points"
            : "Confirmed · +5 points",
        );
      } else {
        toast("You've already confirmed this issue.", { icon: "👍" });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not confirm.");
    } finally {
      setBusy(null);
    }
  }

  async function markProgress() {
    setBusy("progress");
    try {
      const r = await fetch(`/api/issues/${issue.id}/progress`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setIssue(d.issue);
      toast.success("Marked as in progress.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update.");
    } finally {
      setBusy(null);
    }
  }

  async function onProof(file: File) {
    setBusy("resolve");
    setVerification(null);
    const t = toast.loading("Verifier agent is comparing before/after…");
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      const r = await authedFetch(`/api/issues/${issue.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mimeType: "image/jpeg",
          name: displayName,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setIssue(d.issue);
      setVerification(d.verification);
      if (d.verification.resolved) {
        toast.success("AI verified the fix! Issue resolved · +20 points", { id: t });
      } else {
        toast.error("AI couldn't confirm the fix from that photo.", { id: t });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed.", { id: t });
    } finally {
      setBusy(null);
      if (proofRef.current) proofRef.current.value = "";
    }
  }

  const isResolved = issue.status === "resolved";

  return (
    <div className="mt-6 space-y-4">
      {/* Confirm */}
      {!isResolved && (
        <div className="flex flex-wrap items-center gap-3">
          {confirmed ? (
            <span className="inline-flex items-center gap-2 rounded-lg bg-status-resolved/10 px-4 py-2 text-sm font-medium text-status-resolved">
              <CheckCircle2 className="h-4 w-4" /> Confirmed by you
            </span>
          ) : (
            <Button onClick={confirm} disabled={busy !== null}>
              {busy === "confirm" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ThumbsUp className="h-4 w-4" />
              )}
              Confirm ({issue.confirmations})
            </Button>
          )}
          {issue.status === "reported" && (
            <span className="text-sm text-muted">
              {issue.confirmations} confirmed
              {remaining > 0
                ? ` · ${remaining} more to verify`
                : " · ready to verify"}
            </span>
          )}
          {issue.status === "verified" && (
            <Button variant="secondary" onClick={markProgress} disabled={busy !== null}>
              {busy === "progress" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wrench className="h-4 w-4" />
              )}
              Mark in progress
            </Button>
          )}
        </div>
      )}

      {/* Resolve with AI verification */}
      {!isResolved && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium">Fixed it? Verify the resolution</h3>
          <p className="mt-1 text-sm text-muted">
            Upload an &ldquo;after&rdquo; photo. Our AI compares it with the original to
            confirm the fix.
          </p>
          <input
            ref={proofRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onProof(f);
            }}
          />
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => proofRef.current?.click()}
            disabled={busy !== null}
          >
            {busy === "resolve" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload fix photo
          </Button>
        </div>
      )}

      {/* Verification outcome (just-submitted) */}
      {verification && !verification.resolved && (
        <div className="flex items-start gap-2 rounded-lg border border-sev-med/30 bg-sev-med/10 p-3 text-sm text-sev-med">
          <ShieldX className="mt-0.5 h-4 w-4 shrink-0" />
          <span>AI could not confirm the fix: {verification.note}</span>
        </div>
      )}

      {/* Resolved state */}
      {issue.resolution?.verified && (
        <div className="rounded-lg border border-status-resolved/30 bg-status-resolved/10 p-4">
          <div className="flex items-center gap-2 text-status-resolved">
            <ShieldCheck className="h-5 w-5" />
            <span className="font-medium">AI-verified resolution</span>
          </div>
          {issue.resolution.note && (
            <p className="mt-1 text-sm text-muted">{issue.resolution.note}</p>
          )}
          <div className="mt-3">
            <BeforeAfterSlider
              beforeSrc={`/api/media/${issue.photoPath}`}
              afterSrc={`/api/media/${issue.resolution.proofPath}`}
            />
            <p className="mt-1.5 text-center text-xs text-muted">
              Drag to compare before and after
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
