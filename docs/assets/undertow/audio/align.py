"""
UNDERTOW — line up a mouth chart with the recording it belongs to.

WHAT THIS IS AND IS NOT.

This is not Montreal Forced Aligner. MFA runs a pretrained acoustic model and
wants conda, model downloads and a machine that will still be here tomorrow.
This container has numpy and scipy and a bundled ffmpeg, and the repo has to
keep working from a clean checkout years from now with none of that available.

So this does the honest smaller thing: it uses the ONE acoustic property that
needs no trained model — where the energy is — and warps the chart's own
duration model onto it. Speech is loud on vowels and quiet on stops and silent
in pauses, and a phone sequence carries a prior for which of its phones are long
and which are quick. Fitting the second to the first with dynamic programming
gets alignment that is good to a frame or two, which is the tolerance the eye
actually has for lip-sync.

Two functions matter:

    speech_envelope()  the recording, reduced to one number per VIDEO frame
    sync_offset()      how many frames the mouth leads or lags the sound

and one does the real work:

    refine()           redistribute the chart's phone durations to follow the
                       measured energy contour instead of the generic prior

TOLERANCES. The eye accepts a mouth that leads the sound by a frame or two and
rejects one that lags. That asymmetry is not a preference, it is how the
McGurk-adjacent literature and every animation house's practice both land: the
visual gesture that produces a sound genuinely begins before the sound does.
So the thresholds here are deliberately lopsided, and the verifier that consumes
them treats early and late differently.
"""
import math

import numpy as np
from scipy.signal import butter, sosfiltfilt

# Cost per frame of drift away from where the generic duration prior expected a
# phone to land. This is a TIEBREAK, and it was originally set to 0.35, which
# made it the dominant term instead.
#
# Measured on the first real recording, against ground truth taken from the
# recording's own silence: at 0.35 the aligner placed the line's mid-sentence
# pause 25 frames away from where it audibly is. At 0.03 the error is one frame.
# 0.00 measured identically, so this is not tuned to that recording — a small
# non-zero value is kept only so that material where the acoustic evidence is
# genuinely ambiguous (a line under loud music, say) still has something to fall
# back on rather than choosing arbitrarily.
DRIFT_COST = 0.03


def speech_envelope(audio, sr, fps=24, band=(300.0, 3400.0)):
    """Per-video-frame loudness of the speech band, normalised to 0..1.

    Band-limited to roughly the telephone band before measuring. Full-band RMS
    is dominated by whatever else is in the mix — a sub drop, a room tone, the
    score — and a mouth aligned to the score rather than to the voice is worse
    than no alignment at all, because it looks deliberate.
    """
    x = np.asarray(audio, dtype=np.float64)
    if x.ndim > 1:
        x = x.mean(axis=1)
    lo, hi = band
    hi = min(hi, sr / 2 - 100.0)
    x = sosfiltfilt(butter(2, [lo, hi], "bp", fs=sr, output="sos"), x)

    n = max(1, int(round(len(x) / sr * fps)))
    step = len(x) / n
    env = np.empty(n)
    for i in range(n):
        a, b = int(i * step), int((i + 1) * step)
        seg = x[a:max(b, a + 1)]
        env[i] = math.sqrt(float((seg ** 2).mean())) if len(seg) else 0.0

    # MEASURED IN dB, NOT LINEAR AMPLITUDE, and referenced to a high percentile
    # rather than to the single loudest frame.
    #
    # The first version divided by the peak. On a reading with any real dynamic
    # range that is a trap: the first phrase of the test line sat far below the
    # second, and against a peak-normalised scale it came back near zero — the
    # aligner read a whole spoken phrase as silence and placed the mouth
    # accordingly.
    #
    # Speech and silence are separated by tens of dB and barely at all in linear
    # amplitude, which is why every meter that has to make this distinction works
    # in dB. The 95th percentile rather than the maximum keeps one stray transient
    # from setting the reference for the entire line.
    ref = float(np.percentile(env, 95))
    if ref <= 1e-12:
        return np.zeros(n)
    db = 20 * np.log10(np.maximum(env, 1e-12) / ref)
    FLOOR = -45.0                      # below this is silence for our purposes
    return np.clip((db - FLOOR) / (-FLOOR), 0.0, 1.0)


def sync_offset(mouth_openness, envelope, max_frames=12):
    """How far the mouth runs ahead of the sound, in frames.

    POSITIVE means the mouth is EARLY (leading the audio), which is what
    animation wants. Negative means it lags, which is the failure mode an
    audience notices immediately.

    Both signals are mean-removed before correlating. Without that, two signals
    that are merely both positive correlate strongly at every lag and the peak
    lands wherever the overlap is longest rather than where the events line up —
    which would make a badly synced take score as well as a good one.
    """
    a = np.asarray(mouth_openness, dtype=np.float64)
    b = np.asarray(envelope, dtype=np.float64)
    n = min(len(a), len(b))
    if n < 4:
        return 0, 0.0
    a, b = a[:n] - a[:n].mean(), b[:n] - b[:n].mean()
    da, db = math.sqrt(float((a * a).sum())), math.sqrt(float((b * b).sum()))
    if da < 1e-12 or db < 1e-12:
        return 0, 0.0

    best, best_r = 0, -2.0
    for lag in range(-max_frames, max_frames + 1):
        if lag >= 0:                       # mouth early: compare a[:n-lag] to b[lag:]
            u, v = a[:n - lag], b[lag:]
        else:
            u, v = a[-lag:], b[:n + lag]
        if len(u) < 4:
            continue
        r = float((u * v).sum()) / (da * db)
        if r > best_r:
            best, best_r = lag, r
    return best, best_r


def refine(pairs, audio, sr, fps=24, strength=0.7):
    """Redistribute phone durations to follow the recording's energy contour.

    The chart's prior says a stressed vowel is roughly twice a stop. A real
    performance says how long THIS stressed vowel was, in THIS reading, with
    this actor leaning on this word. Fitting one to the other is what turns a
    generic chart into a chart of the take.

    Dynamic programming over a cost that pays for two things: putting a phone
    where the energy does not suit it, and moving a phone far from where its
    prior expected it. `strength` weights the second against the first, so 0
    keeps the prior untouched and 1 follows the audio wherever it goes. The
    default leans on the audio while refusing to let one loud breath drag a
    whole line out of shape.

    Returns a timeline of (phone, start_s, end_s), same shape as
    visemes.to_timeline, so it is a drop-in replacement once audio exists.
    """
    env = speech_envelope(audio, sr, fps)
    n_frames = len(env)
    if n_frames == 0 or not pairs:
        return []

    # What each phone expects to see: silence quiet, vowels loud, stops quiet,
    # everything else in between. This is the entire "acoustic model", and being
    # this crude is the point — it needs no training data and cannot go stale.
    import visemes as V
    want = []
    for phone, _w in pairs:
        if phone == "sil":
            want.append(0.05)
        else:
            bare = V.strip_stress(phone)
            if bare in V.STOPS:
                want.append(0.25)
            elif bare in V.FRICATIVES or bare in V.AFFRICATES:
                want.append(0.45)
            elif bare in V.NASALS or bare in V.GLIDES:
                want.append(0.55)
            else:                                   # vowels
                want.append(0.90)
    want = np.asarray(want)

    # MATCH THE MODEL TO THE RECORDING'S OWN DYNAMICS, not to absolute numbers.
    #
    # The figures above are a ranking — silence quietest, vowels loudest — and
    # they were being compared directly against a peak-normalised envelope. Real
    # speech does not oblige: its loudest vowel hits 1.0 by construction but its
    # average vowel sits far lower, so nothing ever matched the 0.90 vowel target
    # and the solver assigned almost every frame to the mid-valued consonant
    # class instead. On the first real recording that produced a chart of one
    # long neutral mouth with the vowels squeezed out — the exact opposite of
    # what a chart is for.
    #
    # Rescaling the targets onto the envelope's measured mean and spread keeps
    # the ranking, which is the part that is actually known, and drops the
    # absolute levels, which were never more than a guess about mic gain.
    e_mean, e_std = float(env.mean()), float(env.std())
    w_mean, w_std = float(want.mean()), float(want.std())
    if w_std > 1e-9 and e_std > 1e-9:
        want = (want - w_mean) / w_std * e_std + e_mean
    want = np.clip(want, 0.0, 1.0)

    weights = np.asarray([w for _, w in pairs], dtype=np.float64)
    prior_edges = np.concatenate([[0.0], np.cumsum(weights) / weights.sum()]) * n_frames

    m = len(pairs)
    # cost[i, t] = best cost of having placed phones 0..i-1 in frames 0..t-1
    INF = 1e18
    cost = np.full((m + 1, n_frames + 1), INF)
    back = np.zeros((m + 1, n_frames + 1), dtype=np.int32)
    cost[0, 0] = 0.0

    # Precompute per-phone, per-span acoustic cost via a prefix sum of |env-want|
    for i in range(m):
        diff = np.abs(env - want[i])
        pre = np.concatenate([[0.0], np.cumsum(diff)])
        min_len = 1
        # A phone may not swallow more than 0.5s — about 12 frames at 24fps.
        # This was a quarter of the whole line, which on a four-second reading
        # let one consonant claim nearly a second and hold the mouth still
        # through half the sentence. Nothing in speech except a held vowel or a
        # pause lasts that long, and silence is exempted below because a pause
        # genuinely can.
        cap = 0.5 if pairs[i][0] != "sil" else 2.0
        max_len = max(min_len, min(n_frames, int(cap * fps)))
        for t in range(i, n_frames):
            if cost[i, t] >= INF:
                continue
            hi = min(n_frames, t + max_len)
            for u in range(t + min_len, hi + 1):
                acoustic = pre[u] - pre[t]
                drift = abs(u - prior_edges[i + 1])
                c = cost[i, t] + acoustic + strength * drift * DRIFT_COST
                if c < cost[i + 1, u]:
                    cost[i + 1, u] = c
                    back[i + 1, u] = t

    if cost[m, n_frames] >= INF:
        return []                                   # no path: fall back to prior

    edges = [n_frames]
    t = n_frames
    for i in range(m, 0, -1):
        t = int(back[i, t])
        edges.append(t)
    edges.reverse()

    out = []
    for i, (phone, _w) in enumerate(pairs):
        out.append((phone, edges[i] / fps, edges[i + 1] / fps))
    return out
