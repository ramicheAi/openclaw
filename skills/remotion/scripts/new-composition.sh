#!/usr/bin/env bash
# Scaffold a new composition file from a template.
# usage: new-composition.sh <Name>
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_studio.sh"

NAME="${1:-}"
[ -n "$NAME" ] || { echo "usage: new-composition.sh <Name>" >&2; exit 1; }

STUDIO="$(studio_or_die)"
FILE="$STUDIO/src/compositions/${NAME}.tsx"
[ -e "$FILE" ] && { echo "already exists: $FILE" >&2; exit 1; }

# lowercase first char for the defaults export name
LC="$(printf '%s' "${NAME:0:1}" | tr '[:upper:]' '[:lower:]')${NAME:1}"

cat > "$FILE" <<EOF
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { BRAND } from "../brand";

export type ${NAME}Props = {
  title: string;
};

export const ${LC}Defaults: ${NAME}Props = {
  title: "${NAME}",
};

export const ${NAME}: React.FC<${NAME}Props> = ({ title }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: BRAND.gradient, justifyContent: "center", alignItems: "center" }}>
      <h1
        style={{
          fontFamily: BRAND.fonts.display,
          color: BRAND.colors.text,
          fontSize: 88,
          fontWeight: 800,
          opacity,
        }}
      >
        {title}
      </h1>
    </AbsoluteFill>
  );
};
EOF

echo "Created $FILE"
echo
echo "Next: register it in $STUDIO/src/Root.tsx, e.g.:"
echo "  import { ${NAME}, ${LC}Defaults } from \"./compositions/${NAME}\";"
echo "  <Composition id=\"${NAME}\" component={${NAME}} durationInFrames={90} fps={30}"
echo "    width={FORMATS.square45.width} height={FORMATS.square45.height} defaultProps={${LC}Defaults} />"
