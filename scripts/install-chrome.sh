#!/usr/bin/env bash
# Installs Chrome for Testing for the conformance jobs, and prints its path.
#
#   scripts/install-chrome.sh stable     the current stable major
#   scripts/install-chrome.sh previous   the major before it
#
# A major listed in CHROME_BROKEN ("155 158") has a Chrome bug that fails the
# suite whatever Dappress does. It is skipped: for the stable major, the next
# one is tested (the beta, which has the fix); for the previous, the one before.
# Remove a major from the list once Chrome stable has moved past it.
set -euo pipefail

versions=$(curl -fsS https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json)
stable=$(jq -r .channels.Stable.version <<<"$versions" | cut -d. -f1)
beta=$(jq -r .channels.Beta.version <<<"$versions" | cut -d. -f1)
broken=" ${CHROME_BROKEN:-} "

case "${1:-stable}" in
  stable)
    release=$stable
    if [[ $broken == *" $release "* ]]; then
      echo "::notice::Chrome $release is in CHROME_BROKEN: testing Chrome $beta, the beta, in its place" >&2
      release=$beta
    fi
    ;;
  previous)
    release=$((stable - 1))
    while [[ $broken == *" $release "* ]]; do
      echo "::notice::Chrome $release is in CHROME_BROKEN: testing Chrome $((release - 1)) in its place" >&2
      release=$((release - 1))
    done
    ;;
  *)
    echo "::error::Expected stable or previous, not $1" >&2
    exit 1
    ;;
esac

# The download fails now and then (ECONNRESET): three tries, and a failure
# rather than an empty browser path for Cypress
path=''
for attempt in 1 2 3; do
  path=$(npx --yes @puppeteer/browsers@3 install "chrome@$release" --path "$RUNNER_TEMP/browsers" --format '{{path}}' | tail -n 1) && [ -x "$path" ] && break
  echo "Chrome for Testing did not install (attempt $attempt)" >&2
  path=''
  sleep 15
done
[ -x "$path" ] || { echo "::error::Chrome for Testing $release could not be installed" >&2; exit 1; }
"$path" --version >&2
echo "$path"
