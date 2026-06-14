(function () {
    'use strict';

    var JSON_FILES = [
        'assets/data/constants.json',
        'assets/data/options.json',
        'assets/data/presets.json',
        'assets/data/prompts.json',
        'assets/data/tool-definitions.json'
    ];

    var RPHubData = {
        _ready: false,
        _promise: null
    };

    function httpGetSync(url) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.send(null);
        if (xhr.status < 200 || xhr.status >= 300) {
            throw new Error('Failed to load ' + url + ' (status ' + xhr.status + ')');
        }
        return JSON.parse(xhr.responseText);
    }

    function loadAllSync() {
        var keys = ['constants', 'options', 'presets', 'prompts', 'toolDefs'];
        for (var i = 0; i < keys.length; i++) {
            RPHubData[keys[i]] = httpGetSync(JSON_FILES[i]);
        }
        postProcess();
        RPHubData._ready = true;
    }

    function loadAllAsync() {
        if (RPHubData._promise) return RPHubData._promise;
        RPHubData._promise = Promise.all([
            fetch('assets/data/constants.json').then(parseJSON),
            fetch('assets/data/options.json').then(parseJSON),
            fetch('assets/data/presets.json').then(parseJSON),
            fetch('assets/data/prompts.json').then(parseJSON),
            fetch('assets/data/tool-definitions.json').then(parseJSON)
        ]).then(function (results) {
            RPHubData.constants = results[0];
            RPHubData.options = results[1];
            RPHubData.presets = results[2];
            RPHubData.prompts = results[3];
            RPHubData.toolDefs = results[4];
            postProcess();
            RPHubData._ready = true;
        });
        return RPHubData._promise;
    }

    function parseJSON(response) {
        if (!response.ok) throw new Error('Failed to load data: ' + response.status);
        return response.json();
    }

    RPHubData.get = function (namespace, keyPath) {
        var ns = this[namespace];
        if (!ns) return undefined;
        var keys = keyPath.split('.');
        var value = ns;
        for (var i = 0; i < keys.length; i++) {
            if (value == null) return undefined;
            value = value[keys[i]];
        }
        return value;
    };

    RPHubData.isReady = function () {
        return this._ready;
    };

    RPHubData.ready = function () {
        if (this._ready) return Promise.resolve();
        if (this._promise) return this._promise;
        return loadAllAsync();
    };

    function postProcess() {
        var opt = RPHubData.options || {};

        if (opt.imageGenCountOptions && Array.isArray(opt.imageGenCountOptions)) {
            opt.imageGenCountOptions = opt.imageGenCountOptions.map(function (count) {
                return { value: count, label: count + ' 张' };
            });
        }

        RPHubData.MAX_CONTEXT_SIZE = RPHubData.constants.MAX_CONTEXT_SIZE;
        RPHubData.IMAGE_GEN_BASE_URL = RPHubData.constants.IMAGE_GEN_BASE_URL;
        RPHubData.DEFAULT_API_PROVIDER_ID = RPHubData.constants.DEFAULT_API_PROVIDER_ID;
        RPHubData.DEFAULT_AVATAR = RPHubData.constants.DEFAULT_AVATAR;
        RPHubData.SYSTEM_REGEX_NAMES = RPHubData.constants.SYSTEM_REGEX_NAMES;
        RPHubData.SYSTEM_WORLD_INFO_NAMES = RPHubData.constants.SYSTEM_WORLD_INFO_NAMES;
        RPHubData.ROLE_MEMORY_VECTOR_RECALL_TAG = RPHubData.constants.ROLE_MEMORY_VECTOR_RECALL_TAG;
        RPHubData.OBSOLETE_REGEX_NAMES = RPHubData.constants.OBSOLETE_REGEX_NAMES;
        RPHubData.PRESET_ROLE_DISPLAY_LABELS = RPHubData.constants.PRESET_ROLE_DISPLAY_LABELS;
        RPHubData.DEFAULT_API_CONFIG = RPHubData.constants.DEFAULT_API_CONFIG;
        RPHubData.TAVILY_ENDPOINT = RPHubData.constants.ACTIVE_TOOL_TAVILY_ENDPOINT;
        RPHubData.TAVILY_EXTRACT_ENDPOINT = RPHubData.constants.ACTIVE_TOOL_TAVILY_EXTRACT_ENDPOINT;
        RPHubData.TAVILY_SEARCH_DEPTH = RPHubData.constants.ACTIVE_TOOL_TAVILY_SEARCH_DEPTH;

        RPHubData.API_PROVIDER_OPTIONS = opt.apiProviderOptions || [];
        RPHubData.PRESET_ROLE_OPTIONS = opt.presetRoleOptions || [];
        RPHubData.FONT_FAMILY_OPTIONS = opt.fontFamilyOptions || [];
        RPHubData.IMAGE_STYLE_OPTIONS = opt.imageStyleOptions || [];
        RPHubData.IMAGE_SIZE_OPTIONS = opt.imageSizeOptions || [];
        RPHubData.IMAGE_GEN_COUNT_OPTIONS = opt.imageGenCountOptions || [];
        RPHubData.UI_TEMPLATE_PLACEMENT_OPTIONS = opt.uiTemplatePlacementOptions || [];
        RPHubData.WORLD_INFO_POSITION_OPTIONS = opt.worldInfoPositionOptions || [];

        var td = RPHubData.toolDefs || {};
        RPHubData.ACTIVE_TOOL_DEFAULT_RESULT_COUNT = td.defaultResultCount || 3;
        RPHubData.ACTIVE_TOOL_MIN_RESULT_COUNT = td.minResultCount || 1;
        RPHubData.ACTIVE_TOOL_MAX_RESULT_COUNT = td.maxResultCount || 10;
        RPHubData.ACTIVE_TOOL_DEFAULT_DEFINITIONS = (td.tools || []).map(function (tool) {
            var def = {
                id: tool.id,
                name: tool.name,
                enabled: false,
                type: tool.type,
                callName: tool.callName,
                resultCount: td.defaultResultCount || 3,
                resultCountVersion: 2,
                description: tool.description,
                displayDescription: tool.displayDescription
            };
            if (tool.apiKeyField === 'tavilyApiKey') def.tavilyApiKey = '';
            if (tool.worldInfoAccessMode) {
                def.worldInfoAccessMode = tool.worldInfoAccessMode;
                def.worldInfoAccessModeVersion = 1;
            }
            return def;
        });

        var pd = RPHubData.presets || {};
        RPHubData.BUILTIN_PRESETS = pd.builtinPresets || [];
        RPHubData.PRELUDE_PRESETS = pd.preludePresets || [];
        RPHubData.NAMED_PRESETS = pd.namedPresets || {};

        var pm = RPHubData.prompts || {};
        RPHubData.IMAGE_ARTISTS = pm.imageArtists || {};
        RPHubData.IMG_GEN_REGEX_REPLACEMENT_TEMPLATE = pm.imageGenRegexReplacementTemplate || '';
        RPHubData.AUTO_IMAGE_GEN_WORLD_INFO = pm.autoImageGenWorldInfo || null;
    }

    try {
        loadAllSync();
    } catch (e) {
        RPHubData._loadError = e.message;
        loadAllAsync();
    }

    window.RPHubData = RPHubData;
})();
