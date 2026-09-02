#!/usr/bin/env python3
"""
UNDERTOW asset verifier — the enforcement gate.

Guarantees, in order of strength:

1. DRIFT DETECTION (cryptographic, absolute)
   Every approved character plate is checksummed. If a founding plate is ever
   altered or swapped, this fails loudly. Identity cannot silently change.

2. PROVENANCE (deterministic, absolute)
   Every character asset must declare which locked element_id produced it.
   No element_id and not a founding plate => FAIL. This is the guarantee that
   prevents text-only generation, which is what erased Kai three times.

3. REGISTRATION (deterministic)
   Every image/video in the asset directory must appear in the manifest.
   Untracked art cannot sneak in.

4. SIGN-OFF (process, enforced here)
   Every character asset must record verified_by + verified_at — proof that a
   human or agent actually looked at it against canon before it shipped.

Deliberately NOT relied upon: automated skin-tone pixel sampling. It was tested
and proved fragile (probes landed on water, robes, and coats rather than skin).
A check that looks rigorous but isn't is worse than no check. Visual review is
mandatory instead, and recorded.

Usage:
    python3 verify_assets.py            # verify, exit 1 on failure
    python3 verify_assets.py --report   # human-readable status table
"""
import json, os, sys, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.dirname(HERE)                        # docs/assets/undertow
DOCS = os.path.dirname(os.path.dirname(ART))       # docs
CANON = os.path.join(DOCS, "UNDERTOW-CHARACTER-CANON.json")
MANIFEST = os.path.join(HERE, "asset-manifest.json")

MEDIA_EXT = {".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mov", ".wav"}

# Subdirectories of the asset root that are also scanned. Files in them are
# registered under a path-qualified key ("signatures/motif-open-door.wav") so
# a name can repeat between directories without colliding in the manifest.
MEDIA_SUBDIRS = ("signatures", "textures", "lipsync-test")


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def load():
    canon = json.load(open(CANON))
    manifest = json.load(open(MANIFEST))
    return canon, manifest


def verify(report=False):
    canon, manifest = load()
    chars = canon["characters"]
    assets = manifest["assets"]
    failures, warnings, rows = [], [], []

    # Retired elements stay valid: an asset generated before a character's element
    # was rebuilt still traces to approved identity. Retiring an element does not
    # retroactively orphan the art it produced.
    # A character can be rebuilt more than once, so retirements accumulate.
    # Accept both the single field and the list form.
    valid_elements = {c["element_id"] for c in chars.values()}
    for c in chars.values():
        if c.get("retired_element_id"):
            valid_elements.add(c["retired_element_id"])
        valid_elements |= set(c.get("retired_element_ids", []))

    # Founding plates AND baseline references are identity sources, not derived art.
    plate_by_char = {k: v["approved_plate"].split("/")[-1] for k, v in chars.items()}
    baseline_by_char = {k: v["baseline_reference"].split("/")[-1]
                        for k, v in chars.items() if v.get("baseline_reference")}
    identity_sources = set(plate_by_char.values()) | set(baseline_by_char.values())

    # --- 1. DRIFT: founding plates and baseline references must match recorded checksums
    for cid, c in chars.items():
        for label, key in (("founding plate", "approved_plate"),
                           ("baseline reference", "baseline_reference")):
            ref = c.get(key)
            if not ref:
                continue
            fn = ref.split("/")[-1]
            p = os.path.join(ART, fn)
            if not os.path.exists(p):
                failures.append(f"MISSING SOURCE  {cid}: {fn} not found — canon references a {label} that does not exist")
                continue
            rec = assets.get(fn, {})
            if "sha256_16" not in rec:
                failures.append(f"UNCHECKSUMMED   {fn} is a {label} with no recorded checksum")
            elif rec["sha256_16"] != sha(p):
                failures.append(f"DRIFT DETECTED  {fn} no longer matches its recorded checksum — identity may have been altered")

    # --- 2/3/4. every media file registered, with provenance + sign-off
    on_disk = sorted(f for f in os.listdir(ART)
                     if os.path.splitext(f)[1].lower() in MEDIA_EXT)
    for sub in MEDIA_SUBDIRS:
        d = os.path.join(ART, sub)
        if os.path.isdir(d):
            on_disk += sorted(f"{sub}/{f}" for f in os.listdir(d)
                              if os.path.splitext(f)[1].lower() in MEDIA_EXT)
    for fn in on_disk:
        rec = assets.get(fn)
        if rec is None:
            failures.append(f"UNREGISTERED    {fn} is not in the manifest — untracked art cannot ship")
            continue

        kind = rec.get("kind", "unknown")
        chs = rec.get("characters", [])
        status = rec.get("status", "unknown")

        # Drift applies to EVERY registered file, not only identity plates.
        # A checksum that is recorded but never compared is decoration: the
        # theme, the teaser and the signature kit were all carrying one that
        # nothing checked. If a file is signed off, it must still be the file
        # that was signed off.
        if "sha256_16" not in rec:
            failures.append(f"UNCHECKSUMMED   {fn} is registered with no recorded checksum")
        elif rec["sha256_16"] != sha(os.path.join(ART, fn)):
            failures.append(f"DRIFT DETECTED  {fn} no longer matches its recorded checksum — "
                            "it was changed after sign-off")

        if kind == "character" or chs:
            is_plate = fn in identity_sources
            # Multi-character art declares one element per character, so accept a
            # list. A single element_id is just the one-character case of it.
            eids = rec.get("element_ids") or ([rec["element_id"]] if rec.get("element_id") else [])
            eid = eids[0] if eids else None
            prov = rec.get("provenance")

            # Every character in the frame must have been driven by an element.
            if eids and chs and len(eids) != len(chs):
                failures.append(f"ELEMENT GAP     {fn} declares {len(chs)} character(s) but only "
                                f"{len(eids)} element(s) — every character in frame needs its own lock")

            # A character asset must trace back to approved identity by ONE of:
            #   element_id   - generated with a locked element  (REQUIRED for new work)
            #   derived      - composited/derived from approved plates, no generation
            #   reference    - generated with an approved plate as image reference
            #   rejected     - kept only as a rejection record
            # Anything else is unprovenanced and blocks.
            if not is_plate:
                if eid:
                    for e in eids:
                        if e not in valid_elements:
                            failures.append(f"BAD ELEMENT     {fn} references unknown element_id {e}")
                elif prov in ("derived-from-approved-plates", "rejected-record"):
                    pass  # deterministic or explicitly quarantined
                elif prov == "approved-plate-as-reference":
                    warnings.append(f"REFERENCE-PROV  {fn} used plate-as-reference, not a locked element "
                                    f"(acceptable legacy; new work must use element_id)")
                elif status == "legacy-pre-system":
                    warnings.append(f"LEGACY          {fn} predates the element system — flagged for regeneration")
                else:
                    failures.append(f"NO PROVENANCE   {fn} declares characters with no traceable provenance")

            if not rec.get("verified_by") or not rec.get("verified_at"):
                failures.append(f"UNVERIFIED      {fn} has no recorded visual sign-off")

        rows.append((fn, kind, status, ",".join(chs) if chs else "-"))

    if report:
        print(f"\n  UNDERTOW ASSET VERIFICATION — canon v{canon['canon_version']}")
        print(f"  {len(on_disk)} media files · {len(chars)} characters locked\n")
        print(f"  {'FILE':<40} {'KIND':<12} {'STATUS':<20} CHARACTERS")
        print(f"  {'-'*40} {'-'*12} {'-'*20} {'-'*20}")
        for r in sorted(rows):
            print(f"  {r[0]:<40} {r[1]:<12} {r[2]:<20} {r[3]}")
        print()
        print("  CHARACTER ELEMENTS (identity locks):")
        for cid, c in chars.items():
            print(f"    {c['full_name']:<22} {c['element_id']}  {c['element_name']}")
            retired = ([c["retired_element_id"]] if c.get("retired_element_id") else []) \
                      + list(c.get("retired_element_ids", []))
            for r in retired:
                print(f"    {'':<22} {r}  (retired — still valid for existing art)")
        print()

    for w in warnings:
        print(f"  WARN  {w}")
    for f in failures:
        print(f"  FAIL  {f}")

    if failures:
        print(f"\n  ✗ VERIFICATION FAILED — {len(failures)} blocking issue(s)\n")
        return 1
    print(f"\n  ✓ VERIFICATION PASSED"
          + (f" — {len(warnings)} warning(s)" if warnings else "") + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(verify(report="--report" in sys.argv))
