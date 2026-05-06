const providerSettingsKey = 'providerSettings';
const interactionSettingsKey = 'interactionSettings';

const defaultProviderSettings = {
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
};

const defaultInteractionSettings = {
  triggerTokens: '~~, ～～',
  triggerMaxChars: 900,
};

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || defaultProviderSettings.baseUrl).trim().replace(/\/+$/, '');
}

function normalizeWireApi(wireApi) {
  return wireApi === 'responses' ? 'responses' : 'chat';
}

function buildPrompt(text, settings = defaultProviderSettings) {
  return [
    settings.systemPrompt?.trim() || defaultProviderSettings.systemPrompt,
    '',
    'User text:',
    text,
  ].join('\n');
}

function demoCorrection(text) {
  const trimmed = text.trim();
  const issues = [];
  let casual = trimmed;
  let professional = trimmed;

  if (/\bi am agree\b/i.test(trimmed)) {
    issues.push({
      title: '动词搭配不自然',
      explanationZh: '“agree” 本身是动词，不需要和 “am” 连用。',
      excerpt: 'I am agree',
    });
    casual = casual.replace(/\bi am agree\b/gi, 'I agree');
    professional = professional.replace(/\bi am agree\b/gi, 'I agree');
  }

  if (/\bdiscuss about\b/i.test(trimmed)) {
    issues.push({
      title: '及物动词用法',
      explanationZh: '“discuss” 后面可以直接接对象，通常不加 “about”。',
      excerpt: 'discuss about',
    });
    casual = casual.replace(/\bdiscuss about\b/gi, 'discuss');
    professional = professional.replace(/\bdiscuss about\b/gi, 'discuss');
  }

  if (/\bhappend\b/i.test(trimmed)) {
    issues.push({
      title: '拼写错误',
      explanationZh: '“happend” 少了一个 “e”，正确拼写是 “happened”。',
      excerpt: 'happend',
    });
    casual = casual.replace(/\bhappend\b/gi, 'happened');
    professional = professional.replace(/\bhappend\b/gi, 'happened');
  }

  if (/\bbasicly\b/i.test(trimmed)) {
    issues.push({
      title: '拼写错误',
      explanationZh: '“basicly” 应该写成 “basically”。',
      excerpt: 'basicly',
    });
    casual = casual.replace(/\bbasicly\b/gi, 'basically');
    professional = professional.replace(/\bbasicly\b/gi, 'basically');
  }

  if (issues.length === 0) {
    return {
      status: 'native',
      summaryZh: '这句话已经清楚自然，可以直接发送。',
      confidence: 0.72,
      issues: [],
      suggestions: [],
    };
  }

  return {
    status: 'needs_improvement',
    summaryZh: issues.length === 1 ? '意思清楚，改一处会更自然。' : `意思清楚，改 ${Math.min(issues.length, 2)} 处会更自然。`,
    confidence: 0.82,
    issues: issues.slice(0, 3),
    suggestions: [
      {
        id: 'casual',
        label: 'Casual',
        rewrite: casual,
        rationaleZh: '保留原意，适合聊天或快速协作场景。',
      },
      {
        id: 'professional',
        label: 'Professional',
        rewrite: professional,
        rationaleZh: '语气更稳妥，适合工作消息或邮件。',
      },
    ],
  };
}

function coerceCorrectionResult(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Provider returned an empty correction payload.');
  }

  const suggestions = Array.isArray(value.suggestions) ? value.suggestions.slice(0, 2) : [];
  const issues = Array.isArray(value.issues) ? value.issues.slice(0, 3) : [];

  return {
    status: value.status === 'native' ? 'native' : 'needs_improvement',
    summaryZh: typeof value.summaryZh === 'string' && value.summaryZh.trim() ? value.summaryZh : '已完成英文自然度检查。',
    confidence: typeof value.confidence === 'number' ? Math.max(0, Math.min(1, value.confidence)) : 0.7,
    issues: issues.map((issue, index) => ({
      title: typeof issue.title === 'string' ? issue.title : `建议 ${index + 1}`,
      explanationZh: typeof issue.explanationZh === 'string' ? issue.explanationZh : '这句话可以更自然。',
      excerpt: typeof issue.excerpt === 'string' ? issue.excerpt : '',
    })),
    suggestions: suggestions
      .map((suggestion, index) => ({
        id: typeof suggestion.id === 'string' && suggestion.id.trim() ? suggestion.id : `suggestion-${index + 1}`,
        label: typeof suggestion.label === 'string' ? suggestion.label : index === 0 ? 'Casual' : 'Professional',
        rewrite: typeof suggestion.rewrite === 'string' ? suggestion.rewrite : '',
        rationaleZh: typeof suggestion.rationaleZh === 'string' ? suggestion.rationaleZh : '更贴近日常英语表达。',
      }))
      .filter((suggestion) => suggestion.rewrite.trim()),
  };
}

async function getStoredSettings() {
  const stored = await chrome.storage.sync.get([providerSettingsKey, interactionSettingsKey]);
  return {
    provider: {
      ...defaultProviderSettings,
      ...(stored[providerSettingsKey] || {}),
    },
    interaction: {
      ...defaultInteractionSettings,
      ...(stored[interactionSettingsKey] || {}),
    },
  };
}

async function analyzeWithProvider(text, settings) {
  if (!settings.apiKey?.trim()) {
    return demoCorrection(text);
  }

  const wireApi = normalizeWireApi(settings.wireApi);
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const model = settings.model?.trim() || defaultProviderSettings.model;
  const response = await fetch(`${baseUrl}/${wireApi === 'responses' ? 'responses' : 'chat/completions'}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify(
      wireApi === 'responses'
        ? {
            model,
            input: [
              {
                role: 'system',
                content: 'Return only JSON with status, summaryZh, confidence, issues, and suggestions. Keep Chinese explanations concise and supportive.',
              },
              {
                role: 'user',
                content: buildPrompt(text, settings),
              },
            ],
            text: {
              format: { type: 'json_object' },
            },
          }
        : {
            model,
            temperature: 0.2,
            messages: [
              {
                role: 'system',
                content: 'Return only JSON with status, summaryZh, confidence, issues, and suggestions. Keep Chinese explanations concise and supportive.',
              },
              {
                role: 'user',
                content: buildPrompt(text, settings),
              },
            ],
            response_format: { type: 'json_object' },
          },
    ),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `Provider request failed with HTTP ${response.status}.`);
  }

  const content =
    wireApi === 'responses'
      ? extractResponsesOutputText(payload)
      : payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Provider returned no correction content.');
  }

  const match = content.match(/\{[\s\S]*\}/);
  return coerceCorrectionResult(JSON.parse(match ? match[0] : content));
}

function extractResponsesOutputText(payload) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        return content.text;
      }
      if (content.type === 'text' && typeof content.text === 'string') {
        return content.text;
      }
    }
  }

  return '';
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'get-settings') {
    getStoredSettings()
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === 'analyze-text') {
    getStoredSettings()
      .then(({ provider }) => analyzeWithProvider(message.text || '', provider))
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  return false;
});
