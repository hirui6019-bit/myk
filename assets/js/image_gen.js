import { IMAGE_GEN_BASE_URL } from './constants.js';

const { ref, computed } = Vue;

const DEFAULT_ARTISTS = '[[[artist:dishwasher1910]]], {{yd_(orange_maru)}}, [artist:ciloranko], [artist:sho_(sho_lwlw)], [ningen mame], year 2024,';

const COMIC_DOUJIN_ARTISTS = `(masterpiece:1.3), (best quality:1.2), (highres), (absurdres),
(extremely detailed illustration:1.2), (anime style:1.1),

(artist:feipin zhanshi:1.0), (artist:nlebo-hentai:0.9), (artist:sos adult:0.85),
(artist:hews:0.4),

(detailed skin texture:1.15), (glossy skin:1.1),
(thick lineart:1.1), (high contrast:1.15),
(vivid colors:1.1), (detailed shading:1.15),
(warm color palette:1.05),
(cute face:1.1), (detailed eyes:1.15), (detailed face:1.1),`;

const R18_ARTISTS = "0.9::misaka_12003-gou ::, dino_(dinoartforame), wanke, liduke, year 2025, realistic, 4k, -2::green ::, textless version, The image is highly intricate finished drawn. Only the character's face is in anime style, but their body is in realistic style. 1.35::A highly finished photo-style artwork that has lively color, graphic texture, realistic skin surface, and lifelike flesh with little obliques::. 1.63::photorealistic::, 1.63::photo(medium)::, \\n20::best quality, absurdres, very aesthetic, detailed, masterpiece::,, very aesthetic, masterpiece, no text,";

const LOLITA25D_ARTISTS = "0.9::misaka_12003-gou & dino, rurudo,  mignon,wanke & liduk::, year 2025, realistic, 4k, -2::green ::, textless version, The image is highly intricate finished drawn. Only the character's face is in anime style, but their body is in realistic style. 1.35::A highly finished photo-style artwork that has lively color, graphic texture, realistic skin surface, and lifelike flesh with little obliques::. 1.63::photorealistic::, 1.63::photo(medium)::, \\n20::best quality, absurdres, very aesthetic, detailed, masterpiece::,, very aesthetic, masterpiece, no text,";

const ANIME_ARTISTS = '1.4::asanagi::,{{{{{artist:asanagi}}}}},1.2::xiaoluo_xl::,1.3::Artist: misaka_12003-gou::,1.2::Artist:shexyo::,0.7::Artist:b.sa_(bbbs)::,1::Artist:qiandaiyiyu::,1.05::artist:natedecock::,1.05::artist:kunaboto::,0.75::artist:kandata_nijou::,1.05::artist:zer0.zer0 ::,1.05::artist:jasony::,0.75::misaka_12003-gou ::, dino_(dinoartforame), wanke, liduke, year 2025, realistic, 4k, -2::green ::, {textless version, The image is highly intricate finished drawn,write realistically,true to life}, 1.35::A highly finished photo-style artwork that has lively color, graphic texture, realistic skin surface, and lifelike flesh with little obliques::, 1.63::photorealistic::,3::age slider::,1.63::photo(medium)::, 2::best quality, absurdres, very aesthetic, detailed, masterpiece::,-4::Muscle definition, abs::';

const GALGAME_ARTISTS = 'artist:ningen_mame,, noyu_(noyu23386566),, toosaka asagi,, location,\\n20::best quality, absurdres, very aesthetic, detailed, masterpiece::,:,, very aesthetic, masterpiece, no text,';

const IMAGE_GEN_REGEX_NAME = 'NAI画图正则';
const AUTO_IMAGE_GEN_WI_NAME = '自动生图';

function getTargetArtists(imageStyle, customImageArtists) {
    if (imageStyle === 'comicDoujin') return COMIC_DOUJIN_ARTISTS;
    if (imageStyle === 'r18') return R18_ARTISTS;
    if (imageStyle === 'lolita25d') return LOLITA25D_ARTISTS;
    if (imageStyle === 'anime') return ANIME_ARTISTS;
    if (imageStyle === 'galgame') return GALGAME_ARTISTS;
    if (imageStyle === 'custom') return customImageArtists || '';
    return DEFAULT_ARTISTS;
}

function getStyleName(imageStyle) {
    const map = {
        vertical: '韩漫小清新风',
        comicDoujin: '漫画同人风',
        r18: '2.5D唯美风',
        lolita25d: '2.5D唯美风（萝）',
        anime: '本子里番风',
        galgame: 'GalGame风',
        custom: '自定义',
    };
    return map[imageStyle] || '未知风格';
}

const imageStyleOptions = [
    { value: 'vertical', label: '韩漫小清新风' },
    { value: 'comicDoujin', label: '漫画同人风' },
    { value: 'r18', label: '2.5D唯美风' },
    { value: 'lolita25d', label: '2.5D唯美风（萝）' },
    { value: 'anime', label: '本子里番风' },
    { value: 'galgame', label: 'GalGame风' },
    { value: 'custom', label: '自定义' }
];

const imageSizeOptions = [
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

const imageGenCountOptions = [1, 2, 3, 4, 5, 6].map(count => ({
    value: count,
    label: `${count} 张`
}));

export function createImageGenManager({ settings, regexScripts, worldInfo, showToast, saveData }) {
    const showAutoImageGenModal = ref(false);
    const showQuotaPanel = ref(false);

    const quotaValue = ref(0);
    const quotaLoading = ref(false);
    const quotaError = ref(false);
    const quotaAvailable = ref(false);

    const imageGenStatus = ref('unknown');
    const imageGenLatency = ref(0);

    const isAutoImageGenEnabled = computed({
        get: () => {
            const entry = worldInfo.value.find(w => w.comment === AUTO_IMAGE_GEN_WI_NAME);
            return entry ? entry.enabled : false;
        },
        set: (val) => {
            const entry = worldInfo.value.find(w => w.comment === AUTO_IMAGE_GEN_WI_NAME);
            if (entry) {
                entry.enabled = val;
            } else {
                showToast('未找到"自动生图"世界书条目，请确认配置', 'warning');
            }
        }
    });

    const showAutoImageGenToggleToast = (enabled) => {
        showToast(enabled ? '自动生图已开启' : '自动生图已关闭', enabled ? 'success' : 'info');
    };

    const setAutoImageGenEnabled = (enabled) => {
        isAutoImageGenEnabled.value = enabled;
        const changed = isAutoImageGenEnabled.value === enabled;
        if (changed) showAutoImageGenToggleToast(enabled);
        return changed;
    };

    const toggleAutoImageGen = () => {
        setAutoImageGenEnabled(!isAutoImageGenEnabled.value);
    };

    const fetchQuota = async () => {
        quotaLoading.value = true;
        quotaError.value = false;
        try {
            const imageGenToken = settings.imageGenKey.trim();
            if (!imageGenToken) {
                quotaValue.value = 0;
                quotaAvailable.value = false;
                return;
            }
            const response = await fetch(`${IMAGE_GEN_BASE_URL}/api/api/getUser`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ toUserId: imageGenToken })
            });
            const data = await response.json();
            if (data.status === 'ok' && data.type === 'sta1n') {
                const val = Number.parseInt(data.data?.value, 10);
                if (!Number.isFinite(val)) throw new Error('Invalid quota value');
                quotaValue.value = val;
                quotaAvailable.value = val > 0;
            } else {
                quotaError.value = true;
                quotaAvailable.value = false;
            }
        } catch (e) {
            console.error('Quota fetch error:', e);
            quotaError.value = true;
            quotaAvailable.value = false;
        } finally {
            quotaLoading.value = false;
        }
    };

    const checkImageGenStatus = async () => {
        imageGenStatus.value = 'checking';
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 10000);
            const startTime = performance.now();
            await fetch(IMAGE_GEN_BASE_URL, {
                method: 'HEAD',
                mode: 'no-cors',
                signal: controller.signal
            });
            clearTimeout(id);
            const endTime = performance.now();
            imageGenStatus.value = 'connected';
            imageGenLatency.value = Math.round(endTime - startTime);
        } catch (e) {
            console.warn('Image API Status Check Failed:', e);
            imageGenStatus.value = 'error';
        }
    };

    function buildImageGenRules() {
        const imageGenToken = settings.imageGenKey.trim();
        const targetArtists = getTargetArtists(settings.imageStyle, settings.customImageArtists);
        const encodedTargetArtists = encodeURIComponent(targetArtists);

        const regexRule = {
            name: IMAGE_GEN_REGEX_NAME,
            regex: '/image###([\\s\\S]*?)###/g',
            replacement: '<div style="width: auto; height: auto; max-width: 100%; box-sizing: border-box; padding: 2px; border: 1px solid rgba(255,255,255,0.58); background: rgba(255,255,255,0.32); position: relative; border-radius: 12px; overflow: hidden; display: inline-flex; justify-content: center; align-items: center; box-shadow: 0 4px 14px rgba(148,163,184,0.06);"><img src="' + IMAGE_GEN_BASE_URL + '/generate?tag=$1&token=' + imageGenToken + '&model=nai-diffusion-4-5-full&artist=' + encodedTargetArtists + '&size=' + settings.imageSize + '&steps=40&scale=6&cfg=0&sampler=k_dpmpp_2m_sde&negative={{{{bad anatomy}}}},{bad feet},bad hands,{{{bad proportions}}},{blurry},cloned face,cropped,{{{deformed}}},{{{disfigured}}},error,{{{extra arms}}},{extra digit},{{{extra legs}}},extra limbs,{{extra limbs}},{fewer digits},{{{fused fingers}}},gross proportions,ink eyes,ink hair,jpeg artifacts,{{{{long neck}}}},low quality,{malformed limbs},{{missing arms}},{missing fingers},{{missing legs}},{{{more than 2 nipples}}},mutated hands,{{{mutation}}},normal quality,owres,{{poorly drawn face}},{{poorly drawn hands}},reen eyes,signature,text,{{too many fingers}},{{{ugly}}},username,uta,watermark,worst quality,{{{more than 2 legs}}},awkward hand sign,weird hand gesture,contorted hand,unnatural finger pose,deformed hand gesture,{shaka},{hang loose},{{rock on}},{shaka sign}&nocache=0&noise_schedule=karras"  alt="生成图片" style="max-width: 100%; height: auto; width: auto; display: block; object-fit: contain; border-radius: 9px; transition: transform 0.3s ease;"></div>',
            placement: [2],
            markdownOnly: true,
            promptOnly: false,
            scope: 'global',
            enabled: false
        };

        const imageGenCount = Math.min(6, Math.max(1, Number(settings.imageGenCount) || 2));
        const worldInfoEntry = {
            comment: AUTO_IMAGE_GEN_WI_NAME,
            keys: [],
            content: `<auto_image_gen>\n用户已开启自动生图。每次回复的正文中必须在合适的位置穿插图片，标准格式为：image###生成的提示词###，不能只输出文字正文；本轮必须生成${imageGenCount}张图片。
使用绘画tag对场景人物进行特写，并保证一个场景拥有${imageGenCount}张图。
注意:始终使用逗号分隔条目.另外请保证同一角色的特征，如发色，瞳孔颜色，体态，外貌的一致性.
使用 image###生成的提示词### 的格式！
注意：如为nsfw场景，生成的提示词必须带上 nsfw 标签；如果是同人/已有作品角色，角色名仍必须放在最前面，nsfw 紧跟其后。

###提示词生成指导:
第一重要的在于人物的特点,例如：white hair,性别：1girl,1boy,特色：mesugaki,ojousama,服装特色：china_dress,gothic,glasses,表情动作：smile,crying,tearing_clothes,disgust,angry,kubrick_stare,
第二在于人物姿势：例如基础的站姿：standing,on back,on stomach,kneeling,做事情：bathing,cooking,fighting,showering,sleeping,spitting,walking,toilet_use,性爱姿势：grinding,fingering,licking_penis,
第三在于动作细节:例如hands_on_own_chest,arms_behind_back,penis_grab,pulled_by_self,skirt_pull,clothes_lift,covering_chest_by_hand,finger_to_mouth,hands_on_lap,
第四在于环境交互：例如：grinding,fingering,licking_penis,spread legs,wariza,sitting_in_tree,lotus_position,sitting_on_rock,sitting_on_stairs,folded,cameltoe,
第五在于衣物细节:例如XX半脱，露出XX
第六在于镜头描写，从XX往XX看，上半身还是下半身，例如从下往上的下半身，从上往下的上半身.lower_body,between_legs,between_breasts,pantyshot,looking_at_viewer,
第七在于人物此时的位置，例如: diningroom, gym, bedroom, indoors, home, beach
第八在于当前时间,morning, noon ，night, emphasize the lighting situation..

<Tag_注意事项>
#  Tag规范：禁用中文；原创角色禁止使用人物卡英文名；同人/已有作品角色必须把官方英文名或常用角色Tag放在提示词最前面
1. 拆解复合词：【如：月下→moonlight,night】
2. 排除元素："no+Tag"明确强调排除，默认绘图"不提及也易生成"的元素【如：穿衣但不穿胸罩→no bra；穿短裙但不穿内裤→no panties】

# 画面限制：仅描述画面中"客观存在的人/物/背景及正在发生的物理动作"，严禁加入人物内心想法、回忆、幻想、预告、计划，及比喻、抽象描述等非视觉化内容
【如：构图变化：全身→仅下半身→移除"shirt, expression"等上半身Tag】
【如：人物视线：正面→背对→移除"eye color"等面部Tag→再添加：from behind】
【如：遮挡视线：脸庞遮盖/蒙眼→移除"eye color"等眼部Tag，添加：face covered/blindfold】
【如：对话转动作："你看，我今天穿内裤了。"→撩裙子,可见内裤→lifting skirt,panties】
</Tag_注意事项>

角色描述 以Character 1 Prompt为示例
身份：
 - 主体标识：【如：girl、boy、other】
 - 同人角色：提示词第一项必须是英文全名\\\\(作品名\\\\)或常用角色Tag（下划线_替换成空格，/转义为\\\\），再接外貌、服装、动作等Tag
 - 原创角色：名字替换为"original"(也就是人物卡角色)
特征：
 - 基础特征：发型、发色、瞳色、罩杯
 - 专属特征：年龄、职业、性格、皮肤、种族等
**特征根据场景和图片的构图智能调整,冲突则临时移除**
- 互动动作&细节：
  - 自身【如：hands on own ass、grab own ass、arms behind back、covering chest by hand】
  - 对方【如：hand on others' chest 、grabbing another's hair 、penis grab、covering another's eyes、princess carry】
  - 物品【如：holding doorknob、clothes lift、sex toy on floor、bowl in front of girl、dildo in mouth】
  - 环境【如：partially submerged】
**同步/非同步：【如：双手举高→raising hands；单手举高→raising hand, hand in pocket】**
表情:
 - 视线：【如：looking at viewer】
 - 面部：【如：open mouth】
 - 表情：【如：smile、blush】
 - 生理反应：【wet、pussy juice、cum、dripping】

<Tag_智能调整>
# 个数分配：按"画面视觉占比及焦点"分配动态不同分类的Tag个数

# 排序调整：按"画面视觉占比及焦点"从高到低排序；并将同分类逻辑关联的Tag相邻排列，避免分散

# 权重调整：
1. 增强权重：{Tag}
 - 功能：突出核心Tag，最多叠加6层（1层≈1.1倍、2层≈1.21倍、6层≈1.77倍）
 - 分配优先级：特征>动作>服饰>表情>特效【如：红发→{{{red hair}}}】
 - 涉及人物特征(如发色，瞳孔颜色等）的提示词请增加权重
2. 减弱权重：[Tag]
 - 功能：弱化次要Tag或调整幅度，最多叠加2层（1层≈0.9倍、2层≈0.8倍）
 - 分配优先级：调整幅度【如：背景有 "花瓶"→但无需突出→[vase]】

 ### 核心一致性规范 (极其重要):
1. **上下文一致性**：必须精准提取并保留角色当前的外貌，着装状态（如衣服是否破损、脱下）、环境光影、道具位置以及相对姿势。一旦在上文改变了状态，后续生图Tag必须绝对保持一致！
2. **同人角色/固定外观一致性**：对于特定世界观或同人角色，提示词最前面必须放官方英文名或常用角色Tag，并带上极其准确的专属特征Tag组合。对常驻特征（如特定发型、异色瞳、专属装饰物等）加上最高权重 {{{Tag}}}，避免生成外形崩坏和不一致。

<生成格式>
image###生成的提示词###
</生成格式>
</Tag_智能调整>

特别提示：出现user或主角参与的情况(如被口、手交），禁止出现主角的人物形象(脸部，头部）！必须使用第一视角(POV）相关提示词！且要作为Character  Prompt添加，禁止出现用户/主角名字(包括英文和拼音），中文和{{user}}是明令禁止的；同人角色本人的官方角色名仍按上方规则放在最前面。一定要保持同一人物在上下文中的形象一致性，不要丢失人物特性(如有异色瞳特征人物），涉及人物常见特征(如发色，瞳孔颜色等）的提示词请增加权重\n</auto_image_gen>`,
            constant: true,
            enabled: false,
            scope: 'global',
            position: 'at_depth',
            depth: 4,
            order: 100,
            useProbability: false,
            probability: 100
        };

        return { regexRule, worldInfoEntry };
    }

    function injectImageGenRules() {
        const { regexRule, worldInfoEntry } = buildImageGenRules();

        const newRegexIndex = regexScripts.value.findIndex(r => r.name === IMAGE_GEN_REGEX_NAME);
        if (newRegexIndex !== -1) {
            regexRule.enabled = regexScripts.value[newRegexIndex].enabled;
            regexScripts.value.splice(newRegexIndex, 1);
        }
        regexScripts.value.unshift(regexRule);

        const wiIndex = worldInfo.value.findIndex(w => w.comment === AUTO_IMAGE_GEN_WI_NAME);
        if (wiIndex !== -1) {
            worldInfoEntry.enabled = worldInfo.value[wiIndex].enabled;
            worldInfo.value.splice(wiIndex, 1);
        }
        worldInfo.value.unshift(worldInfoEntry);
    }

    function ensureImageGenRules() {
        const hasRegex = regexScripts.value.some(r => r.name === IMAGE_GEN_REGEX_NAME);
        const hasWI = worldInfo.value.some(w => w.comment === AUTO_IMAGE_GEN_WI_NAME);
        if (!hasRegex || !hasWI) {
            injectImageGenRules();
        }
    }

    function updateImageGenRegexState({ enableRegex = false } = {}) {
        let regex = regexScripts.value.find(r => r.name === IMAGE_GEN_REGEX_NAME);
        if (!regex) {
            injectImageGenRules();
            regex = regexScripts.value.find(r => r.name === IMAGE_GEN_REGEX_NAME);
            if (!regex) return [];
        }

        const targetArtists = getTargetArtists(settings.imageStyle, settings.customImageArtists);
        const styleName = getStyleName(settings.imageStyle);
        const encodedTargetArtists = encodeURIComponent(targetArtists);
        const oldReplacement = regex.replacement;
        let newReplacement = oldReplacement.replace(/artist=[\s\S]*?(&size=)/, 'artist=' + encodedTargetArtists + '$1');
        if (newReplacement === oldReplacement) {
            newReplacement = oldReplacement.replace(/artist=[^&]+/, 'artist=' + encodedTargetArtists);
        }
        newReplacement = newReplacement.replace(/size=[^&]+/, 'size=' + settings.imageSize);
        regex.replacement = newReplacement;

        let messages = [];
        const oldArtist = oldReplacement.match(/artist=([\s\S]*?)&size=/)?.[1] || oldReplacement.match(/artist=([^&]+)/)?.[1];
        if (oldArtist !== encodedTargetArtists) {
            messages.push(styleName);
        }
        const oldSize = oldReplacement.match(/size=([^&]+)/)?.[1];
        if (oldSize !== settings.imageSize) {
            messages.push(`比例: ${settings.imageSize}`);
        }

        if (enableRegex && !regex.enabled) {
            regex.enabled = true;
            messages.push(`${IMAGE_GEN_REGEX_NAME} 已启用`);
        }

        return messages;
    }

    const stripDisabledImageGenContext = (text) => {
        if (!text) return text;
        if (isAutoImageGenEnabled.value) return text;
        return String(text)
            .replace(/<image\b[^>]*>[\s\S]*?<\/image>/gi, '')
            .replace(/image###([\s\S]*?)###/gi, '')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    };

    const setAutoImageGen = (enabled) => {
        const entry = worldInfo.value.find(w => w.comment === AUTO_IMAGE_GEN_WI_NAME);
        if (entry) {
            entry.enabled = enabled;
            showToast(enabled ? '自动生图已开启' : '已保持关闭状态', enabled ? 'success' : 'info');
        }
        showAutoImageGenModal.value = false;
        saveData();
    };

    function setupWatchers(watch) {
        const stops = [];

        stops.push(watch(isAutoImageGenEnabled, (newVal) => {
            if (newVal) {
                let messages = [];
                const regexMessages = updateImageGenRegexState({ enableRegex: true });
                if (regexMessages && regexMessages.length > 0) {
                    messages.push(...regexMessages);
                }
                if (messages.length > 0) {
                    showToast('为适配生图：' + messages.join('，'), 'info');
                }
            }
        }));

        stops.push(watch(() => settings.imageStyle, () => {
            const messages = updateImageGenRegexState({ enableRegex: isAutoImageGenEnabled.value });
            if (isAutoImageGenEnabled.value && messages && messages.length > 0) {
                showToast('生图风格已切换：' + messages.join('，'), 'success');
            }
        }));

        stops.push(watch(() => settings.customImageArtists, () => {
            if (settings.imageStyle === 'custom') {
                updateImageGenRegexState({ enableRegex: isAutoImageGenEnabled.value });
            }
        }));

        stops.push(watch(() => settings.imageSize, () => {
            const messages = updateImageGenRegexState({ enableRegex: isAutoImageGenEnabled.value });
            if (isAutoImageGenEnabled.value && messages && messages.length > 0) {
                showToast('生图比例已切换：' + messages.join('，'), 'success');
            }
        }));

        stops.push(watch(() => settings.imageGenCount, () => {
            injectImageGenRules();
        }));

        stops.push(watch(() => settings.imageGenKey, () => {
            injectImageGenRules();
            if (isAutoImageGenEnabled.value) {
                updateImageGenRegexState({ enableRegex: true });
            }
            saveData();
            fetchQuota();
        }));

        return stops;
    }

    return {
        showAutoImageGenModal,
        showQuotaPanel,
        quotaValue,
        quotaLoading,
        quotaError,
        quotaAvailable,
        imageGenStatus,
        imageGenLatency,
        imageStyleOptions,
        imageSizeOptions,
        imageGenCountOptions,
        isAutoImageGenEnabled,
        fetchQuota,
        checkImageGenStatus,
        toggleAutoImageGen,
        setAutoImageGenEnabled,
        showAutoImageGenToggleToast,
        stripDisabledImageGenContext,
        updateImageGenRegexState,
        buildImageGenRules,
        injectImageGenRules,
        ensureImageGenRules,
        setAutoImageGen,
        setupWatchers,
    };
}
