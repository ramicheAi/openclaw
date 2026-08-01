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

    peak = env.max()
    return env / peak if peak > 1e-12 else env


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
        # a phone may not swallow more than a quarter of the line
        max_len = max(min_len, int(n_frames * 0.25))
        for t in range(i, n_frames):
            if cost[i, t] >= INF:
                continue
            hi = min(n_frames, t + max_len)
            for u in range(t + min_len, hi + 1):
                acoustic = pre[u] - pre[t]
                drift = abs(u - prior_edges[i + 1])
                c = cost[i, t] + acoustic + strength * drift * 0.35
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
