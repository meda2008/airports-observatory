#!/usr/bin/env bash
set -euo pipefail
umask 077
base=$(realpath "${1:?project root required}")
builder=${2:?dedicated builder required}
minimum_gib=${3:-4}
[[ "$minimum_gib" =~ ^[1-9][0-9]?$ ]] || exit 60
[[ -f "$base/.owned-builder-name" ]] || { echo 'Missing explicit project builder ownership marker'; exit 61; }
[[ $(cat "$base/.owned-builder-name") == "$builder" ]] || { echo 'Builder ownership mismatch'; exit 62; }
required=$((minimum_gib*1024*1024))
available_kib(){ df -Pk "$base" | awk 'NR==2 {print $4}'; }
before=$(available_kib)
printf 'project_space_before_kib=%s minimum_kib=%s\n' "$before" "$required"
if (( before < required )); then
  # Only the explicitly owned buildkit instance, never images, volumes or other builders.
  sudo -n "$base/tools/docker-buildx" inspect "$builder" --bootstrap
  sudo -n "$base/tools/docker-buildx" prune --builder "$builder" --all --force --max-used-space 2GB --reserved-space 2GB
fi
after=$(available_kib)
printf 'project_space_after_kib=%s\n' "$after"
(( after >= required )) || { echo 'Insufficient space: stop before image build or service cutover'; exit 63; }
