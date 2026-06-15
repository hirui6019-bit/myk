import { escapeXmlAttribute, indentXmlText, isRoleMemoryContextContent, parseCot } from './utils.js';
import { UI_TEMPLATE_CONTEXT_OPEN_TAG, UI_TEMPLATE_CONTEXT_CLOSE_TAG } from './constants.js';

const { ref, computed } = Vue;

// ============================================================
// Module-level constants
// ============================================================
const defaultUiTemplateHtml = '';
const defaultUiTemplateVariables = {};

const htmlIframeSandbox = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-same-origin allow-downloads allow-pointer-lock allow-presentation allow-top-navigation-by-user-activation';

// ============================================================
// Pure helpers — Template data
// ============================================================

const cloneUiObject = (value) => JSON.parse(JSON.stringify(value || {}));
const cloneUiValue = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

const stripUiTemplateCodeFence = (value) => {
    const text = String(value || '').trim();
    const fenced = text.match(/^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\s*```$/);
    return (fenced ? fenced[1] : text).trim();
};

const inferInitialUiTemplateState = (template = {}, variableState = null) => {
    if (template.initialVariableState && typeof template.initialVariableState === 'object') {
        return cloneUiObject(template.initialVariableState);
    }
    let baseState = cloneUiObject(variableState || template.variableState || template.variables || defaultUiTemplateVariables);
    const logs = Array.isArray(template.changeLog) ? [...template.changeLog].sort((a, b) => (a.time || 0) - (b.time || 0)) : [];
    const initializedKeys = new Set();
    logs.forEach(log => {
        Object.entries(log.changes || {}).forEach(([key, change]) => {
            if (!initializedKeys.has(key) && change && Object.prototype.hasOwnProperty.call(change, 'from')) {
                if (key === '$root') {
                    baseState = cloneUiValue(change.from) || {};
                } else {
                    baseState[key] = change.from;
                }
                initializedKeys.add(key);
            }
        });
    });
    return baseState;
};

const isUiTemplateObject = (value) => value !== null && typeof value === 'object';

const splitUiTemplatePath = (path) => String(path || '')
    .trim()
    .replace(/\[(?:'([^']+)'|"([^"]+)"|([^\]]+))\]/g, (_, single, double, bare) => `.${single ?? double ?? String(bare || '').trim()}`)
    .split('.')
    .map(part => part.trim())
    .filter(Boolean);

const readUiTemplatePath = (source, path) => {
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath || normalizedPath === 'this' || normalizedPath === '.') return source;
    if (isUiTemplateObject(source) && Object.prototype.hasOwnProperty.call(source, normalizedPath)) {
        return source[normalizedPath];
    }
    return splitUiTemplatePath(normalizedPath).reduce((acc, key) => (
        acc !== undefined && acc !== null && acc[key] !== undefined ? acc[key] : undefined
    ), source);
};

const getUiTemplateValue = (source, path, context = null) => {
    const expression = String(path || '').trim();
    if (!expression) return undefined;
    if (context) {
        if (expression === 'this' || expression === '.') return context.current;
        if (expression === '@index') return context.index ?? 0;
        if (expression === '@number') return (context.index ?? 0) + 1;
        if (expression === '@first') return (context.index ?? 0) === 0;
        if (expression === '@last') return (context.index ?? 0) === (context.length ?? 0) - 1;
        if (expression === '@key') return context.key ?? context.index ?? '';
        if (expression.startsWith('root.')) return readUiTemplatePath(context.root, expression.slice(5));
        if (expression === 'root') return context.root;
        if (expression.startsWith('../')) {
            let parentContext = context.parentContext;
            let parentPath = expression;
            while (parentPath.startsWith('../')) {
                parentPath = parentPath.slice(3);
                if (parentPath.startsWith('../') && parentContext?.parentContext) {
                    parentContext = parentContext.parentContext;
                }
            }
            const fallbackParent = { root: context.root, current: context.root, parentContext: null };
            return getUiTemplateValue(context.root, parentPath, parentContext || fallbackParent);
        }
        if (context.alias && (expression === context.alias || expression.startsWith(`${context.alias}.`))) {
            return expression === context.alias
                ? context.current
                : readUiTemplatePath(context.current, expression.slice(context.alias.length + 1));
        }
        const localValue = readUiTemplatePath(context.current, expression);
        if (localValue !== undefined) return localValue;
    }
    return readUiTemplatePath(source, expression);
};

const setUiTemplateValue = (source, path, value) => {
    const expression = String(path || '').trim();
    if (!expression) return source;
    if (expression === '$root' || expression === 'this' || expression === '.') return cloneUiValue(value);
    const root = isUiTemplateObject(source) ? source : {};
    if (Object.prototype.hasOwnProperty.call(root, expression) || !/[.[\]]/.test(expression)) {
        root[expression] = cloneUiValue(value);
        return root;
    }
    const parts = splitUiTemplatePath(expression);
    if (!parts.length) return root;
    let target = root;
    parts.forEach((part, index) => {
        if (index === parts.length - 1) {
            target[part] = cloneUiValue(value);
            return;
        }
        const nextPart = parts[index + 1];
        if (!isUiTemplateObject(target[part])) {
            target[part] = /^\d+$/.test(nextPart) ? [] : {};
        }
        target = target[part];
    });
    return root;
};

const stringifyUiTemplateValue = (value) => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value, null, 2);
        } catch (e) {
            return String(value);
        }
    }
    return String(value);
};

const formatUiTemplateChangeValue = (value) => {
    const text = stringifyUiTemplateValue(value);
    return text === '' ? '空' : text;
};

const escapeUiValue = (value) => stringifyUiTemplateValue(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// ============================================================
// Pure helpers — Template rendering
// ============================================================

const createUiTemplateRenderContext = (variables, overrides = {}) => ({
    root: variables,
    current: variables,
    parentContext: null,
    index: 0,
    key: '',
    length: 1,
    alias: '',
    ...overrides
});

const renderUiTemplateString = (templateText, variables = {}, context = null) => {
    const activeContext = context || createUiTemplateRenderContext(variables);
    const withArrays = renderUiTemplateEachBlocks(String(templateText || ''), variables, activeContext);
    return withArrays.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, expression) => {
        const key = String(expression || '').trim();
        if (!key || key === 'else' || key.startsWith('#') || key.startsWith('/')) return match;
        return escapeUiValue(getUiTemplateValue(variables, key, activeContext));
    });
};

const renderUiTemplateEachBlocks = (templateText, variables = {}, context = null) => {
    let output = String(templateText || '');
    const eachBlockPattern = /\{\{\s*#each\s+([^\s}]+)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*\}\}((?:(?!\{\{\s*#each\b)[\s\S])*?)\{\{\s*\/each\s*\}\}/g;
    for (let pass = 0; pass < 50; pass++) {
        let replaced = false;
        output = output.replace(eachBlockPattern, (match, path, alias, body) => {
            replaced = true;
            const value = getUiTemplateValue(variables, path, context);
            const [itemTemplate, emptyTemplate = ''] = String(body || '').split(/\{\{\s*else\s*\}\}/i);
            const entries = Array.isArray(value)
                ? value.map((item, index) => ({ item, key: index, index }))
                : (isUiTemplateObject(value)
                    ? Object.entries(value).map(([key, item], index) => ({ item, key, index }))
                    : []);
            if (!entries.length) {
                return renderUiTemplateString(emptyTemplate, variables, context);
            }
            return entries.map(({ item, key, index }) => renderUiTemplateString(itemTemplate, variables, createUiTemplateRenderContext(variables, {
                current: item,
                parentContext: context,
                index,
                key,
                length: entries.length,
                alias: alias || ''
            }))).join('');
        });
        if (!replaced) break;
    }
    return output;
};

// ============================================================
// Pure helpers — HTML / iframe
// ============================================================

const buildExecutableHtmlDocument = (rawHtml) => {
    const metaViewport = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">';
    const hudCSS = '.sinan-hud{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;padding:12px;background:linear-gradient(to bottom right,rgba(255,255,255,0.9),rgba(255,255,255,0.6));border-radius:12px;border:1px solid rgba(0,0,0,0.08);backdrop-filter:blur(4px)}.char-card{flex:1 1 140px;background:#fff;padding:10px;border-radius:8px;border-left:4px solid #ddd;box-shadow:0 2px 6px rgba(0,0,0,0.04);display:flex;flex-direction:column;gap:4px;font-size:12px;position:relative;overflow:hidden;transition:transform 0.2s}.char-card:hover{transform:translateY(-2px);box-shadow:0 4px 8px rgba(0,0,0,0.1)}.char-name{font-weight:700;font-size:14px;color:#374151;display:flex;justify-content:space-between;align-items:center}.char-mood{color:#6b7280;font-size:12px}.char-loc{color:#9ca3af;font-size:11px;margin-top:auto;padding-top:4px}.bar-bg{height:4px;background:#f3f4f6;border-radius:2px;overflow:hidden;margin-top:6px}.bar-fill{height:100%;background:#10b981;border-radius:2px}.c-tongqiu{border-left-color:#f59e0b}.c-tongqiu .bar-fill{background:#f59e0b}.c-yufan{border-left-color:#3b82f6}.c-yufan .bar-fill{background:#3b82f6}.c-linghu{border-left-color:#8b5cf6}.c-linghu .bar-fill{background:#8b5cf6}.c-chongtian{border-left-color:#ef4444}.c-chongtian .bar-fill{background:#ef4444}';
    const resetStyle = '<style>html,body{margin:0!important;padding:0!important;width:100%!important;height:auto!important;min-height:auto!important;word-wrap:break-word!important;box-sizing:border-box!important;overflow:hidden!important;}::-webkit-scrollbar{display:none;}*,*::before,*::after{box-sizing:inherit!important;}img,video,canvas,svg{max-width:100%!important;height:auto!important;}table{display:block!important;overflow-x:auto!important;max-width:100%!important;}pre{white-space:pre-wrap!important;word-wrap:break-word!important;max-width:100%!important;}.container,.reality-panel,.app-container{max-width:100%!important;width:100%!important;margin:0!important;border-radius:0!important;box-shadow:none!important;border:none!important;height:auto!important;min-height:0!important;}body>div:first-child{margin:0!important;max-width:100%!important;height:auto!important;min-height:0!important;}#app{height:auto!important;min-height:auto!important;}.bottom-safe{display:none!important;height:0!important;min-height:0!important;margin:0!important;padding:0!important;}' + hudCSS + '</style>';
    const jqueryScript = '<script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js" defer><\/script>';
    const scriptShim = `
                <script>
                    window.triggerSlash = function(text) {
                        if (window.parent && window.parent.triggerSlash) {
                            window.parent.triggerSlash(text);
                        }
                    };

                    let lastHeight = 0;
                    let isUpdating = false;
                    function updateHeight() {
                        if (!window.frameElement || isUpdating) return;
                        isUpdating = true;
                        requestAnimationFrame(function() {
                            var body = document.body;
                            var html = document.documentElement;
                            if (!body || !html) {
                                isUpdating = false;
                                return;
                            }
                            var maxBottom = 0;
                            for (var i = 0; i < body.children.length; i++) {
                                var child = body.children[i];
                                if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE' || child.tagName === 'LINK') continue;
                                var style = window.getComputedStyle(child);
                                if (style.position === 'fixed') continue;
                                var rect = child.getBoundingClientRect();
                                var itemMax = Math.max(rect.bottom, child.offsetTop + child.offsetHeight);
                                if (itemMax > maxBottom) maxBottom = itemMax;
                            }
                            var bodyStyle = window.getComputedStyle(body);
                            var marginBottom = parseFloat(bodyStyle.marginBottom) || 0;
                            var newHeight = Math.max(maxBottom + marginBottom, body.scrollHeight) + 4;
                            if (Math.abs(newHeight - lastHeight) > 0) {
                                lastHeight = newHeight;
                                window.frameElement.style.height = newHeight + 'px';
                            }
                            isUpdating = false;
                        });
                    }

                    window.addEventListener('load', function() {
                        updateHeight();
                        setTimeout(updateHeight, 200);
                        setTimeout(updateHeight, 1000);
                    });
                    window.addEventListener('resize', updateHeight);
                    window.addEventListener('click', function(event) {
                        var slashTarget = event.target && event.target.closest && event.target.closest('[data-slash]');
                        if (slashTarget) {
                            event.preventDefault();
                            var command = slashTarget.getAttribute('data-slash');
                            if (command) window.triggerSlash(command);
                        }
                        var start = Date.now();
                        var tick = function() {
                            if (Date.now() - start >= 600) return;
                            updateHeight();
                            requestAnimationFrame(tick);
                        };
                        tick();
                    });
                    window.addEventListener('DOMContentLoaded', function() {
                        document.querySelectorAll('img').forEach(function(img) {
                            img.addEventListener('load', updateHeight);
                        });
                        updateHeight();
                    });
                    if (window.ResizeObserver) {
                        var ro = new ResizeObserver(updateHeight);
                        if (document.body) ro.observe(document.body);
                    } else {
                        setInterval(updateHeight, 1000);
                    }
                    if (document.readyState === 'complete') updateHeight();
                <\/script>
            `;

    let content = rawHtml || '';
    const trimmed = content.trim();
    if (/^\s*(<!doctype|<html)/i.test(trimmed)) {
        const headRegex = /<head(\s[^>]*)?>/i;
        const htmlRegex = /<html(\s[^>]*)?>/i;
        if (headRegex.test(content)) {
            return content.replace(headRegex, (match) => match + metaViewport + resetStyle + jqueryScript + scriptShim);
        }
        if (htmlRegex.test(content)) {
            return content.replace(htmlRegex, (match) => match + '<head>' + metaViewport + resetStyle + jqueryScript + scriptShim + '</head>');
        }
        return metaViewport + resetStyle + jqueryScript + scriptShim + content;
    }

    return `<!DOCTYPE html>
<html>
<head>
${metaViewport}
${resetStyle}
${jqueryScript}
${scriptShim}
</head>
<body>
${content}
</body>
</html>`;
};

const createExecutableHtmlIframe = (rawHtml, extraClass = '') => {
    const iframe = document.createElement('iframe');
    iframe.className = `w-full bg-white block executable-html-frame ${extraClass}`.trim();
    iframe.style.height = 'auto';
    iframe.style.overflow = 'hidden';
    iframe.style.transition = 'height 0.2s ease-out';
    iframe.style.margin = '0';
    iframe.style.padding = '0';
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('sandbox', htmlIframeSandbox);
    iframe.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen; autoplay; encrypted-media; picture-in-picture');
    iframe.onload = function () {
        try {
            setTimeout(() => {
                if (this.contentWindow && this.contentWindow.document) {
                    const doc = this.contentWindow.document;
                    this.style.height = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight) + 'px';
                }
            }, 100);
        } catch (e) {
            console.warn('Failed to resize iframe:', e);
        }
    };
    iframe.srcdoc = buildExecutableHtmlDocument(rawHtml);
    return iframe;
};

const renderExecutableHtmlFrame = (rawHtml, extraClass = '') => {
    const container = document.createElement('div');
    container.className = 'html-card-container ui-template-frame-container';
    container.style.margin = '0';
    container.style.padding = '0';
    container.style.overflow = 'hidden';
    container.appendChild(createExecutableHtmlIframe(rawHtml, extraClass));
    return container.outerHTML;
};

const renderUiTemplateHtml = (template) => {
    if (!template || !template.htmlTemplate) return '';
    const variables = template.variableState || {};
    const html = renderUiTemplateString(stripUiTemplateCodeFence(template.htmlTemplate), variables);
    return renderExecutableHtmlFrame(html, 'ui-template-iframe');
};

// ============================================================
// Pure helpers — Context injection
// ============================================================

const buildUiTemplateStateAtTurn = (template, turn) => {
    let state = cloneUiObject(inferInitialUiTemplateState(template));
    const logs = Array.isArray(template.changeLog)
        ? template.changeLog
            .filter(log => Number(log.turn || 0) <= turn)
            .sort((a, b) => (a.turn || 0) - (b.turn || 0) || (a.time || 0) - (b.time || 0))
        : [];
    logs.forEach(log => {
        Object.entries(log.changes || {}).forEach(([key, change]) => {
            if (change && Object.prototype.hasOwnProperty.call(change, 'to')) {
                state = setUiTemplateValue(state, key, change.to);
            }
        });
    });
    return state;
};

const stripUiTemplateContextInjection = (text) => String(text || '')
    .replace(/<ui_template_state_context>[\s\S]*?<\/ui_template_state_context>/gi, '')
    .replace(/<ui_template_state_context>[\s\S]*$/gi, '');

// ============================================================
// Pure helpers — Miscellaneous
// ============================================================

const sanitizeUiTemplateImportEntry = (template = {}) => {
    const { changeLog, runtimeByCharacter, variableState, model, version, ...cleanTemplate } = template || {};
    if (!cleanTemplate.initialVariableState && !cleanTemplate.variables && variableState && typeof variableState === 'object') {
        cleanTemplate.initialVariableState = cloneUiObject(variableState);
    }
    return cleanTemplate;
};

const parseUiTemplateUpdateResponse = (rawContent) => {
    const normalizedContent = String(rawContent || '')
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
    try {
        return JSON.parse(normalizedContent);
    } catch (primaryError) {
        const objectStart = normalizedContent.indexOf('{');
        const arrayStart = normalizedContent.indexOf('[');
        const candidates = [
            [objectStart, normalizedContent.lastIndexOf('}')],
            [arrayStart, normalizedContent.lastIndexOf(']')]
        ].filter(([start, end]) => start >= 0 && end > start);
        for (const [start, end] of candidates) {
            try {
                return JSON.parse(normalizedContent.slice(start, end + 1));
            } catch (_) { }
        }
        throw primaryError;
    }
};

const normalizeUiTemplateUpdates = (parsed) => {
    if (Array.isArray(parsed)) {
        return [{ variables: parsed, reason: '' }];
    }
    if (!parsed || typeof parsed !== 'object') return [];
    const parsedKeys = Object.keys(parsed);
    const looksLikeLegacyUpdates = Array.isArray(parsed.updates)
        && (
            parsed.updates.length === 0 && parsedKeys.every(key => ['updates', 'reason'].includes(key))
            || parsed.updates.some(update => update && typeof update === 'object' && Object.prototype.hasOwnProperty.call(update, 'variables'))
        );
    if (looksLikeLegacyUpdates) {
        return parsed.updates
            .map(update => {
                if (!update || typeof update !== 'object') return null;
                if (Object.prototype.hasOwnProperty.call(update, 'variables')) return update;
                return { variables: update, reason: '' };
            })
            .filter(Boolean);
    }
    const looksLikeLegacyVariables = Object.prototype.hasOwnProperty.call(parsed, 'variables')
        && parsedKeys.every(key => ['id', 'variables', 'reason'].includes(key));
    if (looksLikeLegacyVariables) {
        return [{ variables: parsed.variables, reason: parsed.reason || '' }];
    }
    return [{ variables: parsed, reason: '' }];
};

const stringifyUiSchema = (schema) => {
    if (!schema) return '';
    return typeof schema === 'string' ? schema : JSON.stringify(schema, null, 2);
};

const getUiTemplateRuntimeKey = (char) => char?.uuid || null;

// ============================================================
// Factory: createUiTemplateManager
// ============================================================

export function createUiTemplateManager({
    uiTemplateUpdateStatus,
    editingUiTemplate,
    showUiTemplateEditor,
    settings,
    currentCharacter,
    globalUiTemplates,
    chatHistory,
    user,
    showToast,
    saveData,
    saveChatHistoryNow,
    confirmAction,
    generateUUID,
    getConversationTurnAtIndex,
    getCompletedConversationTurnBeforeIndex,
    buildConversationTurnSnapshot,
    getPostprocessedChatMessages,
    cardUtilsToUiTemplateExportEntry,
}) {
    // ---- Internal update-run state ----
    const updateRunState = {
        abortController: null,
        seq: 0,
    };

    // ---- Normalize ----
    const normalizeUiTemplate = (template = {}) => {
        const variableState = (template.variableState && typeof template.variableState === 'object')
            ? cloneUiObject(template.variableState)
            : (template.variables && typeof template.variables === 'object'
                ? cloneUiObject(template.variables)
                : (template.initialVariableState && typeof template.initialVariableState === 'object'
                    ? cloneUiObject(template.initialVariableState)
                    : { ...defaultUiTemplateVariables }));
        return {
            id: template.id || generateUUID(),
            name: template.name || 'UI模板',
            enabled: template.enabled !== false,
            scope: template.scope === 'global' ? 'global' : 'character',
            order: Number.isFinite(Number(template.order)) ? Number(template.order) : 100,
            placement: ['top', 'bottom'].includes(template.placement) ? template.placement : 'bottom',
            htmlTemplate: stripUiTemplateCodeFence(template.htmlTemplate || template.template || defaultUiTemplateHtml),
            initialVariableState: inferInitialUiTemplateState(template, variableState),
            variableState,
            variableSchema: (template.variableSchema && (typeof template.variableSchema === 'object' || typeof template.variableSchema === 'string')) ? template.variableSchema : '',
            changeLog: Array.isArray(template.changeLog) ? template.changeLog : [],
            runtimeByCharacter: (template.runtimeByCharacter && typeof template.runtimeByCharacter === 'object') ? cloneUiObject(template.runtimeByCharacter) : {},
            updateMode: template.updateMode || 'merge'
        };
    };

    // ---- Export helpers ----
    const toUiTemplateExportEntry = (template = {}) => {
        const normalized = normalizeUiTemplate(template);
        return cardUtilsToUiTemplateExportEntry(normalized);
    };

    // ---- Scope management ----
    const ensureCurrentUiTemplates = () => {
        if (!currentCharacter.value) return [];
        if (!Array.isArray(currentCharacter.value.uiTemplates)) currentCharacter.value.uiTemplates = [];
        if (currentCharacter.value.uiTemplates.some(template => template.scope !== 'character' || !template.id)) {
            currentCharacter.value.uiTemplates = currentCharacter.value.uiTemplates.map(template => normalizeUiTemplate({ ...template, scope: 'character' }));
        }
        return currentCharacter.value.uiTemplates;
    };

    const ensureGlobalUiTemplates = () => {
        if ((globalUiTemplates.value || []).some(template => template.scope !== 'global' || !template.id)) {
            globalUiTemplates.value = globalUiTemplates.value.map(template => normalizeUiTemplate({ ...template, scope: 'global' }));
        }
        return globalUiTemplates.value;
    };

    const getUiTemplateListByScope = (scope) => scope === 'global' ? ensureGlobalUiTemplates() : ensureCurrentUiTemplates();

    // ---- Computed: template lists ----
    const currentUiTemplates = computed(() => [
        ...ensureGlobalUiTemplates(),
        ...ensureCurrentUiTemplates()
    ].map((template, index) => ({ template, index }))
        .sort((a, b) => (Number(b.template.order) || 0) - (Number(a.template.order) || 0) || a.index - b.index)
        .map(item => item.template));

    const activeUiTemplates = computed(() => currentUiTemplates.value.filter(t => t.enabled !== false));

    const activeUiTemplateCount = computed(() => activeUiTemplates.value.length);

    // ---- Event handlers ----
    const handleUiTemplateClick = (event) => {
        const trigger = event.target?.closest?.('[data-slash]');
        if (!trigger) return;
        const command = trigger.getAttribute('data-slash');
        if (!command) return;
        event.preventDefault();
        event.stopPropagation();
        window.triggerSlash(command);
    };

    // ---- Editor preview ----
    const renderEditingUiTemplatePreview = () => {
        let variableState = editingUiTemplate.data.previewVariableState || {};
        try {
            variableState = JSON.parse(editingUiTemplate.data.variableStateText || '{}');
        } catch (e) {
            // 预览里 JSON 写错时，先沿用打开弹窗时的变量，避免整个弹窗空掉。
        }
        return renderUiTemplateHtml({
            htmlTemplate: editingUiTemplate.data.htmlTemplate,
            variableState
        });
    };

    // ---- Message helpers ----
    const getLastAssistantMessage = () => [...chatHistory.value].reverse().find(msg => msg && msg.role === 'assistant');

    const isInitialAssistantGreeting = (msg, index) => (
        index === 0
        && msg?.role === 'assistant'
        && !!currentCharacter.value?.first_mes
        && (msg.content || '').trim() === (currentCharacter.value.first_mes || '').trim()
    );

    const getAssistantTurnAtIndex = (index) => {
        const normalizedIndex = Math.max(0, Math.min(index, chatHistory.value.length - 1));
        return getConversationTurnAtIndex(normalizedIndex);
    };

    const getAssistantTurnForMessage = (message) => {
        if (!message || message.role !== 'assistant') return null;
        const index = chatHistory.value.findIndex(msg => msg === message || (message.id && msg.id === message.id));
        if (index < 0 || isInitialAssistantGreeting(chatHistory.value[index], index)) return null;
        return getAssistantTurnAtIndex(index);
    };

    // ---- Attach blocks ----
    const attachUiTemplateBlocksToLastAssistant = ({ excludeTemplateIds = new Set(), targetMessageId = null } = {}) => {
        const targetMessage = targetMessageId
            ? chatHistory.value.find(msg => msg && msg.role === 'assistant' && msg.id === targetMessageId)
            : getLastAssistantMessage();
        if (!targetMessage) return false;
        const top = activeUiTemplates.value
            .filter(template => template.placement === 'top' && !excludeTemplateIds.has(template.id))
            .map(renderUiTemplateHtml)
            .filter(Boolean);
        const bottom = activeUiTemplates.value
            .filter(template => template.placement === 'bottom' && !excludeTemplateIds.has(template.id))
            .map(renderUiTemplateHtml)
            .filter(Boolean);
        targetMessage.uiTemplateBlocks = {
            top,
            bottom,
            updatedAt: Date.now()
        };
        return top.length > 0 || bottom.length > 0;
    };

    // ---- Context injection ----
    const getUiTemplateReferenceTurnForUserMessage = (message, getCompletedTurnBeforeIndex = getCompletedConversationTurnBeforeIndex) => {
        if (!message || message.role !== 'user') return null;
        if (Array.isArray(message._sourceIndexes) && message._sourceIndexes.length > 0) {
            return getCompletedTurnBeforeIndex(Math.min(...message._sourceIndexes));
        }
        const index = chatHistory.value.findIndex(msg => msg === message || (message.id && msg.id === message.id));
        return getCompletedTurnBeforeIndex(index);
    };

    const buildUiTemplateContextInjection = (message, getCompletedTurnBeforeIndex = getCompletedConversationTurnBeforeIndex) => {
        if (!settings.uiTemplateInjectContext) return '';
        const turn = getUiTemplateReferenceTurnForUserMessage(message, getCompletedTurnBeforeIndex);
        if (!turn) return '';

        const hasAnyTurnChange = activeUiTemplates.value.some(template => {
            const logs = Array.isArray(template.changeLog) ? template.changeLog : [];
            return logs.some(log => Number(log.turn || 0) === turn);
        });
        if (!hasAnyTurnChange) return '';

        const sections = activeUiTemplates.value
            .map(template => {
                const state = buildUiTemplateStateAtTurn(template, turn);
                if (!state || Object.keys(state).length === 0) return null;
                return JSON.stringify(state, null, 2);
            })
            .filter(Boolean);

        if (!sections.length) return '';
        return [
            '以下内容是给你参考当前剧情状态的，不是让你生成、复述或改写的正文。请只用它理解角色状态、关系、地点和其他模板变量。',
            sections.join('\n\n')
        ].join('\n');
    };

    const buildLatestUiTemplateContextInjectionForTurn = (turn) => {
        if (!settings.uiTemplateInjectContext) return '';
        const referenceTurn = Number(turn) || 0;
        if (referenceTurn <= 0) return '';

        const sections = activeUiTemplates.value
            .map(template => {
                const state = buildUiTemplateStateAtTurn(template, referenceTurn);
                if (!state || Object.keys(state).length === 0) return null;
                const title = escapeXmlAttribute(template.name || template.id || 'UI模板');
                return [
                    `  <template_state name="${title}">`,
                    indentXmlText(JSON.stringify(state, null, 2), 4),
                    '  </template_state>'
                ].join('\n');
            })
            .filter(Boolean);

        if (!sections.length) return '';
        return [
            UI_TEMPLATE_CONTEXT_OPEN_TAG,
            '  <description>以下内容是给你参考当前剧情状态的 UI 模板变量快照，不是正文，也不要复述、改写或输出这些变量。请只用它理解角色状态、关系、地点和其他模板变量。</description>',
            ...sections,
            UI_TEMPLATE_CONTEXT_CLOSE_TAG
        ].join('\n');
    };

    const getLatestUiTemplateContextReferenceTurn = (contextMessages, getCompletedTurnBeforeIndex = getCompletedConversationTurnBeforeIndex) => {
        for (let i = (contextMessages?.length || 0) - 1; i >= 0; i--) {
            const message = contextMessages[i];
            if (message?.role !== 'user') continue;
            const turn = getUiTemplateReferenceTurnForUserMessage(message, getCompletedTurnBeforeIndex);
            if (turn) return turn;
        }
        return null;
    };

    const appendUiTemplateContextToLatestUserMessage = (msgArray, referenceTurn) => {
        const uiTemplateContext = buildLatestUiTemplateContextInjectionForTurn(referenceTurn);
        if (!uiTemplateContext) return msgArray;

        const latestUserMessage = [...msgArray].reverse().find(message => {
            const content = String(message?.content || '');
            return message?.role === 'user'
                && content.trim()
                && !isRoleMemoryContextContent(content);
        });
        if (!latestUserMessage) return msgArray;

        const cleanContent = stripUiTemplateContextInjection(latestUserMessage.content).trimEnd();
        latestUserMessage.content = cleanContent
            ? `${cleanContent}\n\n${uiTemplateContext}`
            : uiTemplateContext;
        return msgArray;
    };

    // ---- Change log / state management ----
    const rebuildUiTemplateStateFromLogs = (template, remainingLogs, allLogs) => {
        let rebuilt = cloneUiObject(inferInitialUiTemplateState(template));
        [...remainingLogs]
            .sort((a, b) => (a.time || 0) - (b.time || 0))
            .forEach(log => {
                Object.entries(log.changes || {}).forEach(([key, change]) => {
                    if (change && Object.prototype.hasOwnProperty.call(change, 'to')) {
                        rebuilt = setUiTemplateValue(rebuilt, key, change.to);
                    }
                });
            });
        template.variableState = rebuilt;
    };

    const pruneUiTemplateChangesFromTurn = (turn) => {
        if (!Number.isFinite(turn) || turn < 1) return { logs: 0, blocks: 0 };
        let removedLogs = 0;
        currentUiTemplates.value.forEach(template => {
            const allLogs = Array.isArray(template.changeLog) ? template.changeLog : [];
            const remainingLogs = allLogs.filter(log => (log.turn || 0) < turn);
            removedLogs += allLogs.length - remainingLogs.length;
            if (allLogs.length !== remainingLogs.length) {
                rebuildUiTemplateStateFromLogs(template, remainingLogs, allLogs);
                template.changeLog = remainingLogs;
            }
        });

        let removedBlocks = 0;
        const snapshot = buildConversationTurnSnapshot();
        const blockMessageIndexes = new Set();
        snapshot.turns.forEach(turnInfo => {
            if ((turnInfo.turn || 0) < turn) return;
            (turnInfo.sourceIndexes || []).forEach(sourceIndex => blockMessageIndexes.add(sourceIndex));
        });
        blockMessageIndexes.forEach(msgIndex => {
            const msg = chatHistory.value[msgIndex];
            if (msg?.role === 'assistant' && msg.uiTemplateBlocks) {
                delete msg.uiTemplateBlocks;
                removedBlocks++;
            }
        });

        if (uiTemplateUpdateStatus.targetMessageId) {
            const targetStillExists = chatHistory.value.some(msg => msg.id === uiTemplateUpdateStatus.targetMessageId);
            if (!targetStillExists) {
                abortUiTemplateUpdate(uiTemplateUpdateStatus.targetMessageId);
            }
        }

        return { logs: removedLogs, blocks: removedBlocks };
    };

    const resetUiTemplateRuntimeState = () => {
        abortUiTemplateUpdate();
        currentUiTemplates.value.forEach(template => {
            template.variableState = cloneUiObject(template.initialVariableState || {});
            template.changeLog = [];
        });
        saveGlobalUiTemplateRuntimeForCharacter();
        chatHistory.value.forEach(msg => {
            if (msg.uiTemplateBlocks) delete msg.uiTemplateBlocks;
        });
        markUiTemplateStatus('idle', '待命');
    };

    const saveGlobalUiTemplateRuntimeForCharacter = (char = currentCharacter.value) => {
        const key = getUiTemplateRuntimeKey(char);
        if (!key) return;
        ensureGlobalUiTemplates().forEach(template => {
            if (!template.runtimeByCharacter || typeof template.runtimeByCharacter !== 'object') {
                template.runtimeByCharacter = {};
            }
            template.runtimeByCharacter[key] = {
                variableState: cloneUiObject(template.variableState || template.initialVariableState || {}),
                changeLog: Array.isArray(template.changeLog) ? JSON.parse(JSON.stringify(template.changeLog)) : []
            };
        });
    };

    const loadGlobalUiTemplateRuntimeForCharacter = (char = currentCharacter.value) => {
        const key = getUiTemplateRuntimeKey(char);
        ensureGlobalUiTemplates().forEach(template => {
            const runtime = key && template.runtimeByCharacter ? template.runtimeByCharacter[key] : null;
            template.variableState = cloneUiObject(runtime?.variableState || template.initialVariableState || {});
            template.changeLog = Array.isArray(runtime?.changeLog) ? JSON.parse(JSON.stringify(runtime.changeLog)) : [];
        });
        markUiTemplateStatus('idle', '待命');
    };

    // ---- Lifecycle: status marking ----
    const markUiTemplateStatus = (state, message, remaining = 0, targetMessageId = null) => {
        uiTemplateUpdateStatus.state = state;
        uiTemplateUpdateStatus.message = message;
        uiTemplateUpdateStatus.time = Date.now();
        uiTemplateUpdateStatus.remaining = remaining;
        uiTemplateUpdateStatus.targetMessageId = targetMessageId;
    };

    const finishUiTemplateStatusAsToast = (message, type = 'info', show = true) => {
        markUiTemplateStatus('idle', '待命');
        if (show) showToast(message, type);
    };

    // ---- Lifecycle: update run control ----
    const startUiTemplateUpdateRun = () => {
        if (updateRunState.abortController) {
            updateRunState.abortController.abort();
        }
        updateRunState.abortController = new AbortController();
        const seq = ++updateRunState.seq;
        return { seq, signal: updateRunState.abortController.signal };
    };

    const isUiTemplateUpdateRunCurrent = (seq, targetMessageId) => (
        seq === updateRunState.seq
        && updateRunState.abortController
        && !updateRunState.abortController.signal.aborted
        && (!targetMessageId || chatHistory.value.some(msg => msg && msg.id === targetMessageId))
    );

    const abortUiTemplateUpdate = (targetMessageId = null) => {
        if (targetMessageId && uiTemplateUpdateStatus.targetMessageId && uiTemplateUpdateStatus.targetMessageId !== targetMessageId) return;
        if (updateRunState.abortController) {
            updateRunState.abortController.abort();
            updateRunState.abortController = null;
        }
        updateRunState.seq++;
        if (!targetMessageId || uiTemplateUpdateStatus.targetMessageId === targetMessageId) {
            markUiTemplateStatus('idle', '待命');
        }
    };

    // ---- AI update: apply updates ----
    const applyTemplateUpdates = (template, updates, model) => {
        const turn = getAssistantTurnAtIndex(chatHistory.value.findIndex(msg => msg && msg.role === 'assistant'));
        updates.forEach(update => {
            if (update.id && update.id !== template.id) return;
            if (!template || update.variables === null || typeof update.variables !== 'object') return;
            const changes = {};
            const variableEntries = Array.isArray(update.variables)
                ? [['$root', update.variables]]
                : Object.entries(update.variables);
            variableEntries.forEach(([key, value]) => {
                const oldValue = key === '$root'
                    ? template.variableState
                    : getUiTemplateValue(template.variableState || {}, key);
                if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
                    template.variableState = setUiTemplateValue(template.variableState || {}, key, value);
                    changes[key] = { from: oldValue, to: value };
                }
            });
            if (Object.keys(changes).length > 0) {
                if (!Array.isArray(template.changeLog)) template.changeLog = [];
                template.changeLog.unshift({
                    id: generateUUID(),
                    time: Date.now(),
                    source: 'ai',
                    model,
                    turn,
                    changes,
                    reason: update.reason || ''
                });
                template.changeLog = template.changeLog.slice(0, 50);
            }
        });
        return Object.keys(updates.reduce((acc, u) => {
            if (u.variables && typeof u.variables === 'object') {
                Object.keys(u.variables).forEach(k => { acc[k] = true; });
            }
            return acc;
        }, {})).length;
    };

    // ---- AI update: main orchestrator ----
    const updateUiTemplatesFromChat = async ({ manual = false, targetMessageId = null } = {}) => {
        if (!settings.uiTemplateEnabled) {
            finishUiTemplateStatusAsToast('未开启', 'warning');
            return false;
        }
        if (!currentCharacter.value) {
            finishUiTemplateStatusAsToast('未选择角色卡', 'warning');
            return false;
        }
        const templates = activeUiTemplates.value;
        if (!templates.length) {
            finishUiTemplateStatusAsToast('当前角色没有启用中的UI模板', 'warning');
            return false;
        }
        if (buildConversationTurnSnapshot().turns.length < 1) {
            finishUiTemplateStatusAsToast('对话层数不足', 'warning');
            return false;
        }

        const targetMessage = targetMessageId
            ? chatHistory.value.find(msg => msg && msg.role === 'assistant' && msg.id === targetMessageId)
            : getLastAssistantMessage();
        if (!targetMessage) {
            finishUiTemplateStatusAsToast('没有可更新的AI回复', 'warning');
            return false;
        }
        if (!targetMessage.id) targetMessage.id = generateUUID();
        const lockedTargetMessageId = targetMessage.id;
        const targetMessageIndex = chatHistory.value.findIndex(msg => msg === targetMessage || msg.id === lockedTargetMessageId);
        const contextMessages = targetMessageIndex >= 0 ? chatHistory.value.slice(0, targetMessageIndex + 1) : chatHistory.value;

        const uiTemplateAnalysisDepth = Number(settings.uiTemplateAnalysisDepth);
        const normalizedUiTemplateAnalysisDepth = Number.isFinite(uiTemplateAnalysisDepth)
            ? Math.max(4, Math.min(8, uiTemplateAnalysisDepth))
            : 4;
        const sourceMessages = getPostprocessedChatMessages(contextMessages, { includeSystem: false })
            .map(m => ({
                role: m.role,
                name: m.role === 'user' ? user.name : (m.name || currentCharacter.value.name),
                content: parseCot(m.content || '').main
            }));
        const recentMessages = sourceMessages.slice(-normalizedUiTemplateAnalysisDepth);

        const fallbackModel = (settings.uiTemplateModel || '').trim();
        if (!fallbackModel) {
            finishUiTemplateStatusAsToast('未选择变量分析模型', 'warning');
            return false;
        }
        const url = settings.apiUrl.endsWith('/v1') ? `${settings.apiUrl}/chat/completions` : `${settings.apiUrl}/v1/chat/completions`;

        try {
            const updateRun = startUiTemplateUpdateRun();
            const isCurrentRun = () => isUiTemplateUpdateRunCurrent(updateRun.seq, lockedTargetMessageId);
            markUiTemplateStatus('running', '分析中', templates.length, lockedTargetMessageId);
            const turn = getAssistantTurnAtIndex(targetMessageIndex);
            let hasChanges = false;
            let changedFieldCount = 0;
            let changedTemplateCount = 0;
            let failedTemplateCount = 0;
            const failedTemplateIds = new Set();
            const pendingTemplateUpdates = [];

            await Promise.all(templates.map(async (template) => {
                const model = fallbackModel;
                try {
                    const currentVariableJson = JSON.stringify(template.variableState || {}, null, 2);
                    const variableSchemaText = stringifyUiSchema(template.variableSchema).trim();
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${settings.apiKey}`
                        },
                        body: JSON.stringify({
                            model,
                            temperature: 1,
                            stream: false,
                            messages: [
                                {
                                    role: 'system',
                                    content: [
                                        '你是RP-Hub的UI变量更新器。当前请求只分析一个UI模板。',
                                        '只根据用户消息里提供的最近对话，更新下方模板已定义的变量。',
                                        '严格返回JSON，不要解释，不要输出Markdown。',
                                        '返回格式要尽量简单：直接返回本次要更新的变量对象，例如 {"a_line_1":"新台词","a_line_3":"新台词"}。',
                                        '变量值可以是文字、数字、对象或JSON数组；装备栏、背包、日志这类列表可直接返回完整数组字段，例如 {"equipment":[{"slot":"武器","name":"短剑"}]}。',
                                        '如果模板根变量本身就是数组，可以直接返回JSON数组；如果只改数组里的一个小项，也可以返回 {"equipment.0.name":"短剑"} 这种路径对象。',
                                        '没有变化则返回 {}。不要返回模板id，不要套updates/variables，不要修改HTML。',
                                        '',
                                        '当前变量JSON如下：',
                                        currentVariableJson,
                                        variableSchemaText ? [
                                            '',
                                            '变量说明如下（给AI参考，必须按这里理解字段含义和生成规则）：',
                                            variableSchemaText
                                        ].join('\n') : ''
                                    ].join('\n')
                                },
                                {
                                    role: 'user',
                                    content: JSON.stringify({
                                        recentMessages
                                    }, null, 2)
                                }
                            ]
                        }),
                        signal: updateRun.signal
                    });
                    if (!isCurrentRun()) return;
                    if (!response.ok) throw new Error(`API Error: ${response.status}`);
                    const data = await response.json();
                    if (!isCurrentRun()) return;
                    let content = data.choices?.[0]?.message?.content || '';
                    console.log(`[UI模板变量分析] ${template.name || template.id} 原始返回:`, content);
                    const parsed = parseUiTemplateUpdateResponse(content);
                    const updates = normalizeUiTemplateUpdates(parsed);
                    pendingTemplateUpdates.push({ template, updates, model });
                } catch (e) {
                    if (updateRun.signal.aborted || !isCurrentRun()) return;
                    failedTemplateCount++;
                    failedTemplateIds.add(template.id);
                    console.warn(`[UI模板] ${template.name || template.id} 未成功:`, e.message);
                } finally {
                    if (isCurrentRun()) {
                        uiTemplateUpdateStatus.remaining = Math.max(0, uiTemplateUpdateStatus.remaining - 1);
                    }
                }
            }));

            if (!isCurrentRun()) {
                if (updateRunState.seq === updateRun.seq) {
                    updateRunState.abortController = null;
                    markUiTemplateStatus('idle', '待命');
                }
                return false;
            }
            pendingTemplateUpdates.forEach(({ template, updates, model }) => {
                const fieldCount = applyTemplateUpdates(template, updates, model);
                if (fieldCount > 0) {
                    changedTemplateCount++;
                    changedFieldCount += fieldCount;
                    hasChanges = true;
                }
            });

            const inserted = attachUiTemplateBlocksToLastAssistant({ excludeTemplateIds: failedTemplateIds, targetMessageId: lockedTargetMessageId });

            if (hasChanges) {
                saveGlobalUiTemplateRuntimeForCharacter();
                saveData({ saveMemories: false });
                await saveChatHistoryNow();
                finishUiTemplateStatusAsToast(
                    failedTemplateCount ? `${failedTemplateCount} 个未成功` : `已更新 ${changedTemplateCount} 个模板，${changedFieldCount} 个变量`,
                    failedTemplateCount ? 'warning' : 'success'
                );
            } else {
                if (inserted) await saveChatHistoryNow();
                if (failedTemplateCount >= templates.length) {
                    finishUiTemplateStatusAsToast(`${failedTemplateCount} 个未成功`, 'warning');
                } else {
                    finishUiTemplateStatusAsToast(
                        failedTemplateCount ? `${failedTemplateCount} 个未成功` : '无变量变化',
                        failedTemplateCount ? 'warning' : 'info'
                    );
                }
            }
            if (updateRunState.seq === updateRun.seq) {
                updateRunState.abortController = null;
            }
            return failedTemplateCount < templates.length;
        } catch (e) {
            if (e?.name === 'AbortError') {
                return false;
            }
            updateRunState.abortController = null;
            console.warn('[UI模板] 未成功:', e.message);
            const failedCount = templates.length || 1;
            finishUiTemplateStatusAsToast(`${failedCount} 个未成功`, 'warning');
            return false;
        }
    };

    // ---- CRUD operations ----
    const createUiTemplate = () => {
        editingUiTemplate.id = undefined;
        editingUiTemplate.tab = 'edit';
        const data = normalizeUiTemplate({ scope: currentCharacter.value ? 'character' : 'global' });
        editingUiTemplate.data = {
            ...data,
            previewVariableState: cloneUiObject(data.initialVariableState || data.variableState),
            variableStateText: JSON.stringify(data.initialVariableState || data.variableState, null, 2),
            variableSchemaText: stringifyUiSchema(data.variableSchema)
        };
        showUiTemplateEditor.value = true;
    };

    const editUiTemplate = (index) => {
        const template = currentUiTemplates.value[index];
        if (!template) return;
        editingUiTemplate.id = template.id;
        editingUiTemplate.tab = 'history';
        const data = normalizeUiTemplate(JSON.parse(JSON.stringify(template)));
        editingUiTemplate.data = {
            ...data,
            previewVariableState: cloneUiObject(data.initialVariableState || data.variableState),
            variableStateText: JSON.stringify(data.initialVariableState || data.variableState || {}, null, 2),
            variableSchemaText: stringifyUiSchema(data.variableSchema)
        };
        showUiTemplateEditor.value = true;
    };

    const saveUiTemplate = () => {
        if (!currentCharacter.value && editingUiTemplate.data.scope !== 'global') return;
        let initialVariableState = {};
        try {
            initialVariableState = JSON.parse(editingUiTemplate.data.variableStateText || '{}');
        } catch (e) {
            showToast('变量 JSON 格式不正确', 'error');
            return;
        }
        let variableSchema = '';
        const schemaText = (editingUiTemplate.data.variableSchemaText || '').trim();
        if (schemaText) {
            try {
                variableSchema = JSON.parse(schemaText);
            } catch (e) {
                variableSchema = schemaText;
            }
        }
        const existingTemplate = editingUiTemplate.id !== undefined ? currentUiTemplates.value.find(template => template.id === editingUiTemplate.id) : null;
        const runtimeVariableState = existingTemplate ? cloneUiObject(existingTemplate.variableState || initialVariableState) : initialVariableState;
        const template = normalizeUiTemplate({
            ...editingUiTemplate.data,
            initialVariableState,
            variableState: runtimeVariableState,
            variableSchema
        });
        delete template.variableStateText;
        delete template.variableSchemaText;
        delete template.previewVariableState;
        if (editingUiTemplate.id !== undefined) {
            const oldScope = existingTemplate?.scope || 'character';
            const oldList = getUiTemplateListByScope(oldScope);
            const oldIndex = oldList.findIndex(item => item.id === editingUiTemplate.id);
            if (oldIndex !== -1) oldList.splice(oldIndex, 1);
        }
        const list = getUiTemplateListByScope(template.scope);
        const targetIndex = list.findIndex(item => item.id === template.id);
        if (targetIndex !== -1) {
            list[targetIndex] = template;
        } else {
            list.push(template);
        }
        showUiTemplateEditor.value = false;
        saveData();
        showToast('UI模板已保存', 'success');
    };

    const deleteUiTemplate = (index) => {
        confirmAction('确定要删除这个UI模板吗？此操作无法撤销。', () => {
            const template = currentUiTemplates.value[index];
            const list = getUiTemplateListByScope(template?.scope);
            const targetIndex = list.findIndex(item => item.id === template?.id);
            if (targetIndex !== -1) list.splice(targetIndex, 1);
            saveData();
            showToast('UI模板已删除', 'success');
        });
    };

    const exportUiTemplates = () => {
        const templates = currentUiTemplates.value.map(toUiTemplateExportEntry);
        if (!templates.length) {
            showToast('没有可导出的UI模板', 'info');
            return;
        }
        const payload = { type: 'rp-hub-ui-templates', templates };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = `${currentCharacter.value?.name || 'character'}_ui_templates.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('UI模板已导出', 'success');
    };

    const importUiTemplates = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const templates = Array.isArray(data) ? data : (Array.isArray(data.templates) ? data.templates : []);
                if (!templates.length) throw new Error('未找到模板数组');
                const normalized = templates.map(t => {
                    const cleanTemplate = sanitizeUiTemplateImportEntry(t);
                    return normalizeUiTemplate({ ...cleanTemplate, id: generateUUID(), enabled: cleanTemplate.enabled === true ? true : false });
                });
                const globalTemplates = normalized.filter(template => template.scope === 'global');
                const characterTemplates = normalized.filter(template => template.scope !== 'global');
                if (characterTemplates.length && !currentCharacter.value) {
                    showToast('绑定角色卡的模板需要先选择角色卡', 'warning');
                    return;
                }
                ensureGlobalUiTemplates().push(...globalTemplates);
                ensureCurrentUiTemplates().push(...characterTemplates);
                saveData();
                showToast(`成功导入 ${normalized.length} 个UI模板`, 'success');
            } catch (err) {
                showToast('UI模板导入失败: ' + err.message, 'error');
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    // ---- Return public API ----
    return {
        // Data
        normalizeUiTemplate,
        sanitizeUiTemplateImportEntry,
        inferInitialUiTemplateState,
        toUiTemplateExportEntry,

        // Scope & computed
        ensureCurrentUiTemplates,
        ensureGlobalUiTemplates,
        getUiTemplateListByScope,
        currentUiTemplates,
        activeUiTemplates,
        activeUiTemplateCount,

        // Utility
        cloneUiObject,
        cloneUiValue,
        stripUiTemplateCodeFence,
        formatUiTemplateChangeValue,
        stringifyUiSchema,

        // Rendering
        renderUiTemplateHtml,
        renderEditingUiTemplatePreview,
        handleUiTemplateClick,

        // Context injection
        stripUiTemplateContextInjection,
        buildUiTemplateContextInjection,
        buildLatestUiTemplateContextInjectionForTurn,
        getLatestUiTemplateContextReferenceTurn,
        getUiTemplateReferenceTurnForUserMessage,
        appendUiTemplateContextToLatestUserMessage,

        // Message helpers
        getLastAssistantMessage,
        getAssistantTurnAtIndex,
        getAssistantTurnForMessage,
        isInitialAssistantGreeting,
        attachUiTemplateBlocksToLastAssistant,

        // Change log / state
        rebuildUiTemplateStateFromLogs,
        pruneUiTemplateChangesFromTurn,
        resetUiTemplateRuntimeState,
        saveGlobalUiTemplateRuntimeForCharacter,
        loadGlobalUiTemplateRuntimeForCharacter,

        // Lifecycle
        markUiTemplateStatus,
        finishUiTemplateStatusAsToast,
        startUiTemplateUpdateRun,
        isUiTemplateUpdateRunCurrent,
        abortUiTemplateUpdate,

        // AI update
        updateUiTemplatesFromChat,

        // CRUD
        createUiTemplate,
        editUiTemplate,
        saveUiTemplate,
        deleteUiTemplate,
        exportUiTemplates,
        importUiTemplates,
    };
}
