import { normalizePresetRole } from './utils.js';

export const HUD_CSS = '.sinan-hud{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;padding:12px;background:linear-gradient(to bottom right,rgba(255,255,255,0.9),rgba(255,255,255,0.6));border-radius:12px;border:1px solid rgba(0,0,0,0.08);backdrop-filter:blur(4px)}.char-card{flex:1 1 140px;background:#fff;padding:10px;border-radius:8px;border-left:4px solid #ddd;box-shadow:0 2px 6px rgba(0,0,0,0.04);display:flex;flex-direction:column;gap:4px;font-size:12px;position:relative;overflow:hidden;transition:transform 0.2s}.char-card:hover{transform:translateY(-2px);box-shadow:0 4px 8px rgba(0,0,0,0.1)}.char-name{font-weight:700;font-size:14px;color:#374151;display:flex;justify-content:space-between;align-items:center}.char-mood{color:#6b7280;font-size:12px}.char-loc{color:#9ca3af;font-size:11px;margin-top:auto;padding-top:4px}.bar-bg{height:4px;background:#f3f4f6;border-radius:2px;overflow:hidden;margin-top:6px}.bar-fill{height:100%;background:#10b981;border-radius:2px}.c-tongqiu{border-left-color:#f59e0b}.c-tongqiu .bar-fill{background:#f59e0b}.c-yufan{border-left-color:#3b82f6}.c-yufan .bar-fill{background:#3b82f6}.c-linghu{border-left-color:#8b5cf6}.c-linghu .bar-fill{background:#8b5cf6}.c-chongtian{border-left-color:#ef4444}.c-chongtian .bar-fill{background:#ef4444}';

export const IFRAME_RESET_CSS = 'html,body{margin:0!important;padding:0!important;width:100%!important;height:auto!important;min-height:auto!important;word-wrap:break-word!important;box-sizing:border-box!important;overflow:hidden!important;}::-webkit-scrollbar{display:none;}*,*::before,*::after{box-sizing:inherit!important;}img,video,canvas,svg{max-width:100%!important;height:auto!important;}table{display:block!important;overflow-x:auto!important;max-width:100%!important;}pre{white-space:pre-wrap!important;word-wrap:break-word!important;max-width:100%!important;}.container,.reality-panel,.app-container{max-width:100%!important;width:100%!important;margin:0!important;border-radius:0!important;box-shadow:none!important;border:none!important;height:auto!important;min-height:0!important;}body>div:first-child{margin:0!important;max-width:100%!important;height:auto!important;min-height:0!important;}#app{height:auto!important;min-height:auto!important;}.bottom-safe{display:none!important;height:0!important;min-height:0!important;margin:0!important;padding:0!important;}';

export const CONSOLE_STYLES = {
    // Generator
    genLoaded: 'color: #10b981; font-weight: bold;',
    // Square
    sqLoaded: 'color: #3b82f6; font-weight: bold;',
    // AI Request Logs
    aiGroup: 'color: #10b981; font-weight: bold; font-size: 14px;',
    aiModelLabel: 'font-weight: bold;',
    aiModelValue: 'color: #3b82f6;',
    aiMsgCount: 'font-weight: bold;',
    aiSysPromptGroup: 'color: #ef4444; font-weight: bold;',
    aiFullMsgGroup: 'color: #f59e0b; font-weight: bold;',
    aiSent: 'color: #10b981;'
};

export function getPresetRoleBadgeClass(preset) {
    const role = normalizePresetRole(preset?.role);
    if (role === 'user') return 'bg-green-100 text-green-700 border-green-200';
    if (role === 'assistant') return 'bg-purple-100 text-purple-700 border-purple-200';
    return 'bg-red-100 text-red-700 border-red-200';
}
