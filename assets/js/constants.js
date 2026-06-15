// =============================================================================
// constants.js - 配置与常量层
//
// 所有默认配置、选项对象、硬编码字符串常量。
// 纯数据定义，不依赖 Vue 响应式状态或外部模块。
// =============================================================================

// ---------------------------------------------------------------------------
// 系统标识常量
// ---------------------------------------------------------------------------

export const SYSTEM_REGEX_NAMES = ['Auto Replace {{user}}', 'NAI画图正则'];
export const SYSTEM_WORLD_INFO_NAMES = ['自动生图'];

// 兼容旧命名
export const systemRegexNames = SYSTEM_REGEX_NAMES;
export const systemWorldInfoNames = SYSTEM_WORLD_INFO_NAMES;

// ---------------------------------------------------------------------------
// API 配置
// ---------------------------------------------------------------------------

export const IMAGE_GEN_BASE_URL = 'https://nai.sta1n.cn';
export const DEFAULT_API_PROVIDER_ID = 'sta1n';
export const DEFAULT_API_CONFIG = {
    apiUrl: 'https://cdn.sta1n.cn/v1',
    apiKey: '',
    model: '',
    qualityModel: '',
    balancedModel: '',
    fastModel: ''
};

// ---------------------------------------------------------------------------
// API 提供商选项
// ---------------------------------------------------------------------------

export const API_PROVIDER_OPTIONS = [
    {
        id: 'sta1n',
        name: 'STA1N API',
        apiUrl: 'https://cdn.sta1n.cn/v1',
        icon: 'https://img.cdn1.vip/i/69c18cc07538b_1774292160.webp'
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        apiUrl: 'https://api.deepseek.com/v1',
        icon: 'https://www.deepseek.com/favicon.ico'
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        apiUrl: 'https://openrouter.ai/api/v1',
        icon: 'https://openrouter.ai/favicon.ico'
    },
    {
        id: 'siliconflow',
        name: 'SiliconFlow',
        apiUrl: 'https://api.siliconflow.cn/v1',
        icon: 'https://siliconflow.cn/favicon.ico'
    }
];

export const CUSTOM_API_PROVIDER_OPTION = {
    id: 'custom',
    name: '自定义',
    apiUrl: '',
    icon: ''
};

export const CUSTOM_API_PROVIDER_OPTION_2 = {
    id: 'custom2',
    name: '自定义2',
    apiUrl: '',
    icon: ''
};

export const CUSTOM_API_PROVIDER_OPTIONS = [CUSTOM_API_PROVIDER_OPTION, CUSTOM_API_PROVIDER_OPTION_2];

// ---------------------------------------------------------------------------
// UI 选项
// ---------------------------------------------------------------------------

export const PRESET_ROLE_OPTIONS = [
    { value: 'system', label: '系统提示词' },
    { value: 'user', label: 'User消息' },
    { value: 'assistant', label: 'AI消息' }
];

export const FONT_FAMILY_OPTIONS = [
    { value: 'modern', label: '现代通用字体' },
    { value: 'serif', label: '衬线字体' },
    { value: 'system', label: '系统字体' }
];

export const IMAGE_STYLE_OPTIONS = [
    { value: 'vertical', label: '韩漫小清新风' },
    { value: 'comicDoujin', label: '漫画同人风' },
    { value: 'r18', label: '2.5D唯美风' },
    { value: 'lolita25d', label: '2.5D唯美风（萝）' },
    { value: 'anime', label: '本子里番风' },
    { value: 'galgame', label: 'GalGame风' },
    { value: 'custom', label: '自定义' }
];

export const IMAGE_SIZE_OPTIONS = [
    { value: '竖图', label: '竖图(-1)' },
    { value: '横图', label: '横图(-1)' },
    { value: '方图', label: '方图(-1)' },
    { value: '2K竖图', label: '2K竖图(-15)' },
    { value: '2K横图', label: '2K横图(-15)' },
    { value: '2K方图', label: '2K方图(-15)' },
    { value: '4K竖图', label: '4K竖图(-25)' },
    { value: '4K横图', label: '4K横图(-25)' },
    { value: '4K方图', label: '4K方图(-25)' }
];

export const IMAGE_GEN_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6].map(count => ({
    value: count,
    label: `${count} 张`
}));

export const UI_TEMPLATE_PLACEMENT_OPTIONS = [
    { value: 'top', label: '对话顶部' },
    { value: 'bottom', label: '对话底部' }
];

export const WORLD_INFO_POSITION_OPTIONS = [
    { group: '系统提示词', value: 'system_top', label: '最顶层' },
    { group: '系统提示词', value: 'global_note', label: '全局备注' },
    { group: '系统提示词', value: 'before_char', label: '角色设定前' },
    { group: '系统提示词', value: 'after_char', label: '角色设定后' },
    { group: '对话中', value: 'at_depth', label: '按深度插入' },
    { group: '对话中', value: 'user_top', label: '用户消息顶部' },
    { group: '对话中', value: 'assistant_top', label: '助手消息顶部' }
];

export const PRESET_ROLE_DISPLAY_LABELS = {
    system: '系统',
    user: 'User',
    assistant: 'AI'
};

// ---------------------------------------------------------------------------
// 渲染与上下文限制
// ---------------------------------------------------------------------------

export const MAX_CONTEXT_SIZE = 1000000;
export const CHAT_RENDER_INITIAL_LIMIT = 20;
export const CHAT_RENDER_BATCH_SIZE = 10;

// ---------------------------------------------------------------------------
// 向量记忆常量
// ---------------------------------------------------------------------------

export const MEMORY_VECTOR_BATCH_SIZE = 16;
export const MEMORY_VECTOR_SAVE_EVERY_BATCHES = 4;
export const MEMORY_VECTOR_MAX_PARAGRAPH_LENGTH = 1800;
export const MEMORY_VECTOR_MERGE_MAX_LENGTH = 400;
export const MEMORY_VECTOR_MIN_TOP_K = 10;
export const MEMORY_VECTOR_MAX_TOP_K = 20;
export const MEMORY_VECTOR_DEFAULT_TOP_K = 15;

export const MEMORY_KEEP_FLOORS_MIN = 20;
export const MEMORY_KEEP_FLOORS_MAX = 60;
export const MEMORY_KEEP_FLOORS_DEFAULT = 40;
export const MEMORY_KEEP_FLOORS_OFF_SLIDER_VALUE = 65;

// ---------------------------------------------------------------------------
// Active Tool 系统常量
// ---------------------------------------------------------------------------

export const ACTIVE_TOOL_VECTOR_TYPE = 'vector_memory';
export const ACTIVE_TOOL_KEYWORD_TYPE = 'keyword_dialogue';
export const ACTIVE_TOOL_WEB_TYPE = 'web_search';
export const ACTIVE_TOOL_WORLD_TYPE = 'world_info';

export const ACTIVE_TOOL_MIN_RESULT_COUNT = 8;
export const ACTIVE_TOOL_DEFAULT_RESULT_COUNT = 8;
export const ACTIVE_TOOL_MAX_RESULT_COUNT = 12;
export const ACTIVE_TOOL_RESULT_COUNT_VERSION = 4;

export const ACTIVE_TOOL_WORLD_ACCESS_VERSION = 2;
export const ACTIVE_TOOL_MAX_AUTO_CONTINUE = 4;
export const ACTIVE_TOOL_WORLD_ACCESS_READ = 'read';
export const ACTIVE_TOOL_WORLD_ACCESS_EDIT = 'edit';

export const ACTIVE_TOOL_AGGRESSIVENESS_FORCE = 'force';
export const ACTIVE_TOOL_AGGRESSIVENESS_ACTIVE = 'active';
export const ACTIVE_TOOL_AGGRESSIVENESS_ADAPTIVE = 'adaptive';
export const ACTIVE_TOOL_AGGRESSIVENESS_VERSION = 2;

export const ACTIVE_TOOL_AGGRESSIVENESS_OPTIONS = Object.freeze([
    { value: ACTIVE_TOOL_AGGRESSIVENESS_FORCE, label: '强制' },
    { value: ACTIVE_TOOL_AGGRESSIVENESS_ACTIVE, label: '积极' },
    { value: ACTIVE_TOOL_AGGRESSIVENESS_ADAPTIVE, label: '自适应' }
]);

export const ACTIVE_TOOL_REMINDERS = Object.freeze({
    [ACTIVE_TOOL_AGGRESSIVENESS_FORCE]: '正式回复前必须先调用至少 1 个最相关工具；没有 <active_tool_results> 前不要直接输出正文。',
    [ACTIVE_TOOL_AGGRESSIVENESS_ACTIVE]: '积极补全不确定信息；人设、剧情、记忆、事实、前文细节或用户暗指内容不明确时先调用工具，上下文完全足够时可直接回复。',
    [ACTIVE_TOOL_AGGRESSIVENESS_ADAPTIVE]: '上下文足够时直接回复；信息不完整、可能遗忘，或工具结果明显能提升准确性时再调用工具。'
});

// ---------------------------------------------------------------------------
// Active Tool 描述文本
// ---------------------------------------------------------------------------

export const ACTIVE_TOOL_DEFAULT_DESCRIPTION = '当需要长期记忆、旧剧情、历史设定、过往关系、人物状态、物品来历或用户暗指内容时，单独输出 <tool_memory_add:检索内容> 或 <tool_memory_cover:检索内容>。每行一个标签，单次回复最多 5 个工具标签，不写说明或 COT；多个独立信息点拆开查，优先最关键的信息点，检索词要具体，优先人物、事件、物品、地点和时间线。没有当前上下文或检索结果支持的设定、关系、状态和事件不要编造。本轮第一次检索一律用 add；看到工具结果后，若是补充不同证据且旧结果有用就 add；若旧结果偏题、太宽、重复、方向错误或噪声过多，或更具体检索能替代旧结果，应优先用 cover 清理上下文冗余，把注意力集中在更准确的记忆上。结果足够就继续正文，不够就换更具体的问题继续查。';
export const ACTIVE_TOOL_DEFAULT_DISPLAY_DESCRIPTION = '让角色在上下文信息不够明确时，主动检索向量记忆，适合找旧剧情、历史设定、人物关系、物品来历和用户暗指过的内容。';
export const ACTIVE_TOOL_GREP_DEFAULT_DESCRIPTION = '当需要精准抓取当前对话历史里的原文内容时，单独输出 <tool_grep_add:关键词> 或 <tool_grep_cover:关键词>。关键词要尽量写原文可能出现的词，适合找台词、名称、物品、地点、设定词、前文原句或具体细节。多个独立信息点必须拆开，每行一个标签，单次回复最多 5 个工具标签，不写说明或 COT。本轮第一次关键词检索一律用 add；看到结果后，若旧结果有用且需要保留就 add；若旧关键词结果偏题、太宽、重复、噪声过多，或更准确关键词能替代旧结果，应优先用 cover 清理冗余原文片段，避免旧结果分散注意力。';
export const ACTIVE_TOOL_GREP_DEFAULT_DISPLAY_DESCRIPTION = '按关键词精准抓取当前对话历史里的原文片段，适合找台词、名称、物品、地点和具体前文。';
export const ACTIVE_TOOL_WEB_DEFAULT_DESCRIPTION = '当本地上下文、角色记忆、关键词检索都不足以确认作品设定、同人资料、冷门角色、现实最新信息或网页资料时，单独输出 <tool_web_add:联网搜索内容或网页链接> 或 <tool_web_cover:联网搜索内容或网页链接>。先用具体关键词搜索，再按需读取真实 URL；查询优先包含作品名、角色名、设定名、站点、语言关键词或别名。多个独立信息点必须拆开，单次回复最多 5 个工具标签。本轮第一次联网搜索或首次读取 URL 一律用 add；看到结果后，若旧结果有用且需要保留就 add；若搜索结果偏题、太宽、重复、来源噪声多，或新搜索/网页读取能替代旧结果，应优先用 cover 清理上下文冗余，避免无关网页摘要干扰判断。';
export const ACTIVE_TOOL_WEB_DEFAULT_DISPLAY_DESCRIPTION = '通过 Tavily 联网搜索补充外部资料，也能进入链接读取网页详情，适合同人设定、作品百科、冷门角色和最新信息。';
export const ACTIVE_TOOL_WORLD_READ_DESCRIPTION = '当需要查看世界书时，在正文中单独输出 <tool_world_add:list> 或 <tool_world_add:read 世界书名字>。流程是先获取已开启世界书名字列表，再由你决定阅读哪些世界书的完整内容。当前为阅读模式，不能编辑世界书。系统只处理已开启且非系统内置的世界书。';
export const ACTIVE_TOOL_WORLD_READ_DISPLAY_DESCRIPTION = '阅读已开启世界书：支持列出世界书列表，阅读世界书内容，不允许编辑世界书内容。';
export const ACTIVE_TOOL_WORLD_EDIT_DESCRIPTION = '当需要查看或修改世界书时，在正文中单独输出 <tool_world_add:list>、<tool_world_add:read 世界书名字> 或 <tool_world_add:{"action":"edit","name":"世界书名字","operation":"replace","content":"新的完整内容"}>。流程是先获取已开启世界书名字列表，再由你决定阅读哪些世界书的完整内容，最后只在用户明确要求时编辑内容。系统只处理已开启且非系统内置的世界书。';
export const ACTIVE_TOOL_WORLD_EDIT_DISPLAY_DESCRIPTION = '管理已开启世界书：支持列出世界书列表，阅读世界书内容，编辑世界书内容。';
export const ACTIVE_TOOL_WORLD_DEFAULT_DESCRIPTION = ACTIVE_TOOL_WORLD_READ_DESCRIPTION;
export const ACTIVE_TOOL_WORLD_DEFAULT_DISPLAY_DESCRIPTION = ACTIVE_TOOL_WORLD_READ_DISPLAY_DESCRIPTION;

export const ACTIVE_TOOL_TAVILY_ENDPOINT = 'https://api.tavily.com/search';
export const ACTIVE_TOOL_TAVILY_EXTRACT_ENDPOINT = 'https://api.tavily.com/extract';
export const ACTIVE_TOOL_TAVILY_SEARCH_DEPTH = 'advanced';
export const ACTIVE_TOOL_TAVILY_EXTRACT_MAX_URLS = ACTIVE_TOOL_DEFAULT_RESULT_COUNT;

// ---------------------------------------------------------------------------
// UI 模板上下文标签
// ---------------------------------------------------------------------------

export const UI_TEMPLATE_CONTEXT_OPEN_TAG = '<ui_template_state_context>';
export const UI_TEMPLATE_CONTEXT_CLOSE_TAG = '</ui_template_state_context>';

// ---------------------------------------------------------------------------
// 角色记忆标签
// ---------------------------------------------------------------------------

export const ROLE_MEMORY_VECTOR_RECALL_TAG = 'role_memory_vector_recall';
export const ROLE_MEMORY_VECTOR_RECALL_OPEN_TAG = `<${ROLE_MEMORY_VECTOR_RECALL_TAG}>`;
export const ROLE_MEMORY_VECTOR_RECALL_CLOSE_TAG = `</${ROLE_MEMORY_VECTOR_RECALL_TAG}>`;

// ---------------------------------------------------------------------------
// 工具调用状态
// ---------------------------------------------------------------------------

export const TOOL_CALL_RUNNING_STATUSES = ['running', 'receiving', 'queued'];

// ---------------------------------------------------------------------------
// 默认头像
// ---------------------------------------------------------------------------

export const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2U1ZTdlYiIvPjwvc3ZnPg==';

export const POPULAR_MODEL_FAMILIES = ['claude', 'gemini', 'deepseek', 'llama', 'glm', 'minimax', 'moonshot', 'grok'];

// ---------------------------------------------------------------------------
// Active Tool 默认工具定义（工厂函数，因依赖上面常量所以放在此模块末尾）
// ---------------------------------------------------------------------------

export function createDefaultActiveTool() {
    return {
        id: 'tool_memory',
        name: '向量记忆主动检索',
        enabled: false,
        type: ACTIVE_TOOL_VECTOR_TYPE,
        callName: 'tool_memory',
        resultCount: ACTIVE_TOOL_DEFAULT_RESULT_COUNT,
        resultCountVersion: ACTIVE_TOOL_RESULT_COUNT_VERSION,
        description: ACTIVE_TOOL_DEFAULT_DESCRIPTION,
        displayDescription: ACTIVE_TOOL_DEFAULT_DISPLAY_DESCRIPTION
    };
}

export function createDefaultGrepTool() {
    return {
        id: 'tool_grep',
        name: '关键词检索',
        enabled: false,
        type: ACTIVE_TOOL_KEYWORD_TYPE,
        callName: 'tool_grep',
        resultCount: ACTIVE_TOOL_DEFAULT_RESULT_COUNT,
        resultCountVersion: ACTIVE_TOOL_RESULT_COUNT_VERSION,
        description: ACTIVE_TOOL_GREP_DEFAULT_DESCRIPTION,
        displayDescription: ACTIVE_TOOL_GREP_DEFAULT_DISPLAY_DESCRIPTION
    };
}

export function createDefaultWebTool() {
    return {
        id: 'tool_web',
        name: 'Tavily 联网搜索',
        enabled: false,
        type: ACTIVE_TOOL_WEB_TYPE,
        callName: 'tool_web',
        resultCount: ACTIVE_TOOL_DEFAULT_RESULT_COUNT,
        resultCountVersion: ACTIVE_TOOL_RESULT_COUNT_VERSION,
        description: ACTIVE_TOOL_WEB_DEFAULT_DESCRIPTION,
        displayDescription: ACTIVE_TOOL_WEB_DEFAULT_DISPLAY_DESCRIPTION,
        tavilyApiKey: ''
    };
}

export function createDefaultWorldTool() {
    return {
        id: 'tool_world',
        name: '世界书阅读/管理',
        enabled: false,
        type: ACTIVE_TOOL_WORLD_TYPE,
        callName: 'tool_world',
        resultCount: ACTIVE_TOOL_DEFAULT_RESULT_COUNT,
        resultCountVersion: ACTIVE_TOOL_RESULT_COUNT_VERSION,
        worldInfoAccessMode: ACTIVE_TOOL_WORLD_ACCESS_READ,
        worldInfoAccessModeVersion: ACTIVE_TOOL_WORLD_ACCESS_VERSION,
        description: ACTIVE_TOOL_WORLD_DEFAULT_DESCRIPTION,
        displayDescription: ACTIVE_TOOL_WORLD_DEFAULT_DISPLAY_DESCRIPTION
    };
}

export function getDefaultActiveToolDefinitions() {
    return [
        createDefaultActiveTool(),
        createDefaultGrepTool(),
        createDefaultWebTool(),
        createDefaultWorldTool()
    ];
}
