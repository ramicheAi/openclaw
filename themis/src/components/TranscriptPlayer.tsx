// TranscriptPlayer — renders the video/audio sibling of a transcript
// document plus a synced transcript pane. Click any `[HH:MM:SS] …` line
// to scrub the player. The active line tracks playback and highlights.

import { useEffect, useMemo, useRef, useState } from "react";
import { MediaReattach } from "./MediaReattach";

interface Props {
  matterId: string;
  docId: string;
  bates: string;
  body: string; // the transcript text — every line "[HH:MM:SS]  NAME: …"
}

interface Line {
  ts: number; // seconds
  text: string;
  speaker?: string;
  raw: string;
}

function parseLines(body: string): Line[] {
  const lines: Line[] = [];
  const re = /^\[(\d{2}):(\d{2}):(\d{2})\]\s+([^:]+?):\s*(.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const [, h, mm, s, speaker, text] = m;
    const ts = Number(h) * 3600 + Number(mm) * 60 + Number(s);
    lines.push({ ts, text: text.trim(), speaker: speaker.trim(), raw: m[0] });
  }
  return lines;
}

export function TranscriptPlayer({ matterId, docId, bates, body }: Props) {
  const lines = useMemo(() => parseLines(body), [body]);
  const ref = useRef<HTMLVideoElement | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [missing, setMissing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const src = `/api/matters/${matterId}/documents/${docId}/media?v=${reloadKey}`;

  // Probe with HEAD so we can flip to the re-attach dropzone before the
  // <video> element renders a broken "can't play" UI. The body has the
  // transcript regardless, so navigation still works without media.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/matters/${matterId}/documents/${docId}/media`,
          { method: "HEAD" },
        );
        if (!cancelled) setMissing(res.status === 404);
      } catch {
        if (!cancelled) setMissing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [matterId, docId, reloadKey]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    function onTime() {
      if (!v) return;
      // Find the latest line whose ts <= currentTime.
      const t = v.currentTime;
      let idx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].ts <= t) idx = i;
        else break;
      }
      setActiveIdx(idx >= 0 ? idx : null);
    }
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [lines]);

  function scrub(ts: number) {
    const v = ref.current;
    if (!v) return;
    v.currentTime = ts;
    void v.play();
  }

  return (
    <div className="grid gap-3 border-l-2 border-brass bg-paper p-4 lg:grid-cols-[420px_1fr]">
      <div>
        {missing ? (
          <MediaReattach
            matterId={matterId}
            bates={bates}
            kind="media"
            onReattached={() => setReloadKey((k) => k + 1)}
          />
        ) : (
          <video
            ref={ref}
            src={src}
            controls
            preload="metadata"
            className="w-full rounded-md border border-line bg-black"
            style={{ maxHeight: 280 }}
          />
        )}
      </div>
      <div className="max-h-[360px] overflow-y-auto rounded-md border border-line bg-surface p-2 font-mono text-[11.5px] leading-relaxed">
        {lines.length === 0 ? (
          <div className="text-ink-faint">No timestamped lines detected — showing raw body.</div>
        ) : (
          lines.map((l, i) => (
            <button
              key={i}
              onClick={() => scrub(l.ts)}
              className={
                "block w-full rounded px-1 py-0.5 text-left transition " +
                (activeIdx === i ? "bg-brass-wash text-brass-deep" : "hover:bg-surface-sunken")
              }
            >
              <span className="text-brass-deep">[{fmt(l.ts)}]</span>{" "}
              <span className="font-semibold text-ink">{l.speaker}:</span>{" "}
              <span className="text-ink">{l.text}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function fmt(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(ss)}`;
}
