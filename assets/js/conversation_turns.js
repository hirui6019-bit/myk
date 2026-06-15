/**
 * 对话轮次管理器
 *
 * 提供对话历史消息的标准化、合并、轮次分组和查询能力。
 * 所有函数为纯数据变换，不修改输入的响应式状态。
 *
 * @param {Object} ctx
 * @param {import('vue').Ref<Array>} ctx.chatHistory - Vue ref 包装的对话历史数组
 * @returns {Object} 对话轮次相关方法集合
 */
export function createConversationTurnManager({ chatHistory }) {

    /**
     * 提取消息的源索引数组
     */
    const getMessageSourceIndexes = (message, index, trackSources) => {
        const source = message?._sourceIndexes;
        if (!Array.isArray(source)) return trackSources ? [index] : [];
        const indexes = [];
        for (let i = 0; i < source.length; i++) {
            indexes.push(source[i]);
        }
        return indexes;
    };

    /**
     * 将消息转为纯上下文对象（去除 UI 专用字段）
     */
    const toPlainContextMessage = (message, index, trackSources = false) => {
        const nextMessage = {
            role: message.role,
            name: message.name,
            content: String(message.content || '')
        };
        if (message.id) nextMessage.id = message.id;
        if (trackSources) {
            nextMessage._sourceIndexes = getMessageSourceIndexes(message, index, true);
        } else if (Array.isArray(message?._sourceIndexes)) {
            nextMessage._sourceIndexes = getMessageSourceIndexes(message, index, false);
        }
        if (Array.isArray(message?._worldInfoEntries)) {
            nextMessage._worldInfoEntries = message._worldInfoEntries;
        }
        return nextMessage;
    };

    /**
     * 合并连续同角色消息（默认合并连续 user/user 和 assistant/assistant）
     */
    const mergeConsecutiveRoleMessages = (messages, options = {}) => {
        const {
            mergeRoles = ['user', 'assistant'],
            includeSystem = true,
            trackSources = false
        } = options;
        const mergeRoleSet = new Set(mergeRoles);
        const merged = [];
        (Array.isArray(messages) ? messages : []).forEach((message, index) => {
            if (!message || typeof message !== 'object') return;
            if (!includeSystem && message.role === 'system') return;

            const nextMessage = toPlainContextMessage(message, index, trackSources);

            const previous = merged[merged.length - 1];
            if (
                previous
                && previous.role === nextMessage.role
                && mergeRoleSet.has(nextMessage.role)
            ) {
                previous.content = [previous.content, nextMessage.content].filter(Boolean).join('\n\n');
                if (!previous.name && nextMessage.name) previous.name = nextMessage.name;
                if (trackSources || previous._sourceIndexes || nextMessage._sourceIndexes) {
                    previous._sourceIndexes = [
                        ...(previous._sourceIndexes || []),
                        ...(nextMessage._sourceIndexes || [])
                    ];
                }
                if (previous._worldInfoEntries || nextMessage._worldInfoEntries) {
                    previous._worldInfoEntries = [
                        ...(previous._worldInfoEntries || []),
                        ...(nextMessage._worldInfoEntries || [])
                    ];
                }
                return;
            }
            merged.push(nextMessage);
        });
        return merged;
    };

    /**
     * 后处理上下文消息（合并连续 user/assistant 消息）
     */
    const postprocessContextMessages = (messages) => mergeConsecutiveRoleMessages(messages, {
        mergeRoles: ['user', 'assistant'],
        includeSystem: true
    });

    /**
     * 获取已后处理的消息列表，默认使用当前 chatHistory
     */
    const getPostprocessedChatMessages = (messages = chatHistory.value, options = {}) => {
        const { includeSystem = false } = options;
        return mergeConsecutiveRoleMessages(messages, {
            mergeRoles: ['user', 'assistant'],
            includeSystem,
            trackSources: true
        });
    };

    /**
     * 构建对话轮次快照
     * @returns {{ messages: Array, turns: Array }}
     */
    const buildConversationTurnSnapshot = (messages = chatHistory.value, options = {}) => {
        const { includeSystem = false, alreadyPostprocessed = false } = options;
        const processedMessages = alreadyPostprocessed
            ? (Array.isArray(messages) ? messages : [])
                .filter(message => message && typeof message === 'object' && (includeSystem || message.role !== 'system'))
                .map((message, index) => {
                    const nextMessage = toPlainContextMessage(message, index, false);
                    nextMessage._sourceIndexes = getMessageSourceIndexes(message, index, true);
                    return nextMessage;
                })
            : getPostprocessedChatMessages(messages, { includeSystem });

        const turns = [];
        let pendingUser = null;

        processedMessages.forEach((message, messageIndex) => {
            if (!message || message.role === 'system') return;

            const sourceIndexes = Array.isArray(message._sourceIndexes) ? message._sourceIndexes : [messageIndex];
            const sourceStartIndex = sourceIndexes.length ? Math.min(...sourceIndexes) : messageIndex;
            const sourceEndIndex = sourceIndexes.length ? Math.max(...sourceIndexes) : messageIndex;

            if (message.role === 'user') {
                pendingUser = {
                    message,
                    messageIndex,
                    sourceIndexes,
                    sourceStartIndex,
                    sourceEndIndex
                };
                return;
            }

            if (message.role !== 'assistant' || !pendingUser) return;

            const turn = turns.length + 1;
            turns.push({
                turn,
                user: pendingUser.message,
                assistant: message,
                messages: [pendingUser.message, message],
                messageIndexes: [pendingUser.messageIndex, messageIndex],
                sourceIndexes: [...pendingUser.sourceIndexes, ...sourceIndexes],
                startIndex: pendingUser.sourceStartIndex,
                endIndex: sourceEndIndex
            });
            pendingUser = null;
        });

        return { messages: processedMessages, turns };
    };

    /**
     * 创建二分查找函数：给定消息索引，找该索引之前最后一个完整轮次的 turn 号
     */
    const createCompletedTurnBeforeIndexResolver = (snapshot = buildConversationTurnSnapshot()) => {
        const turns = Array.isArray(snapshot?.turns)
            ? [...snapshot.turns].sort((a, b) => (a.endIndex || 0) - (b.endIndex || 0))
            : [];

        return (index) => {
            if (!Number.isFinite(index) || index <= 0) return null;
            let left = 0;
            let right = turns.length - 1;
            let matchedTurn = null;

            while (left <= right) {
                const middle = Math.floor((left + right) / 2);
                const turn = turns[middle];
                if ((turn.endIndex || 0) < index) {
                    matchedTurn = turn.turn;
                    left = middle + 1;
                } else {
                    right = middle - 1;
                }
            }

            return matchedTurn;
        };
    };

    /**
     * 从快照中查找某消息索引所在的轮次号
     */
    const getConversationTurnAtIndexFromSnapshot = (snapshot, index) => {
        if (!Number.isFinite(index) || index < 0) return null;
        const turns = Array.isArray(snapshot?.turns) ? snapshot.turns : [];
        const matchedTurn = turns.find(turn => (turn.sourceIndexes || []).includes(index));
        if (matchedTurn) return matchedTurn.turn;
        const previousTurns = turns.filter(turn => turn.endIndex < index).length;
        return previousTurns + 1;
    };

    /**
     * 查找某消息索引的轮次号（实时构建快照）
     */
    const getConversationTurnAtIndex = (index) => {
        return getConversationTurnAtIndexFromSnapshot(buildConversationTurnSnapshot(), index);
    };

    /**
     * 查找某消息索引之前最后一个已完成轮次的 turn 号
     */
    const getCompletedConversationTurnBeforeIndex = (index) => {
        if (!Number.isFinite(index) || index <= 0) return null;
        return createCompletedTurnBeforeIndexResolver()(index);
    };

    /**
     * 获取最近一个完整的对话轮次
     */
    const getLatestCompleteConversationTurn = () => {
        const snapshot = buildConversationTurnSnapshot();
        return snapshot.turns[snapshot.turns.length - 1] || null;
    };

    return {
        getMessageSourceIndexes,
        toPlainContextMessage,
        mergeConsecutiveRoleMessages,
        postprocessContextMessages,
        getPostprocessedChatMessages,
        buildConversationTurnSnapshot,
        createCompletedTurnBeforeIndexResolver,
        getConversationTurnAtIndexFromSnapshot,
        getConversationTurnAtIndex,
        getCompletedConversationTurnBeforeIndex,
        getLatestCompleteConversationTurn,
    };
}
