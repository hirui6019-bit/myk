// =============================================================================
// utils.js - 工具函数层（ES Module）
//
// 纯函数（Pure Functions）：不依赖 Vue 响应式状态。
// 所有副作用通过显式参数传递或通过浏览器 API 完成。
// =============================================================================

// ---------------------------------------------------------------------------
// 基础工具（与旧全局 utils.js 兼容的定义）
// ---------------------------------------------------------------------------

export const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const formatTimeAgo = (dateString) => {
    if (!dateString) return '从未在线';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return '刚刚';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}天前`;
    return date.toLocaleDateString();
};

export const parseCotCache = new Map();

export const parseCot = (text) => {
    if (!text) return { cot: '', main: '', sys: '', isFinished: false };
    if (parseCotCache.has(text)) return parseCotCache.get(text);

    const cotPattern = /<(think|cot)>([\s\S]*?)(?:<\/\s*\1\s*>|<\s*\1\s*>|$)/gi;
    let cotContent = '';
    let mainContent = text;
    let isFinished = false;

    mainContent = mainContent.replace(cotPattern, (match, tag, content) => {
        const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/);
        let escapedContent = parts.map((part, i) => {
            if (i % 2 === 1) return part;
            return part.replace(/</g, "&lt;");
        }).join('');

        cotContent += escapedContent;
        if (match.includes('</') || (match.match(new RegExp('<' + tag + '>', 'gi')) || []).length > 1) {
            isFinished = true;
        }
        return '';
    });

    let sys = '';
    const sysMatch = mainContent.match(/\n\n\[系统指令:\s*([\s\S]*?)\]\s*$/);
    if (sysMatch) {
        sys = sysMatch[1];
        mainContent = mainContent.slice(0, sysMatch.index).trim();
    }

    const result = { cot: cotContent.trim(), main: mainContent.trim(), sys: sys, isFinished };
    parseCotCache.set(text, result);
    if (parseCotCache.size > 2000) {
        const firstKey = parseCotCache.keys().next().value;
        parseCotCache.delete(firstKey);
    }
    return result;
};

// ---------------------------------------------------------------------------
// 图片压缩
// ---------------------------------------------------------------------------

export const compressImage = (source, maxWidth = 300, quality = 0.7) => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = source;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const scale = Math.min(1, maxWidth / img.width);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/webp', quality));
        };
        img.onerror = () => resolve(source);
    });
};

// ---------------------------------------------------------------------------
// XML / 文本安全工具
// ---------------------------------------------------------------------------

export const escapeXmlAttribute = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const escapeXmlText = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const indentXmlText = (text, spaces = 0) => {
    const prefix = ' '.repeat(Math.max(0, spaces));
    return String(text || '')
        .split(/\r?\n/)
        .map(line => `${prefix}${line}`)
        .join('\n');
};

// ---------------------------------------------------------------------------
// 角色记忆
// ---------------------------------------------------------------------------

export const ROLE_MEMORY_VECTOR_RECALL_TAG = 'role_memory_vector_recall';
export const ROLE_MEMORY_VECTOR_RECALL_OPEN_TAG = `<${ROLE_MEMORY_VECTOR_RECALL_TAG}>`;
export const ROLE_MEMORY_VECTOR_RECALL_CLOSE_TAG = `</${ROLE_MEMORY_VECTOR_RECALL_TAG}>`;

export const isVectorMemoryRecallContent = (content) => {
    const text = String(content || '');
    return text.includes(ROLE_MEMORY_VECTOR_RECALL_OPEN_TAG)
        || text.includes('[角色记忆 - 向量召回]');
};

export const isRoleMemoryContextContent = (content) => {
    const text = String(content || '');
    return text.startsWith('[角色记忆') || text.includes(ROLE_MEMORY_VECTOR_RECALL_OPEN_TAG);
};

// ---------------------------------------------------------------------------
// 字体
// ---------------------------------------------------------------------------

export const normalizeFontFamily = (value) =>
    ['modern', 'serif', 'system'].includes(value) ? value : 'modern';

export const applyFontFamily = (value) => {
    document.documentElement.dataset.appFont = normalizeFontFamily(value);
};

// ---------------------------------------------------------------------------
// 预设工具
// ---------------------------------------------------------------------------

export const normalizePresetRole = (role) =>
    ['system', 'user', 'assistant'].includes(role) ? role : 'system';

export const normalizePreset = (preset = {}) => ({
    ...preset,
    name: preset.name || 'New Preset',
    content: String(preset.content || ''),
    enabled: preset.enabled !== false,
    role: normalizePresetRole(preset.role || preset.presetRole || preset.type)
});

// ---------------------------------------------------------------------------
// API 提供商工具
// ---------------------------------------------------------------------------

import {
    API_PROVIDER_OPTIONS,
    CUSTOM_API_PROVIDER_OPTIONS
} from './constants.js';

export const isCustomApiProviderId = (id) =>
    CUSTOM_API_PROVIDER_OPTIONS.some(provider => provider.id === id);

export const getCustomApiUrlKey = (id) => id === 'custom2' ? 'customApiUrl2' : 'customApiUrl';

export const normalizeApiProviderUrl = (url) =>
    String(url || '').replace(/\/+$/, '').toLowerCase();

export const getApiProviderById = (id) =>
    API_PROVIDER_OPTIONS.find(provider => provider.id === id);

export const getApiProviderByUrl = (url) => {
    const currentUrl = normalizeApiProviderUrl(url);
    return API_PROVIDER_OPTIONS.find(provider =>
        normalizeApiProviderUrl(provider.apiUrl) === currentUrl
    );
};

// ---------------------------------------------------------------------------
// Active Tool 工厂函数（依赖 constants 中定义的常量）
// ---------------------------------------------------------------------------

import {
    ACTIVE_TOOL_AGGRESSIVENESS_OPTIONS,
    ACTIVE_TOOL_AGGRESSIVENESS_ADAPTIVE,
    ACTIVE_TOOL_WORLD_ACCESS_EDIT,
    ACTIVE_TOOL_WORLD_ACCESS_READ,
    ACTIVE_TOOL_RESULT_COUNT_VERSION,
    ACTIVE_TOOL_DEFAULT_RESULT_COUNT,
    ACTIVE_TOOL_MIN_RESULT_COUNT,
    ACTIVE_TOOL_MAX_RESULT_COUNT,
    ACTIVE_TOOL_WORLD_ACCESS_VERSION,
    ACTIVE_TOOL_VECTOR_TYPE,
    ACTIVE_TOOL_WEB_TYPE,
    ACTIVE_TOOL_WORLD_TYPE,
    ACTIVE_TOOL_WORLD_READ_DESCRIPTION,
    ACTIVE_TOOL_WORLD_READ_DISPLAY_DESCRIPTION,
    ACTIVE_TOOL_WORLD_EDIT_DESCRIPTION,
    ACTIVE_TOOL_WORLD_EDIT_DISPLAY_DESCRIPTION,
    getDefaultActiveToolDefinitions
} from './constants.js';

export const normalizeActiveToolAggressiveness = (value) =>
    ACTIVE_TOOL_AGGRESSIVENESS_OPTIONS.some(opt => opt.value === value)
        ? value
        : ACTIVE_TOOL_AGGRESSIVENESS_ADAPTIVE;

export const normalizeWorldInfoAccessMode = (value) =>
    String(value || '').trim().toLowerCase() === ACTIVE_TOOL_WORLD_ACCESS_EDIT
        ? ACTIVE_TOOL_WORLD_ACCESS_EDIT
        : ACTIVE_TOOL_WORLD_ACCESS_READ;

export const getActiveToolResultCountMin = () => ACTIVE_TOOL_MIN_RESULT_COUNT;

export const getActiveToolResultCountMax = () => ACTIVE_TOOL_MAX_RESULT_COUNT;

export const normalizeActiveToolCallName = (value) => {
    const raw = String(value || '').trim();
    const matched = raw.match(/^<\s*([^:\s>]+)\s*:/);
    const source = matched ? matched[1] : raw;
    return source
        .replace(/[<>：:]/g, '')
        .replace(/\s+/g, '_')
        .trim() || 'tool_memory';
};

export const normalizeActiveToolBaseCallName = (value) =>
    normalizeActiveToolCallName(value).replace(/_(?:add|cover)$/i, '');

export const normalizeActiveTool = (tool = {}) => {
    const resultCount = Number(tool.resultCount);
    const rawCallName = normalizeActiveToolBaseCallName(tool.callName || tool.callPattern || 'tool_memory');
    const legacyWorldToolNames = ['tool_world_list', 'tool_world_read', 'tool_world_edit'];
    const isLegacyWorldTool = legacyWorldToolNames.includes(rawCallName)
        || ['world_info_list', 'world_info_read', 'world_info_edit'].includes(tool.type)
        || ['tool_world_list', 'tool_world_read', 'tool_world_edit'].includes(tool.id);
    const isLegacyWebTool = rawCallName === 'tool_web'
        || ['web_search', 'tavily', 'tavily_search'].includes(tool.type)
        || ['tool_web', 'tool_web_add', 'tool_web_cover'].includes(tool.id)
        || /tavily|联网搜索/i.test(String(tool.name || ''));
    const callName = isLegacyWorldTool ? 'tool_world' : (isLegacyWebTool ? 'tool_web' : rawCallName);

    const defaultToolDef = getDefaultActiveToolDefinitions().find(item =>
        item.id === (isLegacyWorldTool ? 'tool_world' : (isLegacyWebTool ? 'tool_web' : tool.id))
        || item.callName === callName
    );
    const fallback = defaultToolDef || getDefaultActiveToolDefinitions()[0];
    const normalizedCallName = defaultToolDef ? defaultToolDef.callName : callName;
    const resultCountVersion = Number(tool.resultCountVersion) || 1;
    const isDefaultTool = !!defaultToolDef;
    const normalizedType = isDefaultTool ? fallback.type : (tool.type || fallback.type || ACTIVE_TOOL_VECTOR_TYPE);
    const description = isDefaultTool
        ? fallback.description
        : String(tool.description || fallback.description).trim();

    const countMin = getActiveToolResultCountMin();
    const countMax = getActiveToolResultCountMax();
    let normalizedResultCount = Number.isFinite(resultCount)
        ? Math.max(countMin, Math.min(countMax, Math.round(resultCount)))
        : (fallback.resultCount || ACTIVE_TOOL_DEFAULT_RESULT_COUNT);

    if (resultCountVersion < ACTIVE_TOOL_RESULT_COUNT_VERSION && isDefaultTool
        && normalizedCallName === fallback.callName && normalizedType !== ACTIVE_TOOL_WEB_TYPE
        && (!Number.isFinite(resultCount) || Math.round(resultCount) <= ACTIVE_TOOL_MIN_RESULT_COUNT || Math.round(resultCount) === 10)) {
        normalizedResultCount = ACTIVE_TOOL_DEFAULT_RESULT_COUNT;
    }

    const normalized = {
        id: isDefaultTool ? fallback.id : (tool.id || generateUUID()),
        name: isDefaultTool ? fallback.name : (String(tool.name || fallback.name).trim() || fallback.name),
        enabled: tool.enabled !== false,
        type: normalizedType,
        callName: normalizedCallName,
        resultCount: normalizedResultCount,
        resultCountVersion: ACTIVE_TOOL_RESULT_COUNT_VERSION,
        description: description || fallback.description,
        displayDescription: isDefaultTool
            ? fallback.displayDescription
            : (String(tool.displayDescription || fallback.displayDescription).trim() || fallback.displayDescription)
    };

    if (normalizedType === ACTIVE_TOOL_WEB_TYPE) {
        normalized.tavilyApiKey = String(tool.tavilyApiKey || tool.apiKey || fallback.tavilyApiKey || '').trim();
    }
    if (normalizedType === ACTIVE_TOOL_WORLD_TYPE) {
        const worldInfoAccessModeVersion = Number(tool.worldInfoAccessModeVersion) || 1;
        normalized.worldInfoAccessMode = normalizeWorldInfoAccessMode(
            tool.worldInfoAccessMode || tool.worldInfoMode || tool.accessMode || fallback.worldInfoAccessMode
        );
        if (isDefaultTool && normalized.id === 'tool_world' && worldInfoAccessModeVersion < ACTIVE_TOOL_WORLD_ACCESS_VERSION) {
            normalized.worldInfoAccessMode = fallback.worldInfoAccessMode;
        }
        normalized.worldInfoAccessModeVersion = ACTIVE_TOOL_WORLD_ACCESS_VERSION;
        if (isDefaultTool) {
            normalized.description = getWorldInfoToolDescription(normalized.worldInfoAccessMode);
            normalized.displayDescription = getWorldInfoToolDisplayDescription(normalized.worldInfoAccessMode);
        }
    }
    return normalized;
};

export const getWorldInfoToolDescription = (accessMode) =>
    normalizeWorldInfoAccessMode(accessMode) === ACTIVE_TOOL_WORLD_ACCESS_READ
        ? ACTIVE_TOOL_WORLD_READ_DESCRIPTION
        : ACTIVE_TOOL_WORLD_EDIT_DESCRIPTION;

export const getWorldInfoToolDisplayDescription = (accessMode) =>
    normalizeWorldInfoAccessMode(accessMode) === ACTIVE_TOOL_WORLD_ACCESS_READ
        ? ACTIVE_TOOL_WORLD_READ_DISPLAY_DESCRIPTION
        : ACTIVE_TOOL_WORLD_EDIT_DISPLAY_DESCRIPTION;

export const normalizeActiveTools = (items) => {
    const normalized = [];
    (Array.isArray(items) ? items : [])
        .map(normalizeActiveTool)
        .filter(tool => tool.callName)
        .forEach(tool => {
            const duplicateIndex = normalized.findIndex(item =>
                item.id === tool.id || item.callName === tool.callName
            );
            if (duplicateIndex >= 0) {
                normalized[duplicateIndex] = {
                    ...normalized[duplicateIndex],
                    enabled: normalized[duplicateIndex].enabled || tool.enabled
                };
                return;
            }
            normalized.push(tool);
        });
    getDefaultActiveToolDefinitions().forEach(defaultTool => {
        const hasDefaultTool = normalized.some(tool =>
            tool.id === defaultTool.id || tool.callName === defaultTool.callName
        );
        if (!hasDefaultTool) normalized.push(defaultTool);
    });
    return normalized;
};

// ---------------------------------------------------------------------------
// 嵌入 / 向量工具
// ---------------------------------------------------------------------------

export const isEmbeddingLike = (value) => Array.isArray(value) || ArrayBuffer.isView(value);

export const bytesToBase64 = (bytes) => {
    const source = bytes instanceof Uint8Array
        ? bytes
        : new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < source.length; i += chunkSize) {
        binary += String.fromCharCode(...source.subarray(i, i + chunkSize));
    }
    return btoa(binary);
};

export const base64ToInt8Array = (base64) => {
    const binary = atob(String(base64 || ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Int8Array(bytes.buffer);
};

export const quantizeEmbeddingForStorage = (embedding) => {
    if (!isEmbeddingLike(embedding) || embedding.length === 0) return null;
    let maxAbs = 0;
    for (let i = 0; i < embedding.length; i++) {
        const v = Math.abs(Number(embedding[i]) || 0);
        if (v > maxAbs) maxAbs = v;
    }
    if (maxAbs <= 0) return null;

    const quantized = new Int8Array(embedding.length);
    for (let i = 0; i < embedding.length; i++) {
        const scaled = Math.round(((Number(embedding[i]) || 0) / maxAbs) * 127);
        quantized[i] = Math.max(-127, Math.min(127, scaled));
    }

    return {
        embeddingQ: bytesToBase64(new Uint8Array(quantized.buffer)),
        embeddingScale: maxAbs / 127,
        embeddingDims: embedding.length,
        embeddingEncoding: 'int8:maxabs:v1'
    };
};

// ---------------------------------------------------------------------------
// waitForCardUtils - 等待 card-utils.js 加载
// ---------------------------------------------------------------------------

export const waitForCardUtils = (timeoutMs = 8000) => new Promise((resolve, reject) => {
    if (window.RPHubCardUtils) {
        resolve(window.RPHubCardUtils);
        return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
        if (window.RPHubCardUtils) {
            clearInterval(timer);
            resolve(window.RPHubCardUtils);
            return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
            clearInterval(timer);
            reject(new Error('角色卡工具加载超时，请刷新后重试'));
        }
    }, 50);
});
