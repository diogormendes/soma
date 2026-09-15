#!/usr/bin/env bash
# report-served-commit.sh: tell drlab which commit soma.gkos.dev is actually serving (soma#941).
#
#   scripts/report-served-commit.sh                      # asks https://soma.gkos.dev
#   scripts/report-served-commit.sh http://127.0.0.1:3456 # or any other soma
#
# Every production build of soma-personal failed for four days and the site went on serving
# four-day-old code (soma#938). The deploy script now waits for the production deployment of the
# merged commit, but that only fires on a merge: a check that runs on merge is silent for exactly
# as long as nobody merges. This runs hourly beside the sync, so a stale production becomes a fact
# on the record rather than four days of nothing.
#
# It asks the SERVER what it is running rather than asking Vercel what it deployed. Vercel knew a
# deployment existed; the gap was between the deployment existing and the alias serving it.
#
# Never fails the caller. A report is not worth breaking a sync run over.
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

BASE=${1:-https://soma.gkos.dev}
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

TOKEN=$(grep -E '^EXPO_PUBLIC_API_TOKEN=' "$HOME/.config/soma/app.env" 2>/dev/null | cut -d= -f2-)
[ -n "${TOKEN:-}" ] || exit 0   # no token, nothing to ask with

BODY=$(curl -s -m 15 -H "Authorization: Bearer $TOKEN" "$BASE/api/version" 2>/dev/null) || exit 0

# A session redirect answers with HTML, and an old deployment has no such route at all. Either way
# there is no commit to report, and reporting a guess would be worse than reporting nothing.
COMMIT=$(printf '%s' "$BODY" | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
c=d.get("commit")
if isinstance(c,str) and len(c)>=7: print(c[:7])
' 2>/dev/null)

[ -n "${COMMIT:-}" ] || { echo "report-served-commit: $BASE served no commit (route missing, or the gate turned us away)" >&2; exit 0; }

"$HERE/report-to-drlab.sh" served_commit "$COMMIT"
echo "served_commit $COMMIT ($BASE)"
exit 0
