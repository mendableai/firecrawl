#!/usr/bin/env bash

set -euo pipefail

ORIGIN=${ORIGIN:-origin}

bump=${1:-patch}

prerel=${2:-none}

if [[ $bump == "prerel" ]]; then
  bump="patch"
  prerel="prerel"
fi

if [[ $(git status --porcelain) != "" ]]; then
  echo "Error: repo is dirty. Run git status, clean repo and try again."
  exit 1
elif [[ $(git status --porcelain -b | grep -e "ahead" -e "behind") != "" ]]; then
  echo "Error: repo has unpushed commits. Push commits to remote and try again."
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$prerel" == "prerel" && "$BRANCH" != "prerelease" ]]; then
#  echo "❌ Sorry, you can only cut a pre-release from the 'prelease' branch"
#  echo "Run 'git checkout prerelease && git pull origin prerelease' and try again."
#  exit 1
  echo "⚠️ Pre-releases should be cut from the 'prerelease' branch"
  echo "Please make sure you're not overwriting someone else's prerelease!"
  echo
  read -p "Release anyway? " -n 1 -r
  echo
  if [[ $REPLY =~ ^[^Yy]$ ]]; then
    echo Aborting.
    exit 1
  fi
fi

if [[ "$prerel" != "prerel" && "$BRANCH" != "main" ]]; then
  echo "❌ Sorry, you can only cut a release from the 'main' branch"
  echo "Run 'git checkout main && git pull origin main' and try again."
  exit 1
fi

git fetch
if [[ "$(git rev-parse HEAD 2>&1)" != "$(git rev-parse '@{u}' 2>&1)" ]]; then
  echo "There are upstream commits that won't be included in this release."
  echo "You probably want to exit, run 'git pull', then release."
  echo
  read -p "Release anyway? " -n 1 -r
  echo
  if [[ $REPLY =~ ^[^Yy]$ ]]; then
    echo Aborting.
    exit 1
  fi
fi

dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

previous_version="$("$dir"/../scripts/version.sh -s)"

if [[ $prerel == "prerel" ]]; then
  prerelversion=$("$dir"/../scripts/semver get prerel "$previous_version")
  if [[ $prerelversion == "" ]]; then
    new_version=$("$dir"/../scripts/semver bump "$bump" "$previous_version")
    new_version=$("$dir"/../scripts/semver bump prerel pre-1 "$new_version")
  else
    prerel=pre-$((${prerelversion#pre-} + 1))
    new_version=$("$dir"/../scripts/semver bump prerel "$prerel" "$previous_version")
  fi
else
  prerelversion=$("$dir"/../scripts/semver get prerel "$previous_version")
  if [[ $prerelversion == "" ]]; then
    new_version=$("$dir"/../scripts/semver bump "$bump" "$previous_version")
  else
    new_version=${previous_version//-$prerelversion/}
  fi
fi

new_version="v$new_version"

echo "Bumping version from v${previous_version} to ${new_version}"

read -p "Are you sure? " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
  git tag -m "release ${new_version}" -a "$new_version" && git push "${ORIGIN}" tag "$new_version"
  echo "done"
fi
