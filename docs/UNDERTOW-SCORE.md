# UNDERTOW Score and Sound Bible

The music brief for the series. Everything here exists as audio in the repo and
is rebuildable from source; nothing in this document is aspirational.

Companion docs: [Series Bible](UNDERTOW-ANIME-BIBLE.md) · [Fathom Card](UNDERTOW-FATHOM-CARD.md) · [Art Protocol](UNDERTOW-ART-PROTOCOL.md)

---

## Why the score is written and owned, not licensed

A series is identified by its theme. If that theme is library music, the thing
the audience recognises belongs to someone else, and every future use — a
trailer, a game, a live show, a territory — is a negotiation. So UNDERTOW's
theme is composed from first principles inside this repo: owned outright,
revisable to the frame, no licence attached to the sound of the show.

Everything is synthesised in `docs/assets/undertow/build-score.py` and
`build-signatures.py`. No generated audio, no sample packs, no cleared cues.
The Splice field recordings used underneath the teaser are ambience only, and
they carry no melodic content.

---

## The Thesis

The series takes its title phrase from Psalm 42:7 — **"deep calls to deep"** —
which the grandmother speaks over the cold open. The theme makes it literal.

**THE CALL.** Five notes that fall a sixth, then lift one step: sinking, and
refusing to stay sunk. Singable on first hearing, which is the whole point.

```
        A4      F4      D4      C4          D4
        1.5     1.0     1.5     1.0         3.0     beats
```

**THE ANSWER.** The same figure returned from below — an octave and a fifth
down, two bars late, slower and heavier.

```
        D3      A#2     G2      F2          G2
        2.0     1.5     2.0     1.5         4.0     beats
```

**Key:** D minor. **Tempo:** 60 BPM — a resting heart rate, so one beat is one
second of breath-hold.

### Why this grammar earns its keep

Once an audience knows that the call is always answered, the score can say
things dialogue cannot, and the show never has to explain any of it:

| What happens musically | What it means |
|---|---|
| The answer arrives **on time** | The world is in order. Baseline. |
| The answer arrives **early** | The deep is reaching for someone. Something is coming. |
| The answer arrives in the **wrong key** | The Second Tide. Nakaru's presence, spoken or not. |
| The answer arrives at the **call's own tempo** | Resolution. Reserved. Used once in the teaser, on the title. |
| **No answer comes** | The worst thing in the show. Spend this almost never. |

That last row is the one to protect. An unanswered call should happen a
countable number of times across five seasons, and the audience should feel it
before they can say why.

---

## The Fathom Ladder: rank you can hear

The Bible asks the audience to chart Fathom like a stat sheet. A number on
screen is not enough; the ladder has to be audible, so a viewer knows how deep
a scene is with their eyes closed.

**The five ranks spell the show's home chord downward.**

| Rank | Depth | Note | Lowpass | Reverb | Character |
|---|---|---|---|---|---|
| **Sunlit** | 0–20m | D5 | 12 kHz | 1.2 s | Bright, close, full attack |
| **Twilight** | 20–200m | A4 | 7 kHz | 2.0 s | First loss of air in the top end |
| **Midnight** | 200–1,000m | F4 | 4 kHz | 3.2 s | Sub begins taking over from glass |
| **Abyssal** | 1,000–6,000m | D3 | 2 kHz | 4.6 s | Felt more than heard |
| **Hadal** | 6,000m+ | D2 | 800 Hz | 7.0 s | No attack at all |

Two things change together as you descend, and **both are physically true of
water** — treble dies, space grows. That is why the ladder teaches itself: no
one has to be told which sound is deeper.

**Hadal breaks the pattern on purpose.** It is the only stinger with no attack
transient; it swells in and is simply already there. You do not hear yourself
arrive at Hadal. Keep that property if the cue is ever re-orchestrated.

---

## The Motifs

Five recurring sounds with fixed meaning. They are built from the theme's own
instruments — struck glass, sub sine, breathing pad, membrane pulse — because
a stinger that shares timbre with the main title reads as the same world, and
one assembled from unrelated samples reads as a different show's library.

### Current Wakes
The CALL's descending shape mirrored so it lifts instead, quicker than the
theme, over the relative major. The identical gesture, welcomed. Use on a
Current waking, not on a Current being used.

### Dive Reflex
Bradycardia rendered literally: the heartbeat easing from 72 to 38 BPM across
the cue. This is the physiological core of the series made audible, and it is
the single most reusable sound in the kit. Warm and safe when it settles.

**The same figure, sped up and clipped, is panic** — which is the show's actual
villain. Do not build a separate panic cue; deform this one. The audience
already knows it, and hearing their safe sound go wrong is the point.

### Second Tide
Canon states the rule outright, so the motif obeys it: the theme exactly, with
the answer transposed a **tritone** away — the furthest wrong an answer can
land.

Note what is deliberately absent. Nothing is detuned, nothing growls, there is
no dissonant cluster and no low brass. **Nakaru is not scored as a monster.**
He is scored as the right shape, answered wrongly, which is what makes him
arguable rather than evil. If a future cue reaches for horror instruments on
his entrance, it has misread the character.

### Open Door
Kai's *Undertow: Open Door* — the deep pulling upward, a vertical current in a
flat pool. A sub glissando climbing two octaves beneath the call.

It is the only motif in the kit that **ascends in the low register**, because
it is the only time in the series that the deep reaches up. Protect that
exclusivity; it is what will make *Bring You Home* land five seasons out.

### Riddim Break
Kemar's *One Drop: Riddim Break*. One-drop feel with the emphasis on beat
three, then a full bar of nothing, then the bass returns displaced by half a
beat — he alone kept time, and everyone else is now late.

**The silence is the technique.** Everything before the hole is setup for it.

---

## The Teaser Cue

The 37.7 second cue under the teaser is scored to that specific edit, and the
sync points are **measured from the cut, not assumed**. An earlier pass guessed
them and sat 0.45 s early on the title card, which is the one hit that has to
be exact.

| Section | Music |
|---|---|
| Kai sinking | The call, alone, over the sea's breath |
| Ren | Cold. The answer refuses to come; a bare fifth instead |
| Kemar | The heartbeat arrives — the first warmth in the cut |
| Luna | The call returns high and thin, the answer beneath it |
| Nakaru | Everything strips away. One low note, held |
| Title | The call, answered at last |

On the title, the answer returns **at the call's own tempo** — all cue long the
deep has replied late and heavy, and here it replies in time. That is the
series thesis in one bar, and the title card holds for exactly as long as the
resolution needs, rather than for a round number.

---

## Rules for anyone scoring an episode

1. **The call is the property.** Any cue may quote it; no cue may contradict it.
2. **Never resolve for free.** A resolved answer is the most expensive thing in
   the score. Earn it in picture first.
3. **Depth dictates brightness.** A cue in deep water that is bright is wrong,
   whatever it is doing melodically. Follow the Fathom lowpass table.
4. **Panic is deformation, not a new theme.** See *Dive Reflex*.
5. **Do not score Nakaru as a villain.** See *Second Tide*.
6. **Silence is available.** *Riddim Break* establishes that a hole in the
   music is a deliberate event in this show, which means silence can be used
   dramatically anywhere without reading as a dropout.
7. **Surface real, deep legendary.** The Deep-Water Doctrine applies to the
   score exactly as it applies to picture: in a surface pool the music
   whispers; below Midnight it may go as big as anything in the genre.

---

## What exists, and how to rebuild it

| Asset | Path |
|---|---|
| Main theme, 64 s concert statement | `docs/assets/undertow/undertow-theme.wav` |
| Fathom stingers (5) | `docs/assets/undertow/signatures/fathom-*.wav` |
| Motifs (5) | `docs/assets/undertow/signatures/motif-*.wav` |
| Teaser cue | `docs/assets/undertow/qc/teaser-score.wav` |
| Scored teaser | `docs/assets/undertow/teaser-undertow.mp4` |

```bash
cd docs/assets/undertow
python3 build-score.py         # theme + teaser cue
python3 build-signatures.py    # the ten signature sounds
python3 build-teaser.py        # cut picture, mix score over the ambience bed

python3 qc/verify_signatures.py            # structural + level verification
python3 qc/verify_audio.py undertow-theme.wav
python3 qc/verify_assets.py                # the art-integrity gate
```

### Delivery spec

The signature kit is normalised to **-16 LUFS integrated** with a **-1.0 dBTP**
ceiling, matched within 1.4 LU across all ten files. Two stingers sit slightly
under target because their crest factor will not allow more without breaching
the ceiling; the build reports these as capped rather than clipping quietly.

### How this is verified

Loudness and true peak cannot tell you whether a ladder is a ladder, so
`qc/verify_signatures.py` measures the design claims directly and fails if any
is absent: brightness must fall and space must grow monotonically across all
five ranks, the dive reflex must measurably slow, the riddim break must
actually contain a hole, and both ascending motifs must ascend. The click
detector is calibrated against a deliberately planted defect rather than a
guessed threshold.

The asset gate checksums every registered file, including audio, and fails on
any drift after sign-off.
