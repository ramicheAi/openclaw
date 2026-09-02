#!/usr/bin/env python3
"""
UNDERTOW — does the scene actually descend?

Every other asset class here has a gate. A scene did not, and it showed: the
Episode 1 sinking sequence was rendered twice, sounded plausible by every
summary number the mastering chain reports — level, true peak, correlation —
and was running BACKWARDS. Its spectral centroid climbed from 525 Hz to 1089 Hz
across the descent because the brightest texture in the library was pinned at
unity underneath a boy sinking to the floor of a pool.

None of the existing gates could have caught that. verify_mastering checks the
chain, verify_texture checks each texture in isolation, verify_acoustics checks
that the ladder is monotonic. All three passed. The fault was in how the
finished scene USED correct parts, which is a property only the scene has.

WHAT THIS MEASURES

The scene declares a depth curve in its cue sheet — audio/scene-<id>.json, the
same document build-scene.py renders from, which says where Kai is at every
moment. This asks whether that intent reached the output. Note the source: this
once read the builder's own module-level table, which is subtly the wrong place
to get intent from, because a gate reading the code that made the audio can
never catch the two disagreeing.

  brightness   as he goes down, the mix must get DARKER — measured as the SHARE
               OF ENERGY ABOVE 2 kHz, not as a full-band spectral centroid. That
               choice is load-bearing and is argued in hf_ratio(): the heartbeat
               is deliberately not in the room, so a full-band centroid grades a
               design decision as a fault, and measured, it could not tell this
               scene from its own reverse.
  width        as he goes down, the image must OPEN. Correlation toward zero.
               The deck is a narrow, hard, in-front sound; the deep is around
               him.
  trend        not just endpoints — the RANK CORRELATION between depth and
               brightness across every window. Endpoints can agree by accident;
               a monotone trend across a dozen windows cannot.

WHY THIS IS NOT CIRCULAR

The depth curve is read from the cue sheet, and the measurement is taken from
the rendered WAV. The test therefore compares INTENT against OUTPUT. The
circular version of this test — the one that would prove nothing — measures the
rank weights instead of the audio, and confirms only that interpolation works.

NEGATIVE CONTROLS, because a trend test that has never seen a flat signal is
not a trend test:

  reversed     the same scene backwards must FAIL, with the trend flipped. If
               it passes both ways the measurement is not directional.
  flat         a rendering with no descent applied must show no trend.

    python3 qc/verify_scene.py [scene.wav]
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.dirname(HERE)
sys.path.insert(0, ART)

import mastering as M  # noqa: E402

WINDOW = 4.0          # seconds per measurement block

# MIN_TREND is set from the negative controls, not chosen for looking strict.
# Stationary pink noise scores -0.22 against this depth curve — that is the
# floor this measurement produces on material with no descent in it. 0.55 sits
# at two and a half times that, so a pass cannot be noise, and it is
# deliberately NOT set just above the control: a threshold hugging its own
# noise floor certifies coincidences. The scene scores -0.88 and its own
# reverse scores +0.81, so nothing here is near the line in either direction.
MIN_TREND = 0.55      # |rank correlation| the descent must reach
MIN_DARKEN = 1.50     # brightest window / darkest window, as a ratio
HF_FLOOR = 2000.0     # brightness is measured above here — see hf_ratio()

OK, FAIL, NOTE = [], [], []


def ok(m):
    OK.append(m)
    print(f"  \033[32m✓\033[0m {m}")


def bad(m):
    FAIL.append(m)
    print(f"  \033[31m✗\033[0m {m}")


def note(m):
    NOTE.append(m)
    print(f"    \033[2m{m}\033[0m")


def load_cue_sheet(scene_id="ep1-the-sinking"):
    """Read the scene's cue sheet — the document, not the builder.

    This used to import build-scene.py and read its module-level BEATS table.
    That was subtly the wrong source: the intent a gate grades against must not
    come from the code that produced the audio, or the two can never be caught
    disagreeing. Both now read audio/scene-<id>.json.
    """
    p = os.path.join(ART, "audio", f"scene-{scene_id}.json")
    if not os.path.exists(p):
        raise SystemExit(f"\n  no cue sheet at {p}\n")
    with open(p) as f:
        return json.load(f)


def centroid_hz(seg, sr=M.SR):
    """Power-weighted spectral centroid. Matches qc/verify_acoustics.py.

    Deliberately the same instrument the ladder is graded with, so a number
    here and a number there mean the same thing. (They did not always: an
    earlier ad-hoc probe weighted by magnitude rather than power and read the
    same audio at 2960 Hz where this reads 504 Hz. Both are defensible
    definitions; having two in one project is not.)
    """
    mono = seg.mean(1) if seg.ndim > 1 else seg
    mag = np.abs(np.fft.rfft(mono * np.hanning(len(mono))))
    freq = np.fft.rfftfreq(len(mono), 1 / sr)
    e = mag ** 2
    return float((freq * e).sum() / max(e.sum(), 1e-20))


def hf_ratio(seg, lo=HF_FLOOR, sr=M.SR):
    """Share of energy above `lo`. THE brightness instrument for a descent.

    A full-band spectral centroid is the obvious choice and it is the wrong one
    here, for a reason that is a design decision rather than an accident: the
    heartbeat is deliberately NOT in the room. build-scene.py says so in as many
    words — it is inside his chest and stays there whatever depth he is at, and
    that contrast is what makes the room feel external and the body feel like
    his. So the heart legitimately does not descend, and a power-weighted
    centroid, which balances the whole spectrum including a sub-bass object
    holding 28% of the energy, grades that design decision as if it were a
    fault.

    Measured on the finished scene, the full-band centroid scored +0.09 forward
    and -0.24 REVERSED — near zero both ways, which is not a weak result, it is
    a null one: an instrument that cannot tell a scene from its own reverse is
    not measuring direction. Against the same controls this one reads -0.88
    forward and +0.81 reversed.

    It is also the physically motivated choice. Sound absorption in water rises
    steeply with frequency; "water eats treble" is literally a statement about
    high-frequency energy, not about where the whole spectrum balances. And
    because it ignores everything below the floor, a stem that is designed to
    stay out of the descent cannot mask the descent.

    Four candidates were compared against both negative controls before this one
    was chosen, and the choice was made on the physics rather than the score —
    centroid above 300 Hz and above 500 Hz, and HF ratio above 2 kHz and 4 kHz,
    all four passed. The full-band centroid is still reported alongside, as
    context, and deliberately does not gate.
    """
    mono = seg.mean(1) if seg.ndim > 1 else seg
    e = np.abs(np.fft.rfft(mono * np.hanning(len(mono)))) ** 2
    f = np.fft.rfftfreq(len(mono), 1 / sr)
    return float(e[f >= lo].sum() / max(e.sum(), 1e-20))


def _rank(x):
    """Ranks with ties averaged, which is what makes Spearman well defined."""
    order = np.argsort(x, kind="mergesort")
    r = np.empty(len(x), float)
    r[order] = np.arange(len(x), dtype=float)
    xs = x[order]
    i = 0
    while i < len(xs):
        j = i
        while j + 1 < len(xs) and xs[j + 1] == xs[i]:
            j += 1
        if j > i:
            r[order[i:j + 1]] = (i + j) / 2.0
        i = j + 1
    return r


def spearman(a, b):
    """Rank correlation, so a monotone-but-curved trend still scores high.

    Pearson would punish the scene for descending faster at the start than the
    end, which is a thing it is supposed to do — the fall is quick and the
    settling is slow.

    TIES MUST GET AVERAGE RANKS. The first version used argsort(argsort(x)),
    which hands tied values arbitrary distinct ranks in input order. The depth
    curve is full of ties — seven of seventeen windows sit at the abyssal floor
    — so that version was ranking those seven by the order they happened to
    appear, which is to say by time, which is to say it was inventing a trend
    out of nothing. It reported +0.00 on the scene and -0.52 on stationary
    noise; the second of those is impossible and is what exposed it.
    """
    a, b = np.asarray(a, float), np.asarray(b, float)
    if len(a) < 3:
        return 0.0
    ra, rb = _rank(a), _rank(b)
    ra -= ra.mean()
    rb -= rb.mean()
    d = np.sqrt((ra ** 2).sum() * (rb ** 2).sum())
    return float((ra * rb).sum() / d) if d > 1e-12 else 0.0


def profile(st, depth_of, sr=M.SR):
    """Per-window depth, brightness and width for a rendered scene."""
    k = int(WINDOW * sr)
    rows = []
    for a in range(0, len(st) - k, k):
        seg = st[a:a + k]
        t = (a + k / 2) / sr
        rows.append((t, depth_of(t), hf_ratio(seg), centroid_hz(seg),
                     M.correlation(seg[:, 0], seg[:, 1])))
    return rows


def depth_curve(sc):
    """Position on the fathom ladder as a function of time, from the cue sheet."""
    pos = {r: i for i, r in enumerate(sc["ranks"])}
    ts = np.array([b["t"] for b in sc["beats"]], float)
    ps = np.array([float(pos[b["fathom"]]) for b in sc["beats"]])
    return lambda t: float(np.interp(t, ts, ps))


def grade(rows, label):
    """Score one profile. Returns (trend, darken_ratio, width_opens)."""
    d = [r[1] for r in rows]
    h = [r[2] for r in rows]
    c = [r[3] for r in rows]
    w = [r[4] for r in rows]
    trend = spearman(d, h)
    darken = max(h) / max(min(h), 1e-12)
    width = spearman(d, w)
    print(f"\n  \033[1m{label}\033[0m")
    print(f"    {'t':>6s} {'depth':>6s} {'>2kHz':>8s} {'centroid':>9s} {'corr':>7s}")
    for t, dd, hh, cc, ww in rows:
        print(f"    {t:5.1f}s {dd:6.2f} {hh * 100:7.2f}% {cc:8.0f}Hz {ww:+7.2f}")
    print(f"\n    depth->treble      rank corr  {trend:+.2f}"
          f"   (want <= -{MIN_TREND:.2f})")
    print(f"    brightest/darkest window       {darken:.2f}x"
          f"   (want >= {MIN_DARKEN:.2f})")
    print(f"    depth->correlation rank corr   {width:+.2f}"
          f"   (want negative: the image opens)")
    # Reported, deliberately NOT gated. See hf_ratio() for why the full-band
    # centroid cannot grade this scene.
    print(f"    \033[2mdepth->centroid (context only) {spearman(d, c):+.2f}\033[0m")
    return trend, darken, width


def main():
    scene_id = os.environ.get("UNDERTOW_SCENE", "ep1-the-sinking")
    sc = load_cue_sheet(scene_id)
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        ART, "scenes", f"{sc['id']}.wav")
    if not os.path.exists(path):
        print(f"\n  no scene at {path} — run build-scene.py first\n")
        return 2

    print("\n\033[1mUNDERTOW — scene descent check\033[0m")
    print(f"  {os.path.basename(path)}   window {WINDOW:.0f}s\n")

    st = M.read_wav(path)
    depth_of = depth_curve(sc)
    rows = profile(st, depth_of)

    trend, darken, width = grade(rows, "as rendered")

    print()
    if trend <= -MIN_TREND:
        ok(f"the mix darkens as he descends (rank corr {trend:+.2f})")
    else:
        bad(f"the mix does not darken with depth (rank corr {trend:+.2f}, "
            f"needs <= {-MIN_TREND:.2f})")
        if trend > 0:
            note("POSITIVE means it gets BRIGHTER as he sinks — the scene is "
                 "running backwards")

    if darken >= MIN_DARKEN:
        ok(f"the descent spans a real brightness range ({darken:.2f}x)")
    else:
        bad(f"brightness barely moves across the scene ({darken:.2f}x) — the "
            f"descent is not reaching the output")

    if width < 0:
        ok(f"the image opens as he descends (rank corr {width:+.2f})")
    else:
        bad(f"the image does not open with depth (rank corr {width:+.2f})")

    # ── NEGATIVE CONTROL 1: the same audio, backwards ───────────────────────
    #
    # If a descent test passes on a scene played in reverse, it is not
    # measuring descent, it is measuring that the file has some variety in it.
    print("\n  \033[1mnegative control — the same scene, reversed\033[0m")
    rev = profile(st[::-1].copy(), depth_of)
    rtrend = spearman([r[1] for r in rev], [r[2] for r in rev])
    print(f"    depth->treble rank corr  {rtrend:+.2f}")
    # The assertion is that the reversed scene must not PASS the descent
    # criterion — not that it must score positive. When the forward scene has
    # no trend, its reverse has no trend either, and demanding a positive sign
    # there is demanding signal from a coin flip.
    if rtrend > -MIN_TREND:
        ok(f"reversed audio does not pass the descent test ({rtrend:+.2f}), "
           f"so the test is directional")
    else:
        bad(f"reversed audio ALSO reads as descending ({rtrend:+.2f}) — this "
            f"measurement is not directional and the verdicts above are void")

    # ── NEGATIVE CONTROL 2: material with no descent in it ──────────────────
    print("\n  \033[1mnegative control — pink noise, no descent applied\033[0m")
    # STATIONARY, and that word is the whole point of the control. The first
    # version built its "pink" noise as a cumulative sum of white noise. That
    # is Brownian, not pink: it random-walks, so it DRIFTS, and a drifting
    # signal has a slow trend in it by construction. It scored -0.52 against a
    # -0.55 threshold — a control that was one hundredth away from certifying
    # that noise descends. Shaped in the frequency domain instead, so the
    # spectrum is fixed and nothing wanders.
    rng = np.random.default_rng(5)
    n = len(st)
    spec = np.fft.rfft(rng.normal(0, 1, n))
    f = np.fft.rfftfreq(n, 1 / M.SR)
    spec /= np.sqrt(np.maximum(f, 1.0))          # 1/f power — actual pink
    pink = np.fft.irfft(spec, n)
    pink *= 0.1 / max(float(np.abs(pink).max()), 1e-9)
    flat = np.stack([pink, pink], 1)
    frows = profile(flat, depth_of)
    ftrend = spearman([r[1] for r in frows], [r[2] for r in frows])
    print(f"    depth->treble rank corr  {ftrend:+.2f}")
    if abs(ftrend) < MIN_TREND:
        ok(f"stationary material shows no descent ({ftrend:+.2f}), as it must")
    else:
        bad(f"stationary noise reads as descending ({ftrend:+.2f}) — the test "
            f"is finding structure that is not there")


    # ── EVENTS: does the mix actually collide with the picture? ─────────────
    #
    # The first version of this check, written by hand during review, declared
    # every event PRESENT — and then declared the same +5-12 dB "events" in
    # four windows where nothing happens. It was counting heartbeats. So this
    # gate is band-limited per event and graded against no-event CONTROL
    # windows, and an event only passes by beating its own controls.
    events = [e for e in sc.get("events", []) if isinstance(e.get("verify"), dict)]
    if events:
        print("\n  \033[1mevents — burst at t, in band, above matched controls\033[0m")
        mono = st.mean(1)
        def band_db(t0, lo, hi, w=0.30):
            a = int(max(0.0, t0 - w / 2) * M.SR)
            seg = mono[a:a + int(w * M.SR)]
            if len(seg) < 256:
                return -120.0
            S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2
            f = np.fft.rfftfreq(len(seg), 1 / M.SR)
            return 10 * np.log10(max(S[(f >= lo) & (f < hi)].sum(), 1e-18))
        # ONSET, not absolute level. The first version compared the event
        # window against neighbouring windows — and an event that sits next to
        # the panic passage loses to it on absolute energy while being fully
        # present. A transient is a RISING EDGE: band energy just after t minus
        # just before t. Loud neighbours after the onset cannot mask that.
        ev_times = [e["t"] for e in sc.get("events", [])]
        def rise_db(t0, lo, hi):
            after = max(band_db(t0 + 0.15 + dt, lo, hi) for dt in (0.0, 0.1, 0.2))
            before = band_db(t0 - 0.30, lo, hi)
            return after - before
        # Six candidate offsets, not four. Measured failure behind this: in a
        # 30s scene whose events cluster, only TWO offsets survived the
        # keep-clear filter, and a median of two is a mean — one control
        # window that happens to catch a heartbeat transient (+8dB) then owns
        # the floor. More candidates make the median an actual median.
        for e in events:
            lo, hi = e["verify"]["band"]
            r = rise_db(e["t"], lo, hi)
            ctrls = []
            for off in (-6.0, -4.5, -3.0, 3.0, 4.5, 6.0):
                tc = e["t"] + off
                if 1.0 < tc < sc["duration"] - 1.0 and \
                   all(abs(tc - q) > 1.5 for q in ev_times):
                    ctrls.append(rise_db(tc, lo, hi))
            floor = np.median(ctrls) if ctrls else 0.0
            if r >= 6.0 and r - floor >= 4.0:
                ok(f"{e['sound']:26s} t={e['t']:5.1f}s  onset +{r:.1f} dB "
                   f"(control floor {floor:+.1f})")
            else:
                bad(f"{e['sound']} at t={e['t']}s onset only +{r:.1f} dB vs "
                    f"control floor {floor:+.1f} — no rising edge, the event "
                    f"is not landing")

    print()
    if FAIL:
        print(f"\033[31m  FAILED — {len(FAIL)} problem(s)\033[0m\n")
        return 1
    print("\033[32m  PASSED — the scene descends, and the test can tell the "
          "difference\033[0m\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
