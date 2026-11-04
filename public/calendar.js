// 恢复日历：点顶部的日期，从上面展开一个月历，每天的数字按恢复度区间上色（红 / 黄 / 绿，和恢复圆环同色）。
// 小工具和网页大看板共用；日期和月份的计算在 core.js（calendarIndex / calendarMonths / monthCells）。
// 用法：RecoveryCalendar.open({ days, selected, onPick, top, opener })
//   days：buildDays 的结果；selected：正在看的是第几天；onPick(idx)：选了某一天；top：面板顶边离窗口顶部多少 px；opener：关掉后把焦点还给它

const RecoveryCalendar = (() => {
  let root = null;
  let opts = null;
  let index = null;
  let months = [];
  let month = '';
  let today = '';

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  // 这一天能不能点：有记录、而且不是未来
  function pickable(key) {
    return key <= today && index.has(key);
  }

  function open(o) {
    close(false);
    opts = o;
    index = calendarIndex(o.days);
    today = todayKey();
    months = calendarMonths(o.days);
    const sel = o.days[o.selected]?.date || today;
    month = months.includes(sel.slice(0, 7)) ? sel.slice(0, 7) : months[months.length - 1];

    root = el('div', 'cal-root');
    const dim = el('div', 'cal-dim');
    dim.addEventListener('click', () => close());
    const panel = el('div', 'cal-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', '恢复日历');
    panel.style.top = `${Math.max(0, o.top || 0)}px`;
    panel.addEventListener('keydown', onKey);
    root.append(dim, panel);
    document.body.append(root);
    draw(sel);
  }

  function close(restore = true) {
    if (!root) return;
    root.remove();
    root = null;
    if (restore) opts?.opener?.focus();
  }

  // focusKey：画完把焦点放在哪天；focusStep：翻月后焦点留在「‹」(-1) 或「›」(1) 上，方便连续翻
  function draw(focusKey, focusStep) {
    const panel = root.querySelector('.cal-panel');
    panel.textContent = '';
    const [y, m] = month.split('-').map(Number);
    const at = months.indexOf(month);

    const head = el('div', 'cal-head');
    const prev = el('button', 'cal-step', '‹');
    prev.type = 'button';
    prev.title = '上个月';
    prev.setAttribute('aria-label', '上个月');
    prev.disabled = at <= 0;
    prev.addEventListener('click', () => turn(-1));
    const next = el('button', 'cal-step', '›');
    next.type = 'button';
    next.title = '下个月';
    next.setAttribute('aria-label', '下个月');
    next.disabled = at >= months.length - 1;
    next.addEventListener('click', () => turn(1));
    const title = el('b', 'cal-title', `${y} 年 ${m} 月`);
    title.setAttribute('aria-live', 'polite');
    head.append(prev, title, next);

    const week = el('div', 'cal-week');
    week.setAttribute('aria-hidden', 'true');
    for (const w of ['日', '一', '二', '三', '四', '五', '六']) week.append(el('span', null, w));

    const grid = el('div', 'cal-grid');
    const selKey = opts.days[opts.selected]?.date;
    for (const key of monthCells(month)) {
      if (!key) {
        grid.append(el('span', 'cal-blank'));
        continue;
      }
      const btn = el('button', 'cal-day', String(Number(key.slice(8))));
      btn.type = 'button';
      btn.dataset.key = key;
      const idx = index.get(key);
      const day = idx == null ? null : opts.days[idx];
      const dateText = `${m}月${Number(key.slice(8))}日 ${keyWeekday(key)}`;
      if (!pickable(key)) {
        btn.disabled = true;
        btn.setAttribute('aria-label', `${dateText}，${key > today ? '还没到' : '没有数据'}`);
      } else {
        const zone = day.recovery == null ? null : recoveryZone(day.recovery);
        if (zone) btn.style.color = zone.color;
        btn.classList.add(zone ? 'scored' : 'plain');
        btn.setAttribute('aria-label', `${dateText}，${zone ? `恢复度 ${day.recovery}%，${zone.name}` : '没有恢复度'}`);
        btn.addEventListener('click', () => pick(key));
      }
      if (key === selKey) {
        btn.classList.add('on');
        btn.setAttribute('aria-current', 'date');
      }
      if (key === today) btn.classList.add('cal-today');
      grid.append(btn);
    }

    const legend = el('div', 'cal-legend');
    for (const [name, color] of [['红区', COLORS.red], ['黄区', COLORS.yellow], ['绿区', COLORS.green]]) {
      const item = el('span');
      const dot = el('i');
      dot.style.background = color;
      item.append(dot, name);
      legend.append(item);
    }

    panel.append(head, week, grid, legend);
    // 焦点放在要的那天；那天不在这个月或不能点，就放在这个月最后一个能点的日子，再不行放在翻月按钮
    const stepBtn = focusStep ? (focusStep < 0 ? prev : next) : null;
    const target = (stepBtn && !stepBtn.disabled && stepBtn) || grid.querySelector(`[data-key="${focusKey}"]:not(:disabled)`) || [...grid.querySelectorAll('.cal-day:not(:disabled)')].pop() || head.querySelector('.cal-step:not(:disabled)') || panel;
    if (target === panel) panel.tabIndex = -1;
    target.focus();
  }

  function turn(step) {
    const at = months.indexOf(month) + step;
    if (at < 0 || at >= months.length) return;
    month = months[at];
    draw(null, step);
  }

  function pick(key) {
    const idx = index.get(key);
    const done = opts.onPick;
    close(false);
    done(idx);
    opts?.opener?.focus();
  }

  // 方向键：左右一天、上下一周，跳过不能点的日子，必要时自动翻月；Esc 关掉；Tab 不跑出日历
  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      const items = [...root.querySelectorAll('.cal-panel button:not(:disabled)')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    const from = document.activeElement?.dataset?.key;
    if (!step || !from) return;
    e.preventDefault();
    const first = months[0] + '-01';
    let key = shiftKey(from, step);
    while (key >= first && key <= today && !pickable(key)) key = shiftKey(key, step);
    if (key < first || key > today) return;
    if (key.slice(0, 7) !== month) {
      if (!months.includes(key.slice(0, 7))) return;
      month = key.slice(0, 7);
      draw(key);
    } else {
      root.querySelector(`[data-key="${key}"]`)?.focus();
    }
  }

  return { open, close, isOpen: () => Boolean(root) };
})();
