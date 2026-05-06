#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:-src-tauri/target/release/bundle/macos/LingoCapsule.app}"
IDENTIFIER="com.lingocapsule.desktop"
IDENTITY="${LINGO_CAPSULE_CODESIGN_IDENTITY:-LingoCapsule Local Dev}"
SIGN_DIR="${HOME}/Library/Application Support/${IDENTIFIER}/codesign"
KEYCHAIN="${LINGO_CAPSULE_CODESIGN_KEYCHAIN:-${SIGN_DIR}/lingo-capsule-dev.keychain-db}"
PASS_FILE="${LINGO_CAPSULE_CODESIGN_PASS_FILE:-${SIGN_DIR}/keychain.pass}"

if [[ ! -d "${APP_PATH}" ]]; then
  echo "App bundle not found: ${APP_PATH}" >&2
  exit 1
fi

CERT_HASH=""
if [[ -f "${KEYCHAIN}" ]]; then
  if [[ -f "${PASS_FILE}" ]]; then
    security unlock-keychain -p "$(cat "${PASS_FILE}")" "${KEYCHAIN}" >/dev/null 2>&1 || true
  fi

  CERT_HASH="$(
    security find-identity -v -p codesigning "${KEYCHAIN}" 2>/dev/null \
      | awk -v identity="${IDENTITY}" 'index($0, "\"" identity "\"") { print $2; exit }'
  )"
fi

if [[ -n "${CERT_HASH}" ]]; then
  codesign \
    --force \
    --deep \
    --keychain "${KEYCHAIN}" \
    --sign "${CERT_HASH}" \
    --identifier "${IDENTIFIER}" \
    "${APP_PATH}"

  SIGNATURE_DETAILS="$(codesign -dv --verbose=4 "${APP_PATH}" 2>&1)"
  if ! grep -Fq "Authority=${IDENTITY}" <<<"${SIGNATURE_DETAILS}"; then
    echo "App bundle was not signed by expected identity: ${IDENTITY}" >&2
    exit 1
  fi

  echo "Signed ${APP_PATH} with local certificate identity: ${IDENTITY}"
else
  REQUIREMENT="=designated => identifier \"${IDENTIFIER}\""

  codesign \
    --force \
    --deep \
    --sign - \
    --identifier "${IDENTIFIER}" \
    --requirements "${REQUIREMENT}" \
    "${APP_PATH}"

  REQUIREMENT_DETAILS="$(codesign -d -r- "${APP_PATH}" 2>&1)"
  if ! grep -q "designated => identifier \"${IDENTIFIER}\"" <<<"${REQUIREMENT_DETAILS}"; then
    echo "App bundle did not keep the stable designated requirement." >&2
    exit 1
  fi

  echo "Signed ${APP_PATH} with ad-hoc stable local requirement: ${IDENTIFIER}"
fi

codesign --verify --deep --strict "${APP_PATH}"
