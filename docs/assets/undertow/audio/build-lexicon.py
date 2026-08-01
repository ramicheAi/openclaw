#!/usr/bin/env python3
"""
UNDERTOW — build the show's pronunciation lexicon.

WHY THIS IS VENDORED RATHER THAN LOOKED UP AT RUNTIME.

Everything else in the sound department runs on numpy and scipy, which are
always here. A pronunciation dictionary is the one piece of reference data the
pipeline needs that it cannot compute, and reaching for it over the network at
build time would make every mouth chart in the show depend on a host being up
and a container having been given a network. Containers get reclaimed; the repo
does not. So the dictionary is resolved ONCE, cut down to the words this show
actually says, and committed.

The result is small — the four teleplays use well under a thousand distinct
words — and it makes the whole lip-sync pipeline reproducible offline, forever,
from a clean checkout.

The proper nouns are the interesting part. No general dictionary contains
Isozaki, Kurose, Gyakuryu or Riddim, and those are precisely the words a
Japanese-Jamaican cast says most often. They are hand-authored below, with the
reasoning attached, because a wrong vowel in a character's own name is the kind
of error that survives all the way to a recording session.

    python3 build-lexicon.py --cmudict /path/to/cmudict.dict

Re-run only when the scripts gain new words; the output is committed.
"""
import argparse
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dialogue  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "lexicon.json")
SCRIPTS = "/home/user/openclaw/docs/UNDERTOW-EP*-SCRIPT.md"

# ── hand-authored entries ───────────────────────────────────────────────────
#
# ARPAbet, stress digits kept (0 none, 1 primary, 2 secondary) because vowel
# duration follows stress and the aligner uses that to budget time.
#
# Japanese names are transcribed with the SHORT, pure vowels Japanese actually
# has rather than the diphthongs an English speaker defaults to: Isozaki is
# ee-so-ZAH-kee, not eye-so-ZACK-ee, and every mora carries roughly equal
# weight. Getting this into the lexicon rather than leaving it to a fallback
# rule means the mouth chart opens on the right vowel from the first take.
MANUAL = {
    # — Japanese cast and places —
    "ISOZAKI":    "IY0 S OW0 Z AA1 K IY0",
    "KAI":        "K AY1",              # two morae, ka-i, said as one glide
    "DAIGO":      "D AY1 G OW0",
    "KUROSE":     "K UW0 R OW1 S EY0",  # final -e is EY, never silent
    "REN":        "R EH1 N",
    "MIREI":      "M IH0 R EY1",
    "SANDA":      "S AA1 N D AA0",
    "GOUDA":      "G OW1 D AA0",        # Gō-da, a long o — not the cheese
    "MUNAKATA":   "M UW0 N AA0 K AA1 T AA0",
    "TSUKIKO":    "T S UW0 K IY1 K OW0",
    "AMANE":      "AA0 M AA1 N EY0",
    "NAKARU":     "N AA0 K AA1 R UW0",
    "KAIEN":      "K AY1 EH0 N",
    "GYAKURYU":   "G Y AA0 K UW1 R Y UW0",
    # — Jamaican cast —
    "KEMAR":      "K IH0 M AA1 R",
    "REID":       "R IY1 D",
    "RIDDIM":     "R IH1 D IH0 M",      # riddim, not rhythm: the vowel is flat
    # — the show's own vocabulary —
    "FATHOM":     "F AE1 DH AH0 M",
    "FATHOMS":    "F AE1 DH AH0 M Z",
    "SUNLIT":     "S AH1 N L IH0 T",
    "TWILIGHT":   "T W AY1 L AY2 T",
    "MIDNIGHT":   "M IH1 D N AY2 T",
    "ABYSSAL":    "AH0 B IH1 S AH0 L",
    "HADAL":      "HH EY1 D AH0 L",     # from Hades — long a, not "haddle"
    "FREEWATER":  "F R IY1 W AO2 T ER0",
    "WARDEN":     "W AO1 R D AH0 N",
    "WARDENS":    "W AO1 R D AH0 N Z",
    "MERIDIAN":   "M ER0 IH1 D IY0 AH0 N",
    "UNDERTOW":   "AH1 N D ER0 T OW2",
    "BUOY":       "B UW1 IY0",          # Bo's nickname, said BOO-ee
    "YEMOJA":     "Y EH0 M OW1 J AA0",
    "THALASSA":   "TH AH0 L AE1 S AH0",
    "TANGAROA":   "T AA0 NG G AA0 R OW1 AA0",
    "ONDINE":     "AA0 N D IY1 N",
    "SEDNA":      "S EH1 D N AH0",
    "IARA":       "IY0 AA1 R AA0",
    "GANGA":      "G AH1 NG G AH0",
    "RYN":        "R IH1 N",
    # "PE" is said as two letter names, not as a word.
    "PE":         "P IY1 IY1",
    "TIDIER":     "T AY1 D IY0 ER0",
}

# ── the possessive rule ─────────────────────────────────────────────────────
# CMUdict lists KAI but not KAI'S, BASIN but not BASIN'S. Hand-listing every
# possessive would be busywork that goes stale the moment a script is redrafted,
# and English already has the rule: the ending agrees in voicing with the sound
# before it, and inserts a vowel when that sound is itself a sibilant (otherwise
# the two would be indistinguishable). Same rule as the plural -s.
SIBILANT = {"S", "Z", "SH", "ZH", "CH", "JH"}
VOICELESS = {"P", "T", "K", "F", "TH", "HH"}


def possessive(phones):
    """KAI -> KAI'S. Returns the phone string with the right allomorph."""
    last = phones.split()[-1].rstrip("012")
    if last in SIBILANT:
        return phones + " IH0 Z"        # BASIN'S-style: /ɪz/ after a sibilant
    if last in VOICELESS:
        return phones + " S"            # voiceless after voiceless
    return phones + " Z"                # voiced elsewhere, incl. all vowels


def load_cmudict(path):
    """Parse cmudict.dict. First variant wins.

    Later variants exist for genuine alternate pronunciations ("the(2)"), but a
    chart has to commit to one mouth, and the first entry is the citation form.
    Choosing deterministically matters more than choosing cleverly: the chart
    must be identical on every run or the verifier is measuring noise.
    """
    out = {}
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            parts = line.split()
            word = re.sub(r"\(\d+\)$", "", parts[0]).upper()
            if word in out:
                continue
            phones = [p for p in parts[1:] if re.match(r"^[A-Z]{1,2}\d?$", p)]
            if phones:
                out[word] = " ".join(phones)
    return out


def script_vocabulary():
    """Every distinct word anybody says, across every teleplay."""
    vocab, lines = set(), 0
    for path in sorted(glob.glob(SCRIPTS)):
        with open(path, encoding="utf-8") as fh:
            for entry in dialogue.parse(fh.read()):
                lines += 1
                vocab.update(dialogue.words(entry["text"]))
    return vocab, lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cmudict", required=True, help="path to cmudict.dict")
    args = ap.parse_args()

    cmu = load_cmudict(args.cmudict)
    vocab, lines = script_vocabulary()
    print(f"  {len(cmu):,} dictionary entries, {len(vocab)} words across {lines} spoken lines")

    lex, oov, derived = {}, [], 0
    for w in sorted(vocab):
        if w in MANUAL:
            lex[w] = MANUAL[w]
        elif w in cmu:
            lex[w] = cmu[w]
        elif w.endswith("'S") and (w[:-2] in MANUAL or w[:-2] in cmu):
            lex[w] = possessive(MANUAL.get(w[:-2]) or cmu[w[:-2]])
            derived += 1
        else:
            oov.append(w)

    # Names that appear only in stage directions still belong in the lexicon:
    # they will be spoken eventually, and resolving them now is free.
    for w, p in MANUAL.items():
        lex.setdefault(w, p)

    payload = {
        "_comment": ("UNDERTOW pronunciation lexicon. ARPAbet with stress digits. "
                     "Generated by build-lexicon.py from CMUdict plus hand-authored "
                     "proper nouns; committed so the lip-sync pipeline needs no "
                     "network. Re-run only when the scripts gain new words."),
        "_source": "CMUdict (cmusphinx/cmudict) + docs/assets/undertow/audio/build-lexicon.py MANUAL",
        "_counts": {"entries": len(lex), "hand_authored": len(MANUAL), "possessives_derived": derived,
                    "spoken_lines": lines, "script_vocabulary": len(vocab)},
        "entries": lex,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=1, sort_keys=True, ensure_ascii=False)
        fh.write("\n")

    print(f"  wrote {OUT}  ({len(lex)} entries, {len(MANUAL)} hand-authored)")
    if oov:
        print(f"\n  \033[33m{len(oov)} word(s) had no pronunciation and were DROPPED:\033[0m")
        for w in oov:
            print(f"    {w}")
        print("\n  Add them to MANUAL above and re-run. A dropped word is a hole in "
              "the mouth chart at exactly the moment somebody says it.")
        return 1
    print("  every spoken word resolved")
    return 0


if __name__ == "__main__":
    sys.exit(main())
