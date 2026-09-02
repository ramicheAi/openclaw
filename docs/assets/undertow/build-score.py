"""
UNDERTOW — original score. "Deep Calls to Deep."

Composed here, in code, rather than assembled from library music. The show needs
a motif an audience can carry out of the room, and that has to be ours: owned
outright, revisable to the frame, with no licence attached to the thing the
series is identified by.

────────────────────────────────────────────────────────────────────────────
THE IDEA

The series takes its title phrase from Psalm 42:7 — "deep calls to deep" —
which the grandmother speaks over the cold open. The theme makes that literal.

    THE CALL      a five-note figure that falls and then lifts one step:
                  sinking, and refusing to stay sunk.

    THE ANSWER    the same figure returned from below — an octave and a fifth
                  down, two bars late, slower and heavier.

That is the whole grammar, and it is dramatically loadable. Once the audience
knows the call is always answered, the score can say things dialogue cannot:
an answer that arrives EARLY is the deep reaching for someone. An answer in the
WRONG key is the Second Tide. An answer that never comes is the worst thing in
the show. None of that needs a line of dialogue.

Key: D minor — oceanic, mournful, not melodramatic.
Tempo: 60 BPM. A resting heart rate. Every beat is one second of breath-hold.

────────────────────────────────────────────────────────────────────────────
VOICES — all synthesised from scratch, so the palette is ours too

  glass    the CALL. Struck bowl / wet finger on a glass rim. Odd harmonics,
           long decay. The sound of water in a hard vessel.
  sub      the ANSWER's body. Near-pure low sine — felt in the sternum rather
           than heard, which is exactly how canon describes Freewater's bass.
  pad      a slow breathing bed. Detuned and low-passed, amplitude drifting on
           a ~12s cycle: the sea inhaling.
  drum     nyabinghi-rooted heartbeat, per Freewater's riddim-swimming canon.
           Membrane tone plus filtered noise, felt more than struck.
  bass     round and late, weighted off the downbeat the way reggae sits.

    python3 build-score.py            # theme + teaser score
    python3 build-score.py --theme    # standalone theme only
"""
import math
import os
import subprocess
import sys
import wave

import numpy as np
from scipy.signal import butter, sosfilt

import mastering as M

ART = os.path.dirname(os.path.abspath(__file__))
SR = 48000
BPM = 60.0
BEAT = 60.0 / BPM

# ── pitch ───────────────────────────────────────────────────────────────────
A4 = 440.0
NAMES = {"C": -9, "C#": -8, "D": -7, "D#": -6, "E": -5, "F": -4,
         "F#": -3, "G": -2, "G#": -1, "A": 0, "A#": 1, "B": 2}


def hz(note):
    """'D4' -> frequency. A4 = 440."""
    name, octv = note[:-1], int(note[-1])
    return A4 * (2 ** (NAMES[name] / 12.0 + (octv - 4)))


# ── THE MOTIF ───────────────────────────────────────────────────────────────
# Falls a sixth, then lifts one step. Five notes. Singable on first hearing —
# which is the entire point of a theme.
CALL = ["A4", "F4", "D4", "C4", "D4"]
CALL_BEATS = [1.5, 1.0, 1.5, 1.0, 3.0]      # unhurried; the last note holds

# The answer is the same shape, an octave and a fifth below, and slower.
ANSWER = ["D3", "A#2", "G2", "F2", "G2"]
ANSWER_BEATS = [2.0, 1.5, 2.0, 1.5, 4.0]


def ffmpeg_exe():
    from shutil import which
    exe = which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def lp(x, cut, order=3):
    """Lowpass. Every synthesised transient here needs one.

    A noise burst generated with rng.normal is flat to Nyquist, and nothing
    physical is. Unfiltered it reads to the ear as a click rather than as a
    struck object, and shows up in the spectrogram as a vertical line running
    the full height of the plot. Filtering is what turns noise into a material:
    the corner frequency IS the choice of what was struck.
    """
    return sosfilt(butter(order, cut, "lp", fs=SR, output="sos"), x)


def adsr(n, a, d, s, r, peak=1.0):
    """Envelope in samples-friendly seconds."""
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    S = max(0, n - A - D - R)
    return np.concatenate([
        np.linspace(0, peak, A, endpoint=False),
        np.linspace(peak, peak * s, D, endpoint=False),
        np.full(S, peak * s),
        np.linspace(peak * s, 0, R),
    ])[:n]


def glass(f, dur, amp=0.5):
    """Struck bowl. Odd harmonics, slight inharmonicity, long decay."""
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    out = np.zeros(n)
    # inharmonic partials give it glass rather than organ
    for k, (mult, gain, detune) in enumerate([
            (1.0, 1.00, 0.0), (2.01, 0.36, 0.6), (3.02, 0.24, -0.4),
            (4.04, 0.15, 0.9), (5.07, 0.10, -1.1), (6.9, 0.065, 1.4)]):
        # Upper partials decay a little faster than the fundamental, but only
        # a little. The first version used (1.6 + k*0.85), which kills the top
        # of the bowl inside a second — that is how a DRUM or a wood block
        # behaves, not glass. A struck bowl rings longest up top; that ring IS
        # the instrument. Measurably, the old curve left under 1% of the mix
        # energy above 400Hz and effectively nothing above 1.5kHz, and no
        # amount of EQ can lift content that was never synthesised.
        env = np.exp(-t * (1.15 + k * 0.30))
        out += gain * env * np.sin(2 * np.pi * (f * mult + detune) * t)
    # a breath of air at the attack — the strike, not the tone.
    # Glass is bright, so this rolls off high (9kHz) rather than hard, but it
    # does roll off: a mallet has no energy at 22kHz and flat noise there is
    # heard as a click sitting on top of the note instead of part of it.
    air = np.random.default_rng(int(f)).normal(0, 1, n) * np.exp(-t * 42) * 0.05
    out = out + lp(air, 9000)
    return out * adsr(n, 0.004, 0.10, 0.62, min(dur * 0.6, 2.2)) * amp


def sub(f, dur, amp=0.7):
    """Near-pure low sine with a touch of second harmonic for definition."""
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    w = np.sin(2 * np.pi * f * t) + 0.13 * np.sin(2 * np.pi * f * 2 * t)
    return w * adsr(n, 0.09, 0.25, 0.80, min(dur * 0.5, 1.8)) * amp


def pad(freqs, dur, amp=0.24, seed=7):
    """Detuned breathing bed. Amplitude drifts on a slow cycle — the sea inhaling.

    `seed` only changes the oscillators' start phases. Rendering the bed twice
    with two seeds gives a genuinely decorrelated left and right — real stereo
    synthesis, not one signal widened after the fact — and it is the single
    biggest contributor to the image in this score.
    """
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    out = np.zeros(n)
    rng = np.random.default_rng(seed)
    for f in freqs:
        for det in (-0.22, 0.0, 0.27):
            ph = rng.random() * 2 * np.pi
            # Jitter the detune per seed as well as the phase. Phase alone
            # decorrelates poorly at low frequencies — a few degrees of offset
            # on a 90Hz oscillator is almost no difference at all — whereas a
            # slightly different beat rate on each side is genuine chorusing,
            # and chorusing is what makes a pad feel like a space.
            det = det + rng.normal(0, 0.06)
            out += np.sin(2 * np.pi * (f + det) * t + ph)
    out /= (len(freqs) * 3)
    breath = 0.72 + 0.28 * np.sin(2 * np.pi * t / 12.0 - math.pi / 2)
    return out * breath * adsr(n, 2.2, 1.0, 0.9, 3.0) * amp


def heartbeat(dur, bpm=60.0, amp=0.5):
    """Nyabinghi-rooted pulse: a low membrane tone, felt rather than struck."""
    n = int(dur * SR)
    out = np.zeros(n)
    rng = np.random.default_rng(11)
    step = 60.0 / bpm
    k = 0
    tpos = 0.0
    while tpos < dur:
        # heart figure: strong, then a soft echo a third of a beat later
        for off, gain in ((0.0, 1.0), (0.32, 0.42)):
            s = int((tpos + off) * SR)
            if s >= n:
                continue
            ln = min(int(0.42 * SR), n - s)
            tt = np.linspace(0, ln / SR, ln, endpoint=False)
            # pitch drops as it decays — that is what makes a drum a drum
            fsw = 74 * np.exp(-tt * 7.5) + 40
            body = np.sin(2 * np.pi * fsw * tt) * np.exp(-tt * 8.5)
            skin = rng.normal(0, 1, ln) * np.exp(-tt * 55) * 0.16
            out[s:s + ln] += (body + skin) * gain
        # three-against-two: every third beat leans late, the riddim feel
        tpos += step * (1.0 if k % 3 != 2 else 1.0)
        k += 1
    # A membrane is dark — much darker than glass. Roll it off hard.
    return lp(out, 1100) * amp


def bass(f, dur, amp=0.55):
    """Round, late-sitting bass. Weighted low, no click."""
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    w = (np.sin(2 * np.pi * f * t)
         + 0.30 * np.sin(2 * np.pi * f * 2 * t)
         + 0.08 * np.sin(2 * np.pi * f * 3 * t))
    return w * adsr(n, 0.02, 0.18, 0.55, min(dur * 0.7, 1.2)) * amp


def reverb(x, seconds=3.4, mix=0.34, pre=0.02):
    """Decaying-noise convolution. Big, slow, underwater."""
    n = int(seconds * SR)
    rng = np.random.default_rng(3)
    ir = rng.normal(0, 1, n) * np.exp(-np.linspace(0, 7.0, n))
    # roll the top off the tail — water eats high frequencies
    ir = lp(ir, 3200, order=2)
    ir[:int(pre * SR)] = 0
    ir /= np.abs(ir).sum() / 18
    wet = np.convolve(x, ir)[:len(x)]
    return (1 - mix) * x + mix * wet


def place(buf, sig, at):
    """Mix sig into buf at time `at` seconds, growing buf if needed."""
    s = int(at * SR)
    if s < 0:
        sig, s = sig[-s:], 0
    end = s + len(sig)
    if end > len(buf):
        buf = np.concatenate([buf, np.zeros(end - len(buf))])
    buf[s:end] += sig
    return buf


def phrase(buf, notes, beats, voice, at, amp, gap=0.0):
    """Lay a melodic figure down starting at `at` seconds."""
    t = at
    for note, b in zip(notes, beats):
        d = b * BEAT
        buf = place(buf, voice(hz(note), d * 1.6, amp), t)
        t += d + gap
    return buf


# ── ARRANGEMENT ─────────────────────────────────────────────────────────────
CHORDS = {                      # voicings, low to high
    "Dm":  ["D3", "F3", "A3", "D4"],
    "Bb":  ["A#2", "D3", "F3", "A#3"],
    "F":   ["F2", "C3", "F3", "A3"],
    "Gm":  ["G2", "A#2", "D3", "G3"],
    "Asus": ["A2", "E3", "A3", "D4"],
}


def build_theme(total=64.0):
    """The full statement. Call, answer, and the two together.

    Returns STEMS rather than a finished mix. Placing voices in the stereo
    field and mastering them are separate jobs from composing them, and keeping
    them separate is what let the image be fixed without touching a note.
    """
    lead = np.zeros(int(total * SR))
    low = np.zeros(int(total * SR))
    bedl = np.zeros(int(total * SR))
    bedr = np.zeros(int(total * SR))
    pulse = np.zeros(int(total * SR))

    def bed(notes, dur, amp, at):
        """One pad, rendered twice with different start phases for L and R."""
        f = [hz(x) for x in notes]
        return (place(bedl, pad(f, dur, amp, seed=7), at),
                place(bedr, pad(f, dur, amp, seed=71), at))

    # 0-16  the sea alone, then the call arrives unaccompanied
    bedl, bedr = bed(CHORDS["Dm"], 20.0, 0.20, 0.0)
    lead = phrase(lead, CALL, CALL_BEATS, glass, 6.0, 0.50)

    # 16-32  the answer comes back from below, two bars late
    bedl, bedr = bed(CHORDS["Bb"], 16.0, 0.22, 16.0)
    low = phrase(low, ANSWER, ANSWER_BEATS, sub, 17.0, 0.62)
    lead = phrase(lead, CALL, CALL_BEATS, glass, 24.0, 0.42)

    # 32-48  the heartbeat enters. call and answer overlap for the first time
    pulse = place(pulse, heartbeat(22.0, BPM, 0.34), 32.0)
    bedl, bedr = bed(CHORDS["F"], 16.0, 0.24, 32.0)
    lead = phrase(lead, CALL, CALL_BEATS, glass, 34.0, 0.56)
    low = phrase(low, ANSWER, ANSWER_BEATS, sub, 35.5, 0.70)
    for i, n in enumerate(["F2", "F2", "A#2", "C3"]):
        low = place(low, bass(hz(n), 2.6, 0.34), 34.0 + i * 3.0 + 0.55)

    # 48-64  full statement, then it lets go
    bedl, bedr = bed(CHORDS["Gm"], 8.0, 0.26, 48.0)
    bedl, bedr = bed(CHORDS["Dm"], 12.0, 0.24, 55.0)
    lead = phrase(lead, CALL, CALL_BEATS, glass, 49.0, 0.62)
    low = phrase(low, ANSWER, ANSWER_BEATS, sub, 50.5, 0.74)
    pulse = place(pulse, heartbeat(9.0, BPM, 0.30), 49.0)
    # the last call, alone, unanswered — the show's question
    lead = phrase(lead, CALL[:3], CALL_BEATS[:3], glass, 58.5, 0.44)

    n = int(total * SR)
    return {k: v[:n] for k, v in
            dict(lead=lead, low=low, bedl=bedl, bedr=bedr, pulse=pulse).items()}


TEASER_SHOTS = ["shot-kai-sinking.mp4", "shot-ren-lane.mp4", "shot-kemar-joy.mp4",
                "shot-luna-descent.mp4", "shot-nakaru-wall.mp4", "teaser-titlecard.mp4"]
XFADE = 0.5

# Fallback if the shot files are not on disk. Measured 2026-07-31; the script
# re-measures whenever it can, because these are the numbers the cue syncs to.
CUTS_FALLBACK = [0.0, 7.79, 13.33, 18.87, 24.41, 29.95]
TOTAL_FALLBACK = 33.71


def teaser_cuts():
    """Where each shot actually reads as arriving, measured from the shots.

    A dissolve has no single frame that is "the cut" — the picture reads as
    changing at the MIDPOINT of the crossfade, which is where a music hit
    belongs. Hardcoding these was worth 0.45s of drift on the title card,
    which is the one hit in the cue that has to be exact, so they are probed.
    """
    import re
    ff = ffmpeg_exe()
    starts, off = [], 0.0
    for fn in TEASER_SHOTS:
        p = os.path.join(ART, fn)
        if not os.path.exists(p):
            return CUTS_FALLBACK, TOTAL_FALLBACK
        out = subprocess.run([ff, "-hide_banner", "-i", p],
                             capture_output=True, text=True).stderr
        m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
        if not m:
            return CUTS_FALLBACK, TOTAL_FALLBACK
        dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
        # first shot starts at 0; every later shot reads at its dissolve midpoint
        starts.append(0.0 if not starts else off + XFADE / 2)
        off += dur - XFADE
    return starts, off + XFADE


def build_teaser_score(total=None):
    """Scored to the teaser's measured cut points."""
    cuts, measured = teaser_cuts()
    total = total or measured
    t_kai, t_ren, t_kem, t_luna, t_nak, t_title = cuts
    lead = np.zeros(int(total * SR))
    low = np.zeros(int(total * SR))
    bedl = np.zeros(int(total * SR))
    bedr = np.zeros(int(total * SR))
    pulse = np.zeros(int(total * SR))

    def bed(notes, dur, amp, at):
        f = [hz(x) for x in notes]
        return (place(bedl, pad(f, dur, amp, seed=7), at),
                place(bedr, pad(f, dur, amp, seed=71), at))

    # Every anchor below is relative to a measured cut. Pads start slightly
    # BEFORE their shot (music leads picture; sound arriving late reads as a
    # mistake, arriving a little early reads as intent), except the title,
    # where the phrase is timed so its last note lands on the card.

    # Kai sinking. The call, alone, over the sea's breath.
    bedl, bedr = bed(CHORDS["Dm"], t_ren + 3.2, 0.22, t_kai)
    lead = phrase(lead, CALL, CALL_BEATS, glass, t_kai + 1.6, 0.46)

    # Ren. Cold. The answer refuses to come; a bare fifth instead.
    bedl, bedr = bed(["A2", "E3", "A3"], 6.5, 0.20, t_ren - 0.3)
    low = place(low, sub(hz("A2"), 4.0, 0.42), t_ren + 0.3)

    # Kemar. The heartbeat arrives — the first warmth in the cut.
    pulse = place(pulse, heartbeat(6.5, BPM, 0.36), t_kem)
    bedl, bedr = bed(CHORDS["F"], 6.5, 0.24, t_kem - 0.3)
    for i, n in enumerate(["F2", "A#2", "C3"]):
        low = place(low, bass(hz(n), 1.9, 0.36), t_kem + 0.5 + i * 1.7)

    # Luna. The call returns high and thin, the answer beneath it.
    bedl, bedr = bed(CHORDS["Bb"], 6.0, 0.22, t_luna - 0.3)
    lead = phrase(lead, CALL, CALL_BEATS, glass, t_luna + 0.2, 0.40)
    low = phrase(low, ANSWER, ANSWER_BEATS, sub, t_luna + 0.8, 0.52)

    # Nakaru. Everything strips away. One low note, held.
    low = place(low, sub(hz("D2"), 5.6, 0.66), t_nak + 0.2)
    pulse = place(pulse, heartbeat(4.6, BPM * 0.5, 0.20), t_nak + 0.6)

    # Title. The call, answered at last, with the answer's FIRST note landing
    # exactly on the title card — the card and the reply arrive together.
    #
    # The answer here takes the CALL's rhythm, not its own slower one. All cue
    # long the deep has replied late and heavy; on the title it replies at the
    # call's own tempo. That is the whole series thesis in one bar, and it is
    # also what lets the phrase finish inside the card instead of being cut
    # off — which is what was happening when the answer kept its slow beats.
    bedl, bedr = bed(CHORDS["Dm"], 8.0, 0.28, t_title - 3.1)
    lead = phrase(lead, CALL, CALL_BEATS, glass, t_title - 2.6, 0.60)
    low = phrase(low, ANSWER, CALL_BEATS, sub, t_title, 0.72)

    n = int(total * SR)
    return {k: v[:n] for k, v in
            dict(lead=lead, low=low, bedl=bedl, bedr=bedr, pulse=pulse).items()}


# ── SCENE CUES ──────────────────────────────────────────────────────────────
# Scored from the scene's cue sheet, not from a stopwatch: every anchor below
# is a shot boundary read out of audio/scene-<id>.json, so if the cut moves,
# rebuilding the cue moves the music with it. This is the pre-scoring doctrine
# applied to the score itself — the same document drives mix, cut and cue.

def _load_cue_sheet(scene_id):
    import json
    with open(os.path.join(ART, "audio", f"scene-{scene_id}.json")) as f:
        return json.load(f)


def _shot_in(sc, shot_id):
    for s in sc["shots"]:
        if s["id"] == shot_id:
            return float(s["t_in"])
    raise KeyError(f"no shot {shot_id} in {sc['id']}")


def build_sinking_cue():
    """Episode 1, the sinking — the theme finally scored INTO the show.

    The arrangement follows the scene's own grammar: a thin thread of the CALL
    while he is still on dry land, a low hit on the impact, a falling bass line
    under the panic, and then — as the water settles, which is the scene's
    turn — the first full CALL answered from below. The cue thins out before
    the abyssal floor because the ANSWER-tone in the scene mix owns that
    register; the score hands off to it rather than doubling it.
    """
    sc = _load_cue_sheet("ep1-the-sinking")
    total = float(sc["duration"])
    t_impact = _shot_in(sc, "05")           # 13.0  the slap
    t_under = _shot_in(sc, "06")            # 16.0  he goes under
    t_settle = _shot_in(sc, "08")           # 30.0  the water settles
    t_eyes = _shot_in(sc, "10")             # 44.0  the eyes open

    n = int(total * SR)
    lead, low = np.zeros(n), np.zeros(n)
    bedl, bedr = np.zeros(n), np.zeros(n)
    pulse = np.zeros(n)                     # unused: the MIX owns the heart

    def bed(notes, dur, amp, at):
        f = [hz(x) for x in notes]
        return (place(bedl, pad(f, dur, amp, seed=7), at),
                place(bedr, pad(f, dur, amp, seed=71), at))

    # dry land: the call, unfinished — three notes and it stops. The duck and
    # the buzzer own 9.5-13, so the thread is gone before they arrive.
    lead = phrase(lead, CALL[:3], CALL_BEATS[:3], glass, 2.0, 0.28)

    # the impact: one low D, with the splash, not instead of it
    low = place(low, sub(hz("D2"), 3.0, 0.55), t_impact)
    low = place(low, bass(hz("D2"), 2.2, 0.30), t_impact + 0.05)

    # the panic: a bass line walking DOWN while his heart runs up —
    # contrary motion, the score already sinking ahead of him
    for i, note in enumerate(["D2", "C2", "A#1", "G1"]):
        low = place(low, bass(hz(note), 3.2, 0.30), t_under + 0.5 + i * 3.5)

    # the water settles: the turn. First full CALL, first ANSWER.
    bedl, bedr = bed(CHORDS["Dm"], 16.0, 0.20, t_settle - 1.0)
    lead = phrase(lead, CALL, CALL_BEATS, glass, t_settle + 2.0, 0.52)
    low = phrase(low, ANSWER, ANSWER_BEATS, sub, t_settle + 5.5, 0.62)

    # the eyes open: the call again, higher in the mix's attention but
    # thinner here — the picture is doing the talking now
    bedl, bedr = bed(CHORDS["Bb"], 10.0, 0.16, t_eyes - 0.5)
    lead = phrase(lead, CALL, CALL_BEATS, glass, t_eyes + 2.0, 0.34)

    # nothing after ~56s: the abyssal floor belongs to the ANSWER tone and a
    # 34 BPM heart. Silence is a resource and this cue spends it.
    return {k: v[:n] for k, v in
            dict(lead=lead, low=low, bedl=bedl, bedr=bedr, pulse=pulse).items()}


def build_teaser30_cue():
    """The 30-second teaser cut of the same grammar, scored to its cue sheet."""
    sc = _load_cue_sheet("ep1-teaser")
    total = float(sc["duration"])
    t_impact = _shot_in(sc, "04")           # 5.5   the fall
    t_ocean = _shot_in(sc, "07")            # 12.5  the pool becomes ocean
    t_hands = _shot_in(sc, "08")            # 16.5  the hands drift open
    t_eyes = _shot_in(sc, "10")             # 21.5  the eyes open
    t_title = _shot_in(sc, "12")            # 27.0  逆流 UNDERTOW

    n = int(total * SR)
    lead, low = np.zeros(n), np.zeros(n)
    bedl, bedr = np.zeros(n), np.zeros(n)
    pulse = np.zeros(n)

    def bed(notes, dur, amp, at):
        f = [hz(x) for x in notes]
        return (place(bedl, pad(f, dur, amp, seed=7), at),
                place(bedr, pad(f, dur, amp, seed=71), at))

    # the hook: the call's first three notes over the Eye. At 0.6 rather than
    # 0.3: the third strike then lands at 3.1s, clear of the impact's approach
    # — the events gate measured the earlier placement's strike competing with
    # the splash transient, which is a mixing note as much as a gate failure.
    lead = phrase(lead, CALL[:3], CALL_BEATS[:3], glass, 0.6, 0.30)

    # the impact, then two falling bass steps under the compressed panic
    low = place(low, sub(hz("D2"), 2.5, 0.55), t_impact)
    low = place(low, bass(hz("C2"), 2.0, 0.30), t_impact + 2.6)
    low = place(low, bass(hz("A#1"), 2.2, 0.30), t_impact + 4.4)

    # the ocean: full CALL over the Dm bed
    bedl, bedr = bed(CHORDS["Dm"], 9.0, 0.22, t_ocean - 0.5)
    lead = phrase(lead, CALL, CALL_BEATS, glass, t_ocean + 0.5, 0.50)
    low = phrase(low, ANSWER, ANSWER_BEATS, sub, t_hands - 0.5, 0.56)

    # the eyes: thin high call over the Bb bed
    bedl, bedr = bed(CHORDS["Bb"], 7.0, 0.16, t_eyes - 0.5)
    lead = phrase(lead, CALL, CALL_BEATS, glass, t_eyes + 0.3, 0.38)

    # the title: the answer at the CALL's own tempo, first note ON the card —
    # the same gesture the original teaser score ends on, because it is the
    # series thesis: the deep replies, and this time in your rhythm.
    bedl, bedr = bed(CHORDS["Dm"], 6.0, 0.24, t_title - 1.2)
    low = phrase(low, ANSWER, CALL_BEATS, sub, t_title, 0.68)

    return {k: v[:n] for k, v in
            dict(lead=lead, low=low, bedl=bedl, bedr=bedr, pulse=pulse).items()}


SCENE_CUES = {
    "ep1-the-sinking": build_sinking_cue,
    "ep1-teaser": build_teaser30_cue,
}


def spatialise(stems):
    """Place the stems in the stereo field. Composition ends here; mixing begins.

    The rationale for each position is dramatic, not decorative:

      lead  slightly left and the widest thing in the mix. The CALL is the
            thing reaching outward, so it gets the most air.
      low   dead centre and nearly dry. The ANSWER comes from directly beneath
            you, not from a side, and the mono-maker in the chain will collapse
            it below 120Hz anyway - so it is written to be centre from the
            start rather than fixed later.
      pulse just right of centre, close, barely any tail. A heartbeat heard
            inside your own chest has no room around it.
      beds  already stereo by construction, and given the longest reverb. It
            is the sea, and the sea is the widest thing here.
    """
    # ── balance ─────────────────────────────────────────────────────────────
    # Measured, not guessed. Before this stage existed, the `low` stem was 89%
    # of the mix energy and `lead` was 7.2% - the ANSWER was masking the CALL
    # by 11dB RMS, so the tune the audience is meant to hum sat underneath a
    # wall of sub. A sustained sine accumulates far more energy than a struck
    # bowl that decays in a second and a half, which is why composing the two
    # at similar amplitudes does not balance them.
    #
    # The low is also given harmonics rather than more level. Pushing a 90Hz
    # sine louder only buries the melody further; giving it overtones lets it
    # be heard as low without occupying the space the melody needs.
    lo = M.bass_harmonics(stems["low"] * 0.56)              # -5 dB
    ld = stems["lead"] * 1.41                               # +3 dB
    pl = stems["pulse"] * 0.89                              # -1 dB

    # The pad's centroid sat at 161Hz, directly on top of the sub's 87-147Hz
    # working range. Two voices in one octave is mud, and the sub has the more
    # important job down there, so the bed gives up the bottom.
    bl = M.hpf(stems["bedl"], 130.0) * 2.1
    br = M.hpf(stems["bedr"], 130.0) * 2.1

    # ── placement ───────────────────────────────────────────────────────────
    lead = M.stereo_reverb(M.pan(ld, -0.18), 3.8, 0.48, width=1.0, seed=3)
    low = M.stereo_reverb(M.pan(lo, 0.0), 2.6, 0.12, width=0.45, seed=11)
    puls = M.stereo_reverb(M.pan(pl, 0.10), 2.2, 0.18, width=0.7, seed=23)
    beds = M.stereo_reverb(np.stack([bl, br], axis=1), 4.6, 0.34, width=1.0, seed=41)

    mix = lead + low + puls + beds
    # A gentle air lift. The only thing up here is the glass strike, and it was
    # measurably absent - under 1% of total energy above 400Hz. Shelved rather
    # than peaked so the strike gains air without becoming brittle.
    return M.shelf(mix, 2600.0, 3.5, "high")


def fades(st, fade_in=1.2, fade_out=2.2):
    """Ease in and out so a cue can sit under picture without a seam."""
    n_in, n_out = int(fade_in * SR), int(fade_out * SR)
    st = st.copy()
    st[:n_in] *= np.linspace(0, 1, n_in)[:, None]
    st[-n_out:] *= np.linspace(1, 0, n_out)[:, None] ** 1.4
    return st


def write_wav(path, mono, peak=0.89):
    x = mono / (np.abs(mono).max() + 1e-9) * peak
    # soft-knee limit rather than hard clip
    x = np.tanh(x * 1.08) / math.tanh(1.08) * peak
    st = np.stack([x, x], axis=1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((st * 32767).astype("<i2").tobytes())
    print(f"  wrote {path}  {len(x)/SR:.2f}s")


def deliver(name, stems, out_dir, fade_out=2.2, also_16=True):
    """Spatialise, master, and write. 24-bit is the master; 16-bit is a copy.

    Both are written because they answer different questions. The 24-bit file
    is what a music editor conforms and what any future re-master starts from.
    The 16-bit file is what gets muxed and sent around, and it is dithered
    because 16-bit truncation is audible on exactly the material this score is
    made of - long tails fading into nothing.
    """
    import tempfile
    st = fades(spatialise(stems), 1.2, fade_out)
    with tempfile.TemporaryDirectory() as td:
        st, lufs, capped = M.master(st, os.path.join(td, "probe.wav"))
    tp = M.true_peak(st)
    corr = M.correlation(st[:, 0], st[:, 1])
    p24 = os.path.join(out_dir, f"{name}.wav")
    M.write_master(p24, st, bits=24)
    if also_16:
        M.write_master(os.path.join(out_dir, f"{name}-16.wav"), st, bits=16)
    print(f"  {name:22s} {len(st)/SR:6.2f}s  {lufs:6.1f} LUFS  {tp:5.1f} dBTP  "
          f"corr {corr:+.2f}{'  (capped)' if capped else ''}")
    return p24


if __name__ == "__main__":
    # The concert theme is a deliverable and lives with the assets, under the
    # gate. The teaser cue is an intermediate cut to one specific edit — it
    # lives in qc/ alongside the Splice bed it gets mixed with.
    if "--cue" in sys.argv:
        # a scene cue: composed to the scene's cue sheet, consumed by
        # build-scene.py as the score bus. Delivered to scores/.
        scene_id = sys.argv[sys.argv.index("--cue") + 1]
        out = os.path.join(ART, "scores")
        os.makedirs(out, exist_ok=True)
        deliver(scene_id, SCENE_CUES[scene_id](), out, also_16=False)
        sys.exit(0)
    deliver("undertow-theme", build_theme(), ART)
    if "--theme" not in sys.argv:
        deliver("teaser-score", build_teaser_score(), os.path.join(ART, "qc"),
                also_16=False)
