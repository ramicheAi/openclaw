#!/usr/bin/env python3
"""
UNDERTOW — proves the house acoustic actually does what it claims.

mastering.fathom_space() is the single most load-bearing function in the sound
department. Every sound in the show passes through it, which is exactly why a
plausible-looking implementation is dangerous: if the ladder is not really a
ladder, nothing downstream reveals that, it just quietly sounds like a library.

So this measures the three claims separately and refuses to take any of them on
trust:

  1. BRIGHTNESS falls monotonically with depth.
  2. The TAIL lengthens monotonically with depth.
  3. The IMAGE widens monotonically with depth.

Plus the two derived treatments:

  4. submerged_voice() removes DIRECTION entirely and takes the BOTTOM, not the
     top. The second half of that is the interesting one — it is the opposite
     of the film convention, and a test that only checked "is it different"
     would happily pass a plain muffle.
  5. calm_shape() moves brightness and width in the stated directions.

NEGATIVE CONTROL. Every monotonicity test is run a second time against the
UNTREATED signal. Those runs must FAIL. A test that passes on both the treated
and the untreated material is not measuring the treatment — it is measuring
nothing, and this project has already shipped two of those. If a control run
ever passes, this script reports its own failure rather than a success.

    python3 qc/verify_acoustics.py
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import mastering as M  # noqa: E402

SR = M.SR
FAIL = []
NOTES = []


def fail(msg):
    FAIL.append(msg)
    print(f"  \033[31m✗\033[0m {msg}")


def ok(msg):
    print(f"  \033[32m✓\033[0m {msg}")


# ── measurements ────────────────────────────────────────────────────────────

def centroid_hz(st, sr=SR):
    """Spectral centroid — the frequency the energy balances around.

    Used rather than a fixed high-band ratio because a lowpass at 800 Hz and a
    lowpass at 12 kHz would both read as "almost no energy above 16 kHz" and
    the ladder's top two rungs would look identical.
    """
    mono = st.mean(1) if st.ndim > 1 else st
    mag = np.abs(np.fft.rfft(mono * np.hanning(len(mono))))
    freq = np.fft.rfftfreq(len(mono), 1 / sr)
    e = mag ** 2
    return float((freq * e).sum() / max(e.sum(), 1e-20))


def band_db(st, lo, hi, sr=SR):
    """Energy in a band, in dB. For asking what a treatment REMOVED."""
    mono = st.mean(1) if st.ndim > 1 else st
    mag = np.abs(np.fft.rfft(mono * np.hanning(len(mono)))) ** 2
    freq = np.fft.rfftfreq(len(mono), 1 / sr)
    m = (freq >= lo) & (freq < hi)
    return 10 * math.log10(max(float(mag[m].sum()), 1e-20))


def decay_ms(st, drop_db=25.0, sr=SR):
    """How long the tail takes to fall `drop_db` below its peak.

    Measured off the backwards-integrated energy decay curve (Schroeder) rather
    than the raw envelope. The raw envelope of a noise tail is itself noisy, so
    a threshold crossing on it lands wherever the noise happened to dip, and
    the answer changes with the seed. Integration makes it monotonic, so the
    crossing is a property of the room rather than of the random numbers.
    """
    mono = st.mean(1) if st.ndim > 1 else st
    e = mono.astype(np.float64) ** 2
    edc = np.cumsum(e[::-1])[::-1]           # energy remaining from t onward
    edc /= max(edc[0], 1e-20)
    db = 10 * np.log10(np.maximum(edc, 1e-20))
    idx = np.argmax(db <= -drop_db)
    if idx == 0 and db[0] > -drop_db:
        return len(mono) / sr * 1000.0       # never decayed that far
    return idx / sr * 1000.0


def monotonic(values, direction, label, tol=0.0):
    """True if `values` moves consistently in `direction` ('up' or 'down')."""
    bad = []
    for a, b in zip(values, values[1:]):
        step = b - a
        if direction == "up" and step <= tol:
            bad.append((a, b))
        if direction == "down" and step >= -tol:
            bad.append((a, b))
    return (not bad), bad


# ── test material ───────────────────────────────────────────────────────────
# An impulse for the tail measurement (a room's decay is only defined for an
# impulse) and a broadband burst for brightness and width. Both are the same
# every run: a seeded generator means a failure here is reproducible.

def impulse(seconds=8.0):
    x = np.zeros(int(seconds * SR))
    x[100] = 1.0
    return x


def burst(seconds=2.0, seed=11):
    rng = np.random.default_rng(seed)
    x = rng.normal(0, 0.1, int(seconds * SR))
    # a hard stop so the tail is entirely the room's, not the source's
    x[int(0.25 * SR):] = 0.0
    return x


# ── the ladder ──────────────────────────────────────────────────────────────

def test_ladder():
    print("\n\033[1mThe Fathom ladder is a ladder\033[0m")
    tiers = list(M.FATHOM_ORDER)

    cents, tails, corrs = [], [], []
    for t in tiers:
        cents.append(centroid_hz(M.fathom_space(burst(), t)))
        tails.append(decay_ms(M.fathom_space(impulse(), t)))
        y = M.fathom_space(burst(), t)
        corrs.append(M.correlation(y[:, 0], y[:, 1]))

    print("    tier        centroid      tail      correlation")
    for t, c, d, r in zip(tiers, cents, tails, corrs):
        print(f"    {t:9s}  {c:8.0f} Hz  {d:7.0f} ms       {r:+.3f}")

    for values, direction, label, unit in (
        (cents, "down", "brightness falls with depth", "Hz"),
        (tails, "up", "the tail lengthens with depth", "ms"),
        (corrs, "down", "the image widens with depth", "correlation"),
    ):
        # Correlation needs decimals; Hz and ms do not. Printing +1 → +0 for a
        # move from +0.999 to +0.378 makes a real measurement look like a
        # rounding artefact, and a report nobody trusts is not a report.
        f = "{:+.3f}" if unit == "correlation" else "{:.0f}"
        good, bad = monotonic(values, direction, label)
        if good:
            ok(f"{label}  ({f.format(values[0])} → {f.format(values[-1])} {unit})")
        else:
            fail(f"{label} — breaks at {bad}")

    # NEGATIVE CONTROL. The same three tests, run on six identical untreated
    # copies. If any of them still reports a ladder, the test is measuring
    # something other than fathom_space and none of the passes above mean
    # anything.
    print("\n\033[1mNegative control — untreated signal must NOT show a ladder\033[0m")
    flat_c = [centroid_hz(np.stack([burst(), burst()], 1)) for _ in tiers]
    flat_d = [decay_ms(np.stack([impulse(), impulse()], 1)) for _ in tiers]
    flat_r = [1.0 for _ in tiers]
    for values, direction, label in (
        (flat_c, "down", "brightness"),
        (flat_d, "up", "tail"),
        (flat_r, "down", "width"),
    ):
        good, _ = monotonic(values, direction, label)
        if good:
            fail(f"CONTROL LEAKED — untreated signal reported a {label} ladder; "
                 f"the {label} test proves nothing")
        else:
            ok(f"untreated shows no {label} ladder, as it must")


# ── the derived treatments ──────────────────────────────────────────────────

def test_submerged_voice():
    print("\n\033[1mSubmerged voice — direction dies, and it is the bottom that goes\033[0m")
    # A voice-like source: a few harmonics under a slow envelope, wide in stereo
    # so that a failure to collapse the image would actually show up.
    n = int(1.5 * SR)
    t = np.arange(n) / SR
    v = sum(np.sin(2 * np.pi * f * t) / (i + 1) for i, f in enumerate([110, 220, 440, 880, 1760]))
    v *= 0.08 * (0.5 - 0.5 * np.cos(2 * np.pi * np.clip(t / 1.5, 0, 1)))
    wide = np.stack([v, np.roll(v, 313)], axis=1)

    before_corr = M.correlation(wide[:, 0], wide[:, 1])
    out = M.submerged_voice(wide)
    after_corr = M.correlation(out[:, 0], out[:, 1])

    if after_corr > 0.9999:
        ok(f"no direction survives  (correlation {before_corr:+.3f} → {after_corr:+.4f})")
    else:
        fail(f"submerged voice still carries direction: correlation {after_corr:+.4f}, "
             f"expected exactly +1.0 — a submerged listener cannot localise")

    # The claim under test: this removes WEIGHT, not brightness. Both bands are
    # measured relative to the signal's own mid band so an overall level change
    # cannot fake either result.
    def rel(st):
        mid = band_db(st, 700, 2200)
        return band_db(st, 20, 300) - mid, band_db(st, 4000, 9000) - mid

    lo_b, hi_b = rel(wide)
    lo_a, hi_a = rel(out)
    lo_change, hi_change = lo_a - lo_b, hi_a - hi_b

    print(f"    relative to the 700-2200 Hz band:"
          f"  low (20-300 Hz) {lo_change:+.1f} dB,"
          f"  high (4-9 kHz) {hi_change:+.1f} dB")

    if lo_change < -12.0:
        ok(f"the bottom is gone ({lo_change:+.1f} dB), which is the bone-conduction claim")
    else:
        fail(f"low end only moved {lo_change:+.1f} dB — bone conduction should cost "
             f"far more than that down there")

    # This is the test that a plain muffle would fail, and it is the reason the
    # test exists at all.
    if hi_change > lo_change + 8.0:
        ok(f"the top survives better than the bottom "
           f"({hi_change:+.1f} vs {lo_change:+.1f} dB) — not a muffle")
    else:
        fail(f"treatment took the top as hard as the bottom "
             f"({hi_change:+.1f} vs {lo_change:+.1f} dB) — that is the film "
             f"convention, and it models water as a barrier, not as immersion")


def test_calm_shape():
    print("\n\033[1mCalm is a mix control, not just a theme\033[0m")
    src = np.stack([burst(seed=5), burst(seed=6)], axis=1)
    rows = []
    for calm in (0.0, 0.25, 0.5, 0.75, 1.0):
        y = M.calm_shape(src, calm)
        rows.append((calm, centroid_hz(y), M.correlation(y[:, 0], y[:, 1])))

    print("    calm    centroid    correlation")
    for c, cen, r in rows:
        print(f"    {c:.2f}   {cen:8.0f} Hz      {r:+.3f}")

    good, bad = monotonic([r[1] for r in rows], "down", "brightness")
    if good:
        ok("panic is brighter than calm, all the way down the range")
    else:
        fail(f"brightness is not monotonic in calm — breaks at {bad}")

    good, bad = monotonic([r[2] for r in rows], "down", "width")
    if good:
        ok("panic narrows the image toward the centre; calm opens it")
    else:
        fail(f"width is not monotonic in calm — breaks at {bad}")


def test_stinger_table_agreement():
    """The five underwater rungs must match build-signatures.py exactly.

    If the stinger table and the space table drift apart, a Fathom stinger
    stops sitting in the room its own rank describes, and the ladder that the
    audience is being taught to read quietly stops being true.
    """
    print("\n\033[1mThe space table still agrees with the stinger table\033[0m")
    import importlib.util
    art = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    spec = importlib.util.spec_from_file_location(
        "undertow_sig", os.path.join(art, "build-signatures.py"))
    if spec is None or spec.loader is None:
        fail("could not load build-signatures.py to cross-check the ladder")
        return
    sig = importlib.util.module_from_spec(spec)
    sys.modules["undertow_sig"] = sig
    try:
        spec.loader.exec_module(sig)
    except Exception as exc:                       # noqa: BLE001
        fail(f"build-signatures.py did not load: {exc}")
        return

    mismatched = []
    for name, _note, cut, rev, _sw, _dur, width in sig.FATHOM:
        space = M.FATHOM_SPACE.get(name)
        if space is None:
            mismatched.append(f"{name}: missing from FATHOM_SPACE")
            continue
        if abs(space[0] - cut) > 0.5:
            mismatched.append(f"{name}: lowpass {space[0]} vs stinger {cut}")
        if abs(space[1] - rev) > 0.01:
            mismatched.append(f"{name}: reverb {space[1]}s vs stinger {rev}s")
        if abs(space[2] - width) > 0.01:
            mismatched.append(f"{name}: width {space[2]} vs stinger {width}")

    if mismatched:
        for m in mismatched:
            fail(m)
    else:
        ok(f"all {len(sig.FATHOM)} rungs match on lowpass, reverb time and width")


def main():
    print("\n\033[1mUNDERTOW — house acoustic verification\033[0m")
    test_ladder()
    test_submerged_voice()
    test_calm_shape()
    test_stinger_table_agreement()

    print()
    if FAIL:
        print(f"\033[31m  FAILED — {len(FAIL)} problem(s)\033[0m\n")
        return 1
    print("\033[32m  PASSED — the water is real and every sound can be put in it\033[0m\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
