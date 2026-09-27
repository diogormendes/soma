#!/usr/bin/env bash
# sync-health.sh — T5 of the plan: OBSERVE the sync pipeline's health, never assume it.
#
# "Silence is the enemy." Exit 0 = healthy, 1 = unhealthy, 2 = could not determine.
# Read-only: it only lists GitHub Actions runs. It never touches the pipeline.
#
# Thresholds derive from the OBSERVED cadence, not the declared cron (docs: GitHub drops
# scheduled runs under load; sync.yml declares */30min but delivers ~2.5–5 h, 24/24 success
# on 2026-09-03). Override with SYNC_MAX_AGE_H / BRIDGE_MAX_AGE_H if the cadence changes.
set -uo pipefail
GH=${GH:-/opt/homebrew/bin/gh}
REPO=drkostas/soma
SYNC_MAX_AGE_H="${SYNC_MAX_AGE_H:-6}"      # sync.yml: observed ~3 h between successes
BRIDGE_MAX_AGE_H="${BRIDGE_MAX_AGE_H:-18}" # strava-bridge-ts.yml runs 11/15/19 UTC → the overnight gap is 16 h; 12 h false-alarmed every morning
SYNC_LOCAL_LOG="${SYNC_LOCAL_LOG:-$HOME/Library/Logs/soma/sync-local.log}"
GH_TRIES="${GH_TRIES:-3}"
GH_RETRY_SLEEP="${GH_RETRY_SLEEP:-20}"

# One failed gh call used to become two alarms with no cause attached (#1117). On 2026-09-27 at
# 11:00 gh failed for a moment that nothing else on the machine noticed, and every call here threw
# its error away with 2>/dev/null, so the message could only guess "auth? network?". Retry, and
# keep the first line of what gh said. The error goes to a file because gh_retry runs inside $(...).
GH_ERR_FILE="$(mktemp)"
trap 'rm -f "$GH_ERR_FILE"' EXIT
gh_retry() {
  local i
  for ((i = 1; i <= GH_TRIES; i++)); do
    if "$GH" "$@" 2>"$GH_ERR_FILE"; then return 0; fi
    case "$(gh_err)" in *"was not found"*) return 1 ;; esac   # an answer, not a blip
    [ "$i" -lt "$GH_TRIES" ] && sleep "$GH_RETRY_SLEEP"
  done
  return 1
}
gh_err() { head -1 "$GH_ERR_FILE" 2>/dev/null | cut -c1-160; }

check() { # name workflow max_age_h
  local name="$1" wf="$2" max="$3" json
  json="$(gh_retry run list --repo "$REPO" --workflow "$wf" --limit 8 --json status,conclusion,createdAt)" \
    || { echo "UNKNOWN $name: gh run list failed $GH_TRIES times: $(gh_err)"; return 2; }
  # JSON goes in as an ARGUMENT. Two stdin redirects once made python execute the JSON
  # (a valid literal) as its script and exit 0 with no output — a green check over a hole.
  python3 - "$name" "$max" "$json" <<'PY'
import json,sys,datetime as dt
name,max_h=sys.argv[1],float(sys.argv[2]); rows=json.loads(sys.argv[3])
now=dt.datetime.now(dt.timezone.utc)
ok=[r for r in rows if r["status"]=="completed" and r["conclusion"]=="success"]
bad=[r for r in rows if r["status"]=="completed" and r["conclusion"] not in ("success",None)]
if not rows: print(f"UNKNOWN {name}: no runs returned"); sys.exit(2)
if not ok: print(f"UNHEALTHY {name}: no successful run in the last {len(rows)}"); sys.exit(1)
t=dt.datetime.fromisoformat(ok[0]["createdAt"].replace("Z","+00:00")); age_h=(now-t).total_seconds()/3600
latest=rows[0]
if age_h>max_h:
    print(f"UNHEALTHY {name}: last success {age_h:.1f} h ago (> {max_h:g} h); latest run {latest['status']}/{latest['conclusion']}"); sys.exit(1)
extra=f"; {len(bad)} non-success in last {len(rows)}" if bad else ""
print(f"OK {name}: last success {age_h:.1f} h ago (limit {max_h:g} h){extra}"); sys.exit(0)
PY
}

check_local_sync() { # name max_age_h
  # The pipeline's own record of what it did, judged by the status it recorded and NOT by the
  # exit code: it has written thousands of records and exited 0 while garmin-ingest had been
  # dead for 38 hours, and only the recorded status showed `partial`. Counting `success` alone
  # means a `partial` that never recovers ages into a failure on its own.
  local name="$1" max="$2"
  [ -r "$SYNC_LOCAL_LOG" ] || { echo "UNKNOWN $name: local run log $SYNC_LOCAL_LOG is missing or unreadable"; return 2; }
  python3 - "$name" "$max" "$SYNC_LOCAL_LOG" <<'PY'
import re,sys,datetime as dt
name,max_h,path=sys.argv[1],float(sys.argv[2]),sys.argv[3]
START=re.compile(r'^=== (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \S+ sync starting ===')
REC=re.compile(r'^\[sync\] run recorded: (\w+)')
runs, started = [], None      # runs: [(started_at, status)] in file order
for line in open(path, errors="replace"):
    m = START.match(line)
    if m:
        started = dt.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S").astimezone()
        continue
    m = REC.match(line)
    if m and started is not None:
        runs.append((started, m.group(1))); started = None
if not runs:
    print(f"UNKNOWN {name}: no completed run found in {path}"); sys.exit(2)
recent = runs[-8:]
ok = [r for r in recent if r[1] == "success"]
bad = [r for r in recent if r[1] != "success"]
if not ok:
    print(f"UNHEALTHY {name}: no successful run in the last {len(recent)} (local)"); sys.exit(1)
age_h = (dt.datetime.now().astimezone() - ok[-1][0]).total_seconds() / 3600
if age_h > max_h:
    print(f"UNHEALTHY {name}: last success {age_h:.1f} h ago (> {max_h:g} h); last run recorded {recent[-1][1]} (local)"); sys.exit(1)
extra = f"; {len(bad)} non-success in last {len(recent)}" if bad else ""
print(f"OK {name}: last success {age_h:.1f} h ago (limit {max_h:g} h){extra} (local)"); sys.exit(0)
PY
}

# Where the pipeline runs decides where its health can be read. sync.yml keeps its schedule so
# forks still work, but skips the job on this instance when PIPELINE_RUNS_LOCALLY is set, because
# two schedulers against one database would duplicate every step. Checking Actions here anyway
# reported "last success 23.5 h ago" and grew by an hour every hour, with no state the pipeline
# could reach that would clear it. Mirror the workflow's own condition rather than restate it.
#
# A variable that is not set is an answer (a fork, so read Actions). A lookup that FAILED is not:
# it used to fall through to Actions too, which on this instance reports a pipeline that does not
# run there (#1117). Only gh's own "was not found" counts as unset.
LOOKUP_FAILED=""
if PIPELINE_RUNS_LOCALLY="$(gh_retry variable get PIPELINE_RUNS_LOCALLY --repo "$REPO")"; then
  :
else
  PIPELINE_RUNS_LOCALLY=""
  case "$(gh_err)" in
    *"was not found"*) ;;
    *) LOOKUP_FAILED="$(gh_err)"; [ -n "$LOOKUP_FAILED" ] || LOOKUP_FAILED="gh exited non-zero with no message" ;;
  esac
fi

rc=0
if [ -n "$LOOKUP_FAILED" ]; then
  echo "UNKNOWN sync-pipeline: could not read PIPELINE_RUNS_LOCALLY after $GH_TRIES tries, so it is not known where the pipeline runs: $LOOKUP_FAILED"
  rc=2
elif [ "$PIPELINE_RUNS_LOCALLY" = "true" ]; then
  check_local_sync "sync-pipeline" "$SYNC_MAX_AGE_H"; r=$?; [ $r -gt $rc ] && rc=$r
else
  check "sync-pipeline" "sync.yml" "$SYNC_MAX_AGE_H"; r=$?; [ $r -gt $rc ] && rc=$r
fi
check "strava-bridge"  "strava-bridge-ts.yml" "$BRIDGE_MAX_AGE_H"; r=$?; [ $r -gt $rc ] && rc=$r
exit $rc
