#!/usr/bin/env python3
"""Build the plain-English ("ELI5") PDF from the collected data.

Tone rule for this document: it explains *what Joe Felz said*, in simple
words, and always attributes claims to him rather than stating them as
settled fact. Where a plain-English definition of a technical term is given,
it is labelled as a glossary entry so it is never confused with his words.

Output: dist/Joe-Felz-Explained-Simply.pdf
"""
import json
import os
import re
import sys
from collections import defaultdict

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (BaseDocTemplate, Frame, HRFlowable, ListFlowable,
                                ListItem, NextPageTemplate, PageBreak, PageTemplate,
                                Paragraph, Spacer, Table, TableStyle)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lexicons as LX  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DERIVED = os.path.join(ROOT, "data", "derived")
DIST = os.path.join(ROOT, "dist")
os.makedirs(DIST, exist_ok=True)
OUT = os.path.join(DIST, "Joe-Felz-Explained-Simply.pdf")

INK = colors.HexColor("#1a1a1a")
MUTED = colors.HexColor("#5b6470")
ACCENT = colors.HexColor("#b4541f")
RULE = colors.HexColor("#d7d2c8")
QUOTE_BG = colors.HexColor("#f6f3ee")

# reportlab's built-in fonts have no emoji glyphs; strip them rather than
# emit tofu boxes throughout the document.
EMOJI = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF"
    "\U00002190-\U000021FF\U00002B00-\U00002BFF️‍⁩⁦]+")


def clean(s, limit=None):
    if not s:
        return ""
    s = EMOJI.sub("", str(s))
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    s = re.sub(r"\s+", " ", s).strip()
    if limit and len(s) > limit:
        s = s[:limit].rsplit(" ", 1)[0] + "..."
    return s


S = getSampleStyleSheet()
BODY = ParagraphStyle("body", parent=S["BodyText"], fontName="Helvetica",
                      fontSize=10.5, leading=15.5, textColor=INK,
                      alignment=TA_JUSTIFY, spaceAfter=7)
H1 = ParagraphStyle("h1", parent=S["Heading1"], fontName="Helvetica-Bold",
                    fontSize=21, leading=25, textColor=INK, spaceBefore=6,
                    spaceAfter=10)
H2 = ParagraphStyle("h2", parent=S["Heading2"], fontName="Helvetica-Bold",
                    fontSize=14, leading=18, textColor=ACCENT, spaceBefore=14,
                    spaceAfter=6)
H3 = ParagraphStyle("h3", parent=S["Heading3"], fontName="Helvetica-Bold",
                    fontSize=11.5, leading=15, textColor=INK, spaceBefore=10,
                    spaceAfter=4)
QUOTE = ParagraphStyle("quote", parent=BODY, fontName="Helvetica-Oblique",
                       fontSize=9.5, leading=14, textColor=colors.HexColor("#33383f"),
                       leftIndent=10, rightIndent=8, spaceBefore=3, spaceAfter=3,
                       alignment=TA_JUSTIFY)
CAP = ParagraphStyle("cap", parent=BODY, fontSize=8.5, leading=12,
                     textColor=MUTED, spaceAfter=10)
LEDE = ParagraphStyle("lede", parent=BODY, fontSize=12, leading=18,
                      textColor=colors.HexColor("#33383f"), spaceAfter=10)
TITLE = ParagraphStyle("title", parent=H1, fontSize=30, leading=34,
                       alignment=TA_CENTER, spaceAfter=6)
SUB = ParagraphStyle("sub", parent=BODY, fontSize=12.5, leading=18,
                     alignment=TA_CENTER, textColor=MUTED, spaceAfter=4)


def quote_box(text, cite=None):
    inner = [Paragraph(f'"{clean(text, 520)}"', QUOTE)]
    if cite:
        inner.append(Paragraph(clean(cite), ParagraphStyle(
            "c", parent=CAP, fontSize=8, spaceAfter=0, textColor=MUTED)))
    t = Table([[inner]], colWidths=[6.5 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), QUOTE_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return [t, Spacer(1, 8)]


def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(i, BODY), leftIndent=14) for i in items],
        bulletType="bullet", bulletFontSize=7, leftIndent=14, spaceAfter=8)


# Plain-English glossary. These are ordinary definitions of standard terms,
# provided so a general reader can follow the technical material; they are
# not attributed to Joe.
GLOSSARY = {
    "voltage": "How hard electricity is being pushed. Like water pressure in a hose.",
    "current": "How much electricity is actually flowing. Like how much water comes out.",
    "amp": "The unit for how much electricity flows.",
    "watt": "Voltage and current multiplied together: the real amount of work being done.",
    "kwh": "A kilowatt-hour: using 1000 watts for one hour. It is what a power bill counts.",
    "ohm": "How much a material fights against electricity passing through it.",
    "circuit": "A complete loop electricity travels around. Break the loop and it stops.",
    "ground": "A safety path that sends stray electricity into the earth instead of into a person.",
    "neutral": "The wire that carries electricity back to complete the loop.",
    "breaker": "An automatic switch that cuts the power if too much flows, to stop a fire.",
    "solar panel": "A flat panel that turns sunlight directly into electricity.",
    "photovoltaic": "The proper word for turning light into electricity.",
    "inverter": "A box that converts battery-type power into the type wall sockets use.",
    "charge controller": "A gatekeeper between the panels and the battery so the battery is not overfed.",
    "mppt": "A smart charge controller that squeezes the most power out of the panels.",
    "battery": "A tank that stores electricity for when the sun is not shining.",
    "lifepo4": "A long-lasting, hard-to-set-on-fire type of lithium battery.",
    "amp hour": "How big the battery tank is.",
    "state of charge": "How full the battery tank is right now.",
    "bms": "A battery's built-in brain that stops it being overcharged or drained too far.",
    "off grid": "Making all your own power, with no connection to the public electricity network.",
    "grid tie": "Staying connected to the public network and often selling extra power back.",
    "alternating current": "Electricity that rapidly switches direction. What comes out of a wall socket.",
    "direct current": "Electricity that flows one way only. What batteries and solar panels make.",
    "multimeter": "A handheld tool that measures voltage, current and resistance.",
    "frequency": "How many times something repeats each second, measured in hertz.",
}


def top_terms(family_dict, n=14):
    flat = []
    for group, terms in family_dict.items():
        for term, entries in terms.items():
            flat.append((term, group, len(entries), entries))
    flat.sort(key=lambda x: -x[2])
    return flat[:n]


def best_quote(entries, minlen=90):
    for e in sorted(entries, key=lambda e: -len(e.get("quote", ""))):
        q = clean(e.get("quote", ""))
        if len(q) >= minlen:
            return q, e
    if entries:
        return clean(entries[0].get("quote", "")), entries[0]
    return "", None


def cite_of(e):
    if not e:
        return ""
    return f"{e.get('source','')} - {e.get('date') or 'undated'} - {e.get('url','')}"


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.6)
    canvas.line(1 * inch, 10.35 * inch, 7.5 * inch, 10.35 * inch)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(1 * inch, 10.5 * inch, "Joe Felz - Explained Simply")
    canvas.drawRightString(7.5 * inch, 0.62 * inch, str(canvas.getPageNumber()))
    canvas.restoreState()


def build(corpus, ex):
    ig = [r for r in corpus if r["source"] == "instagram"]
    yt = [r for r in corpus if r["source"] == "youtube"]
    tr = [r for r in yt if r.get("transcript")]
    words = sum(len((r.get("transcript") or r.get("text") or "").split())
                for r in corpus)
    dates = sorted(r["date"] for r in corpus if r.get("date"))

    st = []

    # ---- cover
    st += [Spacer(1, 1.6 * inch),
           Paragraph("Joe Felz", TITLE),
           Paragraph("Explained Simply", SUB),
           Spacer(1, 0.2 * inch),
           HRFlowable(width="40%", color=ACCENT, thickness=2,
                      spaceBefore=6, spaceAfter=16, hAlign="CENTER"),
           Paragraph("A plain-English guide to everything he taught online, "
                     "gathered from his own posts and videos", SUB),
           Spacer(1, 0.5 * inch)]
    cover = [["Items collected", f"{len(corpus):,}"],
             ["Instagram posts", f"{len(ig):,}"],
             ["YouTube videos", f"{len(yt):,}"],
             ["Full transcripts", f"{len(tr):,}"],
             ["Words of his own speech and writing", f"{words:,}"]]
    if dates:
        cover.append(["Covering", f"{dates[0]} to {dates[-1]}"])
    t = Table(cover, colWidths=[3.6 * inch, 1.7 * inch], hAlign="CENTER")
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR", (1, 0), (1, -1), INK),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, QUOTE_BG]),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ]))
    st += [t, PageBreak()]

    # ---- how to read
    st += [Paragraph("How to read this", H1),
           Paragraph("This booklet collects what Joe Felz talked about online "
                     "and puts it in everyday language. It is a record, not a "
                     "review. Nothing here argues that he was right or wrong.",
                     LEDE)]
    st += [Paragraph("Three kinds of text appear, and it matters which is which:", BODY)]
    st += [bullets([
        "<b>Plain summaries</b> - ordinary sentences describing what subject he "
        "covered and how often.",
        "<b>His own words</b> - shown in tinted boxes with a line down the side, "
        "copied exactly, with a link to the original post or video.",
        "<b>Glossary notes</b> - simple definitions of technical words, marked "
        "as glossary. These are standard definitions to help you follow along, "
        "not claims he made.",
    ])]
    st += [Paragraph("Where he makes a claim about history, artifacts or "
                     "science, this booklet reports the claim and attributes it "
                     "to him. It does not check the claim or take a side. If you "
                     "want to judge for yourself, every quote carries a link.", BODY)]

    st += [Paragraph("Where the material came from", H2),
           Paragraph("Two sources were gathered directly from the platforms' own "
                     "data feeds:", BODY)]
    st += [bullets([
        f"<b>Instagram</b> - {len(ig):,} posts, read from Instagram's own JSON "
        "feed. This gives the caption he wrote plus the numbers on each post. "
        "It does <i>not</i> give the words spoken inside a video.",
        f"<b>YouTube</b> - {len(yt):,} videos, of which {len(tr):,} came with "
        "caption tracks. These <i>do</i> contain the spoken words, which is why "
        "most of the detailed teaching in this booklet comes from YouTube.",
    ])]
    st += [PageBreak()]

    # ---- who he was
    st += [Paragraph("Who he was, in his own description", H1),
           Paragraph("His Instagram biography described him this way:", BODY)]
    st += quote_box("Solar pro, real estate investor, app developer, vanlifer, "
                    "world traveler, business consultant - GENUINE DUDE",
                    "instagram.com/joefelz - profile biography")
    st += [Paragraph("Put simply: he installed solar power systems, bought and "
                     "rented out property, lived out of a van and later a "
                     "homestead in Costa Rica, and filmed almost all of it. Over "
                     "time his videos widened out from solar into ancient "
                     "objects, symbols, religion and what he called energy.", BODY)]
    st += [Paragraph("He described that widening himself:", BODY)]
    st += quote_box("Strangely, this all began with solar",
                    "instagram - caption on a late post")
    st += [Paragraph("A note on the account", H2),
           Paragraph("The most recent posts on the account are not his. They are "
                     "a statement from the people closest to him announcing that "
                     "he has died, and asking that his memory not be filled in "
                     "with rumour. That statement is part of the record and is "
                     "included in the archive alongside everything else.", BODY)]
    st += [PageBreak()]

    # ---- the library
    st += [Paragraph("The library he was building", H1),
           Paragraph("He talked about putting together a digital library: "
                     "scanning and preserving old books he believed were being "
                     "lost. He kept the physical copies in the one "
                     "air-conditioned room of his Costa Rica house, because the "
                     "humidity was destroying them.", LEDE)]
    lib = ex.get("library", {})
    shown, seen = 0, set()
    for cue, entries in sorted(lib.items(), key=lambda kv: -len(kv[1])):
        for e in entries:
            q = clean(e.get("quote", ""))
            key = q[:60]
            if len(q) < 120 or key in seen:
                continue
            seen.add(key)
            st += quote_box(q, cite_of(e))
            shown += 1
            if shown >= 6:
                break
        if shown >= 6:
            break
    if not shown:
        st += [Paragraph("<i>No library passages were captured in the material "
                         "gathered so far.</i>", BODY)]
    st += [Paragraph("In plain words", H2),
           Paragraph("He thought some old knowledge was disappearing, either "
                     "through neglect or because nobody was copying it before it "
                     "rotted. His answer was practical rather than theoretical: "
                     "buy the old books, keep them dry, photograph them, and put "
                     "the copies somewhere they cannot be lost.", BODY)]
    st += [PageBreak()]

    # ---- the library catalog
    lib_path = os.path.join(ROOT, "data", "library.json")
    if os.path.exists(lib_path):
        libcat = json.load(open(lib_path))
        st += [Paragraph("The books in that library", H1),
               Paragraph("A list of the titles in the collection has been "
                         "shared publicly, with links to free copies online. "
                         "It is reproduced here as given: titles kept as the "
                         "list wrote them, and where a link's contents do not "
                         "match the listed title, that is noted rather than "
                         "silently corrected.", LEDE)]
        checked = libcat.get("links_checked_utc", "")
        for cat in libcat.get("categories", []):
            items = cat.get("items", [])
            st += [Paragraph(f"{cat['name']} ({len(items)} titles)", H2)]
            rows = [[Paragraph("<b>Title</b>", CAP),
                     Paragraph("<b>Copy online</b>", CAP)]]
            for item in items:
                status = item.get("link_status", {})
                live = sum(1 for s in status.values()
                           if str(s).startswith("200"))
                total_links = len(item.get("urls", []))
                if total_links == 0:
                    link_note = "no working link supplied"
                elif live == total_links:
                    link_note = "link works" if total_links == 1 else \
                        f"all {total_links} links work"
                elif live > 0:
                    link_note = f"{live} of {total_links} links work"
                else:
                    link_note = ("refused from this network; may open in a "
                                 "normal browser")
                extra = []
                if item.get("annotation"):
                    extra.append(clean(item["annotation"], 160))
                if item.get("discrepancy"):
                    extra.append("Note: " + clean(item["discrepancy"], 200))
                cell = f"<b>{clean(item['title'], 120)}</b>"
                if extra:
                    cell += "<br/><font size=8 color='#5b6470'>" \
                            + " — ".join(extra) + "</font>"
                rows.append([Paragraph(cell, BODY),
                             Paragraph(clean(link_note), CAP)])
            tb = Table(rows, colWidths=[4.6 * inch, 1.9 * inch])
            tb.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, 0), 0.8, RULE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, QUOTE_BG]),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ]))
            st += [tb, Spacer(1, 10)]
        note = ("Full web addresses for every title are in the Obsidian vault's "
                "Library Catalog section and in data/library.json.")
        if checked:
            note += f" Links last checked {clean(checked)}."
        st += [Paragraph(note, CAP), PageBreak()]

    # ---- subject sections
    fams = [("electrical", "Electricity and solar power",
             "This is the part of his work with the most hands-on detail. He "
             "installed real systems and filmed the process step by step."),
            ("ancient", "Ancient objects, symbols and energy",
             "Later on, much of his filming was about old carved objects, what "
             "the markings on them might mean, and his idea that some of them "
             "were electrical devices."),
            ("life", "Life, money and mindset",
             "The rest is about how he lived and made money: property, "
             "business, prison and what came after it, and travel.")]

    for fam, title, lede in fams:
        data = ex.get(fam, {})
        total = sum(len(v) for terms in data.values() for v in terms.values())
        st += [Paragraph(title, H1), Paragraph(lede, LEDE),
               Paragraph(f"Across everything collected, this subject area comes "
                         f"up about <b>{total:,}</b> times.", CAP)]

        for group, terms in sorted(data.items(),
                                   key=lambda kv: -sum(len(v) for v in kv[1].values())):
            if not terms:
                continue
            n = sum(len(v) for v in terms.values())
            st += [Paragraph(f"{group} ({n:,} mentions)", H2)]
            ranked = sorted(terms.items(), key=lambda kv: -len(kv[1]))[:9]
            rows = []
            for term, entries in ranked:
                gl = GLOSSARY.get(term.strip().lower(), "")
                rows.append([Paragraph(f"<b>{clean(term)}</b>", BODY),
                             Paragraph(str(len(entries)), BODY),
                             Paragraph(clean(gl) or "-", CAP)])
            tb = Table([[Paragraph("<b>Term</b>", CAP),
                         Paragraph("<b>Times</b>", CAP),
                         Paragraph("<b>Plain meaning (glossary)</b>", CAP)]] + rows,
                       colWidths=[1.5 * inch, 0.6 * inch, 4.4 * inch])
            tb.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, 0), 0.8, RULE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, QUOTE_BG]),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ]))
            st += [tb, Spacer(1, 8)]
            q, e = best_quote([x for _, v in ranked for x in v])
            if q:
                st += [Paragraph("In his words:", H3)] + quote_box(q, cite_of(e))
        st += [PageBreak()]

    # ---- books and bible
    st += [Paragraph("Books he mentioned", H1)]
    bible = ex.get("bible", {})
    works = ex.get("named_works", {})
    st += [Paragraph("Books of the Bible", H2)]
    if bible:
        st += [Paragraph(f"{len(bible)} book name(s) of the Bible were found in "
                         "what he wrote and said. Books outside the standard "
                         "66-book Bible are marked, because he discussed some of "
                         "those too.", BODY)]
        rows = [[Paragraph("<b>Book</b>", CAP), Paragraph("<b>Times</b>", CAP),
                 Paragraph("<b>Note</b>", CAP)]]
        for b, entries in sorted(bible.items(), key=lambda kv: -len(kv[1])):
            note = entries[0].get("canon", "") if entries else ""
            rows.append([Paragraph(clean(b), BODY),
                         Paragraph(str(len(entries)), BODY),
                         Paragraph(clean(note) or "standard 66-book Bible", CAP)])
        tb = Table(rows, colWidths=[2.3 * inch, 0.7 * inch, 3.5 * inch])
        tb.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, 0), 0.8, RULE),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, QUOTE_BG]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ]))
        st += [tb, Spacer(1, 10)]
        q, e = best_quote([x for v in bible.values() for x in v])
        if q:
            st += quote_box(q, cite_of(e))
    else:
        st += [Paragraph("<i>No Bible book names appear in the material captured "
                         "so far. He does refer to the Bible itself; individual "
                         "book names may appear in parts of the account not yet "
                         "collected.</i>", BODY)]

    st += [Paragraph("Other named books and texts", H2)]
    if works:
        st += [bullets([f"<b>{clean(w)}</b> - mentioned {len(v)} time(s)"
                        for w, v in sorted(works.items(), key=lambda kv: -len(kv[1]))])]
        q, e = best_quote([x for v in works.values() for x in v])
        if q:
            st += quote_box(q, cite_of(e))
    else:
        st += [Paragraph("<i>None captured yet.</i>", BODY)]

    phrases = ex.get("book_phrases", {})
    if phrases:
        st += [Paragraph("Possible titles picked up from loose speech", H2),
               Paragraph("These were caught by looking for phrases like <i>the "
                         "book of...</i> or a title in quote marks. Automatic "
                         "detection like this makes mistakes, so treat this list "
                         "as leads to check rather than facts.", BODY)]
        st += [bullets([f"{clean(c)} ({len(v)})" for c, v in
                        sorted(phrases.items(), key=lambda kv: -len(kv[1]))[:26]])]
    st += [PageBreak()]

    # ---- his own labels
    tags = ex.get("hashtags", {})
    st += [Paragraph("What he said his posts were about", H1),
           Paragraph("Hashtags are the creator's own labels. Counting them is "
                     "the least filtered way of seeing what he thought he was "
                     "making, with no interpretation added.", LEDE)]
    if tags:
        top = list(tags.items())[:40]
        rows, row = [], []
        for i, (t, n) in enumerate(top):
            row.append(Paragraph(f"#{clean(t)} <font color='#5b6470'>({n})</font>", BODY))
            if len(row) == 3:
                rows.append(row)
                row = []
        if row:
            row += [Paragraph("", BODY)] * (3 - len(row))
            rows.append(row)
        tb = Table(rows, colWidths=[2.17 * inch] * 3)
        tb.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                ("TOPPADDING", (0, 0), (-1, -1), 3),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        st += [tb]
    st += [PageBreak()]

    # ---- honesty section
    st += [Paragraph("What is missing, and why", H1),
           Paragraph("An honest account of the gaps, so nothing here looks more "
                     "complete than it is.", LEDE)]
    ig_target = 3353
    st += [bullets([
        f"<b>Instagram is partly covered.</b> {len(ig):,} of roughly "
        f"{ig_target:,} posts were collected "
        f"({len(ig) * 100.0 / ig_target:.1f}%). Instagram refuses anonymous "
        "requests after a handful go through, so collecting runs slowly and in "
        "bursts. The collector saves its place after every page and can be "
        "restarted to continue.",
        "<b>Words spoken inside Instagram videos are not included.</b> "
        "Instagram's data feed carries the caption only. Getting the speech "
        "would mean downloading and transcribing thousands of videos, which was "
        "not possible here. Instagram entries are therefore captions and "
        "numbers only.",
        f"<b>YouTube speech is included where captions existed</b> - "
        f"{len(tr):,} of {len(yt):,} videos. YouTube also blocks anonymous "
        "requests after a burst, so the same slow collection applies.",
        "<b>Automatic captions contain errors.</b> They mishear names and "
        "technical words. Quotes are reproduced exactly as the caption track "
        "gave them, mistakes included, rather than being tidied up.",
        "<b>Term counting is blunt.</b> A word being counted means it was said, "
        "not that it was the point of the video.",
    ])]
    st += [Paragraph("Everything in this booklet can be traced back. The raw "
                     "downloaded data, the word lists used to find these topics, "
                     "and the scripts that built this file are all kept "
                     "alongside it, so any number here can be recalculated and "
                     "any quote can be found in its original.", BODY)]

    return st


def main():
    corpus = json.load(open(os.path.join(DERIVED, "corpus.json")))
    ex = json.load(open(os.path.join(DERIVED, "extraction.json")))

    doc = BaseDocTemplate(OUT, pagesize=LETTER,
                          leftMargin=1 * inch, rightMargin=1 * inch,
                          topMargin=1 * inch, bottomMargin=0.9 * inch,
                          title="Joe Felz - Explained Simply",
                          author="Archive project")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height,
                  id="n")
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[frame]),
        PageTemplate(id="main", frames=[frame], onPage=header_footer),
    ])
    story = build(corpus, ex)
    story.insert(1, NextPageTemplate("main"))
    doc.build(story)
    print(f"PDF written: {OUT} ({os.path.getsize(OUT)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
