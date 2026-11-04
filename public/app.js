// 网页版大看板：读取 /api/data，用 core.js 里的共用逻辑画图和写解读。

let currentDays = 30;
// 一次读 180 天，切换 7 / 30 / 90 天只是换显示范围
const DATA_DAYS = 180;
let currentData = null;
let aiStatus = null;
let lastStatus = null;
// 今日建议默认收起；展开状态由服务器记在 data/widget.json 的 web 里（和小工具分开）
let adviceOpen = false;
// 恢复日历里选的那天（"YYYY-MM-DD"）；null 表示看最新的一天
let pickedDate = null;

const $ = (id) => document.getElementById(id);

// 产品名来自 brand.js
document.title = `${BRAND.name} · 网页大看板`;
$('brand-name').textContent = BRAND.name;
$('brand-tagline').textContent = BRAND.tagline;

function metricCard(name, en, value, unit, cmp, desc) {
  return `<div class="metric">
    <div class="name"><b>${name}</b> ${en}</div>
    <div class="value">${value ?? '—'}<small>${value == null ? '' : unit}</small></div>
    <div class="cmp">${cmp}</div>
    <div class="desc">${desc}</div>
  </div>`;
}

function render(data) {
  currentData = data;
  const allDays = buildDays(data);
  const days = allDays.slice(-currentDays);
  if (!days.length) {
    showNotice('这段时间还没有数据。新设备戴上后需要先睡一晚，WHOOP 才会算出第一份恢复度和睡眠。');
    $('main').hidden = true;
    return;
  }
  $('main').hidden = false;

  // 今日建议用全部天数（规则要看前 30 天的基线），和上面的时间范围切换无关
  renderAdvice();

  let { today, history } = pickToday(days);
  let prevComplete = days.filter((d) => !d.ongoing).pop();
  // 在恢复日历里选了别的日子：解读、圆环和指标都换成那一天（基线是那天之前的 30 天）
  const pickedIdx = pickedDate == null ? null : calendarIndex(allDays).get(pickedDate);
  if (pickedIdx != null) {
    ({ today, history } = pickDay(allDays, pickedIdx));
    prevComplete = allDays[pickedIdx - 1] || null;
  } else pickedDate = null;

  // 今日解读
  const { text, tips } = interpret(today, history);
  const zone = recoveryZone(today.recovery);
  $('ring').innerHTML = ring({ value: today.recovery, max: 100, color: zone.color, big: today.recovery == null ? '—' : `${today.recovery}%`, small: `恢复度 · ${zone.name}` });
  renderTodayTitle(today, allDays);
  $('today-text').textContent = text;
  const need = sleepNeedHours(today.sleep);
  if (need) tips.push(`按 WHOOP 的算法，你的睡眠需求约 ${formatHours(need)}（含睡眠负债和负荷带来的额外需求）。`);
  $('today-tips').innerHTML = tips.map((t) => `<li>${escapeHtml(t)}</li>`).join('');

  // 核心指标
  const base = (key) => average(history.map((d) => d[key]));
  $('metrics').innerHTML = [
    metricCard('心率变异性', 'HRV', fixed(today.hrv), ' 毫秒', compareText(today.hrv, base('hrv'), { unit: ' 毫秒', higherIsBetter: true, threshold: 3 }), '越高通常说明恢复越好，只和自己比。'),
    metricCard('静息心率', 'RHR', today.rhr, ' 次/分', compareText(today.rhr, base('rhr'), { unit: ' 次/分', higherIsBetter: false, threshold: 2 }), '偏高常见于疲劳、熬夜、饮酒、生病。'),
    metricCard('睡眠时长', 'Hours of Sleep', today.sleepHours == null ? null : fixed(today.sleepHours, 1), ' 小时', compareText(today.sleepHours, base('sleepHours'), { unit: ' 小时', digits: 1, higherIsBetter: true, threshold: 0.3 }), '真正睡着的时间，不含清醒。'),
    metricCard('睡眠表现', 'Sleep Performance', today.sleepPerf, '%', compareText(today.sleepPerf, base('sleepPerf'), { unit: '%', higherIsBetter: true, threshold: 5 }), '实际睡眠占睡眠需求的比例。'),
    metricCard('昨日负荷', 'Day Strain', prevComplete?.strain == null ? null : fixed(prevComplete.strain, 1), ' / 21', compareText(prevComplete?.strain, base('strain'), { digits: 1, threshold: 1 }), '一天里心血管系统承受的总压力。'),
    metricCard('呼吸频率', 'Respiratory Rate', today.respiratory == null ? null : fixed(today.respiratory, 1), ' 次/分', compareText(today.respiratory, base('respiratory'), { unit: ' 次/分', digits: 1, higherIsBetter: false, threshold: 0.5 }), '睡眠中测得，突然升高要留意。'),
    metricCard('血氧饱和度', 'Blood Oxygen', today.spo2 == null ? null : fixed(today.spo2, 1), '%', compareText(today.spo2, base('spo2'), { unit: '%', digits: 1, higherIsBetter: true, threshold: 1 }), '一般在 95% 以上。'),
    metricCard('皮肤温度', 'Skin Temp', today.skinTemp == null ? null : fixed(today.skinTemp, 1), ' °C', compareText(today.skinTemp, base('skinTemp'), { unit: ' °C', digits: 1, threshold: 0.3 }), '看和平时的偏差，不等于体温。'),
  ].join('');

  // 趋势图
  const labels = days.map((d) => d.label);
  barChart($('chart-recovery'), labels, days.map((d) => d.recovery), (v) => recoveryZone(v).color, { max: 100, step: 25 });
  lineChart($('chart-hrv'), labels, days.map((d) => d.hrv), COLORS.blue, '毫秒');
  lineChart($('chart-rhr'), labels, days.map((d) => d.rhr), COLORS.red, '次/分');
  barChart($('chart-strain'), labels, days.map((d) => d.strain), (v, i) => (days[i].ongoing ? COLORS.gray : COLORS.blue), { max: 21, step: 7 });
  sleepChart($('chart-sleep'), days);
  $('sleep-legend').innerHTML = sleepLegend();

  renderLastSleep(days.filter((d) => d.sleep).pop());
  const cutoff = Date.now() - currentDays * DAY;
  renderWorkouts(data.workouts.filter((w) => Date.parse(w.start) >= cutoff));
}

// 「今日解读（11/4）」：日期是按钮，点开恢复日历；看的不是最新一天时多一个「回到今天」
function renderTodayTitle(today, allDays) {
  const title = $('today-title');
  title.textContent = pickedDate ? '这一天的解读（' : '今日解读（';
  const pick = document.createElement('button');
  pick.type = 'button';
  pick.className = 'day-pick';
  pick.title = '打开恢复日历';
  pick.setAttribute('aria-haspopup', 'dialog');
  pick.textContent = pickedDate ? `${today.label} ${today.wd}` : today.label;
  pick.addEventListener('click', () => {
    RecoveryCalendar.open({
      days: allDays,
      selected: allDays.indexOf(today),
      top: pick.getBoundingClientRect().bottom + 6,
      opener: pick,
      onPick: (idx) => {
        pickedDate = idx === allDays.length - 1 ? null : allDays[idx].date;
        render(currentData);
        $('today-title').querySelector('.day-pick')?.focus();
      },
    });
  });
  title.append(pick, '）');
  if (pickedDate) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'back-today';
    back.textContent = '回到今天';
    back.addEventListener('click', () => {
      pickedDate = null;
      render(currentData);
    });
    title.append(back);
  }
}

function renderAdvice() {
  $('advice-box').innerHTML = adviceHtml(dailyAdvice(buildDays(currentData)), aiStatus, adviceOpen);
}

function renderLastSleep(day) {
  if (!day) {
    $('last-sleep').innerHTML = '<p class="muted">暂无睡眠数据</p>';
    return;
  }
  const s = day.sleep;
  const st = s.stage_summary;
  const inBed = hours(st.total_in_bed_time_milli);
  const rows = [
    ['深睡', day.deep, COLORS.purple],
    ['快速眼动', day.rem, COLORS.teal],
    ['浅睡', day.light, COLORS.light],
    ['清醒', day.awake, COLORS.gray],
  ];
  const raw = day.sleepRaw;
  $('last-sleep').innerHTML = `
    <p class="muted">${day.label}　${localClock(raw.start, raw.timezone_offset)} 入睡 → ${localClock(raw.end, raw.timezone_offset)} 起床，在床 ${formatHours(inBed)}</p>
    <div class="stages">${rows
      .map(([name, h, color]) => `<div class="stage"><span>${name}</span><div class="bar"><span style="width:${(h / inBed) * 100}%;background:${color}"></span></div><span>${formatHours(h)}</span></div>`)
      .join('')}</div>
    <div class="facts">
      <div>睡眠需求<b>${formatHours(sleepNeedHours(s))}</b></div>
      <div>睡眠表现<b>${s.sleep_performance_percentage ?? '—'}%</b></div>
      <div>睡眠效率<b>${fixed(s.sleep_efficiency_percentage)}%</b></div>
      <div>睡眠规律性<b>${s.sleep_consistency_percentage ?? '—'}%</b></div>
      <div>睡眠周期数<b>${st.sleep_cycle_count} 个</b></div>
      <div>被打断次数<b>${st.disturbance_count} 次</b></div>
    </div>`;
}

function renderWorkouts(workouts) {
  const scored = workouts.filter((w) => w.score_state === 'SCORED');
  if (!scored.length) {
    $('workouts').innerHTML = '<tr><td class="muted">这段时间没有运动记录</td></tr>';
    return;
  }
  const head = '<tr><th>日期</th><th>运动</th><th>时长</th><th>负荷</th><th>平均心率</th><th>最大心率</th><th>消耗</th><th>中高强度占比</th></tr>';
  const rows = scored
    .slice(0, 30)
    .map((w) => {
      const s = w.score;
      const minutes = Math.round((Date.parse(w.end) - Date.parse(w.start)) / 60000);
      const z = s.zone_durations || {};
      const total = Object.values(z).reduce((a, b) => a + (b || 0), 0);
      const hard = total ? Math.round((((z.zone_three_milli || 0) + (z.zone_four_milli || 0) + (z.zone_five_milli || 0)) / total) * 100) : null;
      return `<tr>
        <td>${dayLabel(w.start, w.timezone_offset)}</td>
        <td>${escapeHtml(sportName(w.sport_name))}</td>
        <td>${minutes} 分钟</td>
        <td>${fixed(s.strain, 1)}</td>
        <td>${s.average_heart_rate ?? '—'}</td>
        <td>${s.max_heart_rate ?? '—'}</td>
        <td>${s.kilojoule == null ? '—' : Math.round(s.kilojoule / 4.184) + ' 大卡'}</td>
        <td>${hard == null ? '—' : hard + '%'}</td>
      </tr>`;
    })
    .join('');
  $('workouts').innerHTML = head + rows;
}

function renderGlossary() {
  $('glossary').innerHTML =
    '<tr><th>App 里的英文</th><th>中文</th><th>是什么意思</th></tr>' +
    GLOSSARY.map(([en, zh, desc]) => `<tr><td>${en}</td><td>${zh}</td><td>${desc}</td></tr>`).join('');
}

function showNotice(html) {
  $('notice').hidden = false;
  $('notice').innerHTML = `<div>${html}</div>`;
}

async function load(refresh = false) {
  $('refresh').disabled = true;
  $('notice').hidden = true;
  try {
    const status = await (await fetch('/api/status')).json();
    aiStatus = status.ai || null;
    lastStatus = status;
    adviceOpen = (await (await fetch('/api/prefs')).json()).adviceOpen === true;
    $('auth').textContent = status.loggedIn && !status.demo ? '退出登录' : '连接 WHOOP';
    $('auth').href = status.loggedIn && !status.demo ? '/logout' : '/login';
    $('auth').hidden = status.demo;

    if (!status.demo && !status.configured) {
      // 还没填 WHOOP 的 ID 和密钥：直接显示设置填写框，保存后马上重新读取
      $('notice').hidden = false;
      $('notice').replaceChildren(Setup.form(status, () => load()));
      $('updated').textContent = '未配置';
      return;
    }
    if (!status.loggedIn) {
      showNotice('点右上角 <b>连接 WHOOP</b>，用你的 WHOOP 账号登录并授权，授权完成后会自动回到这里。');
      $('updated').textContent = '未连接';
      return;
    }

    const res = await fetch(`/api/data?days=${DATA_DAYS}${refresh ? '&refresh=1' : ''}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const when = new Date(data.fetched_at).toLocaleString('zh-CN', { hour12: false });
    $('updated').textContent = status.demo ? '示例数据模式（数字是随机生成的）' : `数据同步于 ${when}`;
    $('updated').classList.toggle('stale', !status.demo && Date.now() - Date.parse(data.fetched_at) > 60 * 60 * 1000);
    render(data);
    // 缓存超过 30 分钟：先显示缓存，马上在后台同步
    if (!refresh && !status.demo && Date.now() - Date.parse(data.fetched_at) > 30 * 60 * 1000) setTimeout(() => load(true), 0);
  } catch (err) {
    showNotice(`出错了：${escapeHtml(err.message)}`);
  } finally {
    $('refresh').disabled = false;
  }
}

$('range').addEventListener('click', (e) => {
  const days = Number(e.target.dataset.days);
  if (!days) return;
  currentDays = days;
  for (const b of $('range').querySelectorAll('button')) b.classList.toggle('on', b === e.target);
  if (currentData) render(currentData);
});
$('refresh').addEventListener('click', () => load(true));
// 今日建议卡片上的「AI 帮我写」：只在点的时候请求
$('advice-box').addEventListener('click', (e) => {
  if (e.target.closest('[data-adv-toggle]')) {
    adviceOpen = !adviceOpen;
    setAdviceOpen($('advice-box'), adviceOpen);
    fetch('/api/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adviceOpen }) }).catch(() => {});
    return;
  }
  if (!e.target.closest('[data-ai]') || !currentData) return;
  const days = buildDays(currentData);
  askAiAdvice(dailyAdvice(days), days, renderAdvice);
});
$('copy-ai').addEventListener('click', async () => {
  await navigator.clipboard.writeText(summaryForAi(buildDays(currentData)));
  $('copied').hidden = false;
  setTimeout(() => ($('copied').hidden = true), 2000);
});

// 💡 帮助：网页版只有卡片引导，没有欢迎框和框选
Guide.init({ mode: 'web', seen: { guideSeen: true, tourSeen: true }, loggedIn: () => true });
$('help').addEventListener('click', () => Guide.help('what'));
$('setup').addEventListener('click', async () => {
  let status = lastStatus;
  try {
    status = await (await fetch('/api/status')).json();
  } catch {
    // 用上次的
  }
  Setup.open(status, () => load());
});
$('help-foot').addEventListener('click', () => Guide.help('what'));
$('faq-foot').addEventListener('click', () => Guide.help('faq'));

renderGlossary();
load(new URLSearchParams(location.search).has('synced'));
