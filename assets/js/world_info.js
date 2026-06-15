/**
 * 世界书引擎
 *
 * 提供世界书条目的规范化、导出、运行时评估（关键词匹配、概率投骰、条目触发）。
 *
 * @param {Object} ctx
 * @param {string[]} ctx.systemWorldInfoNames - 系统级世界书名称列表（判定全局 scope）
 * @param {Object} [ctx.cardUtils] - 角色卡工具代理（仅 toWorldInfoExportEntry 需要）
 * @returns {Object} 世界书相关方法集合
 */
export function createWorldInfoEngine({ systemWorldInfoNames, cardUtils }) {

    /* ================================================================
     * 内部工具函数
     * ================================================================ */

    /**
     * 安全转为非负数
     */
    const toNonNegativeNumber = (value, fallback = 0) => {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(0, number) : fallback;
    };

    /**
     * 从字符串构建 RegExp
     * 支持 /pattern/flags 格式；自动检测 unicode 类并追加 u flag
     */
    const createWorldInfoRegex = (pattern) => {
        let source = String(pattern || '');
        let flags = 'i';
        if (source.startsWith('/') && source.lastIndexOf('/') > 0) {
            const lastSlash = source.lastIndexOf('/');
            const potentialFlags = source.slice(lastSlash + 1);
            if (/^[dgimsuvy]*$/.test(potentialFlags)) {
                source = source.slice(1, lastSlash);
                flags = potentialFlags;
            }
        }
        flags = flags.replace(/g/g, '');
        if (!flags.includes('i')) flags += 'i';
        if (/\\[pP]\{/.test(source) && !flags.includes('u')) flags += 'u';
        return new RegExp(source, flags);
    };

    /**
     * 检测单个关键词是否命中文本
     */
    const worldInfoKeyMatchesText = (entry, key, text) => {
        const rawKey = String(key || '').trim();
        const rawText = String(text || '');
        if (!rawKey || !rawText) return false;

        if (entry.useRegex) {
            try {
                return createWorldInfoRegex(rawKey).test(rawText);
            } catch (e) {
                console.warn(`Invalid world info regex: ${rawKey}`);
                return false;
            }
        }

        return rawText.toLowerCase().includes(rawKey.toLowerCase());
    };

    /**
     * 概率投骰（一次生成中同一条目仅投一次，结果缓存于 probabilityCache）
     */
    const passesWorldInfoProbability = (entry, probabilityCache) => {
        const probability = Math.min(100, toNonNegativeNumber(entry.probability, 100));
        if (entry.useProbability !== false && probability < 100) {
            if (!probabilityCache.has(entry)) {
                probabilityCache.set(entry, probability > 0 && (Math.random() * 100) < probability);
            }
            return !!probabilityCache.get(entry);
        }
        return true;
    };

    /**
     * 综合判断单条世界书是否应被触发
     */
    const checkEntryTrigger = (entry, text, probabilityCache) => {
        if (!passesWorldInfoProbability(entry, probabilityCache)) return { triggered: false };

        let primaryMatches = 0;
        let matchedKeys = [];

        const checkKeys = (keys) => {
            let matchCount = 0;
            if (!keys || keys.length === 0 || keys.every(k => !k)) return 0;

            keys.forEach(key => {
                const rawKey = String(key || '').trim();
                if (!rawKey) return;
                if (worldInfoKeyMatchesText(entry, rawKey, text)) {
                    matchCount++;
                    if (!matchedKeys.includes(rawKey)) matchedKeys.push(rawKey);
                }
            });
            return matchCount;
        };

        primaryMatches = checkKeys(entry.keys);
        if (primaryMatches === 0) return { triggered: false };

        return { triggered: true, score: primaryMatches, matchedKeys };
    };

    /* ================================================================
     * 导出函数
     * ================================================================ */

    /**
     * 标准化世界书条目
     *
     * 合并 extensions 到根层级、映射 position、归一化 keys 数组、
     * 还原 boolean/number 字段、判定 scope。
     */
    const normalizeWorldInfoEntry = (entry) => {
        const mergedEntry = { ...entry };
        const ext = entry.extensions || {};
        Object.keys(ext).forEach(key => {
            if (ext[key] !== undefined && ext[key] !== null) {
                mergedEntry[key] = ext[key];
            }
        });
        delete mergedEntry.extensions;

        const toBoolean = (value, defaultValue) => {
            if (value === undefined || value === null) return defaultValue;
            if (typeof value === 'string') {
                if (value.toLowerCase() === 'false') return false;
                if (value.toLowerCase() === 'true') return true;
            }
            return !!value;
        };

        const toNumber = (value, defaultValue) => {
            if (value === undefined || value === null || value === '') return defaultValue;
            const num = Number(value);
            return isNaN(num) ? defaultValue : num;
        };

        let keys = mergedEntry.keys || mergedEntry.key || [];
        if (typeof keys === 'string') {
            keys = keys.split(/[,，]/).map(k => k.trim()).filter(Boolean);
        } else if (!Array.isArray(keys)) {
            keys = [];
        }

        let position = 'at_depth';
        const stPos = mergedEntry.position;
        const validPositions = ['system_top', 'global_note', 'before_char', 'after_char', 'at_depth', 'user_top', 'assistant_top'];

        const posNameMap = {
            'before_character': 'before_char',
            'after_character': 'after_char',
            'character_top': 'before_char',
            'character_bottom': 'after_char',
            'before_examples': 'before_char',
            'after_examples': 'after_char',
            'example_top': 'before_char',
            'example_bottom': 'after_char',
            'an_top': 'global_note',
            'author_note': 'global_note',
            'an_bottom': 'global_note'
        };

        if (typeof stPos === 'string') {
            let lowerPos = stPos.toLowerCase().replace(/ /g, '_');
            if (posNameMap[lowerPos]) {
                lowerPos = posNameMap[lowerPos];
            }
            const foundPos = validPositions.find(p => p === lowerPos);
            if (foundPos) {
                position = foundPos;
            }
        } else if (typeof stPos === 'number' || (typeof stPos === 'string' && !isNaN(Number(stPos)) && validPositions.indexOf(stPos) === -1)) {
            const numPos = Number(stPos);
            const posMap = {
                0: 'before_char',
                1: 'after_char',
                2: 'global_note',
                3: 'global_note',
                4: 'at_depth',
            };
            position = posMap[numPos] !== undefined ? posMap[numPos] : 'at_depth';
        }

        const getValue = (keys, defaultValue) => {
            for (const key of keys) {
                if (mergedEntry[key] !== undefined && mergedEntry[key] !== null) {
                    return mergedEntry[key];
                }
            }
            return defaultValue;
        };

        return {
            comment: getValue(['comment'], ''),
            content: getValue(['content'], ''),
            enabled: toBoolean(getValue(['enabled'], true), true) && !toBoolean(getValue(['disable', 'disabled'], false), false),
            scope: systemWorldInfoNames.includes(getValue(['comment'], '')) || getValue(['scope'], 'character') === 'global' ? 'global' : 'character',

            keys: keys,
            useRegex: toBoolean(getValue(['use_regex', 'useRegex'], false), false),
            constant: toBoolean(getValue(['constant'], false), false),

            position: position,
            order: toNumber(getValue(['insertion_order', 'order'], 0), 0),
            depth: toNumber(getValue(['depth'], 4), 4),
            scanDepth: toNumber(getValue(['scan_depth', 'scanDepth'], null), null),
            probability: toNumber(getValue(['probability'], 100), 100),
            useProbability: toBoolean(getValue(['useProbability', 'use_probability'], true), true),
        };
    };

    /**
     * 导出世界书条目为可交换格式
     */
    const toWorldInfoExportEntry = (entry) => {
        const normalized = normalizeWorldInfoEntry(entry);
        return cardUtils.toWorldInfoExportEntry(normalized);
    };

    /**
     * 获取世界书条目显示名
     */
    const getWorldInfoDisplayName = (entry) => entry.comment || entry.name || '未命名条目';

    /* ================================================================
     * 运行时评估引擎
     * ================================================================ */

    /**
     * 评估当前对话上下文中应触发哪些世界书条目
     *
     * @param {Object} options
     * @param {Array}  options.activeEntries       - 已启用的世界书条目列表
     * @param {Array}  options.chatHistoryMessages - 原始聊天历史
     * @param {Object} options.worldInfoSettings   - { scanDepth, maxDepth }
     * @param {Map}    options.probabilityCache    - 本次生成共享的概率缓存
     * @param {Function} options.getPostprocessedChatMessages - 来自 turnManager
     * @returns {{ entries: Array, entryData: Map, groups: Object }}
     */
    const evaluateWorldInfo = ({
        activeEntries,
        chatHistoryMessages,
        worldInfoSettings,
        probabilityCache,
        getPostprocessedChatMessages,
    }) => {
        const triggered = new Map();
        const postprocessedChatHistory = getPostprocessedChatMessages(chatHistoryMessages, { includeSystem: false });

        activeEntries.forEach(entry => {
            if (entry.constant) {
                triggered.set(entry, { score: Infinity, matchedKeys: ['常驻 (Constant)'] });
                return;
            }

            const rawScanDepth = toNonNegativeNumber(entry.scanDepth ?? worldInfoSettings.scanDepth, 0);
            const maxScanDepth = toNonNegativeNumber(worldInfoSettings.maxDepth, 0);
            const entryScanDepth = maxScanDepth > 0 ? Math.min(rawScanDepth, maxScanDepth) : rawScanDepth;
            if (entryScanDepth === 0 || !entry.keys || entry.keys.length === 0) return;

            const scanText = postprocessedChatHistory.slice(-entryScanDepth).map(m => m.content).join('\n');

            if (entry.keys && entry.keys.length > 0) {
                const result = checkEntryTrigger(entry, scanText, probabilityCache);
                if (result.triggered) {
                    triggered.set(entry, { score: result.score, matchedKeys: result.matchedKeys });
                }
            }
        });

        const sorted = Array.from(triggered.keys()).sort((a, b) => {
            if (a.constant && !b.constant) return -1;
            if (!a.constant && b.constant) return 1;
            return (b.order || 0) - (a.order || 0);
        });

        const groups = {
            system_top: [], global_note: [], before_char: [], after_char: [],
            user_top: [], assistant_top: [], at_depth: []
        };

        sorted.forEach(entry => {
            const pos = entry.position || 'at_depth';
            if (Object.prototype.hasOwnProperty.call(groups, pos)) {
                groups[pos].push(entry);
            } else {
                groups.at_depth.push(entry);
            }
        });

        Object.keys(groups).forEach(key => {
            groups[key].sort((a, b) => (a.order || 0) - (b.order || 0));
        });

        return { entries: sorted, entryData: triggered, groups };
    };

    return {
        normalizeWorldInfoEntry,
        toWorldInfoExportEntry,
        getWorldInfoDisplayName,
        evaluateWorldInfo,
    };
}
