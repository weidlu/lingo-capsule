export type CorrectionStatus = 'native' | 'needs_improvement' | 'blocked' | 'failed';

export type ToneLabel = 'Casual' | 'Professional';

export interface ProviderSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  wireApi?: 'chat' | 'responses';
}

export interface InteractionSettings {
  autoModeEnabled: boolean;
  autoDebounceMs: number;
  autoMinChars: number;
  triggerModeEnabled: boolean;
  triggerTokens: string;
  triggerMaxChars: number;
  manualHotkey: string;
  excludedApps: string;
  dailyReviewEnabled: boolean;
  dailyReviewTime: string;
}

export interface CorrectionIssue {
  title: string;
  explanationZh: string;
  excerpt?: string;
}

export interface CorrectionSuggestion {
  id: string;
  label: ToneLabel | string;
  rewrite: string;
  rationaleZh: string;
}

export interface CorrectionResult {
  status: CorrectionStatus;
  summaryZh: string;
  confidence: number;
  issues: CorrectionIssue[];
  suggestions: CorrectionSuggestion[];
}

export interface HistoryEntry {
  id: string;
  createdAt: number;
  sourceApp?: string;
  originalText: string;
  status: CorrectionStatus;
  summaryZh: string;
  issues: CorrectionIssue[];
  suggestions: CorrectionSuggestion[];
  acceptedSuggestionId?: string;
  acceptedRewrite?: string;
  acceptedAt?: number;
}

export interface HistoryInsertPayload {
  originalText: string;
  sourceApp?: string;
  status: CorrectionStatus;
  summaryZh: string;
  issues: CorrectionIssue[];
  suggestions: CorrectionSuggestion[];
}

export interface CorrectionPipelineState {
  phase: 'idle' | 'debouncing' | 'checking' | 'ready' | 'blocked' | 'failed';
  message: string;
  result?: CorrectionResult;
  historyEntry?: HistoryEntry;
  error?: string;
}

export const CORRECTION_RESPONSE_SCHEMA = {
  name: 'lingo_capsule_correction',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'summaryZh', 'confidence', 'issues', 'suggestions'],
    properties: {
      status: {
        type: 'string',
        enum: ['native', 'needs_improvement'],
      },
      summaryZh: {
        type: 'string',
        description: 'A concise Chinese summary of the diagnosis.',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
      },
      issues: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'explanationZh', 'excerpt'],
          properties: {
            title: { type: 'string' },
            explanationZh: { type: 'string' },
            excerpt: { type: 'string' },
          },
        },
      },
      suggestions: {
        type: 'array',
        minItems: 0,
        maxItems: 2,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'label', 'rewrite', 'rationaleZh'],
          properties: {
            id: { type: 'string' },
            label: { type: 'string', enum: ['Casual', 'Professional'] },
            rewrite: { type: 'string' },
            rationaleZh: { type: 'string' },
          },
        },
      },
    },
  },
  strict: true,
} as const;

const secureFieldHints = [
  'password',
  'passcode',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'privatekey',
  'private_key',
  'credential',
  '2fa',
  'otp',
  'verification code',
];

const secretValuePatterns = [
  /sk-[a-zA-Z0-9_-]{16,}/,
  /(?:api[_-]?key|token|secret|password)\s*[:=]\s*['"]?[^\s'"]{8,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b\d{6}\b/,
];

export function isSecureText(text: string, contextLabel = ''): boolean {
  const normalizedContext = contextLabel.toLowerCase().replace(/\s+/g, '');
  const normalizedText = text.toLowerCase();

  if (secureFieldHints.some((hint) => normalizedContext.includes(hint))) {
    return true;
  }

  if (secretValuePatterns.some((pattern) => pattern.test(text))) {
    return true;
  }

  const trimmed = text.trim();
  const hasWhitespace = /\s/.test(trimmed);
  const looksLikeSecret = trimmed.length >= 24 && !hasWhitespace && /[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed) && /\d/.test(trimmed);

  return looksLikeSecret || normalizedText.includes('password:') || normalizedText.includes('api key:');
}

export function normalizeProviderBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  return trimmed || 'https://api.openai.com/v1';
}

export function buildCorrectionPrompt(text: string): string {
  return [
    'You are Lingo Capsule, a quiet English writing companion for bilingual professionals.',
    'Diagnose whether the user text is already natural English or needs improvement.',
    'Preserve the user intent. Do not over-formalize. Return concise Chinese explanations.',
    'If improvement is useful, provide at most two rewrites: one Casual and one Professional.',
    'If the text is already natural, return status native, no issues, and no suggestions.',
    '',
    'User text:',
    text,
  ].join('\n');
}

export function coerceCorrectionResult(value: unknown): CorrectionResult {
  if (!value || typeof value !== 'object') {
    throw new Error('Provider returned an empty correction payload.');
  }

  const record = value as Partial<CorrectionResult>;
  const status = record.status === 'native' ? 'native' : 'needs_improvement';
  const suggestions = Array.isArray(record.suggestions) ? record.suggestions.slice(0, 2) : [];
  const issues = Array.isArray(record.issues) ? record.issues.slice(0, 3) : [];

  return {
    status,
    summaryZh: typeof record.summaryZh === 'string' && record.summaryZh.trim() ? record.summaryZh : '已完成英文自然度检查。',
    confidence: typeof record.confidence === 'number' ? Math.max(0, Math.min(1, record.confidence)) : 0.7,
    issues: issues.map((issue, index) => ({
      title: typeof issue.title === 'string' ? issue.title : `建议 ${index + 1}`,
      explanationZh: typeof issue.explanationZh === 'string' ? issue.explanationZh : '这句话可以更自然。',
      excerpt: typeof issue.excerpt === 'string' ? issue.excerpt : undefined,
    })),
    suggestions: suggestions.map((suggestion, index) => ({
      id: typeof suggestion.id === 'string' && suggestion.id.trim() ? suggestion.id : `suggestion-${index + 1}`,
      label: typeof suggestion.label === 'string' ? suggestion.label : index === 0 ? 'Casual' : 'Professional',
      rewrite: typeof suggestion.rewrite === 'string' ? suggestion.rewrite : '',
      rationaleZh: typeof suggestion.rationaleZh === 'string' ? suggestion.rationaleZh : '更贴近日常英语表达。',
    })).filter((suggestion) => suggestion.rewrite.trim()),
  };
}

export function demoCorrection(text: string): CorrectionResult {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const issues: CorrectionIssue[] = [];
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

  if (/\blet me know your thought\b/i.test(trimmed)) {
    issues.push({
      title: '固定表达更自然',
      explanationZh: '这里用复数 “thoughts” 更符合英文邮件和聊天习惯。',
      excerpt: 'your thought',
    });
    casual = casual.replace(/\blet me know your thought\b/gi, 'let me know what you think');
    professional = professional.replace(/\blet me know your thought\b/gi, 'please let me know your thoughts');
  }

  if (issues.length === 0 && lower.length > 0) {
    return {
      status: 'native',
      summaryZh: '这句话已经清楚自然，可以直接发送。',
      confidence: 0.74,
      issues: [],
      suggestions: [],
    };
  }

  return {
    status: 'needs_improvement',
    summaryZh:
      issues.length === 1
        ? '意思清楚，改一处会更自然。'
        : `意思清楚，改 ${Math.min(issues.length, 2)} 处会更自然。`,
    confidence: 0.82,
    issues,
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
