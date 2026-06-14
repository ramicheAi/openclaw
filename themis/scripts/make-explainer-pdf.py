#!/usr/bin/env python3
"""Generate the Themis explainer + immigration-paralegal interview PDF.
Themis brand palette: warm paper bg, brass accents, deep ink text."""

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
    Table, TableStyle, ListFlowable, ListItem, HRFlowable, KeepTogether,
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER

# ── palette ───────────────────────────────────────────────────────────────
PAPER   = colors.HexColor("#F4ECDA")
SURFACE = colors.HexColor("#FBF6EA")
INK     = colors.HexColor("#1F1A14")
INKSOFT = colors.HexColor("#5B5141")
INKFAINT= colors.HexColor("#8A7F6C")
BRASS   = colors.HexColor("#8A5A1F")
BRASSDP = colors.HexColor("#6E4717")
BRASSWASH = colors.HexColor("#EFE3C9")
LINE    = colors.HexColor("#D6CAA8")
VERIFY  = colors.HexColor("#2C7E5A")
DANGER  = colors.HexColor("#B53D36")

import os
# Write next to the repo's themis/ dir regardless of where this is checked out
# (was hardcoded to /home/user/openclaw/, which only existed on the original box).
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Themis-Explainer-and-Questions.pdf"))

styles = {}
def S(name, **kw):
    styles[name] = ParagraphStyle(name, **kw)

S("h1", fontName="Times-Bold", fontSize=26, leading=30, textColor=INK, spaceAfter=4)
S("eyebrow", fontName="Courier-Bold", fontSize=8.5, leading=11, textColor=BRASS, spaceAfter=3, tracking=2)
S("sub", fontName="Helvetica", fontSize=11, leading=16, textColor=INKSOFT, spaceAfter=6)
S("h2", fontName="Times-Bold", fontSize=16, leading=20, textColor=BRASSDP, spaceBefore=14, spaceAfter=6)
S("h3", fontName="Helvetica-Bold", fontSize=11.5, leading=15, textColor=INK, spaceBefore=8, spaceAfter=3)
S("body", fontName="Helvetica", fontSize=10.5, leading=15.5, textColor=INK, spaceAfter=7)
S("bodysoft", fontName="Helvetica", fontSize=10, leading=14.5, textColor=INKSOFT, spaceAfter=6)
S("li", fontName="Helvetica", fontSize=10.5, leading=15, textColor=INK, spaceAfter=4)
S("q", fontName="Helvetica", fontSize=11, leading=15.5, textColor=INK, spaceAfter=3, leftIndent=2)
S("qwhy", fontName="Helvetica-Oblique", fontSize=9, leading=12.5, textColor=INKFAINT, spaceAfter=9, leftIndent=2)
S("cardtitle", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=BRASSDP, spaceAfter=2)
S("cardbody", fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=INKSOFT)
S("footer", fontName="Courier", fontSize=7.5, leading=10, textColor=INKFAINT)
S("tiny", fontName="Helvetica", fontSize=8.5, leading=12, textColor=INKFAINT, spaceAfter=4)

def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, letter[0], letter[1], fill=1, stroke=0)
    # brass hairline top
    canvas.setStrokeColor(BRASS)
    canvas.setLineWidth(2)
    canvas.line(0.75*inch, letter[1]-0.55*inch, letter[0]-0.75*inch, letter[1]-0.55*inch)
    # footer
    canvas.setFont("Courier", 7.5)
    canvas.setFillColor(INKFAINT)
    canvas.drawString(0.75*inch, 0.45*inch, "THEMIS · EVIDENCE INTELLIGENCE")
    canvas.drawRightString(letter[0]-0.75*inch, 0.45*inch, f"Page {doc.page}")
    canvas.restoreState()

doc = BaseDocTemplate(
    OUT, pagesize=letter,
    leftMargin=0.75*inch, rightMargin=0.75*inch,
    topMargin=0.85*inch, bottomMargin=0.7*inch,
)
frame = Frame(doc.leftMargin, doc.bottomMargin,
              doc.width, doc.height, id="main")
doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=on_page)])

E = []  # elements

def card(title, body, accent=BRASS, width=None):
    t = Table(
        [[Paragraph(title, styles["cardtitle"])],
         [Paragraph(body, styles["cardbody"])]],
        colWidths=[width if width is not None else doc.width],
    )
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), SURFACE),
        ("BOX", (0,0), (-1,-1), 0.75, LINE),
        ("LINEBEFORE", (0,0), (0,-1), 3, accent),
        ("LEFTPADDING", (0,0), (-1,-1), 12),
        ("RIGHTPADDING", (0,0), (-1,-1), 12),
        ("TOPPADDING", (0,0), (0,0), 10),
        ("BOTTOMPADDING", (0,-1), (-1,-1), 10),
        ("TOPPADDING", (0,1), (-1,1), 0),
    ]))
    return t

def rule():
    return HRFlowable(width="100%", thickness=0.6, color=LINE, spaceBefore=6, spaceAfter=8)

# ── COVER ───────────────────────────────────────────────────────────────
E.append(Spacer(1, 8))
E.append(Paragraph("THEMIS · EVIDENCE INTELLIGENCE", styles["eyebrow"]))
E.append(Paragraph("What we built, explained simply", styles["h1"]))
E.append(Paragraph(
    "A plain-English tour of the Themis app — and the questions we want to ask an "
    "immigration paralegal so we build the right thing for real immigration work.",
    styles["sub"]))
E.append(rule())

# ── ELI5 ────────────────────────────────────────────────────────────────
E.append(Paragraph("The big idea (like you're five)", styles["h2"]))
E.append(Paragraph(
    "Imagine a giant shoebox stuffed with every paper about one legal case — police reports, "
    "letters, photos, recordings, medical records, court papers. A human has to read all of it, "
    "remember who's who, line up what happened and when, and never, ever make up a fact.",
    styles["body"]))
E.append(Paragraph(
    "<b>Themis is a robot helper that reads the whole shoebox in minutes.</b> It builds a tidy "
    "story of the case, lists every person involved, and — this is the important part — it "
    "<b>only says things it can prove</b> by pointing back to the exact page it came from. If it "
    "can't prove something, it stays quiet instead of guessing.",
    styles["body"]))
E.append(Paragraph(
    "Lots of AI tools <i>make up</i> fake court cases that sound real. Lawyers have gotten in "
    "serious trouble for filing those fakes. Themis is built so it <b>cannot do that</b> — it "
    "checks every legal citation against a real public database of court decisions before anyone "
    "files anything.",
    styles["body"]))

E.append(Paragraph("Why a lawyer or paralegal would care", styles["h3"]))
E.append(ListFlowable([
    ListItem(Paragraph("<b>It saves hours.</b> Work that took 4 hours (like building a case timeline or a deposition question list) takes a few minutes.", styles["li"]), leftIndent=14, value="•"),
    ListItem(Paragraph("<b>It keeps you safe.</b> Every fact and every cited case is checked, so nothing fake sneaks into a filing.", styles["li"]), leftIndent=14, value="•"),
    ListItem(Paragraph("<b>It remembers everything.</b> Deadlines, who said what, which documents were produced — all tracked, all in one place.", styles["li"]), leftIndent=14, value="•"),
    ListItem(Paragraph("<b>It proves its work.</b> Every action is logged in a tamper-proof record a judge could trust.", styles["li"]), leftIndent=14, value="•"),
], bulletType="bullet", start="•"))

# ── WHAT'S INSIDE ──────────────────────────────────────────────────────
E.append(Paragraph("What's inside the app", styles["h2"]))
E.append(Paragraph(
    "Each \"tab\" is one job. You drop a case's documents in once, and every tab reads from that "
    "same pile — so nothing is typed twice and nothing disagrees.",
    styles["bodysoft"]))

features = [
    ("Documents + Case Brain", "Upload everything. Themis reads it, pulls out every person and event, and draws a living map of the case."),
    ("Ask Themis (chat)", "Ask a plain question (\"What did the officer say about the stop?\"). The answer comes back with the exact source pages attached. No source = no answer."),
    ("Chronology", "An automatic, dated timeline of what happened — each event tied to the document that proves it. You accept or reject each one."),
    ("Cite Check (the safety shield)", "Paste any draft brief. Themis checks every cited court case against a real public database. Fake citations get a big red NOT FOUND."),
    ("Draft", "Generates a first draft of a letter or motion from your case facts — every sentence carries its proof. It never invents a court case."),
    ("Deposition outlines", "Pick a witness; Themis writes the question outline, with the exact exhibits to have ready."),
    ("Damages", "Itemize money owed (medical bills, lost wages, etc.) — feeds straight into demand letters."),
    ("Deadlines + Productions", "Paste a court scheduling order and it extracts every deadline. Track every batch of documents exchanged with the other side."),
    ("Firm Library + Archive", "Save reusable templates your whole office shares. Closed cases move to the archive but keep their full record."),
    ("Audit trail + Verified badge", "Every action is locked in a tamper-proof log. Filings get a public link a judge or opposing counsel can click to confirm everything was checked."),
]
col_w = doc.width/2 - 6
rows = []
for i in range(0, len(features), 2):
    left = card(features[i][0], features[i][1], width=col_w)
    right = card(features[i+1][0], features[i+1][1], width=col_w) if i+1 < len(features) else Spacer(1,1)
    rows.append([left, right])
grid = Table(rows, colWidths=[col_w + 2, col_w + 2])
grid.setStyle(TableStyle([
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 0),
    ("RIGHTPADDING", (0,0), (0,-1), 8),
    ("RIGHTPADDING", (1,0), (1,-1), 0),
    ("TOPPADDING", (0,0), (-1,-1), 0),
    ("BOTTOMPADDING", (0,0), (-1,-1), 8),
]))
E.append(grid)

E.append(Paragraph("Where it stands today", styles["h3"]))
E.append(Paragraph(
    "The app is built and running. It was designed first for personal-injury and general "
    "litigation. Before we point it at <b>immigration</b> work, we want to learn how immigration "
    "cases actually flow — which is why we're talking to you.",
    styles["bodysoft"]))

# ── INTERVIEW QUESTIONS ────────────────────────────────────────────────
E.append(Spacer(1, 2))
E.append(Paragraph("Questions for the immigration paralegal", styles["h2"]))
E.append(Paragraph(
    "Goal: understand the real day-to-day so Themis fits immigration practice, not just generic "
    "litigation. Listen more than pitch. The italics under each question are why we're asking.",
    styles["bodysoft"]))

def qsection(title):
    E.append(Paragraph(title, styles["h3"]))

def q(text, why):
    E.append(Paragraph("•&nbsp;&nbsp;" + text, styles["q"]))
    E.append(Paragraph("&nbsp;&nbsp;&nbsp;&nbsp;" + why, styles["qwhy"]))

qsec_blocks = [
 ("Your day + biggest time sinks", [
    ("Walk me through a typical case from intake to filing — what are the steps?",
     "Maps the real workflow so we know which tabs matter and in what order."),
    ("What part of the job eats the most hours and feels the most repetitive?",
     "Tells us where Themis saves the most time first."),
    ("What do you do today that you wish a computer would just do for you?",
     "Surfaces the killer feature in their words."),
 ]),
 ("Documents + evidence", [
    ("What kinds of documents do you handle most? (I-589, I-130, country reports, declarations, RFE responses, court notices…)",
     "Tells us what the upload pile actually contains so extraction is tuned right."),
    ("How much of your evidence is in other languages, and how do you handle translations + certifications?",
     "Immigration is translation-heavy — we may need OCR + translation handling generic litigation doesn't."),
    ("How do you organize country-conditions evidence and keep it current?",
     "Country reports are a unique immigration evidence type; we might build a dedicated shelf."),
 ]),
 ("Forms, deadlines + government systems", [
    ("Which government deadlines hurt most if missed (filing windows, RFE response dates, master/individual hearings)?",
     "Our deadline tracker should speak immigration, not just 'scheduling order'."),
    ("Do you live in USCIS, EOIR/ECAS, the online case status tools — and do they talk to your other software?",
     "Tells us what to integrate with vs. replace."),
    ("How do you track the same client across multiple petitions or family members?",
     "Immigration matters cluster by family/sponsor; our 'one matter = one case' model may need to flex."),
 ]),
 ("Writing + research", [
    ("What do you draft most — declarations, briefs, cover letters, RFE responses?",
     "Tells us which Draft templates to ship for immigration."),
    ("When you cite law (BIA decisions, circuit cases, the INA, regs), where do you look it up and how do you verify it's still good?",
     "Cite Check covers federal + state courts today; immigration needs BIA/AAO + the INA — this tells us the gap."),
    ("Have you (or anyone you know) been burned by AI making up a fake case or wrong statute?",
     "Confirms whether the Cite Check shield resonates as much in immigration."),
 ]),
 ("Trust, privacy + the client", [
    ("How sensitive is the client data you handle, and what privacy rules constrain you?",
     "Immigration clients are vulnerable; tells us how hard to lock down sharing + storage."),
    ("Do you ever share case materials with co-counsel, interpreters, or the client — and how?",
     "Validates our read-only share-link feature and what it must hide."),
    ("If a tool claimed to use AI on your cases, what would make you trust it — or refuse to?",
     "The honest answer shapes our whole trust story."),
 ]),
 ("Tools + money", [
    ("What software do you use now (case management, forms, calendaring) and what do you pay?",
     "Anchors our pricing and tells us what we plug into vs. compete with."),
    ("If something saved you 5 hours a week, what would that be worth to your office?",
     "Validates the price tiers."),
    ("Who decides whether your office buys a new tool — you, an attorney, an office manager?",
     "Tells us who we actually need to sell to."),
 ]),
 ("The close", [
    ("Could I set you up with a real case in Themis and watch you use it for 30 minutes?",
     "The single most valuable thing — watch real friction, fix it, win a first customer."),
    ("Who else in immigration should I be talking to?",
     "Referrals are the cheapest growth."),
 ]),
]
for title, qs in qsec_blocks:
    block = [Paragraph(title, styles["h3"])]
    for text, why in qs:
        block.append(Paragraph("•&nbsp;&nbsp;" + text, styles["q"]))
        block.append(Paragraph("&nbsp;&nbsp;&nbsp;&nbsp;" + why, styles["qwhy"]))
    E.append(KeepTogether(block))

E.append(rule())
E.append(Paragraph(
    "One rule for the meeting: <b>ask, then shut up and listen.</b> The best questions get her "
    "talking about what actually goes wrong in her week. Every frustration she names is a feature "
    "we can build. Don't sell — learn.",
    styles["tiny"]))

doc.build(E)
print("wrote", OUT)
