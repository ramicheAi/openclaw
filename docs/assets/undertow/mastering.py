"""
UNDERTOW — mastering chain.

The composition was sound; the engineering underneath it was not. An audit of
the first masters found three things that a listener would hear before they
heard a single note of the theme:

  * EVERY FILE WAS DUAL-MONO. Left and right were bit-identical. A score whose
    subject is depth and space was being delivered with no space in it at all.
  * 16-bit output by straight truncation, with no dither. This score is full of
    long fades into near-silence, which is exactly where undithered truncation
    turns a decaying reverb tail into a gritty stair-step instead of a fade.
  * "Limiting" was tanh() applied to the entire signal. That is not a limiter,
    it is a distortion box: it reshapes the quiet parts as much as the loud
    ones, adding odd harmonics to material that is meant to be glassy.

This module replaces all three, and adds the gain staging a delivery master
needs. Signal order is the conventional one, and the order matters:

    DC block -> subsonic HPF -> stereo image -> bass mono-maker
             -> loudness trim -> look-ahead true-peak limiter -> dither

Every stage is measurable, and qc/verify_mastering.py measures them.
"""
import math
import os
import re
import subprocess
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, resample_poly, sosfilt, sosfiltfilt

SR = 48000

# Delivery targets. The whole score package lands on one pair of numbers so a
# music editor can drop any two cues on a timeline and hear them matched.
TARGET_LUFS = -16.0
CEILING_DBTP = -1.0

# -1.0 dBTP rather than -0.1: lossy codecs (AAC, Opus) overshoot on decode, and
# a master that is legal as PCM can clip on a streaming platform's transcode.
# 1 dB is the standard allowance for that.


# ── measurement ─────────────────────────────────────────────────────────────

def ffmpeg_exe():
    from shutil import which
    exe = which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def true_peak(x, oversample=4):
    """True peak in dBTP, measured on a 4x oversampled signal.

    Sample peak is not peak. A signal can sit at -1.0 dBFS on every sample and
    still reconstruct above 0 dBFS between them, which is what clips a DAC and
    what a codec then compounds. ITU-R BS.1770 asks for at least 4x, so 4x.
    """
    if x.ndim == 1:
        x = x[:, None]
        return true_peak(x, oversample)
    up = resample_poly(x, oversample, 1, axis=0)
    p = float(np.abs(up).max())
    return 20 * math.log10(max(p, 1e-12))


def loudness(path):
    """Integrated LUFS and true peak from ffmpeg's ebur128."""
    out = subprocess.run([ffmpeg_exe(), "-hide_banner", "-i", path, "-map", "0:a",
                          "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    tail = out[out.rfind("Integrated loudness:"):]
    i = re.search(r"I:\s*(-?[\d.]+)\s*LUFS", tail)
    p = re.search(r"Peak:\s*(-?[\d.]+)\s*dBFS", tail)
    return (float(i.group(1)) if i else None, float(p.group(1)) if p else None)


def octave_bands(x, sr=SR):
    """Energy per octave band in dB — for reading spectral balance."""
    mono = x.mean(1) if x.ndim > 1 else x
    mag = np.abs(np.fft.rfft(mono * np.hanning(len(mono)))) ** 2
    freq = np.fft.rfftfreq(len(mono), 1 / sr)
    out = []
    f = 31.25
    while f < sr / 2:
        m = (freq >= f / math.sqrt(2)) & (freq < f * math.sqrt(2))
        e = mag[m].sum()
        out.append((f, 10 * math.log10(max(e, 1e-20))))
        f *= 2
    return out


def correlation(L, R):
    """Stereo correlation. +1 is mono, 0 is fully decorrelated, negative
    means the mix partly cancels when summed to mono."""
    a, b = L - L.mean(), R - R.mean()
    d = math.sqrt(float((a * a).sum()) * float((b * b).sum()))
    return float((a * b).sum() / d) if d > 0 else 1.0


# ── processing ──────────────────────────────────────────────────────────────

def dc_block(x, hz=12.0, sr=SR):
    """Remove DC and rumble. Zero-phase, so it cannot smear transients."""
    sos = butter(2, hz, "hp", fs=sr, output="sos")
    return sosfiltfilt(sos, x, axis=0)


def subsonic(x, hz=24.0, sr=SR):
    """Everything below hearing is headroom being spent on nothing.

    The sub voices reach D1 (36.7 Hz) in Open Door, so this sits below that and
    only removes what no one can hear but every limiter still has to swallow.
    """
    sos = butter(3, hz, "hp", fs=sr, output="sos")
    return sosfiltfilt(sos, x, axis=0)


def hpf(x, hz, order=2, sr=SR):
    """High-pass. Used to stop two voices fighting over the same octave."""
    return sosfiltfilt(butter(order, hz, "hp", fs=sr, output="sos"), x, axis=0)


def shelf(x, hz, gain_db, kind="high", sr=SR):
    """First-order shelf, built by splitting the band and re-weighting it.

    Deliberately gentle and phase-benign. This score's whole top end is struck
    glass, and a steep EQ there rings; a shelf lifts air without sharpening the
    strike into something brittle.
    """
    sos = butter(1, hz, "lp" if kind == "high" else "hp", fs=sr, output="sos")
    part = sosfiltfilt(sos, x, axis=0)
    rest = x - part
    return part + rest * (10 ** (gain_db / 20))


def bass_harmonics(x, amount=0.28, below=140.0, sr=SR):
    """Add controlled harmonics to the low band so it survives small speakers.

    The ANSWER is a near-pure sine between 87 and 147 Hz. A phone, a laptop and
    most TV speakers reproduce almost nothing down there, so on those devices
    the answer simply does not arrive — which would silently break the one
    thing the whole score is built on. Generating even harmonics lets the ear
    infer the missing fundamental from the overtones, so the line reads at
    pitch on a speaker that cannot physically produce it.
    """
    lo = sosfiltfilt(butter(3, below, "lp", fs=sr, output="sos"), x, axis=0)
    hi = x - lo
    # asymmetric shaping -> even harmonics, which is what implies a fundamental
    drive = np.tanh(lo * 2.4) * 0.5 + np.tanh(lo * 1.1)
    harm = drive - lo
    harm = sosfiltfilt(butter(2, below * 1.4, "hp", fs=sr, output="sos"), harm, axis=0)
    return lo + hi + harm * amount


def stereo_reverb(x, seconds=3.6, mix=0.34, pre=0.02, width=1.0, seed=3,
                  ir_cut=3200.0, sr=SR):
    """Convolution reverb with genuinely decorrelated left and right tails.

    Two independent noise tails rather than one shared tail is the whole
    difference between a wide room and a mono room with a delay on it. The
    early part is kept partly common so the image still has a centre and does
    not smear into two separate events.

    Uses fftconvolve. Direct convolution of a 3.6s tail against a 64s cue is
    ~10^11 operations and was most of the render time; FFT convolution makes a
    longer, stereo, better-behaved reverb cheaper than the old mono one.
    """
    n = int(seconds * sr)
    t = np.linspace(0, 1, n)
    irs = []
    for ch in (0, 1):
        rng = np.random.default_rng(seed + ch * 977)
        ir = rng.normal(0, 1, n) * np.exp(-t * 7.0)
        # Water eats high frequencies; the tail must get darker as it decays.
        #
        # `ir_cut` exists because a fixed 3.2 kHz tail is WRONG at depth. The
        # caller filters the direct sound to the tier's corner and then hands
        # it here — so at hadal, an 800 Hz direct sound was coming back with a
        # 3.2 kHz reverb tail wrapped around it. The room was brighter than the
        # thing in it, which is not a thing water does, and it is measurable:
        # rendering the sinking sequence, spectral centroid ROSE from 504 Hz to
        # 716 Hz as the character descended. The tail was the only thing that
        # could be doing that.
        ir = sosfilt(butter(2, min(3200.0, ir_cut), "lp", fs=sr, output="sos"), ir)
        ir[:int(pre * sr)] = 0
        irs.append(ir)
    # blend a common component back in so the reverb has a centre
    common = (irs[0] + irs[1]) * 0.5
    irs = [c * width + common * (1 - width) for c in irs]

    mono = x.mean(1) if x.ndim > 1 else x
    wet = np.stack([fftconvolve(mono, ir)[:len(mono)] for ir in irs], axis=1)

    # Normalise the WET to the dry's own RMS before mixing, so `mix` means what
    # it says. The previous version scaled the impulse response by its sum of
    # absolute values, which left the wet signal roughly 22dB below the dry:
    # mix=0.42 was delivering on the order of 1% wet energy. A score whose
    # entire subject is underwater space had almost no space in it, and the
    # stereo width — which lives entirely in the decorrelated tails — could not
    # exist either. Tying the wet level to the dry level makes the reverb
    # amount a real, predictable control instead of an arbitrary one.
    rms_dry = float(np.sqrt((mono ** 2).mean()))
    rms_wet = float(np.sqrt((wet ** 2).mean()))
    if rms_wet > 1e-12:
        wet *= rms_dry / rms_wet

    dry = np.stack([mono, mono], axis=1) if x.ndim == 1 else x
    return (1 - mix) * dry + mix * wet


# ── the house acoustic: one water, every sound ──────────────────────────────
#
# The Fathom ladder started life as five stingers. That was too small a job for
# it. The ladder is really a description of an ACOUSTIC SPACE — how bright it
# is, how long it rings, how wide it is, how much of it you feel rather than
# hear — and once it is written as a space, any sound can be put in it.
#
# That is what makes a licensed field recording sound like it belongs to this
# show. A crowd sample from a library and a stinger written from scratch are
# not related by timbre, tuning or authorship. They are related by ROOM. Run
# both through fathom_space("twilight") and they were recorded in the same
# water, because they were.
#
# The five underwater rows are numerically identical to the FATHOM table in
# build-signatures.py, deliberately: the stingers must sit in exactly the same
# space as everything else at their rank, or the ladder stops being a ladder.
# "air" is added on top as the dry-land reference — no reverb tail worth the
# name, full bandwidth — so a cut from poolside to underwater is a real
# acoustic transition and not a filter sweep.
#
#   tier        lowpass   reverb_s   width   predelay   sub_lift_db   wet
FATHOM_SPACE = {
    "air":      (20000.0,     0.45,   0.25,     0.008,          0.0,  0.10),
    "sunlit":   (12000.0,     1.20,   0.35,     0.018,          0.0,  0.22),
    "twilight": ( 7000.0,     2.00,   0.55,     0.024,          1.5,  0.30),
    "midnight": ( 4000.0,     3.20,   0.75,     0.030,          3.0,  0.38),
    "abyssal":  ( 2000.0,     4.60,   0.90,     0.038,          4.5,  0.46),
    "hadal":    (  800.0,     7.00,   1.00,     0.048,          6.0,  0.55),
}
FATHOM_ORDER = ("air", "sunlit", "twilight", "midnight", "abyssal", "hadal")


def fathom_space(x, tier, wet=None, seed=3, sr=SR):
    """Place any sound at a Fathom depth. This is the show's house acoustic.

    Three cues move together, and they move together because they do in real
    water: brightness falls, the tail lengthens, and the image widens. A
    listener who could not name one of them still hears the descent, which is
    the whole design goal — the ladder has to teach itself.

    `wet` overrides the tier's reverb amount for cues that need to stay dry and
    close at depth (a whisper right at the ear in the abyssal dark is a real
    dramatic beat, and it should not be drowned by its own room).
    """
    if tier not in FATHOM_SPACE:
        raise ValueError(f"unknown fathom tier {tier!r}; expected one of {FATHOM_ORDER}")
    cut, secs, width, pre, sub_db, default_wet = FATHOM_SPACE[tier]

    st = np.asarray(x, dtype=np.float64)
    if st.ndim == 1:
        st = np.stack([st, st], axis=1)

    # Water eats treble. This is the single most legible depth cue there is.
    if cut < sr / 2 - 1000:
        st = sosfiltfilt(butter(3, cut, "lp", fs=sr, output="sos"), st, axis=0)

    # And it hands the energy downward: the deep is felt before it is heard.
    if sub_db:
        st = shelf(st, 160.0, sub_db, "low")

    # The tail cannot be brighter than the direct sound it belongs to.
    return stereo_reverb(st, seconds=secs, mix=default_wet if wet is None else wet,
                         pre=pre, width=width, seed=seed, ir_cut=cut, sr=sr)


def calm_shape(x, calm, sr=SR):
    """Render the show's central rule as a mix control.

    Canon: panic is the villain, calm is the stat. That is not only a theme,
    it is a description of how the two states SOUND, so it can be automated
    instead of hand-mixed cue by cue.

        calm = 0.0   panic — bright, hard, narrow, pressed against the ear
        calm = 1.0   stillness — dark, soft, wide, open, far away

    A panicking swimmer's world is not quieter, it is closer and sharper: the
    high end comes up and the image collapses toward the centre, which is what
    tunnel vision sounds like. Calm opens both back out.
    """
    calm = float(np.clip(calm, 0.0, 1.0))
    st = np.asarray(x, dtype=np.float64)
    if st.ndim == 1:
        st = np.stack([st, st], axis=1)

    # brightness: +4 dB of air at full panic, -3 dB at full calm
    st = shelf(st, 3500.0, 4.0 - 7.0 * calm, "high")

    # width: collapse toward mono as panic rises
    mid = st.mean(1)
    side = (st[:, 0] - st[:, 1]) * 0.5
    side *= 0.25 + 0.75 * calm
    return np.stack([mid + side, mid - side], axis=1)


def submerged_voice(x, sr=SR):
    """How a voice sounds to a submerged listener — and it is not "muffled".

    The convention in film is a heavy lowpass plus reverb. That models water as
    a BARRIER between a source and an air-filled ear canal, which is what you
    hear standing beside a pool with your head dry. It is the wrong model for a
    head that is actually under, and this show lives under.

    Submerged, the ear canal floods and the impedance mismatch that the middle
    ear exists to solve mostly disappears. Sound reaches the cochlea largely by
    conduction through the skull instead. Two consequences drive this function:

      * DIRECTION DIES. Sound moves through water roughly four times faster
        than through air, so the interaural time difference between the ears
        shrinks by about the same factor and falls below what the auditory
        system can resolve. A submerged listener genuinely cannot tell where a
        sound came from. So this collapses to mono — not as a stylistic width
        choice but because a stereo image would be a lie.

      * IT IS THE BOTTOM THAT GOES, NOT THE TOP. Bone conduction is a poor
        path for low frequencies, so the loss underwater is worst down low.
        The instinct to reach for a lowpass is backwards; what actually leaves
        is weight and proximity, and what remains sits inside the skull.

    The narrow lift is the skull's own resonance — the reason an underwater
    voice reads as coming from inside your head rather than from the room.
    """
    st = np.asarray(x, dtype=np.float64)
    mono = st.mean(1) if st.ndim > 1 else st

    # lose the bottom, which is the part bone conduction does not carry
    v = sosfiltfilt(butter(2, 300.0, "hp", fs=sr, output="sos"), mono, axis=0)
    # gentle skull resonance: a band around 1.2k lifted, not a peaky filter
    band = sosfiltfilt(butter(2, [700.0, 2200.0], "bp", fs=sr, output="sos"), v, axis=0)
    v = v + band * 0.55
    # only the very top goes, and only a little — this is water, not a wall
    v = sosfiltfilt(butter(2, 9000.0, "lp", fs=sr, output="sos"), v, axis=0)

    # no direction: both ears get the identical signal, because they do
    return np.stack([v, v], axis=1)


def pan(x, position=0.0):
    """Constant-power pan of a mono source. -1 hard left, +1 hard right.

    Constant power (cos/sin) rather than linear: a linearly panned source
    audibly dips in level as it crosses the centre.
    """
    a = (position + 1) * math.pi / 4
    return np.stack([x * math.cos(a), x * math.sin(a)], axis=1) * math.sqrt(2)


def mono_below(st, hz=120.0, sr=SR):
    """Collapse the bass to mono below `hz`.

    Standard practice and not a stylistic choice. Any stereo content down there
    partially cancels when a phone speaker, a club PA or a theatrical surround
    bass-manages it to a single sub, so the low end that carries the ANSWER is
    exactly the content most at risk. Making it mono guarantees it survives.
    """
    sos = butter(4, hz, "lp", fs=sr, output="sos")
    low = sosfiltfilt(sos, st, axis=0)
    high = st - low
    m = low.mean(1)
    return high + np.stack([m, m], axis=1)


def limiter(st, ceiling_db=CEILING_DBTP, lookahead=0.0015, release=0.09, sr=SR):
    """Look-ahead peak limiter, channel-linked.

    Replaces a tanh() across the whole signal. tanh reshapes every sample, so
    it distorts the quiet passages as hard as the loud ones and puts odd
    harmonics on struck glass, which is the one timbre in this score that
    cannot afford them. A limiter touches only what exceeds the ceiling.

    Gain reduction is computed, taken as a sliding minimum over the lookahead
    window, then smoothed with a Hann window. The smoothing is what keeps it
    click-free: an instantaneous gain change is itself a discontinuity, which
    is the defect this whole project keeps finding in its own audio.

    Channel-linked so the stereo image does not wander when one side peaks.

    THE PEAK IS MEASURED ON AN OVERSAMPLED SIGNAL, which is the difference
    between a limiter and a true-peak limiter. Limiting the samples you have
    leaves the reconstruction between them free to overshoot: a converter, and
    then a lossy codec, hear that overshoot even though no stored sample exceeds
    the ceiling. The score never exposed this because it is sparse and tonal.
    The first dense broadband material to go through the chain — a water field
    recording — came out at +1.3 dBTP against a -1.0 ceiling, which is a clipped
    delivery master that every meter reading samples would have called clean.
    """
    ceiling = 10 ** (ceiling_db / 20)
    OS = 4                                        # ITU-R BS.1770 asks for >= 4x

    def gain_curve(sig):
        """The whole envelope is computed in the OVERSAMPLED domain.

        The obvious approach — measure the true peak, then build the gain at the
        original rate — does not work, and it is worth saying why because it
        looks like it should. Applying a time-varying gain per sample produces a
        new waveform whose reconstruction between samples is not simply the old
        reconstruction scaled: neighbouring samples got different gains. Measured
        on dense noise, a limiter that held sample peak at exactly -1.01 dB
        produced an output whose own 4x reconstruction reached +0.96 dBTP.

        Computing the curve upsampled and then folding it back down by taking the
        MINIMUM of each group of four fixes it. Minimum, not mean: every original
        sample inherits the most reduction any nearby reconstruction point asked
        for, which is the conservative direction and the only one that is safe.
        """
        up = resample_poly(sig, OS, 1, axis=0)
        peak = np.abs(up).max(axis=1)
        want = np.ones_like(peak)
        hot = peak > ceiling
        want[hot] = ceiling / peak[hot]

        # sliding minimum over the lookahead window: duck BEFORE the peak
        la = max(1, int(lookahead * sr * OS))
        padded = np.concatenate([want, np.ones(la)])
        g = np.lib.stride_tricks.sliding_window_view(padded, la + 1).min(axis=1)[:len(want)]

        # smooth; an instantaneous gain change is itself a discontinuity, which
        # is the defect this whole project keeps finding in its own audio
        w = max(3, int(release * sr * OS) | 1)
        win = np.hanning(w)
        win /= win.sum()
        g = np.convolve(np.concatenate([np.ones(w), g, np.ones(w)]),
                        win, mode="same")[w:w + len(want)]
        g = np.minimum(g, want)      # never let smoothing undo an actual catch

        pad = (-len(g)) % OS
        if pad:
            g = np.concatenate([g, np.ones(pad)])
        g = g.reshape(-1, OS).min(axis=1)
        if len(g) < len(sig):
            g = np.concatenate([g, np.ones(len(sig) - len(g))])
        return g[:len(sig)]

    out = st * gain_curve(st)[:, None]

    # BACKSTOP. The fold-down is conservative but not a proof, so the delivered
    # figure is checked rather than assumed and trimmed if it is still over. A
    # ceiling that is nearly always met is not a ceiling.
    for _ in range(4):
        tp = true_peak(out)
        if tp <= ceiling_db + 0.01:
            break
        out = out * (10 ** ((ceiling_db - tp) / 20))
    return out


def normalise(st, path_probe, target=TARGET_LUFS, ceiling=CEILING_DBTP, passes=3):
    """Trim to target loudness, then limit, iterating because limiting changes
    loudness. Returns (stereo, measured_lufs, was_capped).

    If the ceiling stops the signal reaching the target, that is reported
    rather than hidden — a cue quietly 2 LU under spec is a mix problem to
    know about, not something to paper over by pushing the limiter harder.
    """
    out = st
    measured = None
    for _ in range(passes):
        _write_probe(path_probe, out)
        lufs, _ = loudness(path_probe)
        if lufs is None:
            break
        measured = lufs
        if abs(lufs - target) < 0.1:
            break
        out = out * (10 ** ((target - lufs) / 20))
        out = limiter(out, ceiling)
    out = limiter(out, ceiling)
    _write_probe(path_probe, out)
    final, _ = loudness(path_probe)
    return out, final, (final is not None and final < target - 0.35)


def _write_probe(path, st):
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(4)
        w.setframerate(SR)
        w.writeframes((np.clip(st, -1, 1) * 2147483647).astype("<i4").tobytes())


# ── delivery ────────────────────────────────────────────────────────────────

def _read_riff(path):
    """Minimal RIFF walker for the wav variants the stdlib will not open.

    Only what is needed: find `fmt ` for the layout, find `data` for the bytes,
    and skip everything else. Extensible files carry the real sample format in
    the sub-format GUID, but its first two bytes are the ordinary format tag, so
    the same integer codes apply and nothing further needs decoding.
    """
    import struct
    with open(path, "rb") as fh:
        head = fh.read(12)
        if head[:4] != b"RIFF" or head[8:12] != b"WAVE":
            raise ValueError(f"{path}: not a RIFF/WAVE file")
        ch = width = rate = None
        data = b""
        while True:
            hdr = fh.read(8)
            if len(hdr) < 8:
                break
            cid, size = struct.unpack("<4sI", hdr)
            body = fh.read(size)
            if cid == b"fmt ":
                tag, ch, rate, _bps, _align, bits = struct.unpack("<HHIIHH", body[:16])
                if tag == 0xFFFE and len(body) >= 40:
                    tag = struct.unpack("<H", body[24:26])[0]
                if tag not in (1, 0xFFFE):        # 1 = PCM
                    raise ValueError(f"{path}: only PCM is supported (tag {tag})")
                width = bits // 8
            elif cid == b"data":
                data = body
            if size % 2:                          # RIFF chunks are word-aligned
                fh.read(1)
    if ch is None or not data:
        raise ValueError(f"{path}: no fmt/data chunk found")
    return ch, width, rate, data


def read_wav(path, sr=SR):
    """Read a PCM wav to float stereo at the project rate.

    Handles 16, 24 and 32-bit, because a licensed sample library is not going to
    agree with this project on either bit depth or sample rate, and the whole
    point of the texture tier is that library material comes in.

    24-bit gets unpacked by hand: the `wave` module hands back raw bytes for it
    and numpy has no 24-bit integer type, so the three bytes are reassembled
    little-endian and sign-extended off the top byte.
    """
    try:
        with wave.open(path, "rb") as w:
            n, ch, width, rate = (w.getnframes(), w.getnchannels(),
                                  w.getsampwidth(), w.getframerate())
            raw = w.readframes(n)
    except wave.Error:
        # The stdlib reader rejects WAVE_FORMAT_EXTENSIBLE (format tag 0xFFFE),
        # which is what ffmpeg writes by default for anything above 16-bit or
        # above two channels. That is most of what arrives here: every licensed
        # sample conformed with ffmpeg, and every voice take. Refusing to read
        # the most common wav variant in the pipeline is not a defensible
        # limitation, so the chunks are walked directly instead.
        ch, width, rate, raw = _read_riff(path)

    if width == 2:
        x = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    elif width == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        q = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        q = np.where(q & 0x800000, q - 0x1000000, q)      # sign-extend
        x = q.astype(np.float64) / 8388608.0
    elif width == 4:
        x = np.frombuffer(raw, dtype="<i4").astype(np.float64) / 2147483648.0
    else:
        raise ValueError(f"{path}: unsupported sample width {width * 8}-bit")

    x = x.reshape(-1, ch)
    if ch == 1:
        x = np.repeat(x, 2, axis=1)
    elif ch > 2:
        x = x[:, :2]

    if rate != sr:
        from math import gcd
        g = gcd(int(rate), int(sr))
        x = resample_poly(x, sr // g, rate // g, axis=0)
    return x


def write_master(path, st, bits=24):
    """Write a stereo master. 24-bit is written verbatim; 16-bit is dithered.

    At 24 bits the quantisation floor is around -144 dBFS, far below anything
    in this material, so dither would only add noise. At 16 bits the floor is
    -96 dBFS and the truncation error correlates with the signal, which on a
    long reverb tail fading to nothing is audible as a granular stair-step
    rather than a fade. TPDF dither decorrelates that error, at the cost of a
    noise floor that is constant and therefore inaudible.
    """
    st = np.clip(st, -1.0, 1.0)
    if bits == 24:
        q = (st * 8388607).astype(np.int32)
        b = np.empty((q.shape[0], q.shape[1], 3), dtype=np.uint8)
        b[..., 0] = q & 0xFF
        b[..., 1] = (q >> 8) & 0xFF
        b[..., 2] = (q >> 16) & 0xFF
        data, width = b.tobytes(), 3
    elif bits == 16:
        scale = 32767
        rng = np.random.default_rng(19)
        # TPDF: the difference of two uniforms, 1 LSB peak-to-peak. Flat noise,
        # and unlike RPDF it also removes noise MODULATION - the floor stops
        # breathing with the signal, which is what makes it disappear.
        lsb = 1.0 / scale
        d = (rng.random(st.shape) - rng.random(st.shape)) * lsb
        q = np.clip((st + d) * scale, -32768, 32767).astype("<i2")
        data, width = q.tobytes(), 2
    else:
        raise ValueError("bits must be 16 or 24")

    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(width)
        w.setframerate(SR)
        w.writeframes(data)
    return path


def master(stereo, scratch_wav, target=TARGET_LUFS, ceiling=CEILING_DBTP):
    """The full chain, in order. Returns (stereo, lufs, capped)."""
    st = np.asarray(stereo, dtype=np.float64)
    if st.ndim == 1:
        st = np.stack([st, st], axis=1)
    st = dc_block(st)
    st = subsonic(st)
    st = mono_below(st)
    st, lufs, capped = normalise(st, scratch_wav, target, ceiling)
    return edge_seal(st), lufs, capped


def edge_seal(st, ms=6.0, sr=SR):
    """Force the first and last samples to zero. Must be the LAST thing done.

    Sealing the endpoints before the chain does not survive it: dc_block and
    subsonic use sosfiltfilt, which is zero-phase and pads at the boundaries,
    so it hands back a signal whose first sample is no longer zero. A file that
    starts at a non-zero value steps from silence on the first sample, which is
    a click at the top of every playback and at every loop point — and it is
    invisible to a sample-to-sample difference test, because there is no
    earlier sample to differ from.
    """
    n = max(2, int(ms * sr / 1000))
    if len(st) <= 2 * n:
        return st
    st = st.copy()
    st[:n] *= np.linspace(0, 1, n)[:, None]
    st[-n:] *= np.linspace(1, 0, n)[:, None]
    return st
