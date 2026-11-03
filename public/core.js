// 网页看板（app.js）和桌面小工具（widget.js）共用的逻辑：
// 整理数据、计算个人基线、中文解读、手写 SVG 图表。

// 按系统显示的说法：Mac 上快捷键是 Control+Option+W，双击的是 .command，启动时会开一个终端窗口
const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '');
const PLATFORM_TEXT = IS_MAC
  ? { shortcut: 'Control+Option+W', launcher: '启动桌面小工具.command', serverHint: '启动时打开的终端窗口不要关，关了的话重新双击「启动桌面小工具.command」' }
  : { shortcut: 'Ctrl+Alt+W', launcher: '启动桌面小工具.bat', serverHint: '请重新双击「启动桌面小工具.bat」；用 npm start 打开网页版的话，那个黑色窗口不要关' };

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const COLORS = {
  green: '#16ec06',
  yellow: '#ffde00',
  red: '#ff0026',
  blue: '#3fa9f5',
  purple: '#a879ff',
  teal: '#2ed3b7',
  gray: '#56636b',
  light: '#8fb8de',
  grid: 'rgba(255,255,255,0.10)',
};
// 心率区间 Zone 0–5 的颜色，和 WHOOP App 一致：0 白、1 浅灰蓝、2 蓝、3 青绿、4 橙、5 橙红
const ZONE_COLORS = ['#dfe5e8', '#b4c6cf', '#3d93c6', '#4fc08d', '#ffae5c', '#ff6a2b'];

const SPORT_NAMES = {
  running: '跑步',
  cycling: '骑行',
  'functional-fitness': '功能性训练',
  weightlifting: '举重',
  'strength-trainer': '力量训练',
  'strength trainer': '力量训练',
  yoga: '瑜伽',
  walking: '步行',
  hiking: '徒步',
  swimming: '游泳',
  basketball: '篮球',
  soccer: '足球',
  tennis: '网球',
  badminton: '羽毛球',
  'table-tennis': '乒乓球',
  hiit: '高强度间歇训练',
  pilates: '普拉提',
  rowing: '划船',
  boxing: '拳击',
  elliptical: '椭圆机',
  stairmaster: '爬楼机',
  spin: '动感单车',
  dance: '舞蹈',
  meditation: '冥想',
  stretching: '拉伸',
  activity: '日常活动',
  other: '其他',
};

const GLOSSARY = [
  ['Recovery', '恢复度', '0–100%，身体今天准备好承受多少压力，主要由睡眠时的 HRV、静息心率、呼吸频率和睡眠表现算出来。绿区 67–100%：可以安排高强度；黄区 34–66%：保持中等强度；红区 0–33%：优先休息和恢复。'],
  ['Strain / Day Strain', '负荷 / 当日负荷', '0–21，今天心血管系统承受了多少压力，包括运动和日常活动。数值越往上越难涨：从 18 涨到 19 比从 5 涨到 6 难得多。'],
  ['Strain Target / Strain Coach', '负荷目标 / 负荷教练', '根据今天的恢复度建议的负荷区间。本工具的区间是自定的：绿区 14–18，黄区 10–14，红区 0–10，不是 WHOOP 官方负荷教练的算法。'],
  ['HRV (Heart Rate Variability)', '心率变异性', '两次心跳之间的间隔有多大的变化，在睡眠中测量，单位毫秒，反映身体适应压力的能力。每个人差别很大（年龄、性别、生活习惯、体能都会影响），只和自己的基线比。长期往上走通常说明体能和状态在变好；往下走可能是练得太多、睡得不够、缺水或者压力大。'],
  ['RHR (Resting Heart Rate)', '静息心率', '睡眠中最安静时段的心率，单位次/分。越低通常说明心肺越有效率；比自己平时高出一截，常见原因有没恢复好、生病前兆、饮酒、睡前吃得晚、天热。'],
  ['Health Monitor', '健康监测', '把 HRV、静息心率、呼吸频率、血氧、皮温和你自己的正常范围对比。'],
  ['Sleep Performance', '睡眠表现', '昨晚睡够了身体需要的多少，同时考虑规律性、效率和睡眠压力。最佳 85% 以上，足够 70–85%，差 70% 以下。'],
  ['Sleep Needed', '睡眠需求', '基础需求，加上近期负荷带来的额外需求，再加上要补的睡眠负债，减去白天小睡。'],
  ['Hours vs. Needed', '时长达成率', '实际睡眠时长 ÷ 今晚需要的睡眠时长。'],
  ['Sleep Debt', '睡眠负债', '前几晚没睡够、累积下来要补的部分。'],
  ['Sleep Planner / Sleep Coach', '睡眠规划 / 睡眠教练', '根据起床时间和睡眠需求，建议今晚几点上床。'],
  ['Sleep Efficiency', '睡眠效率', '在床时间里真正睡着的比例。'],
  ['Sleep Consistency', '睡眠规律性', '最近几天上床和起床时间有多一致，越规律越好。'],
  ['Restorative Sleep', '恢复性睡眠', '深睡（SWS）和快速眼动睡眠（REM）的总和。深睡主要修复身体，REM 主要恢复大脑。'],
  ['Wake Events', '醒来次数', '夜里短暂醒来的次数，多数自己察觉不到。'],
  ['Poor / Sufficient / Optimal', '差 / 够 / 最佳', '本工具给睡眠子指标的三段评级：低于 70% 为差，70–85% 为够，85% 及以上为最佳。App 的阈值不公开，这是自定的。'],
  ['Typical Range', '常见范围', '你自己前 30 天里这一项的常见区间（去掉最高和最低各 10%），用虚线框标出。'],
  ['Sleep Stress', '睡眠压力', '睡眠中身体的压力水平。官方 API 拿不到，小工具里没有。'],
  ['Hours of Sleep', '睡眠时长', '真正睡着的时间，不含清醒。'],
  ['Weekly Trends', '周趋势', '近 7 天的小图，选中的那天有底色高亮。'],
  ['Time in Bed', '在床时间', '从上床到起床的总时间。'],
  ['Light Sleep', '浅睡', '占睡眠的大部分，过渡阶段。'],
  ['SWS (Slow Wave Sleep) / Deep', '深睡（慢波睡眠）', '身体修复、肌肉恢复主要发生在这个阶段。'],
  ['REM Sleep', '快速眼动睡眠', '和记忆、学习、情绪调节有关，多数梦发生在这个阶段。'],
  ['Awake', '清醒', '睡眠中醒着的时间。'],
  ['Disturbances', '睡眠干扰次数', '睡眠中被打断的次数。'],
  ['Respiratory Rate', '呼吸频率', '睡眠中每分钟呼吸的次数，单位次/分。每个人非常稳定，一般只在小范围内波动；突然明显升高，可能是身体在对抗感染或压力，值得留意。'],
  ['Blood Oxygen / SpO2', '血氧饱和度', '血液中的含氧比例，正常一般在 95% 以上。'],
  ['Skin Temp', '皮肤温度', '睡眠中的皮肤温度，看和自己平时的偏差。'],
  ['Cycle', '生理周期（一天）', 'WHOOP 以"从醒来到下一次醒来"为一天，不是按 0 点划分。'],
  ['Calibrating', '校准中', '新设备头几天在学习你的基线，数据会逐渐准确。'],
  ['Heart Rate Zones', '心率区间', '按最大心率的百分比划分：区间 1 为 50–60%，区间 2 为 60–70%，区间 3 为 70–80%，区间 4 为 80–90%，区间 5 为 90–100%。区间 1–3 以有氧、耐力为主，适合打基础；区间 4–5 是高强度。按区间训练能帮你控制强度，提升心肺健康。区间时间只统计你记录下来的运动，不是全天。'],
  ['Weekly Performance Assessment', '每周表现评估', '对比本周和上周的恢复、睡眠、负荷。'],
  ['Calories / Energy', '热量消耗', '一天消耗的热量。API 给的是千焦，小工具换算成大卡（÷ 4.184）。'],
  ['Stress Monitor', '压力监测', '实时压力评分（0–3）。官方 API 暂不开放，本工具无法显示。'],
  ['Healthspan / WHOOP Age', '健康寿命 / 生理年龄', '官方 API 暂不开放，本工具无法显示。'],
  ['Journal', '日志', '记录饮酒、咖啡因等行为。官方 API 暂不开放。'],
  ['Nap', '小睡', '白天的短睡眠，会抵扣一部分当晚的睡眠需求。'],
  ["Today's Activities", '今日活动', '这一天的睡眠、小睡和运动记录。'],
  ['Daily Outlook', '每日展望', 'App 里的 AI 每日总结；本工具用自己的中文解读代替。'],
  ["Tonight's Sleep / Recommended Bedtime", '今晚睡眠 / 建议上床时间', '按平时起床时间和今晚的睡眠需求算出的上床时间。'],
  ['My Dashboard', '我的仪表盘', '大数字是当天，小数字是近 30 天平均（按周统计的项目是前几周的周平均）。'],
  ['Strength Activity Time', '力量训练时长', '做抗阻力训练（举重、器械、自重等）的时间。它不只是长肌肉，还有助于维持骨密度、心脏健康、灵活性和日常行动能力。只有这些运动类型会被算进去：背婴儿/背幼儿、芭蕾把杆（Barre、Barre3）、Barry\'s、健美、抱石、拳击健身、霹雳舞、皮划艇（Canoeing、Kayaking）、F45、消防作业、功能性训练、HIIT、热瑜伽、柔术、风筝冲浪、体力劳动、普拉提（含器械普拉提）、力量举、攀岩、负重徒步、塑形瑜伽、铲雪、solidcore、力量训练、尾波滑水、举重、推轮椅、瑜伽。'],
  ['Strain & Recovery', '负荷与恢复图', '近 7 天每天的负荷（左轴 0–21）和恢复度（右轴 0–100%）。'],
  ['Weight', '体重', '你在 WHOOP 里填的体重，API 只提供当前值。'],
  ['Today vs. Last 30 Days', '今天 vs 前 30 天', '大数字是今天，小数字是前 30 天平均。箭头绿色代表往好的方向变，橙色代表往不好的方向变；HRV、睡眠表现越高越好，静息心率越低越好，呼吸频率和平时差不到 1 次/分算稳定。'],
  ['Activity Strain', '活动负荷', '这一次运动让心血管系统承受了多少压力（0–21）。和当日负荷一样，越往上越难涨；旁边的小数字是你近 30 天同类运动的平均。'],
  ['Zone BPM', '区间心率范围', 'App 里每个区间旁边写着心率范围（例如 140–152 次/分），那是 WHOOP 按个人情况算出来的，官方 API 不提供；按最大心率百分比硬算会和 App 对不上，所以这里只显示区间编号。'],
  ['Workout Typical Range', '运动的常见范围', '你近 30 天同类运动里，这个区间占比的常见区间（去掉最高和最低各 10%），用虚线框标出；同类运动少于 3 次时不画。'],
  ['Percent Recorded', '记录完整度', '这次运动期间手环实际记录到心率的比例。低于 90% 时，负荷、热量等数字可能偏低。'],
  ['Recovery Drivers', '恢复度解读', '本工具按 HRV、静息心率、呼吸频率、睡眠表现各自偏离你平时多少（按你自己的波动幅度换算）排出主要原因，不是 WHOOP 的官方算法。'],
];

/* ---------- 小工具函数 ---------- */

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function numbers(values) {
  return values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
}

function average(values) {
  const nums = numbers(values);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function stdev(values) {
  const nums = numbers(values);
  if (nums.length < 2) return null;
  const avg = average(nums);
  return Math.sqrt(nums.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (nums.length - 1));
}

function hours(milli) {
  return milli == null ? null : milli / HOUR;
}

function formatHours(h) {
  if (h == null) return '—';
  const whole = Math.floor(h);
  const minutes = Math.round((h - whole) * 60);
  return minutes === 60 ? `${whole + 1} 小时` : `${whole} 小时 ${minutes} 分`;
}

function fixed(value, digits = 0) {
  return value == null ? '—' : value.toFixed(digits);
}

function offsetMinutes(offset) {
  const match = /^([+-])(\d{2}):?(\d{2})$/.exec(offset || '+00:00');
  return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
}

// 按 WHOOP 记录里的时区偏移（例如 +08:00）换算成当地时间；之后用 getUTC* 读取
function localDate(iso, offset) {
  return new Date(Date.parse(iso) + offsetMinutes(offset) * 60000);
}

function dayLabel(iso, offset) {
  const d = localDate(iso, offset);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function clock(minutesOfDay) {
  const m = ((Math.round(minutesOfDay) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function localClock(iso, offset) {
  const d = localDate(iso, offset);
  return clock(d.getUTCHours() * 60 + d.getUTCMinutes());
}

function recoveryZone(score) {
  if (score == null) return { name: '暂无', color: COLORS.gray };
  if (score >= 67) return { name: '绿区', color: COLORS.green };
  if (score >= 34) return { name: '黄区', color: COLORS.yellow };
  return { name: '红区', color: COLORS.red };
}

// 参考 WHOOP 负荷教练的思路：恢复越好，当天可以承受的负荷越高
function strainTarget(recovery) {
  if (recovery == null) return null;
  if (recovery >= 67) return [14, 18];
  if (recovery >= 34) return [10, 14];
  return [0, 10];
}

function sleepNeedHours(score) {
  const need = score?.sleep_needed;
  if (!need) return null;
  return hours(need.baseline_milli + need.need_from_sleep_debt_milli + need.need_from_recent_strain_milli - need.need_from_recent_nap_milli);
}

// API 的 sport_name 写法不统一（"functional-fitness"、"Functional Fitness"），统一成小写纯字母数字再匹配
function sportKey(name) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// sports-zh.js 是完整的官方运动列表，先查它；SPORT_NAMES 补充几个 API 常见的简写（例如 hiking）
const SPORT_ZH_MAP = new Map([
  ...Object.entries(SPORT_NAMES).map(([en, zh]) => [sportKey(en), zh]),
  ...(typeof SPORTS_ZH === 'undefined' ? [] : SPORTS_ZH.map(([, en, zh]) => [sportKey(en), zh])),
]);

function sportName(name) {
  return SPORT_ZH_MAP.get(sportKey(name)) || name || '运动';
}

// 算进"力量训练时长"的运动类型（App 原文名单），匹配前统一成小写纯字母数字
const STRENGTH_SPORTS = new Set(
  [
    'Babywearing', 'Barre', 'Barre3', "Barry's", 'Bodybuilding', 'Bouldering', 'Box Fitness', 'Breakdancing', 'Canoeing', 'F45 Training',
    'Firefighting', 'Functional Fitness', 'HIIT', 'Hot Yoga', 'Jiu Jitsu', 'Kayaking', 'Kite Boarding', 'Manual Labor', 'Pilates', 'Powerlifting',
    'Reformer Pilates', 'Rock Climbing', 'Rucking', 'Sculpt Yoga', 'Snow Shoveling', 'solidcore', 'Strength Trainer', 'Toddlerwearing', 'Wakeboarding',
    'Weightlifting', 'Wheelchair Pushing', 'Yoga',
  ].map(sportKey),
);

function isStrength(workout) {
  return STRENGTH_SPORTS.has(sportKey(workout.sport_name));
}

/* ---------- 整理数据 ---------- */

// 把 cycles / recoveries / sleeps 按生理周期对齐，按日期从早到晚排序
function buildDays(data) {
  const recoveryByCycle = new Map(data.recoveries.map((r) => [r.cycle_id, r]));
  const sleepByCycle = new Map();
  for (const s of data.sleeps) {
    if (!s.nap && !sleepByCycle.has(s.cycle_id)) sleepByCycle.set(s.cycle_id, s);
  }
  return data.cycles
    .slice()
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .map((c) => {
      const rec = recoveryByCycle.get(c.id);
      const sleep = sleepByCycle.get(c.id);
      const r = rec?.score_state === 'SCORED' ? rec.score : null;
      const s = sleep?.score_state === 'SCORED' ? sleep.score : null;
      const stages = s?.stage_summary;
      const light = hours(stages?.total_light_sleep_time_milli);
      const deep = hours(stages?.total_slow_wave_sleep_time_milli);
      const rem = hours(stages?.total_rem_sleep_time_milli);
      const need = s ? sleepNeedHours(s) : null;
      const from = Date.parse(c.start);
      const to = c.end ? Date.parse(c.end) : Date.now();
      const workouts = (data.workouts || []).filter((w) => w.score_state === 'SCORED' && Date.parse(w.start) >= from && Date.parse(w.start) < to);
      const zones = zoneMinutes(workouts);
      return {
        id: c.id,
        label: dayLabel(c.start, c.timezone_offset),
        start: c.start,
        end: c.end,
        tz: c.timezone_offset,
        ongoing: !c.end,
        strain: c.score_state === 'SCORED' ? c.score.strain : null,
        kcal: c.score?.kilojoule == null ? null : c.score.kilojoule / 4.184,
        avgHr: c.score?.average_heart_rate ?? null,
        recovery: r?.recovery_score ?? null,
        calibrating: r?.user_calibrating ?? false,
        hrv: r?.hrv_rmssd_milli ?? null,
        rhr: r?.resting_heart_rate ?? null,
        spo2: r?.spo2_percentage ?? null,
        skinTemp: r?.skin_temp_celsius ?? null,
        sleep: s,
        sleepRaw: sleep,
        respiratory: s?.respiratory_rate ?? null,
        sleepPerf: s?.sleep_performance_percentage ?? null,
        sleepHours: s ? light + deep + rem : null,
        light,
        deep,
        rem,
        awake: hours(stages?.total_awake_time_milli),
        inBed: hours(stages?.total_in_bed_time_milli),
        need,
        // 时长达成率：实际睡眠 ÷ 需求，App 里最高显示 100%
        hvn: s && need ? Math.min(100, Math.round(((light + deep + rem) / need) * 100)) : null,
        debt: s ? hours(s.sleep_needed?.need_from_sleep_debt_milli) : null,
        restorative: s ? deep + rem : null,
        efficiency: s?.sleep_efficiency_percentage ?? null,
        consistency: s?.sleep_consistency_percentage ?? null,
        // 心率区间分钟数（0–5）、区间 1–3 和 4–5 合计、力量训练分钟数；没运动的日子是 0
        zones,
        zLow: zones[1] + zones[2] + zones[3],
        zHigh: zones[4] + zones[5],
        strengthMin: workouts.filter(isStrength).reduce((sum, w) => sum + (Date.parse(w.end) - Date.parse(w.start)) / 60000, 0),
      };
    });
}

// 找到"今天"：最近一个已经算出恢复度的周期；history 是它之前最多 30 天
function pickToday(days) {
  const scoredIdx = days.map((d) => d.recovery != null).lastIndexOf(true);
  const idx = scoredIdx >= 0 ? scoredIdx : days.length - 1;
  return { today: days[idx], history: days.slice(Math.max(0, idx - 30), idx), current: days[days.length - 1] };
}

// 首页可以前后翻天：取第 idx 天和它之前最多 30 天作为对比基线
function pickDay(days, idx) {
  return { today: days[idx], history: days.slice(Math.max(0, idx - 30), idx) };
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function weekday(iso, offset) {
  return WEEKDAYS[localDate(iso, offset).getUTCDay()];
}

function dayTitle(days, idx) {
  if (idx === days.length - 1) return '今天';
  if (idx === days.length - 2) return '昨天';
  return `${days[idx].label} ${weekday(days[idx].start, days[idx].tz)}`;
}

// 分钟数 → "3:43"，和 App 的写法一致
function formatHm(minutes) {
  if (minutes == null) return '—';
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

// 某一天（一个生理周期）里的活动：结束这个周期前的主睡眠 + 周期内的小睡和运动
function dayActivities(day, data) {
  const from = Date.parse(day.start);
  const to = day.end ? Date.parse(day.end) : Date.now();
  const inside = (r) => Date.parse(r.start) >= from && Date.parse(r.start) < to;
  const list = [];
  if (day.sleepRaw) list.push({ kind: 'sleep', name: '睡眠', rec: day.sleepRaw });
  for (const s of data.sleeps) if (s.nap && inside(s)) list.push({ kind: 'nap', name: '小睡', rec: s });
  for (const w of data.workouts) if (inside(w)) list.push({ kind: 'workout', name: sportName(w.sport_name), rec: w, strain: w.score?.strain ?? null });
  return list
    .map((a) => ({ ...a, minutes: (Date.parse(a.rec.end) - Date.parse(a.rec.start)) / 60000 }))
    .sort((a, b) => Date.parse(a.rec.start) - Date.parse(b.rec.start));
}

// 截止 end 的 7 天里运动记录的心率区间和力量训练分钟数（全天心率区间 API 拿不到）
function weekTotals(workouts, end) {
  const list = workouts.filter((w) => Date.parse(w.start) >= end - 7 * DAY && Date.parse(w.start) < end);
  const z = zoneMinutes(list);
  const strength = list.filter(isStrength).reduce((sum, w) => sum + (Date.parse(w.end) - Date.parse(w.start)) / 60000, 0);
  return { low: z[1] + z[2] + z[3], high: z[4] + z[5], strength };
}

// 我的仪表盘：每行今天的值 + 近 30 天平均；按周的项目用之前几个完整周的平均
function dashboardRows(days, idx, workouts, body) {
  const { today, history } = pickDay(days, idx);
  const avg = (key) => average(history.map((d) => d[key]));
  const end = today.end ? Date.parse(today.end) : Date.now();
  const earliest = Date.parse(days[0].start);
  const pastWeeks = [1, 2, 3, 4].filter((k) => end - (k + 1) * 7 * DAY >= earliest).map((k) => weekTotals(workouts, end - k * 7 * DAY));
  const week = weekTotals(workouts, end);
  const weekAvg = (key) => (pastWeeks.length ? average(pastWeeks.map((w) => w[key])) : null);
  return [
    { name: '心率变异性', en: 'HRV', value: today.hrv, avg: avg('hrv'), unit: '毫秒', better: 'high' },
    { name: '静息心率', en: 'RHR', value: today.rhr, avg: avg('rhr'), unit: '次/分', better: 'low' },
    { name: '心率区间 1–3（每周）', note: '仅运动时段', value: week.low, avg: weekAvg('low'), hm: true, better: 'high' },
    { name: '心率区间 4–5（每周）', note: '仅运动时段', value: week.high, avg: weekAvg('high'), hm: true, better: 'high' },
    { name: '力量训练时长（每周）', value: week.strength, avg: weekAvg('strength'), hm: true, better: 'high' },
    { name: '热量', en: 'Calories', value: today.kcal, avg: avg('kcal'), unit: '大卡' },
    { chart: true },
    { name: '当日负荷', en: 'Day Strain', value: today.strain, avg: avg('strain'), digits: 1, better: 'high' },
    { name: '恢复度', en: 'Recovery', value: today.recovery, avg: avg('recovery'), unit: '%', better: 'high' },
    // API 只有当前体重，没有历史，所以不给平均和箭头
    { name: '体重', en: 'Weight', value: body?.weight_kilogram ?? null, unit: '公斤', digits: 1, single: true },
  ];
}

// 和平均比：差距在 2% 以内算持平；better 决定箭头是绿色（变好）还是橙色（变差）
function trendOf(row) {
  if (row.single || row.value == null || row.avg == null) return { mark: '', cls: 'flat' };
  const diff = row.value - row.avg;
  if (Math.abs(diff) <= Math.max(Math.abs(row.avg) * 0.02, 0.05)) return { mark: '●', cls: 'flat' };
  // better：'high' 越高越好，'low' 越低越好，'stable' 和平均差不到 tolerance 算好
  const good = row.better === 'stable' ? Math.abs(diff) < (row.tolerance ?? 1) : row.better ? (diff > 0) === (row.better === 'high') : null;
  return { mark: diff > 0 ? '▲' : '▼', cls: good == null ? 'flat' : good ? 'up' : 'warn' };
}

function compareText(today, base, { unit = '', digits = 0, higherIsBetter, threshold }) {
  if (today == null || base == null) return '<span class="flat">暂无对比</span>';
  const diff = today - base;
  if (Math.abs(diff) < threshold) return `<span class="flat">与平均 ${base.toFixed(digits)}${unit} 持平</span>`;
  const good = higherIsBetter == null ? null : diff > 0 === higherIsBetter;
  const cls = good == null ? 'flat' : good ? 'up' : 'down';
  return `<span class="${cls}">${diff > 0 ? '↑ 高于' : '↓ 低于'}平均 ${Math.abs(diff).toFixed(digits)}${unit}</span>`;
}

/* ---------- 解读和规划 ---------- */

function interpret(today, history) {
  const tips = [];
  let text;
  if (today.recovery == null) {
    text = '今天的恢复度还没算出来，WHOOP 通常会在你醒来、睡眠数据同步后给出。';
  } else if (today.recovery >= 67) {
    text = `恢复度 ${today.recovery}%，绿区：身体准备充分，适合高强度训练或有挑战的任务。`;
  } else if (today.recovery >= 34) {
    text = `恢复度 ${today.recovery}%，黄区：状态一般，可以正常活动和中等强度训练，量力而行。`;
  } else {
    text = `恢复度 ${today.recovery}%，红区：恢复不足，今天以休息、散步、拉伸为主，晚上早点睡。`;
  }
  if (today.calibrating) tips.push('设备还在校准你的个人基线（前几天正常），数字会越来越准。');

  const hrvBase = average(history.map((d) => d.hrv));
  if (today.hrv != null && hrvBase) {
    const pct = ((today.hrv - hrvBase) / hrvBase) * 100;
    if (pct <= -10) tips.push(`HRV 比近期平均低 ${Math.abs(pct).toFixed(0)}%，身体还在承受压力（训练、熬夜、饮酒、生病都可能）。`);
    else if (pct >= 10) tips.push(`HRV 比近期平均高 ${pct.toFixed(0)}%，神经系统恢复得不错。`);
  }
  const rhrBase = average(history.map((d) => d.rhr));
  if (today.rhr != null && rhrBase && today.rhr - rhrBase >= 3) {
    tips.push(`静息心率比平时高 ${(today.rhr - rhrBase).toFixed(0)} 次/分，留意疲劳、脱水或感冒。`);
  }
  if (today.sleepPerf != null && today.sleepPerf < 70) {
    tips.push(`昨晚睡眠表现只有 ${today.sleepPerf}%，没睡够，今晚早点上床。`);
  }
  const rrBase = average(history.map((d) => d.respiratory));
  if (today.respiratory != null && rrBase && today.respiratory - rrBase >= 1) {
    tips.push(`呼吸频率比平时高 ${(today.respiratory - rrBase).toFixed(1)} 次/分，有时是生病的早期信号。`);
  }
  const tempBase = average(history.map((d) => d.skinTemp));
  if (today.skinTemp != null && tempBase && Math.abs(today.skinTemp - tempBase) >= 0.5) {
    tips.push(`皮肤温度比平时${today.skinTemp > tempBase ? '高' : '低'} ${Math.abs(today.skinTemp - tempBase).toFixed(1)}°C，留意身体状况。`);
  }
  if (today.spo2 != null && today.spo2 < 95) {
    tips.push(`血氧 ${today.spo2}% 略低于常见范围（95% 以上），持续偏低请咨询医生。`);
  }
  if (!tips.length) tips.push('各项指标都在你的正常范围内。');
  return { text, tips, driver: recoveryDriver(today, history) };
}

// 恢复度的四个组成项：better 决定往哪边变算好
const RECOVERY_PARTS = [
  { key: 'hrv', better: 'high', say: (v, avg) => `HRV 比平时${v > avg ? '高' : '低'} ${Math.abs(((v - avg) / avg) * 100).toFixed(0)}%` },
  { key: 'rhr', better: 'low', say: (v, avg) => `静息心率比平时${v > avg ? '高' : '低'} ${Math.abs(v - avg).toFixed(0)} 次/分` },
  { key: 'respiratory', better: 'stable', say: (v, avg) => `呼吸频率比平时${v > avg ? '高' : '低'} ${Math.abs(v - avg).toFixed(1)} 次/分` },
  { key: 'sleepPerf', better: 'high', say: (v, avg) => `睡眠表现比平时${v > avg ? '高' : '低'} ${Math.abs(v - avg).toFixed(0)} 个百分点` },
];

// 今天恢复度比平时高或低，主要是哪一项带动的：每项偏差除以自己的波动幅度，正数是往好的方向
function recoveryDriver(today, history) {
  if (today.recovery == null) return null;
  const recs = numbers(history.map((d) => d.recovery));
  if (recs.length < 5) return '再积累几天数据，就能看出恢复度高低主要是哪一项带动的。';
  const recAvg = average(recs);
  const scored = RECOVERY_PARTS.map((m) => {
    const v = today[m.key];
    const avg = average(history.map((d) => d[m.key]));
    const sd = stdev(history.map((d) => d[m.key]));
    if (v == null || avg == null || !sd) return null;
    const z = (v - avg) / sd;
    const score = m.better === 'high' ? z : m.better === 'low' ? -z : -Math.abs(z);
    return { score, text: m.say(v, avg) };
  }).filter(Boolean);
  const same = Math.abs(today.recovery - recAvg) < 3;
  const up = today.recovery >= recAvg;
  const head = `今天恢复度 ${today.recovery}%，${same ? '和' : up ? '高于' : '低于'}你前 30 天平均（${Math.round(recAvg)}%）${same ? '差不多' : ''}`;
  // 只挑和整体方向一致、偏离超过半个波动幅度的项
  const pick = scored.filter((m) => (up ? m.score >= 0.5 : m.score <= -0.5)).sort((a, b) => (up ? b.score - a.score : a.score - b.score));
  if (same || !pick.length) return `${head}，四项都和平时接近，没有特别突出的一项。`;
  return `${head}，主要是${pick[0].text}${pick[1] ? `，其次是${pick[1].text}` : ''}${pick[2] ? `，另外${pick[2].text}` : ''}。`;
}

// 健康监测：每项指标和"你自己的正常范围"（近 30 天平均 ± 波动）对比
const MONITOR_METRICS = [
  { key: 'hrv', name: '心率变异性', en: 'HRV', unit: '毫秒', digits: 0, minWidth: 5, better: 'high' },
  { key: 'rhr', name: '静息心率', en: 'RHR', unit: '次/分', digits: 0, minWidth: 2, better: 'low' },
  { key: 'respiratory', name: '呼吸频率', en: 'Respiratory Rate', unit: '次/分', digits: 1, minWidth: 0.6 },
  { key: 'spo2', name: '血氧饱和度', en: 'Blood Oxygen', unit: '%', digits: 1, minWidth: 1, better: 'high' },
  { key: 'skinTemp', name: '皮肤温度', en: 'Skin Temp', unit: '°C', digits: 1, minWidth: 0.3 },
];

function healthMonitor(today, history) {
  return MONITOR_METRICS.map((m) => {
    const value = today[m.key];
    const base = baselineRange(history.map((d) => d[m.key]), m.minWidth);
    if (!base) return { ...m, value, status: '基线建立中', cls: 'flat' };
    const { avg, lo, hi } = base;
    let status = '正常';
    let cls = 'up';
    if (value == null) {
      status = '暂无';
      cls = 'flat';
    } else if (value > hi || value < lo) {
      // 往"好"的方向超出（例如 HRV 偏高）标绿色，其余标红色提醒
      const high = value > hi;
      status = high ? '偏高' : '偏低';
      cls = (high && m.better === 'high') || (!high && m.better === 'low') ? 'up' : 'down';
    }
    return { ...m, value, avg, lo, hi, status, cls };
  });
}

// 睡眠规划：用最近 7 晚的平均起床时间和最新的睡眠需求，估算今晚建议上床时间
function sleepPlan(days) {
  const recent = days.filter((d) => d.sleepRaw && d.sleep).slice(-7);
  if (!recent.length) return null;
  const wakes = recent.map((d) => {
    const w = localDate(d.sleepRaw.end, d.sleepRaw.timezone_offset);
    return w.getUTCHours() * 60 + w.getUTCMinutes();
  });
  const wake = average(wakes);
  const latest = recent[recent.length - 1];
  const need = sleepNeedHours(latest.sleep);
  const efficiency = average(recent.map((d) => d.sleep.sleep_efficiency_percentage)) || 90;
  const inBed = need / (efficiency / 100);
  return {
    wake: clock(wake),
    bedtime: clock(wake - inBed * 60),
    wakeMin: wake,
    bedMin: wake - inBed * 60,
    need,
    inBed,
    debt: hours(latest.sleep.sleep_needed.need_from_sleep_debt_milli),
  };
}

// 每周表现：最近 7 天 vs 再往前 7 天
function weeklyReport(days, workouts) {
  const done = days.filter((d) => d.recovery != null || d.strain != null);
  const thisWeek = done.slice(-7);
  const lastWeek = done.slice(-14, -7);
  const now = Date.now();
  const inRange = (w, from, to) => Date.parse(w.start) >= now - from * DAY && Date.parse(w.start) < now - to * DAY;
  const wThis = workouts.filter((w) => inRange(w, 7, 0));
  const wLast = workouts.filter((w) => inRange(w, 14, 7));
  const minutes = (list) => list.reduce((sum, w) => sum + (Date.parse(w.end) - Date.parse(w.start)) / 60000, 0);
  const avgOf = (list, key) => average(list.map((d) => d[key]));
  const rows = [
    { name: '平均恢复度', unit: '%', a: avgOf(thisWeek, 'recovery'), b: avgOf(lastWeek, 'recovery'), higherIsBetter: true },
    { name: '绿区天数', unit: ' 天', a: thisWeek.filter((d) => d.recovery >= 67).length, b: lastWeek.filter((d) => d.recovery >= 67).length, higherIsBetter: true },
    { name: '平均 HRV', unit: ' 毫秒', a: avgOf(thisWeek, 'hrv'), b: avgOf(lastWeek, 'hrv'), higherIsBetter: true },
    { name: '平均静息心率', unit: ' 次/分', a: avgOf(thisWeek, 'rhr'), b: avgOf(lastWeek, 'rhr'), higherIsBetter: false },
    { name: '平均睡眠时长', unit: ' 小时', a: avgOf(thisWeek, 'sleepHours'), b: avgOf(lastWeek, 'sleepHours'), higherIsBetter: true, digits: 1 },
    { name: '平均睡眠表现', unit: '%', a: avgOf(thisWeek, 'sleepPerf'), b: avgOf(lastWeek, 'sleepPerf'), higherIsBetter: true },
    { name: '平均每日负荷', unit: '', a: avgOf(thisWeek, 'strain'), b: avgOf(lastWeek, 'strain'), digits: 1 },
    { name: '运动次数', unit: ' 次', a: wThis.length, b: wLast.length },
    { name: '运动总时长', unit: ' 分钟', a: minutes(wThis), b: minutes(wLast) },
  ];
  const rec = rows[0];
  let summary = '数据还不够两周，先看本周的数字。';
  if (rec.a != null && rec.b != null) {
    const sleepRow = rows[4];
    const strainRow = rows[6];
    const parts = [`本周平均恢复度 ${rec.a.toFixed(0)}%，${rec.a >= rec.b ? '比上周好' : '比上周差'} ${Math.abs(rec.a - rec.b).toFixed(0)} 个百分点`];
    if (sleepRow.a != null && sleepRow.b != null) parts.push(`睡眠${sleepRow.a >= sleepRow.b ? '多了' : '少了'} ${Math.abs(sleepRow.a - sleepRow.b).toFixed(1)} 小时`);
    if (strainRow.a != null && strainRow.b != null) parts.push(`负荷${strainRow.a >= strainRow.b ? '升高' : '降低'} ${Math.abs(strainRow.a - strainRow.b).toFixed(1)}`);
    summary = parts.join('，') + '。';
  }
  return { rows, summary };
}

function zoneMinutes(workouts) {
  const keys = ['zone_zero_milli', 'zone_one_milli', 'zone_two_milli', 'zone_three_milli', 'zone_four_milli', 'zone_five_milli'];
  return keys.map((k) => workouts.reduce((sum, w) => sum + (w.score?.zone_durations?.[k] || 0), 0) / 60000);
}

// 给 AI 用的中文摘要，粘贴到 Claude 等对话里就能追问
function summaryForAi(days) {
  const recent = days.slice(-7);
  const line = (d) =>
    `${d.label}：恢复度 ${d.recovery ?? '—'}%，HRV ${fixed(d.hrv)} 毫秒，静息心率 ${d.rhr ?? '—'}，睡眠 ${fixed(d.sleepHours, 1)} 小时（深睡 ${fixed(d.deep, 1)}，REM ${fixed(d.rem, 1)}），睡眠表现 ${d.sleepPerf ?? '—'}%，负荷 ${fixed(d.strain, 1)}`;
  return [
    '以下是我最近 7 天的 WHOOP 数据，请用中文帮我解读，指出需要注意的地方，并给出今天的作息和训练建议：',
    ...recent.map(line),
    `（近 30 天平均：恢复度 ${fixed(average(days.map((d) => d.recovery)))}%，HRV ${fixed(average(days.map((d) => d.hrv)))} 毫秒，静息心率 ${fixed(average(days.map((d) => d.rhr)))}）`,
  ].join('\n');
}

/* ---------- 今日建议：本地规则（不联网），网页版和小工具共用 ---------- */

// 返回 { day, sections: [{ key, title, items: [{ text, basis }] }] }，basis 是这条建议的依据
function dailyAdvice(days) {
  if (!days.length) return null;
  const { today, history } = pickToday(days);
  const current = days[days.length - 1];
  const week = days.slice(-7);
  const total = (key) => week.reduce((sum, d) => sum + (d[key] || 0), 0);
  const hm = (minutes) => formatHm(minutes);
  // warn：要留意的提醒（收起时优先显示这一条）
  const item = (text, basis, warn = false) => ({ text, basis, warn });
  const train = [];
  const sleep = [];
  const watch = [];

  // 今天怎么练：恢复度区间 → 强度和目标负荷，再看当天进度和这周的训练结构
  const target = strainTarget(today.recovery);
  if (!target) {
    train.push(item('恢复度还没算出来，先按平时的强度安排，等数据同步后再看。', '今天还没有恢复度'));
  } else {
    const basis = `恢复度 ${today.recovery}%（${recoveryZone(today.recovery).name}）`;
    if (today.recovery >= 67) train.push(item(`状态不错，可以安排高强度或时间长一些的训练，目标负荷 ${target[0]}–${target[1]}。`, basis));
    else if (today.recovery >= 34) train.push(item(`正常训练，以中等强度为主，目标负荷 ${target[0]}–${target[1]}。`, basis));
    else train.push(item(`今天以休息、散步、拉伸为主，负荷控制在 ${target[1]} 以下。`, basis));
    if (current.ongoing && current.strain != null) {
      const s = current.strain.toFixed(1);
      const basisNow = `当日负荷 ${s}（进行中）`;
      if (current.strain < target[0]) train.push(item(`现在负荷 ${s}，离目标下限还差 ${(target[0] - current.strain).toFixed(1)}。`, basisNow));
      else if (current.strain > target[1]) train.push(item('今天的负荷已经超过建议上限，剩下的时间别再加练。', basisNow));
      else train.push(item('负荷已经在目标区间里，再练就适可而止。', basisNow));
    }
  }
  const strength = total('strengthMin');
  const low = total('zLow');
  const high = total('zHigh');
  if (today.recovery != null && today.recovery >= 34) {
    if (strength === 0) train.push(item('这周还没有力量训练，可以安排一次 30–45 分钟的力量练习。', '近 7 天力量训练 0:00'));
    if (low < 150) train.push(item(`这周有氧累计 ${hm(low)}，离常见的"每周 150 分钟中等强度"还差 ${hm(150 - low)}，可以加一次快走、慢跑或骑车。`, `近 7 天心率区间 1–3 累计 ${hm(low)}（只统计记录下来的运动）`));
  }
  if (today.recovery != null && today.recovery < 67 && high >= 60) {
    train.push(item(`这周高强度已经练了 ${hm(high)}，今天别再加高强度。`, `近 7 天心率区间 4–5 累计 ${hm(high)}`));
  }

  // 今晚怎么睡：建议上床时间、睡眠负债、规律性、昨晚睡得够不够
  const plan = sleepPlan(days);
  if (plan) {
    sleep.push(item(`建议 ${plan.bedtime} 上床，争取睡够 ${hm(plan.need * 60)}。`, `按近 7 晚平均起床时间 ${plan.wake} 和睡眠需求 ${hm(plan.need * 60)} 估算`));
    if (plan.debt >= 0.75) sleep.push(item('有一些睡眠负债，今晚尽量提前 30 分钟上床补一补。', `睡眠负债 ${hm(plan.debt * 60)}`));
  }
  if (today.consistency != null && today.consistency < 70) sleep.push(item('最近上床和起床时间不太规律，尽量每天固定时间。', `睡眠规律性 ${Math.round(today.consistency)}%`));
  if (today.sleepPerf != null && today.sleepPerf < 70) sleep.push(item('昨晚没睡够身体需要的量，今晚别熬夜。', `睡眠表现 ${today.sleepPerf}%`));
  if (!sleep.length) sleep.push(item('按平时的作息就好。', '暂时没有睡眠数据可以参考'));

  // 要留意什么：健康监测偏离范围、HRV / 静息心率连续几天往不好的方向走、近一周整体趋势
  const monitor = healthMonitor(today, history);
  for (const m of monitor.filter((x) => x.status === '偏高' || x.status === '偏低')) {
    const range = `${m.lo.toFixed(m.digits)}–${m.hi.toFixed(m.digits)}`;
    const text = m.cls === 'up' ? `${m.name}${m.status}，是往好的方向，不用担心。` : `${m.name}${m.status}，留意疲劳、饮酒、睡前进食或生病的可能，持续几天就多休息。`;
    watch.push(item(text, `${m.name}今天 ${m.value.toFixed(m.digits)} ${m.unit}，你的正常范围 ${range}`, m.cls !== 'up'));
  }
  const at = days.indexOf(today);
  const streak = (key, bad) => {
    const base = average(history.map((d) => d[key]));
    let n = 0;
    for (let i = at; base != null && i >= 0 && days[i][key] != null && bad(days[i][key], base); i--) n++;
    return { n, base };
  };
  const hrvLow = streak('hrv', (v, base) => v < base * 0.95);
  if (hrvLow.n >= 3) watch.push(item('身体可能在累积疲劳，这几天减点量、多补水、早点睡。', `HRV 连续 ${hrvLow.n} 天低于平时（前 30 天平均 ${Math.round(hrvLow.base)} 毫秒）`, true));
  const rhrHigh = streak('rhr', (v, base) => v > base + 2);
  if (rhrHigh.n >= 3) watch.push(item('静息心率一直偏高，常见原因是没恢复好、饮酒、天热或快感冒了，先别加量。', `静息心率连续 ${rhrHigh.n} 天高于平时（前 30 天平均 ${Math.round(rhrHigh.base)} 次/分）`, true));
  // 近 7 天和再往前 30 天比
  const prior = days.slice(Math.max(0, days.length - 37), Math.max(0, days.length - 7));
  const hrvWeek = average(week.map((d) => d.hrv));
  const hrvPrior = average(prior.map((d) => d.hrv));
  if (hrvLow.n < 3 && hrvWeek != null && hrvPrior && hrvWeek < hrvPrior * 0.9) {
    watch.push(item('近一周 HRV 整体往下走，训练和作息可以稍微放松一点。', `近 7 天 HRV 平均 ${Math.round(hrvWeek)} 毫秒，比之前 30 天低 ${Math.round((1 - hrvWeek / hrvPrior) * 100)}%`, true));
  }
  const rhrWeek = average(week.map((d) => d.rhr));
  const rhrPrior = average(prior.map((d) => d.rhr));
  if (rhrHigh.n < 3 && rhrWeek != null && rhrPrior && rhrWeek - rhrPrior >= 3) {
    watch.push(item('近一周静息心率整体偏高，留意恢复情况。', `近 7 天静息心率平均 ${Math.round(rhrWeek)} 次/分，比之前 30 天高 ${Math.round(rhrWeek - rhrPrior)}`, true));
  }
  if (today.calibrating) watch.push(item('设备还在校准你的个人基线，前几天的数字仅供参考。', 'WHOOP 标记为校准中'));
  if (!watch.length) {
    const ok = monitor.filter((m) => m.status === '正常').length;
    watch.push(item('各项都在你的正常范围内，没有特别要留意的。', `健康监测 ${ok}/${monitor.length} 项正常`));
  }

  // 收起时那一句：先看「要留意什么」里的提醒，没有就用「今天怎么练」的第一条
  return {
    day: today.id,
    top: watch.find((i) => i.warn) || train[0],
    sections: [
      { key: 'train', title: '今天怎么练', items: train },
      { key: 'sleep', title: '今晚怎么睡', items: sleep },
      { key: 'watch', title: '要留意什么', items: watch },
    ],
  };
}

// 规则建议写成纯文字：发给 AI、复制时用
function adviceText(advice) {
  return advice.sections.map((s) => `${s.title}：\n${s.items.map((i) => `- ${i.text}（依据：${i.basis}）`).join('\n')}`).join('\n');
}

// AI 改写的结果：只存在页面内存里，同一天点第二次才重新生成
const aiAdvice = { day: null, text: '', error: '', loading: false };

// 今日建议卡片；ai = /api/status 里的 { enabled, host }，没配置 AI 时不显示按钮；
// open = 展开还是收起（收起时只剩标题和最要紧的一句，「AI 帮我写」一起藏起来，已生成的结果保留）
function adviceHtml(advice, ai, open = false) {
  if (!advice) return '';
  const mine = aiAdvice.day === advice.day;
  const aiPart = ai?.enabled
    ? `<div class="adv-ai">
        ${mine && aiAdvice.text ? `<div class="adv-ai-text"><b>AI 的话</b>${escapeHtml(aiAdvice.text)}</div>` : ''}
        ${mine && aiAdvice.error ? `<div class="adv-err">AI 没写成：${escapeHtml(aiAdvice.error)}。上面的本地规则建议照常可用。</div>` : ''}
        <div class="adv-btn"><button data-ai="1"${mine && aiAdvice.loading ? ' disabled' : ''}>${mine && aiAdvice.loading ? '正在写…' : mine && aiAdvice.text ? '重新生成' : 'AI 帮我写'}</button><small>点了才发送；数据会发送到 ${escapeHtml(ai.host)}</small></div>
      </div>`
    : '';
  return `<button type="button" class="adv-toggle" data-adv-toggle aria-expanded="${open}" aria-controls="adv-body"><b>今日建议</b><span class="adv-one"${open ? ' hidden' : ''}>${escapeHtml(advice.top?.text || '')}</span><i class="adv-chev" aria-hidden="true">›</i></button>
    <div id="adv-body"${open ? '' : ' hidden'}>
    ${advice.sections.map((s) => `<div class="adv-sec"><b>${s.title}</b><ul>${s.items.map((i) => `<li>${escapeHtml(i.text)}<small>依据：${escapeHtml(i.basis)}</small></li>`).join('')}</ul></div>`).join('')}
    ${aiPart}
    <p class="adv-note">本工具按规则生成，不是 WHOOP 官方建议，不构成医疗建议。</p>
    </div>`;
}

// 收起 / 展开：只改这张卡片自己的显示，焦点留在按钮上
function setAdviceOpen(box, open) {
  const btn = box?.querySelector('[data-adv-toggle]');
  if (!btn) return;
  btn.setAttribute('aria-expanded', String(open));
  box.querySelector('#adv-body').hidden = !open;
  box.querySelector('.adv-one').hidden = open;
}

// 点「AI 帮我写」：把数字摘要和规则建议交给本机服务器，由服务器去请求 AI；rerender 用来刷新卡片
async function askAiAdvice(advice, days, rerender) {
  if (aiAdvice.loading) return;
  const refresh = aiAdvice.day === advice.day && Boolean(aiAdvice.text);
  Object.assign(aiAdvice, { day: advice.day, loading: true, error: '' });
  rerender();
  try {
    const res = await fetch('/api/advice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day: String(advice.day), summary: summaryForAi(days), rules: adviceText(advice), refresh }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || `服务器返回 ${res.status}`);
    aiAdvice.text = result.text;
  } catch (err) {
    aiAdvice.error = err.message === 'Failed to fetch' ? `连不上本机服务器，${PLATFORM_TEXT.serverHint}` : err.message;
  } finally {
    aiAdvice.loading = false;
    rerender();
  }
}

/* ---------- 图表（手写 SVG，不依赖外部库） ---------- */

function chartBox(opts = {}) {
  const w = opts.w || 640;
  const h = opts.h || 200;
  return { w, h, l: 30, r: 6, t: 8, b: 22, innerW: w - 36, innerH: h - 30 };
}

function xLabels(box, labels) {
  const every = Math.ceil(labels.length / (box.w < 400 ? 5 : 10));
  const slot = box.innerW / labels.length;
  return labels
    .map((label, i) => (i % every === 0 ? `<text x="${box.l + slot * (i + 0.5)}" y="${box.h - 6}" text-anchor="middle">${label}</text>` : ''))
    .join('');
}

function yGrid(box, lo, hi, step, y) {
  let out = '';
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    out += `<line x1="${box.l}" x2="${box.w - box.r}" y1="${y(v)}" y2="${y(v)}" stroke="${COLORS.grid}"/>`;
    out += `<text x="${box.l - 5}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 10) / 10}</text>`;
  }
  return out;
}

function niceMax(values, floor) {
  const max = Math.max(floor, ...numbers(values));
  const step = max > 50 ? 20 : max > 20 ? 10 : max > 10 ? 5 : 2;
  return { max: Math.ceil(max / step) * step, step };
}

function barChart(el, labels, values, colorFor, opts = {}) {
  const box = chartBox(opts);
  const { max, step } = opts.max ? opts : niceMax(values, 1);
  const y = (v) => box.t + box.innerH - (v / max) * box.innerH;
  const slot = box.innerW / labels.length;
  const bars = values
    .map((v, i) =>
      v == null ? '' : `<rect x="${box.l + slot * i + slot * 0.15}" y="${y(v)}" width="${slot * 0.7}" height="${box.t + box.innerH - y(v)}" rx="2" fill="${colorFor(v, i)}"><title>${labels[i]}：${v}</title></rect>`,
    )
    .join('');
  el.innerHTML = `<svg viewBox="0 0 ${box.w} ${box.h}">${yGrid(box, 0, max, step, y)}${xLabels(box, labels)}${bars}</svg>`;
}

function lineChart(el, labels, values, color, unit, opts = {}) {
  const present = numbers(values);
  if (!present.length) {
    el.innerHTML = '<p class="muted">暂无数据</p>';
    return;
  }
  const box = chartBox(opts);
  const lo = Math.floor(Math.min(...present) * 0.9);
  const hi = Math.ceil(Math.max(...present) * 1.05);
  const range = hi - lo || 1;
  const step = range > 40 ? 10 : range > 15 ? 5 : 2;
  const slot = box.innerW / labels.length;
  const y = (v) => box.t + box.innerH - ((v - lo) / range) * box.innerH;
  const x = (i) => box.l + slot * (i + 0.5);
  const points = values.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
  const avg = average(values);
  const dots = values.map((v, i) => (v == null ? '' : `<circle cx="${x(i)}" cy="${y(v)}" r="2.5" fill="${color}"><title>${labels[i]}：${v} ${unit}</title></circle>`)).join('');
  el.innerHTML = `<svg viewBox="0 0 ${box.w} ${box.h}">${yGrid(box, lo, hi, step, y)}${xLabels(box, labels)}
    <line x1="${box.l}" x2="${box.w - box.r}" y1="${y(avg)}" y2="${y(avg)}" stroke="${color}" stroke-dasharray="4 4" opacity="0.5"/>
    <polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>${dots}</svg>`;
}

const SLEEP_PARTS = [
  ['deep', '深睡', COLORS.purple],
  ['rem', '快速眼动', COLORS.teal],
  ['light', '浅睡', COLORS.light],
];

function sleepChart(el, days, opts = {}) {
  const box = chartBox(opts);
  const labels = days.map((d) => d.label);
  const { max, step } = niceMax(days.map((d) => d.sleepHours), 8);
  const y = (v) => box.t + box.innerH - (v / max) * box.innerH;
  const slot = box.innerW / labels.length;
  let bars = '';
  days.forEach((d, i) => {
    if (!d.sleep) return;
    let top = box.t + box.innerH;
    for (const [key, , color] of SLEEP_PARTS) {
      const h = (d[key] / max) * box.innerH;
      top -= h;
      bars += `<rect x="${box.l + slot * i + slot * 0.15}" y="${top}" width="${slot * 0.7}" height="${h}" fill="${color}"><title>${d.label}：共 ${formatHours(d.sleepHours)}</title></rect>`;
    }
  });
  el.innerHTML = `<svg viewBox="0 0 ${box.w} ${box.h}">${yGrid(box, 0, max, step, y)}${xLabels(box, labels)}${bars}</svg>`;
}

function sleepLegend() {
  return SLEEP_PARTS.map(([, name, color]) => `<span><i style="background:${color}"></i>${name}</span>`).join('');
}

/* ---------- 周趋势小图：数字放在固定的行里，不贴着点，避免两点靠近时重叠 ---------- */

// spec.rows：每一排数字 { text(d), color（字符串或函数）, pos: 'top' | 'bottom' }，都和当天竖向对齐；
// spec.draw(ctx) 画柱子或折线，纵向位置用 ctx.y(0–1 的比例)；
// spec.left / spec.right：两侧刻度 [[比例, 文字, 颜色], ...]；没有刻度时只画三条淡网格。
// 窗口窄时字号跟着缩小，保证最宽的标签（"10/30"、"23:32"）放进一天的宽度还留空隙，不省略任何一天
function trendChart(el, days, selected, spec) {
  const w = spec.w || el.clientWidth || 340;
  const l = spec.left ? spec.leftW || 26 : 4;
  const r = spec.right ? 36 : 4;
  const slot = (w - l - r) / days.length;
  const size = Math.min(10, slot / 3.6);
  const lh = size + 5;
  const tops = spec.rows.filter((row) => row.pos !== 'bottom');
  const bottoms = spec.rows.filter((row) => row.pos === 'bottom');
  const t = tops.length * lh + 8;
  const ih = spec.ih || 90;
  const below = t + ih + 6;
  const h = below + (bottoms.length + 2) * lh + 2;
  const x = (i) => l + slot * (i + 0.5);
  const y = (f) => t + ih - Math.min(Math.max(f, 0), 1) * ih;
  const txt = (tx, ty, color, text, anchor = 'middle', bold = false) =>
    `<text x="${tx}" y="${ty}" text-anchor="${anchor}" style="fill:${color};font-size:${size}px${bold ? ';font-weight:700' : ''}">${text}</text>`;
  let out = '';
  if (selected >= 0) out += `<rect x="${l + slot * selected + slot * 0.08}" y="0" width="${slot * 0.84}" height="${h}" rx="5" style="fill:var(--chip, rgba(255,255,255,0.07))"/>`;
  const ticks = spec.left || spec.right || [[0], [0.5], [1]];
  ticks.forEach(([f], k) => {
    out += `<line x1="${l}" x2="${w - r}" y1="${y(f)}" y2="${y(f)}" stroke="${COLORS.grid}"/>`;
    if (spec.left) out += txt(l - 5, y(spec.left[k][0]) + size * 0.35, spec.left[k][2], spec.left[k][1], 'end');
    if (spec.right) out += txt(w - r + 5, y(spec.right[k][0]) + size * 0.35, spec.right[k][2], spec.right[k][1], 'start');
  });
  out += spec.draw({ x, y, slot, days });
  const rowY = (k, base) => base + (k + 1) * lh - 4;
  const writeRow = (row, ty) =>
    days.forEach((d, i) => {
      const s = row.text(d);
      if (s != null) out += txt(x(i), ty, typeof row.color === 'function' ? row.color(d) : row.color, s, 'middle', i === selected);
    });
  tops.forEach((row, k) => writeRow(row, rowY(k, 0)));
  bottoms.forEach((row, k) => writeRow(row, rowY(k, below)));
  days.forEach((d, i) => {
    const color = i === selected ? '#eef2f4' : '#9aa7ae';
    out += txt(x(i), rowY(bottoms.length, below), color, weekday(d.start, d.tz), 'middle', i === selected);
    out += txt(x(i), rowY(bottoms.length + 1, below), color, d.label, 'middle', i === selected);
  });
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}">${out}</svg>`;
}

// 柱子：get(d) 的值除以 scale 得到高度比例；color 可以是按天返回颜色的函数
function drawBars(get, scale, color) {
  return ({ x, y, slot, days }) =>
    days
      .map((d, i) => {
        const v = get(d);
        if (v == null) return '';
        const top = y(v / scale);
        return `<rect x="${x(i) - slot * 0.18}" y="${top}" width="${slot * 0.36}" height="${Math.max(y(0) - top, 1)}" rx="2" fill="${typeof color === 'function' ? color(d) : color}"/>`;
      })
      .join('');
}

// 堆叠柱：parts = [[get, 颜色], ...] 从下往上叠
function drawStack(parts, scale) {
  return ({ x, y, slot, days }) =>
    days
      .map((d, i) => {
        let base = 0;
        return parts
          .map(([get, color]) => {
            const v = get(d);
            if (v == null) return '';
            const rect = `<rect x="${x(i) - slot * 0.18}" y="${y((base + v) / scale)}" width="${slot * 0.36}" height="${Math.max(y(base / scale) - y((base + v) / scale), 0)}" fill="${color}"/>`;
            base += v;
            return rect;
          })
          .join('');
      })
      .join('');
}

// 折线：toF 把数值换成 0–1 比例；dot 是点的颜色（字符串或按数值返回颜色的函数）；fill 为 true 时折线下方加淡填充
function drawLine(get, toF, color, dot = color, { fill = false } = {}) {
  return ({ x, y, days }) => {
    const pts = days.map((d, i) => (get(d) == null ? null : [x(i), y(toF(get(d))), get(d)])).filter(Boolean);
    const area =
      fill && pts.length > 1
        ? `<polygon points="${pts.map(([px, py]) => `${px},${py}`).join(' ')} ${pts[pts.length - 1][0]},${y(0)} ${pts[0][0]},${y(0)}" style="fill:${color};opacity:0.13"/>`
        : '';
    const line = pts.length > 1 ? `<polyline points="${pts.map(([px, py]) => `${px},${py}`).join(' ')}" fill="none" stroke="${color}" stroke-width="1.6"/>` : '';
    return area + line + pts.map(([px, py, v]) => `<circle cx="${px}" cy="${py}" r="3.5" fill="#0e1215" stroke="${typeof dot === 'function' ? dot(v) : dot}" stroke-width="2"/>`).join('');
  };
}

// 负荷与恢复双轴图：左轴负荷 0–21（蓝），右轴恢复 0–100%（按绿黄红着色）；
// 恢复度一排在绘图区上方，负荷一排在下方、日期上面
function strainRecoveryChart(el, days, selected, opts = {}) {
  const right = [[0, '0%', COLORS.red], [1 / 3, '33%', COLORS.red], [2 / 3, '66%', COLORS.yellow], [1, '100%', COLORS.green]];
  trendChart(el, days, selected, {
    w: opts.w,
    ih: 120,
    leftW: 24,
    left: right.map(([f]) => [f, Math.round(f * 21), COLORS.blue]),
    right,
    rows: [
      { text: (d) => (d.recovery == null ? null : `${d.recovery}%`), color: (d) => recoveryZone(d.recovery).color },
      { pos: 'bottom', text: (d) => (d.strain == null ? null : d.strain.toFixed(1)), color: COLORS.blue },
    ],
    draw: (c) => drawLine((d) => d.recovery, (v) => v / 100, '#7c878d', (v) => recoveryZone(v).color)(c) + drawLine((d) => d.strain, (v) => v / 21, COLORS.blue)(c),
  });
}

/* ---------- 睡眠详情 ---------- */

// 睡眠页配色，和 App 一致：浅睡淡紫、深睡粉、REM 紫
const SLEEP_COLORS = { base: '#6c787e', sleep: '#7fa6c2', need: '#2ee6a8', awake: '#e3e9ec', light: '#a7a3f0', deep: '#f39cf0', rem: '#a45ee8', strain: '#3fa9f5', debt: '#c9d1d5' };

// 三段评级：差 / 够 / 最佳（阈值自定，见词典）
const RATINGS = [
  { name: '差', color: '#ffa53b' },
  { name: '够', color: '#9aa7ae' },
  { name: '最佳', color: '#2ee6a8' },
];

function sleepRating(pct) {
  if (pct == null) return null;
  return pct < 70 ? 0 : pct < 85 ? 1 : 2;
}

// 分位数：常见范围取前 30 天的 10%–90% 分位；数据少于 min 个（默认 5）不给范围
function percentile(values, p, min = 5) {
  const nums = numbers(values).sort((a, b) => a - b);
  if (nums.length < min) return null;
  const i = (nums.length - 1) * p;
  const lo = Math.floor(i);
  return nums[lo] + (nums[Math.ceil(i)] - nums[lo]) * (i - lo);
}

// 睡眠需求拆解（小时）
function needParts(sleep) {
  const n = sleep?.sleep_needed;
  if (!n) return null;
  return {
    base: hours(n.baseline_milli),
    strain: hours(n.need_from_recent_strain_milli),
    debt: hours(n.need_from_sleep_debt_milli),
    nap: hours(n.need_from_recent_nap_milli) || 0,
  };
}

// 本地时间换成"从中午 12 点起的分钟数"，这样跨午夜的上床、起床时间能画在同一根竖轴上
function noonMinutes(iso, offset) {
  const d = localDate(iso, offset);
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + 720) % 1440;
}

// 上床→起床浮动竖条：上方一排上床时间，下方一排起床时间；plan 给出时画"建议上床/起床"虚线
function bedtimeSpec(days, plan, ih = 100) {
  const at = (d, key) => (d.sleepRaw && d.sleep ? noonMinutes(d.sleepRaw[key], d.sleepRaw.timezone_offset) : null);
  const planBed = plan ? (((plan.bedMin + 720) % 1440) + 1440) % 1440 : null;
  const planWake = plan ? (((plan.wakeMin + 720) % 1440) + 1440) % 1440 : null;
  const all = numbers([...days.map((d) => at(d, 'start')), ...days.map((d) => at(d, 'end')), planBed, planWake]);
  const lo = all.length ? Math.floor((Math.min(...all) - 30) / 60) * 60 : 600;
  const hi = all.length ? Math.ceil((Math.max(...all) + 30) / 60) * 60 : 1200;
  const f = (m) => 1 - (m - lo) / (hi - lo);
  const step = hi - lo > 600 ? 240 : 120;
  const left = [];
  for (let m = Math.ceil(lo / step) * step; m <= hi; m += step) left.push([f(m), clock(m + 720), '#9aa7ae']);
  return {
    ih,
    leftW: 34,
    left: left.length ? left : null,
    rows: [
      { text: (d) => (at(d, 'start') == null ? null : clock(at(d, 'start') + 720)), color: SLEEP_COLORS.sleep },
      { pos: 'bottom', text: (d) => (at(d, 'end') == null ? null : clock(at(d, 'end') + 720)), color: SLEEP_COLORS.sleep },
    ],
    draw: ({ x, y, slot, days: ds }) => {
      let out = '';
      if (plan) {
        for (const m of [planBed, planWake]) out += `<line x1="${x(0) - slot / 2}" x2="${x(ds.length - 1) + slot / 2}" y1="${y(f(m))}" y2="${y(f(m))}" stroke="#c9d1d5" stroke-dasharray="3 3" opacity="0.8"/>`;
      }
      ds.forEach((d, i) => {
        const a = at(d, 'start');
        const b = at(d, 'end');
        if (a != null && b != null) out += `<rect x="${x(i) - slot * 0.16}" y="${y(f(a))}" width="${slot * 0.32}" height="${Math.max(y(f(b)) - y(f(a)), 1)}" rx="3" fill="${SLEEP_COLORS.sleep}"/>`;
      });
      return out;
    },
  };
}

// 睡眠详情页底部的 8 张周趋势图（睡眠压力 API 拿不到，省略）
function sleepTrendCharts(week) {
  const hm = (h) => (h == null ? null : formatHm(h * 60));
  const pct = (v) => (v == null ? null : `${Math.round(v)}%`);
  const pctBars = (key) => ({ rows: [{ text: (d) => pct(d[key]), color: SLEEP_COLORS.sleep }], draw: drawBars((d) => d[key], 100, SLEEP_COLORS.sleep) });
  const span = numbers(week.flatMap((d) => [d.sleepHours, d.need]));
  const lo = span.length ? Math.floor(Math.min(...span) - 0.5) : 0;
  const hi = span.length ? Math.ceil(Math.max(...span) + 0.5) : 10;
  const effs = numbers(week.map((d) => d.efficiency));
  const effLo = effs.length ? Math.min(Math.floor(Math.min(...effs)) - 3, 85) : 80;
  const restMax = Math.max(1, ...numbers(week.map((d) => d.restorative))) * 1.1;
  const debtMax = Math.max(1, ...numbers(week.map((d) => d.debt)));
  return [
    { id: 'perf', title: '睡眠表现 Sleep Performance', spec: pctBars('sleepPerf') },
    {
      id: 'hvn-lines',
      title: '时长 vs 需求（小时）',
      legend: [['睡眠时长', SLEEP_COLORS.sleep], ['睡眠需求', SLEEP_COLORS.need]],
      spec: {
        rows: [
          { text: (d) => hm(d.sleepHours), color: SLEEP_COLORS.sleep },
          { text: (d) => hm(d.need), color: SLEEP_COLORS.need },
        ],
        draw: (c) => drawLine((d) => d.need, (v) => (v - lo) / (hi - lo), SLEEP_COLORS.need)(c) + drawLine((d) => d.sleepHours, (v) => (v - lo) / (hi - lo), '#9aa7ae', SLEEP_COLORS.sleep)(c),
      },
    },
    { id: 'hvn', title: '时长达成率 Hours vs. Needed', spec: pctBars('hvn') },
    {
      id: 'rest',
      title: '恢复性睡眠（小时）',
      legend: [['深睡', SLEEP_COLORS.deep], ['快速眼动 REM', SLEEP_COLORS.rem]],
      spec: { rows: [{ text: (d) => hm(d.restorative), color: '#eef2f4' }], draw: drawStack([[(d) => d.rem, SLEEP_COLORS.rem], [(d) => d.deep, SLEEP_COLORS.deep]], restMax) },
    },
    { id: 'cons', title: '睡眠规律性 Sleep Consistency', spec: pctBars('consistency') },
    { id: 'bed', title: '在床时间 Time in Bed', spec: bedtimeSpec(week, null) },
    {
      id: 'eff',
      title: '睡眠效率 Sleep Efficiency',
      spec: { rows: [{ text: (d) => pct(d.efficiency), color: SLEEP_COLORS.sleep }], draw: drawLine((d) => d.efficiency, (v) => (v - effLo) / (100 - effLo), '#7c878d', SLEEP_COLORS.sleep) },
    },
    { id: 'debt', title: '睡眠负债 Sleep Debt', spec: { rows: [{ text: (d) => hm(d.debt), color: SLEEP_COLORS.sleep }], draw: drawBars((d) => d.debt, debtMax, SLEEP_COLORS.sleep) } },
  ];
}

/* ---------- 恢复详情 ---------- */

const RECOVERY_LINE = '#6aa9e0';

// 恢复详情页底部的 5 张周趋势图：恢复度柱（按区间着色）、三条折线、睡眠表现柱
function recoveryTrendCharts(week) {
  // 折线纵轴按这周的数值上下留空，至少跨 minSpan，波动小的呼吸频率不会被放大成大起大落
  const lineSpec = (key, digits, minSpan) => {
    const vals = numbers(week.map((d) => d[key]));
    const mid = vals.length ? (Math.min(...vals) + Math.max(...vals)) / 2 : 0;
    const half = Math.max(vals.length ? (Math.max(...vals) - Math.min(...vals)) * 0.8 : 0, minSpan / 2);
    const lo = mid - half;
    const hi = mid + half;
    return {
      rows: [{ text: (d) => (d[key] == null ? null : d[key].toFixed(digits)), color: RECOVERY_LINE }],
      draw: drawLine((d) => d[key], (v) => (v - lo) / (hi - lo), RECOVERY_LINE, RECOVERY_LINE, { fill: true }),
    };
  };
  return [
    {
      id: 'rec',
      title: '恢复度 Recovery',
      spec: { rows: [{ text: (d) => (d.recovery == null ? null : `${d.recovery}%`), color: (d) => recoveryZone(d.recovery).color }], draw: drawBars((d) => d.recovery, 100, (d) => recoveryZone(d.recovery).color) },
    },
    { id: 'hrv', title: '心率变异性 HRV（毫秒）', spec: lineSpec('hrv', 0, 12) },
    { id: 'rhr', title: '静息心率 RHR（次/分）', spec: lineSpec('rhr', 0, 8) },
    { id: 'resp', title: '呼吸频率（次/分）', spec: lineSpec('respiratory', 1, 2) },
    {
      id: 'perf',
      title: '睡眠表现 Sleep Performance',
      spec: { rows: [{ text: (d) => (d.sleepPerf == null ? null : `${d.sleepPerf}%`), color: SLEEP_COLORS.sleep }], draw: drawBars((d) => d.sleepPerf, 100, SLEEP_COLORS.sleep) },
    },
  ];
}

/* ---------- 趋势视图（周 / 月 / 6 个月），恢复、睡眠、负荷三类共用 ---------- */

// kind：daily 每天一个值；weekly 按周累计（只统计记录下来的运动）
const TREND_METRICS = [
  { key: 'recovery', group: 'recovery', name: '恢复度', en: 'Recovery', info: 'Recovery', kind: 'daily', chart: 'bar', unit: '%', digits: 0, max: 100, minWidth: 8, color: (v) => recoveryZone(v).color },
  { key: 'hrv', group: 'recovery', name: '心率变异性 HRV', en: 'HRV', info: 'HRV (Heart Rate Variability)', kind: 'daily', chart: 'line', unit: ' 毫秒', digits: 0, minWidth: 5 },
  { key: 'rhr', group: 'recovery', name: '静息心率', en: 'RHR', info: 'RHR (Resting Heart Rate)', kind: 'daily', chart: 'line', unit: ' 次/分', digits: 0, minWidth: 2 },
  { key: 'respiratory', group: 'recovery', name: '呼吸频率', en: 'Respiratory Rate', info: 'Respiratory Rate', kind: 'daily', chart: 'line', unit: ' 次/分', digits: 1, minWidth: 0.6 },
  { key: 'sleepPerf', group: 'recovery', also: 'sleep', name: '睡眠表现', en: 'Sleep Performance', info: 'Sleep Performance', kind: 'daily', chart: 'bar', unit: '%', digits: 0, max: 100, minWidth: 5, color: () => SLEEP_COLORS.sleep },
  { key: 'sleepHours', group: 'sleep', name: '睡眠时长', en: 'Hours of Sleep', info: 'Hours of Sleep', kind: 'daily', chart: 'line', hm: true, minWidth: 0.4 },
  { key: 'strain', group: 'strain', name: '负荷', en: 'Strain', info: 'Strain / Day Strain', kind: 'daily', chart: 'bar', unit: '', digits: 1, max: 21, minWidth: 1.5, color: () => COLORS.blue },
  { key: 'zLow', group: 'strain', name: '心率区间 1–3', en: 'HR Zones 1–3', info: 'Heart Rate Zones', kind: 'weekly', zones: [1, 2, 3] },
  { key: 'zHigh', group: 'strain', name: '心率区间 4–5', en: 'HR Zones 4–5', info: 'Heart Rate Zones', kind: 'weekly', zones: [4, 5] },
  { key: 'strengthMin', group: 'strain', name: '力量训练时长', en: 'Strength Activity Time', info: 'Strength Activity Time', kind: 'weekly', strength: true },
  { key: 'kcal', group: 'strain', name: '热量', en: 'Calories', info: 'Calories / Energy', kind: 'daily', chart: 'bar', unit: ' 大卡', digits: 0, minWidth: 150, color: () => COLORS.blue },
];
const TREND_PERIODS = { W: { days: 7, name: '周' }, M: { days: 28, name: '月' }, '6M': { days: 182, name: '6 个月' } };

function trendMetric(key) {
  return TREND_METRICS.find((m) => m.key === key);
}

// 同一类的指标（顶部下拉框）：睡眠表现同时属于恢复和睡眠
function trendGroup(key) {
  const m = trendMetric(key);
  return TREND_METRICS.filter((x) => x.group === m.group || x.also === m.group || (m.also && x.group === m.also));
}

// 个人基线：近期平均 ± 1.5 倍波动（至少 minWidth），和健康监测同一套算法；少于 4 天不给
function baselineRange(values, minWidth = 0) {
  const nums = numbers(values);
  if (nums.length < 4) return null;
  const avg = average(nums);
  const half = Math.max(1.5 * (stdev(nums) || 0), minWidth);
  return { avg, lo: avg - half, hi: avg + half };
}

function trendFormat(m, v) {
  if (v == null) return '—';
  if (m.kind === 'weekly') return formatHm(v);
  if (m.hm) return formatHm(v * 60);
  return m.key === 'kcal' ? Math.round(v).toLocaleString('en-US') : v.toFixed(m.digits);
}

// 一段日期的写法：10/5 – 11/3
function rangeText(from, to) {
  return `${from.label} – ${to.label}`;
}

// 某一天里力量类运动按运动类型分的分钟数
function strengthBySport(day, workouts) {
  const from = Date.parse(day.start);
  const to = day.end ? Date.parse(day.end) : Date.now();
  const out = {};
  for (const w of workouts) {
    if (w.score_state !== 'SCORED' || !isStrength(w) || Date.parse(w.start) < from || Date.parse(w.start) >= to) continue;
    const name = sportName(w.sport_name);
    out[name] = (out[name] || 0) + (Date.parse(w.end) - Date.parse(w.start)) / 60000;
  }
  return out;
}

// 算出一个趋势视图需要的全部内容；offset = 往前翻了几个周期
function trendView(days, workouts, key, period, offset) {
  const m = trendMetric(key);
  const len = TREND_PERIODS[period].days;
  const last = days.length - 1 - offset * len;
  const first = Math.max(0, last - len + 1);
  const win = days.slice(first, last + 1);
  const prev = days.slice(Math.max(0, first - len), first);
  const view = { metric: m, period, from: win[0], to: win[win.length - 1], canOlder: first > 0, canNewer: offset > 0 };
  if (m.kind === 'daily') {
    const get = (d) => d[m.key];
    view.avg = average(win.map(get));
    const prevAvg = prev.length >= len / 2 ? average(prev.map(get)) : null;
    view.points = win.map((d) => ({ day: d, v: get(d) }));
    // 常见范围：窗口最后一天之前 30 天的个人基线
    view.band = baselineRange(days.slice(Math.max(0, last - 30), last).map(get), m.minWidth);
    const when = offset === 0 ? `近 ${win.length} 天` : `${rangeText(view.from, view.to)}`;
    if (view.avg == null) view.summary = `${when}没有${m.name}的数据。`;
    else {
      view.summary = `${when}你的平均${m.name}是 ${trendFormat(m, view.avg)}${m.hm ? '' : m.unit}`;
      if (prevAvg != null) {
        const diff = view.avg - prevAvg;
        const same = Math.abs(diff) <= Math.abs(prevAvg) * 0.02;
        view.summary += same ? `，和之前同样长的一段差不多。` : `，比之前同样长的一段${diff > 0 ? '高' : '低'} ${m.hm ? formatHm(Math.abs(diff) * 60) : `${trendFormat(m, Math.abs(diff))}${m.unit}`}。`;
      } else view.summary += '。';
    }
    // 睡眠表现的「睡眠分布」：最佳 >85%、足够 70–85%、差 <70% 各几天
    if (m.key === 'sleepPerf') {
      const vals = numbers(win.map(get));
      view.spread = [
        { name: '最佳 >85%', color: RATINGS[2].color, n: vals.filter((v) => v > 85).length },
        { name: '足够 70–85%', color: RATINGS[1].color, n: vals.filter((v) => v >= 70 && v <= 85).length },
        { name: '差 <70%', color: RATINGS[0].color, n: vals.filter((v) => v < 70).length },
      ];
    }
    return view;
  }

  // 每周型：从窗口最后一天往前每 7 天一组；周视图按天画
  const parts = m.zones
    ? m.zones.map((z) => ({ name: `区间 ${z}`, color: ZONE_COLORS[z], get: (d) => d.zones[z] }))
    : [{ name: '力量训练', color: COLORS.blue, get: (d) => d.strengthMin }];
  const weekOf = (endIdx) => days.slice(Math.max(0, endIdx - 6), endIdx + 1);
  const total = (list) => list.reduce((sum, d) => sum + (d[m.key] || 0), 0);
  const weeks = [];
  for (let end = last; end >= first; end -= 7) weeks.unshift(weekOf(end).filter((d) => days.indexOf(d) >= first));
  view.weekly = true;
  view.points =
    period === 'W'
      ? win.map((d) => ({ day: d, v: d[m.key] || 0, parts: parts.map((p) => [p.get(d) || 0, p.color]) }))
      : weeks.map((w) => ({ day: w[w.length - 1], from: w[0], v: total(w), parts: parts.map((p) => [w.reduce((s, d) => s + (p.get(d) || 0), 0), p.color]) }));
  const weekTotals = weeks.map(total);
  view.avg = average(weekTotals);
  view.avgLine = period === 'W' ? null : view.avg;
  const prevWeeks = [];
  for (let end = first - 1; end >= Math.max(0, first - len) && prevWeeks.length < weeks.length; end -= 7) prevWeeks.push(total(weekOf(end)));
  const prevAvg = prevWeeks.length ? average(prevWeeks) : null;
  view.change = prevAvg ? Math.round(((view.avg - prevAvg) / prevAvg) * 100) : null;
  view.changeName = { W: '上周', M: '上个月', '6M': '之前 6 个月' }[period];
  // 分布：各区间（或各力量运动）的平均每周时长
  const nWeeks = Math.max(weeks.length, 1);
  if (m.strength) {
    const by = {};
    for (const d of win) for (const [name, v] of Object.entries(strengthBySport(d, workouts))) by[name] = (by[name] || 0) + v;
    view.breakdown = Object.entries(by)
      .sort((a, b) => b[1] - a[1])
      .map(([name, v], i) => ({ name, color: [COLORS.blue, COLORS.light, COLORS.teal, COLORS.purple][i % 4], v: v / nWeeks }));
  } else view.breakdown = parts.map((p) => ({ name: p.name, color: p.color, v: win.reduce((s, d) => s + (p.get(d) || 0), 0) / nWeeks }));
  // 一句话：最近 7 天累计 vs 再往前四周的周平均
  const recent = total(weekOf(last));
  const four = [1, 2, 3, 4].map((k) => last - 7 * k).filter((e) => e - 6 >= 0).map((e) => total(weekOf(e)));
  const fourAvg = four.length ? average(four) : null;
  const label = m.zones ? `在${m.name}` : '力量训练';
  view.summary =
    fourAvg == null
      ? `${offset === 0 ? '近 7 天' : `截至 ${view.to.label} 的 7 天`}你${label}累计 ${formatHm(recent)}。`
      : `${offset === 0 ? '近 7 天' : `截至 ${view.to.label} 的 7 天`}你${label}累计 ${formatHm(recent)}，${Math.abs(recent - fourAvg) < 5 ? '和' : recent > fourAvg ? '高于' : '低于'}前四周的周平均 ${formatHm(fourAvg)}${Math.abs(recent - fourAvg) < 5 ? '差不多' : ''}。`;
  return view;
}

// 趋势视图的图：左侧刻度、可选的常见范围灰带和平均虚线；数字只标最新一个点（周视图每天都标），横轴按周期挑着标
function periodChart(el, view) {
  const m = view.metric;
  const pts = view.points;
  const w = el.clientWidth || 340;
  const l = 34;
  const r = 6;
  const slot = (w - l - r) / pts.length;
  const size = Math.min(10, Math.max(8.5, (w - l) / 30));
  const lh = size + 5;
  const t = lh + 8;
  const ih = 130;
  const h = t + ih + 6 + lh * (view.period === 'W' ? 2 : 1) + 4;
  // 纵轴范围：柱子从 0 开始；折线按数值和常见范围上下留空
  const vals = numbers(pts.map((p) => p.v));
  // 柱子的刻度取整：分钟按 15 / 30 / 60 分钟一格，其余按 1、2、2.5、5 × 10ⁿ；有固定上限的（恢复度 100、负荷 21）按 4 格或 3 格
  const nice = (raw) => {
    const pow = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 2.5, 5, 10].find((k) => raw / pow <= k) * pow;
  };
  let lo = 0;
  let hi;
  let step = null;
  if (view.weekly) {
    const raw = Math.max(60, ...vals, view.avgLine || 0) / 4;
    step = raw <= 15 ? 15 : raw <= 30 ? 30 : Math.ceil(raw / 60) * 60;
    hi = step * 4;
  } else if (m.chart === 'bar') {
    hi = m.max || null;
    step = m.max === 21 ? 7 : m.max ? m.max / 4 : nice(Math.max(1, ...vals) / 4);
    if (!hi) hi = step * Math.ceil(Math.max(1, ...vals) / step);
  } else {
    const span = numbers([...vals, view.band?.lo, view.band?.hi]);
    lo = span.length ? Math.min(...span) : 0;
    hi = span.length ? Math.max(...span) : 1;
    const pad = Math.max((hi - lo) * 0.15, m.minWidth || 1);
    lo -= pad;
    hi += pad;
  }
  const x = (i) => l + slot * (i + 0.5);
  const y = (v) => t + ih - ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * ih;
  const txt = (tx, ty, color, s, anchor = 'middle', bold = false) =>
    `<text x="${tx}" y="${ty}" text-anchor="${anchor}" style="fill:${color};font-size:${size}px${bold ? ';font-weight:700' : ''}">${s}</text>`;
  const fmt = (v) => (view.weekly ? formatHm(v) : trendFormat(m, v));
  let out = '';
  // 常见范围灰带
  if (view.band) out += `<rect x="${l}" y="${y(view.band.hi)}" width="${w - l - r}" height="${Math.max(y(view.band.lo) - y(view.band.hi), 1)}" style="fill:rgba(255,255,255,0.08)"/>`;
  // 刻度 4 格
  const ticks = step ? Math.round((hi - lo) / step) : 4;
  for (let k = 0; k <= ticks; k++) {
    const v = lo + ((hi - lo) * k) / ticks;
    out += `<line x1="${l}" x2="${w - r}" y1="${y(v)}" y2="${y(v)}" stroke="${COLORS.grid}"/>`;
    out += txt(l - 5, y(v) + size * 0.35, '#9aa7ae', view.weekly ? formatHm(v) : m.hm ? formatHm(v * 60) : m.key === 'kcal' ? Math.round(v) : v.toFixed(m.digits && hi - lo < 10 ? 1 : 0), 'end');
  }
  // 柱子或折线
  const barW = Math.max(Math.min(slot * 0.55, 26), 1);
  if (view.weekly) {
    pts.forEach((p, i) => {
      let base = 0;
      for (const [v, color] of p.parts) {
        if (v > 0) out += `<rect x="${x(i) - barW / 2}" y="${y(base + v)}" width="${barW}" height="${Math.max(y(base) - y(base + v), 0.5)}" fill="${color}"/>`;
        base += v;
      }
    });
  } else if (m.chart === 'bar') {
    pts.forEach((p, i) => {
      if (p.v != null) out += `<rect x="${x(i) - barW / 2}" y="${y(p.v)}" width="${barW}" height="${Math.max(y(lo) - y(p.v), 1)}" rx="${barW > 4 ? 2 : 0}" fill="${m.color(p.v)}"/>`;
    });
  } else {
    const line = pts.map((p, i) => (p.v == null ? null : [x(i), y(p.v)])).filter(Boolean);
    if (line.length > 1) {
      out += `<polygon points="${line.map(([a, b]) => `${a},${b}`).join(' ')} ${line[line.length - 1][0]},${y(lo)} ${line[0][0]},${y(lo)}" style="fill:${RECOVERY_LINE};opacity:0.13"/>`;
      out += `<polyline points="${line.map(([a, b]) => `${a},${b}`).join(' ')}" fill="none" stroke="${RECOVERY_LINE}" stroke-width="1.6"/>`;
    }
    if (view.period === 'W') for (const [a, b] of line) out += `<circle cx="${a}" cy="${b}" r="3" fill="#0e1215" stroke="${RECOVERY_LINE}" stroke-width="2"/>`;
  }
  // 平均虚线（每周型）
  if (view.avgLine != null) out += `<line x1="${l}" x2="${w - r}" y1="${y(view.avgLine)}" y2="${y(view.avgLine)}" stroke="#eef2f4" stroke-dasharray="4 3" opacity="0.8"/>`;
  // 顶上一排数字：周视图每天都标，其余只标最新一个有值的点
  const lastIdx = pts.map((p) => p.v != null).lastIndexOf(true);
  pts.forEach((p, i) => {
    if (p.v == null || (view.period !== 'W' && i !== lastIdx)) return;
    const color = view.weekly ? '#eef2f4' : m.color ? m.color(p.v) : RECOVERY_LINE;
    const anchor = view.period === 'W' ? 'middle' : 'end';
    out += txt(view.period === 'W' ? x(i) : Math.min(x(i) + slot / 2, w - r), t - 6, color, fmt(p.v), anchor, i === lastIdx);
    if (view.period !== 'W' && !view.weekly && m.chart === 'line') out += `<circle cx="${x(i)}" cy="${y(p.v)}" r="3" fill="#0e1215" stroke="${RECOVERY_LINE}" stroke-width="2"/>`;
  });
  // 横轴：周视图 星期 + 日期；月视图每周标一次；6 个月只标月份
  const base = t + ih + 6;
  let lastMonth = null;
  let prevEnd = 0;
  pts.forEach((p, i) => {
    const d = p.day;
    if (view.period === 'W') {
      out += txt(x(i), base + lh - 4, '#9aa7ae', weekday(d.start, d.tz));
      out += txt(x(i), base + 2 * lh - 4, '#9aa7ae', d.label);
    } else if (view.period === 'M') {
      if (view.weekly) out += txt(x(i), base + lh - 4, '#9aa7ae', `${p.from.label}起`);
      else if ((pts.length - 1 - i) % 7 === 0) out += txt(Math.max(x(i), l + 12), base + lh - 4, '#9aa7ae', d.label);
    } else {
      const month = Number(d.label.split('/')[0]);
      // 每个月份从当月第一天开始标；离上一个标签太近（或会超出右边）就不标，避免重叠
      const labelW = size * (month >= 10 ? 2.4 : 1.9);
      if (month !== lastMonth && i > 0 && x(i) >= prevEnd + 4 && x(i) + labelW <= w - r + 2) {
        out += txt(x(i), base + lh - 4, '#9aa7ae', `${month}月`, 'start');
        prevEnd = x(i) + labelW;
      }
      lastMonth = month;
    }
  });
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}">${out}</svg>`;
}

/* ---------- 单次运动详情 ---------- */

// 英文名：优先用官方运动列表里的写法，没有就把 API 的 sport_name 整理一下
const SPORT_EN_MAP = new Map(typeof SPORTS_ZH === 'undefined' ? [] : SPORTS_ZH.map(([, en]) => [sportKey(en), en]));

function sportEnglish(name) {
  return SPORT_EN_MAP.get(sportKey(name)) || String(name || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// 图标只分四类：力量、跑步、骑行、其他
function sportGroup(name) {
  const key = sportKey(name);
  if (STRENGTH_SPORTS.has(key)) return 'strength';
  if (/run/.test(key)) return 'run';
  if (/cycl|bik|spin/.test(key)) return 'cycle';
  return 'other';
}

// 手画的线条图标（不是 WHOOP 的图标）
function sportIcon(group, size = 30) {
  const paths = {
    strength: '<path d="M3 12h18M6 8v8M9 6.5v11M15 6.5v11M18 8v8"/>',
    run: '<circle cx="14.5" cy="4.5" r="1.8"/><path d="M13.5 7.5l-3 4 3 2.5-1.5 6M10.5 11.5l-4 1M13.5 7.5l3.5 3 3-1M13.5 14l3.5 2.5"/>',
    cycle: '<circle cx="6" cy="16" r="3.6"/><circle cx="18" cy="16" r="3.6"/><path d="M6 16l4-7h5l3 7M10 9l3.5 7H6M13 6.5h3"/>',
    other: '<path d="M2.5 12h4l2-4.5 3.5 9 2.5-6.5 1.5 2h5.5"/>',
  };
  return `<svg class="sport-icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[group] || paths.other}</svg>`;
}

// 毫秒 → 1:00:08
function formatHms(ms) {
  const s = Math.round((ms || 0) / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const ZONE_KEYS = ['zone_zero_milli', 'zone_one_milli', 'zone_two_milli', 'zone_three_milli', 'zone_four_milli', 'zone_five_milli'];

// 一次运动的基本数字（缺的项是 null）
function workoutNumbers(w) {
  const s = w.score || {};
  const z = s.zone_durations || {};
  const zones = ZONE_KEYS.map((k) => z[k] || 0);
  const total = zones.reduce((a, b) => a + b, 0);
  return {
    strain: s.strain ?? null,
    kcal: s.kilojoule == null ? null : s.kilojoule / 4.184,
    avgHr: s.average_heart_rate ?? null,
    maxHr: s.max_heart_rate ?? null,
    ms: Date.parse(w.end) - Date.parse(w.start),
    distance: s.distance_meter ?? null,
    climb: s.altitude_gain_meter ?? null,
    recorded: s.percent_recorded ?? null,
    zones,
    shares: zones.map((v) => (total ? (v / total) * 100 : 0)),
  };
}

// 同一运动类型、这次之前 30 天内的其他记录：平均值和各区间占比的常见范围（不到 3 次不给范围）
function workoutPeers(w, workouts) {
  const at = Date.parse(w.start);
  const key = sportKey(w.sport_name);
  const peers = workouts.filter((o) => o.id !== w.id && o.score_state === 'SCORED' && sportKey(o.sport_name) === key && Date.parse(o.start) < at && Date.parse(o.start) >= at - 30 * DAY).map(workoutNumbers);
  const avg = (k) => (peers.length ? average(peers.map((p) => p[k])) : null);
  return {
    count: peers.length,
    strain: avg('strain'),
    kcal: avg('kcal'),
    avgHr: avg('avgHr'),
    maxHr: avg('maxHr'),
    ms: avg('ms'),
    distance: avg('distance'),
    climb: avg('climb'),
    ranges: ZONE_KEYS.map((_, i) => (peers.length >= 3 ? [percentile(peers.map((p) => p.shares[i]), 0.1, 3), percentile(peers.map((p) => p.shares[i]), 0.9, 3)] : null)),
  };
}

// 中文解读：主要在哪个区间、比平时同类强还是弱、这一天的负荷和目标的关系
function workoutAdvice(w, peers, day) {
  const n = workoutNumbers(w);
  const main = n.shares.reduce((best, v, i) => (v > n.shares[best] ? i : best), 0);
  const parts = [`这次大部分时间在区间 ${main}（${Math.round(n.shares[main])}%）${main >= 4 ? '，属于高强度' : main >= 2 ? '，以有氧为主' : '，强度偏低'}。`];
  if (n.strain != null && peers.strain != null) {
    const diff = n.strain - peers.strain;
    parts.push(Math.abs(diff) < 1 ? `负荷 ${n.strain.toFixed(1)}，和你近 30 天同类运动的平均（${peers.strain.toFixed(1)}）差不多。` : `负荷 ${n.strain.toFixed(1)}，比你近 30 天同类运动的平均（${peers.strain.toFixed(1)}）${diff > 0 ? '强' : '弱'}一些。`);
  } else if (n.strain != null) {
    parts.push(`负荷 ${n.strain.toFixed(1)}，近 30 天没有同类运动可以比较。`);
  }
  const target = day ? strainTarget(day.recovery) : null;
  if (day?.strain != null && target) {
    const where = day.strain < target[0] ? `还差 ${(target[0] - day.strain).toFixed(1)} 到目标区间` : day.strain > target[1] ? `超过目标上限 ${(day.strain - target[1]).toFixed(1)}` : '在目标区间里';
    parts.push(`这一天总负荷 ${day.strain.toFixed(1)}，目标 ${target[0]}–${target[1]}，${where}${n.strain != null && n.strain >= day.strain * 0.7 ? '，当天的负荷大部分来自这次运动' : ''}。`);
  }
  return parts.join('');
}

/* ---------- 负荷详情 ---------- */

// 今天负荷和目标区间的关系：还差多少、在区间里、超了多少
function strainAdvice(day) {
  const target = strainTarget(day.recovery);
  if (day.strain == null) return '这一天还没有负荷数据。';
  const s = day.strain.toFixed(1);
  if (!target) return `负荷 ${s}。恢复度还没算出来，暂时给不出目标区间。`;
  const [lo, hi] = target;
  const head = `负荷 ${s}，按恢复度 ${day.recovery}%（${recoveryZone(day.recovery).name}）目标区间是 ${lo}–${hi}`;
  if (day.strain < lo) {
    const gap = (lo - day.strain).toFixed(1);
    return day.ongoing
      ? `${head}，还差 ${gap} 才进入区间。今天还没结束，安排一次中高强度运动就能补上（负荷越往上越难涨）。`
      : `${head}，比下限低 ${gap}，这一天偏轻松。`;
  }
  if (day.strain <= hi) {
    const room = (hi - day.strain).toFixed(1);
    return `${head}，已经在区间里${day.ongoing ? `，离上限还有 ${room}，再往上就该收一收了` : ''}。`;
  }
  return `${head}，已经超过上限 ${(day.strain - hi).toFixed(1)}。身体承受的压力比恢复情况建议的多，${day.ongoing ? '今天剩下的时间以休息为主，' : ''}晚上早点睡。`;
}

// 负荷详情页底部的 5 张周趋势图（步数 API 拿不到，省略）
function strainTrendCharts(week) {
  const hm = (m) => formatHm(m || 0);
  const max = (key) => Math.max(1, ...numbers(week.map((d) => d[key]))) * 1.05;
  const zoneStack = (from, to, key) => ({
    rows: [{ text: (d) => hm(d[key]), color: '#eef2f4' }],
    draw: drawStack(Array.from({ length: to - from + 1 }, (_, k) => [(d) => d.zones[from + k], ZONE_COLORS[from + k]]), max(key)),
  });
  const zoneLegend = (from, to) => Array.from({ length: to - from + 1 }, (_, k) => [`区间 ${from + k}`, ZONE_COLORS[from + k]]);
  return [
    {
      id: 'strain',
      title: '负荷 Strain',
      info: 'Strain / Day Strain',
      spec: { rows: [{ text: (d) => (d.strain == null ? null : d.strain.toFixed(1)), color: COLORS.blue }], draw: drawBars((d) => d.strain, 21, COLORS.blue) },
    },
    { id: 'z13', title: '心率区间 1–3 HR Zones 1–3', info: 'Heart Rate Zones', legend: zoneLegend(1, 3), spec: zoneStack(1, 3, 'zLow') },
    { id: 'z45', title: '心率区间 4–5 HR Zones 4–5', info: 'Heart Rate Zones', legend: zoneLegend(4, 5), spec: zoneStack(4, 5, 'zHigh') },
    {
      id: 'kcal',
      title: '热量 Calories（大卡）',
      info: 'Calories / Energy',
      spec: { rows: [{ text: (d) => (d.kcal == null ? null : Math.round(d.kcal).toLocaleString('en-US')), color: COLORS.blue }], draw: drawBars((d) => d.kcal, max('kcal'), COLORS.blue) },
    },
    {
      id: 'str',
      title: '力量训练时长 Strength Activity Time',
      info: 'Strength Activity Time',
      spec: { rows: [{ text: (d) => hm(d.strengthMin), color: '#eef2f4' }], draw: drawBars((d) => d.strengthMin, max('strengthMin'), COLORS.blue) },
    },
  ];
}

// 圆环：value 占 max 的比例，中间写大字和小标签
// band = [起, 止]（和 value 同单位）时，在底色上用浅灰标出这段区间，例如负荷目标
function ring({ value, max, color, big, small, size = 180, stroke = 14, band = null }) {
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const filled = value == null ? 0 : Math.min(value / max, 1) * c;
  const mid = size / 2;
  const bandArc = band
    ? `<circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="rgba(255,255,255,0.30)" stroke-width="${stroke}"
      stroke-dasharray="${((band[1] - band[0]) / max) * c} ${c}" stroke-dashoffset="${(-band[0] / max) * c}" transform="rotate(-90 ${mid} ${mid})"/>`
    : '';
  return `<svg viewBox="0 0 ${size} ${size}">
    <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" style="stroke:var(--ring-track, rgba(255,255,255,0.10))" stroke-width="${stroke}"/>${bandArc}
    <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${filled} ${c}" transform="rotate(-90 ${mid} ${mid})"/>
    <text x="${mid}" y="${mid + size * 0.04}" text-anchor="middle" fill="#eef2f4" font-size="${size * 0.21}" font-weight="700">${big}</text>
    <text x="${mid}" y="${mid + size * 0.2}" text-anchor="middle" fill="${color}" font-size="${size * 0.1}">${small}</text>
  </svg>`;
}

// 一条横向分段条：segments = [[值, 颜色], ...]
function stackBar(segments) {
  const total = segments.reduce((sum, [v]) => sum + (v || 0), 0) || 1;
  return `<div class="stackbar">${segments.map(([v, color]) => `<span style="width:${((v || 0) / total) * 100}%;background:${color}"></span>`).join('')}</div>`;
}
