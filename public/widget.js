// 桌面小工具：顶部三个圆环 + 七个分页。
// 在 Electron 桌面窗口里运行时，window.desk 由 preload.js 提供（拖动、置顶、收起、关闭）；
// 直接用浏览器打开 /widget.html 也能看，只是没有这些窗口按钮。

const $ = (id) => document.getElementById(id);
const deskApi = window.desk || null;
const SYNC_EVERY = 30 * 60 * 1000;
// 同步失败后 5 分钟再试；缓存超过 30 分钟算旧，超过 1 小时顶栏变橙色
const RETRY_EVERY = 5 * 60 * 1000;
const DATA_DAYS = 180;
const WIDE = { w: 340, h: 130 };
const RING_COLORS = { strain: '#3fa9f5', sleep: '#8fb8de' };

// 产品名来自 brand.js：顶栏放不下全名，用简称，鼠标停留时显示全名和副标题
document.title = BRAND.name;
$('brand-name').textContent = BRAND.short;
$('brand-name').title = `${BRAND.name} · ${BRAND.tagline}`;
$('brand-en').textContent = BRAND.en;

// 顶栏变窄或同步时间变长、放不下时，先藏英文名那行
function fitBrand() {
  const bar = document.querySelector('.bar');
  const sync = $('sync-time');
  bar.classList.remove('tight');
  if (sync.scrollWidth > sync.clientWidth + 1) bar.classList.add('tight');
}
new ResizeObserver(fitBrand).observe(document.querySelector('.bar'));
new MutationObserver(fitBrand).observe($('sync-time'), { childList: true, characterData: true, subtree: true });

let state = { data: null, days: [], tab: new URLSearchParams(location.search).get('tab') || 'today', demo: false, ai: null, status: null, seen: null, adviceOpen: false, loading: false, lastTry: 0, syncError: null, dayIdx: null, back: null, sleepNap: null, workoutId: null, trend: null, redraw: null };

/* ---------- 窗口按钮 ---------- */

async function initWindow() {
  if (!deskApi) {
    applyAlpha(readLocal('alpha', 0.8));
    applyOpaque(readLocal('opaque', false));
    return;
  }
  document.body.classList.add('desk');
  const s = await deskApi.getState();
  applyAlpha(s.alpha);
  applyOpaque(s.opaque === true);
  $('btn-pin').classList.toggle('on', s.pinned);
  state.adviceOpen = s.adviceOpen === true;
  setAdviceOpen($('advice-box'), state.adviceOpen);
  if (s.collapsed) $('shell').classList.add('folded');
  if (s.hidden) applyHidden(true);
  else fitWindow();
  // 快捷键被别的软件占用时不弹窗，只在提示文字里说明
  if (!s.shortcutOk) {
    $('btn-hide').title = `隐藏成小图标（快捷键 ${PLATFORM_TEXT.shortcut} 被别的软件占用了，暂时不能用）`;
    $('hide-icon').title = `点一下恢复，按住可以拖动（快捷键 ${PLATFORM_TEXT.shortcut} 被别的软件占用了）`;
  }
}

function readLocal(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 浏览器禁止存储时忽略，只是下次不记得
  }
}

function applyAlpha(alpha) {
  document.documentElement.style.setProperty('--alpha', alpha);
  $('alpha').value = alpha;
}

// 不透明模式只换背景，不改 --alpha，关掉后自动回到原来的透明度
function applyOpaque(on) {
  document.body.classList.toggle('opaque', on);
  $('opaque').checked = on;
  $('alpha').disabled = on;
}

// 收起时窗口只留顶栏和圆环，按实际内容高度缩小
function fitWindow() {
  if (!deskApi) return;
  const folded = $('shell').classList.contains('folded');
  deskApi.setCollapsed(folded, folded ? $('shell').offsetHeight : 0);
}

$('btn-alpha').addEventListener('click', () => {
  $('alpha-pop').hidden = !$('alpha-pop').hidden;
  $('btn-alpha').classList.toggle('on', !$('alpha-pop').hidden);
  fitWindow();
});
$('alpha').addEventListener('input', (e) => {
  const alpha = Number(e.target.value);
  applyAlpha(alpha);
  if (deskApi) deskApi.setAlpha(alpha);
  else writeLocal('alpha', alpha);
});
$('opaque').addEventListener('change', (e) => {
  applyOpaque(e.target.checked);
  if (deskApi) deskApi.setOpaque(e.target.checked);
  else writeLocal('opaque', e.target.checked);
});
$('day-prev').addEventListener('click', () => moveDay(-1));
$('day-next').addEventListener('click', () => moveDay(1));
// 点中间的日期打开恢复日历；窗口收起时先展开
$('day-name').addEventListener('click', () => {
  if (!state.days.length) return;
  if ($('shell').classList.contains('folded')) {
    $('shell').classList.remove('folded');
    fitWindow();
  }
  RecoveryCalendar.open({ days: state.days, selected: selectedIdx(), onPick: goDay, top: $('daynav').getBoundingClientRect().top, opener: $('day-name') });
});
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => state.redraw?.(), 150);
});
$('btn-pin').addEventListener('click', () => {
  const on = !$('btn-pin').classList.contains('on');
  $('btn-pin').classList.toggle('on', on);
  deskApi?.setPinned(on);
});
$('btn-fold').addEventListener('click', () => {
  $('shell').classList.toggle('folded');
  fitWindow();
});
$('btn-close').addEventListener('click', () => deskApi?.close());

/* ---------- 一键隐藏成小图标 ---------- */

// 隐藏状态由主进程管（快捷键也能切换），页面只负责显示
function applyHidden(hidden) {
  document.body.classList.toggle('icon-mode', hidden);
  $('hide-icon').hidden = !hidden;
  if (hidden) {
    const rec = state.days.length ? pickToday(state.days).today.recovery : null;
    $('hide-ring').style.stroke = rec == null ? COLORS.gray : recoveryZone(rec).color;
  } else fitWindow();
}

// 快捷键说法按系统显示
$('btn-hide').title = `隐藏成小图标（${PLATFORM_TEXT.shortcut}）`;
$('hide-icon').title = `点一下恢复，按住可以拖动（${PLATFORM_TEXT.shortcut}）`;
$('btn-hide').addEventListener('click', () => deskApi?.setHidden(true));
deskApi?.onHidden?.(applyHidden);

// 按住拖动；移动不到 4 像素算单击（恢复），拖过了就不恢复
(() => {
  let start = null;
  const icon = $('hide-icon');
  icon.addEventListener('pointerdown', (e) => {
    start = { x: e.screenX, y: e.screenY, wx: window.screenX, wy: window.screenY, moved: false };
    icon.setPointerCapture(e.pointerId);
  });
  icon.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.screenX - start.x;
    const dy = e.screenY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    start.moved = true;
    deskApi?.moveIcon(start.wx + dx, start.wy + dy);
  });
  icon.addEventListener('pointerup', () => {
    if (start && !start.moved) deskApi?.setHidden(false);
    start = null;
  });
  icon.addEventListener('pointercancel', () => (start = null));
})();
$('btn-sync').addEventListener('click', () => load(true));
$('tabs').addEventListener('click', (e) => {
  const tab = e.target.dataset.tab;
  if (!tab) return;
  // 直接点分页按钮时不需要「返回」
  state.back = null;
  state.sleepNap = null;
  showTab(tab);
});
$('rings').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-go]')?.dataset.go;
  if (!tab) return;
  if ($('shell').classList.contains('folded')) {
    $('shell').classList.remove('folded');
    fitWindow();
  }
  if (tab === 'sleep') openSleep(null);
  else if (tab === 'recovery' || tab === 'strain') openDetail(tab);
  else showTab(tab);
});

// 详情页里的点击：ⓘ 展开说明、返回、今日活动里的睡眠和小睡
$('pane').addEventListener('click', (e) => {
  const info = e.target.closest('[data-info]');
  if (info) {
    // 同一个指标可能出现两次（顶部子指标和下面的卡片），展开紧跟在这个按钮后面的那一份
    const box = [...$('pane').querySelectorAll('[data-explain]')].find((el) => el.dataset.explain === info.dataset.info && info.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (box) box.hidden = !box.hidden;
    return;
  }
  if (e.target.closest('[data-back]')) return goBack();
  // 今日建议卡片上的「AI 帮我写」：只在点的时候请求
  // 今日建议收起 / 展开：桌面版记在 data/widget.json（示例模式不写），浏览器里打开时记在本机浏览器
  if (e.target.closest('[data-adv-toggle]')) {
    state.adviceOpen = !state.adviceOpen;
    setAdviceOpen($('advice-box'), state.adviceOpen);
    if (deskApi) deskApi.setAdviceOpen(state.adviceOpen);
    else if (!state.demo) writeLocal('adviceOpen', state.adviceOpen);
    return;
  }
  if (e.target.closest('[data-ai]')) {
    // AI 结果回来后重画这张卡片，用当前的展开状态，不会被冲掉
    const box = () => $('advice-box') && ($('advice-box').innerHTML = adviceHtml(dailyAdvice(state.days), state.ai, state.adviceOpen));
    askAiAdvice(dailyAdvice(state.days), state.days, box);
    return;
  }
  // 趋势视图：右上角 ›、周期切换、日期前后翻
  const more = e.target.closest('[data-trend]');
  if (more) return openTrend(more.dataset.trend);
  const period = e.target.closest('[data-period]');
  if (period) {
    Object.assign(state.trend, { period: period.dataset.period, offset: 0 });
    return showTab('trend');
  }
  const shift = e.target.closest('[data-shift]');
  if (shift && !shift.disabled) {
    state.trend.offset = Math.max(0, state.trend.offset + Number(shift.dataset.shift));
    return showTab('trend');
  }
  const workout = e.target.closest('.act[data-workout]');
  if (workout) return openWorkout(workout.dataset.workout);
  const act = e.target.closest('.act[data-open]');
  if (act) openSleep(act.dataset.open === 'sleep' ? null : act.dataset.open);
});

/* ---------- 读取数据 ---------- */

async function load(refresh = false) {
  if (state.loading) return;
  state.loading = true;
  if (refresh) state.lastTry = Date.now();
  $('btn-sync').classList.add('spin');
  try {
    const status = await (await fetch('/api/status')).json();
    state.demo = status.demo;
    state.status = status;
    if (!deskApi && !state.demo && state.adviceOpen !== true) state.adviceOpen = readLocal('adviceOpen', false) === true;
    state.ai = status.ai || null;
    if (!status.demo && !status.configured) {
      // 还没填 WHOOP 的 ID 和密钥：直接显示设置填写框，保存后马上重新读取
      $('sync-time').textContent = '未设置';
      $('rings').innerHTML = '';
      $('daynav').hidden = true;
      $('pane').replaceChildren(Setup.form(status, () => load()));
      guideReady();
      return;
    }
    if (!status.loggedIn) {
      showSetup('还没有连接 WHOOP。点下面的按钮，会在浏览器里打开 WHOOP 登录页，授权后回到这里会自动刷新。', true);
      setTimeout(() => load(), 5000);
      guideReady();
      return;
    }
    const res = await fetch(`/api/data?days=${DATA_DAYS}${refresh ? '&refresh=1' : ''}`);
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error), { code: data.code });
    state.syncError = null;
    state.data = data;
    state.days = buildDays(data);
    // 刷新后如果原来就在看"今天"，继续跟着最新的一天走
    if (state.dayIdx != null && state.dayIdx >= state.days.length - 1) state.dayIdx = null;
    render();
    guideReady();
    // 缓存超过 30 分钟：先显示缓存，马上在后台同步
    if (!refresh && !status.demo && Date.now() - Date.parse(data.fetched_at) > SYNC_EVERY) setTimeout(() => load(true), 0);
  } catch (err) {
    // 已经有数据时保留画面，只在顶栏说明失败原因
    state.syncError = { message: err.message === 'Failed to fetch' ? '连不上本机服务器' : err.message, code: err.code };
    // 顶栏放不下长句子，原因放在鼠标提示里
    if (err.message === 'Failed to fetch') state.syncError.hint = PLATFORM_TEXT.serverHint;
    if (!state.data) $('pane').innerHTML = `<div class="empty">出错了：${escapeHtml(state.syncError.message)}${state.syncError.hint ? `<br>${escapeHtml(state.syncError.hint)}` : ''}</div>`;
  } finally {
    state.loading = false;
    $('btn-sync').classList.remove('spin');
    showSyncTime();
  }
}

// 顶栏同步时间：不是今天的带日期，超过 1 小时变橙色，失败时显示中文原因
function showSyncTime() {
  const el = $('sync-time');
  el.classList.remove('stale', 'relogin');
  if (state.demo) return (el.textContent = '示例数据');
  if (!state.data) {
    if (state.syncError) el.textContent = '同步失败';
    return;
  }
  const when = new Date(state.data.fetched_at);
  const today = when.toDateString() === new Date().toDateString();
  const text = `同步于 ${today ? '' : `${when.getMonth() + 1}/${when.getDate()} `}${when.getHours()}:${String(when.getMinutes()).padStart(2, '0')}`;
  el.textContent = state.syncError ? `同步失败：${state.syncError.message}` : text;
  el.title = state.syncError ? `上次成功${text}${state.syncError.code === 'auth' ? '，点这里重新连接' : ''}${state.syncError.hint ? `。${state.syncError.hint}` : ''}` : '';
  el.classList.toggle('stale', Boolean(state.syncError) || Date.now() - when > 60 * 60 * 1000);
  el.classList.toggle('relogin', state.syncError?.code === 'auth');
}

// 每分钟按实际时间检查一次该不该同步：电脑睡眠、窗口隐藏时计时器会暂停或变慢，靠时间差不会漏
function syncTick() {
  showSyncTime();
  if (!state.data || state.demo || state.loading) return;
  const last = Math.max(Date.parse(state.data.fetched_at), state.lastTry);
  if (Date.now() - last >= (state.syncError ? RETRY_EVERY : SYNC_EVERY)) load(true);
}

/* ---------- 新手引导 ---------- */

// 「看过了」：桌面版存在 data/widget.json（由 main.js 处理，示例模式不写文件）；浏览器里打开时存在本机浏览器，示例模式不存
let guideSetup = null;
function guideReady() {
  // 只初始化一次（读取「看过了」是异步的，几次调用撞在一起时共用同一个）
  guideSetup ||= setupGuide();
  return guideSetup.then(() => Guide.ready());
}

async function setupGuide() {
  const s = deskApi ? await deskApi.getState() : null;
  state.seen = s
    ? { guideSeen: s.guideSeen === true, tourSeen: s.tourSeen === true }
    : { guideSeen: !state.demo && readLocal('guideSeen', false) === true, tourSeen: !state.demo && readLocal('tourSeen', false) === true };
  let folded = false;
  let hiddenBefore = false;
  Guide.init({
    mode: 'widget',
    seen: state.seen,
    save: (key) => (deskApi ? deskApi.markSeen(key) : !state.demo && writeLocal(key, true)),
    loggedIn: () => Boolean(state.data),
    // 窗口收起时先展开，结束后恢复原样（不改保存的收起设置以外的东西）
    beforeShow: () => {
      hiddenBefore = document.body.classList.contains('icon-mode');
      if (hiddenBefore) deskApi?.setHidden(false);
      folded = $('shell').classList.contains('folded');
      if (folded) {
        $('shell').classList.remove('folded');
        fitWindow();
      }
    },
    afterHide: () => {
      if (folded) {
        $('shell').classList.add('folded');
        fitWindow();
        folded = false;
      }
      if (hiddenBefore) deskApi?.setHidden(true);
      hiddenBefore = false;
    },
    // 框选从「今日」页开始
    prepareTour: () => {
      if (!state.data) return;
      state.back = null;
      state.sleepNap = null;
      if (state.tab !== 'today') showTab('today');
      $('pane').scrollTop = 0;
    },
  });
}

// ⚙ 设置：随时打开填写框（先拿一次最新的「填了没有」）
$('btn-setup').addEventListener('click', async () => {
  let status = state.status;
  try {
    status = await (await fetch('/api/status')).json();
  } catch {
    // 用上次的
  }
  Setup.open(status, () => load());
});

$('btn-help').addEventListener('click', () => {
  guideSetup ||= setupGuide();
  guideSetup.then(() => Guide.help('what'));
});

function showSetup(html, withLogin) {
  $('sync-time').textContent = '未连接';
  $('rings').innerHTML = '';
  $('daynav').hidden = true;
  $('pane').innerHTML = `<div class="empty">${html}${withLogin ? '<br><button class="btn" id="login">连接 WHOOP</button>' : ''}</div>`;
  if (withLogin) {
    $('login').addEventListener('click', () => {
      const url = `${location.origin}/login`;
      if (deskApi) deskApi.openExternal(url);
      else window.open(url, '_blank');
    });
  }
}

/* ---------- 渲染 ---------- */

function render() {
  const days = state.days;
  if (!days.length) {
    $('rings').innerHTML = '';
    $('daynav').hidden = true;
    $('pane').innerHTML = '<div class="empty">还没有数据。新设备需要先戴着睡一晚，WHOOP 才会算出第一份恢复度和睡眠。</div>';
    return;
  }
  const idx = selectedIdx();
  const day = days[idx];
  const zone = recoveryZone(day.recovery);
  $('daynav').hidden = false;
  $('day-name').textContent = dayTitle(days, idx);
  $('day-prev').disabled = idx === 0;
  $('day-next').disabled = idx === days.length - 1;
  // 顺序和 App 一致：睡眠、恢复、负荷
  const ringHtml = (go, cap, opts) => `<div class="ring" data-go="${go}">${ring({ size: 120, stroke: 10, ...opts })}<div class="cap">${cap}</div></div>`;
  $('rings').innerHTML = [
    ringHtml('sleep', '睡眠', { value: day.sleepPerf, max: 100, color: RING_COLORS.sleep, big: day.sleepPerf == null ? '—' : `${day.sleepPerf}%`, small: formatHours(day.sleepHours).replace(' 分', '分') }),
    ringHtml('recovery', '恢复', { value: day.recovery, max: 100, color: zone.color, big: day.recovery == null ? '—' : `${day.recovery}%`, small: zone.name }),
    ringHtml('strain', '负荷', { value: day.strain, max: 21, color: RING_COLORS.strain, big: fixed(day.strain, 1), small: day.ongoing ? '进行中' : '全天' }),
  ].join('');
  showTab(state.tab);
  fitWindow();
}

// 首页正在看的是哪一天；null 表示跟着最新的一天
function selectedIdx() {
  const last = state.days.length - 1;
  return state.dayIdx == null ? last : Math.min(Math.max(state.dayIdx, 0), last);
}

function moveDay(step) {
  goDay(selectedIdx() + step);
}

// 跳到第 idx 天：箭头翻天和恢复日历都走这里
function goDay(target) {
  const last = state.days.length - 1;
  const idx = Math.min(Math.max(target, 0), last);
  state.dayIdx = idx === last ? null : idx;
  // 换了一天，原来那段小睡已经不属于这一天，回到主睡眠
  state.sleepNap = null;
  render();
}

function showTab(tab) {
  state.tab = tab;
  for (const b of $('tabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === tab);
  if (!state.days.length) return;
  const pane = $('pane');
  pane.scrollTop = 0;
  state.redraw = null;
  PANES[tab](pane);
}

const PANES = {
  today(pane) {
    const days = state.days;
    const idx = selectedIdx();
    const { today, history } = pickDay(days, idx);
    const isLatest = idx === days.length - 1;
    const { text, tips } = interpret(today, history);
    const monitor = healthMonitor(today, history).filter((m) => m.value != null && m.lo != null);
    const normal = monitor.filter((m) => m.status === '正常').length;
    const acts = dayActivities(today, state.data);
    const plan = isLatest ? sleepPlan(days) : null;
    const workouts = state.data.workouts.filter((w) => w.score_state === 'SCORED');
    const rows = dashboardRows(days, idx, workouts, state.data.body);
    pane.innerHTML = `
      ${isLatest ? `<div class="card adv" id="advice-box">${adviceHtml(dailyAdvice(days), state.ai, state.adviceOpen)}</div>` : ''}
      <div class="card link" id="go-health">
        <h4>健康监测 Health Monitor ›</h4>
        ${monitor.length ? `<span class="${normal === monitor.length ? 'ok' : 'warn'}">${normal === monitor.length ? '✓ 都在正常范围' : '有指标超出范围'}</span> <span class="muted">${normal}/${monitor.length} 项正常</span>` : '<span class="muted">基线建立中，再戴几天就能对比</span>'}
      </div>
      <div class="card">
        <h4>每日展望 Daily Outlook（本工具的中文解读）</h4>
        <div>${escapeHtml(text)}</div>
        <ul class="tips">${tips.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
      </div>
      <div class="section-title">${isLatest ? '今日活动' : `${dayTitle(days, idx)}的活动`}</div>
      ${acts.length ? acts.map(activityRow).join('') : '<div class="muted">这一天没有睡眠或运动记录</div>'}
      ${plan ? `<div class="card">
        <h4>今晚睡眠 Tonight's Sleep</h4>
        <div class="bed"><b>${plan.bedtime}</b><span>建议上床时间</span></div>
        <div class="muted">按平时 ${plan.wake} 起床、睡眠需求 ${formatHours(plan.need)} 估算，在床约 ${formatHours(plan.inBed)}</div>
      </div>` : ''}
      <div class="section-title">我的仪表盘 <small class="muted" style="font-size:11px;font-weight:normal">大数字是当天，小数字是平均</small>${infoBtn('My Dashboard')}</div>
      ${explain('My Dashboard')}
      ${rows.map(dashRow).join('')}
      <button class="btn" id="copy-ai">复制近 7 天数据，粘贴给 AI 提问</button>
      <span id="copied" class="muted" hidden>　已复制</span>
      <p class="note">只做数据解读和一般性参考，不构成医疗建议。</p>`;
    // 按图表实际宽度画，窗口变窄时重画，字号跟着缩小
    state.redraw = () => $('c-sr') && strainRecoveryChart($('c-sr'), days.slice(Math.max(0, idx - 6), idx + 1), Math.min(idx, 6), { w: $('c-sr').clientWidth || 340 });
    state.redraw();
    $('go-health').addEventListener('click', () => showTab('health'));
    $('copy-ai').addEventListener('click', async () => {
      await navigator.clipboard.writeText(summaryForAi(state.days));
      $('copied').hidden = false;
      setTimeout(() => $('copied') && ($('copied').hidden = true), 2000);
    });
  },

  sleep(pane) {
    if (state.sleepNap) return napDetail(pane, state.sleepNap);
    const days = state.days;
    const idx = selectedIdx();
    const { today: d, history } = pickDay(days, idx);
    if (!d.sleep) {
      pane.innerHTML = `${backButton()}<div class="empty">${dayTitle(days, idx)}还没有已评分的睡眠记录。</div>`;
      return;
    }
    const raw = d.sleepRaw;
    const tz = raw.timezone_offset;
    const avg = (key) => average(history.map((h) => h[key]));
    const parts = needParts(d.sleep);
    const plan = sleepPlan(days.slice(0, idx + 1));
    const week = days.slice(Math.max(0, idx - 6), idx + 1);
    const five = days.slice(Math.max(0, idx - 4), idx + 1);
    const trends = sleepTrendCharts(week);
    const subs = [
      ['时长达成率', 'Hours vs. Needed', d.hvn],
      ['睡眠规律性', 'Sleep Consistency', d.consistency],
      ['睡眠效率', 'Sleep Efficiency', d.efficiency],
    ];
    const stages = [
      ['清醒', 'Awake', 'awake'],
      ['浅睡', 'Light Sleep', 'light'],
      ['深睡', 'SWS (Slow Wave Sleep) / Deep', 'deep'],
      ['快速眼动 REM', 'REM Sleep', 'rem'],
    ].map(([name, en, key]) => ({ name, en, key, value: d[key], lo: percentile(history.map((h) => h[key]), 0.1), hi: percentile(history.map((h) => h[key]), 0.9) }));
    const needTotal = parts ? parts.base + parts.strain + parts.debt : null;
    const scale = Math.max(d.sleepHours, needTotal || 0) || 1;
    const w = (h) => `${((h || 0) / scale) * 100}%`;
    pane.innerHTML = `
      ${backButton()}
      <div class="big-ring">${ring({ value: d.sleepPerf, max: 100, color: RING_COLORS.sleep, big: d.sleepPerf == null ? '—' : `${d.sleepPerf}%`, small: '睡眠表现', size: 150, stroke: 11 })}</div>
      <div class="card">
        ${head('睡眠表现 Sleep Performance', 'Sleep Performance')}
        ${subs.map(([name, en, v]) => `<div class="subm"><span>${name}</span>${ratingBar(sleepRating(v))}<b>${v == null ? '—' : `${Math.round(v)}%`}</b>${infoBtn(en)}</div>${explain(en)}`).join('')}
        <div class="rate-legend">${RATINGS.map((r) => `<span><i style="background:${r.color}"></i>${r.name}</span>`).join('')}${infoBtn('Poor / Sufficient / Optimal')}</div>
        ${explain('Poor / Sufficient / Optimal')}
      </div>

      <div class="section-title">昨晚睡眠 <small class="muted" style="font-size:11px;font-weight:normal">${dayTitle(days, idx)} vs 前 30 天平均</small></div>
      <div class="card">
        ${head('睡眠时长 Hours of Sleep', 'Hours of Sleep')}
        ${bigVs(d.sleepHours * 60, avg('sleepHours') == null ? null : avg('sleepHours') * 60, { hm: true, better: 'high' })}
        <div class="span-line"><span>入睡 <b>${localClock(raw.start, tz)}</b> → 醒来 <b>${localClock(raw.end, tz)}</b></span><span>在床 <b>${formatHm(d.inBed * 60)}</b>${infoBtn('Time in Bed')}</span></div>
        ${explain('Time in Bed')}
        <div class="stage-legend"><span><i class="typical"></i>常见范围</span>${infoBtn('Typical Range')}</div>
        ${explain('Typical Range')}
        ${stages.map((s) => stageRow(s, d.inBed)).join('')}
        <div class="subm rest"><span><i class="sw" style="background:linear-gradient(135deg, ${SLEEP_COLORS.deep} 50%, ${SLEEP_COLORS.rem} 50%)"></i>恢复性睡眠 Restorative${infoBtn('Restorative Sleep')}</span>
          ${bigVs(d.restorative * 60, avg('restorative') == null ? null : avg('restorative') * 60, { hm: true, better: 'high', small: true })}</div>
        ${explain('Restorative Sleep')}
      </div>

      <div class="card">
        ${head('时长达成率 Hours vs. Needed', 'Hours vs. Needed')}
        ${bigVs(d.hvn, avg('hvn'), { unit: '%', better: 'high' })}
        <div class="vs-label"><span>睡眠时长</span><b>${formatHm(d.sleepHours * 60)}</b></div>
        <div class="vs-bar"><span style="width:${w(d.sleepHours)};background:${SLEEP_COLORS.sleep}"></span></div>
        ${parts ? `
        <div class="vs-bar">
          <span style="width:${w(parts.base)};background:${SLEEP_COLORS.base}"></span><span style="width:${w(parts.strain)};background:${SLEEP_COLORS.strain}"></span><span style="width:${w(parts.debt)};background:${SLEEP_COLORS.debt}"></span>
          ${parts.nap ? `<em class="nap-cut" style="left:calc(${w(needTotal)} - ${w(parts.nap)});width:${w(parts.nap)}" title="小睡抵扣"></em>` : ''}
        </div>
        <div class="vs-label"><span>睡眠需求${infoBtn('Sleep Needed')}</span><b>${formatHm(d.need * 60)}</b></div>
        ${explain('Sleep Needed')}
        <table class="need">
          <tr><td><i class="sw" style="background:${SLEEP_COLORS.base}"></i>基础需求</td><td class="n">${formatHm(parts.base * 60)}</td></tr>
          <tr><td><i class="sw" style="background:${SLEEP_COLORS.strain}"></i>近期负荷</td><td class="n">+${formatHm(parts.strain * 60)}</td></tr>
          <tr><td><i class="sw" style="background:${SLEEP_COLORS.debt}"></i>睡眠负债${infoBtn('Sleep Debt')}</td><td class="n">+${formatHm(parts.debt * 60)}</td></tr>
          ${parts.nap ? `<tr><td><i class="sw nap-sw"></i>小睡抵扣</td><td class="n">−${formatHm(parts.nap * 60)}</td></tr>` : ''}
        </table>
        ${explain('Sleep Debt')}` : ''}
      </div>

      <div class="card">
        ${head('睡眠规律性 Sleep Consistency', 'Sleep Consistency')}
        ${bigVs(d.consistency, avg('consistency'), { unit: '%', better: 'high' })}
        <div class="legend"><span><i class="dash-key"></i>建议上床 / 起床（本工具估算）</span></div>
        <div class="chart" id="c-cons5"></div>
        <p class="note" style="margin-top:2px">App 里的"最佳上床/起床时间"API 不提供，虚线是本工具按你平时起床时间和睡眠需求估算的。</p>
      </div>

      <div class="card">
        ${head('睡眠效率 Sleep Efficiency', 'Sleep Efficiency')}
        ${bigVs(d.efficiency, avg('efficiency'), { unit: '%', better: 'high' })}
        ${effBars(d.sleepHours, d.awake)}
        <div class="subm"><span><i class="sw" style="background:${SLEEP_COLORS.awake}"></i>醒来次数 Wake Events${infoBtn('Wake Events')}</span><b>${d.sleep.stage_summary.disturbance_count ?? '—'}<small> 次</small></b></div>
        ${explain('Wake Events')}
      </div>

      <div class="section-title">周趋势 <small class="muted" style="font-size:11px;font-weight:normal">近 7 天，${dayTitle(days, idx)}高亮</small></div>
      ${trends.map((c) => `<div class="card"><div class="chead"><h4>${c.title}</h4>${moreBtn(c.id)}</div>${c.legend ? `<div class="legend">${c.legend.map(([n, color]) => `<span><i style="background:${color}"></i>${n}</span>`).join('')}</div>` : ''}<div class="chart" id="c-st-${c.id}"></div></div>`).join('')}
      <p class="note">睡眠压力（Sleep Stress）和睡眠期间的心率曲线官方 API 不提供，这里省略。只做数据解读和一般性参考，不构成医疗建议。</p>`;
    // 按图表实际宽度画，窗口变窄时重画
    state.redraw = () => {
      if (!$('c-cons5')) return;
      trendChart($('c-cons5'), five, five.length - 1, bedtimeSpec(five, plan, 110));
      for (const c of trends) trendChart($(`c-st-${c.id}`), week, week.length - 1, c.spec);
    };
    state.redraw();
  },

  recovery(pane) {
    const days = state.days;
    const idx = selectedIdx();
    const { today: d, history } = pickDay(days, idx);
    if (d.recovery == null && d.hrv == null) {
      pane.innerHTML = `${backButton()}<div class="empty">${dayTitle(days, idx)}的恢复度还没算出来，WHOOP 通常会在你醒来、睡眠数据同步后给出。</div>`;
      return;
    }
    const avg = (key) => average(history.map((h) => h[key]));
    const zone = recoveryZone(d.recovery);
    const { driver, tips } = interpret(d, history);
    const week = days.slice(Math.max(0, idx - 6), idx + 1);
    const trends = recoveryTrendCharts(week);
    const parts = [
      ['心率变异性 HRV', 'HRV (Heart Rate Variability)', 'hrv', { better: 'high' }],
      ['静息心率', 'RHR (Resting Heart Rate)', 'rhr', { better: 'low' }],
      ['呼吸频率', 'Respiratory Rate', 'respiratory', { better: 'stable', tolerance: 1, digits: 1 }],
      ['睡眠表现', 'Sleep Performance', 'sleepPerf', { better: 'high', unit: '%' }],
    ];
    pane.innerHTML = `
      <div class="dhead">${backButton()}<span>${dayTitle(days, idx)}</span>${infoBtn('Recovery')}</div>
      ${explain('Recovery')}
      <div class="big-ring">${ring({ value: d.recovery, max: 100, color: zone.color, big: d.recovery == null ? '—' : `${d.recovery}%`, small: `恢复度 · ${zone.name}`, size: 150, stroke: 11 })}</div>
      <div class="card">
        ${parts.map(([name, en, key, opt]) => `<div class="subm vs"><span>${name}${infoBtn(en)}</span>${bigVs(d[key], avg(key), { ...opt, small: true })}</div>${explain(en)}`).join('')}
        <div class="rate-legend"><span><i class="up">▲</i><i class="warn">▼</i> 今天 vs 前 30 天</span>${infoBtn('Today vs. Last 30 Days')}</div>
        ${explain('Today vs. Last 30 Days')}
      </div>
      ${d.calibrating ? '<p class="note">设备还在校准你的个人基线（前几天正常），数字会越来越准。</p>' : ''}

      ${driver ? `<div class="card">
        ${head('恢复度解读（本工具的中文解读）', 'Recovery Drivers')}
        <div>${escapeHtml(driver)}</div>
        <ul class="tips">${tips.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
      </div>` : ''}

      <div class="section-title">周趋势 <small class="muted" style="font-size:11px;font-weight:normal">近 7 天，${dayTitle(days, idx)}高亮</small></div>
      ${trends.map((c) => `<div class="card"><div class="chead"><h4>${c.title}</h4>${moreBtn(c.id)}</div><div class="chart" id="c-rt-${c.id}"></div></div>`).join('')}
      <p class="note">行为洞察（来自日志 Journal）和 AI 教练提示官方 API 不提供，这里省略。只做数据解读和一般性参考，不构成医疗建议。</p>`;
    // 按图表实际宽度画，窗口变窄时重画
    state.redraw = () => {
      if (!$('c-rt-rec')) return;
      for (const c of trends) trendChart($(`c-rt-${c.id}`), week, week.length - 1, c.spec);
    };
    state.redraw();
  },

  strain(pane) {
    const days = state.days;
    const idx = selectedIdx();
    const { today: d, history } = pickDay(days, idx);
    if (d.strain == null) {
      pane.innerHTML = `${backButton()}<div class="empty">${dayTitle(days, idx)}还没有负荷数据。</div>`;
      return;
    }
    const avg = (key) => average(history.map((h) => h[key]));
    const target = strainTarget(d.recovery);
    const week = days.slice(Math.max(0, idx - 6), idx + 1);
    const trends = strainTrendCharts(week);
    const parts = [
      ['心率区间 1–3', 'Heart Rate Zones', 'zLow'],
      ['心率区间 4–5', 'Heart Rate Zones', 'zHigh'],
      ['力量训练时长', 'Strength Activity Time', 'strengthMin'],
    ];
    pane.innerHTML = `
      <div class="dhead">${backButton()}<span>${dayTitle(days, idx)}</span>${infoBtn('Strain / Day Strain')}</div>
      ${explain('Strain / Day Strain')}
      <div class="big-ring">${ring({ value: d.strain, max: 21, color: COLORS.blue, big: d.strain.toFixed(1), small: d.ongoing ? '负荷 · 进行中' : '负荷', size: 150, stroke: 11, band: target })}</div>
      ${target ? `<div class="ring-key"><i></i>目标区间 ${target[0]}–${target[1]}（本工具估算）${infoBtn('Strain Target / Strain Coach')}</div>${explain('Strain Target / Strain Coach')}` : ''}
      <div class="card">
        ${parts.map(([name, en, key]) => `<div class="subm vs"><span>${name}${infoBtn(en)}</span>${bigVs(d[key], avg(key), { hm: true, better: 'high', small: true })}</div>${explain(en)}`).join('')}
        <div class="rate-legend"><span><i class="up">▲</i><i class="warn">▼</i> 今天 vs 前 30 天</span>${infoBtn('Today vs. Last 30 Days')}</div>
        ${explain('Today vs. Last 30 Days')}
        <p class="note" style="margin:4px 0 0">区间时间只统计记录下来的运动。</p>
      </div>

      <div class="card">
        ${head('负荷解读（本工具的中文解读）', 'Strain Target / Strain Coach')}
        <div>${escapeHtml(strainAdvice(d))}</div>
        <p class="note" style="margin:4px 0 0">目标区间按恢复度自定，不是 WHOOP 官方负荷教练的算法。</p>
      </div>

      <div class="section-title">${dayTitle(days, idx)}的运动</div>
      ${dayActivities(d, state.data).filter((a) => a.kind === 'workout').map(activityRow).join('') || '<div class="muted">这一天没有记录运动</div>'}

      <div class="section-title">周趋势 <small class="muted" style="font-size:11px;font-weight:normal">近 7 天，${dayTitle(days, idx)}高亮</small></div>
      ${trends.map((c) => `<div class="card"><div class="chead"><h4>${c.title}${infoBtn(c.info)}</h4>${moreBtn(c.id)}</div>${explain(c.info)}${c.legend ? `<div class="legend">${c.legend.map(([n, color]) => `<span><i style="background:${color}"></i>${n}</span>`).join('')}</div>` : ''}<div class="chart" id="c-xt-${c.id}"></div></div>`).join('')}
      <p class="note">步数和 AI 教练提示官方 API 不提供，这里省略。只做数据解读和一般性参考，不构成医疗建议。</p>`;
    // 按图表实际宽度画，窗口变窄时重画
    state.redraw = () => {
      if (!$('c-xt-strain')) return;
      for (const c of trends) trendChart($(`c-xt-${c.id}`), week, week.length - 1, c.spec);
    };
    state.redraw();
  },

  // 趋势视图：不是一个分页，从周趋势图右上角的 › 点进来
  trend(pane) {
    const { key, period, offset } = state.trend;
    const view = trendView(state.days, state.data.workouts, key, period, offset);
    const m = view.metric;
    const unit = m.kind === 'weekly' || m.hm ? '' : m.unit;
    const item = GLOSSARY.find(([en]) => en === m.info);
    pane.innerHTML = `
      ${backButton()}
      <select id="trend-metric" class="tsel" aria-label="切换指标">${trendGroup(key).map((o) => `<option value="${o.key}"${o.key === key ? ' selected' : ''}>${o.name}</option>`).join('')}</select>
      <div class="thead">
        <div class="tavg"><span>${view.weekly ? '平均每周总量' : '平均'}</span><b>${view.avg == null ? '—' : view.weekly ? formatHm(view.avg) : trendFormat(m, view.avg)}<small>${unit}</small></b>
          ${view.weekly && view.change != null ? `<em class="${view.change >= 0 ? 'up' : 'warn'}">${view.change >= 0 ? '▲' : '▼'} ${Math.abs(view.change)}% 比${view.changeName}</em>` : ''}</div>
        <div class="tper">${Object.entries(TREND_PERIODS).map(([p, v]) => `<button data-period="${p}"${p === period ? ' class="on"' : ''}>${v.name}</button>`).join('')}</div>
      </div>
      <div class="tnav"><button data-shift="1"${view.canOlder ? '' : ' disabled'} aria-label="更早">‹</button><span>${rangeText(view.from, view.to)}</span><button data-shift="-1"${view.canNewer ? '' : ' disabled'} aria-label="更近">›</button></div>
      <p class="tsum">${escapeHtml(view.summary)}</p>
      ${view.band ? '<div class="legend" style="justify-content:flex-end"><span><i style="background:rgba(255,255,255,0.18)"></i>常见范围（你前 30 天的基线）</span></div>' : ''}
      ${view.avgLine != null ? '<div class="legend" style="justify-content:flex-end"><span><i class="dash-key"></i>平均</span></div>' : ''}
      <div class="chart" id="c-trend"></div>
      ${view.weekly ? `<p class="note" style="margin-top:2px">只统计记录下来的运动。</p>
        <div class="card"><h4>${m.strength ? '各力量运动' : '各区间'}（平均每周）</h4>
          ${view.breakdown.length ? stackBar(view.breakdown.map((b) => [b.v, b.color])) : ''}
          ${view.breakdown.map((b) => `<div class="tbreak"><i style="background:${b.color}"></i><b>${formatHm(b.v)}</b>${escapeHtml(b.name)}</div>`).join('') || '<div class="muted">这段时间没有力量类运动</div>'}</div>` : ''}
      ${view.spread ? `<div class="card"><h4>睡眠分布</h4>${view.spread.map((s) => `<div class="tbreak"><i style="background:${s.color}"></i><b>${s.n} 天</b>${s.name}</div>`).join('')}</div>` : ''}
      ${item ? `<div class="card"><h4>这是什么：${item[1]} ${escapeHtml(item[0])}</h4><div class="texplain">${escapeHtml(item[2])}</div></div>` : ''}`;
    $('trend-metric').addEventListener('change', (e) => {
      state.trend.key = e.target.value;
      showTab('trend');
    });
    state.redraw = () => $('c-trend') && periodChart($('c-trend'), view);
    state.redraw();
  },

  // 单次运动详情：不是一个分页，从今日活动或负荷详情点进来
  workout(pane) {
    const w = state.data.workouts.find((x) => x.id === state.workoutId);
    if (!w || w.score_state !== 'SCORED') {
      pane.innerHTML = `${backButton()}<div class="empty">这次运动还没有评分。</div>`;
      return;
    }
    const tz = w.timezone_offset;
    const n = workoutNumbers(w);
    const peers = workoutPeers(w, state.data.workouts);
    const day = state.days.find((d) => Date.parse(w.start) >= Date.parse(d.start) && (!d.end || Date.parse(w.start) < Date.parse(d.end)));
    const has = peers.count > 0;
    // 关键数据小卡片：今天的大数字 + 同类 30 天平均和箭头（没有同类记录就不显示平均）
    const stat = (label, value, avg, show, unit) => {
      const t = trendOf({ value, avg: has ? avg : null });
      return `<div class="wstat"><span>${label}</span><b>${value == null ? '—' : show(value)}<small>${unit}</small></b>${has && avg != null && value != null ? `<em><i>${t.mark}</i> ${show(avg)}${unit}</em>` : ''}</div>`;
    };
    const int = (v) => String(Math.round(v));
    const stats = [
      stat('热量', n.kcal, peers.kcal, int, ' 大卡'),
      stat('平均心率', n.avgHr, peers.avgHr, int, ' 次/分'),
      stat('最大心率', n.maxHr, peers.maxHr, int, ' 次/分'),
      stat('时长', n.ms, peers.ms, formatHms, ''),
    ];
    if (n.distance != null) stats.push(stat('距离', n.distance, peers.distance, (v) => (v / 1000).toFixed(2), ' 公里'));
    if (n.distance != null && n.climb != null) stats.push(stat('累计爬升', n.climb, peers.climb, int, ' 米'));
    const strainT = trendOf({ value: n.strain, avg: has ? peers.strain : null });
    const pct = (v) => (v > 0 && v < 1 ? '<1%' : `${Math.round(v)}%`);
    pane.innerHTML = `
      ${backButton()}
      <div class="whead">${sportIcon(sportGroup(w.sport_name))}<div><b>${escapeHtml(sportName(w.sport_name))}</b> <small>${escapeHtml(sportEnglish(w.sport_name))}</small><span>${relativeDay(w.start, tz)} ${localClock(w.start, tz)} 至 ${localClock(w.end, tz)}</span></div></div>
      ${n.recorded != null && n.recorded < 90 ? `<div class="wwarn">这次只记录了 ${Math.round(n.recorded)}%，数据可能偏低。${infoBtn('Percent Recorded')}</div>${explain('Percent Recorded')}` : ''}

      <div class="card">
        ${head('活动负荷 Activity Strain', 'Activity Strain')}
        <div class="wstrain"><b>${n.strain == null ? '—' : n.strain.toFixed(1)}</b>${has && n.strain != null ? `<em><i class="${strainT.cls}">${strainT.mark}</i> ${peers.strain.toFixed(1)}</em><span>近 30 天同类平均（${peers.count} 次）</span>` : '<span>近 30 天没有同类运动可比较</span>'}</div>
      </div>

      <div class="card">
        <div class="chead"><h4>心率区间 HR Zones${infoBtn('Zone BPM')}</h4><span class="muted" style="font-size:11px">时长 <b style="color:var(--text)">${formatHms(n.ms)}</b></span></div>
        ${explain('Zone BPM')}
        ${peers.ranges.some(Boolean) ? `<div class="stage-legend"><span><i class="typical"></i>常见范围</span>${infoBtn('Workout Typical Range')}</div>${explain('Workout Typical Range')}` : ''}
        ${[5, 4, 3, 2, 1, 0].map((i) => {
          const r = peers.ranges[i];
          return `<div class="stage zrow">
            <div class="top"><span><b>区间 ${i}</b> <span style="color:${ZONE_COLORS[i]}">${pct(n.shares[i])}</span></span><b>${formatHms(n.zones[i])}</b></div>
            <div class="hatch"><span style="width:${Math.min(n.shares[i], 100)}%;background:${ZONE_COLORS[i]}"></span>${r && r[0] != null ? `<em class="typical" style="left:${r[0]}%;width:${Math.max(r[1] - r[0], 0.8)}%"></em>` : ''}</div>
          </div>`;
        }).join('')}
      </div>

      <div class="section-title">关键数据 <small class="muted" style="font-size:11px;font-weight:normal">${has ? 'vs 近 30 天同类平均' : '近 30 天没有同类运动'}</small></div>
      <div class="wstats">${stats.join('')}</div>

      <div class="card">
        <h4>中文解读（本工具的解读，不是官方算法）</h4>
        <div>${escapeHtml(workoutAdvice(w, peers, day))}</div>
      </div>
      <p class="note">心肺 / 肌肉负荷占比、运动中的心率曲线、添加动作、里程碑和 AI 教练提示官方 API 不提供或不适用，这里省略。只做数据解读和一般性参考，不构成医疗建议。</p>`;
  },

  health(pane) {
    const { today, history } = pickToday(state.days);
    const rows = healthMonitor(today, history);
    pane.innerHTML = `
      <p class="muted">把今天的数据和你自己近 30 天的正常范围（绿色区间）对比，类似 App 里的 Health Monitor。</p>
      ${rows.map(monitorRow).join('')}
      <p class="note">单项偶尔超出范围很常见；多项同时异常（例如静息心率、呼吸频率、皮温一起升高）时更值得留意。持续异常请咨询医生。</p>`;
  },

  week(pane) {
    const { rows, summary } = weeklyReport(state.days, state.data.workouts.filter((w) => w.score_state === 'SCORED'));
    const cell = (v, digits) => (v == null ? '—' : v.toFixed(digits));
    const arrow = (r) => {
      if (r.a == null || r.b == null || Math.abs(r.a - r.b) < 0.05) return '<span class="flat">—</span>';
      const up = r.a > r.b;
      const good = r.higherIsBetter == null ? null : up === r.higherIsBetter;
      return `<span class="${good == null ? 'flat' : good ? 'up' : 'down'}">${up ? '↑' : '↓'}</span>`;
    };
    pane.innerHTML = `
      <p class="lead">${escapeHtml(summary)}</p>
      <table>
        <tr><th>指标</th><th class="n">本周</th><th class="n">上周</th><th class="n"></th></tr>
        ${rows.map((r) => `<tr><td>${r.name}</td><td class="n">${cell(r.a, r.digits || 0)}${r.unit}</td><td class="n">${cell(r.b, r.digits || 0)}${r.unit}</td><td class="n">${arrow(r)}</td></tr>`).join('')}
      </table>
      <p class="note">"本周"指最近 7 天，"上周"指再往前 7 天。绿色箭头代表变好，红色代表变差。</p>`;
  },

  dict(pane) {
    const sports = typeof SPORTS_ZH === 'undefined' ? [] : SPORTS_ZH;
    pane.innerHTML = `<h3>运动中英对照 <small>共 ${sports.length} 项，App 里添加活动时对照着选</small></h3>
      <input class="search" id="sport-q" placeholder="搜索中文或英文，例如 跑步 / run">
      <div class="sports" id="sport-list"></div>
      <h3>常见名词</h3>
      <p class="muted">WHOOP App 里常见的英文和中文意思，看 App 时对照用。</p>
      <dl class="dict">${GLOSSARY.map(([en, zh, desc]) => `<dt>${en}<span>${zh}</span></dt><dd>${desc}</dd>`).join('')}</dl>`;
    const list = (q) => {
      const key = q.trim().toLowerCase();
      const hits = sports.filter(([, en, zh]) => !key || en.toLowerCase().includes(key) || zh.includes(key));
      $('sport-list').innerHTML = hits.map(([, en, zh]) => `<div><span>${escapeHtml(en)}</span><span>${escapeHtml(zh)}</span></div>`).join('') || '<div class="muted">没有找到</div>';
    };
    list('');
    $('sport-q').addEventListener('input', (e) => list(e.target.value));
  },
};

/* ---------- 详情页小部件 ---------- */

// 从首页（圆环、今日活动）点进来时才有返回按钮，回到原来的分页和滚动位置
function backButton() {
  return state.back ? '<button class="back" data-back="1">‹ 返回</button>' : '';
}

// 「这是什么」：ⓘ 按钮 + 默认收起的说明，文字统一取自 GLOSSARY
function infoBtn(en) {
  return `<button class="info" data-info="${escapeHtml(en)}" title="这是什么">ⓘ</button>`;
}

function explain(en) {
  const item = GLOSSARY.find(([key]) => key === en);
  return item ? `<div class="explain" data-explain="${escapeHtml(en)}" hidden><b>${escapeHtml(item[1])}</b>：${escapeHtml(item[2])}</div>` : '';
}

function head(title, en) {
  return `<div class="chead"><h4>${title}</h4>${infoBtn(en)}</div>${explain(en)}`;
}

// 大数字 + 箭头 + 下面的小字平均，和首页仪表盘同一套箭头规则
function bigVs(value, avg, { hm = false, unit = '', digits = 0, better, tolerance, small = false } = {}) {
  const show = (v) => (v == null ? '—' : hm ? formatHm(v) : `${v.toFixed(digits)}${unit}`);
  const t = trendOf({ value, avg, better, tolerance });
  return `<div class="bigvs${small ? ' small' : ''}"><div><b>${show(value)}</b><i class="${t.cls}">${t.mark}</i></div><span>平均 ${show(avg)}</span></div>`;
}

// 三段评级条：差 / 够 / 最佳，只点亮当前那一段
function ratingBar(level) {
  return `<span class="rate">${RATINGS.map((r, i) => `<i style="background:${i === level ? r.color : 'var(--line)'}"></i>`).join('')}</span>`;
}

// 一个睡眠阶段：名称、占在床时间的比例、时长；横条按在床时间算宽度，虚线框是自己 30 天的常见范围
function stageRow(s, inBed) {
  const color = SLEEP_COLORS[s.key];
  const share = s.value == null || !inBed ? null : (s.value / inBed) * 100;
  const pos = (h) => `${Math.min(Math.max((h / inBed) * 100, 0), 100)}%`;
  const range = s.lo != null && inBed ? `<em class="typical" style="left:${pos(s.lo)};width:calc(${pos(s.hi)} - ${pos(s.lo)})"></em>` : '';
  return `<div class="stage">
    <div class="top"><span><i class="ring-dot" style="border-color:${color}"></i>${s.name} <span style="color:${color}">${share == null ? '' : share < 1 ? '<1%' : `${Math.round(share)}%`}</span></span><b>${s.value == null ? '—' : formatHm(s.value * 60)}</b></div>
    <div class="hatch"><span style="width:${share == null ? 0 : Math.min(share, 100)}%;background:${color}"></span>${range}</div>
  </div>`;
}

// 睡眠效率：睡着 vs 清醒两条，按在床时间比例画
function effBars(asleep, awake) {
  const total = (asleep || 0) + (awake || 0) || 1;
  return `<div class="vs-label"><span>睡着 Asleep</span><b>${formatHm((asleep || 0) * 60)}</b></div>
    <div class="vs-bar"><span style="width:${((asleep || 0) / total) * 100}%;background:${SLEEP_COLORS.sleep}"></span></div>
    <div class="vs-bar hatch"><span style="width:${((awake || 0) / total) * 100}%;background:${SLEEP_COLORS.awake}"></span></div>
    <div class="vs-label"><span>清醒 Awake</span><b>${formatHm((awake || 0) * 60)}</b></div>`;
}

// 从今日活动点「小睡」进来：只显示这段小睡自己的数据，没有的项目（睡眠表现、需求拆解、周趋势）不显示
function napDetail(pane, id) {
  const nap = state.data.sleeps.find((s) => s.id === id);
  const st = nap?.score_state === 'SCORED' ? nap.score.stage_summary : null;
  if (!st) {
    pane.innerHTML = `${backButton()}<div class="empty">这段小睡还没有评分。</div>`;
    return;
  }
  const tz = nap.timezone_offset;
  const v = {
    awake: hours(st.total_awake_time_milli),
    light: hours(st.total_light_sleep_time_milli),
    deep: hours(st.total_slow_wave_sleep_time_milli),
    rem: hours(st.total_rem_sleep_time_milli),
  };
  const asleep = v.light + v.deep + v.rem;
  const inBed = hours(st.total_in_bed_time_milli);
  const stages = [
    ['清醒', 'awake'],
    ['浅睡', 'light'],
    ['深睡', 'deep'],
    ['快速眼动 REM', 'rem'],
  ].map(([name, key]) => ({ name, key, value: v[key], lo: null, hi: null }));
  pane.innerHTML = `
    ${backButton()}
    <div class="section-title" style="margin-top:0">小睡 Nap <small class="muted" style="font-size:11px;font-weight:normal">${dayLabel(nap.start, tz)} ${weekday(nap.start, tz)}</small></div>
    <div class="card">
      ${head('睡眠时长 Hours of Sleep', 'Hours of Sleep')}
      <div class="bigvs"><div><b>${formatHm(asleep * 60)}</b></div></div>
      <div class="span-line"><span>入睡 <b>${localClock(nap.start, tz)}</b> → 醒来 <b>${localClock(nap.end, tz)}</b></span><span>在床 <b>${formatHm(inBed * 60)}</b></span></div>
      ${stages.map((s) => stageRow(s, inBed)).join('')}
      <div class="subm rest"><span>恢复性睡眠 Restorative${infoBtn('Restorative Sleep')}</span><b>${formatHm((v.deep + v.rem) * 60)}</b></div>
      ${explain('Restorative Sleep')}
    </div>
    <div class="card">
      ${head('睡眠效率 Sleep Efficiency', 'Sleep Efficiency')}
      <div class="bigvs"><div><b>${fixed(nap.score.sleep_efficiency_percentage)}%</b></div></div>
      ${effBars(asleep, v.awake)}
      <div class="subm"><span>醒来次数 Wake Events${infoBtn('Wake Events')}</span><b>${st.disturbance_count ?? '—'}<small> 次</small></b></div>
      ${explain('Wake Events')}
    </div>
    <p class="note">小睡会抵扣一部分当晚的睡眠需求。小睡没有睡眠表现、规律性和需求拆解，这里不显示。</p>`;
}

// 进入睡眠详情：napId 为空看主睡眠，否则只看那段小睡
// 从首页进入详情页：记下来的分页和滚动位置，供「返回」使用
function openDetail(tab) {
  if (state.tab !== tab) state.back = { tab: state.tab, scroll: $('pane').scrollTop };
  showTab(tab);
}

function openSleep(napId) {
  state.sleepNap = napId || null;
  openDetail('sleep');
}

// 「今天」「昨天」「前天」，再早写日期和星期
function relativeDay(iso, tz) {
  const ymd = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diff = Math.round((ymd(localDate(new Date().toISOString(), tz)) - ymd(localDate(iso, tz))) / DAY);
  return ['今天', '昨天', '前天'][diff] || `${dayLabel(iso, tz)} ${weekday(iso, tz)}`;
}

// 周趋势图的 id → 趋势视图的指标
const TREND_KEYS = { rec: 'recovery', hrv: 'hrv', rhr: 'rhr', resp: 'respiratory', perf: 'sleepPerf', 'hvn-lines': 'sleepHours', strain: 'strain', z13: 'zLow', z45: 'zHigh', kcal: 'kcal', str: 'strengthMin' };

function moreBtn(id) {
  return TREND_KEYS[id] ? `<button class="more" data-trend="${TREND_KEYS[id]}" title="趋势视图">›</button>` : '';
}

function openTrend(key) {
  state.back = { tab: state.tab, scroll: $('pane').scrollTop, prev: state.back, nap: state.sleepNap };
  state.trend = { key, period: 'M', offset: 0 };
  showTab('trend');
}

// 运动详情可能是从别的详情页点进来的，记下上一层的返回，退回去时还能再返回
function openWorkout(id) {
  state.back = { tab: state.tab, scroll: $('pane').scrollTop, prev: state.back, nap: state.sleepNap };
  state.workoutId = id;
  showTab('workout');
}

function goBack() {
  const back = state.back;
  state.back = back?.prev || null;
  state.sleepNap = back?.nap || null;
  state.workoutId = null;
  state.trend = null;
  showTab(back?.tab || 'today');
  if (back) $('pane').scrollTop = back.scroll;
}

const ACT_COLORS = { sleep: '#8fb8de', nap: '#8fb8de', workout: '#3fa9f5' };

// 今日活动的一行：左边时长色块，中间名称，右边起止时间（睡眠跨天时标出开始是周几）
function activityRow(a) {
  const r = a.rec;
  const startDay = a.kind === 'sleep' ? `[${weekday(r.start, r.timezone_offset)}] ` : '';
  // 睡眠和小睡点进睡眠详情，运动点进单次运动详情
  const open = a.kind === 'sleep' ? 'sleep' : a.kind === 'nap' ? r.id : '';
  const attr = a.kind === 'workout' ? ` data-workout="${escapeHtml(r.id)}"` : open ? ` data-open="${escapeHtml(open)}"` : '';
  return `<div class="act${attr ? ' link' : ''}"${attr}>
    <div class="dur" style="background:${ACT_COLORS[a.kind]}">${formatHm(a.minutes)}</div>
    <div class="what"><b>${escapeHtml(a.name)}</b>${a.strain != null ? `<small>负荷 ${a.strain.toFixed(1)}</small>` : ''}</div>
    <div class="when">${startDay}${localClock(r.start, r.timezone_offset)}<br>${localClock(r.end, r.timezone_offset)}</div>
  </div>`;
}

// 仪表盘的一行；chart 行换成负荷与恢复图
function dashRow(row) {
  if (row.chart) return '<div class="dash-chart"><h4>负荷与恢复 Strain &amp; Recovery（近 7 天）</h4><div class="chart" id="c-sr"></div></div>';
  const show = (v) => (v == null ? '—' : row.hm ? formatHm(v) : v.toFixed(row.digits || 0));
  const t = trendOf(row);
  const unit = row.unit && row.value != null ? `<small>${row.unit}</small>` : '';
  return `<div class="dash">
    <div class="name">${row.name}${row.en ? ` <span class="muted">${row.en}</span>` : ''}${row.note ? `<small>${row.note}</small>` : ''}</div>
    <div class="nums"><div><b>${show(row.value)}${unit}</b>${row.single ? '' : `<span>${show(row.avg)}</span>`}</div><i class="${t.cls}">${t.mark}</i></div>
  </div>`;
}

function workoutRow(w) {
  const s = w.score;
  const minutes = Math.round((Date.parse(w.end) - Date.parse(w.start)) / 60000);
  const zones = zoneMinutes([w]);
  return `<div class="workout">
    <div class="top"><span><b>${escapeHtml(sportName(w.sport_name))}</b> <span class="muted">${dayLabel(w.start, w.timezone_offset)} · ${minutes} 分钟</span></span>
    <span>负荷 <b>${fixed(s.strain, 1)}</b></span></div>
    ${stackBar(zones.map((m, i) => [m, ZONE_COLORS[i]]))}
    <div class="muted">平均心率 ${s.average_heart_rate ?? '—'} · 最高 ${s.max_heart_rate ?? '—'} · ${s.kilojoule == null ? '—' : Math.round(s.kilojoule / 4.184)} 大卡</div>
  </div>`;
}

function monitorRow(m) {
  let bar = '';
  if (m.lo != null && m.value != null) {
    const width = m.hi - m.lo;
    const from = Math.min(m.lo - width, m.value);
    const to = Math.max(m.hi + width, m.value);
    const pos = (v) => ((v - from) / (to - from)) * 100;
    bar = `<div class="range"><div class="band" style="left:${pos(m.lo)}%;width:${pos(m.hi) - pos(m.lo)}%"></div><div class="dot" style="left:${pos(m.value)}%"></div></div>
      <div class="muted">你的正常范围 ${m.lo.toFixed(m.digits)}–${m.hi.toFixed(m.digits)} ${m.unit}</div>`;
  }
  return `<div class="mon">
    <div class="top"><span>${m.name} <span class="muted">${m.en}</span></span>
    <span><span class="val">${m.value == null ? '—' : m.value.toFixed(m.digits)}</span> <span class="muted">${m.unit}</span><span class="chip ${m.cls}">${m.status}</span></span></div>
    ${bar}
  </div>`;
}

initWindow();
load();
setInterval(syncTick, 60 * 1000);
window.addEventListener('focus', syncTick);
document.addEventListener('visibilitychange', syncTick);
// 电脑睡眠唤醒后补一次同步（由 main.js 的 powerMonitor 通知）
deskApi?.onResume?.(() => !state.demo && state.data && load(true));
// 登录过期时点顶栏的同步时间重新连接
$('sync-time').addEventListener('click', () => {
  if (state.syncError?.code !== 'auth') return;
  const url = `${location.origin}/login`;
  if (deskApi) deskApi.openExternal(url);
  else window.open(url, '_blank');
});
