# Joe Felz — Archive & Knowledge Graph

An archive of what **Joe Felz** ([@joefelz](https://www.instagram.com/joefelz/)) published
on Instagram and YouTube, organised into a linked Obsidian vault and a plain-English PDF.

The account is verified, public, has ~928k followers and ~3,353 posts. The most recent
posts on it are a statement from those closest to him announcing that he has died. This
project treats the material as a record worth preserving, and keeps his own wording intact.

---

## What this produces

| Output | Path | What it is |
| --- | --- | --- |
| Obsidian vault | `vault/` | Linked notes: subject indexes, book/Bible indexes, and one note per source holding the full caption or transcript |
| ELI5 PDF | `dist/Joe-Felz-Explained-Simply.pdf` | Plain-English guide to everything he covered |
| Unified corpus | `data/derived/corpus.json` | Every captured item in one normalised schema |
| Extraction index | `data/derived/extraction.json` | Every term hit, with a verbatim quote and source URL |
| Raw data | `data/raw/`, `data/subs/` | Untouched API responses and caption tracks |

## The pipeline

```
scrape.py  ─┐
            ├─→ normalize.py ─→ corpus.json ─→ extract.py ─→ extraction.json ─┬─→ build_vault.py → vault/
yt_fetch.py ┘                                                                 └─→ make_pdf.py    → dist/
```

| Script | Job |
| --- | --- |
| `scripts/scrape.py` | Paginates Instagram's `/api/v1/feed/user/<id>/` with `max_id` cursors. Checkpoints after every page. |
| `scripts/yt_fetch.py` | Pulls YouTube metadata + English captions via `yt-dlp`. |
| `scripts/normalize.py` | Flattens both sources into one schema; de-duplicates rolling caption text. |
| `scripts/lexicons.py` | The term lists driving extraction — editable and auditable. |
| `scripts/extract.py` | Finds mentions and records each with surrounding quote + URL. |
| `scripts/build_vault.py` | Writes the Obsidian vault with two-way wikilinks. |
| `scripts/make_pdf.py` | Builds the ELI5 PDF. |

Run in that order. `scrape.py` and `yt_fetch.py` are resumable — re-run them to
continue collecting, then re-run the other four to rebuild the outputs.

```bash
pip install yt-dlp reportlab
python3 scripts/scrape.py      # long-running, resumable
python3 scripts/yt_fetch.py    # long-running, resumable
python3 scripts/normalize.py && python3 scripts/extract.py
python3 scripts/build_vault.py && python3 scripts/make_pdf.py
```

### Finishing the collection

Anonymously, both platforms cut this off quickly — Instagram after about five
requests, YouTube after about sixty — and then refuse the whole IP for a long
period. From a normal home connection, and especially with a logged-in session,
the ceiling is far higher. Both collectors read credentials from the environment
if they are present, and otherwise run anonymously exactly as before:

```bash
# Instagram: the `sessionid` cookie from a logged-in browser session
export IG_SESSIONID="..."
export IG_CSRFTOKEN="..."        # optional but recommended

# YouTube: a cookies.txt exported from a logged-in browser
export YT_COOKIES=/path/to/cookies.txt

python3 scripts/scrape.py        # picks up from the last saved page
python3 scripts/yt_fetch.py      # skips everything already downloaded
```

Both checkpoint continuously — `scrape.py` after every page, `yt_fetch.py` after
every video — so they can be stopped and restarted freely. When they finish,
re-run the last four scripts to rebuild the vault and PDF against the fuller data.

Use an account you are willing to run automated requests from; scraping with
session credentials is against both platforms' terms of service, and the rate
limits exist for a reason. Pace it.

## Method notes

**Instagram gives captions, not speech.** The JSON endpoints expose caption text and
post metadata. The words spoken *inside* an Instagram video are not in that data, and
transcribing thousands of videos was out of reach here. Instagram coverage is therefore
captions and metadata.

**YouTube gives speech.** Caption tracks contain the spoken words, so the YouTube
material carries most of the actual teaching content in the vault. Auto-generated
captions contain errors; quotes are reproduced exactly as the track gave them rather
than cleaned up.

**Rate limiting is the binding constraint.** Both platforms refuse anonymous requests
from a datacenter IP after a short burst — Instagram after roughly five requests,
YouTube after roughly sixty — then block for an extended period. Both collectors back
off adaptively and checkpoint, so progress accumulates across runs rather than
restarting. See `vault/01 Maps of Content/Coverage and Method.md` for live counts.

**On neutrality.** Index notes do not summarise, rank or judge the ideas. Each entry is
a matched term, a verbatim quote of the surrounding words, and a link to the original.
Where the PDF defines a technical word in plain English, it is labelled as a glossary
entry so it is never mistaken for a claim he made. Free-text book detection is marked
unverified because it produces false positives.

## Layout

```
data/raw/      Instagram JSON pages, YouTube listings, collector logs
data/subs/     YouTube .info.json + .vtt caption tracks
data/derived/  corpus.json, extraction.json
scripts/       The pipeline
vault/         Obsidian vault (open this folder as a vault)
dist/          The PDF
```

Open `vault/` as an Obsidian vault and start at `00 START HERE`. Turn on the graph
view to see how the subjects connect.
