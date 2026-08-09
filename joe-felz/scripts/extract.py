#!/usr/bin/env python3
"""Evidence-first extraction over the unified corpus.

Every hit is stored with the source record and a verbatim surrounding quote,
so nothing in the final vault rests on paraphrase. No interpretation or
ranking of ideas happens here; this only finds and records mentions.

Output: data/derived/extraction.json
"""
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lexicons as LX  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DERIVED = os.path.join(ROOT, "data", "derived")

WINDOW = 260  # characters of context captured on each side of a hit


def blob(rec):
    parts = [rec.get("title") or "", rec.get("text") or "",
             rec.get("transcript") or ""]
    return "\n".join(p for p in parts if p)


def quote(text, start, end):
    a = max(0, start - WINDOW)
    b = min(len(text), end + WINDOW)
    q = text[a:b].replace("\n", " ")
    q = re.sub(r"\s+", " ", q).strip()
    return ("..." if a > 0 else "") + q + ("..." if b < len(text) else "")


def add(store, key, rec, text, m, extra=None, occurrences=1):
    e = {
        "source": rec["source"], "kind": rec["kind"], "id": rec["id"],
        "url": rec["url"], "date": rec["date"],
        "title": rec.get("title") or "",
        "matched": m.group(0),
        "occurrences": occurrences,
        "quote": quote(text, m.start(), m.end()),
    }
    if extra:
        e.update(extra)
    store[key].append(e)


def word_re(term, flags=re.I):
    """Match a term on word boundaries, tolerating internal whitespace."""
    esc = r"\s+".join(re.escape(w) for w in term.split())
    lead = r"\b" if term[0].isalnum() else ""
    tail = r"\b" if term[-1].isalnum() else ""
    return re.compile(lead + esc + tail, flags)


def scan_lexicon(recs, groups, store_by_group):
    for rec in recs:
        text = blob(rec)
        if not text:
            continue
        low = text.lower()
        for group, terms in groups.items():
            for term in terms:
                if term.strip().lower() not in low:
                    continue
                rx = word_re(term)
                ms = list(rx.finditer(text))
                if ms:
                    # One evidence entry per source, but keep the true count so
                    # a term said thirty times in one video is not flattened to
                    # the same weight as one said once.
                    add(store_by_group[group], term.strip().lower(), rec, text,
                        ms[0], occurrences=len(ms))


def scan_bible(recs):
    """Bible book mentions, with ambiguous names gated on scriptural context."""
    hits = defaultdict(list)
    for rec in recs:
        text = blob(rec)
        if not text:
            continue
        low = text.lower()
        has_cue = any(c in low for c in LX.SCRIPTURE_CUES)

        for name in LX.BIBLE_SAFE:
            for m in word_re(name, re.I).finditer(text):
                add(hits, name, rec, text, m, {"confidence": "high"})
                break

        for name in getattr(LX, "BIBLE_SAFE_CASED", []):
            for m in word_re(name, 0).finditer(text):  # capitalised only
                add(hits, name, rec, text, m,
                    {"confidence": "high",
                     "note": "matched case-sensitively; the lowercase word is "
                             "ordinary English"})
                break

        # Ambiguous names need an explicit scriptural construction, not merely
        # a religious word somewhere nearby. A loose proximity rule matched
        # "Daniel the painter" (in a video that also said "God") and "John
        # Hall" (next to the exclamation "Jesus Christ").
        for name in LX.BIBLE_AMBIGUOUS:
            esc = r"\s+".join(re.escape(w) for w in name.split())
            constructions = [
                rf"\bbooks?\s+of\s+{esc}\b",
                rf"\bgospels?\s+(?:of|according\s+to)\s+{esc}\b",
                rf"\b{esc}\s+chapter\s+\d+",
                rf"\b{esc}\s+\d+\s*:\s*\d+",
                rf"\b(?:first|second|1st|2nd|1|2)\s+{esc}\b",
                rf"\bepistles?\s+(?:of|to)\s+(?:the\s+)?{esc}\b",
                # Names listed close to the word "gospel", which catches
                # natural speech like "translated two of the gospels... it was
                # Matthew and Mark" that the "gospel of X" form misses.
                rf"\bgospels?\b.{{0,90}}?\b{esc}\b",
                rf"\b{esc}\b.{{0,50}}?\bgospels?\b",
            ]
            found = None
            for rx in constructions:
                found = re.search(rx, text, re.I)
                if found:
                    break
            if found:
                add(hits, name, rec, text, found,
                    {"confidence": "medium",
                     "note": "ambiguous name; matched an explicit scriptural "
                             "construction"})

        for name in LX.BIBLE_EXTRA_CANON:
            for m in word_re(name, re.I).finditer(text):
                add(hits, name, rec, text, m,
                    {"confidence": "high", "canon": "outside 66-book canon"})
                break
    return hits


def scan_works(recs):
    hits = defaultdict(list)
    for rec in recs:
        text = blob(rec)
        low = text.lower()
        for w in LX.NAMED_WORKS:
            if w.lower() not in low:
                continue
            m = word_re(w).search(text)
            if m:
                add(hits, w, rec, text, m)
    return hits


BOOK_PHRASE = re.compile(
    r"(?:\bbook\s+(?:called|titled|named)\s+|"
    r"\bthe\s+book\s+of\s+|\breading\s+(?:a\s+book\s+)?|"
    r"\bread\s+(?:the\s+book\s+)?|\bin\s+(?:his|her|the)\s+book\s+)"
    r"[\"“']?([A-Z][\w'’\-]*(?:\s+(?:of|the|and|de|a)\s+|\s+)?"
    r"(?:[A-Z][\w'’\-]*\s*){0,4})",
    re.U)
QUOTED_TITLE = re.compile(r"[\"“]([A-Z][^\"”\n]{3,60})[\"”]")


def scan_book_phrases(recs):
    """Free-text book references that no fixed list would catch."""
    hits = defaultdict(list)
    for rec in recs:
        text = blob(rec)
        for rx, tag in ((BOOK_PHRASE, "phrase"), (QUOTED_TITLE, "quoted")):
            for m in rx.finditer(text):
                cand = (m.group(1) or "").strip(" .,:;\"'’“”")
                if len(cand) < 3 or len(cand.split()) > 6:
                    continue
                add(hits, cand, rec, text, m, {"detector": tag})
    return hits


def scan_library(recs):
    hits = defaultdict(list)
    for rec in recs:
        text = blob(rec)
        low = text.lower()
        for cue in LX.LIBRARY_CUES:
            if cue not in low:
                continue
            m = word_re(cue).search(text)
            if m:
                add(hits, cue, rec, text, m)
    return hits


def main():
    recs = json.load(open(os.path.join(DERIVED, "corpus.json")))

    out = {
        "bible": scan_bible(recs),
        "named_works": scan_works(recs),
        "book_phrases": scan_book_phrases(recs),
        "library": scan_library(recs),
    }

    for family, groups in (("electrical", LX.ELECTRICAL),
                           ("ancient", LX.ANCIENT),
                           ("life", LX.LIFE)):
        by_group = {g: defaultdict(list) for g in groups}
        scan_lexicon(recs, groups, by_group)
        out[family] = {g: dict(d) for g, d in by_group.items()}

    for k in ("bible", "named_works", "book_phrases", "library"):
        out[k] = dict(out[k])

    # Hashtag frequency doubles as the creator's own topic labelling.
    tags = defaultdict(int)
    for r in recs:
        for t in r.get("hashtags") or []:
            tags[t] += 1
    out["hashtags"] = dict(sorted(tags.items(), key=lambda kv: -kv[1]))

    with open(os.path.join(DERIVED, "extraction.json"), "w") as fh:
        json.dump(out, fh, indent=1)

    print(f"records scanned: {len(recs)}")
    print(f"bible books:     {len(out['bible'])}")
    print(f"named works:     {len(out['named_works'])}")
    print(f"book phrases:    {len(out['book_phrases'])}")
    print(f"library cues:    {len(out['library'])}")
    for fam in ("electrical", "ancient", "life"):
        n = sum(len(v) for v in out[fam].values())
        print(f"{fam+' terms:':17}{n}")
    print(f"hashtags:        {len(out['hashtags'])}")


if __name__ == "__main__":
    main()
