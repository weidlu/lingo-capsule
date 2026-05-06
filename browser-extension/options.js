const providerSettingsKey = 'providerSettings';
const interactionSettingsKey = 'interactionSettings';

const defaults = {
  provider: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4.1-mini',
    wireApi: 'chat',
    systemPrompt: [
      'You are Lingo Capsule, a quiet English writing companion for bilingual professionals.',
      'Diagnose whether the user text is already natural English or needs improvement.',
      'Preserve the user intent. Do not over-formalize. Return concise Chinese explanations.',
      'If improvement is useful, provide at most two rewrites: one Casual and one Professional.',
      'If the text is already natural, return status native, no issues, and no suggestions.',
    ].join('\n'),
  },
  interaction: {
    triggerTokens: '~~, ～～',
    triggerMaxChars: 900,
  },
};

const form = document.querySelector('#settings-form');
const status = document.querySelector('#status');

async function loadSettings() {
  const stored = await chrome.storage.sync.get([providerSettingsKey, interactionSettingsKey]);
  const provider = {
    ...defaults.provider,
    ...(stored[providerSettingsKey] || {}),
  };
  const interaction = {
    ...defaults.interaction,
    ...(stored[interactionSettingsKey] || {}),
  };

  form.baseUrl.value = provider.baseUrl;
  form.apiKey.value = provider.apiKey;
  form.model.value = provider.model;
  form.wireApi.value = provider.wireApi === 'responses' ? 'responses' : 'chat';
  form.systemPrompt.value = provider.systemPrompt || defaults.provider.systemPrompt;
  form.triggerTokens.value = interaction.triggerTokens;
  form.triggerMaxChars.value = interaction.triggerMaxChars;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await chrome.storage.sync.set({
    [providerSettingsKey]: {
      baseUrl: form.baseUrl.value.trim() || defaults.provider.baseUrl,
      apiKey: form.apiKey.value.trim(),
      model: form.model.value.trim() || defaults.provider.model,
      wireApi: form.wireApi.value === 'responses' ? 'responses' : 'chat',
      systemPrompt: form.systemPrompt.value.trim() || defaults.provider.systemPrompt,
    },
    [interactionSettingsKey]: {
      triggerTokens: form.triggerTokens.value.trim() || defaults.interaction.triggerTokens,
      triggerMaxChars: Math.max(80, Math.min(4000, Number(form.triggerMaxChars.value) || defaults.interaction.triggerMaxChars)),
    },
  });
  status.textContent = 'Saved';
  window.setTimeout(() => {
    status.textContent = '';
  }, 1800);
});

loadSettings().catch((error) => {
  status.textContent = String(error?.message || error);
});
