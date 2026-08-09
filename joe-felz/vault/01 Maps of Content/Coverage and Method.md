---
type: "meta"
tags:
  - "meta"
---

# Coverage and Method

## Where the material came from

- Instagram: the private-API feed endpoint `/api/v1/feed/user/53410977143/`, paginated with `max_id` cursors. Raw JSON for every page is kept in `data/raw/`.
- YouTube: `yt-dlp` metadata plus English caption tracks. Google blocks the usual player clients from this network, so the `tv_embedded` and `android_vr` clients were used.

## What is captured, and what is not

- Instagram exposes **caption text and metadata** through its JSON endpoints. The words spoken inside an Instagram video are **not** part of that data, and transcribing several thousand videos was not possible here. So Instagram coverage is captions and metadata only.
- YouTube captions **do** contain the spoken words, which is why the YouTube material carries most of the actual teaching content in this vault.

## Counts

- Instagram posts captured: **216** of about **3,353** on the account (6.4%).
- YouTube items captured: **105**, of which **102** have transcripts.

Instagram rate-limits anonymous access hard: a few requests succeed, then the whole IP is refused for a period. The scraper backs off and resumes, and it checkpoints after every page, so re-running `scripts/scrape.py` continues from where it stopped rather than starting over.

## On interpretation

Index notes do not summarise or judge the ideas. Each entry is a matched term, a verbatim quote of the words around it, and a link to the original. Free-text book detection is marked unverified because it produces false positives.

Back to [[Master MOC]].