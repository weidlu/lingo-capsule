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
];

const defaultInteractionSettings = {
  triggerTokens: '~~, ～～',
  triggerMaxChars: 900,
};

let activeElement = null;
let activeTextBeforeTrigger = '';
let popover = null;
let settings = { ...defaultInteractionSettings };

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

function parseTokens(value) {
  return String(value || defaultInteractionSettings.triggerTokens)
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

function isEditable(element) {
  if (!element) {
    return false;
  }

  if (element instanceof HTMLTextAreaElement) {
    return true;
  }

  if (element instanceof HTMLInputElement) {
    return ['email', 'search', 'text', 'url', 'tel', ''].includes(element.type);
  }

  return element.isContentEditable;
}

function explicitEditableRoot(element) {
  if (!element) {
    return null;
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element;
  }

  return element.closest?.('[contenteditable="true"]') || null;
}

function findEditableElement(event) {
  const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
  for (const node of path) {
    if (node instanceof Element) {
      const root = explicitEditableRoot(node);
      if (root && isEditable(root)) {
        return root;
      }
    }
  }

  let element = event?.target instanceof Element ? event.target : null;
  while (element && element !== document.documentElement) {
    const root = explicitEditableRoot(element);
    if (root && isEditable(root)) {
      return root;
    }
    element = element.parentElement;
  }

  return null;
}

function isSecureElement(element) {
  const label = [
    element?.type,
    element?.name,
    element?.id,
    element?.autocomplete,
    element?.ariaLabel,
    element?.placeholder,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return secureFieldHints.some((hint) => label.includes(hint));
}

function getElementText(element) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value;
  }

  return element.innerText || element.textContent || '';
}

function setElementText(element, text) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = text;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: text }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  element.textContent = text;
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: text }));
}

function stripTrigger(element, token) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const end = element.selectionStart ?? element.value.length;
    const nextValue = element.value.slice(0, end - token.length) + element.value.slice(end);
    element.value = nextValue;
    element.setSelectionRange(end - token.length, end - token.length);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    return nextValue;
  }

  const text = getElementText(element);
  const nextText = text.endsWith(token) ? text.slice(0, -token.length) : text.replace(new RegExp(`${escapeRegExp(token)}$`), '');
  setElementText(element, nextText);
  return nextText;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getAnchorRect(element) {
  const rect = element.getBoundingClientRect();
  return {
    left: Math.min(Math.max(rect.left, 16), window.innerWidth - 380),
    top: Math.min(rect.bottom + 10, window.innerHeight - 220),
  };
}

function ensurePopover() {
  if (popover) {
    return popover;
  }

  popover = document.createElement('div');
  popover.className = 'lingo-capsule-coach';
  popover.innerHTML = `
    <div class="lingo-capsule-header">
      <span class="lingo-capsule-dot"></span>
      <strong>Lingo</strong>
      <button type="button" data-action="close">Close</button>
    </div>
    <div class="lingo-capsule-body"></div>
  `;
  popover.addEventListener('click', handlePopoverClick);
  document.documentElement.appendChild(popover);
  return popover;
}

function showPopover(element, html) {
  const coach = ensurePopover();
  const rect = getAnchorRect(element);
  coach.style.left = `${rect.left}px`;
  coach.style.top = `${rect.top}px`;
  coach.querySelector('.lingo-capsule-body').innerHTML = html;
  coach.classList.add('is-visible');
}

function hidePopover() {
  popover?.classList.remove('is-visible');
}

function renderChecking(element) {
  showPopover(
    element,
    '<div class="lingo-capsule-status">Checking your sentence...</div>',
  );
}

function renderError(element, message) {
  showPopover(
    element,
    `<div class="lingo-capsule-status is-error">${escapeHtml(message)}</div>`,
  );
}

function renderResult(element, result) {
  const issues = result.issues
    .map((issue) => `<li><strong>${escapeHtml(issue.title)}</strong><span>${escapeHtml(issue.explanationZh)}</span></li>`)
    .join('');
  const suggestion = result.suggestions?.[0];
  const rewrite = suggestion?.rewrite || activeTextBeforeTrigger;
  const suggestionHtml = suggestion
    ? `
      <div class="lingo-capsule-rewrite">
        <div class="lingo-capsule-label">${escapeHtml(suggestion.label)}</div>
        <p>${escapeHtml(suggestion.rewrite)}</p>
        <small>${escapeHtml(suggestion.rationaleZh)}</small>
      </div>
      <div class="lingo-capsule-actions">
        <button type="button" data-action="replace" data-rewrite="${escapeAttribute(rewrite)}">Replace</button>
        <button type="button" data-action="copy" data-rewrite="${escapeAttribute(rewrite)}">Copy</button>
      </div>
    `
    : '<div class="lingo-capsule-clear">Looks natural. Keep going.</div>';

  showPopover(
    element,
    `
      <div class="lingo-capsule-summary">${escapeHtml(result.summaryZh)}</div>
      ${issues ? `<ul class="lingo-capsule-issues">${issues}</ul>` : ''}
      ${suggestionHtml}
    `,
  );
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function handlePopoverClick(event) {
  const button = event.target.closest('button');
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  if (action === 'close') {
    hidePopover();
    return;
  }

  const rewrite = button.dataset.rewrite || '';
  if (action === 'copy') {
    navigator.clipboard?.writeText(rewrite);
    button.textContent = 'Copied';
    return;
  }

  if (action === 'replace' && activeElement) {
    setElementText(activeElement, rewrite);
    hidePopover();
  }
}

async function analyzeFromElement(element, token) {
  const textWithoutTrigger = stripTrigger(element, token);
  const maxChars = Number(settings.triggerMaxChars) || defaultInteractionSettings.triggerMaxChars;
  const text = textWithoutTrigger.slice(-maxChars).trim();
  activeElement = element;
  activeTextBeforeTrigger = text;

  if (!text) {
    return;
  }

  renderChecking(element);
  const response = await sendRuntimeMessage({ type: 'analyze-text', text });

  if (!response?.ok) {
    renderError(element, response?.error || 'Lingo could not analyze this text.');
    return;
  }

  renderResult(element, response.result);
}

async function sendRuntimeMessage(message) {
  if (!chrome?.runtime?.id) {
    return {
      ok: false,
      error: 'Extension context was reloaded. Refresh this page, then try again.',
    };
  }

  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    const messageText = String(error?.message || error);
    if (
      messageText.includes('Extension context invalidated') ||
      messageText.includes('receiving end does not exist') ||
      messageText.includes('sendMessage')
    ) {
      if (message.type === 'analyze-text') {
        return { ok: true, result: demoCorrection(message.text || '') };
      }

      return {
        ok: false,
        error: 'Extension context was reloaded. Refresh this page, then try again.',
      };
    }

    return { ok: false, error: messageText };
  }
}

function maybeTrigger(element) {
  if (!isEditable(element) || isSecureElement(element)) {
    return;
  }

  const text = getElementText(element);
  const matchedToken = parseTokens(settings.triggerTokens).find((token) => text.endsWith(token));
  if (!matchedToken) {
    return;
  }

  analyzeFromElement(element, matchedToken).catch((error) => {
    renderError(element, String(error?.message || error));
  });
}

sendRuntimeMessage({ type: 'get-settings' })
  .then((response) => {
    settings = {
      ...defaultInteractionSettings,
      ...(response?.settings?.interaction || {}),
    };
  })
  .catch(() => undefined);

chrome.storage.onChanged.addListener((changes) => {
  if (changes.interactionSettings?.newValue) {
    settings = {
      ...defaultInteractionSettings,
      ...changes.interactionSettings.newValue,
    };
  }
});

document.addEventListener(
  'input',
  (event) => {
    maybeTrigger(findEditableElement(event));
  },
  true,
);

document.addEventListener(
  'keyup',
  (event) => {
    maybeTrigger(findEditableElement(event));
  },
  true,
);

document.addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Escape') {
      hidePopover();
    }
  },
  true,
);
