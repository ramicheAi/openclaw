// AssemblyAI integration — upload a media file, request transcription with
// speaker diarization, poll until complete, return the structured result.
// Active only when ASSEMBLYAI_API_KEY is set in the environment; otherwise
// the transcribe route returns a clear error so the operator knows what to
// add to ~/.themis-env.
//
// Pricing as of 2026 reference: ~$0.015/min (about $0.90/hour) with speaker
// labels on. The route reports the file duration in the response so the
// operator can confirm spend.

const BASE = "https://api.assemblyai.com/v2";

export interface TranscriptUtterance {
  speaker: string; // "A", "B", ...
  start: number; // ms
  end: number; // ms
  text: string;
}

export interface TranscriptResult {
  id: string;
  text: string;
  status: "queued" | "processing" | "completed" | "error";
  durationSec?: number;
  utterances?: TranscriptUtterance[];
  error?: string;
}

function getKey(): string | null {
  return process.env.ASSEMBLYAI_API_KEY ?? null;
}

export function isAssemblyAIReady(): boolean {
  return !!getKey();
}

// Upload binary audio/video to AssemblyAI; returns the temporary upload URL
// the transcribe call references.
export async function uploadMedia(buf: ArrayBuffer): Promise<string> {
  const key = getKey();
  if (!key) throw new Error("ASSEMBLYAI_API_KEY not set");
  const res = await fetch(`${BASE}/upload`, {
    method: "POST",
    headers: { authorization: key, "content-type": "application/octet-stream" },
    body: buf,
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { upload_url: string };
  return json.upload_url;
}

// Kick off a transcription with speaker diarization (speaker_labels=true).
// Returns the transcript id so the caller can poll for completion.
export async function startTranscript(audioUrl: string): Promise<string> {
  const key = getKey();
  if (!key) throw new Error("ASSEMBLYAI_API_KEY not set");
  const res = await fetch(`${BASE}/transcript`, {
    method: "POST",
    headers: { authorization: key, "content-type": "application/json" },
    body: JSON.stringify({
      audio_url: audioUrl,
      speaker_labels: true,
      punctuate: true,
      format_text: true,
    }),
  });
  if (!res.ok) throw new Error(`transcript create failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { id: string };
  return json.id;
}

// Poll until the transcript is done (or errors). Default timeout 30 minutes
// so even hour-long depositions finish; default poll interval 2.5 seconds.
export async function waitForTranscript(
  id: string,
  opts: { timeoutMs?: number; pollMs?: number; onTick?: (status: string) => void } = {},
): Promise<TranscriptResult> {
  const key = getKey();
  if (!key) throw new Error("ASSEMBLYAI_API_KEY not set");
  const timeoutMs = opts.timeoutMs ?? 30 * 60_000;
  const pollMs = opts.pollMs ?? 2500;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`${BASE}/transcript/${id}`, { headers: { authorization: key } });
    if (!res.ok) throw new Error(`poll failed: ${res.status}`);
    const json = (await res.json()) as {
      id: string;
      status: TranscriptResult["status"];
      text?: string;
      audio_duration?: number;
      utterances?: TranscriptUtterance[];
      error?: string;
    };
    opts.onTick?.(json.status);
    if (json.status === "completed") {
      return {
        id: json.id,
        text: json.text ?? "",
        status: "completed",
        durationSec: json.audio_duration,
        utterances: json.utterances,
      };
    }
    if (json.status === "error") {
      return { id: json.id, text: "", status: "error", error: json.error };
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error("transcription timed out");
}

// Format utterances into the timestamped transcript body that becomes the
// document body — every line is citable as BATES @ HH:MM:SS.
export function formatTranscript(utterances: TranscriptUtterance[], speakerMap: Record<string, string> = {}): string {
  return utterances
    .map((u) => {
      const ts = formatTimestamp(u.start);
      const name = speakerMap[u.speaker] ?? `Speaker ${u.speaker}`;
      return `[${ts}]  ${name.toUpperCase()}: ${u.text.trim()}`;
    })
    .join("\n");
}

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
