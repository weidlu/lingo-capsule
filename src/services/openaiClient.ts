import {
  buildCorrectionPrompt,
  coerceCorrectionResult,
  CORRECTION_RESPONSE_SCHEMA,
  CorrectionResult,
  demoCorrection,
  normalizeProviderBaseUrl,
  ProviderSettings,
} from '../domain/correction';
import { invoke } from '@tauri-apps/api/core';
import { canUseTauriCommands } from './tauriRuntime';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
      refusal?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

function extractJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('Provider did not return JSON.');
    }
    return JSON.parse(match[0]);
  }
}

export async function analyzeTextWithProvider(text: string, settings: ProviderSettings, signal?: AbortSignal): Promise<CorrectionResult> {
  if (canUseTauriCommands() && !settings.apiKey.trim()) {
    try {
      return coerceCorrectionResult(await invoke('provider_analyze_text', { text }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const notConfigured =
        message.includes('Provider settings are not configured') ||
        message.includes('Provider API key is not configured');

      if (!notConfigured) {
        throw error;
      }
    }
  }

  if (!settings.apiKey.trim()) {
    await new Promise((resolve) => window.setTimeout(resolve, 320));
    return demoCorrection(text);
  }

  const response = await fetch(`${normalizeProviderBaseUrl(settings.baseUrl)}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.model.trim() || 'gpt-4.1-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You return only structured JSON that matches the requested schema. Keep Chinese explanations concise and supportive.',
        },
        {
          role: 'user',
          content: buildCorrectionPrompt(text),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: CORRECTION_RESPONSE_SCHEMA,
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as ChatCompletionResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || `Provider request failed with HTTP ${response.status}.`);
  }

  const message = payload.choices?.[0]?.message;
  if (message?.refusal) {
    throw new Error(message.refusal);
  }

  if (!message?.content) {
    throw new Error('Provider returned no correction content.');
  }

  return coerceCorrectionResult(extractJson(message.content));
}
