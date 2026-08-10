#!/usr/bin/env python3
"""Generate the Obsidian vault from corpus.json + extraction.json.

Design goal: every note is either (a) a source note holding captured
material verbatim, or (b) an index note that links to source notes. Nothing
asserts a claim that isn't backed by a quote with a URL, so the vault stays
a record of what was said rather than a reading of it.

Wikilinks run both ways (source <-> topic) so the Obsidian graph view shows
the real structure of the material.
"""
import json
import os
import re
import shutil
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lexicons as LX  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DERIVED = os.path.join(ROOT, "data", "derived")
LIBRARY = os.path.join(ROOT, "data", "library.json")
VAULT = os.path.join(ROOT, "vault")

FAMILY_TITLE = {
    "electrical": "Electricity, Solar and Energy",
    "ancient": "Ancient, Artifacts and Esoteric",
    "life": "Life, Business and Mindset",
}
FAMILY_LEX = {"electrical": LX.ELECTRICAL, "ancient": LX.ANCIENT, "life": LX.LIFE}


def occ(entries):
    """Total times a term was actually said, across all sources citing it."""
    return sum(e.get("occurrences", 1) for e in entries)


def safe(name):
    """Filesystem- and wikilink-safe note title."""
    name = re.sub(r"[\\/:*?\"<>|#\^\[\]]", "-", str(name)).strip()
    name = re.sub(r"\s+", " ", name)
    return (name[:90] or "untitled").rstrip(". ")


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def fm(**kv):
    """YAML frontmatter block."""
    out = ["---"]
    for k, v in kv.items():
        if v is None or v == "" or v == []:
            continue
        if isinstance(v, list):
            out.append(f"{k}:")
            out.extend(f"  - {json.dumps(str(x), ensure_ascii=False)}" for x in v)
        else:
            out.append(f"{k}: {json.dumps(str(v), ensure_ascii=False)}")
    out.append("---")
    return "\n".join(out) + "\n"


def hhmmss(sec):
    if not sec:
        return ""
    sec = int(sec)
    h, m, s = sec // 3600, (sec % 3600) // 60, sec % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def source_note_title(rec):
    if rec["source"] == "youtube":
        base = rec.get("title") or rec["id"]
    else:
        base = (rec.get("text") or "").strip().split("\n")[0][:70] or rec["id"]
        base = re.sub(r"#\w+", "", base).strip(" -–—|") or rec["id"]
    return safe(f"{rec['date'] or 'undated'} {base}")


def build(corpus, extraction):
    if os.path.isdir(VAULT):
        shutil.rmtree(VAULT)
    os.makedirs(VAULT, exist_ok=True)

    by_id = {r["id"]: r for r in corpus}
    titles = {r["id"]: source_note_title(r) for r in corpus}

    # id -> set of index notes that cite it, so source notes can link back.
    backlinks = defaultdict(set)

    def register(entries, note_title):
        for e in entries:
            if e["id"] in by_id:
                backlinks[e["id"]].add(note_title)

    # ---------------------------------------------------------------- topics
    topic_notes = defaultdict(list)   # family -> [(term, count, note title)]
    for family, groups in extraction.items():
        if family not in FAMILY_LEX:
            continue
        for group, terms in groups.items():
            if not terms:
                continue
            gtitle = safe(f"{group}")
            n_src = sum(len(v) for v in terms.values())
            n_occ = sum(occ(v) for v in terms.values())
            lines = [fm(type="topic", family=FAMILY_TITLE[family], group=group,
                        terms=len(terms), sources=n_src, occurrences=n_occ,
                        tags=["topic", family])]
            lines.append(f"# {group}\n")
            lines.append(f"Part of **[[{FAMILY_TITLE[family]}]]**. "
                         f"{len(terms)} distinct terms appear across "
                         f"{n_src} posts and videos, said {n_occ} times in total.\n")
            lines.append("Each term below lists the posts and videos where it "
                         "appears, with the surrounding words quoted exactly.\n")
            for term, entries in sorted(terms.items(), key=lambda kv: -occ(kv[1])):
                lines.append(f"\n## {term}  \n"
                             f"*said {occ(entries)} time(s) across "
                             f"{len(entries)} source(s)*\n")
                for e in entries[:14]:
                    t = titles.get(e["id"], e["id"])
                    lines.append(f"- [[{t}]] — {e['date'] or 'undated'} · "
                                 f"[{e['source']}]({e['url']})  \n"
                                 f"  > {e['quote']}")
                if len(entries) > 14:
                    lines.append(f"- *...and {len(entries)-14} more*")
                register(entries, gtitle)
            write(os.path.join(VAULT, "02 Topics", f"{gtitle}.md"),
                  "\n".join(lines))
            topic_notes[family].append((group, n_occ, gtitle))

    # family hub notes
    for family, items in topic_notes.items():
        title = FAMILY_TITLE[family]
        lines = [fm(type="moc", tags=["moc", family]), f"# {title}\n",
                 "Sub-topics, ordered by how often they come up.\n"]
        for group, n, gtitle in sorted(items, key=lambda x: -x[1]):
            lines.append(f"- [[{gtitle}]] — said {n} times")
        lines.append(f"\nBack to [[Master MOC]].")
        write(os.path.join(VAULT, "01 Maps of Content", f"{safe(title)}.md"),
              "\n".join(lines))

    # ----------------------------------------------------------------- bible
    bible = extraction.get("bible", {})
    for book, entries in bible.items():
        btitle = safe(f"Bible - {book}")
        canon = entries[0].get("canon", "66-book canon") if entries else ""
        lines = [fm(type="bible-book", book=book, canon=canon,
                    mentions=len(entries), tags=["bible", "book"]),
                 f"# {book}\n",
                 f"Referenced **{len(entries)}** time(s). Canon note: {canon}.\n",
                 "Linked from [[Books of the Bible]].\n"]
        for e in entries:
            t = titles.get(e["id"], e["id"])
            lines.append(f"\n### [[{t}]]\n"
                         f"{e['date'] or 'undated'} · [{e['source']}]({e['url']}) · "
                         f"matched `{e['matched']}` "
                         f"(confidence: {e.get('confidence','n/a')})\n\n"
                         f"> {e['quote']}")
        register(entries, btitle)
        write(os.path.join(VAULT, "03 Books", "Bible", f"{btitle}.md"),
              "\n".join(lines))

    lines = [fm(type="moc", tags=["moc", "bible"]), "# Books of the Bible\n",
             "Every book of the Bible found in the captured material, with the "
             "exact wording around each mention.\n"]
    if bible:
        for book, entries in sorted(bible.items(), key=lambda kv: -len(kv[1])):
            extra = " *(outside the 66-book canon)*" if entries and entries[0].get("canon") else ""
            lines.append(f"- [[{safe('Bible - '+book)}]] — {len(entries)} mention(s){extra}")
    else:
        lines.append("*No Bible book names found in the material captured so far.*")
    lines.append("\nBack to [[Master MOC]].")
    write(os.path.join(VAULT, "01 Maps of Content", "Books of the Bible.md"),
          "\n".join(lines))

    # ----------------------------------------------------------- named works
    works = extraction.get("named_works", {})
    for w, entries in works.items():
        wtitle = safe(f"Work - {w}")
        lines = [fm(type="work", work=w, mentions=len(entries),
                    tags=["book", "work"]),
                 f"# {w}\n", f"Referenced **{len(entries)}** time(s). "
                 f"Linked from [[Books and Works Mentioned]].\n"]
        for e in entries:
            t = titles.get(e["id"], e["id"])
            lines.append(f"\n### [[{t}]]\n{e['date'] or 'undated'} · "
                         f"[{e['source']}]({e['url']})\n\n> {e['quote']}")
        register(entries, wtitle)
        write(os.path.join(VAULT, "03 Books", "Works", f"{wtitle}.md"),
              "\n".join(lines))

    phrases = extraction.get("book_phrases", {})
    lines = [fm(type="moc", tags=["moc", "books"]),
             "# Books and Works Mentioned\n",
             "Two lists. The first comes from a fixed list of known titles. "
             "The second is free-text detection — phrases like *the book of X* "
             "or a quoted title — and is noisier, so each is shown with its "
             "quote for checking.\n", "\n## Known titles\n"]
    if works:
        for w, entries in sorted(works.items(), key=lambda kv: -len(kv[1])):
            lines.append(f"- [[{safe('Work - '+w)}]] — {len(entries)} mention(s)")
    else:
        lines.append("*None found yet.*")
    lines.append("\n## Detected in free text (unverified)\n")
    if phrases:
        for cand, entries in sorted(phrases.items(), key=lambda kv: -len(kv[1]))[:200]:
            e = entries[0]
            lines.append(f"- **{cand}** — {len(entries)} hit(s) · "
                         f"[{e['source']}]({e['url']})  \n  > {e['quote']}")
    else:
        lines.append("*None found yet.*")
    lines.append("\nSee also [[The Digital Library]] and [[Books of the Bible]]. "
                 "Back to [[Master MOC]].")
    write(os.path.join(VAULT, "01 Maps of Content", "Books and Works Mentioned.md"),
          "\n".join(lines))

    # --------------------------------------------------------------- library
    lib = extraction.get("library", {})
    total_lib = sum(len(v) for v in lib.values())
    lines = [fm(type="topic", tags=["library", "moc"], mentions=total_lib),
             "# The Digital Library\n",
             "Joe described building a digital library to preserve old books "
             "and knowledge he considered at risk of being lost. Everything "
             "below is quoted from the captured material.\n"]
    seen_q = set()
    for cue, entries in sorted(lib.items(), key=lambda kv: -len(kv[1])):
        lines.append(f"\n## \"{cue}\" — {len(entries)} mention(s)\n")
        for e in entries[:20]:
            if e["quote"][:90] in seen_q:
                continue
            seen_q.add(e["quote"][:90])
            t = titles.get(e["id"], e["id"])
            lines.append(f"- [[{t}]] — {e['date'] or 'undated'} · "
                         f"[{e['source']}]({e['url']})  \n  > {e['quote']}")
        register(entries, "The Digital Library")
    lines.append("\nThe books themselves are cataloged in [[Library Catalog]].")
    lines.append("\nBack to [[Master MOC]].")
    write(os.path.join(VAULT, "01 Maps of Content", "The Digital Library.md"),
          "\n".join(lines))

    # --------------------------------------------------------- source notes
    for rec in corpus:
        t = titles[rec["id"]]
        folder = "youtube" if rec["source"] == "youtube" else "instagram"
        links = sorted(backlinks.get(rec["id"], []))
        body = [fm(type="source", source=rec["source"], kind=rec["kind"],
                   date=rec["date"], url=rec["url"],
                   duration=hhmmss(rec.get("duration_s")),
                   views=rec.get("views"), likes=rec.get("likes"),
                   comments=rec.get("comments"),
                   location=rec.get("location"),
                   tags=["source", rec["source"], rec["kind"]])]
        body.append(f"# {rec.get('title') or t}\n")
        meta = [f"**{rec['source']}** · {rec['kind']} · {rec['date'] or 'undated'}"]
        if rec.get("duration_s"):
            meta.append(f"length {hhmmss(rec['duration_s'])}")
        if rec.get("views"):
            meta.append(f"{rec['views']:,} views")
        if rec.get("likes"):
            meta.append(f"{rec['likes']:,} likes")
        body.append(" · ".join(meta))
        body.append(f"\n<{rec['url']}>\n")

        if links:
            body.append("**Topics referencing this:** "
                        + ", ".join(f"[[{l}]]" for l in links) + "\n")
        if rec.get("text"):
            label = "Description" if rec["source"] == "youtube" else "Caption"
            body.append(f"## {label}\n\n{rec['text']}\n")
        if rec.get("transcript"):
            body.append("## Transcript\n\n> [!note] Auto-generated captions, "
                        "reproduced without edits.\n")
            tr = rec["transcript"]
            for i in range(0, len(tr), 1500):
                body.append(tr[i:i+1500] + "\n")
        if rec.get("hashtags"):
            body.append("## Hashtags\n\n"
                        + " ".join(f"#{h}" for h in rec["hashtags"]) + "\n")
        write(os.path.join(VAULT, "04 Sources", folder, f"{t}.md"),
              "\n".join(body))

    return by_id, titles, topic_notes


def build_library():
    """One note per book in the digital-library catalog, plus category hubs
    and a master catalog note wired into the graph."""
    if not os.path.exists(LIBRARY):
        return 0
    lib = json.load(open(LIBRARY))
    checked = lib.get("links_checked_utc", "")
    n_items = 0
    cat_links = []

    for cat in lib.get("categories", []):
        cat_title = safe(f"Library - {cat['name']}")
        item_links = []
        for item in cat.get("items", []):
            n_items += 1
            title = safe(item["title"])
            item_links.append(title)
            status = item.get("link_status", {})
            live = sum(1 for s in status.values() if str(s).startswith("200"))
            lines = [fm(type="library-book", category=cat["name"],
                        links=len(item.get("urls", [])), links_live=live,
                        tags=["library-book", "book"]),
                     f"# {item['title']}\n",
                     f"Part of **[[{cat_title}]]** in **[[Library Catalog]]** — "
                     f"the digital library described in [[The Digital Library]].\n"]
            if item.get("annotation"):
                lines.append(f"> [!quote] Annotation from the shared list\n"
                             f"> {item['annotation']}\n")
            if item.get("note"):
                lines.append(f"> [!info] Transcription note\n> {item['note']}\n")
            if item.get("discrepancy"):
                lines.append(f"> [!warning] Link discrepancy\n"
                             f"> {item['discrepancy']}\n")
            if item.get("urls"):
                lines.append("## Copies\n")
                for url in item["urls"]:
                    s = str(status.get(url, "unchecked"))
                    if s.startswith("200"):
                        badge = "reachable"
                    elif s == "403":
                        badge = ("HTTP 403 — refused from this network; "
                                 "may open fine in a normal browser")
                    else:
                        badge = s
                    lines.append(f"- <{url}>  \n  *{badge}"
                                 + (f", checked {checked}*" if checked else "*"))
            else:
                lines.append("*No working link was supplied for this title.*")
            write(os.path.join(VAULT, "05 Library", safe(cat["name"]),
                               f"{title}.md"), "\n".join(lines))

        lines = [fm(type="moc", tags=["moc", "library"]),
                 f"# Library - {cat['name']}\n",
                 f"{len(item_links)} title(s) in this shelf of "
                 f"[[Library Catalog]].\n"]
        lines += [f"- [[{t}]]" for t in item_links]
        write(os.path.join(VAULT, "05 Library", f"{cat_title}.md"),
              "\n".join(lines))
        cat_links.append((cat_title, len(item_links)))

    lines = [fm(type="moc", tags=["moc", "library"]), "# Library Catalog\n",
             lib.get("description", "") + "\n",
             f"Source of the list: <{lib.get('source_attribution','')}>\n",
             "This is the catalog of the digital library Joe described "
             "building — see [[The Digital Library]] for his own words "
             "about it. Titles are kept as the list gave them; where a "
             "link's contents do not match its listed title, the note "
             "carries a warning rather than a silent correction.\n",
             "## Shelves\n"]
    lines += [f"- [[{t}]] — {n} title(s)" for t, n in cat_links]
    if checked:
        lines.append(f"\nAll links probed {checked}. HTTP 403 entries were "
                     "refused from the archive's network and may still open "
                     "normally in a browser.")
    lines.append("\nBack to [[Master MOC]].")
    write(os.path.join(VAULT, "01 Maps of Content", "Library Catalog.md"),
          "\n".join(lines))
    return n_items


def build_indexes(corpus, extraction, topic_notes):
    ig = [r for r in corpus if r["source"] == "instagram"]
    yt = [r for r in corpus if r["source"] == "youtube"]
    tr = [r for r in yt if r.get("transcript")]
    words = sum(len((r.get("transcript") or r.get("text") or "").split())
                for r in corpus)
    dates = sorted(r["date"] for r in corpus if r.get("date"))

    # Timeline
    by_month = defaultdict(list)
    for r in corpus:
        if r.get("date"):
            by_month[r["date"][:7]].append(r)
    lines = [fm(type="moc", tags=["moc", "timeline"]), "# Timeline\n",
             "Everything captured, newest month first.\n"]
    for month in sorted(by_month, reverse=True):
        rs = by_month[month]
        lines.append(f"\n## {month} — {len(rs)} item(s)\n")
        for r in sorted(rs, key=lambda x: x["date"], reverse=True)[:60]:
            lines.append(f"- [[{source_note_title(r)}]] · {r['source']}/{r['kind']}")
        if len(rs) > 60:
            lines.append(f"- *...and {len(rs)-60} more*")
    lines.append("\nBack to [[Master MOC]].")
    write(os.path.join(VAULT, "01 Maps of Content", "Timeline.md"), "\n".join(lines))

    # Hashtags
    tags = extraction.get("hashtags", {})
    lines = [fm(type="moc", tags=["moc", "hashtags"]),
             "# Hashtags\n",
             "The creator's own labels for his material, by frequency. "
             "Useful as an unfiltered view of what he thought each post was about.\n"]
    for t, n in list(tags.items())[:400]:
        lines.append(f"- `#{t}` — {n}")
    lines.append("\nBack to [[Master MOC]].")
    write(os.path.join(VAULT, "01 Maps of Content", "Hashtags.md"), "\n".join(lines))

    # Master MOC
    lines = [fm(type="moc", tags=["moc"]), "# Master MOC\n",
             "Start here. This vault is a record of what Joe Felz published, "
             "organised by subject. Index notes link to source notes; source "
             "notes hold the caption or transcript in full.\n",
             "## By subject\n",
             "- [[Electricity, Solar and Energy]]",
             "- [[Ancient, Artifacts and Esoteric]]",
             "- [[Life, Business and Mindset]]",
             "- [[Books of the Bible]]",
             "- [[Books and Works Mentioned]]",
             "- [[The Digital Library]]",
             "- [[Library Catalog]] — the books in that library",
             "\n## By structure\n",
             "- [[Timeline]]",
             "- [[Hashtags]]",
             "- [[Coverage and Method]]",
             "\n## What is in here\n",
             f"- **{len(corpus):,}** items captured",
             f"- **{len(ig):,}** Instagram posts",
             f"- **{len(yt):,}** YouTube items, **{len(tr):,}** with transcripts",
             f"- **{words:,}** words of caption and transcript text",
             f"- Date range **{dates[0]} to {dates[-1]}**" if dates else "",
             ]
    write(os.path.join(VAULT, "01 Maps of Content", "Master MOC.md"), "\n".join(lines))

    # Method / coverage
    ig_target = 3353
    lines = [fm(type="meta", tags=["meta"]), "# Coverage and Method\n",
             "## Where the material came from\n",
             "- Instagram: the private-API feed endpoint "
             "`/api/v1/feed/user/53410977143/`, paginated with `max_id` "
             "cursors. Raw JSON for every page is kept in `data/raw/`.\n"
             "- YouTube: `yt-dlp` metadata plus English caption tracks. "
             "Google blocks the usual player clients from this network, so "
             "the `tv_embedded` and `android_vr` clients were used.\n",
             "## What is captured, and what is not\n",
             "- Instagram exposes **caption text and metadata** through its "
             "JSON endpoints. The words spoken inside an Instagram video are "
             "**not** part of that data, and transcribing several thousand "
             "videos was not possible here. So Instagram coverage is captions "
             "and metadata only.\n"
             "- YouTube captions **do** contain the spoken words, which is why "
             "the YouTube material carries most of the actual teaching content "
             "in this vault.\n",
             "## Counts\n",
             f"- Instagram posts captured: **{len(ig):,}** of about "
             f"**{ig_target:,}** on the account "
             f"({len(ig)*100.0/ig_target:.1f}%).",
             f"- YouTube items captured: **{len(yt):,}**, of which "
             f"**{len(tr):,}** have transcripts.",
             "\nInstagram rate-limits anonymous access hard: a few requests "
             "succeed, then the whole IP is refused for a period. The scraper "
             "backs off and resumes, and it checkpoints after every page, so "
             "re-running `scripts/scrape.py` continues from where it stopped "
             "rather than starting over.\n",
             "## On interpretation\n",
             "Index notes do not summarise or judge the ideas. Each entry is a "
             "matched term, a verbatim quote of the words around it, and a link "
             "to the original. Free-text book detection is marked unverified "
             "because it produces false positives.\n",
             "Back to [[Master MOC]]."]
    write(os.path.join(VAULT, "01 Maps of Content", "Coverage and Method.md"),
          "\n".join(lines))

    # Entry point
    write(os.path.join(VAULT, "00 START HERE.md"),
          fm(tags=["start"]) +
          "# Start here\n\n"
          "Open **[[Master MOC]]** for the full index.\n\n"
          "This vault collects what Joe Felz published on Instagram and "
          "YouTube, sorted by subject, with the original wording kept intact "
          "and a link back to every source.\n\n"
          "- **[[Master MOC]]** — the main index\n"
          "- **[[The Digital Library]]** — the archive of old books he "
          "described building\n"
          "- **[[Library Catalog]]** — the books in that library, with links\n"
          "- **[[Electricity, Solar and Energy]]** — the technical material\n"
          "- **[[Ancient, Artifacts and Esoteric]]** — artifacts, symbols, "
          "frequency\n"
          "- **[[Books of the Bible]]** and **[[Books and Works Mentioned]]**\n"
          "- **[[Coverage and Method]]** — how this was gathered and what is "
          "missing\n\n"
          "Turn on the graph view in Obsidian to see how the subjects connect.\n")


def main():
    corpus = json.load(open(os.path.join(DERIVED, "corpus.json")))
    extraction = json.load(open(os.path.join(DERIVED, "extraction.json")))
    _, _, topic_notes = build(corpus, extraction)
    n_lib = build_library()
    build_indexes(corpus, extraction, topic_notes)
    print(f"library catalog: {n_lib} titles")
    n = sum(len(f) for _, _, f in os.walk(VAULT) for f in [f] if True)
    n = sum(len(files) for _, _, files in os.walk(VAULT))
    print(f"vault written: {n} notes under {VAULT}")


if __name__ == "__main__":
    main()
