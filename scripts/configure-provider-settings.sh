#!/usr/bin/env bash
set -euo pipefail

IDENTIFIER="com.lingocapsule.desktop"
CONFIG_DIR="${HOME}/Library/Application Support/${IDENTIFIER}"
CONFIG_PATH="${CONFIG_DIR}/provider-settings.json"

BASE_URL="${LINGO_CAPSULE_PROVIDER_BASE_URL:-https://sub.slnt.dev}"
MODEL="${LINGO_CAPSULE_PROVIDER_MODEL:-gpt-5.4-mini}"
WIRE_API="${LINGO_CAPSULE_PROVIDER_WIRE_API:-responses}"
API_KEY="${LINGO_CAPSULE_PROVIDER_API_KEY:-}"

if [[ -z "${API_KEY}" ]]; then
  printf "OpenAI-compatible API key: " >&2
  read -r -s API_KEY
  printf "\n" >&2
fi

if [[ -z "${API_KEY}" ]]; then
  echo "No API key provided." >&2
  exit 1
fi

mkdir -p "${CONFIG_DIR}"
chmod 700 "${CONFIG_DIR}"

CONFIG_PATH="${CONFIG_PATH}" \
BASE_URL="${BASE_URL}" \
MODEL="${MODEL}" \
WIRE_API="${WIRE_API}" \
API_KEY="${API_KEY}" \
node <<'NODE'
const fs = require('node:fs');

const configPath = process.env.CONFIG_PATH;
const settings = {
  baseUrl: process.env.BASE_URL || 'https://sub.slnt.dev',
  apiKey: process.env.API_KEY || '',
  model: process.env.MODEL || 'gpt-5.4-mini',
  wireApi: process.env.WIRE_API || 'responses',
};

fs.writeFileSync(configPath, `${JSON.stringify(settings, null, 2)}\n`, {
  mode: 0o600,
});
NODE

chmod 600 "${CONFIG_PATH}"

echo "Wrote provider settings to ${CONFIG_PATH}"
echo "Restart LingoCapsule for the packaged app to pick up the new provider."
