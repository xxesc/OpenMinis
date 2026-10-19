/*!
 * MinisCompanion v1.0.0 — Minis 灵动吉祥物 · 单文件 SDK
 * ------------------------------------------------------------------
 * · 零外部依赖：纯原生 JS + 动态内嵌样式 + 内置 SVG 骨骼系统
 * · UMD 兼容：<script> 全局 window.MinisCompanion / CommonJS / AMD
 * · 多实例安全：idPrefix 自动去重，滤镜、剪裁、渐变 id 绝对不冲突
 * · 9 大状态机 · GPU 硬件加速矢量骨骼 · 单手红色感叹号手摇牌
 * · 正统 3D 轨道空间前后景深穿梭彩带 + 重力五角星撒花 · 四重手势
 * ------------------------------------------------------------------
 */
(function (factory) {
  var MC = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = MC;
  } else if (typeof define === 'function' && define.amd) {
    define([], function () { return MC; });
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.MinisCompanion = MC;
  } else if (typeof self !== 'undefined') {
    self.MinisCompanion = MC;
  } else if (typeof window !== 'undefined') {
    window.MinisCompanion = MC;
  }
})(function () {
  'use strict';

  var VERSION = '1.0.0';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var STYLE_FLAG = 'data-minis-companion-css';

  /* ================================================================
   * 0. 状态表（语义化名称 <-> 历史状态编号 双通道）
   * ================================================================ */
  var STATES = {
    idle: {
      id: '02', label: '待机', desc: '02 待机 · 自然呼吸、水灵大眼与视线追踪',
      body: 'mc-anim-breathe', eyes: 'calm', mouth: 'smile',
      fx: [], hands: [['L', 18, 144, 'mc-hand-left-sway'], ['R', 222, 144, 'mc-hand-right-sway']]
    },
    thinking: {
      id: '30', label: '思考', desc: '30 思考中 · 眼神巡回、小手托腮与思维光环',
      body: 'mc-anim-breathe', eyes: 'think', mouth: 'dot',
      fx: ['think'], hands: [['L', 18, 144, 'mc-hand-left-sway'], ['R', 168, 136, '']]
    },
    inspecting: {
      id: '31', label: '查验', desc: '31 查验工具 · 极客打字双敲与雷达扫描',
      body: 'mc-anim-breathe', eyes: 'focus', mouth: 'smile',
      fx: ['hud'], hands: [['L', 64, 162, 'mc-typing-hand-l'], ['R', 176, 162, 'mc-typing-hand-r']]
    },
    generating: {
      id: '22', label: '实时生成', desc: '22 实时生成 · 小嘴开合、手势讲解与声音气泡',
      body: 'mc-anim-breathe', eyes: 'calm', mouth: 'talk',
      fx: ['wave'], hands: [['L', 42, 138, 'mc-hand-explain'], ['R', 222, 144, 'mc-hand-right-sway']]
    },
    report: {
      id: '34', label: '深度研报', desc: '34 深度研报 · 极客科技眼镜、左右扫读与全息数据流',
      body: 'mc-anim-breathe', eyes: 'sweep', mouth: 'smile',
      fx: ['glasses'], hands: [['L', 36, 152, 'mc-hand-left-sway'], ['R', 204, 152, 'mc-hand-right-sway']]
    },
    error: {
      id: '16', label: '报错委屈', desc: '16 报错委屈 · 双耳耷拉、难过瘪嘴与含泪眼眶',
      body: 'mc-anim-shiver', eyes: 'sad', mouth: 'frown',
      fx: ['tear'], ears: 'droop',
      hands: [['L', 26, 158, ''], ['R', 196, 144, '']]
    },
    delivered: {
      id: '33', label: '交付撒花', desc: '33 撒花交付 · 开心高高蹦起与彩带撒花',
      body: 'mc-anim-bounce', eyes: 'happy', mouth: 'grin',
      fx: [], hands: [['L', 18, 92, ''], ['R', 222, 92, '']]
    },
    happy: {
      id: '10', label: '开心', desc: '10 开心 · 甜美月牙笑眼、水蜜桃腮红与欢快摇摆',
      body: 'mc-happy-wiggle', eyes: 'happy', mouth: 'grin',
      fx: [], blush: true, hands: [['L', 48, 134, ''], ['R', 192, 134, '']]
    },
    sleep: {
      id: '00', label: '沉睡', desc: '00 睡眠 · 安详闭眼软趴趴沉睡飘 Z 气泡',
      body: 'mc-sleepy-deflate', eyes: 'sleep', mouth: 'smile',
      fx: ['sleep'], hands: [['L', 24, 164, ''], ['R', 216, 164, '']]
    }
  };

  // 历史状态编号 -> 语义化名称
  var BY_ID = {};
  // 语义化名称 -> 历史状态编号（对外暴露）
  var ID_OF = {};
  var ORDER = ['idle', 'thinking', 'inspecting', 'generating', 'report', 'error', 'delivered', 'happy', 'sleep'];
  ORDER.forEach(function (name) {
    var st = STATES[name];
    BY_ID[st.id] = name;
    ID_OF[name] = st.id;
  });
  // 宽容别名：2 -> 02, 0 -> 00 等
  var ALIAS = {
    '2': 'idle', '02': 'idle', '3': 'thinking', '30': 'thinking',
    '31': 'inspecting', '22': 'generating', '34': 'report',
    '16': 'error', 'error_sad': 'error', '33': 'delivered', 'deliver': 'delivered',
    '10': 'happy', '0': 'sleep', '00': 'sleep', 'sleeping': 'sleep',
    'think': 'thinking', 'inspect': 'inspecting', 'generate': 'generating',
    'research': 'report', 'celebrate': 'delivered', 'sad': 'error'
  };

  var EYE_KEYS = ['calm', 'happy', 'think', 'focus', 'sweep', 'sad', 'sleep'];
  var MOUTH_KEYS = ['smile', 'dot', 'grin', 'talk', 'frown'];
  var FX_KEYS = ['think', 'hud', 'glasses', 'wave', 'tear', 'sleep'];

  function resolveState(input) {
    if (input === null || input === undefined) return null;
    var raw = String(input).trim().toLowerCase();
    if (STATES[raw]) return raw;
    if (ALIAS[raw]) return ALIAS[raw];
    if (raw.length === 1 && /[0-9]/.test(raw)) {
      var padded = '0' + raw;
      if (BY_ID[padded]) return BY_ID[padded];
    }
    return null;
  }

  /* ================================================================
   * 1. 内嵌样式表（一次性注入，`mc-` 前缀彻底隔离宿主样式）
   * ================================================================ */
  var CSS = [
    '.mc-host{position:relative;display:block;line-height:0;vertical-align:middle;}',
    '.mc-root{display:block;width:100%;height:100%;overflow:visible;user-select:none;-webkit-user-select:none;',
    '-webkit-tap-highlight-color:transparent;}',
    '.mc-root g,.mc-root ellipse,.mc-root path,.mc-root circle,.mc-root rect,.mc-root text,.mc-root line{transform-box:view-box;}',
    '.mc-body-root{will-change:transform;}',

    /* 1. 基础物理呼吸 */
    '.mc-anim-breathe{animation:mcFloatBreathe 3.6s ease-in-out infinite;transform-origin:120px 200px;}',
    '@keyframes mcFloatBreathe{0%,100%{transform:translateY(0) scale(1,1);}50%{transform:translateY(-7px) scale(.98,1.02);}}',
    /* 2. 自然眨眼 */
    '.mc-anim-blink{animation:mcNaturalBlink 4.2s infinite;transform-origin:center;}',
    '@keyframes mcNaturalBlink{0%,94%,98%,100%{transform:scaleY(1);}96%{transform:scaleY(.08);}}',
    /* 3. 摸头/弹跳物理反馈 */
    '.mc-anim-bounce{animation:mcSquashBounce .68s cubic-bezier(.28,.84,.42,1);transform-origin:120px 210px;}',
    '@keyframes mcSquashBounce{0%{transform:scale(1,1) translateY(0);}20%{transform:scale(1.16,.82) translateY(8px);}',
    '45%{transform:scale(.92,1.15) translateY(-32px);}70%{transform:scale(1.04,.96) translateY(2px);}',
    '85%{transform:scale(.98,1.02) translateY(-4px);}100%{transform:scale(1,1) translateY(0);}}',
    /* 4. 双击捏脸手势形变 */
    '.mc-anim-pinch{animation:mcPinchCheeks .72s cubic-bezier(.34,1.56,.64,1);transform-origin:120px 120px;}',
    '@keyframes mcPinchCheeks{0%{transform:scale(1,1);}25%{transform:scale(1.24,.82);}55%{transform:scale(.94,1.08);}',
    '75%{transform:scale(1.06,.96);}100%{transform:scale(1,1);}}',
    /* 5. 长按摸肚皮软趴趴躺平 */
    '.mc-anim-belly-rub{animation:mcBellyBreathe 3s ease-in-out infinite;transform-origin:120px 210px;}',
    '@keyframes mcBellyBreathe{0%,100%{transform:scale(1.12,.85) translateY(10px);}50%{transform:scale(1.16,.82) translateY(12px);}}',
    /* 6. 手部自然轻摆 */
    '.mc-hand-left-sway{animation:mcHandSwayL 3.6s ease-in-out infinite;transform-origin:18px 144px;}',
    '.mc-hand-right-sway{animation:mcHandSwayR 3.6s ease-in-out infinite;transform-origin:222px 144px;}',
    '@keyframes mcHandSwayL{0%,100%{transform:translateY(0) rotate(0deg);}50%{transform:translateY(-3px) rotate(4deg);}}',
    '@keyframes mcHandSwayR{0%,100%{transform:translateY(0) rotate(0deg);}50%{transform:translateY(-3px) rotate(-4deg);}}',
    /* 7. 思考光环旋转 */
    '.mc-thinking-eyes{animation:mcEyeScan 2.8s ease-in-out infinite;}',
    '@keyframes mcEyeScan{0%,100%{transform:translate(-3px,-5px);}50%{transform:translate(5px,-7px);}}',
    '.mc-thinking-halo{animation:mcRotateHalo 4s linear infinite;transform-origin:120px 120px;}',
    '@keyframes mcRotateHalo{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}',
    /* 8. 极客查验双手敲键盘 */
    '.mc-typing-hand-l{animation:mcTypingL .22s ease-in-out infinite alternate;}',
    '.mc-typing-hand-r{animation:mcTypingR .22s ease-in-out infinite alternate .11s;}',
    '@keyframes mcTypingL{0%{transform:translate(0,0);}100%{transform:translate(4px,-6px);}}',
    '@keyframes mcTypingR{0%{transform:translate(0,0);}100%{transform:translate(-4px,-6px);}}',
    /* 9. 说话生成：小嘴巴有节奏开合 + 手势讲解 */
    '.mc-talking-mouth{animation:mcTalkMouth .42s ease-in-out infinite alternate;transform-origin:120px 150px;}',
    '@keyframes mcTalkMouth{0%{transform:scale(.9,.4);}100%{transform:scale(1.1,1.25);}}',
    '.mc-hand-explain{animation:mcExplainHand 1.6s ease-in-out infinite alternate;transform-origin:18px 144px;}',
    '@keyframes mcExplainHand{0%{transform:translate(0,0) rotate(0deg);}100%{transform:translate(12px,-8px) rotate(-12deg);}}',
    '.mc-voice-wave{animation:mcPulseWave 1s ease-out infinite;transform-origin:195px 135px;}',
    '@keyframes mcPulseWave{0%{opacity:0;transform:scale(.6);}50%{opacity:.9;}100%{opacity:0;transform:scale(1.4);}}',
    /* 10. 深度研报：科技眼镜 + 快速扫读 */
    '.mc-sweep-eyes{animation:mcSweepRead .75s ease-in-out infinite alternate;}',
    '@keyframes mcSweepRead{0%{transform:translateX(-6px);}100%{transform:translateX(6px);}}',
    '.mc-data-stream{animation:mcStreamFlow 1.8s linear infinite;}',
    '@keyframes mcStreamFlow{0%{stroke-dashoffset:60;opacity:.3;}50%{opacity:.9;}100%{stroke-dashoffset:0;opacity:.3;}}',
    /* 11. 报错委屈：双耳耷拉下垂 + 身体微微委屈抽搭 + 手摇牌轻晃 */
    '.mc-ear-droop-l{transform:rotate(18deg);transform-origin:58px 56px;transition:transform .3s ease;}',
    '.mc-ear-droop-r{transform:rotate(-18deg);transform-origin:182px 56px;transition:transform .3s ease;}',
    '.mc-anim-shiver{animation:mcShiverSad 2.2s ease-in-out infinite;transform-origin:120px 200px;}',
    '@keyframes mcShiverSad{0%,100%{transform:translateY(0);}20%,24%{transform:translateY(2px);}50%{transform:translateY(1px);}}',
    '.mc-tear-drop{animation:mcTearDrip 1.6s ease-in infinite;}',
    '@keyframes mcTearDrip{0%{opacity:0;transform:translateY(-4px) scale(.5);}30%{opacity:.9;}80%{opacity:.8;}',
    '100%{opacity:0;transform:translateY(18px) scale(1.1);}}',
    '.mc-sign-wave{animation:mcSignWave 2.4s ease-in-out infinite;transform-origin:196px 144px;}',
    '@keyframes mcSignWave{0%,100%{transform:rotate(-3deg);}50%{transform:rotate(4.5deg);}}',
    /* 12. 开心左右萌摇摆 */
    '.mc-happy-wiggle{animation:mcHappyWiggle 1.4s ease-in-out infinite;transform-origin:120px 210px;}',
    '@keyframes mcHappyWiggle{0%,100%{transform:rotate(0deg) translateY(0);}25%{transform:rotate(-3.5deg) translateY(-4px);}',
    '75%{transform:rotate(3.5deg) translateY(-4px);}}',
    '.mc-blush{transition:all .3s;}',
    '.mc-blush-pulse{animation:mcBlushPulse 1.2s ease-in-out infinite alternate;transform-origin:120px 126px;transition:all .3s;}',
    '@keyframes mcBlushPulse{0%{opacity:.55;transform:scale(.95);}100%{opacity:.95;transform:scale(1.15);}}',
    /* 13. 睡眠软塌与 Z 气泡 */
    '.mc-sleepy-deflate{animation:mcSleepyBreathe 4.5s ease-in-out infinite;transform-origin:120px 210px;}',
    '@keyframes mcSleepyBreathe{0%,100%{transform:scale(1.05,.92) translateY(6px);}50%{transform:scale(1.02,.96) translateY(3px);}}',
    '.mc-z-particle{animation:mcFloatZ 3.2s linear infinite;}',
    '@keyframes mcFloatZ{0%{opacity:0;transform:translate(160px,90px) scale(.6) rotate(-10deg);}30%{opacity:.85;}',
    '80%{opacity:.7;}100%{opacity:0;transform:translate(205px,20px) scale(1.3) rotate(15deg);}}',
    /* 14. 3D 轨道彩带前后景深层 */
    '.mc-ribbon-back,.mc-ribbon-front{pointer-events:none;}',
    '.mc-eye-pupil{transition:transform .18s ease-out;}',
    '.mc-signboard{filter:drop-shadow(0 3px 8px rgba(239,68,68,.45));}'
  ].join('\n');

  function injectStyle() {
    if (typeof document === 'undefined') return;
    if (document.querySelector('style[' + STYLE_FLAG + ']')) return;
    var tag = document.createElement('style');
    tag.setAttribute(STYLE_FLAG, '');
    tag.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(tag);
  }

  /* ================================================================
   * 2. SVG 矢量骨骼模板（全部 id 由 idPrefix 参数化，多实例隔离）
   * ================================================================ */
  function svgTemplate(P) {
    return '' +
    '<svg class="mc-root" viewBox="0 0 240 240" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="overflow:visible;">' +
      '<defs id="' + P + 'defs">' +
        '<radialGradient id="' + P + 'bodyGrad" cx="36%" cy="30%" r="68%">' +
          '<stop offset="0%" stop-color="#FFFFFF"/><stop offset="45%" stop-color="#F6FAFF"/>' +
          '<stop offset="82%" stop-color="#E2EDFA"/><stop offset="100%" stop-color="#C5DBF2"/>' +
        '</radialGradient>' +
        '<radialGradient id="' + P + 'shadowGrad" cx="50%" cy="50%" r="50%">' +
          '<stop offset="0%" stop-color="#7B9BBF" stop-opacity="0.35"/>' +
          '<stop offset="100%" stop-color="#7B9BBF" stop-opacity="0"/>' +
        '</radialGradient>' +
        '<filter id="' + P + 'glow" x="-40%" y="-40%" width="180%" height="180%">' +
          '<feGaussianBlur stdDeviation="3.5" result="blur"/>' +
          '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>' +
        '</filter>' +
        '<radialGradient id="' + P + 'pinkOrb" cx="35%" cy="35%" r="65%">' +
          '<stop offset="0%" stop-color="#FFFFFF"/><stop offset="40%" stop-color="#FF6B95"/>' +
          '<stop offset="100%" stop-color="#FF1E62"/></radialGradient>' +
        '<radialGradient id="' + P + 'blueOrb" cx="35%" cy="35%" r="65%">' +
          '<stop offset="0%" stop-color="#FFFFFF"/><stop offset="40%" stop-color="#56D6FF"/>' +
          '<stop offset="100%" stop-color="#00A2F3"/></radialGradient>' +
        '<radialGradient id="' + P + 'goldOrb" cx="35%" cy="35%" r="65%">' +
          '<stop offset="0%" stop-color="#FFFFFF"/><stop offset="40%" stop-color="#FFE066"/>' +
          '<stop offset="100%" stop-color="#F59E0B"/></radialGradient>' +
        '<linearGradient id="' + P + 'glassGrad" x1="0%" y1="0%" x2="100%" y2="0%">' +
          '<stop offset="0%" stop-color="rgba(56,189,248,0.45)"/>' +
          '<stop offset="50%" stop-color="rgba(129,140,248,0.35)"/>' +
          '<stop offset="100%" stop-color="rgba(56,189,248,0.45)"/>' +
        '</linearGradient>' +
      '</defs>' +

      /* 1. 地面柔和贴地投影 */
      '<ellipse id="' + P + 'shadow" cx="120" cy="222" rx="72" ry="10" fill="url(#' + P + 'shadowGrad)"/>' +

      /* 3D 彩带后景层（身体背后，z < 0） */
      '<g id="' + P + 'fxBack" class="mc-ribbon-back"></g>' +

      /* 2. 全身核心骨骼组 */
      '<g class="mc-body-root mc-anim-breathe" id="' + P + 'bodyRoot">' +

        /* 耳朵组 */
        '<g class="mc-ears" id="' + P + 'earsG">' +
          '<ellipse id="' + P + 'earL" cx="58" cy="44" rx="24" ry="25" fill="#FFFFFF" stroke="#D2E4F7" stroke-width="1.8"/>' +
          '<ellipse id="' + P + 'earR" cx="182" cy="44" rx="24" ry="25" fill="#FFFFFF" stroke="#D2E4F7" stroke-width="1.8"/>' +
        '</g>' +

        /* 身体主躯干 */
        '<path id="' + P + 'bodyPath" d="M120,18 C176,18 218,62 218,120 C218,178 180,214 120,214 C60,214 22,178 22,120 C22,62 64,18 120,18 Z" ' +
          'fill="url(#' + P + 'bodyGrad)" stroke="#D2E4F7" stroke-width="1.8"/>' +

        /* 釉面水润反光斑 */
        '<ellipse cx="82" cy="62" rx="24" ry="12" fill="#FFFFFF" opacity="0.65" transform="rotate(-24, 82, 62)"/>' +

        /* 浮游手组 */
        '<g id="' + P + 'handL_wrap" class="mc-hand-left-sway">' +
          '<ellipse id="' + P + 'handL" cx="18" cy="144" rx="16" ry="17" fill="#FFFFFF" stroke="#D2E4F7" stroke-width="1.8"/>' +
        '</g>' +
        '<g id="' + P + 'handR_wrap" class="mc-hand-right-sway">' +
          '<ellipse id="' + P + 'handR" cx="222" cy="144" rx="16" ry="17" fill="#FFFFFF" stroke="#D2E4F7" stroke-width="1.8"/>' +
        '</g>' +

        /* 面部表情组 */
        '<g id="' + P + 'faceRoot" class="mc-face">' +

          /* 腮红组 */
          '<g id="' + P + 'blushG" class="mc-blush">' +
            '<ellipse id="' + P + 'blushL" cx="76" cy="126" rx="14" ry="8" fill="#FFA2B6" opacity="0.65"/>' +
            '<ellipse id="' + P + 'blushR" cx="164" cy="126" rx="14" ry="8" fill="#FFA2B6" opacity="0.65"/>' +
          '</g>' +

          /* 眼睛组 */
          '<g id="' + P + 'eyesG">' +
            /* 02 待机大眼 */
            '<g id="' + P + 'eye_calm" class="mc-anim-blink">' +
              '<g class="mc-eye-pupil mc-eye-pupil-l">' +
                '<ellipse cx="90" cy="104" rx="13.5" ry="15" fill="#162438"/>' +
                '<circle cx="94" cy="98" r="4.2" fill="#FFFFFF"/>' +
              '</g>' +
              '<g class="mc-eye-pupil mc-eye-pupil-r">' +
                '<ellipse cx="150" cy="104" rx="13.5" ry="15" fill="#162438"/>' +
                '<circle cx="154" cy="98" r="4.2" fill="#FFFFFF"/>' +
              '</g>' +
            '</g>' +
            /* 10 / 33 开心月牙眼 */
            '<g id="' + P + 'eye_happy" style="display:none;">' +
              '<path d="M76,108 Q90,92 104,108" fill="none" stroke="#162438" stroke-width="4.5" stroke-linecap="round"/>' +
              '<path d="M136,108 Q150,92 164,108" fill="none" stroke="#162438" stroke-width="4.5" stroke-linecap="round"/>' +
            '</g>' +
            /* 30 思考斜瞟眼 */
            '<g id="' + P + 'eye_think" style="display:none;" class="mc-thinking-eyes">' +
              '<g><ellipse cx="88" cy="101" rx="13" ry="14" fill="#162438"/><circle cx="93" cy="96" r="3.8" fill="#FFFFFF"/></g>' +
              '<g><ellipse cx="152" cy="101" rx="13" ry="14" fill="#162438"/><circle cx="157" cy="96" r="3.8" fill="#FFFFFF"/></g>' +
            '</g>' +
            /* 31 极客专注微眯眼 */
            '<g id="' + P + 'eye_focus" style="display:none;">' +
              '<ellipse cx="90" cy="105" rx="14" ry="7.5" fill="#162438"/><circle cx="94" cy="102" r="2.8" fill="#FFFFFF"/>' +
              '<ellipse cx="150" cy="105" rx="14" ry="7.5" fill="#162438"/><circle cx="154" cy="102" r="2.8" fill="#FFFFFF"/>' +
            '</g>' +
            /* 34 深度研报扫读眼 */
            '<g id="' + P + 'eye_sweep" style="display:none;" class="mc-sweep-eyes">' +
              '<ellipse cx="90" cy="105" rx="12" ry="11" fill="#162438"/><circle cx="93" cy="101" r="3.2" fill="#38BDF8"/>' +
              '<ellipse cx="150" cy="105" rx="12" ry="11" fill="#162438"/><circle cx="153" cy="101" r="3.2" fill="#38BDF8"/>' +
            '</g>' +
            /* 16 报错委屈水汪汪泪眼 */
            '<g id="' + P + 'eye_sad" style="display:none;">' +
              '<ellipse cx="90" cy="106" rx="14" ry="14" fill="#162438"/><circle cx="87" cy="102" r="4.8" fill="#FFFFFF"/>' +
              '<circle cx="95" cy="112" r="2.8" fill="#FFFFFF"/>' +
              '<ellipse cx="150" cy="106" rx="14" ry="14" fill="#162438"/><circle cx="147" cy="102" r="4.8" fill="#FFFFFF"/>' +
              '<circle cx="155" cy="112" r="2.8" fill="#FFFFFF"/>' +
            '</g>' +
            /* 00 沉睡闭眼 */
            '<g id="' + P + 'eye_sleep" style="display:none;">' +
              '<path d="M77,105 Q90,111 103,105" fill="none" stroke="#162438" stroke-width="3.8" stroke-linecap="round"/>' +
              '<path d="M137,105 Q150,111 163,105" fill="none" stroke="#162438" stroke-width="3.8" stroke-linecap="round"/>' +
            '</g>' +
          '</g>' +

          /* 嘴巴组 */
          '<g id="' + P + 'mouthG">' +
            '<path id="' + P + 'mouth_smile" d="M109,146 Q120,157 131,146" fill="none" stroke="#162438" stroke-width="3.2" stroke-linecap="round"/>' +
            '<circle id="' + P + 'mouth_dot" cx="120" cy="150" r="4.2" fill="#162438" style="display:none;"/>' +
            '<path id="' + P + 'mouth_grin" d="M106,144 Q120,166 134,144 Z" fill="#FF708A" stroke="#162438" stroke-width="2.5" style="display:none;"/>' +
            '<ellipse id="' + P + 'mouth_talk" class="mc-talking-mouth" cx="120" cy="150" rx="9" ry="6.5" fill="#FF708A" stroke="#162438" stroke-width="2" style="display:none;"/>' +
            '<path id="' + P + 'mouth_frown" d="M110,154 Q120,144 130,154" fill="none" stroke="#162438" stroke-width="3.2" stroke-linecap="round" style="display:none;"/>' +
          '</g>' +

        '</g>' + /* end faceRoot */

        /* 30 思考：头顶思维光环 */
        '<g id="' + P + 'fx_think" class="mc-thinking-halo" style="display:none;">' +
          '<circle cx="120" cy="28" r="4.5" fill="#F6C85F"/>' +
          '<circle cx="168" cy="46" r="3.5" fill="#93C5FD"/>' +
          '<circle cx="72" cy="46" r="3.2" fill="#C4B5FD"/>' +
        '</g>' +

        /* 31 查验：胸前极客雷达扫描 HUD */
        '<g id="' + P + 'fx_hud" style="display:none;">' +
          '<rect x="74" y="162" width="92" height="14" rx="7" fill="rgba(56,189,248,0.22)" stroke="#38BDF8" stroke-width="1.2"/>' +
          '<circle cx="86" cy="169" r="2.5" fill="#38BDF8"/><circle cx="95" cy="169" r="2.5" fill="#38BDF8"/>' +
          '<line x1="106" y1="169" x2="154" y2="169" stroke="#38BDF8" stroke-width="2" stroke-dasharray="4,3"/>' +
        '</g>' +

        /* 34 深度研报：极客科技眼镜与全息数据流 */
        '<g id="' + P + 'fx_glasses" style="display:none;">' +
          '<rect x="66" y="92" width="46" height="28" rx="8" fill="url(#' + P + 'glassGrad)" stroke="#38BDF8" stroke-width="1.8"/>' +
          '<rect x="128" y="92" width="46" height="28" rx="8" fill="url(#' + P + 'glassGrad)" stroke="#38BDF8" stroke-width="1.8"/>' +
          '<path d="M112,104 Q120,98 128,104" fill="none" stroke="#38BDF8" stroke-width="2"/>' +
          '<path class="mc-data-stream" d="M70,106 L108,106 M132,106 L170,106" fill="none" stroke="#67E8F9" stroke-width="1.5" stroke-dasharray="8,4"/>' +
        '</g>' +

        /* 22 生成：说话语音波纹 */
        '<g id="' + P + 'fx_wave" style="display:none;">' +
          '<circle class="mc-voice-wave" cx="195" cy="135" r="8" fill="none" stroke="#38BDF8" stroke-width="1.5"/>' +
          '<circle class="mc-voice-wave" cx="195" cy="135" r="14" fill="none" stroke="#38BDF8" stroke-width="1.2" style="animation-delay:.3s;"/>' +
          '<path d="M190,135 Q198,128 206,135" fill="none" stroke="#38BDF8" stroke-width="2" stroke-linecap="round"/>' +
        '</g>' +

        /* 16 报错：右手单手手持红色感叹号手摇牌 */
        '<g id="' + P + 'fx_tear" class="mc-sign-wave" style="display:none;">' +
          '<line x1="196" y1="144" x2="206" y2="92" stroke="#94A3B8" stroke-width="3" stroke-linecap="round"/>' +
          '<circle class="mc-signboard" cx="210" cy="78" r="17" fill="#EF4444" stroke="#FFFFFF" stroke-width="2.5"/>' +
          '<text x="210" y="85" text-anchor="middle" font-size="20" fill="#FFFFFF" ' +
            'font-family="-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif" font-weight="900">!</text>' +
        '</g>' +

      '</g>' + /* end mc-body-root */

      /* 3D 彩带前景层（身体身前，z >= 0） */
      '<g id="' + P + 'fxFront" class="mc-ribbon-front"></g>' +

      /* 00 睡眠：Z 气泡粒子 */
      '<g id="' + P + 'fx_sleep" style="display:none;">' +
        '<text class="mc-z-particle" style="font-family:\'Arial Rounded MT Bold\',sans-serif;font-weight:bold;fill:#60A5FA;" font-size="16">Z</text>' +
        '<text class="mc-z-particle" style="animation-delay:1.1s;font-family:\'Arial Rounded MT Bold\',sans-serif;font-weight:bold;fill:#93C5FD;" font-size="20">Z</text>' +
        '<text class="mc-z-particle" style="animation-delay:2.2s;font-family:\'Arial Rounded MT Bold\',sans-serif;font-weight:bold;fill:#3B82F6;" font-size="26">Z</text>' +
      '</g>' +

      /* 触摸反馈：跳动的心心 */
      '<g id="' + P + 'tap_heart" style="display:none;transform-origin:120px 40px;">' +
        '<path d="M120,44 C120,38 114,32 108,32 C101,32 96,37 96,44 C96,56 120,72 120,72 C120,72 144,56 144,44 ' +
          'C144,37 139,32 132,32 C126,32 120,38 120,44 Z" fill="#FF477E"/>' +
      '</g>' +

    '</svg>';
  }

  /* ================================================================
   * 3. 正统 3D 轨道空间彩带 + 重力五角星撒花引擎（实例级，支持多开）
   *    - 三条异面轨道（tilt / roll / rad 各不相同）形成真实前后景深
   *    - 轨迹按 z 符号切分为"身体背后 / 身体身前"两层，实现穿梭感
   *    - 撒花带重力、空气阻力、旋转与拉伸，含金色五角星
   * ================================================================ */
  var HEAD_C = 120;
  var TAU = Math.PI * 2;
  var CONFETTI_COLORS = ['#f9705c', '#5b95f0', '#3fbe86', '#f5b13f', '#9a72ee', '#35c3bd', '#ff6b95', '#fbbf24'];
  var STAR_GOLD = '#F5B840';
  var STAR_PATH = (function () {
    var pts = [], e, a, r;
    for (e = 0; e < 10; e++) {
      a = -Math.PI / 2 + e * Math.PI / 5;
      r = e % 2 === 0 ? 1 : 0.42;
      pts.push((Math.cos(a) * r).toFixed(3) + ' ' + (Math.sin(a) * r).toFixed(3));
    }
    return 'M' + pts.join('L') + 'Z';
  })();

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function r2(v) { return Math.round(v * 100) / 100; }

  /**
   * @param {Object} ctx  { defs, back, front, prefix, isDelivery: fn }
   */
  function createRibbonFX(ctx) {
    var trails = [];
    var planes = [];
    var planeG = 4;
    var baseHue = 0;
    var spawnIdx = 0;
    var confPieces = [];
    var uid = 0;
    var lastNow = 0;
    var animRaf = null;
    var animTimer = null;
    var animActive = false;

    function makePlanes() {
      planes = [];
      var n = 3;
      var roll0 = rand(-0.6, 0.6), pi, tilt, roll;
      for (pi = 0; pi < n; pi++) {
        tilt = rand(0.24, 0.58);
        roll = roll0 + pi * (Math.PI / n) + rand(-0.1, 0.1);
        planes.push({ tilt: tilt, roll: roll });
      }
      planeG = 3;
      baseHue = rand(0, 360);
      spawnIdx = 0;
    }

    // 轨道参数方程：三维圆环绕 X 轴倾斜 + 绕 Z 轴滚转，返回屏幕坐标与 z 深度
    function orbitPoint(o, lam) {
      var hx = o.rad * Math.sin(lam);
      var hy = -o.rad * Math.cos(lam) * Math.sin(o.tilt);
      var ca = Math.cos(o.roll), sa = Math.sin(o.roll);
      return {
        x: HEAD_C + hx * ca - hy * sa,
        y: HEAD_C + hx * sa + hy * ca,
        z: Math.cos(lam) * Math.cos(o.tilt),
        l: lam
      };
    }

    function createTrail(cfg) {
      if (trails.length > 8) return null;
      if (!ctx.defs || !ctx.back || !ctx.front) return null;

      var gradId = ctx.prefix + 'tg_' + (++uid);
      var gradEl = document.createElementNS(SVG_NS, 'linearGradient');
      gradEl.setAttribute('id', gradId);
      gradEl.setAttribute('gradientUnits', 'userSpaceOnUse');
      var stops = [], s, st;
      for (s = 0; s < 5; s++) {
        st = document.createElementNS(SVG_NS, 'stop');
        st.setAttribute('offset', (s / 4).toFixed(3));
        gradEl.appendChild(st);
        stops.push(st);
      }
      ctx.defs.appendChild(gradEl);
      var fill = 'url(#' + gradId + ')';

      var back = document.createElementNS(SVG_NS, 'path');
      back.setAttribute('stroke', 'none');
      back.setAttribute('fill', fill);
      back.setAttribute('opacity', '0.85');

      var front = document.createElementNS(SVG_NS, 'path');
      front.setAttribute('stroke', 'none');
      front.setAttribute('fill', fill);
      front.setAttribute('opacity', '0.85');

      ctx.back.appendChild(back);
      ctx.front.appendChild(front);

      var trailObj = {
        o: cfg.o, r: cfg.r, life: 0, ret: 0, hist: [],
        hue: cfg.hue,
        hueSpan: rand(60, 110),
        hueVel: rand(25, 45) * (Math.random() < 0.5 ? 1 : -1),
        gradEl: gradEl, stops: stops, back: back, front: front
      };
      trails.push(trailObj);
      return trailObj;
    }

    // 把折线点列转成带宽度的带状路径，并按 z 符号分离前后景
    function buildTrail(pts, width) {
      var n = pts.length;
      if (n < 2) return { front: '', back: '' };
      var nx = [], ny = [], e;
      for (e = 0; e < n; e++) {
        var p0 = pts[e > 0 ? e - 1 : 0], p1 = pts[e < n - 1 ? e + 1 : n - 1];
        var dx = p1.x - p0.x, dy = p1.y - p0.y;
        var h = Math.hypot(dx, dy) || 1;
        dx /= h; dy /= h;
        var d = width * (0.5 + (e / (n - 1)) * 0.5) / 2;
        nx.push(-dy * d); ny.push(dx * d);
      }
      function cap(idx) {
        var hw = Math.max(Math.hypot(nx[idx], ny[idx]), 0.2);
        return 'A' + r2(hw) + ' ' + r2(hw) + ' 0 0 0 ';
      }
      function seg(a, b) {
        var s = '', k;
        for (k = a; k <= b; k++) s += (k === a ? 'M' : 'L') + r2(pts[k].x + nx[k]) + ' ' + r2(pts[k].y + ny[k]);
        s += b === n - 1 ? cap(b) : 'L';
        for (k = b; k >= a; k--) s += (k === b ? '' : 'L') + r2(pts[k].x - nx[k]) + ' ' + r2(pts[k].y - ny[k]);
        if (a === 0) s += cap(0) + r2(pts[0].x + nx[0]) + ' ' + r2(pts[0].y + ny[0]);
        return s + 'Z';
      }
      var front = '', back = '', d0 = 0;
      while (d0 < n) {
        var isF = pts[d0].z >= 0;
        var i2 = d0;
        while (i2 + 1 < n && (pts[i2 + 1].z >= 0) === isF) i2++;
        var a2 = Math.max(d0 - 1, 0), b2 = Math.min(i2 + 1, n - 1);
        if (b2 > a2) {
          var str = seg(a2, b2);
          if (isF) front += str; else back += str;
        }
        d0 = i2 + 1;
      }
      return { front: front, back: back };
    }

    function updateSingleTrail(rb, dt) {
      rb.life += dt;

      // 处于交付态时彩带常驻环绕；离开交付态才优雅缩回
      var retract = !ctx.isDelivery();
      rb.ret = clamp(rb.ret + (retract ? dt / 0.45 : -dt / 0.35), 0, 1);
      if (retract && rb.ret >= 1) return false;

      var o = rb.o;
      o.lam += o.lamVel * dt;

      var dir = o.lamVel >= 0 ? 1 : -1;
      var hist = rb.hist;
      var lastL = hist.length ? hist[hist.length - 1].l : o.lam - 0.001 * dir;
      var dl = o.lam - lastL;
      var steps = Math.min(Math.ceil(Math.abs(dl) / 0.08), 24);
      for (var st = 1; st <= steps; st++) hist.push(orbitPoint(o, lastL + dl * st / steps));
      if (!hist.length) hist.push(orbitPoint(o, o.lam));

      var span = o.arc * (1 - rb.ret * rb.ret * (3 - 2 * rb.ret));
      while (hist.length > 2 && Math.abs(o.lam - hist[0].l) > span) hist.shift();
      var over = Math.abs(o.lam - hist[0].l) - span;
      if (hist.length >= 2 && over > 0) {
        var tl = hist[0].l + (o.lam - hist[0].l >= 0 ? 1 : -1) * over;
        hist[0] = orbitPoint(o, tl);
      }
      if (hist.length > 48) hist.splice(0, hist.length - 48);

      // 头部朝向观察者时加粗，形成"由远及近"的透视呼吸
      var zHead = Math.cos(o.lam) * Math.cos(o.tilt);
      var pz = 0.72 + 0.28 * clamp(zHead, 0, 1);
      var grow = Math.min(rb.life / 0.22, 1);
      var curGrow = Math.max(grow, 0.4);
      var width = rb.r * pz * 1.65 * curGrow * (1 - 0.72 * rb.ret * rb.ret);
      var fade = Math.min(Math.max(rb.life / 0.2, 0.45), 1).toFixed(3);

      if (hist.length < 2 || width < 0.5) {
        rb.back.setAttribute('opacity', '0');
        rb.front.setAttribute('opacity', '0');
        return true;
      }
      var dstr = buildTrail(hist, width);
      rb.back.setAttribute('d', dstr.back);
      rb.front.setAttribute('d', dstr.front);
      rb.back.setAttribute('opacity', dstr.back ? fade : '0');
      rb.front.setAttribute('opacity', dstr.front ? fade : '0');

      // 沿轨迹流动的渐变，色相缓慢漂移
      var hue = rb.hue + rb.hueVel * rb.life;
      for (var si = 0; si < rb.stops.length; si++) {
        var frac = si / (rb.stops.length - 1);
        var hv = hue + frac * rb.hueSpan;
        rb.stops[si].setAttribute('stop-color',
          'hsl(' + (((hv % 360) + 360) % 360).toFixed(0) + ' 88% ' + (55 + 10 * frac).toFixed(0) + '%)');
      }
      var tail = hist[0], headP = hist[hist.length - 1];
      rb.gradEl.setAttribute('x1', tail.x.toFixed(1));
      rb.gradEl.setAttribute('y1', tail.y.toFixed(1));
      rb.gradEl.setAttribute('x2', headP.x.toFixed(1));
      rb.gradEl.setAttribute('y2', headP.y.toFixed(1));
      return true;
    }

    function removeTrail(idx) {
      var rb = trails[idx];
      if (!rb) return;
      if (rb.back && rb.back.parentNode) rb.back.parentNode.removeChild(rb.back);
      if (rb.front && rb.front.parentNode) rb.front.parentNode.removeChild(rb.front);
      if (rb.gradEl && rb.gradEl.parentNode) rb.gradEl.parentNode.removeChild(rb.gradEl);
      trails.splice(idx, 1);
    }

    function spawnTrail(lam0, dir) {
      var pl = planes[spawnIdx % planes.length];
      var tierStep = 24 / Math.max(planeG - 1, 1);
      var rw = rand(9.5, 13);
      var vel = dir * rand(2.8, 3.8);
      var o = {
        lam: lam0, lamVel: vel, tilt: pl.tilt, roll: pl.roll,
        rad: 112 + spawnIdx * tierStep, radVel: 0, arc: rand(2.8, 3.8)
      };
      var trailObj = createTrail({
        o: o, r: rw, hue: baseHue + 360 * spawnIdx / Math.max(planeG, 1)
      });
      spawnIdx++;
      if (trailObj) {
        var initSteps = 16;
        var initArc = 1.1 * dir;
        for (var s = initSteps; s >= 0; s--) {
          trailObj.hist.push(orbitPoint(o, lam0 - initArc * (s / initSteps)));
        }
        trailObj.life = 0.2;
        updateSingleTrail(trailObj, 0.016);
      }
    }

    // 重力撒花：径向爆开 + 空气阻力 + 竖直重力 + 旋转/拉伸，含金色五角星
    function burst(count) {
      if (!ctx.front) return;
      count = count || 28;
      for (var i = 0; i < count && confPieces.length < 60; i++) {
        var ang = (i / count) * TAU + rand(-0.35, 0.35);
        var spd = rand(180, 360);
        var star = Math.random() < 0.25;
        var round = !star && Math.random() < 0.35;
        var node;
        if (star) {
          node = document.createElementNS(SVG_NS, 'path');
          node.setAttribute('d', STAR_PATH);
          node.setAttribute('fill', STAR_GOLD);
        } else if (round) {
          node = document.createElementNS(SVG_NS, 'circle');
          node.setAttribute('r', '1');
          node.setAttribute('fill', CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0]);
        } else {
          node = document.createElementNS(SVG_NS, 'rect');
          node.setAttribute('x', '-0.5'); node.setAttribute('y', '-0.5');
          node.setAttribute('width', '1'); node.setAttribute('height', '1');
          node.setAttribute('rx', '0.24');
          node.setAttribute('fill', CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0]);
        }
        ctx.front.appendChild(node);
        confPieces.push({
          x: HEAD_C + Math.cos(ang) * rand(86, 110),
          y: HEAD_C + Math.sin(ang) * rand(86, 110),
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - rand(30, 80),
          life: 0, max: rand(0.65, 1.1),
          r: star ? rand(5.5, 8.5) : rand(4.5, 9),
          rot: rand(0, 360), vr: rand(-280, 280),
          stretch: (!star && !round) ? 1.9 : 1,
          el: node
        });
      }
    }

    function step(now) {
      if (!lastNow) lastNow = now;
      var rawDt = (now - lastNow) / 1000;
      if (rawDt < 0.005) return;
      var dt = clamp(rawDt, 0.008, 0.045);
      lastNow = now;

      for (var ti = trails.length - 1; ti >= 0; ti--) {
        if (!updateSingleTrail(trails[ti], dt)) removeTrail(ti);
      }

      for (var ci = confPieces.length - 1; ci >= 0; ci--) {
        var pc = confPieces[ci];
        pc.life += dt;
        if (pc.life >= pc.max) {
          if (pc.el.parentNode) pc.el.parentNode.removeChild(pc.el);
          confPieces.splice(ci, 1);
          continue;
        }
        pc.x += pc.vx * dt;
        pc.y += pc.vy * dt;
        var drag = Math.pow(0.94, 60 * dt);
        pc.vx *= drag;
        pc.vy = pc.vy * drag + 45 * dt;   // 重力
        pc.rot += pc.vr * dt;
        var u = pc.life / pc.max;
        var fd = u < 0.1 ? u / 0.1 : Math.pow(1 - (u - 0.1) / 0.9, 1.7);
        var sz = Math.max(pc.r * (1 - 0.38 * u), 0.5);
        pc.el.setAttribute('opacity', fd.toFixed(3));
        pc.el.setAttribute('transform',
          'translate(' + r2(pc.x) + ' ' + r2(pc.y) + ') ' +
          'rotate(' + r2(pc.rot) + ') ' +
          'scale(' + r2(sz) + ' ' + r2(sz * pc.stretch) + ')');
      }

      if (trails.length === 0 && confPieces.length === 0 && !ctx.isDelivery()) stopLoop();
    }

    function loopTick(now) {
      if (!animActive) return;
      step(now || performance.now());
      if (animActive) {
        if (typeof requestAnimationFrame === 'function') animRaf = requestAnimationFrame(loopTick);
      }
    }

    function timerTick() {
      if (!animActive) return;
      var now = performance.now();
      if (now - lastNow >= 14) step(now);
      if (animActive) animTimer = setTimeout(timerTick, 16);
    }

    function startLoop() {
      if (animActive) return;
      animActive = true;
      lastNow = performance.now();
      if (typeof requestAnimationFrame === 'function') animRaf = requestAnimationFrame(loopTick);
      animTimer = setTimeout(timerTick, 16);
    }

    function stopLoop() {
      animActive = false;
      if (animRaf && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(animRaf);
        animRaf = null;
      }
      if (animTimer) {
        clearTimeout(animTimer);
        animTimer = null;
      }
      lastNow = 0;
    }

    function trigger() {
      clear();
      makePlanes();
      var dir = 1;
      var lam0 = rand(0, TAU);
      spawnTrail(lam0, dir);
      spawnTrail((lam0 + Math.PI * 0.7) % TAU, -dir);
      spawnTrail((lam0 + Math.PI * 1.4) % TAU, dir);
      burst(32);
      startLoop();
    }

    // 离开交付态：不清场，交给 retract 动画优雅缩回
    function release() {
      if (trails.length || confPieces.length) startLoop();
    }

    function clear() {
      while (trails.length) removeTrail(0);
      while (confPieces.length) {
        var p = confPieces.pop();
        if (p.el.parentNode) p.el.parentNode.removeChild(p.el);
      }
      stopLoop();
    }

    return { trigger: trigger, release: release, clear: clear, isRunning: function () { return animActive; } };
  }

  /* ================================================================
   * 4. 实例与 DOM 装配工具
   * ================================================================ */
  var USED_PREFIX = {};

  function isElement(v) { return !!v && typeof v === 'object' && v.nodeType === 1; }

  function resolveContainer(target) {
    if (isElement(target)) return target;
    if (!target || typeof target !== 'string') return null;
    var sel = target.trim();
    if (!sel) return null;
    if (typeof document === 'undefined') return null;
    try {
      var found = document.querySelector(sel);
      if (found) return found;
    } catch (err) { /* 非法选择器，退回 id 查找 */ }
    return document.getElementById(sel.replace(/^#/, ''));
  }

  function normalizeSize(size) {
    var n = parseFloat(size);
    if (!isFinite(n) || n <= 0) n = 160;
    return Math.max(20, Math.min(2000, Math.round(n)));
  }

  // 前缀去重：保证同一页面内所有 defs / 滤镜 / 渐变 / 剪裁 id 绝对唯一
  function uniquePrefix(base) {
    var raw = (base === undefined || base === null || base === '') ? 'mc' : String(base);
    raw = raw.replace(/[^A-Za-z0-9_-]/g, '');
    if (!raw) raw = 'mc';
    if (raw.charAt(raw.length - 1) !== '_') raw += '_';
    var p = raw, i = 1;
    while (USED_PREFIX[p]) { i++; p = raw + i + '_'; }
    USED_PREFIX[p] = true;
    return p;
  }

  var CACHE_NAMES = [
    'bodyRoot', 'blushG', 'earL', 'earR', 'handL', 'handR', 'handL_wrap', 'handR_wrap',
    'tap_heart', 'fxBack', 'fxFront', 'defs', 'shadow', 'eyesG', 'mouthG'
  ];

  /* ================================================================
   * 5. MinisCompanion 主类
   * ================================================================ */
  function MinisCompanion(options) {
    if (!(this instanceof MinisCompanion)) return new MinisCompanion(options);
    var opts = options || {};

    var host = resolveContainer(opts.container);
    if (!host) {
      throw new Error('[MinisCompanion] 找不到挂载容器: ' + opts.container);
    }
    if (typeof document === 'undefined') {
      throw new Error('[MinisCompanion] 当前环境没有 DOM，无法实例化');
    }

    injectStyle();

    this.container = host;
    this.size = normalizeSize(opts.size);
    this.prefix = uniquePrefix(opts.idPrefix);
    this.idPrefix = this.prefix;
    this.interactive = opts.interactive !== false;

    this._listeners = {};
    this._timers = [];
    this._state = null;
    this._belly = false;
    this._blushOn = false;
    this._flashTimer = null;
    this._destroyed = false;

    // --- 组装 DOM ---
    var wrap = document.createElement('div');
    wrap.className = 'mc-host';
    wrap.style.width = this.size + 'px';
    wrap.style.height = this.size + 'px';
    wrap.setAttribute('data-minis-companion', this.prefix);

    host.innerHTML = '';
    host.appendChild(wrap);
    this.hostEl = wrap;

    wrap.innerHTML = svgTemplate(this.prefix);
    this.svg = wrap.firstChild;

    this._cacheEls();

    // --- 3D 彩带 / 撒花引擎（实例独占） ---
    var self = this;
    this._fx = createRibbonFX({
      defs: this.el.defs,
      back: this.el.fxBack,
      front: this.el.fxFront,
      prefix: this.prefix,
      isDelivery: function () { return self._state === 'delivered'; }
    });

    // --- 初始状态 ---
    var initState = resolveState(opts.state);
    if (!initState) initState = 'idle';
    this._state = initState;
    this._apply();

    if (this.interactive) this._bindGestures();
    if (initState === 'delivered') this._fx.trigger();
  }

  var proto = MinisCompanion.prototype;

  proto._cacheEls = function () {
    var el = {}, i, node;
    for (i = 0; i < CACHE_NAMES.length; i++) {
      node = this.svg.querySelector('#' + this.prefix + CACHE_NAMES[i]);
      if (node) el[CACHE_NAMES[i]] = node;
    }
    for (i = 0; i < EYE_KEYS.length; i++) {
      node = this.svg.querySelector('#' + this.prefix + 'eye_' + EYE_KEYS[i]);
      if (node) el['eye_' + EYE_KEYS[i]] = node;
    }
    for (i = 0; i < MOUTH_KEYS.length; i++) {
      node = this.svg.querySelector('#' + this.prefix + 'mouth_' + MOUTH_KEYS[i]);
      if (node) el['mouth_' + MOUTH_KEYS[i]] = node;
    }
    for (i = 0; i < FX_KEYS.length; i++) {
      node = this.svg.querySelector('#' + this.prefix + 'fx_' + FX_KEYS[i]);
      if (node) el['fx_' + FX_KEYS[i]] = node;
    }
    el.pupilL = this.svg.querySelector('#' + this.prefix + 'eye_calm .mc-eye-pupil-l');
    el.pupilR = this.svg.querySelector('#' + this.prefix + 'eye_calm .mc-eye-pupil-r');
    this.el = el;
  };

  proto._setHand = function (side, x, y, cls) {
    var hand = side === 'L' ? this.el.handL : this.el.handR;
    var wrap = side === 'L' ? this.el.handL_wrap : this.el.handR_wrap;
    if (hand) { hand.setAttribute('cx', x); hand.setAttribute('cy', y); }
    if (wrap) wrap.setAttribute('class', cls || '');
  };

  proto._setPupils = function (dx, dy) {
    var t = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px)';
    if (this.el.pupilL) this.el.pupilL.style.transform = t;
    if (this.el.pupilR) this.el.pupilR.style.transform = t;
  };

  proto._resetPupils = function () {
    if (this.el.pupilL) this.el.pupilL.style.transform = '';
    if (this.el.pupilR) this.el.pupilR.style.transform = '';
  };

  /* 依据 this._state 全量重建表情 / 骨骼 / 特效 */
  proto._apply = function () {
    var st = STATES[this._state] || STATES.idle;
    var el = this.el, i;

    // 眼睛 / 嘴巴 / 特效：先全量隐藏
    for (i = 0; i < EYE_KEYS.length; i++) if (el['eye_' + EYE_KEYS[i]]) el['eye_' + EYE_KEYS[i]].style.display = 'none';
    for (i = 0; i < MOUTH_KEYS.length; i++) if (el['mouth_' + MOUTH_KEYS[i]]) el['mouth_' + MOUTH_KEYS[i]].style.display = 'none';
    for (i = 0; i < FX_KEYS.length; i++) if (el['fx_' + FX_KEYS[i]]) el['fx_' + FX_KEYS[i]].style.display = 'none';

    // 耳朵 / 腮红复位
    if (el.earL) el.earL.setAttribute('class', '');
    if (el.earR) el.earR.setAttribute('class', '');
    if (el.blushG) { el.blushG.setAttribute('class', 'mc-blush'); el.blushG.style.opacity = '0.65'; }

    // 手部先回到自然垂放位
    this._setHand('L', 18, 144, 'mc-hand-left-sway');
    this._setHand('R', 222, 144, 'mc-hand-right-sway');

    // 状态显影
    if (st.eyes && el['eye_' + st.eyes]) el['eye_' + st.eyes].style.display = '';
    if (st.mouth && el['mouth_' + st.mouth]) el['mouth_' + st.mouth].style.display = '';
    if (st.fx) {
      for (i = 0; i < st.fx.length; i++) {
        if (el['fx_' + st.fx[i]]) el['fx_' + st.fx[i]].style.display = '';
      }
    }
    if (st.hands) {
      for (i = 0; i < st.hands.length; i++) {
        this._setHand(st.hands[i][0], st.hands[i][1], st.hands[i][2], st.hands[i][3]);
      }
    }
    if (st.blush && el.blushG) el.blushG.setAttribute('class', 'mc-blush mc-blush-pulse');
    if (st.ears === 'droop') {
      if (el.earL) el.earL.setAttribute('class', 'mc-ear-droop-l');
      if (el.earR) el.earR.setAttribute('class', 'mc-ear-droop-r');
    }

    // 身体根骨骼
    if (el.bodyRoot) el.bodyRoot.setAttribute('class', 'mc-body-root ' + (st.body || ''));

    // 长按摸肚皮：临时软趴趴覆盖（保持到下一次 setState）
    if (this._belly) {
      if (el.bodyRoot) el.bodyRoot.setAttribute('class', 'mc-body-root mc-anim-belly-rub');
      for (i = 0; i < EYE_KEYS.length; i++) if (el['eye_' + EYE_KEYS[i]]) el['eye_' + EYE_KEYS[i]].style.display = 'none';
      if (el.eye_happy) el.eye_happy.style.display = '';
    }

    if (this._blushOn && el.blushG) el.blushG.setAttribute('class', 'mc-blush mc-blush-pulse');
    if (this._state !== 'idle') this._resetPupils();
  };

  /* ---------------- 事件 ---------------- */
  proto.on = function (event, callback) {
    if (typeof callback !== 'function') return this;
    var key = String(event);
    (this._listeners[key] || (this._listeners[key] = [])).push(callback);
    return this;
  };

  proto.off = function (event, callback) {
    var key = String(event);
    var list = this._listeners[key];
    if (!list) return this;
    if (!callback) { delete this._listeners[key]; return this; }
    var idx = list.indexOf(callback);
    if (idx >= 0) list.splice(idx, 1);
    return this;
  };

  proto._emit = function (type, payload) {
    var list = this._listeners[type];
    if (!list || !list.length) return;
    var copy = list.slice(), i;
    for (i = 0; i < copy.length; i++) {
      try { copy[i].call(this, payload, this); } catch (err) {
        if (typeof console !== 'undefined' && console.error) console.error('[MinisCompanion] 事件回调异常:', err);
      }
    }
  };

  /* ---------------- 公共 API ---------------- */
  proto.setState = function (state) {
    if (this._destroyed) return this;
    var name = resolveState(state);
    if (!name) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[MinisCompanion] 未知状态: ' + state + '，可用状态: ' + ORDER.join(' / '));
      }
      return this;
    }
    var prev = this._state;
    this._belly = false;
    this._blushOn = false;
    if (this._flashTimer) { clearTimeout(this._flashTimer); this._flashTimer = null; }
    this._state = name;
    this._apply();
    if (name === 'delivered') {
      this._fx.trigger();
    } else {
      this._fx.release();
    }
    if (prev !== name) {
      this._emit('stateChange', {
        state: name,
        id: STATES[name].id,
        label: STATES[name].label,
        previous: prev,
        instance: this
      });
    }
    return this;
  };

  proto.getState = function () { return this._state; };

  proto.getStateId = function () { return STATES[this._state] ? STATES[this._state].id : null; };

  proto.setSize = function (px) {
    if (this._destroyed) return this;
    var size = normalizeSize(px);
    this.size = size;
    if (this.hostEl) {
      this.hostEl.style.width = size + 'px';
      this.hostEl.style.height = size + 'px';
    }
    this._emit('resize', { size: size, instance: this });
    return this;
  };

  proto.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;
    var i;

    for (i = 0; i < this._timers.length; i++) clearTimeout(this._timers[i]);
    this._timers.length = 0;
    if (this._flashTimer) { clearTimeout(this._flashTimer); this._flashTimer = null; }

    // 停掉 rAF 时钟与定时器兜底、清空所有彩带与粒子
    if (this._fx) {
      if (this._fx.isRunning()) this._fx.clear();
      this._fx.clear();
    }

    if (this.interactive) this._unbindGestures();

    this._emit('destroy', { instance: this });

    if (this.hostEl && this.hostEl.parentNode) this.hostEl.parentNode.removeChild(this.hostEl);
    if (this.container && this.container.getAttribute && this.container.getAttribute('data-minis-companion') === null) {
      /* 容器由调用方持有，不销毁 */
    }
    delete USED_PREFIX[this.prefix];

    this._listeners = {};
    this.hostEl = null;
    this.svg = null;
    this.el = null;
    this._fx = null;
  };

  proto._later = function (fn, ms) {
    var self = this;
    var id = setTimeout(function () {
      var idx = self._timers.indexOf(id);
      if (idx >= 0) self._timers.splice(idx, 1);
      if (!self._destroyed) fn();
    }, ms);
    this._timers.push(id);
    return id;
  };

  /* ================================================================
   * 6. 四重手势：摸头弹跳 / 捏脸 / 摸肚皮躺平 / 眼神跟随
   * ================================================================ */
  proto._flash = function (cls, dur) {
    var self = this;
    var body = this.el && this.el.bodyRoot;
    if (!body) return;
    if (this._flashTimer) { clearTimeout(this._flashTimer); this._flashTimer = null; }
    body.setAttribute('class', 'mc-body-root ' + cls);
    this._flashTimer = setTimeout(function () {
      self._flashTimer = null;
      if (!self._destroyed) self._apply();
    }, dur);
  };

  proto._tap = function () {
    var self = this;
    this._belly = false;
    this._flash('mc-anim-bounce', 720);

    var heart = this.el.tap_heart;
    if (heart) {
      heart.style.display = '';
      heart.style.animation = 'none';
      void heart.getBoundingClientRect();
      heart.style.animation = 'mcFloatZ 1.2s ease-out forwards';
      this._later(function () {
        if (self.el && self.el.tap_heart) self.el.tap_heart.style.display = 'none';
      }, 1200);
    }
    if (this._state === 'delivered') this._fx.trigger();
    this._emit('tap', { state: this._state, instance: this });
  };

  proto._pinch = function () {
    var self = this;
    this._belly = false;
    this._flash('mc-anim-pinch', 760);

    this._blushOn = true;
    if (this.el.blushG) this.el.blushG.setAttribute('class', 'mc-blush mc-blush-pulse');
    this._later(function () {
      self._blushOn = false;
      if (!self._destroyed) self._apply();
    }, 1500);

    this._emit('pinch', { state: this._state, instance: this });
  };

  proto._bellyRub = function () {
    this._belly = true;
    this._apply();
    this._emit('belly', { state: this._state, instance: this });
  };

  proto._bindGestures = function () {
    var self = this, host = this.hostEl;
    var longTimer = null, lastTap = 0, longFired = false, moved = false, downX = 0, downY = 0;

    this._hDown = function (ev) {
      if (ev.button !== undefined && ev.button !== 0) return;
      longFired = false;
      moved = false;
      downX = ev.clientX || 0;
      downY = ev.clientY || 0;
      if (longTimer) { clearTimeout(longTimer); longTimer = null; }
      longTimer = setTimeout(function () {
        longTimer = null;
        if (self._destroyed || moved) return;
        longFired = true;
        self._bellyRub();     // 长按 550ms → 摸肚皮躺平
      }, 550);
    };

    this._hMove = function (ev) {
      if (!longTimer) return;
      if (Math.abs((ev.clientX || 0) - downX) > 8 || Math.abs((ev.clientY || 0) - downY) > 8) {
        moved = true;
        clearTimeout(longTimer);
        longTimer = null;
      }
    };

    this._hUp = function () {
      if (longTimer) { clearTimeout(longTimer); longTimer = null; }
      if (longFired || moved) { longFired = false; return; }
      var now = Date.now();
      if (now - lastTap < 300) {
        lastTap = 0;
        self._pinch();        // 双击 → 捏脸
      } else {
        lastTap = now;
        var stamp = now;
        self._later(function () {
          if (!self._destroyed && lastTap === stamp && !longFired) self._tap();  // 单击 → 摸头
        }, 320);
      }
    };

    this._hCancel = function () {
      if (longTimer) { clearTimeout(longTimer); longTimer = null; }
    };

    this._hCtx = function (ev) { ev.preventDefault(); };

    host.addEventListener('pointerdown', this._hDown);
    host.addEventListener('pointermove', this._hMove);
    host.addEventListener('pointerup', this._hUp);
    host.addEventListener('pointercancel', this._hCancel);
    host.addEventListener('pointerleave', this._hCancel);
    host.addEventListener('contextmenu', this._hCtx);
    host.style.touchAction = 'none';
    host.style.cursor = 'pointer';
    host.style.webkitUserSelect = 'none';

    // 4. 滑动眼神跟随（仅在待机态、且启用交互时生效）
    this._hEyeMove = function (ev) {
      if (self._destroyed || !self.interactive || self._state !== 'idle' || !self.el) return;
      var w = (typeof window !== 'undefined' && window.innerWidth) || 1;
      var h = (typeof window !== 'undefined' && window.innerHeight) || 1;
      var nx = (ev.clientX / w) * 2 - 1;
      var ny = (ev.clientY / h) * 2 - 1;
      self._setPupils(nx * 5, ny * 3.5);
    };
    this._eyeTarget = (typeof window !== 'undefined') ? window : host;
    this._eyeTarget.addEventListener('pointermove', this._hEyeMove, { passive: true });
  };

  proto._unbindGestures = function () {
    var host = this.hostEl;
    if (host) {
      host.removeEventListener('pointerdown', this._hDown);
      host.removeEventListener('pointermove', this._hMove);
      host.removeEventListener('pointerup', this._hUp);
      host.removeEventListener('pointercancel', this._hCancel);
      host.removeEventListener('pointerleave', this._hCancel);
      host.removeEventListener('contextmenu', this._hCtx);
      if (host.style) {
        host.style.touchAction = '';
        host.style.cursor = '';
      }
    }
    if (this._eyeTarget) {
      this._eyeTarget.removeEventListener('pointermove', this._hEyeMove);
      this._eyeTarget = null;
    }
  };

  /* ================================================================
   * 7. 静态元信息 & 导出
   * ================================================================ */
  MinisCompanion.version = VERSION;
  MinisCompanion.states = ORDER.slice();
  MinisCompanion.stateIds = ID_OF;
  MinisCompanion.stateMeta = STATES;
  MinisCompanion.resolveState = resolveState;

  return MinisCompanion;
});
