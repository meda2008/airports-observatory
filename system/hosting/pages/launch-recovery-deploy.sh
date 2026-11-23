#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $# -eq 3 ]] || { echo 'usage: launch-recovery-deploy.sh PROJECT_ROOT PATCH_ID RELEASE_ID' >&2; exit 64; }
root=$(realpath -e -- "$1")
[[ $2 =~ ^[A-Za-z0-9_-]+$ && $3 =~ ^[A-Za-z0-9_-]+$ ]] || exit 64
patch=$(realpath -e -- "$root/patches/$2")
[[ $patch == "$root/patches/"* ]] || exit 65
release="$root/releases/$3"
# Never truncate an earlier deployment log or run a frozen release twice.
if [[ -e "$release" ]]; then printf 'not_launched_release_exists %s\n' "$release"; exit 0; fi
exec 9>"$patch/.launch.lock"
flock -n 9 || { echo 'not_launched_another_launcher_holds_lock'; exit 0; }
if [[ -e "$patch/.launch.requested" ]]; then echo 'not_launched_prior_attempt_requires_status_inspection'; exit 0; fi
script=$(realpath -e -- "$patch/deploy.sh")
[[ $script == "$patch/deploy.sh" && -f "$script" ]] || exit 65
# Validate before recording launch intent: shell syntax alone does not reject CRLF option names.
python3 - "$script" <<'PY_FORMAT'
import sys
from pathlib import Path
data=Path(sys.argv[1]).read_bytes()
if b'\r' in data or data.startswith(b'\xef\xbb\xbf') or not data.startswith(b'#!/usr/bin/env bash\n'):
    raise SystemExit('deploy_script_requires_utf8_lf_without_bom')
PY_FORMAT
bash -n -- "$script"
# Fail before launch when accumulated overlay metadata would approach mount limits.
# This does not delete images or flatten a running service automatically.
if [[ -f "$patch/Dockerfile.overlay" ]]; then
  parent=$(awk 'toupper($1)=="FROM" {print $2;exit}' "$patch/Dockerfile.overlay")
  [[ $parent =~ ^[A-Za-z0-9][A-Za-z0-9._:/@-]+$ ]] || exit 66
  layers=$(docker image inspect "$parent" --format '{{len .RootFS.Layers}}')
  [[ $layers =~ ^[0-9]+$ ]] || exit 66
  if (( layers > 192 )); then
    printf 'not_launched_parent_layer_budget_exceeded layers=%s limit=192; retain old service and prepare a verified flat base\n' "$layers" >&2
    exit 66
  fi
fi
set -o noclobber
printf '%s\n' "$(date -u +%FT%TZ)" > "$patch/.launch.requested"
log="$patch/deploy-$(date -u +%Y%m%dT%H%M%S)-$BASHPID.log"
nohup bash -c 'set +e; bash "$1"; code=$?; printf "%s\n" "$code" > "$2/deploy.process.exit"; exit "$code"' airports-deploy-runner "$script" "$patch" > "$log" 2>&1 < /dev/null &
pid=$!
printf '%s\n' "$pid" > "$patch/deploy.launch.pid"
printf 'launched pid=%s log=%s\n' "$pid" "$log"
