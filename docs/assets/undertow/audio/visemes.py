"""
UNDERTOW — phonemes to mouths, and mouths to a per-frame chart.

THIS FILE IS THE WHOLE REASON LIP-SYNC IS VERIFIABLE AT ALL.

The standing limitation on this project is that I can check a pose and I cannot
check a movement. Every swimming fault that got caught was visible in one frame;
the two that were not — the dolphin kick starting at the legs, the shot drifting
inside itself — had to be found by a human, because they are properties of a
SEQUENCE and no still shows them.

Lip-sync is the purest sequence property there is. A mouth chart is what
converts it back into something checkable: a table saying which of nine mouth
shapes should be on screen at each frame index. Once that table exists, "is this
in sync" stops being a judgement and becomes a comparison — sample the frames at
the chart's own timestamps and read them off. That is the unlock, and everything
here exists to produce that table.

────────────────────────────────────────────────────────────────────────────
THE MOUTH SET — eight shapes and a rest

Western animation's Preston Blair chart uses ten. Japanese animation
traditionally uses far fewer — essentially the five vowels plus a closed mouth —
which is part of why anime mouths read as stylised rather than rotoscoped. Eight
plus rest sits deliberately between the two: enough to carry consonant
articulation where the camera is close, few enough to draw as a fixed sheet.

Two of the eight do almost all the perceptual work, and neither is a vowel:

    M   the lips actually MEET. Nobody consciously reads vowel shapes, but a
        missed closure on an m, b or p is caught by everyone, every time. This
        is the single shape that decides whether sync looks real.
    F   the lower lip touches the upper teeth. Same argument, second place.

────────────────────────────────────────────────────────────────────────────
THE THREE RULES, and none of them contains the word "or"

A rule with an "or" in it gets exploited — that lesson came from the swimming
codex, where "eyes down, or down-and-slightly-forward" permitted a craned neck
twice before it was tightened. So each of these commits to one behaviour.

  1. CLOSURES ARE ABSOLUTE. Every M, B and P closes the lips. It is never
     merged away, never softened, never dropped for being short.
  2. ANYTHING UNDER TWO FRAMES IS ABSORBED into its neighbour. A mouth that
     hits every phoneme flaps; real articulation carries through short sounds
     rather than posing on each one. Rule 1 outranks this one.
  3. THE MOUTH LEADS THE SOUND BY EXACTLY ONE FRAME. Anticipation is standard
     practice: the eye forgives a mouth that is early and never forgives one
     that is late.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
LEXICON = os.path.join(HERE, "lexicon.json")
CMUDICT = os.path.join(HERE, "cmudict.dict")

# ── the mouth set ───────────────────────────────────────────────────────────
REST = "X"
MOUTHS = {
    "A": "open wide — jaw down, lips relaxed and apart",
    "E": "mid open — lips slightly spread, jaw half",
    "I": "spread — corners wide, teeth nearly together",
    "O": "rounded open — lips forward in a ring",
    "U": "small round — lips pushed forward, tight aperture",
    "M": "CLOSED — upper and lower lip in contact",
    "F": "lower lip drawn under the upper teeth",
    "C": "narrow consonant — teeth close, lips neutral",
    REST: "rest — closed, relaxed, no articulation",
}

# ARPAbet -> mouth. Stress digits are stripped before lookup.
PHONE_TO_MOUTH = {
    # closures — rule 1 protects exactly these three
    "M": "M", "B": "M", "P": "M",
    # labiodental
    "F": "F", "V": "F",
    # open vowels
    "AA": "A", "AE": "A", "AH": "A", "AY": "A", "AW": "A",
    # mid
    "EH": "E", "EY": "E", "ER": "E", "AXR": "E",
    # spread / high front
    "IY": "I", "IH": "I", "Y": "I",
    # rounded open
    "AO": "O", "OW": "O", "OY": "O",
    # rounded closed
    "UW": "U", "UH": "U", "W": "U",
    # everything else articulates behind a narrow, neutral mouth
    "S": "C", "Z": "C", "SH": "C", "ZH": "C", "CH": "C", "JH": "C",
    "T": "C", "D": "C", "N": "C", "NG": "C", "K": "C", "G": "C",
    "L": "C", "R": "C", "TH": "C", "DH": "C", "HH": "C",
}
CLOSURES = {"M", "B", "P"}

# ── duration model ──────────────────────────────────────────────────────────
# Relative weights, not milliseconds. The absolute length of a line is known
# from its audio (or from a read-rate estimate), so what this needs to supply is
# the SHAPE of the distribution — which sounds are long and which are quick.
# Working in weights rather than fixed durations means a line delivered slowly
# and the same line delivered fast both chart correctly from one table.
#
# The ordering here is the uncontroversial part of speech timing: stressed
# vowels are the longest things in an utterance, stops are the shortest, and
# fricatives and affricates sit between them because friction takes time to
# establish.
WEIGHT_STOP = 0.55          # P B T D K G
WEIGHT_NASAL = 0.65         # M N NG
WEIGHT_GLIDE = 0.60         # W Y L R
WEIGHT_FRICATIVE = 0.95     # F V S Z SH ZH TH DH HH
WEIGHT_AFFRICATE = 1.10     # CH JH
WEIGHT_VOWEL = {0: 0.75, 1: 1.45, 2: 1.05}   # by stress digit

STOPS = {"P", "B", "T", "D", "K", "G"}
NASALS = {"M", "N", "NG"}
GLIDES = {"W", "Y", "L", "R"}
FRICATIVES = {"F", "V", "S", "Z", "SH", "ZH", "TH", "DH", "HH"}
AFFRICATES = {"CH", "JH"}

# Silence inserted at PUNCTUATION only. A comma is a real event in a performance
# and charting straight through it is what makes synthetic mouths look
# mechanical.
#
# There is deliberately no inter-word pause. Connected speech does not return
# the mouth to rest between every word — "not afraid" is articulated as one
# gesture, and inserting even a fifth of a beat of silence there produced
# single-frame closures mid-phrase, which is precisely the flapping that rule 2
# exists to prevent. The mouth closes when the speaker stops, not when the
# typography does.
PAUSE_COMMA = 1.10
PAUSE_PERIOD = 1.90


def load_lexicon(show=LEXICON, general=CMUDICT):
    """General English underneath, the show's own words on top.

    Two layers, deliberately. The general layer is CMUdict vendored whole, so a
    line nobody has written yet still charts — an earlier version held only the
    words the four teleplays already used, which meant the first new line of
    dialogue anyone wrote crashed the pipeline. The show layer is small enough to
    read in one sitting, which matters because it is where the names live, and a
    wrong vowel in a character's own name survives all the way to a recording
    session. Show entries win, so "GOUDA" is a coach and never a cheese.
    """
    lex = {}
    with open(general, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            parts = line.split()
            word = parts[0].upper()
            if word.endswith(")"):                 # "the(2)" — alternate reading
                continue                           # first form only, always
            phones = [p for p in parts[1:] if p[:1].isalpha()]
            if phones and word not in lex:
                lex[word] = " ".join(phones)
    with open(show, encoding="utf-8") as fh:
        lex.update(json.load(fh)["entries"])
    return lex


def strip_stress(phone):
    return phone.rstrip("012")


def phone_weight(phone):
    """How long this sound wants to be, relative to its neighbours."""
    bare = strip_stress(phone)
    if bare in STOPS:
        return WEIGHT_STOP
    if bare in NASALS:
        return WEIGHT_NASAL
    if bare in GLIDES:
        return WEIGHT_GLIDE
    if bare in AFFRICATES:
        return WEIGHT_AFFRICATE
    if bare in FRICATIVES:
        return WEIGHT_FRICATIVE
    stress = phone[-1] if phone[-1:].isdigit() else "0"
    return WEIGHT_VOWEL[int(stress)]


def mouth_for(phone):
    return PHONE_TO_MOUTH.get(strip_stress(phone), "C")


def transcribe(text, lexicon, on_missing="raise"):
    """Text -> a flat phone sequence with pauses, as (phone, weight) pairs.

    Silence is emitted as the literal token "sil" so that pauses are first-class
    events in the chart rather than gaps between events. A verifier can then ask
    "was the mouth closed where the line was silent", which is a real check and
    one that catches a mouth left flapping through a beat.
    """
    import re
    out = []
    # Split on whitespace but keep the punctuation that ends each word, because
    # the punctuation is what sizes the pause after it.
    for raw in text.split():
        word = re.sub(r"[^A-Za-z']", "", raw).upper().strip("'")
        if not word:
            continue
        phones = lexicon.get(word)
        if phones is None:
            if on_missing == "raise":
                raise KeyError(
                    f"{word!r} is not in the lexicon — add it to MANUAL in "
                    f"build-lexicon.py and rebuild. A missing word is a hole in "
                    f"the chart at exactly the moment somebody speaks."
                )
            phones = ""
        for p in phones.split():
            out.append((p, phone_weight(p)))
        tail = raw[len(raw.rstrip(".,;:!?—-")):] if raw.rstrip(".,;:!?—-") != raw else ""
        if any(c in tail for c in ".!?"):
            out.append(("sil", PAUSE_PERIOD))
        elif any(c in tail for c in ",;:"):
            out.append(("sil", PAUSE_COMMA))
    while out and out[-1][0] == "sil":
        out.pop()
    return out


def to_timeline(pairs, duration_s, lead_s=0.0):
    """Spread the weighted phones across a known duration.

    Returns [(phone, start_s, end_s)]. `lead_s` shifts everything earlier, which
    is where rule 3 is applied: the chart is the MOUTH's timeline, and the mouth
    runs ahead of the sound.
    """
    total = sum(w for _, w in pairs)
    if total <= 0:
        return []
    t, out = -lead_s, []
    for phone, w in pairs:
        dt = duration_s * w / total
        out.append((phone, t, t + dt))
        t += dt
    return out


def chart(timeline, fps=24, duration_s=None):
    """Per-frame mouth shapes. This is the artefact everything downstream uses.

    Rules 1 and 2 are applied here, in that order, because they conflict: a
    plosive is short enough that rule 2 would happily absorb it, and rule 1
    exists precisely to stop that. Closures are protected FIRST and the merge
    pass is then forbidden from touching them.
    """
    if duration_s is None:
        duration_s = max((e for _, _, e in timeline), default=0.0)
    n = max(1, int(round(duration_s * fps)))
    frames = [REST] * n
    # Which frames a closure claims, so the merge pass can be told to leave them.
    protected = [False] * n

    for phone, start, end in timeline:
        a = max(0, int(round(start * fps)))
        b = min(n, int(round(end * fps)))
        if phone == "sil":
            for i in range(a, b):
                frames[i] = REST
            continue
        m = mouth_for(phone)
        # RULE 1: a closure always gets at least one frame, even if its computed
        # span rounds to nothing. A dropped closure is the one error an audience
        # reliably notices, so it is the one thing allowed to overrun its budget.
        if strip_stress(phone) in CLOSURES and b <= a:
            b = min(n, a + 1)
        for i in range(a, b):
            frames[i] = m
            if strip_stress(phone) in CLOSURES:
                protected[i] = True

    # RULE 2: absorb runs shorter than two frames into whichever neighbour is
    # longer, so the mouth carries through instead of flapping. Protected
    # closure frames are skipped entirely.
    i = 0
    while i < n:
        j = i
        while j < n and frames[j] == frames[i]:
            j += 1
        run = j - i
        # REST runs are absorbed too. A single frame of closed mouth in the
        # middle of a phrase reads as a flap whatever produced it, and a genuine
        # pause is always longer than one frame at any speakable rate.
        if run < 2 and not any(protected[i:j]):
            before = frames[i - 1] if i > 0 else None
            after = frames[j] if j < n else None
            pick = before if before is not None else after
            if before is not None and after is not None:
                # extend whichever neighbouring run is longer; ties go backwards
                bl = _run_len_back(frames, i - 1)
                al = _run_len_fwd(frames, j)
                pick = before if bl >= al else after
            if pick is not None:
                for k in range(i, j):
                    frames[k] = pick
        i = j
    return frames


def _run_len_back(frames, i):
    if i < 0:
        return 0
    v, n = frames[i], 0
    while i >= 0 and frames[i] == v:
        i -= 1
        n += 1
    return n


def _run_len_fwd(frames, i):
    if i >= len(frames):
        return 0
    v, n = frames[i], 0
    while i < len(frames) and frames[i] == v:
        i += 1
        n += 1
    return n


def closure_frames(frames):
    """Frame indices where the lips must be shut. The non-negotiable check."""
    return [i for i, m in enumerate(frames) if m == "M"]


def openness(frames):
    """How open the mouth is per frame, 0..1 — the envelope a verifier can
    cross-correlate against the audio to measure sync offset.

    A shape sheet is categorical, and categories cannot be correlated. Mapping
    them onto one ordered axis gives a signal that can be lined up against the
    speech envelope, which is what turns "is it in sync" into a number of frames.
    """
    scale = {"X": 0.00, "M": 0.00, "F": 0.15, "C": 0.30,
             "I": 0.45, "U": 0.50, "E": 0.65, "O": 0.80, "A": 1.00}
    return [scale[m] for m in frames]
