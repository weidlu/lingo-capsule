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
  const response = await chrome.runtime.sendMessage({ type: 'analyze-text', text });

  if (!response?.ok) {
    renderError(element, response?.error || 'Lingo could not analyze this text.');
    return;
  }

  renderResult(element, response.result);
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

chrome.runtime
  .sendMessage({ type: 'get-settings' })
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
    maybeTrigger(event.target);
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
