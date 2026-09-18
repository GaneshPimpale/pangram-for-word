#!/usr/bin/env bash
# Sideloads the add-in into Word for Mac by dropping the manifest in Word's wef folder.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEF="$HOME/Library/Containers/com.microsoft.Word/Data/Documents/wef"
mkdir -p "$WEF"
cp "$DIR/manifest.xml" "$WEF/pangram-for-word.xml"
echo "Copied manifest to $WEF/pangram-for-word.xml"
echo "Now: quit and reopen Word, then Insert > Add-ins > My Add-ins > Pangram (or click Pangram on the Home tab)."
