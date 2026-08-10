#!/usr/bin/env python3
"""Normalize raw Instagram pages + YouTube info.json/VTT into one corpus.

Output: data/derived/corpus.json  (list of records, newest first)

Record schema:
  source      instagram | youtube
  kind        reel | photo | carousel | video | short | stream
  id, url, date (ISO), title, text, transcript
  duration_s, views, likes, comments
  hashtags[], mentions[], location, coauthors[]

Re-runnable at any time; it simply reads whatever the collectors have
written so far.
"""
import glob
import html
import json
import os
import re
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RAW = os.path.join(ROOT, "data", "raw")
SUBS = os.path.join(ROOT, "data", "subs")
DERIVED = os.path.join(ROOT, "data", "derived")
os.makedirs(DERIVED, exist_ok=True)

HASHTAG_RE = re.compile(r"#(\w+)")
MENTION_RE = re.compile(r"@([A-Za-z0-9_.]+)")
IG_KIND = {1: "photo", 2: "reel", 8: "carousel"}


def iso(ts):
    if not ts:
        return None
    return datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%Y-%m-%d")


def parse_vtt(path):
    """Flatten a VTT caption track to readable prose.

    YouTube auto-captions roll words up line by line, so the same text
    repeats across cues; dedupe consecutive repeats and strip inline tags.
    """
    try:
        raw = open(path, encoding="utf-8", errors="replace").read()
    except OSError:
        return ""
    out = []
    for line in raw.split("\n"):
        line = line.strip()
        if (not line or "-->" in line
                or line.startswith(("WEBVTT", "Kind:", "Language:", "NOTE"))
                or re.fullmatch(r"\d+", line)):
            continue
        line = re.sub(r"<[^>]+>", "", line)
        line = html.unescape(line).strip()
        line = re.sub(r"^>>\s*", "", line)
        if not line:
            continue
        if out and out[-1] == line:
            continue
        # Rolling captions often re-emit the previous line plus new words.
        if out and line.startswith(out[-1]):
            out[-1] = line
            continue
        out.append(line)
    text = " ".join(out)
    return re.sub(r"\s+", " ", text).strip()


def load_instagram():
    recs, seen = [], set()
    for path in sorted(glob.glob(os.path.join(RAW, "page_*.json"))):
        try:
            page = json.load(open(path))
        except (OSError, json.JSONDecodeError):
            continue
        for it in page.get("items") or []:
            code = it.get("code")
            if not code or code in seen:
                continue
            seen.add(code)
            cap = (it.get("caption") or {}).get("text") or ""
            loc = it.get("location") or {}
            recs.append({
                "source": "instagram",
                "kind": IG_KIND.get(it.get("media_type"), "post"),
                "id": code,
                "url": f"https://www.instagram.com/p/{code}/",
                "date": iso(it.get("taken_at")),
                "title": "",
                "text": cap,
                "transcript": "",
                "duration_s": it.get("video_duration"),
                "views": it.get("play_count") or it.get("ig_play_count"),
                "likes": it.get("like_count"),
                "comments": it.get("comment_count"),
                "hashtags": sorted(set(h.lower() for h in HASHTAG_RE.findall(cap))),
                "mentions": sorted(set(MENTION_RE.findall(cap))),
                "location": loc.get("name"),
                "coauthors": [c.get("username") for c in it.get("coauthor_producers") or []],
            })
    return recs


def yt_kind(info):
    if info.get("was_live") or info.get("is_live"):
        return "stream"
    dur = info.get("duration") or 0
    return "short" if dur and dur <= 61 else "video"


def load_youtube():
    recs = []
    for path in sorted(glob.glob(os.path.join(SUBS, "*.info.json"))):
        try:
            info = json.load(open(path))
        except (OSError, json.JSONDecodeError):
            continue
        vid = info.get("id")
        if not vid:
            continue
        # Prefer the creator's own track (en-orig) over machine translation.
        transcript = ""
        for cand in (f"{vid}.en-orig.vtt", f"{vid}.en.vtt"):
            p = os.path.join(SUBS, cand)
            if os.path.exists(p):
                transcript = parse_vtt(p)
                if transcript:
                    break
        if not transcript:
            for p in sorted(glob.glob(os.path.join(SUBS, f"{vid}.en*.vtt"))):
                transcript = parse_vtt(p)
                if transcript:
                    break
        desc = info.get("description") or ""
        upload = info.get("upload_date")
        recs.append({
            "source": "youtube",
            "kind": yt_kind(info),
            "id": vid,
            "url": f"https://www.youtube.com/watch?v={vid}",
            "date": (f"{upload[:4]}-{upload[4:6]}-{upload[6:8]}" if upload else None),
            "title": info.get("title") or "",
            "text": desc,
            "transcript": transcript,
            "duration_s": info.get("duration"),
            "views": info.get("view_count"),
            "likes": info.get("like_count"),
            "comments": info.get("comment_count"),
            "hashtags": sorted(set(h.lower() for h in HASHTAG_RE.findall(
                (info.get("title") or "") + " " + desc))),
            "mentions": sorted(set(MENTION_RE.findall(desc))),
            "location": None,
            "coauthors": [],
        })
    return recs


def main():
    recs = load_instagram() + load_youtube()
    recs.sort(key=lambda r: (r["date"] or "0000-00-00"), reverse=True)
    with open(os.path.join(DERIVED, "corpus.json"), "w") as fh:
        json.dump(recs, fh, indent=1)

    ig = [r for r in recs if r["source"] == "instagram"]
    yt = [r for r in recs if r["source"] == "youtube"]
    words = sum(len((r["transcript"] or r["text"]).split()) for r in recs)
    tr = [r for r in yt if r["transcript"]]
    print(f"corpus: {len(recs)} records "
          f"({len(ig)} instagram, {len(yt)} youtube)")
    print(f"youtube with transcript: {len(tr)}")
    print(f"total words captured: {words:,}")
    dates = [r['date'] for r in recs if r['date']]
    if dates:
        print(f"date range: {min(dates)} .. {max(dates)}")


if __name__ == "__main__":
    main()
