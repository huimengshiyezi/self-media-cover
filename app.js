/* ====================================================
 * 自媒体封面工具 — 主逻辑
 * 画布预设尺寸 / 背景图 / 得意黑 Regular 文字 / 模板
 * ==================================================== */

(() => {
  'use strict';

  // ---------- 配置常量 ----------
  // 默认画布（= 自媒体封面，也是历史默认值；全部尺寸的唯一来源是 state.canvas）
  const DEFAULT_W = 1800;
  const DEFAULT_H = 766;           // 21:9 (1800 / 9 × 21 ≈ 766)
  const TITLE_FONT = '"得意黑 Smiley Sans", "Smiley Sans", "SmileySans-Oblique", sans-serif';
  const WM_FONT    = '"AlibabaPuHuiTi Bold", "AlibabaPuHuiTi-3-85-Bold", "AlibabaPuHuiTi", sans-serif';
  const DEFAULT_TITLE = '你的自媒体标题';

  // ---- 画布预设表（唯一来源）----
  // ⚠️ 这些尺寸是各平台的「常见值」，不是官方承诺值 —— 界面上也有同样提醒。
  const PRESETS = [
    { key: 'gzh-cover',   label: '自媒体封面 21:9',   w: 1800, h: 766  },
    { key: 'gzh-head',    label: '自媒体首图 2.35:1', w: 900,  h: 383  },
    { key: 'gzh-square',  label: '自媒体方图 1:1',    w: 900,  h: 900  },
    { key: 'body-16-9',   label: '正文配图 16:9',     w: 1280, h: 720  },
    { key: 'xhs-3-4',     label: '小红书竖图 3:4',    w: 1080, h: 1440 },
    { key: 'douyin-9-16', label: '抖音竖版 9:16',     w: 1080, h: 1920 },
    { key: 'custom',      label: '自定义',            w: 0,    h: 0    },
  ];
  const DEFAULT_PRESET = 'gzh-cover';

  // ---- 水印锁定位置：按画布尺寸比例重算 ----
  // 左右边距按宽度等比（默认比例下 = 70），下边距 66px 固定不变。
  const WM_LOCK_RATIO = { x: 70 / DEFAULT_W, bottom: DEFAULT_H - 700 };
  const CANVAS_W_MIN = 240;
  const CANVAS_H_MIN = 240;
  const CANVAS_MAX   = 6000;
  // 标题被自动夹回画面内的下限：至少留出这么多可见高度
  const MIN_VISIBLE_H = 48;
  // 标题位置/字号按比例缩放的下限（避免缩到看不清）
  const TITLE_SCALE_FLOOR = 0.45;

  function lockWmX(w) { return Math.round(w * WM_LOCK_RATIO.x); }
  function lockWmY(h) { return h - WM_LOCK_RATIO.bottom; }

  // ---------- 默认状态 ----------
  const state = {
    // 画布：宽高 + 当前预设（custom 表示用户自己填的宽高）
    canvas: { w: DEFAULT_W, h: DEFAULT_H, preset: DEFAULT_PRESET },
    bg: null,                        // { dataUrl, naturalW, naturalH }
    title: {
      text: DEFAULT_TITLE,
      x: 50,                         // 相对于对齐锚点的偏移（0 ~ 画布宽）
      y: 200,
      fontSize: 120,
      letterSpacing: 0,              // em 倍率
      lineHeight: 1.4,
      color: '#ffffff',
      align: 'left',                 // left | center | right — 相对画布绝对锚定
      maxWidth: DEFAULT_W,
    },
    stroke: {
      enabled: false,
      width: 3,
      color: '#000000',
    },
    shadow: {
      enabled: false,
      x: 7,
      y: 7,
      blur: 9,
      color: '#000000',
      alpha: 70,                    // 0-100
    },
    watermark: {
      text: 'AI 绘梦师葉子',
      fontSize: 50,
      color: '#ffffff',
      alpha: 80,                    // 0-100
      locked: true,                 // true = 固定在左下角（随画布尺寸重算）；false = 可调 X/Y
      x: lockWmX(DEFAULT_W),
      y: lockWmY(DEFAULT_H),
    },
  };

  // 对齐 → 画布水平锚点（绝对坐标）
  function alignAnchorX(align) {
    if (align === 'center') return state.canvas.w / 2;
    if (align === 'right') return state.canvas.w;
    return 0;                        // left
  }

  // 比例的可读写法：尽量取整，避免出现 2.3523:1 这种噪音
  function ratioLabel(w, h) {
    if (!w || !h) return '';
    const r = w / h;
    return (Math.abs(r - Math.round(r * 100) / 100) < 0.005)
      ? String(Math.round(r * 100) / 100)
      : r.toFixed(2);
  }

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  canvas.width = state.canvas.w;
  canvas.height = state.canvas.h;
  const ctx = canvas.getContext('2d');

  // ---------- 等待得意黑字体加载 ----------
  function ensureFontLoaded() {
    if (document.fonts && document.fonts.ready) {
      return document.fonts.ready;
    }
    return Promise.resolve();
  }

  // ---------- Canvas 绘制 ----------
  function draw() {
    const w = state.canvas.w;
    const h = state.canvas.h;
    // 背景：透明或上传图
    ctx.clearRect(0, 0, w, h);
    if (state.bg) drawBackground();
    drawTitle();
    drawWatermark();
  }

  function drawBackground() {
    const img = state.bg._img;
    if (!img) return;
    // cover 模式：按当前画布等比铺满 + 居中裁切（不变形）
    const w = state.canvas.w;
    const h = state.canvas.h;
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    const targetRatio = w / h;
    const imgRatio = sw / sh;
    let dw, dh;
    if (imgRatio > targetRatio) {
      dh = h;
      dw = dh * imgRatio;
    } else {
      dw = w;
      dh = dw / imgRatio;
    }
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function setFontStyle(opts) {
    const parts = [];
    parts.push(`${opts.fontSize}px`);
    parts.push(TITLE_FONT);
    return parts.join(' ');
  }

  // 计算一行字符宽度（含字间距）
  function lineWidth(ctx, text, letterSpacing, fontSize) {
    let w = 0;
    for (let i = 0; i < text.length; i++) {
      w += ctx.measureText(text[i]).width;
      if (i < text.length - 1) w += letterSpacing * fontSize;
    }
    return w;
  }

  // 自动换行（基于像素宽度，支持手动换行）
  function wrapAll(ctx, text, opts) {
    if (!text) return [];
    const paragraphs = text.split(/\r?\n/);
    const lines = [];
    const gap = opts.letterSpacing * opts.fontSize;

    for (const para of paragraphs) {
      if (para === '') { lines.push(''); continue; }
      let current = '';
      for (const ch of para) {
        const test = current + ch;
        const w = lineWidth(ctx, test, opts.letterSpacing, opts.fontSize);
        if (w > opts.maxWidth && current.length > 0) {
          lines.push(current);
          current = ch;
        } else {
          current = test;
        }
      }
      if (current.length > 0) lines.push(current);
    }
    return lines;
  }

  function drawText(ctx, text, x, y, opts) {
    const width = lineWidth(ctx, text, opts.letterSpacing, opts.fontSize);
    let cx = x;
    if (opts.align === 'center') cx = x - width / 2;
    else if (opts.align === 'right') cx = x - width;
    const gap = opts.letterSpacing * opts.fontSize;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const charW = ctx.measureText(ch).width;

      if (opts.stroke.enabled && opts.stroke.width > 0) {
        ctx.strokeStyle = opts.stroke.color;
        ctx.lineWidth = opts.stroke.width;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(ch, cx, y);
      }
      ctx.fillStyle = opts.color;
      ctx.fillText(ch, cx, y);

      cx += charW;
      if (i < text.length - 1) cx += gap;
    }
  }

  function drawTitle() {
    const t = state.title;
    const s = state.stroke;
    const sh = state.shadow;

    // 保存/复位阴影开关
    ctx.save();

    // 阴影设置（仅作用于 fillText/strokeText）
    if (sh.enabled) {
      ctx.shadowColor = hexToRgba(sh.color, sh.alpha / 100);
      ctx.shadowOffsetX = sh.x;
      ctx.shadowOffsetY = sh.y;
      ctx.shadowBlur = sh.blur;
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowBlur = 0;
    }

    ctx.font = setFontStyle({ fontSize: t.fontSize });
    ctx.textBaseline = 'top';

    const drawOpts = {
      align: t.align,
      letterSpacing: t.letterSpacing,
      fontSize: t.fontSize,
      color: t.color,
      stroke: s,
    };

    // 对齐 = 相对画布的绝对锚点（左 0 / 中 w÷2 / 右 w），叠加 t.x 微调
    const baseX = alignAnchorX(t.align) + t.x;
    const lines = wrapAll(ctx, t.text, { ...t });
    const lineGap = t.fontSize * t.lineHeight;
    lines.forEach((line, i) => {
      drawText(ctx, line, baseX, t.y + i * lineGap, drawOpts);
    });

    ctx.restore();
  }

  function drawWatermark() {
    const wm = state.watermark;
    ctx.save();
    ctx.font = `${wm.fontSize}px ${WM_FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = hexToRgba(wm.color, wm.alpha / 100);
    ctx.fillText(wm.text || '', wm.x, wm.y);
    ctx.restore();
  }

  // ---------- 颜色工具 ----------
  function hexToRgba(hex, alpha = 1) {
    const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
    if (!m) return hex;
    const v = m[1];
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // ---------- UI 双向绑定 ----------
  function bindInput(id, key, parse = Number, extraSet) {
    const input = $(id);
    if (!input) return;
    const handle = () => {
      const v = parse(input.value);
      applyState(key, v);
      if (extraSet) extraSet(v);
      draw();
    };
    input.addEventListener('input', handle);
  }

  function applyState(path, value) {
    const keys = path.split('.');
    let obj = state;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
  }

  function setupBindings() {
    // ===== 画布尺寸 =====
    setupCanvasSizeBinding();

    // ===== 标题文字 =====
    $('titleText').addEventListener('input', (e) => {
      applyState('title.text', e.target.value);
      draw();
    });

    // ===== 字号 =====
    bindRangePair('fontSize', 'title.fontSize');

    // ===== 字间距 =====
    bindRangePair('letterSpacing', 'title.letterSpacing');

    // ===== 行间距 =====
    bindRangePair('lineHeight', 'title.lineHeight');

    // ===== 对齐 =====
    $('alignGroup').querySelectorAll('.seg').forEach((btn) => {
      btn.addEventListener('click', () => {
        $('alignGroup').querySelectorAll('.seg').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        applyState('title.align', btn.dataset.val);
        applyState('title.x', 0);                // 切换对齐时重置微调偏移
        setRange('titleX', 0);
        draw();
      });
    });

    // ===== 字色 =====
    bindColorPair('textColor', 'title.color');

    // ===== 描边 =====
    bindCheckWithCollapse('strokeEnabled', 'stroke.enabled', 'strokeSection');
    bindRangePair('strokeWidth', 'stroke.width', (v) => Math.max(0, +v || 0));
    bindColorPair('strokeColor', 'stroke.color');

    // ===== 阴影 =====
    bindCheckWithCollapse('shadowEnabled', 'shadow.enabled', 'shadowSection');
    bindRangePair('shadowX', 'shadow.x');
    bindRangePair('shadowY', 'shadow.y');
    bindRangePair('shadowBlur', 'shadow.blur', (v) => Math.max(0, +v || 0));
    bindColorPair('shadowColor', 'shadow.color');
    bindRangePair('shadowAlpha', 'shadow.alpha', (v) => +v);

    // ===== 位置 =====
    bindRangePair('titleX', 'title.x', (v) => Math.max(0, +v || 0));
    bindRangePair('titleY', 'title.y');
    bindRangePair('titleMaxW', 'title.maxWidth', (v) => Math.max(50, +v || 50));

    // ===== 水印 =====
    bindWatermarkLock();
    bindRangePair('wmSize', 'watermark.fontSize', (v) => Math.max(16, Math.min(60, +v || 16)));
    bindColorPair('wmColor', 'watermark.color');
    bindRangePair('wmAlpha', 'watermark.alpha', (v) => Math.max(0, Math.min(100, +v || 0)));
    bindRangePair('wmX', 'watermark.x', (v) => Math.max(0, +v || 0));
    bindRangePair('wmY', 'watermark.y', (v) => Math.max(0, +v || 0));
    $('wmText').addEventListener('input', (e) => {
      applyState('watermark.text', e.target.value);
      draw();
    });
  }

  function bindRange(id, key, parse = (v) => +v) {
    const input = $(id);
    if (!input) return;
    input.addEventListener('input', (e) => {
      const v = parse(e.target.value);
      applyState(key, v);
      draw();
    });
  }

  function bindRangePair(id, key, parse = (v) => +v) {
    const range = $(id);
    const num = $(id + 'Num');
    if (!range || !num) return;
    const onChange = (raw) => {
      const v = parse(raw);
      range.value = v;
      num.value = v;
      applyState(key, v);
      draw();
    };
    range.addEventListener('input', (e) => onChange(e.target.value));
    num.addEventListener('input', (e) => {
      const v = parse(e.target.value);
      range.value = v;
      applyState(key, v);
      draw();
    });
  }

  function bindCheck(id, key) {
    const el = $(id);
    if (!el) return;
    el.addEventListener('change', (e) => {
      applyState(key, e.target.checked);
      draw();
    });
  }

  function bindCheckWithCollapse(id, key, sectionId) {
    const el = $(id);
    const section = $(sectionId);
    if (!el || !section) return;
    el.addEventListener('change', (e) => {
      const on = e.target.checked;
      applyState(key, on);
      section.setAttribute('data-collapsed', on ? 'false' : 'true');
      draw();
    });
  }

  function bindWatermarkLock() {
    const el = $('wmLocked');
    if (!el) return;
    el.addEventListener('change', (e) => {
      const locked = e.target.checked;
      applyState('watermark.locked', locked);
      if (locked) {
        // 锁定：把水印拨回当前画布的左下角默认位
        const pos = lockedWmPos();
        applyState('watermark.x', pos.x);
        applyState('watermark.y', pos.y);
      }
      syncWatermarkPosUI();
      draw();
    });
  }

  function bindColorPair(id, key) {
    const color = $(id);
    const hex = $(id + 'Hex');
    if (!color || !hex) return;
    color.addEventListener('input', (e) => {
      hex.value = e.target.value.toUpperCase();
      applyState(key, e.target.value);
      draw();
    });
    hex.addEventListener('input', (e) => {
      const v = e.target.value.trim();
      if (/^#[0-9a-f]{6}$/i.test(v)) {
        color.value = v.toLowerCase();
        applyState(key, v);
        draw();
      }
    });
  }

  // ---------- 画布尺寸：预设 / 自定义 ----------
  function getPreset(key) {
    return PRESETS.find((p) => p.key === key) || PRESETS.find((p) => p.key === DEFAULT_PRESET);
  }

  // 当前画布尺寸下的水印锁定位置
  function lockedWmPos() {
    return { x: lockWmX(state.canvas.w), y: lockWmY(state.canvas.h) };
  }

  function clampNum(v, min, max) {
    v = Number(v);
    if (!isFinite(v)) return min;
    return Math.min(max, Math.max(min, v));
  }

  // 归一化任意宽高（自定义输入可能越界或为空）
  function normalizeSize(w, h) {
    return {
      w: Math.round(clampNum(w, CANVAS_W_MIN, CANVAS_MAX)),
      h: Math.round(clampNum(h, CANVAS_H_MIN, CANVAS_MAX)),
    };
  }

  // 所有跟画布尺寸绑死的滑块 max 都从这里取，避免任何地方再写死
  function updateSliderRanges() {
    const w = state.canvas.w;
    const h = state.canvas.h;
    const setMax = (id, v) => {
      const r = $(id), n = $(id + 'Num');
      if (r) r.max = v;
      if (n) n.max = v;
    };
    setMax('titleX', w);
    setMax('titleY', h);
    setMax('titleMaxW', w);          // min 固定 200，保持原样
    setMax('wmX', w);
    setMax('wmY', h);
  }

  // 水印位置字段的显隐 + 提示文案（锁定坐标随画布变，所以文案也得动态生成）
  function syncWatermarkPosUI() {
    const posFields = $('wmPosFields');
    const hint = $('wmHint');
    const locked = !!state.watermark.locked;
    if (posFields) posFields.classList.toggle('hidden', locked);
    if (!hint) return;
    if (locked) {
      const pos = lockedWmPos();
      hint.textContent = `已锁定：固定在左下角 (${pos.x}, ${pos.y}) —— 随画布尺寸自动重算。关闭锁定后可调 X/Y 偏移。`;
    } else {
      hint.textContent = '未锁定：水印位置和文字都可调整。';
    }
  }

  // 换画布尺寸：标题位置 / 字号 / 最大宽度等比缩放（oldW/oldH = 换之前的画布），再夹回画面内
  function scaleTitleForCanvas(oldW, oldH) {
    const c = state.canvas;
    const t = state.title;
    // 字号按「面积」缩放（= 宽比 × 高比的几何平均）。
    // ⚠️ 2026-10-10 修正：原先用 Math.min(w比, h比) —— 它**不可逆**，
    //    21:9→1:1→3:4→21:9 一圈下来 120px 会掉到 38px（×0.5×1.2×0.53）。
    //    几何平均满足「一圈切回来必须回到原值」（各方向比值相乘正好抵消），
    //    且竖图上字号不会缩得过小；溢出由下面的 fontCap 与「夹回画面内」兜住。
    const fontRatio = Math.max(TITLE_SCALE_FLOOR, Math.sqrt((c.w / oldW) * (c.h / oldH)));
    t.x = Math.round(t.x * (c.w / oldW));
    t.y = Math.round(t.y * (c.h / oldH));
    t.maxWidth = Math.round(t.maxWidth * (c.w / oldW));
    t.fontSize = Math.round(t.fontSize * fontRatio);
    clampTitleIntoCanvas();
  }

  // 保证标题仍留在画面内（切到小画布 / 竖画布后不能跑到画布外）
  function clampTitleIntoCanvas() {
    const c = state.canvas;
    const t = state.title;
    t.fontSize = Math.min(280, Math.max(32, Math.round(t.fontSize)));
    t.maxWidth = Math.round(t.maxWidth);
    if (!isFinite(t.maxWidth)) t.maxWidth = c.w;
    // 上下各留 20px，保证整块文字水平方向也留在画面里
    t.maxWidth = Math.min(c.w, Math.max(200, Math.min(t.maxWidth, c.w - 40)));

    // 画布很矮时（例如自定义 1200×240）字号不能大过画布，否则标题再夹也放不下
    const fontCap = Math.max(32, Math.floor(c.h * 0.5));
    if (t.fontSize > fontCap) t.fontSize = fontCap;

    // x 偏移：按对齐方式算最远能推到的位置（整块文字不越界）
    let xMax = Math.max(0, c.w - t.maxWidth - 20);
    if (t.align === 'center') xMax = Math.floor(c.w / 2);
    else if (t.align === 'right') xMax = 20;
    xMax = Math.max(0, Math.min(xMax, c.w));
    t.x = Math.round(Math.min(Math.max(0, t.x), xMax));

    // y 偏移：至少留一行字贴在画面内
    const blockH = Math.max(MIN_VISIBLE_H, t.fontSize * t.lineHeight);
    t.y = Math.round(Math.min(Math.max(0, t.y), Math.max(0, c.h - blockH)));
  }

  // 记录自定义宽高的输入框（不触发重排）
  function syncCustomInputs() {
    const wEl = $('canvasW'), hEl = $('canvasH');
    if (wEl) wEl.value = state.canvas.w;
    if (hEl) hEl.value = state.canvas.h;
  }

  // 应用一套画布尺寸（预设切换 / 自定义输入都走这里）
  function applyCanvasSize(w, h) {
    const size = normalizeSize(w, h);
    const c = state.canvas;
    if (size.w === c.w && size.h === c.h) return;
    const oldW = c.w, oldH = c.h;   // 换预设时算等比系数的基准（显式传参，不用全局变量）

    c.w = size.w;
    c.h = size.h;
    canvas.width = size.w;
    canvas.height = size.h;

    updateSliderRanges();
    scaleTitleForCanvas(oldW, oldH);
    if (state.watermark.locked) {
      const pos = lockedWmPos();
      state.watermark.x = pos.x;
      state.watermark.y = pos.y;
    } else {
      // 未锁定：用户设的坐标也不能被切掉
      state.watermark.x = Math.min(state.watermark.x, size.w);
      state.watermark.y = Math.min(state.watermark.y, size.h);
    }

    updateCanvasSizeUI();
    syncUI();
    fitCanvas();
    draw();
  }

  // 界面文案：画板提示 / 预设下拉 / 自定义输入 / 尺寸说明
  function updateCanvasSizeUI() {
    const { w, h, preset } = state.canvas;
    const sizeLabel = $('canvasSizeLabel');
    if (sizeLabel) sizeLabel.textContent = `画板 ${w} × ${h}  比例 ${ratioLabel(w, h)}:1`;

    const sel = $('presetSelect');
    if (sel && sel.value !== preset) sel.value = preset;

    const customRow = $('customSizeRow');
    if (customRow) customRow.classList.toggle('hidden', preset !== 'custom');
    if (preset === 'custom') syncCustomInputs();

    const hint = $('sizeHint');
    if (hint) {
      const p = getPreset(preset);
      const name = preset === 'custom' ? '自定义' : p.label;
      hint.textContent = `当前画布 ${w} × ${h}（${ratioLabel(w, h)}:1）· ${name}。尺寸为常见值，以平台后台为准。`;
    }
  }

  function setupCanvasSizeBinding() {
    const sel = $('presetSelect');
    if (sel) {
      sel.addEventListener('change', () => {
        const key = sel.value;
        state.canvas.preset = key;
        const p = getPreset(key);
        if (key === 'custom') {
          // 自定义：先展开输入框，沿用当前尺寸，等用户改数字
          updateCanvasSizeUI();
          toast('已切到自定义：填下方宽 × 高');
        } else {
          applyCanvasSize(p.w, p.h);
        }
      });
    }
    ['canvasW', 'canvasH'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', () => {
        // 在自定义框里改数字 → 自动切到「自定义」预设
        state.canvas.preset = 'custom';
        applyCanvasSize($('canvasW').value, $('canvasH').value);
      });
    });
  }

  // ---------- 同步 UI 与状态（用于加载模板） ----------
  function syncUI() {
    updateCanvasSizeUI();
    updateSliderRanges();

    $('titleText').value = state.title.text;

    setRange('fontSize', state.title.fontSize);
    setRange('letterSpacing', state.title.letterSpacing);
    setRange('lineHeight', state.title.lineHeight);

    document.querySelectorAll('#alignGroup .seg').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.val === state.title.align);
    });

    setColor('textColor', state.title.color);

    $('strokeEnabled').checked = !!state.stroke.enabled;
    setRange('strokeWidth', state.stroke.width);
    setColor('strokeColor', state.stroke.color);
    $('strokeSection').setAttribute('data-collapsed', state.stroke.enabled ? 'false' : 'true');

    $('shadowEnabled').checked = !!state.shadow.enabled;
    setRange('shadowX', state.shadow.x);
    setRange('shadowY', state.shadow.y);
    setRange('shadowBlur', state.shadow.blur);
    setColor('shadowColor', state.shadow.color);
    setRange('shadowAlpha', state.shadow.alpha);
    $('shadowSection').setAttribute('data-collapsed', state.shadow.enabled ? 'false' : 'true');

    setRange('titleX', state.title.x);
    setRange('titleY', state.title.y);
    setRange('titleMaxW', state.title.maxWidth);

    $('wmText').value = state.watermark.text;
    setRange('wmSize', state.watermark.fontSize);
    setColor('wmColor', state.watermark.color);
    setRange('wmAlpha', state.watermark.alpha);
    $('wmLocked').checked = !!state.watermark.locked;
    setRange('wmX', state.watermark.x);
    setRange('wmY', state.watermark.y);
    syncWatermarkPosUI();
  }

  function setRange(id, value) {
    const r = $(id), n = $(id + 'Num');
    if (r) r.value = value;
    if (n) n.value = value;
  }
  function setColor(id, value) {
    const c = $(id), h = $(id + 'Hex');
    if (c) c.value = value;
    if (h) h.value = (value || '').toUpperCase();
  }

  // ---------- 背景图上传 ----------
  $('bgInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        state.bg = {
          dataUrl: reader.result,
          naturalW: img.naturalWidth,
          naturalH: img.naturalHeight,
          _img: img,
        };
        draw();
        toast('背景图已加载');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  $('clearBgBtn').addEventListener('click', () => {
    state.bg = null;
    draw();
    toast('背景已清空');
  });

  // ---------- 模板保存 / 加载 ----------
  function exportTemplate() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      // 画布预设 + 宽高：导入后能还原到同一个画布
      canvas: {
        preset: state.canvas.preset,
        w: state.canvas.w,
        h: state.canvas.h,
      },
      title: state.title,
      stroke: state.stroke,
      shadow: state.shadow,
      watermark: state.watermark,
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `封面模板-${stamp()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('模板已下载');
  }

  function importTemplate(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        Object.assign(state.title, data.title || {});
        Object.assign(state.stroke, data.stroke || {});
        Object.assign(state.shadow, data.shadow || {});
        Object.assign(state.watermark, data.watermark || {});
        // 水印文字、标题默认保留锁定
        state.watermark.text = data.watermark?.text || 'AI 绘梦师葉子';

        // 画布：模板里带就用模板的（老模板没这段 → 保持当前画布）
        const c = data.canvas || {};
        const cw = Number(c.w), ch = Number(c.h);
        if (isFinite(cw) && cw > 0 && isFinite(ch) && ch > 0) {
          const size = normalizeSize(cw, ch);
          // 宽高对得上某个预设就用该预设，否则落到「自定义」
          const hit = PRESETS.find((p) => p.key !== 'custom' && p.w === size.w && p.h === size.h);
          applyCanvasSize(size.w, size.h);   // 内部会 syncUI + fitCanvas + draw
          state.canvas.preset = hit ? hit.key : 'custom';
          updateCanvasSizeUI();
        }
        // 最后无条件夹一次：模板里的越界值（负数 / 超大偏移）也不能把标题顶出画面
        clampTitleIntoCanvas();
        syncUI();
        draw();
        toast('模板已加载');
      } catch (err) {
        console.error(err);
        toast('模板解析失败');
      }
    };
    reader.readAsText(file);
  }

  $('saveTplBtn').addEventListener('click', exportTemplate);
  $('loadTplBtn').addEventListener('click', () => $('loadTplInput').click());
  $('loadTplInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) importTemplate(file);
    e.target.value = '';
  });

  // ---------- 重置样式（保留水印文字，画布尺寸也保留） ----------
  $('resetStyleBtn').addEventListener('click', () => {
    // 基准值取「默认 1800×766 的出厂值 × 当前画布等比」，换过尺寸也不会重置出画面外的东西
    const wRatio = state.canvas.w / DEFAULT_W;
    const hRatio = state.canvas.h / DEFAULT_H;
    // ⚠️ 与 scaleTitleForCanvas 用**同一个策略**（几何平均），否则「重置出来的字号」
    //    与「从默认预设切过来的字号」会对不上。
    const fontRatio = Math.max(TITLE_SCALE_FLOOR, Math.sqrt(wRatio * hRatio));
    state.title = {
      text: DEFAULT_TITLE,
      x: Math.round(50 * wRatio),
      y: Math.round(200 * hRatio),
      fontSize: Math.round(120 * fontRatio),
      letterSpacing: 0,
      lineHeight: 1.4,
      color: '#ffffff',
      align: 'left',
      maxWidth: state.canvas.w,
    };
    state.stroke = { enabled: false, width: 3, color: '#000000' };
    state.shadow = { enabled: false, x: 7, y: 7, blur: 9, color: '#000000', alpha: 70 };
    state.watermark = {
      text: state.watermark.text,
      fontSize: 50,
      color: state.watermark.color,
      alpha: 80,
      locked: true,
      x: lockWmX(state.canvas.w),
      y: lockWmY(state.canvas.h),
    };
    clampTitleIntoCanvas();
    syncUI();
    draw();
    toast('文字样式已重置');
  });

  // ---------- 导出 ----------
  function exportImage(format, quality = 0.95) {
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    let dataURL;
    try {
      dataURL = canvas.toDataURL(mime, quality);
    } catch (e) {
      // 画布被污染（如 file:// 下加载了跨源本地图片）时浏览器禁止导出
      console.error('导出失败:', e);
      toast('导出失败：浏览器安全限制（本地打开时无法导出含本地图片的画布），请使用网页版或通过本地服务器打开');
      return;
    }
    const ext = format === 'jpg' ? 'jpg' : 'png';
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `自媒体封面-${stamp()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast(`已导出 ${ext.toUpperCase()}`);
  }

  $('exportPngBtn').addEventListener('click', () => exportImage('png'));
  $('exportJpgBtn').addEventListener('click', () => exportImage('jpg', 0.95));

  // ---------- Toast ----------
  const TOAST_MS = 1800;             // toast 停留时长（毫秒，与画布尺寸无关）
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), TOAST_MS);
  }

  // ---------- 时间戳 ----------
  function stamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  // ---------- 自适应：画布按容器宽度缩放（画布像素尺寸保持全分辨率） ----------
  function fitCanvas() {
    const wrapper = $('canvasWrapper');
    const w = state.canvas.w;
    const h = state.canvas.h;
    const wrapWidth = wrapper.parentElement.clientWidth - 48; // padding 24*2
    const wrapHeight = wrapper.parentElement.clientHeight - 80;
    const ratio = w / h;
    let targetW = w;
    let targetH = h;

    if (wrapWidth < targetW) {
      targetW = wrapWidth;
      targetH = targetW / ratio;
    }
    if (targetH > wrapHeight) {
      targetH = wrapHeight;
      targetW = targetH * ratio;
    }
    const zoom = Math.round((targetW / w) * 100);
    $('zoomLabel').textContent = `${zoom}%`;
    canvas.style.width = targetW + 'px';
    canvas.style.height = targetH + 'px';
  }

  // ---------- 加载默认背景 ----------
  // 优先用内嵌 dataURL（assets/bg-data.js 提供）：dataURL 与页面同源，
  // 不会污染画布 —— 本地 file:// 双击打开时 canvas.toDataURL 导出也能用。
  // 若 dataURL 缺失（bg-data.js 未加载），回退到相对路径文件。
  function loadDefaultBg() {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        state.bg = {
          dataUrl: DEFAULT_BG_DATAURL,
          naturalW: img.naturalWidth,
          naturalH: img.naturalHeight,
          _img: img,
        };
        resolve();
      };
      img.onerror = () => {
        // dataURL 加载失败才回退到文件路径
        if (img.src !== 'assets/default-bg.png') {
          const fb = new Image();
          fb.onload = () => {
            state.bg = { dataUrl: null, naturalW: fb.naturalWidth, naturalH: fb.naturalHeight, _img: fb };
            resolve();
          };
          fb.onerror = () => resolve(); // 失败不阻塞初始化
          fb.src = 'assets/default-bg.png';
        } else {
          resolve();
        }
      };
      img.src = (typeof DEFAULT_BG_DATAURL !== 'undefined') ? DEFAULT_BG_DATAURL : 'assets/default-bg.png';
    });
  }

  // ---------- 初始化 ----------
  async function init() {
    // 注入得意黑（标题用）+ 阿里巴巴普惠体纤细（水印用）
    const fontCss = document.createElement('style');
    fontCss.textContent = `
@font-face {
  font-family: '得意黑 Smiley Sans';
  src: url('assets/SmileySans-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'AlibabaPuHuiTi Bold';
  src: url('assets/AlibabaPuHuiTi-Bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}`;
    document.head.appendChild(fontCss);

    setupBindings();
    syncUI();

    // 画布自适应
    fitCanvas();
    window.addEventListener('resize', fitCanvas);

    // 先加载默认背景并立即绘制（不依赖字体，避免被慢字体阻塞导致白屏）
    await loadDefaultBg();
    draw();

    // 等待字体加载（最多 3 秒），就绪后重绘以应用真实字体
    try {
      await Promise.race([
        ensureFontLoaded(),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
    } catch (e) { /* 忽略 */ }
    draw();
    setTimeout(draw, 200); // 兜底：再画一次防字体替换时序问题
  }

  init();
})();
