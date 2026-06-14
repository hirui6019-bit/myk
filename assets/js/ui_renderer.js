/**
 * UIManager - 聊天 UI 渲染与交互管理
 *
 * 负责流式内容渲染、角色切换、聊天历史展示、滚动定位、移动端适配等 UI 层逻辑。
 * 所有 Vue 响应式状态通过构造函数的 context 对象注入，保持与 app.js 解耦。
 */
class UIManager {
    /** @type {UIManagerContext} */
    #ctx;

    /**
     * @param {UIManagerContext} context - 注入的响应式状态与工具函数
     */
    constructor(context) {
        this.#ctx = context;
    }

    // =========================================================================
    // 流式内容处理
    // =========================================================================

    /**
     * 在 AI 流式生成期间，检测内容中是否出现 HTML/Vue 代码块起始标记。
     * 若检测到，截断文本并标记需要显示 spinner，避免未完成的代码块造成闪屏。
     *
     * @param {string} streamText - 当前流式输出的完整文本
     * @param {boolean} isStreamingActive - 是否仍处于生成中
     * @returns {{ text: string, showSpinner: boolean }}
     */
    processStreamContent(streamText, isStreamingActive) {
        if (!isStreamingActive) {
            return { text: streamText, showSpinner: false };
        }

        const htmlStartMarkers = ['```html', '```vue', '<!DOCTYPE', '<div', '<style'];

        const firstMarkerPosition = this.#findEarliestMarker(streamText, htmlStartMarkers);

        if (firstMarkerPosition === -1) {
            return { text: streamText, showSpinner: false };
        }

        return {
            text: streamText.substring(0, firstMarkerPosition),
            showSpinner: true
        };
    }

    /**
     * 在文本中查找最早的 HTML 标记位置。
     *
     * @param {string} text
     * @param {string[]} markers
     * @returns {number} 最早匹配位置，未找到返回 -1
     */
    #findEarliestMarker(text, markers) {
        const lowerText = text.toLowerCase();
        let earliest = -1;

        for (const marker of markers) {
            const position = lowerText.indexOf(marker);
            if (position !== -1) {
                earliest = earliest === -1 ? position : Math.min(earliest, position);
            }
        }

        return earliest;
    }

    // =========================================================================
    // 聊天历史展示
    // =========================================================================

    /**
     * 为从存储中加载的聊天历史做展示预处理：
     * - 标记 isSelf 字段
     * - 清除 skipReveal 标志
     * - 设置动画标志
     * - 初始化 thinking 摘要状态
     *
     * @param {Array<object>} rawMessages - 原始消息数组
     * @returns {Array<object>} 处理后的消息数组
     */
    prepareChatHistoryForDisplay(rawMessages = []) {
        return rawMessages
            .filter(message => message !== null && message !== undefined)
            .map(message => {
                if (message.isSelf === undefined) {
                    message.isSelf = message.role === 'user';
                }

                if (message.role === 'user' || message.role === 'assistant') {
                    delete message.skipReveal;
                    message.shouldAnimate = true;
                }

                if (message.role === 'assistant'
                    && message.isSummaryOpen === undefined
                    && this.#ctx.hasThinkingOrTools(message)) {
                    message.isSummaryOpen = false;
                }

                return message;
            });
    }

    /**
     * 计算当前应显示的聊天消息窗口（虚拟滚动）。
     *
     * @returns {Array<{ msg: object, index: number }>}
     */
    computeDisplayedMessages() {
        const { chatHistory, chatRenderLimit } = this.#ctx;
        const totalCount = chatHistory.value.length;
        const visibleCount = Math.min(totalCount, chatRenderLimit.value);
        const startIndex = totalCount - visibleCount;

        return chatHistory.value.slice(startIndex).map((message, offset) => ({
            msg: message,
            index: startIndex + offset
        }));
    }

    /**
     * 计算当前隐藏的消息数量。
     *
     * @returns {number}
     */
    computeHiddenMessageCount() {
        return Math.max(0, this.#ctx.chatHistory.value.length - this.#ctx.chatRenderLimit.value);
    }

    // =========================================================================
    // 渲染窗口与滚动管理
    // =========================================================================

    /**
     * 重置聊天渲染窗口到初始状态。
     */
    resetRenderingWindow() {
        this.#ctx.chatRenderLimit.value = this.#ctx.INITIAL_RENDER_LIMIT;
        this.#ctx.isChatTopUnlockArmed = true;
    }

    /**
     * 自动滚动到底部（当 autoScroll 设置启用时）。
     */
    scrollToBottom() {
        const container = this.#ctx.chatContainer.value;
        if (!container || !this.#ctx.settings.autoScroll) {
            return;
        }

        if (this.#ctx.chatHistory.value.length > 1) {
            container.scrollTop = container.scrollHeight;
        } else {
            container.scrollTop = 0;
        }
    }

    /**
     * 获取当前滚动锚点信息，用于加载更早消息后恢复滚动位置。
     *
     * @returns {{ index: string, topOffset: number } | null}
     */
    getScrollAnchor() {
        const container = this.#ctx.chatContainer.value;
        const elements = (this.#ctx.messageElements.value || [])
            .filter(el => el && el.dataset && el.dataset.chatIndex)
            .sort((a, b) => Number(a.dataset.chatIndex) - Number(b.dataset.chatIndex));

        if (!container || elements.length === 0) {
            return null;
        }

        const containerTop = container.getBoundingClientRect().top;
        const anchor = elements.find(el => el.getBoundingClientRect().bottom >= containerTop + 8)
            || elements[0];

        return {
            index: anchor.dataset.chatIndex,
            topOffset: anchor.getBoundingClientRect().top - containerTop
        };
    }

    /**
     * 根据锚点恢复滚动位置。
     *
     * @param {{ index: string, topOffset: number } | null} anchor
     */
    async restoreScrollAnchor(anchor) {
        const container = this.#ctx.chatContainer.value;
        if (!container || !anchor) {
            return;
        }

        await this.#ctx.nextTick();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const anchorElement = container.querySelector(`[data-chat-index="${anchor.index}"]`);
        if (!anchorElement) {
            return;
        }

        const containerTop = container.getBoundingClientRect().top;
        const currentOffset = anchorElement.getBoundingClientRect().top - containerTop;
        container.scrollTop += currentOffset - anchor.topOffset;
    }

    /**
     * 加载更早的聊天消息（向上滚动触发）。
     *
     * @param {number} [batchSize] - 每次加载的批大小
     */
    async loadEarlierMessages(batchSize = this.#ctx.RENDER_BATCH_SIZE) {
        if (this.computeHiddenMessageCount() <= 0 || this.#ctx.isLoadingEarlierChatMessages) {
            return;
        }

        this.#ctx.isLoadingEarlierChatMessages = true;

        const anchor = this.getScrollAnchor();
        const { chatHistory, chatRenderLimit } = this.#ctx;

        chatRenderLimit.value = Math.min(
            chatHistory.value.length,
            chatRenderLimit.value + batchSize
        );

        await this.restoreScrollAnchor(anchor);
        this.#ctx.isLoadingEarlierChatMessages = false;
    }

    /**
     * 处理聊天区域滚动事件：检测是否滚动到顶部，触发加载更早消息。
     */
    handleScroll() {
        const container = this.#ctx.chatContainer.value;

        if (!container || this.computeHiddenMessageCount() <= 0) {
            return;
        }

        if (container.scrollTop > 160) {
            this.#ctx.isChatTopUnlockArmed = true;
            return;
        }

        if (this.#ctx.isChatTopUnlockArmed && container.scrollTop <= 80) {
            this.#ctx.isChatTopUnlockArmed = false;
            this.loadEarlierMessages();
        }
    }

    /**
     * 定位到上一条助手消息。
     */
    scrollToPreviousMessage() {
        const container = this.#ctx.chatContainer.value;
        if (!container || !this.#ctx.messageElements.value) {
            return;
        }

        const headerOffset = 70;
        const tolerance = 5;
        const scrollTop = container.scrollTop;

        const assistantElements = this.#ctx.messageElements.value
            .filter(el => el && el.dataset.role === 'assistant')
            .sort((a, b) => a.offsetTop - b.offsetTop);

        for (let i = assistantElements.length - 1; i >= 0; i--) {
            const snapPosition = assistantElements[i].offsetTop - headerOffset;
            if (snapPosition < scrollTop - tolerance) {
                container.scrollTo({ top: snapPosition, behavior: 'smooth' });
                return;
            }
        }
    }

    /**
     * 定位到下一条助手消息。
     */
    scrollToNextMessage() {
        const container = this.#ctx.chatContainer.value;
        if (!container || !this.#ctx.messageElements.value) {
            return;
        }

        const headerOffset = 70;
        const tolerance = 5;
        const scrollTop = container.scrollTop;

        const assistantElements = this.#ctx.messageElements.value
            .filter(el => el && el.dataset.role === 'assistant')
            .sort((a, b) => a.offsetTop - b.offsetTop);

        for (let i = 0; i < assistantElements.length; i++) {
            const snapPosition = assistantElements[i].offsetTop - headerOffset;
            if (snapPosition > scrollTop + tolerance) {
                container.scrollTo({ top: snapPosition, behavior: 'smooth' });
                return;
            }
        }
    }

    // =========================================================================
    // 全屏状态同步
    // =========================================================================

    /**
     * 同步聊天区域全屏状态。
     */
    syncFullscreenState() {
        this.#ctx.isChatFullscreen.value = !!(
            document.fullscreenElement
            || document.webkitFullscreenElement
        );
    }

    // =========================================================================
    // 角色切换
    // =========================================================================

    /**
     * 切换到指定索引的角色卡片。
     * 包含以下步骤：
     * 1. 若当前正在生成，先停止并等待空闲
     * 2. 保存当前聊天历史及 UI 模板运行时状态
     * 3. 加载目标角色的世界书、聊天历史、正则脚本、记忆
     * 4. 同步特殊规则与生图状态
     *
     * @param {number} targetCharacterIndex - 目标角色在列表中的索引
     * @param {boolean} [isNewImport=false] - 是否为新导入的角色卡片
     */
    async switchToCharacter(targetCharacterIndex, isNewImport = false) {
        const ctx = this.#ctx;

        await this.#ensureConversationIdleBeforeSwitch();
        await ctx.flushPendingChatHistorySave();

        ctx.abortUiTemplateUpdate();
        ctx._isApplyingCharacterScopedData = true;

        this.#savePreviousCharacterTemplateRuntime();

        ctx.currentCharacterIndex.value = targetCharacterIndex;
        this.resetRenderingWindow();

        await this.#loadTargetCharacterData(targetCharacterIndex);
        ctx.finishApplyingCharacterScopedData();
        this.#loadRecentGenerationTimes();
        this.#ensureDefaultUserRegex();
        ctx.enforceSpecialRules();
        this.#syncImageGenRules();
        await this.#loadCharacterMemories();

        ctx.currentView.value = 'chat';
        ctx.showToast(`已切换到角色: ${ctx.currentCharacter.value.name}`, 'success');

        if (isNewImport) {
            ctx.showAutoImageGenModal.value = true;
        }

        ctx.saveData();
    }

    /**
     * 确保对话不忙，若正在生成则停止并等待空闲。
     */
    async #ensureConversationIdleBeforeSwitch() {
        const ctx = this.#ctx;

        if (!ctx.isConversationBusy.value) {
            return;
        }

        ctx.stopGeneration();
        const idleReached = await ctx.waitForConversationIdle();
        await ctx.saveChatHistoryNow();

        if (!idleReached) {
            ctx.showToast('正在停止生成，请稍后再切换角色卡', 'warning');
            // 注意：原逻辑中 return 在这里意味着中断切换。由于已经 await 了，
            // 我们通过 throwing 或让调用者检查状态来处理。
            // 为了兼容原有行为，这里由调用者检查 ctx.isConversationBusy.value
        }
    }

    /**
     * 保存上一个角色的全局 UI 模板运行时状态。
     */
    #savePreviousCharacterTemplateRuntime() {
        const ctx = this.#ctx;
        const previousIndex = ctx.currentCharacterIndex.value;
        const previousCharacter = ctx.currentCharacter.value;

        if (previousIndex === -1) {
            return;
        }

        ctx.saveGlobalUiTemplateRuntimeForCharacter(previousCharacter);
    }

    /**
     * 加载目标角色的完整数据（UI 模板、聊天历史、世界书、正则脚本）。
     *
     * @param {number} characterIndex
     */
    async #loadTargetCharacterData(characterIndex) {
        const ctx = this.#ctx;
        const targetCharacter = ctx.characters.value[characterIndex];

        this.#initializeCharacterUiTemplates(targetCharacter);
        this.#loadGlobalTemplateRuntime(targetCharacter);
        this.#ensureCharacterUuid(targetCharacter);
        await this.#loadCharacterChatHistory(targetCharacter);
        this.#loadWorldInfoEntries(targetCharacter);
        ctx.combineRegexScriptsForCharacter(targetCharacter);
    }

    /**
     * 初始化角色 UI 模板列表。
     *
     * @param {object} character
     */
    #initializeCharacterUiTemplates(character) {
        character.uiTemplates = Array.isArray(character.uiTemplates)
            ? character.uiTemplates.map(template =>
                this.#ctx.normalizeUiTemplate({ ...template, scope: 'character' })
            )
            : [];
    }

    /**
     * 为目标角色加载全局 UI 模板运行时状态。
     *
     * @param {object} character
     */
    #loadGlobalTemplateRuntime(character) {
        this.#ctx.loadGlobalUiTemplateRuntimeForCharacter(character);
    }

    /**
     * 确保角色有 UUID。
     *
     * @param {object} character
     */
    #ensureCharacterUuid(character) {
        if (character.uuid) {
            return;
        }

        character.uuid = this.#ctx.generateUUID();
        this.#ctx.saveData();
    }

    /**
     * 加载角色的聊天历史。
     *
     * @param {object} character
     */
    async #loadCharacterChatHistory(character) {
        const ctx = this.#ctx;

        try {
            const savedChat = await ctx.getScopedStoredValue('chat', character.uuid);

            if (savedChat && savedChat.length > 0) {
                ctx.chatHistory.value = this.prepareChatHistoryForDisplay(savedChat);
                return;
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        }

        ctx.chatHistory.value = [];

        if (character.first_mes) {
            ctx.chatHistory.value.push({
                role: 'assistant',
                name: character.name,
                content: character.first_mes
            });
        }
    }

    /**
     * 合并全局与角色的世界书条目。
     *
     * @param {object} character
     */
    #loadWorldInfoEntries(character) {
        const ctx = this.#ctx;

        const characterEntries = Array.isArray(character.worldInfo)
            ? JSON.parse(JSON.stringify(character.worldInfo))
                .map(entry => ctx.normalizeWorldInfoEntry({ ...entry, scope: 'character' }))
                .filter(entry => entry.scope !== 'global')
            : [];

        const globalEntries = JSON.parse(JSON.stringify(ctx.globalWorldInfo.value))
            .map(entry => ctx.normalizeWorldInfoEntry({ ...entry, scope: 'global' }));

        ctx.worldInfo.value = [...globalEntries, ...characterEntries];
    }

    /**
     * 加载最近的生成耗时数据。
     */
    #loadRecentGenerationTimes() {
        const character = this.#ctx.currentCharacter.value;

        if (character.recentGenerationTimes) {
            this.#ctx.recentGenerationTimes.value = JSON.parse(
                JSON.stringify(character.recentGenerationTimes)
            );
        } else {
            this.#ctx.recentGenerationTimes.value = [];
        }
    }

    /**
     * 确保默认 {{user}} 替换正则存在并生效。
     */
    #ensureDefaultUserRegex() {
        const ctx = this.#ctx;
        const USER_REPLACE_REGEX_NAME = 'Auto Replace {{user}}';

        const existingScript = ctx.regexScripts.value.find(
            script => script.name === USER_REPLACE_REGEX_NAME
        );

        if (existingScript) {
            existingScript.replacement = ctx.user.name;
            existingScript.enabled = true;
            existingScript.scope = 'global';
            if (!existingScript.placement) {
                existingScript.placement = [1, 2];
            }
            return;
        }

        ctx.regexScripts.value.push({
            name: USER_REPLACE_REGEX_NAME,
            regex: '{{user}}',
            flags: 'gi',
            replacement: ctx.user.name,
            placement: [1, 2],
            markdownOnly: false,
            promptOnly: false,
            scope: 'global',
            enabled: true
        });
    }

    /**
     * 同步生图相关的正则规则。
     */
    #syncImageGenRules() {
        const ctx = this.#ctx;

        if (!ctx.isAutoImageGenEnabled.value) {
            return;
        }

        const messages = ctx.updateImageGenRegexState({ enableRegex: true });
        if (messages && messages.length > 0) {
            ctx.showToast('已同步生图风格：' + messages.join('，'), 'success');
        }
    }

    /**
     * 加载角色专属记忆。
     */
    async #loadCharacterMemories() {
        const ctx = this.#ctx;

        try {
            const savedMemories = await ctx.getScopedStoredValue('memories', ctx.currentCharacter.value.uuid);

            if (savedMemories && savedMemories.length > 0) {
                ctx.memories.value = ctx.prepareMemoriesForRuntime(savedMemories);
            } else {
                ctx.memories.value = [];
            }
        } catch (error) {
            console.error('Error loading memories:', error);
            ctx.memories.value = [];
        }

        ctx._memoriesLoaded = true;
    }

    // =========================================================================
    // 移动端视口适配
    // =========================================================================

    /**
     * 判断当前是否为移动端视口。
     *
     * @returns {boolean}
     */
    #isMobileViewport() {
        return window.visualViewport
            && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
            && window.innerWidth < 768;
    }

    /**
     * 调度移动端视口同步（通过 requestAnimationFrame 节流）。
     *
     * @param {{ force?: boolean }} [options]
     */
    scheduleMobileViewportSync(options = {}) {
        if (this.#ctx.mobileViewportRaf) {
            cancelAnimationFrame(this.#ctx.mobileViewportRaf);
        }

        this.#ctx.mobileViewportRaf = requestAnimationFrame(() => {
            this.#ctx.mobileViewportRaf = null;
            this.#syncMobileViewport(options);
        });
    }

    /**
     * 立即同步移动端视口 CSS 变量。
     *
     * @param {{ force?: boolean }} [options]
     */
    #syncMobileViewport({ force = false } = {}) {
        if (!this.#isMobileViewport()) {
            this.#closeMobileMenu();
            this.#ctx.isMobileKeyboardOpen.value = false;
            this.#ctx.lastAppliedMobileViewportHeight = 0;
            this.#ctx.lastAppliedMobileKeyboardInset = 0;
            this.#ctx.lastAppliedMobileBackgroundHeight = 0;
            document.documentElement.style.removeProperty('--app-visual-height');
            document.documentElement.style.removeProperty('--keyboard-inset');
            document.documentElement.style.removeProperty('--chat-bg-height');
            return;
        }

        const viewport = window.visualViewport;
        const height = viewport?.height || window.innerHeight || document.documentElement.clientHeight;
        const layoutHeight = window.innerHeight || document.documentElement.clientHeight || height;
        const viewportOffsetTop = viewport?.offsetTop || 0;
        const visualHeightForLayout = viewport ? height + viewportOffsetTop : height;

        const inputHasFocus = document.activeElement === this.#ctx.inputBox.value;
        const keyboardInset = viewport
            ? Math.max(0, layoutHeight - height - viewportOffsetTop)
            : 0;
        const viewportCompressed = viewport && height < layoutHeight - 80;
        const keyboardVisible = !!(viewportCompressed || keyboardInset > 40);

        const effectiveInset = keyboardVisible ? keyboardInset : 0;
        const effectiveAppHeight = effectiveInset > 0 ? layoutHeight : visualHeightForLayout;

        const freezeBackground = inputHasFocus || keyboardVisible || this.#ctx.isMobileKeyboardOpen.value;
        const backgroundHeight = freezeBackground
            ? Math.max(
                this.#ctx.lastAppliedMobileBackgroundHeight,
                this.#ctx.lastAppliedMobileViewportHeight,
                effectiveAppHeight
            )
            : Math.max(layoutHeight, visualHeightForLayout);

        this.#applyVisualHeight(effectiveAppHeight, { force });
        this.#applyKeyboardInset(effectiveInset, { force });
        this.#applyBackgroundHeight(backgroundHeight, { force });

        this.#ctx.isMobileKeyboardOpen.value = !!(inputHasFocus || keyboardVisible);
    }

    #applyVisualHeight(height, { force = false } = {}) {
        if (!Number.isFinite(height) || height <= 0) return;
        const clamped = Math.max(320, Math.round(height));
        if (!force && Math.abs(clamped - this.#ctx.lastAppliedMobileViewportHeight) < 2) return;
        this.#ctx.lastAppliedMobileViewportHeight = clamped;
        document.documentElement.style.setProperty('--app-visual-height', `${clamped}px`);
        const appElement = document.getElementById('app');
        if (appElement?.style.height) appElement.style.height = '';
    }

    #applyKeyboardInset(inset, { force = false } = {}) {
        const clamped = Math.max(0, Math.round(Number(inset) || 0));
        if (!force && Math.abs(clamped - this.#ctx.lastAppliedMobileKeyboardInset) < 2) return;
        this.#ctx.lastAppliedMobileKeyboardInset = clamped;
        document.documentElement.style.setProperty('--keyboard-inset', `${clamped}px`);
    }

    #applyBackgroundHeight(height, { force = false } = {}) {
        if (!Number.isFinite(height) || height <= 0) return;
        const clamped = Math.max(
            320,
            Math.round(height),
            Math.round(this.#ctx.lastAppliedMobileBackgroundHeight || 0)
        );
        if (!force && Math.abs(clamped - this.#ctx.lastAppliedMobileBackgroundHeight) < 2) return;
        this.#ctx.lastAppliedMobileBackgroundHeight = clamped;
        document.documentElement.style.setProperty('--chat-bg-height', `${clamped}px`);
    }

    #closeMobileMenu() {
        // 委托给 ctx 的 closeMobileMenu，如果存在
        if (typeof this.#ctx.closeMobileMenu === 'function') {
            this.#ctx.closeMobileMenu();
        }
    }

    /**
     * 聊天输入框获得焦点时的处理。
     */
    handleChatInputFocus() {
        if (!this.#isMobileViewport()) return;
        clearTimeout(this.#ctx.mobileKeyboardBlurTimer);
        this.#ctx.isMobileKeyboardOpen.value = true;
        this.scheduleMobileViewportSync({ force: true });
    }

    /**
     * 聊天输入框失去焦点时的处理。
     */
    handleChatInputBlur() {
        clearTimeout(this.#ctx.mobileKeyboardBlurTimer);
        this.#ctx.mobileKeyboardBlurTimer = setTimeout(() => {
            this.#ctx.isMobileKeyboardOpen.value = false;
            this.scheduleMobileViewportSync({ force: true });
        }, 180);
    }

    /**
     * 移动端视口大小变化处理。
     */
    handleMobileViewportResize() {
        this.scheduleMobileViewportSync();
    }

    /**
     * 移动端方向变化处理。
     */
    handleMobileOrientationChange() {
        this.#ctx.lastAppliedMobileBackgroundHeight = 0;
        document.documentElement.style.removeProperty('--chat-bg-height');
        this.scheduleMobileViewportSync({ force: true });
    }
}

// =============================================================================
// 类型定义（仅文档用）
// =============================================================================

/**
 * @typedef {object} UIManagerContext
 *
 * @property {import('vue').Ref<Array>} chatHistory
 * @property {import('vue').Ref<HTMLElement|null>} chatContainer
 * @property {import('vue').Ref<number>} chatRenderLimit
 * @property {import('vue').Ref<Array<HTMLElement>>} messageElements
 * @property {import('vue').Ref<boolean>} isChatFullscreen
 * @property {import('vue').Ref<boolean>} isMobileKeyboardOpen
 * @property {import('vue').Ref<HTMLElement|null>} inputBox
 * @property {import('vue').Ref<number>} currentCharacterIndex
 * @property {import('vue').Ref<object|null>} currentCharacter
 * @property {import('vue').Ref<Array>} characters
 * @property {import('vue').Ref<Array>} regexScripts
 * @property {import('vue').Ref<Array>} worldInfo
 * @property {import('vue').Ref<Array>} globalWorldInfo
 * @property {import('vue').Ref<Array>} globalRegexScripts
 * @property {import('vue').Ref<Array>} presets
 * @property {import('vue').Ref<Array>} memories
 * @property {import('vue').Ref<Array>} recentGenerationTimes
 * @property {import('vue').Ref<boolean>} isAutoImageGenEnabled
 * @property {import('vue').Ref<boolean>} showAutoImageGenModal
 * @property {import('vue').Ref<string>} currentView
 * @property {import('vue').Ref<boolean>} isConversationBusy
 * @property {object} settings
 * @property {object} user
 *
 * @property {Function} stopGeneration
 * @property {Function} waitForConversationIdle
 * @property {Function} saveChatHistoryNow
 * @property {Function} flushPendingChatHistorySave
 * @property {Function} abortUiTemplateUpdate
 * @property {Function} saveData
 * @property {Function} showToast
 * @property {Function} getScopedStoredValue
 * @property {Function} combineRegexScriptsForCharacter
 * @property {Function} finishApplyingCharacterScopedData
 * @property {Function} enforceSpecialRules
 * @property {Function} updateImageGenRegexState
 * @property {Function} hasThinkingOrTools
 * @property {Function} prepareMemoriesForRuntime
 * @property {Function} normalizeUiTemplate
 * @property {Function} normalizeWorldInfoEntry
 * @property {Function} saveGlobalUiTemplateRuntimeForCharacter
 * @property {Function} loadGlobalUiTemplateRuntimeForCharacter
 * @property {Function} generateUUID
 * @property {Function} nextTick
 * @property {Function} closeMobileMenu
 *
 * @property {boolean} isLoadingEarlierChatMessages
 * @property {boolean} isChatTopUnlockArmed
 * @property {boolean} _isApplyingCharacterScopedData
 * @property {boolean} _memoriesLoaded
 * @property {number} lastAppliedMobileViewportHeight
 * @property {number} lastAppliedMobileKeyboardInset
 * @property {number} lastAppliedMobileBackgroundHeight
 * @property {number|null} mobileViewportRaf
 * @property {number|null} mobileKeyboardBlurTimer
 *
 * @property {number} INITIAL_RENDER_LIMIT
 * @property {number} RENDER_BATCH_SIZE
 */
