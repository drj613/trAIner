#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
d2_bin="${D2_BINARY:-d2}"
if ! command -v "$d2_bin" >/dev/null 2>&1; then
  echo 'D2 is required. See docs/user-flows/README.md for setup.' >&2
  exit 1
fi
if [[ "$("$d2_bin" version)" != 'v0.9.0' ]]; then
  echo 'Use D2 v0.9.0 so generated SVGs stay consistent.' >&2
  exit 1
fi

mkdir -p docs/user-flows/rendered
for source in docs/user-flows/*.d2; do
  [[ "$source" == */style.d2 ]] && continue
  "$d2_bin" --layout=elk --theme=0 --pad=40 --bundle --omit-version \
    "$source" "docs/user-flows/rendered/$(basename "${source%.d2}").svg"
done
