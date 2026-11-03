// 示例数据：格式和 WHOOP 官方 API v2 一致，用来在没有真实数据时预览看板。
// 数字是随机生成的，不代表任何人的真实健康状况。

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
const SPORTS = ['running', 'functional-fitness', 'cycling', 'weightlifting', 'yoga', 'walking', 'basketball'];

// 固定种子的伪随机数，每次打开看到的示例一样
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function generate(days) {
  const rand = seeded(42);
  // 小睡单独用一个随机数，不打乱原来示例数据的数字
  const napRand = seeded(7);
  // 睡眠阶段比例、清醒时长也单独取随机数，让每晚的结构有变化
  const stageRand = seeded(99);
  // 每次运动的心率区间比例也单独取随机数：负荷越高，区间 4–5 占得越多；轻松的运动几乎没有区间 4–5
  const zoneRand = seeded(23);
  // 距离、爬升、记录完整度也单独取随机数：跑步、骑行、步行有距离；偶尔有一次记录不完整
  const tripRand = seeded(57);
  const trip = (sport, minutes) => {
    const speed = { running: 165, cycling: 380, walking: 85 }[sport];
    if (!speed) return { distance_meter: null, altitude_gain_meter: null, altitude_change_meter: null };
    const climb = Math.round(tripRand() * (sport === 'cycling' ? 220 : 60));
    return { distance_meter: Math.round(minutes * speed * (0.85 + tripRand() * 0.3)), altitude_gain_meter: climb, altitude_change_meter: Math.round(climb * (tripRand() - 0.5)) };
  };
  const zoneSplit = (total, strain) => {
    const w = [
      0.05 + zoneRand() * 0.05,
      0.25 + zoneRand() * 0.25,
      0.15 + zoneRand() * 0.2,
      0.05 + zoneRand() * 0.15,
      strain > 9 ? zoneRand() * 0.2 * (strain / 15) : zoneRand() * 0.02,
      strain > 13 ? zoneRand() * 0.08 : 0,
    ];
    const sum = w.reduce((a, b) => a + b, 0);
    const keys = ['zone_zero_milli', 'zone_one_milli', 'zone_two_milli', 'zone_three_milli', 'zone_four_milli', 'zone_five_milli'];
    return Object.fromEntries(keys.map((k, i) => [k, Math.round((total * w[i]) / sum)]));
  };
  // 睡眠负债按前一晚"需求 - 实际"的缺口累积；前一天的小睡会抵扣当晚的需求
  let debtHours = 0.3;
  let prevNapMilli = 0;
  // 以北京时间早上 7 点（UTC 23 点）作为每天醒来的时间
  const today = new Date();
  today.setUTCHours(23, 0, 0, 0);
  if (today.getTime() > Date.now()) today.setUTCDate(today.getUTCDate() - 1);
  const cycles = [];
  const recoveries = [];
  const sleeps = [];
  const workouts = [];

  for (let i = days - 1; i >= 0; i--) {
    const wake = today.getTime() - i * DAY + (rand() - 0.5) * HOUR;
    const sleepHours = clamp(7 + (rand() - 0.5) * 2.6, 4.5, 9.5);
    const sleepStart = wake - sleepHours * HOUR;
    const cycleId = 1000 + days - i;
    const sleepId = `demo-sleep-${cycleId}`;
    const recovery = Math.round(clamp(55 + (sleepHours - 7) * 14 + (rand() - 0.5) * 50, 8, 99));
    const strain = Number(clamp(8 + rand() * 10, 3, 20.5).toFixed(1));
    const isToday = i === 0;

    cycles.push({
      id: cycleId,
      start: new Date(wake).toISOString(),
      end: isToday ? null : new Date(wake + DAY).toISOString(),
      timezone_offset: '+08:00',
      score_state: 'SCORED',
      score: {
        strain: isToday ? Number((strain * 0.4).toFixed(1)) : strain,
        kilojoule: Math.round(8000 + strain * 300),
        average_heart_rate: Math.round(62 + strain),
        max_heart_rate: Math.round(130 + strain * 3),
      },
    });

    recoveries.push({
      cycle_id: cycleId,
      sleep_id: sleepId,
      created_at: new Date(wake).toISOString(),
      score_state: 'SCORED',
      score: {
        user_calibrating: false,
        recovery_score: recovery,
        resting_heart_rate: Math.round(clamp(58 - recovery / 10 + rand() * 4, 45, 70)),
        hrv_rmssd_milli: Number(clamp(30 + recovery * 0.55 + (rand() - 0.5) * 10, 18, 110).toFixed(1)),
        spo2_percentage: Number((95 + rand() * 3.5).toFixed(1)),
        skin_temp_celsius: Number((33.6 + (rand() - 0.5) * 0.8).toFixed(2)),
      },
    });

    const awakeHours = 0.08 + stageRand() * 0.5;
    const deepShare = 0.15 + stageRand() * 0.11;
    const remShare = 0.17 + stageRand() * 0.11;
    const inBed = (sleepHours + awakeHours) * HOUR;
    const asleep = sleepHours * HOUR;
    const debtNoise = rand();
    const need = {
      baseline_milli: Math.round(7.8 * HOUR),
      need_from_sleep_debt_milli: Math.round((debtHours + debtNoise * 0.15) * HOUR),
      need_from_recent_strain_milli: Math.round(strain * 0.02 * HOUR),
      need_from_recent_nap_milli: Math.round(prevNapMilli * 0.8),
    };
    const needMilli = need.baseline_milli + need.need_from_sleep_debt_milli + need.need_from_recent_strain_milli - need.need_from_recent_nap_milli;
    debtHours = Math.min(1.2, Math.max(0, (needMilli - asleep) / HOUR) * 0.35);
    sleeps.push({
      id: sleepId,
      cycle_id: cycleId,
      start: new Date(sleepStart - awakeHours * HOUR).toISOString(),
      end: new Date(wake).toISOString(),
      timezone_offset: '+08:00',
      nap: false,
      score_state: 'SCORED',
      score: {
        stage_summary: {
          total_in_bed_time_milli: Math.round(inBed),
          total_awake_time_milli: Math.round(inBed - asleep),
          total_no_data_time_milli: 0,
          total_light_sleep_time_milli: Math.round(asleep * (1 - deepShare - remShare)),
          total_slow_wave_sleep_time_milli: Math.round(asleep * deepShare),
          total_rem_sleep_time_milli: Math.round(asleep * remShare),
          sleep_cycle_count: Math.round(sleepHours / 1.5),
          disturbance_count: Math.round(3 + rand() * 10),
        },
        sleep_needed: need,
        respiratory_rate: Number((14.5 + rand()).toFixed(1)),
        sleep_performance_percentage: Math.round(clamp((asleep / needMilli) * 100, 30, 100)),
        sleep_consistency_percentage: Math.round(60 + rand() * 30),
        sleep_efficiency_percentage: Number(((asleep / inBed) * 100).toFixed(1)),
      },
    });

    // 大约三成的日子中午小睡 20–60 分钟；还没发生的不生成
    const napStart = wake + (5 + napRand() * 1.5) * HOUR;
    const napMinutes = 20 + napRand() * 40;
    prevNapMilli = 0;
    if ((napRand() < 0.3 || isToday) && napStart + napMinutes * 60000 < Date.now()) {
      const napMilli = napMinutes * 60000;
      prevNapMilli = napMilli;
      sleeps.push({
        id: `demo-nap-${cycleId}`,
        cycle_id: cycleId,
        start: new Date(napStart).toISOString(),
        end: new Date(napStart + napMilli).toISOString(),
        timezone_offset: '+08:00',
        nap: true,
        score_state: 'SCORED',
        score: {
          stage_summary: {
            total_in_bed_time_milli: Math.round(napMilli),
            total_awake_time_milli: Math.round(napMilli * 0.1),
            total_no_data_time_milli: 0,
            total_light_sleep_time_milli: Math.round(napMilli * 0.7),
            total_slow_wave_sleep_time_milli: Math.round(napMilli * 0.15),
            total_rem_sleep_time_milli: Math.round(napMilli * 0.05),
            sleep_cycle_count: 0,
            disturbance_count: 1,
          },
          sleep_needed: { baseline_milli: 0, need_from_sleep_debt_milli: 0, need_from_recent_strain_milli: 0, need_from_recent_nap_milli: 0 },
          respiratory_rate: 15,
          sleep_performance_percentage: null,
          sleep_consistency_percentage: null,
          sleep_efficiency_percentage: 90,
        },
      });
    }

    if (rand() < 0.6) {
      const start = wake + (9 + rand() * 9) * HOUR;
      const minutes = 25 + rand() * 70;
      const workoutStrain = Number(clamp(5 + rand() * 11, 2, 18).toFixed(1));
      const total = minutes * 60000;
      // 今天还没到的运动不生成（随机数照样取，保持后面的示例数字不变）
      if (start + total < Date.now()) {
        const sport = SPORTS[Math.floor(rand() * SPORTS.length)];
        workouts.push({
          id: `demo-workout-${cycleId}`,
          start: new Date(start).toISOString(),
          end: new Date(start + total).toISOString(),
          timezone_offset: '+08:00',
          sport_name: sport,
          score_state: 'SCORED',
          score: {
            strain: workoutStrain,
            average_heart_rate: Math.round(115 + workoutStrain * 3),
            max_heart_rate: Math.round(150 + workoutStrain * 2),
            kilojoule: Math.round(minutes * 40),
            percent_recorded: tripRand() < 0.1 ? Math.round(78 + tripRand() * 10) : 100,
            ...trip(sport, minutes),
            zone_durations: zoneSplit(total, workoutStrain),
          },
        });
      }
    }
  }

  // 官方接口按时间倒序返回，这里保持一致
  return {
    fetched_at: new Date().toISOString(),
    days,
    demo: true,
    profile: { user_id: 0, email: 'demo@example.com', first_name: '示例', last_name: '用户' },
    body: { height_meter: 1.75, weight_kilogram: 70, max_heart_rate: 195 },
    cycles: cycles.reverse(),
    recoveries: recoveries.reverse(),
    sleeps: sleeps.reverse(),
    workouts: workouts.reverse(),
  };
}

module.exports = { generate };
