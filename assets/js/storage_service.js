/**
 * StorageService - IndexedDB 数据持久化服务（单例模式）
 *
 * 负责所有应用数据的读写、聊天历史管理、记忆持久化、
 * 数据迁移、存储空间管理等。全部使用 async/await 语法。
 */
class StorageService {
    /** @type {StorageService|null} */
    static #instance = null;

    /** @type {IDBDatabase|null} */
    #database = null;

    /** @type {IDBDatabase|null} */
    #legacyDatabase = null;

    /** @type {StorageServiceContext} */
    #context;

    /** @type {number|null} */
    #chatHistorySaveTimer = null;

    // =========================================================================
    // 单例模式
    // =========================================================================

    /**
     * @param {StorageServiceContext} context - 注入的响应式状态与工具函数
     */
    constructor(context) {
        if (StorageService.#instance) {
            return StorageService.#instance;
        }
        this.#context = context;
        StorageService.#instance = this;
    }

    /**
     * 获取单例实例（若未初始化则返回 null）。
     * @returns {StorageService|null}
     */
    static getInstance() {
        return StorageService.#instance;
    }

    // =========================================================================
    // 数据库连接管理
    // =========================================================================

    /**
     * 初始化主数据库及旧版数据库连接。
     * @returns {Promise<IDBDatabase>}
     */
    async initialize() {
        if (this.#database) {
            return this.#database;
        }

        this.#database = await this.#openDatabase(this.#context.DATABASE_NAME);

        await this.#tryOpenLegacyDatabase();

        return this.#database;
    }

    /**
     * 打开指定名称的 IndexedDB 数据库。
     *
     * @param {string} databaseName
     * @returns {Promise<IDBDatabase>}
     */
    async #openDatabase(databaseName) {
        return new Promise((resolve, reject) => {
            const openRequest = indexedDB.open(databaseName, this.#context.DATABASE_VERSION);

            openRequest.onerror = (event) => {
                const errorMessage = `IndexedDB 打开失败 [${databaseName}]: ${event.target.error}`;
                console.error(errorMessage);
                reject(new Error(errorMessage));
            };

            openRequest.onsuccess = (event) => {
                resolve(event.target.result);
            };

            openRequest.onupgradeneeded = (event) => {
                const database = event.target.result;
                if (!database.objectStoreNames.contains(this.#context.STORE_NAME)) {
                    database.createObjectStore(this.#context.STORE_NAME);
                }
            };
        });
    }

    /**
     * 尝试打开旧版数据库以进行数据迁移。
     */
    async #tryOpenLegacyDatabase() {
        try {
            const databaseList = typeof indexedDB.databases === 'function'
                ? await indexedDB.databases()
                : null;

            const legacyDatabaseExists = !databaseList
                || databaseList.some(item => item && item.name === this.#context.LEGACY_DATABASE_NAME);

            if (legacyDatabaseExists) {
                this.#legacyDatabase = await this.#openDatabase(this.#context.LEGACY_DATABASE_NAME);
            }
        } catch (error) {
            console.warn('旧版数据库检查失败:', error);
        }
    }

    /**
     * 检测是否为数据库连接关闭错误。
     *
     * @param {Error|string} error
     * @returns {boolean}
     */
    #isConnectionClosingError(error) {
        const message = String(error?.message || error || '');
        return /connection is closing|database is closing|close pending/i.test(message);
    }

    /**
     * 重新打开主数据库连接。
     * @returns {Promise<IDBDatabase>}
     */
    async #reopenMainDatabase() {
        try {
            if (this.#database) {
                this.#database.close();
            }
        } catch (_) { /* 忽略关闭时的错误 */ }

        this.#database = await this.#openDatabase(this.#context.DATABASE_NAME);
        return this.#database;
    }

    // =========================================================================
    // 数据序列化
    // =========================================================================

    /**
     * 将 Vue 响应式对象递归展开为纯 JavaScript 对象，
     * 移除函数和 undefined 值，处理 Date 和 TypedArray。
     *
     * @param {*} value
     * @param {WeakMap} [seen]
     * @returns {*}
     */
    #unwrapReactiveProxy(value, seen = new WeakMap()) {
        if (value === null || typeof value !== 'object') {
            return value;
        }

        const rawValue = typeof Vue?.toRaw === 'function' ? Vue.toRaw(value) : value;
        if (rawValue === null || typeof rawValue !== 'object') {
            return rawValue;
        }

        if (seen.has(rawValue)) {
            return seen.get(rawValue);
        }

        if (rawValue instanceof Date) {
            return rawValue.toISOString();
        }

        if (ArrayBuffer.isView(rawValue)) {
            return Array.from(rawValue);
        }

        if (rawValue instanceof ArrayBuffer) {
            return Array.from(new Uint8Array(rawValue));
        }

        if (Array.isArray(rawValue)) {
            const resultArray = [];
            seen.set(rawValue, resultArray);
            rawValue.forEach((item, index) => {
                const clonedItem = this.#unwrapReactiveProxy(item, seen);
                resultArray[index] = clonedItem === undefined ? null : clonedItem;
            });
            return resultArray;
        }

        const resultObject = {};
        seen.set(rawValue, resultObject);
        Object.keys(rawValue).forEach(key => {
            const item = rawValue[key];
            if (typeof item === 'function' || typeof item === 'undefined') {
                return;
            }
            resultObject[key] = this.#unwrapReactiveProxy(item, seen);
        });
        return resultObject;
    }

    /**
     * 深拷贝数据用于持久化存储。
     *
     * @param {*} value
     * @returns {*}
     */
    #deepClone(value) {
        const plainValue = this.#unwrapReactiveProxy(value);

        if (typeof structuredClone === 'function') {
            try {
                return structuredClone(plainValue);
            } catch (_) { /* 回退到 JSON 方式 */ }
        }

        return JSON.parse(JSON.stringify(plainValue));
    }

    // =========================================================================
    // 公开的辅助方法（供 app.js 中的 compactMemoryForStorage 等使用）
    // =========================================================================

    /**
     * 将 Vue 响应式对象递归展开为纯 JavaScript 对象。
     * @param {*} value
     * @returns {*}
     */
    unwrapProxy(value) {
        return this.#unwrapReactiveProxy(value);
    }

    /**
     * 深拷贝数据用于持久化存储。
     * @param {*} value
     * @returns {*}
     */
    deepClone(value) {
        return this.#deepClone(value);
    }

    // =========================================================================
    // 存储键名生成
    // =========================================================================

    /**
     * 生成存储键名。
     * @param {string} name
     * @returns {string}
     */
    #makeStorageKey(name) {
        return `${this.#context.STORAGE_PREFIX}${name}`;
    }

    /**
     * 生成旧版存储键名。
     * @param {string} name
     * @returns {string}
     */
    #makeLegacyStorageKey(name) {
        return `${this.#context.LEGACY_STORAGE_PREFIX}${name}`;
    }

    /**
     * 生成带作用域标识的存储键名。
     * @param {string} name
     * @param {string} scopeId
     * @returns {string}
     */
    #makeScopedStorageKey(name, scopeId) {
        return `${this.#makeStorageKey(name)}_${scopeId}`;
    }

    /**
     * 生成带作用域标识的旧版存储键名。
     * @param {string} name
     * @param {string} scopeId
     * @returns {string}
     */
    #makeLegacyScopedStorageKey(name, scopeId) {
        return `${this.#makeLegacyStorageKey(name)}_${scopeId}`;
    }

    // =========================================================================
    // 底层读写操作
    // =========================================================================

    /**
     * 向指定数据库写入键值对。
     *
     * @param {IDBDatabase} targetDatabase
     * @param {string} key
     * @param {*} value
     * @param {{ clone?: boolean }} [options]
     * @returns {Promise<void>}
     */
    async #writeTo(targetDatabase, key, value, options = {}) {
        if (!targetDatabase) {
            throw new Error('数据库未初始化');
        }

        const dataToStore = options.clone === false ? value : this.#deepClone(value);

        return new Promise((resolve, reject) => {
            const transaction = targetDatabase.transaction([this.#context.STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(this.#context.STORE_NAME);
            const putRequest = objectStore.put(dataToStore, key);

            putRequest.onsuccess = () => resolve();
            putRequest.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * 安全写入（自动处理连接关闭错误并重试）。
     *
     * @param {string} key
     * @param {*} value
     * @param {{ clone?: boolean }} [options]
     * @returns {Promise<void>}
     */
    async set(key, value, options = {}) {
        try {
            await this.#writeTo(this.#database, key, value, options);
        } catch (error) {
            if (this.#isConnectionClosingError(error)) {
                await this.#reopenMainDatabase();
                await this.#writeTo(this.#database, key, value, options);
                return;
            }
            throw error;
        }
    }

    /**
     * 从指定数据库读取键值。
     *
     * @param {IDBDatabase} targetDatabase
     * @param {string} key
     * @returns {Promise<*>}
     */
    async #readFrom(targetDatabase, key) {
        if (!targetDatabase) {
            return undefined;
        }

        return new Promise((resolve, reject) => {
            const transaction = targetDatabase.transaction([this.#context.STORE_NAME], 'readonly');
            const objectStore = transaction.objectStore(this.#context.STORE_NAME);
            const getRequest = objectStore.get(key);

            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * 安全读取（自动处理连接关闭错误并重试）。
     *
     * @param {string} key
     * @returns {Promise<*>}
     */
    async get(key) {
        try {
            return await this.#readFrom(this.#database, key);
        } catch (error) {
            if (this.#isConnectionClosingError(error)) {
                await this.#reopenMainDatabase();
                return await this.#readFrom(this.#database, key);
            }
            throw error;
        }
    }

    /**
     * 读取数据，支持从旧版数据库回退。
     *
     * @param {string} key
     * @param {string|null} [legacyKey]
     * @returns {Promise<*>}
     */
    async getWithLegacyFallback(key, legacyKey = null) {
        const currentValue = await this.get(key);

        if (currentValue !== undefined) {
            return currentValue;
        }

        if (!legacyKey || !this.#legacyDatabase) {
            return undefined;
        }

        const legacyValue = await this.#readFrom(this.#legacyDatabase, legacyKey);

        if (legacyValue !== undefined) {
            await this.set(key, legacyValue);
        }

        return legacyValue;
    }

    /**
     * 从指定数据库删除键。
     *
     * @param {IDBDatabase} targetDatabase
     * @param {string} key
     * @returns {Promise<void>}
     */
    async #deleteFrom(targetDatabase, key) {
        if (!targetDatabase) {
            return;
        }

        return new Promise((resolve, reject) => {
            const transaction = targetDatabase.transaction([this.#context.STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(this.#context.STORE_NAME);
            const deleteRequest = objectStore.delete(key);

            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * 安全删除（支持旧版数据库同步删除）。
     *
     * @param {string} key
     * @param {string|null} [legacyKey]
     * @returns {Promise<void>}
     */
    async delete(key, legacyKey = null) {
        await this.#deleteFrom(this.#database, key);

        if (legacyKey && this.#legacyDatabase) {
            await this.#deleteFrom(this.#legacyDatabase, legacyKey);
        }
    }

    // =========================================================================
    // 高级存取方法
    // =========================================================================

    /**
     * 设置全局存储值。
     * @param {string} name
     * @param {*} value
     * @param {{ clone?: boolean }} [options]
     * @returns {Promise<void>}
     */
    async setGlobalValue(name, value, options = {}) {
        await this.set(this.#makeStorageKey(name), value, options);
    }

    /**
     * 获取全局存储值（含旧版回退）。
     * @param {string} name
     * @returns {Promise<*>}
     */
    async getGlobalValue(name) {
        return await this.getWithLegacyFallback(
            this.#makeStorageKey(name),
            this.#makeLegacyStorageKey(name)
        );
    }

    /**
     * 设置带作用域的存储值。
     * @param {string} name
     * @param {string} scopeId
     * @param {*} value
     * @param {{ clone?: boolean }} [options]
     * @returns {Promise<void>}
     */
    async setScopedValue(name, scopeId, value, options = {}) {
        await this.set(this.#makeScopedStorageKey(name, scopeId), value, options);
    }

    /**
     * 获取带作用域的存储值（含旧版回退）。
     * @param {string} name
     * @param {string} scopeId
     * @returns {Promise<*>}
     */
    async getScopedValue(name, scopeId) {
        return await this.getWithLegacyFallback(
            this.#makeScopedStorageKey(name, scopeId),
            this.#makeLegacyScopedStorageKey(name, scopeId)
        );
    }

    /**
     * 删除带作用域的存储值。
     * @param {string} name
     * @param {string} scopeId
     * @returns {Promise<void>}
     */
    async deleteScopedValue(name, scopeId) {
        await this.delete(
            this.#makeScopedStorageKey(name, scopeId),
            this.#makeLegacyScopedStorageKey(name, scopeId)
        );
    }

    // =========================================================================
    // 聊天历史持久化
    // =========================================================================

    /**
     * 立即保存当前角色的聊天历史。
     * @returns {Promise<void>}
     */
    async saveChatHistoryImmediately() {
        if (this.#chatHistorySaveTimer) {
            clearTimeout(this.#chatHistorySaveTimer);
            this.#chatHistorySaveTimer = null;
        }

        const ctx = this.#context;
        if (ctx.currentCharacterIndex.value < 0
            || !ctx.currentCharacter.value
            || !ctx.currentCharacter.value.uuid) {
            return;
        }

        try {
            const historyToSave = this.#deepClone(ctx.chatHistory.value);
            await this.setScopedValue('chat', ctx.currentCharacter.value.uuid, historyToSave, { clone: false });
        } catch (error) {
            console.error('保存聊天历史失败:', error);
        }
    }

    /**
     * 计划延迟保存聊天历史（用于防抖）。
     * 生成中延迟更长以减少写入频率。
     */
    scheduleChatHistorySave() {
        if (this.#chatHistorySaveTimer) {
            clearTimeout(this.#chatHistorySaveTimer);
        }

        const ctx = this.#context;
        const delay = (ctx.isGenerating.value || ctx.isRemoteGenerating.value) ? 1500 : 300;

        this.#chatHistorySaveTimer = setTimeout(() => {
            this.#chatHistorySaveTimer = null;
            this.saveChatHistoryImmediately();
        }, delay);
    }

    /**
     * 立即刷新待处理的聊天历史保存。
     * @returns {Promise<void>}
     */
    async flushPendingChatHistorySave() {
        if (!this.#chatHistorySaveTimer) {
            return;
        }

        await this.saveChatHistoryImmediately();
    }

    // =========================================================================
    // 记忆持久化
    // =========================================================================

    /**
     * 保存记忆设置。
     * @returns {Promise<void>}
     */
    async saveMemorySettings() {
        const ctx = this.#context;

        if (!ctx.isInitComplete) {
            return;
        }

        if (!this.#database) {
            await this.initialize();
        }

        await this.setGlobalValue('memory_settings', this.#deepClone(ctx.memorySettings), { clone: false });
    }

    /**
     * 保存当前角色的记忆。
     * @param {Array} [compactedMemories] - 压缩后的记忆数组
     * @returns {Promise<void>}
     */
    async saveMemories(compactedMemories) {
        const ctx = this.#context;

        if (!ctx.isMemoriesLoaded || !ctx.currentCharacter.value?.uuid) {
            return;
        }

        if (!this.#database) {
            await this.initialize();
        }

        const memoriesToSave = compactedMemories || ctx.memories.value;
        await this.setScopedValue('memories', ctx.currentCharacter.value.uuid, memoriesToSave, { clone: false });
    }

    // =========================================================================
    // 全量保存
    // =========================================================================

    /**
     * 保存全部应用数据到 IndexedDB。
     *
     * @param {{ saveMemories?: boolean }} [options]
     * @returns {Promise<void>}
     */
    async saveAll(options = {}) {
        const { saveMemories: shouldSaveMemories = true } = options;
        const ctx = this.#context;

        try {
            if (!this.#database) {
                await this.initialize();
            }

            ctx.settings.contextSize = ctx.MAX_CONTEXT_SIZE;
            ctx.normalizeActiveToolAggressivenessSettings();

            const saveOperations = [
                this.setGlobalValue('characters', ctx.characters.value),
                this.setGlobalValue('settings', ctx.settings),
                this.setGlobalValue('presets', ctx.presets.value),
                this.setGlobalValue('regex', ctx.regexScripts.value),
                this.setGlobalValue('global_regex', ctx.globalRegexScripts.value),
                this.setGlobalValue('worldinfo', ctx.worldInfo.value),
                this.setGlobalValue('global_worldinfo', ctx.globalWorldInfo.value),
                this.setGlobalValue('worldinfo_settings', ctx.worldInfoSettings),
                this.setGlobalValue('global_ui_templates', ctx.globalUiTemplates.value),
                this.setGlobalValue('active_tools', ctx.normalizeActiveTools(), { clone: false }),
            ];

            await Promise.all(saveOperations);

            // 初始化完成前不写入用户/记忆数据，防止默认值覆盖已有数据
            if (ctx.isInitComplete) {
                await Promise.all([
                    this.setGlobalValue('user', ctx.user),
                    this.setGlobalValue('user_profiles', JSON.parse(JSON.stringify(ctx.userProfiles.value))),
                    ctx.activeProfileId.value
                        ? this.setGlobalValue('active_profile_id', ctx.activeProfileId.value)
                        : Promise.resolve(),
                ]);
            }

            // 保存聊天状态
            if (ctx.currentCharacterIndex.value >= 0) {
                await Promise.all([
                    this.setGlobalValue('last_active_char', ctx.currentCharacterIndex.value),
                    this.saveChatHistoryImmediately(),
                ]);
            }

            // 保存记忆状态
            await Promise.all([
                this.saveMemorySettings(),
                shouldSaveMemories ? this.saveMemories() : Promise.resolve(),
            ]);
        } catch (error) {
            console.error('保存数据失败:', error);

            if (error.name === 'QuotaExceededError') {
                ctx.showToast('存储空间不足，无法保存', 'error');
            }
        }
    }

    /**
     * 保存对话变更（轻量版本）。
     *
     * @param {{ saveTemplateRuntime?: boolean }} [options]
     * @returns {Promise<void>}
     */
    async saveConversationMutation(options = {}) {
        const { saveTemplateRuntime = false } = options;

        try {
            if (!this.#database) {
                await this.initialize();
            }

            const operations = [
                this.saveChatHistoryImmediately(),
                this.saveMemories(),
            ];

            if (saveTemplateRuntime) {
                operations.push(
                    this.setGlobalValue('characters', this.#context.characters.value),
                    this.setGlobalValue('global_ui_templates', this.#context.globalUiTemplates.value),
                );
            }

            await Promise.all(operations);
        } catch (error) {
            console.error('保存对话变更失败:', error);
        }
    }

    // =========================================================================
    // 世界信息状态保存
    // =========================================================================

    /**
     * 保存世界信息相关状态。
     * @returns {Promise<void>}
     */
    async saveWorldInfoState() {
        if (!this.#database) {
            await this.initialize();
        }

        const ctx = this.#context;
        await Promise.all([
            this.setGlobalValue('characters', ctx.characters.value),
            this.setGlobalValue('worldinfo', ctx.worldInfo.value),
            this.setGlobalValue('global_worldinfo', ctx.globalWorldInfo.value),
        ]);
    }

    // =========================================================================
    // 全量加载
    // =========================================================================

    /**
     * 从 IndexedDB 加载全部应用数据并恢复到上下文中。
     * @returns {Promise<void>}
     */
    async loadAll() {
        const ctx = this.#context;

        try {
            await this.initialize();

            // ---- 角色数据 ----
            const savedCharacters = await this.getGlobalValue('characters');
            if (savedCharacters) {
                let needsMigration = false;

                ctx.characters.value = savedCharacters
                    .filter(character => character)
                    .map((character, index) => {
                        if (!character.uuid) {
                            character.uuid = ctx.generateUUID();
                            needsMigration = true;

                            // 尝试迁移旧索引制的聊天历史
                            this.getScopedValue('chat', index).then(oldChat => {
                                if (oldChat) {
                                    this.setScopedValue('chat', character.uuid, oldChat);
                                    this.deleteScopedValue('chat', index);
                                }
                            }).catch(() => {});
                        }

                        if (!character.createdAt) {
                            character.createdAt = Date.now() - (savedCharacters.length - index) * 1000;
                            needsMigration = true;
                        }

                        if (Array.isArray(character.worldInfo)) {
                            character.worldInfo = character.worldInfo
                                .map(ctx.normalizeWorldInfoEntry)
                                .filter(entry => entry.scope !== 'global');
                        }

                        if (Array.isArray(character.regexScripts)) {
                            character.regexScripts = character.regexScripts
                                .map(script => ctx.normalizeRegexScript(script, 'character'))
                                .filter(script => script.scope !== 'global');
                        }

                        character.uiTemplates = Array.isArray(character.uiTemplates)
                            ? character.uiTemplates.map(template =>
                                ctx.normalizeUiTemplate({ ...template, scope: 'character' })
                            )
                            : [];

                        return character;
                    });

                if (needsMigration) {
                    await this.setGlobalValue('characters', ctx.characters.value);
                    console.log('角色数据已迁移至 UUID 和时间戳系统');
                }
            }

            // ---- 设置 ----
            const savedSettings = await this.getGlobalValue('settings');
            if (savedSettings) {
                Object.keys(savedSettings).forEach(key => {
                    if (Object.prototype.hasOwnProperty.call(ctx.settings, key)) {
                        ctx.settings[key] = savedSettings[key];
                    }
                });

                if (!Object.prototype.hasOwnProperty.call(savedSettings, 'apiProviderId')) {
                    const legacyProvider = ctx.getApiProviderByUrl(savedSettings.apiUrl);
                    ctx.settings.apiProviderId = legacyProvider?.id
                        || (savedSettings.apiUrl ? 'custom' : ctx.DEFAULT_API_PROVIDER_ID);
                    if (!legacyProvider && savedSettings.apiUrl) {
                        ctx.settings.customApiUrl = savedSettings.apiUrl;
                    }
                }
                ctx.normalizeApiProviderSettings();
            } else {
                ctx.normalizeApiProviderSettings();
            }

            // 字体迁移
            if ((!savedSettings || Number(savedSettings.fontFamilyVersion || 0) < 4) && ctx.settings.fontFamily === 'serif') {
                ctx.settings.fontFamily = 'modern';
            }
            ctx.settings.fontFamily = ctx.normalizeFontFamily(ctx.settings.fontFamily);
            ctx.settings.fontFamilyVersion = 4;
            ctx.applyFontFamily(ctx.settings.fontFamily);
            delete ctx.settings.renderLayerLimit;
            ctx.settings.contextSize = ctx.MAX_CONTEXT_SIZE;
            ctx.settings.stream = true;
            ctx.normalizeActiveToolAggressivenessSettings();

            // ---- 预设 ----
            const savedPresets = await this.getGlobalValue('presets');
            if (savedPresets) {
                ctx.presets.value = savedPresets.map(ctx.normalizePreset);
            }

            // ---- 正则脚本 ----
            const savedGlobalRegex = await this.getGlobalValue('global_regex');
            if (savedGlobalRegex) {
                ctx.globalRegexScripts.value = savedGlobalRegex.map(script =>
                    ctx.normalizeRegexScript(script, 'global')
                );
            }

            const savedRegex = await this.getGlobalValue('regex');
            if (savedGlobalRegex) {
                ctx.regexScripts.value = JSON.parse(JSON.stringify(ctx.globalRegexScripts.value))
                    .map(script => ctx.normalizeRegexScript(script, 'global'));
            } else if (savedRegex) {
                ctx.regexScripts.value = savedRegex.map(script =>
                    ctx.normalizeRegexScript(script, 'character')
                );
            }

            // ---- 世界信息 ----
            const savedGlobalWorldInfo = await this.getGlobalValue('global_worldinfo');
            if (savedGlobalWorldInfo) {
                ctx.globalWorldInfo.value = savedGlobalWorldInfo.map(entry =>
                    ctx.normalizeWorldInfoEntry({ ...entry, scope: 'global' })
                );
            }

            const savedWorldInfo = await this.getGlobalValue('worldinfo');
            if (savedGlobalWorldInfo) {
                ctx.worldInfo.value = JSON.parse(JSON.stringify(ctx.globalWorldInfo.value))
                    .map(entry => ctx.normalizeWorldInfoEntry({ ...entry, scope: 'global' }));
            } else if (savedWorldInfo) {
                ctx.worldInfo.value = savedWorldInfo.map(ctx.normalizeWorldInfoEntry);
            }

            // ---- UI 模板 ----
            const savedGlobalUiTemplates = await this.getGlobalValue('global_ui_templates');
            if (savedGlobalUiTemplates) {
                ctx.globalUiTemplates.value = savedGlobalUiTemplates.map(template =>
                    ctx.normalizeUiTemplate({ ...template, scope: 'global' })
                );
            }

            // ---- 活跃工具 ----
            const savedActiveTools = await this.getGlobalValue('active_tools');
            ctx.normalizeActiveTools(savedActiveTools || ctx.activeTools.value);

            // ---- 世界信息设置 ----
            const savedWorldInfoSettings = await this.getGlobalValue('worldinfo_settings');
            if (savedWorldInfoSettings) {
                ['scanDepth', 'maxDepth'].forEach(key => {
                    if (savedWorldInfoSettings[key] !== undefined) {
                        ctx.worldInfoSettings[key] = savedWorldInfoSettings[key];
                    }
                });
            }

            // ---- 用户数据 ----
            const savedUser = await this.getGlobalValue('user');
            if (savedUser) {
                Object.assign(ctx.user, savedUser);
            }
            if (!ctx.user.uuid) {
                ctx.user.uuid = ctx.generateUUID();
            }

            const savedProfiles = await this.getGlobalValue('user_profiles');
            const savedActiveProfileId = await this.getGlobalValue('active_profile_id');

            if (savedProfiles && savedProfiles.length > 0) {
                ctx.userProfiles.value = savedProfiles;
                ctx.activeProfileId.value = savedActiveProfileId || savedProfiles[0].uuid;

                const activeProfile = ctx.userProfiles.value.find(
                    profile => profile.uuid === ctx.activeProfileId.value
                );
                if (activeProfile) {
                    Object.assign(ctx.user, activeProfile);
                    if (!ctx.user.uuid) {
                        ctx.user.uuid = ctx.activeProfileId.value;
                    }
                }
            } else {
                // 迁移单用户到多用户配置
                const firstProfile = JSON.parse(JSON.stringify(ctx.user));
                if (!firstProfile.uuid) {
                    firstProfile.uuid = ctx.generateUUID();
                }
                ctx.user.uuid = firstProfile.uuid;
                ctx.userProfiles.value = [firstProfile];
                ctx.activeProfileId.value = firstProfile.uuid;
            }

            // ---- 上次活跃角色 ----
            const lastCharacterIndex = await this.getGlobalValue('last_active_char');
            if (lastCharacterIndex !== undefined) {
                ctx.lastActiveCharacterId.value = lastCharacterIndex;
            }

            // ---- 记忆设置 ----
            const savedMemorySettings = await this.getGlobalValue('memory_settings');
            if (savedMemorySettings) {
                Object.assign(ctx.memorySettings, savedMemorySettings);
            }
            ctx.normalizeMemorySettings();

        } catch (error) {
            console.error('加载保存数据失败:', error);
            ctx.showToast('加载保存的数据失败', 'error');
        }
    }
}

// =============================================================================
// 类型定义（仅文档用）
// =============================================================================

/**
 * @typedef {object} StorageServiceContext
 *
 * @property {string} DATABASE_NAME
 * @property {string} LEGACY_DATABASE_NAME
 * @property {string} STORAGE_PREFIX
 * @property {string} LEGACY_STORAGE_PREFIX
 * @property {string} STORE_NAME
 * @property {number} DATABASE_VERSION
 * @property {number} MAX_CONTEXT_SIZE
 * @property {string} DEFAULT_API_PROVIDER_ID
 *
 * @property {import('vue').Ref<Array>} characters
 * @property {import('vue').Ref<object>} currentCharacter
 * @property {import('vue').Ref<number>} currentCharacterIndex
 * @property {import('vue').Ref<Array>} chatHistory
 * @property {import('vue').Ref<Array>} presets
 * @property {import('vue').Ref<Array>} regexScripts
 * @property {import('vue').Ref<Array>} globalRegexScripts
 * @property {import('vue').Ref<Array>} worldInfo
 * @property {import('vue').Ref<Array>} globalWorldInfo
 * @property {import('vue').Ref<Array>} globalUiTemplates
 * @property {import('vue').Ref<Array>} memories
 * @property {import('vue').Ref<Array>} userProfiles
 * @property {import('vue').Ref<string>} activeProfileId
 * @property {import('vue').Ref<number|null>} lastActiveCharacterId
 * @property {import('vue').Ref<Array>} activeTools
 * @property {import('vue').Ref<boolean>} isGenerating
 * @property {import('vue').Ref<boolean>} isRemoteGenerating
 *
 * @property {object} settings
 * @property {object} user
 * @property {object} worldInfoSettings
 * @property {object} memorySettings
 *
 * @property {boolean} isInitComplete
 * @property {boolean} isMemoriesLoaded
 *
 * @property {Function} generateUUID
 * @property {Function} showToast
 * @property {Function} normalizeWorldInfoEntry
 * @property {Function} normalizeRegexScript
 * @property {Function} normalizeUiTemplate
 * @property {Function} normalizePreset
 * @property {Function} normalizeFontFamily
 * @property {Function} applyFontFamily
 * @property {Function} normalizeApiProviderSettings
 * @property {Function} getApiProviderByUrl
 * @property {Function} normalizeActiveTools
 * @property {Function} normalizeActiveToolAggressivenessSettings
 * @property {Function} normalizeMemorySettings
 */
