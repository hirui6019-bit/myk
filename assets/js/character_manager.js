import {
    SYSTEM_REGEX_NAMES as systemRegexNames,
    SYSTEM_WORLD_INFO_NAMES as systemWorldInfoNames,
} from './constants.js';
import { waitForCardUtils } from './utils.js';

const { computed } = Vue;

export function createCharacterManager({
    characters,
    editingCharacter,
    showCharacterEditor,
    editorTab,
    showAddCharacterMenu,
    currentCharacterIndex,
    chatHistory,
    isBatchDeleteMode,
    selectedCharacterIndices,
    characterDisplayLimit,
    characterSearchQuery,
    showCharacterExportModal,
    characterToExportIndex,
    currentCharacter,

    showToast,
    confirmAction,
    saveData,
    scrollToBottom,
    nextTick,

    generateUUID,
    compressImage,
    defaultAvatar,
    cardUtils,

    normalizeRegexScript,
    normalizeUiTemplate,
    sanitizeUiTemplateImportEntry,
    normalizeWorldInfoEntry,

    deleteScopedStoredValue,
    getScopedStoredValue,
    setScopedStoredValue,

    toWorldInfoExportEntry,
    toUiTemplateExportEntry,
    toRegexExportEntry,

    selectCharacter,
}) {
    const getCharacterFavoriteTime = (char) => {
        const time = Number(char?.favoriteAt || 0);
        return Number.isFinite(time) && time > 0 ? time : 0;
    };

    const isCharacterFavorite = (char) => getCharacterFavoriteTime(char) > 0;

    const getCharacterWICount = (char) => {
        if (!char.worldInfo) return 0;
        return char.worldInfo.filter(w => !systemWorldInfoNames.includes(w.comment)).length;
    };

    const getCharacterRegexCount = (char) => {
        if (!char.regexScripts) return 0;
        return char.regexScripts.filter(r => !systemRegexNames.includes(r.name || r.scriptName)).length;
    };

    const filteredCharacters = computed(() => {
        let result = characters.value.map((char, index) => ({ ...char, originalIndex: index }));

        if (characterSearchQuery.value) {
            const query = characterSearchQuery.value.toLowerCase();
            result = result.filter(char =>
                char.name.toLowerCase().includes(query) ||
                (char.description && char.description.toLowerCase().includes(query))
            );
        }

        result.sort((a, b) => {
            const favoriteDiff = getCharacterFavoriteTime(b) - getCharacterFavoriteTime(a);
            if (favoriteDiff !== 0) return favoriteDiff;
            const timeA = a.createdAt || 0;
            const timeB = b.createdAt || 0;
            if (timeB !== timeA) return timeB - timeA;
            return (b.uuid || '').localeCompare(a.uuid || '');
        });

        return result;
    });

    const displayedCharacters = computed(() => {
        return filteredCharacters.value.slice(0, characterDisplayLimit.value);
    });

    const loadMoreCharacters = () => {
        characterDisplayLimit.value += 8;
    };

    const createNewCharacter = () => {
        editingCharacter.id = undefined;
        editingCharacter.data = {
            name: 'New Character',
            description: '',
            first_mes: 'Hello!',
            avatar: defaultAvatar,
            personality: '',
            scenario: '',
            mes_example: '',
            uuid: generateUUID(),
            createdAt: Date.now(),
            uiTemplates: []
        };
        editorTab.value = 'basic';
        showCharacterEditor.value = true;
    };

    const editCharacter = (index) => {
        const char = characters.value[index];
        if (!char) {
            console.error('Invalid character index:', index);
            return;
        }
        editingCharacter.id = index;
        editingCharacter.data = JSON.parse(JSON.stringify(char));
        editorTab.value = 'basic';
        showCharacterEditor.value = true;
    };

    const saveCharacter = () => {
        const characterRegexScripts = (editingCharacter.data.regexScripts || [])
            .map(script => normalizeRegexScript({ ...script, scope: 'character' }, 'character'))
            .filter(script => script.scope !== 'global');
        const normalizedCharacterData = {
            ...editingCharacter.data,
            regexScripts: characterRegexScripts,
            uiTemplates: (editingCharacter.data.uiTemplates || []).map(template => normalizeUiTemplate({ ...template, scope: 'character' }))
        };
        if (editingCharacter.id !== undefined) {
            characters.value[editingCharacter.id] = normalizedCharacterData;
        } else {
            characters.value.push(normalizedCharacterData);
        }
        showCharacterEditor.value = false;
        showToast('角色已保存', 'success');
    };

    const deleteCharacter = (index) => {
        confirmAction('确定要删除这个角色吗？此操作无法撤销。', async () => {
            try {
                const char = characters.value[index];
                if (char && char.uuid) {
                    await deleteScopedStoredValue('chat', char.uuid);
                }

                characters.value.splice(index, 1);
                if (currentCharacterIndex.value === index) {
                    currentCharacterIndex.value = -1;
                    chatHistory.value = [];
                } else if (currentCharacterIndex.value > index) {
                    currentCharacterIndex.value--;
                }
                showToast('角色已删除', 'success');
            } catch (err) {
                console.error('Failed to delete character or associated data:', err);
                showToast('删除角色失败', 'error');
            }
        });
    };

    const toggleCharacterFavorite = (index) => {
        const char = characters.value[index];
        if (!char) return;

        if (isCharacterFavorite(char)) {
            const { favoriteAt, ...characterData } = char;
            characters.value[index] = characterData;
            showToast('已取消收藏', 'info');
        } else {
            characters.value[index] = {
                ...char,
                favoriteAt: Date.now()
            };
            showToast('已收藏角色卡', 'success');
        }
        saveData({ saveMemories: false });
    };

    const toggleBatchDeleteMode = () => {
        isBatchDeleteMode.value = !isBatchDeleteMode.value;
        selectedCharacterIndices.value.clear();
    };

    const toggleCharacterSelection = (index) => {
        if (selectedCharacterIndices.value.has(index)) {
            selectedCharacterIndices.value.delete(index);
        } else {
            selectedCharacterIndices.value.add(index);
        }
    };

    const batchDeleteCharacters = () => {
        if (selectedCharacterIndices.value.size === 0) return;

        confirmAction(`确定要删除选中的 ${selectedCharacterIndices.value.size} 个角色吗？此操作无法撤销。`, async () => {
            try {
                const currentUUID = currentCharacter.value ? currentCharacter.value.uuid : null;
                const indices = Array.from(selectedCharacterIndices.value).sort((a, b) => b - a);

                for (const index of indices) {
                    const char = characters.value[index];
                    if (char && char.uuid) {
                        await deleteScopedStoredValue('chat', char.uuid);
                    }
                    characters.value.splice(index, 1);
                }

                if (currentUUID) {
                    const newIndex = characters.value.findIndex(c => c.uuid === currentUUID);
                    currentCharacterIndex.value = newIndex;
                    if (newIndex === -1) chatHistory.value = [];
                } else {
                    currentCharacterIndex.value = -1;
                }

                showToast('删除成功', 'success');
                toggleBatchDeleteMode();
            } catch (err) {
                console.error('Batch delete failed:', err);
                showToast('删除失败', 'error');
            }
        });
    };

    const handleAvatarUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    editingCharacter.data.avatar = await compressImage(e.target.result, 400, 0.8);
                } catch (err) {
                    editingCharacter.data.avatar = e.target.result;
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const importCharacter = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        showAddCharacterMenu.value = false;

        event.target.value = '';

        const processCharacterData = async (rawData, avatarUrl) => {
            try {
                console.log('Processing Raw Data:', rawData);
                let charData = rawData;
                let characterBook = null;
                let regexScripts = null;
                let uiTemplates = null;

                if (rawData.data) {
                    charData = rawData.data;
                }

                const discardRemovedCardFields = (target) => {
                    if (!target || typeof target !== 'object') return;
                    [
                        'mes_example',
                        'system_prompt',
                        'post_history_instructions',
                        'alternate_greetings',
                        'tags',
                        'creator',
                        'character_version',
                        'spec',
                        'spec_version'
                    ].forEach(field => delete target[field]);
                    if (target.extensions && typeof target.extensions === 'object') {
                        delete target.extensions.world;
                        delete target.extensions.depth_prompt;
                    }
                };
                discardRemovedCardFields(rawData);
                discardRemovedCardFields(rawData.data);
                discardRemovedCardFields(charData);

                const name = charData.name || charData.char_name || 'Unknown';
                const description = charData.description || charData.char_persona || '';
                const personality = charData.personality || '';
                const scenario = charData.scenario || '';
                const first_mes = charData.first_mes || '';
                const creator_notes = charData.creator_notes || charData.creatorcomment || charData.creator_comment || '';

                if (charData.character_book) {
                    characterBook = charData.character_book;
                } else if (rawData.character_book) {
                    characterBook = rawData.character_book;
                }

                if (charData.extensions && charData.extensions.regex_scripts) {
                    regexScripts = charData.extensions.regex_scripts;
                } else if (rawData.extensions && rawData.extensions.regex_scripts) {
                    regexScripts = rawData.extensions.regex_scripts;
                } else if (charData.regex_scripts || rawData.regex_scripts) {
                    regexScripts = charData.regex_scripts || rawData.regex_scripts;
                }

                uiTemplates = charData.uiTemplates
                    || charData.ui_templates
                    || rawData.uiTemplates
                    || rawData.ui_templates
                    || charData.extensions?.ui_templates
                    || charData.extensions?.rp_hub_ui_templates
                    || rawData.extensions?.ui_templates
                    || rawData.extensions?.rp_hub_ui_templates
                    || null;

                const char = {
                    name,
                    description,
                    first_mes,
                    avatar: avatarUrl || defaultAvatar,
                    personality,
                    scenario,
                    creator_notes,
                    worldInfo: [],
                    regexScripts: [],
                    uiTemplates: Array.isArray(uiTemplates) ? uiTemplates.map(t => normalizeUiTemplate({ ...sanitizeUiTemplateImportEntry(t), id: generateUUID(), scope: 'character' })) : [],
                    recentGenerationTimes: [],
                    uuid: generateUUID(),
                    createdAt: Date.now()
                };

                let entries = [];
                if (characterBook) {
                    if (Array.isArray(characterBook.entries)) {
                        entries = characterBook.entries;
                    } else if (typeof characterBook.entries === 'object' && characterBook.entries !== null) {
                        entries = Object.values(characterBook.entries);
                    } else if (Array.isArray(characterBook)) {
                        entries = characterBook;
                    }
                }

                if (entries.length > 0) {
                    char.worldInfo = entries
                        .map(entry => normalizeWorldInfoEntry({ ...entry, scope: 'character' }))
                        .filter(entry => entry.scope !== 'global');
                    console.log(`Imported and normalized ${char.worldInfo.length} World Info entries.`);
                }

                if (Array.isArray(regexScripts)) {
                    char.regexScripts = regexScripts.map(script => {
                        const normalized = {
                            ...script,
                        };

                        if (!normalized.name && script.scriptName) {
                            normalized.name = script.scriptName;
                        }
                        if (!normalized.name) {
                            normalized.name = 'Regex Script';
                        }

                        if (!normalized.regex && script.findRegex) {
                            normalized.regex = script.findRegex;
                        }
                        if (!normalized.regex) {
                            normalized.regex = '';
                        }

                        if (normalized.regex.startsWith('/') && normalized.regex.lastIndexOf('/') > 0) {
                            const lastSlash = normalized.regex.lastIndexOf('/');
                            const potentialFlags = normalized.regex.substring(lastSlash + 1);
                            if (/^[gimsuy]*$/.test(potentialFlags)) {
                                normalized.flags = potentialFlags;
                                normalized.regex = normalized.regex.substring(1, lastSlash);
                            }
                        }

                        if (!normalized.replacement && script.replaceString) {
                            normalized.replacement = script.replaceString;
                        }

                        if (!normalized.flags && script.regexFlags) {
                            normalized.flags = script.regexFlags;
                        }
                        if (!normalized.flags) {
                            normalized.flags = 'g';
                        }

                        if (!normalized.hasOwnProperty('enabled')) {
                            normalized.enabled = script.hasOwnProperty('disabled') ? !script.disabled : true;
                        }

                        if (!normalized.placement) normalized.placement = script.placement || [1, 2];
                        if (normalized.markdownOnly === undefined) normalized.markdownOnly = script.markdownOnly || false;
                        if (normalized.promptOnly === undefined) normalized.promptOnly = script.promptOnly || false;
                        if (normalized.runOnEdit === undefined) normalized.runOnEdit = script.runOnEdit || false;
                        if (normalized.minDepth === undefined) normalized.minDepth = script.minDepth || null;
                        if (normalized.maxDepth === undefined) normalized.maxDepth = script.maxDepth || null;

                        return normalizeRegexScript({ ...normalized, scope: 'character' }, 'character');
                    }).filter(script => script.scope !== 'global');

                    const enabledScripts = char.regexScripts.filter(s => s.enabled !== false);
                    console.log(`✓ Imported ${char.regexScripts.length} Regex scripts.`);
                    if (enabledScripts.length > 0) {
                        console.log(`✓ Default enabled regex scripts (${enabledScripts.length}):`);
                        enabledScripts.forEach(script => {
                            console.log(`  - ${script.name || script.scriptName || 'Unnamed'} (regex: ${(script.regex || script.findRegex || '').substring(0, 50)}...)`);
                        });
                    } else {
                        console.log(`⚠ No regex scripts enabled by default.`);
                    }
                }

                characters.value.push(char);

                const newCharacterIndex = characters.value.length - 1;
                showAddCharacterMenu.value = false;
                await selectCharacter(newCharacterIndex, true);

            } catch (err) {
                console.error("Character processing error:", err);
                showToast('解析角色数据失败: ' + err.message, 'error');
            }
        };

        if (file.type === 'application/json') {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    await processCharacterData(data, null);
                } catch (err) {
                    showToast('JSON解析失败: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);
        } else if (file.type === 'image/png' || file.name.endsWith('.png')) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const buffer = e.target.result;
                    const utils = await waitForCardUtils();
                    const { data } = utils.parsePngCharacterData(buffer);
                    const blob = new Blob([buffer], { type: 'image/png' });
                    const avatarUrl = await utils.blobToDataUrl(blob);
                    await processCharacterData(data, avatarUrl);
                } catch (err) {
                    if (err.chunks) console.warn("Available chunks:", Object.keys(err.chunks));
                    console.error(err);
                    showToast('PNG解析失败: ' + err.message, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        } else if (file.name.endsWith('.jsonl')) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const text = e.target.result;
                    const lines = text.split('\n').filter(line => line.trim() !== '');
                    const importedChat = lines.map(line => JSON.parse(line));

                    if (importedChat.length > 0) {
                        if (currentCharacterIndex.value >= 0) {
                            const char = characters.value[currentCharacterIndex.value];
                            chatHistory.value = importedChat;

                            if (char.uuid) {
                                await setScopedStoredValue('chat', char.uuid, chatHistory.value);
                            } else {
                                await setScopedStoredValue('chat', currentCharacterIndex.value, chatHistory.value);
                            }

                            showToast(`成功为 ${char.name} 导入 ${importedChat.length} 条聊天记录`, 'success');
                            await nextTick();
                            scrollToBottom();
                        } else {
                            showToast('请先选择一个角色才能导入聊天记录', 'warning');
                        }
                    } else {
                        showToast('文件中没有有效的聊天记录', 'warning');
                    }
                } catch (err) {
                    console.error('Chat import error:', err);
                    showToast('聊天记录解析失败: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);
        } else {
            showToast('不支持的文件格式', 'error');
        }
    };

    const buildCharacterExportData = (char) => cardUtils.buildCharacterCardData(char, {
        worldInfoMapper: (entry) => toWorldInfoExportEntry({ ...entry, scope: 'character' }),
        uiTemplateMapper: (template) => toUiTemplateExportEntry({ ...template, scope: 'character' }),
        regexScriptMapper: (script) => toRegexExportEntry({ ...script, scope: 'character' }, 'character')
    });

    const exportCharacterJson = (index) => {
        const char = characters.value[index];
        if (!char) return;

        try {
            const v2Data = buildCharacterExportData(char);
            const blob = new Blob([JSON.stringify(v2Data, null, 2)], { type: 'application/json' });
            cardUtils.downloadBlob(blob, (char.name || 'character') + '.json');
            showToast('角色卡 JSON 导出成功', 'success');
        } catch (e) {
            console.error('JSON export error:', e);
            showToast('JSON 导出失败: ' + e.message, 'error');
        }
    };

    const exportCharacterChat = async (index) => {
        const char = characters.value[index];
        if (!char) return;

        try {
            let savedChat = null;
            if (char.uuid) {
                savedChat = await getScopedStoredValue('chat', char.uuid);
            }
            if (!savedChat) {
                savedChat = await getScopedStoredValue('chat', index);
            }

            if (savedChat && Array.isArray(savedChat) && savedChat.length > 0) {
                const chatLines = savedChat.map(msg => JSON.stringify(msg)).join('\n');
                const chatBlob = new Blob([chatLines], { type: 'application/json lines' });
                cardUtils.downloadBlob(chatBlob, (char.name || 'character') + '_chat.jsonl');
                showToast('聊天记录导出成功', 'success');
            } else {
                showToast('当前角色没有可导出的聊天记录', 'warning');
            }
        } catch (chatExpError) {
            console.error('Chat export error:', chatExpError);
            showToast('聊天记录导出失败', 'error');
        }
    };

    const exportCharacterPng = async (index) => {
        const char = characters.value[index];
        if (!char) return;

        try {
            const v2Data = buildCharacterExportData(char);
            const pngBytes = await cardUtils.imageUrlToPngBytes(char.avatar, { crossOrigin: "Anonymous" });
            const finalPng = cardUtils.injectPngTextChunk(
                pngBytes,
                'chara',
                cardUtils.encodeBase64Utf8(JSON.stringify(v2Data))
            );
            cardUtils.downloadBlob(new Blob([finalPng], { type: 'image/png' }), (char.name || 'character') + '.png');
            showToast('角色卡 PNG 导出成功', 'success');
        } catch (e) {
            console.error('PNG export error:', e);
            showToast('PNG 导出失败: ' + e.message, 'error');
        }
    };

    const exportCharacter = (index) => exportCharacterPng(index);

    const openCharacterExportModal = (index) => {
        characterToExportIndex.value = index;
        showCharacterExportModal.value = true;
    };

    const confirmCharacterExport = (type) => {
        showCharacterExportModal.value = false;
        if (characterToExportIndex.value !== null) {
            if (type === 'json') {
                exportCharacterJson(characterToExportIndex.value);
            } else if (type === 'chat') {
                exportCharacterChat(characterToExportIndex.value);
            } else {
                exportCharacterPng(characterToExportIndex.value);
            }
            characterToExportIndex.value = null;
        }
    };

    return {
        createNewCharacter,
        editCharacter,
        saveCharacter,
        deleteCharacter,
        toggleCharacterFavorite,
        isCharacterFavorite,
        getCharacterFavoriteTime,
        toggleBatchDeleteMode,
        toggleCharacterSelection,
        batchDeleteCharacters,
        handleAvatarUpload,
        importCharacter,
        buildCharacterExportData,
        exportCharacterJson,
        exportCharacterChat,
        exportCharacterPng,
        exportCharacter,
        openCharacterExportModal,
        confirmCharacterExport,
        getCharacterWICount,
        getCharacterRegexCount,
        filteredCharacters,
        displayedCharacters,
        loadMoreCharacters,
    };
}
