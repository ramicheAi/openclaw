# UNDERTOW — Art Protocol

**Why this exists.** On 2026-07-25, three consecutive attempts to enlarge Kai in the
hero poster produced a scuba tank, a cape, and a boy who wasn't Black. The creator
caught all three. Then a side-by-side audit showed the whole cast drifting — Kai's skin
lighter in the crew shot than in his own hero plate, Bo lanky in one image and heavyset
in another.

The root cause was not bad prompts. It was **generating characters from text
descriptions.** Text cannot hold a face. This document and the system around it exist so
that failure cannot recur.

Companion files:
[UNDERTOW-CHARACTER-CANON.json](UNDERTOW-CHARACTER-CANON.json) (machine-readable truth) ·
[UNDERTOW-VISDEV-BRIEFS.md](UNDERTOW-VISDEV-BRIEFS.md) (design rationale) ·
`assets/undertow/qc/` (the enforcement gate)

---

## The four laws

**1. A character is never generated from text alone.**
Every character has a locked **element ID** in the canon file. That ID goes into the
prompt as `<<<element-id>>>`. The platform injects the approved reference automatically.
For multi-character shots, use multiple placeholders — one per character.

**2. Every asset carries provenance.**
Four valid chains, strongest first:

| Provenance | Meaning | Use for |
|---|---|---|
| `element_id` | Generated with a locked element | **All new character art** |
| `derived-from-approved-plates` | Composited, zero generation | Lineup sheets, montages |
| `approved-plate-as-reference` | Plate supplied as image reference | Legacy only |
| `rejected-record` | Kept to document a rejection | Never ships |

No chain to approved identity = the commit is blocked.

**3. The creator is never the quality filter.**
Every generated asset is inspected against canon *before* it is shown. Off-model output
is discarded and regenerated — never presented as an option, never as "pick A or B."
Rejections get recorded, not hidden.

**4. Canon changes are logged, never silent.**
Identity is checksummed. If an approved plate is altered or swapped, the verifier fails
loudly. Changing a character means a deliberate, recorded amendment.

---

## Doing the work

**Solo character shot**
```
model: nano_banana_pro
prompt: "<<<4ee10302-b895-45ab-9680-426cb23ac03a>>> swimming down into violet
         twilight, plain dark jammers, bare arms, breath held…"
```

**Multi-character shot** — one placeholder per character:
```
prompt: "<<<kai-id>>> on the pool deck with <<<bo-id>>>'s arm around his
         shoulders, <<<mirei-id>>> holding a stopwatch beside them…"
```

**Never**: "a 15-year-old mixed Black boy with deep brown skin…". That sentence is what
erased him. The element ID is not optional.

### Before showing anything to the creator
1. Download the render.
2. **Open it and look at it** against the canon entry — skin, hair, build, wardrobe,
   forbidden list.
3. Discard anything off-model. Regenerate.
4. Register the survivor in `qc/asset-manifest.json` with provenance + sign-off.
5. Run `python3 docs/assets/undertow/qc/verify_assets.py`.
6. Only now show it.

---

## The gate

```bash
# status of every asset
python3 docs/assets/undertow/qc/verify_assets.py --report

# install the pre-commit block (once per clone)
ln -sf ../../docs/assets/undertow/qc/pre-commit-undertow.sh .git/hooks/pre-commit
chmod +x docs/assets/undertow/qc/pre-commit-undertow.sh
```

The hook blocks any commit touching UNDERTOW art that fails verification.

---

## What this system does and does not guarantee

Being precise, because a check that *looks* rigorous but isn't is worse than none.

**Guaranteed (deterministic):**
- An approved plate cannot be silently altered — checksums catch it.
- Untracked art cannot ship — every file must be registered.
- No character asset ships without a traceable chain to approved identity.
- No asset ships without a recorded visual sign-off.

**Strongly improved, not mathematically guaranteed:**
- *Visual* likeness across images. Elements bind identity far tighter than text, but
  generative models still vary pose, lighting, and rendering. The final guarantee at
  production scale is a human character designer working from the lineup sheet.

**Deliberately rejected:**
- Automated skin-tone pixel sampling. It was built, tested, and **failed** — probes
  landed on water, robes, and coats rather than skin. Shipping it would have created
  false confidence. Mandatory visual review replaces it.

**Known open items** (tracked honestly in the manifest, not buried):
- `cast-key-visual.png` — Kai's skin renders lighter than canon. **Flagged for
  regeneration with elements.**
- `teaser-sinking-01.mp4` — start frame is the approved plate, so identity holds at
  frame 0; drift across the 5 seconds is not verified frame-by-frame.
- Posters and the teaser predate elements. They are creator-verified correct, but new
  versions should use element IDs.
