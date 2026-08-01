"""
UNDERTOW — pull the spoken lines out of a teleplay.

Everything in the sound department starts here. The cue sheet, the lexicon, the
mouth charts and eventually the record script are all derived from one source:
the teleplay itself. Nothing downstream retypes a line of dialogue, because a
retyped line is a line that can drift from the script without anybody noticing.

The teleplays are markdown written for humans to read, not a structured format,
so this parses the two shapes they actually use:

    **KAI:** I'm not afraid of the water.
    **DAIGO** *(quiet, to the water)*: …All right. I hear you.
    > **GRANDMOTHER (V.O.):** Deep calls to deep…

Speaker suffixes — (V.O.), (O.S.), (CONT'D), (age 7) — are captured separately
rather than thrown away, because they decide whether a line needs lip-sync at
all. A V.O. or O.S. line has no mouth on screen and therefore no sync problem,
which is the cheapest win in the entire pipeline and worth knowing about up
front rather than discovering in a review.
"""
import re
import unicodedata

# **NAME** or **NAME (V.O.)** followed by an optional *(parenthetical)* and a
# colon. The name is upper-case in every teleplay in this project, which is
# what keeps this from matching ordinary bold text mid-paragraph.
#
# THE COLON IS MANDATORY, and that is load-bearing. These teleplays also open
# action beats in bold — "**UNDERWATER.** *The most beautiful and most
# terrifying water ever animated…*", "**ON THE DECK** *Twelve seconds…*" —
# which are structurally identical to a dialogue cue except that nobody says
# them. Without the colon requirement they parse as characters named
# UNDERWATER. and ON THE DECK, and a stage direction ends up in a record
# script. Screenplay convention puts a colon after every speaker, so requiring
# one costs nothing and removes the whole class of false positive.
# The colon lands in one of two places depending on whether a parenthetical
# intervenes, and it is never in both:
#
#     **KAI:** I don't swim at all.                     ← inside the bold
#     **DAIGO** *(quiet, to the water)*: …All right.    ← after the direction
#
# so both positions are captured optionally and exactly one is required below.
# Demanding it in a fixed position silently drops every line of the other form,
# which is a worse failure than the false positives it was fixing: a dropped
# line is a character who goes quiet in the record script and nobody notices.
LINE = re.compile(
    r"^\s*>?\s*\*\*(?P<who>[A-Z][A-Z0-9 '\.\-]*?)"          # KAI, COACH GOUDA
    r"(?:\s*\((?P<suffix>[^)]*)\))?"                        # (V.O.), (age 7)
    r"\s*(?P<incolon>:)?\*\*"                               # **NAME:** or **NAME**
    r"\s*(?:\*\((?P<paren>[^)]*)\)\*)?"                     # *(quiet, to the water)*
    r"\s*(?P<outcolon>:)?\s*(?P<text>.*)$"
)

# A dialogue block ends at a blank line, a horizontal rule, a heading, or the
# start of the next bold/italic block. It does NOT end at the physical end of
# the line, which is the bug this replaced: the teleplays wrap dialogue for
# readability, so "…All right. I hear you." was being read as "…All", and
# every wrapped line in the show was silently losing its second half.
STOP = re.compile(r"^\s*(?:$|---|#|>?\s*\*)")

# Lines that carry no mouth on screen. Kept as a set rather than a substring
# test so that "(CONT'D)" on an on-screen line is not mistaken for off-screen.
OFFSCREEN = {"V.O.", "VO", "O.S.", "OS", "V.O", "O.S", "OFF", "PRE-LAP", "V/O"}


def _clean(text):
    """Normalise the typography a teleplay uses to the characters speech has.

    Ellipses, en dashes and curly quotes are all real characters in the script
    and none of them is a sound. They have to go before a word is looked up in
    a pronunciation dictionary, or every line that ends in a trailing thought
    acquires a word called "water…" that no lexicon has ever heard of.
    """
    text = unicodedata.normalize("NFKC", text)
    for a, b in (("…", " "), ("—", " "), ("–", " "),
                 ("’", "'"), ("‘", "'"),
                 ("“", ""), ("”", "")):
        text = text.replace(a, b)
    text = re.sub(r"\*+", "", text)             # stray markdown emphasis
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def parse(markdown):
    """Yield one dict per spoken line, in script order.

    Returns: who, suffix, direction, text, onscreen, line_no.
    """
    out = []
    lines = markdown.splitlines()
    for i, raw in enumerate(lines, start=1):
        m = LINE.match(raw)
        if not m:
            continue
        if not (m.group("incolon") or m.group("outcolon")):
            continue                     # an action beat in bold, not a speaker
        # Gather the wrapped remainder of the speech before cleaning it.
        parts = [m.group("text") or ""]
        for nxt in lines[i:]:
            if STOP.match(nxt):
                break
            parts.append(nxt.strip().lstrip("> "))
        raw_text = " ".join(parts).strip()

        # These scripts also use the speaker shape for cues nobody says:
        #     **ON THE DECK:** *Twelve seconds. Thirty…*
        #     **SCORE:** *the CALL, once, high and thin…*
        # Both carry a colon, so the colon rule alone cannot separate them. What
        # does separate them is that their body is WHOLLY italic, and speech in
        # these teleplays never is — italics are reserved for action and for the
        # parenthetical, which the regex has already taken off the front. Testing
        # the shape rather than blocklisting the names means the next script can
        # invent **SFX:** or **ON THE BLOCKS:** and it is handled already.
        if raw_text.startswith("*") and raw_text.endswith("*"):
            continue
        text = _clean(raw_text)
        if not text:
            continue
        who = m.group("who").strip()
        suffix = (m.group("suffix") or "").strip()
        # A speaker with no letters is a false positive on bold body text.
        if not re.search(r"[A-Z]", who):
            continue
        out.append({
            "who": who,
            "suffix": suffix,
            "direction": _clean(m.group("paren") or ""),
            "text": text,
            "onscreen": suffix.upper() not in OFFSCREEN,
            "line_no": i,
        })
    return out


WORD = re.compile(r"[A-Za-z']+")


def words(text):
    """Words as a pronunciation dictionary would key them: upper, no punctuation.

    Trailing possessives are kept ("KAI'S" is a real CMUdict entry) but bare
    leading and trailing apostrophes are stripped, because a quote mark is not
    part of a word and would otherwise produce a miss for every quoted line.
    """
    return [w.upper().strip("'") for w in WORD.findall(text) if w.strip("'")]


def scene_headings(markdown):
    """Slug lines, so a cue can be tied to a scene rather than a line number.

    A line number moves the moment anybody edits the script above it. A scene
    heading survives a rewrite, which is the whole reason spotting sheets are
    written against scenes in the first place.
    """
    out = []
    for i, raw in enumerate(markdown.splitlines(), start=1):
        s = raw.strip()
        # INT./EXT. only. "**UNDERWATER.**" was in this list and should not have
        # been: it is an action beat, not a slug, and treating it as a scene
        # heading moved every following line into a scene it was not in. That
        # mislabelled Gouda's "Not him." as underwater when he is standing on the
        # deck — and since the heading is what guesses the Fathom tier, it would
        # have put a poolside line in a submerged acoustic.
        if re.match(r"^\*\*(INT\.|EXT\.|INT/EXT)", s):
            out.append({"line_no": i, "heading": _clean(s)})
        elif re.match(r"^##+\s", s):
            out.append({"line_no": i, "heading": _clean(re.sub(r"^#+\s*", "", s))})
    return out
