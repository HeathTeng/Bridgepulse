// 新手引导的界面：欢迎框、只出现一次的框选引导、💡 帮助卡片和常见问题。
// 文字全部来自 guide.js 和 /faq.md；页面内容一律用 createElement + textContent 生成，不用 innerHTML。
// 小工具和网页大看板共用：Guide.init(选项) 之后，用 Guide.ready() / Guide.help() 打开。

const Guide = (() => {
  let opts = null;
  let root = null;
  let opener = null;
  let faqGroups = null;
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 安全的 Markdown 子集：标题、段落、列表、粗体、https 链接、表格 ---------- */

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  // 行内：**粗体** 和 [文字](https://…)；别的链接（例如 javascript:）和 HTML 标签都当普通文字
  function inline(parent, text) {
    for (const part of String(text).split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/)) {
      if (!part) continue;
      const bold = part.match(/^\*\*([^*]+)\*\*$/);
      const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (bold) parent.append(el('b', null, bold[1]));
      else if (link && /^https:\/\//i.test(link[2])) {
        const a = el('a', null, link[1]);
        a.href = link[2];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        parent.append(a);
      } else parent.append(document.createTextNode(part));
    }
    return parent;
  }

  function parseMd(md) {
    const blocks = [];
    for (const line of String(md).split(/\r?\n/)) {
      const t = line.trim();
      const last = blocks[blocks.length - 1];
      if (!t) blocks.push({ type: 'gap' });
      else if (/^#{1,3}\s/.test(t)) blocks.push({ type: 'h', level: t.match(/^#+/)[0].length, text: t.replace(/^#+\s*/, '') });
      else if (/^-\s/.test(t)) (last?.type === 'ul' ? last : blocks[blocks.push({ type: 'ul', items: [] }) - 1]).items.push(t.slice(2));
      else if (/^\|/.test(t)) {
        if (/^\|[\s:|-]+\|$/.test(t)) continue;
        const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (last?.type === 'table') last.rows.push(cells);
        else blocks.push({ type: 'table', head: cells, rows: [] });
      } else if (last?.type === 'p') last.text += t;
      else blocks.push({ type: 'p', text: t });
    }
    return blocks.filter((b) => b.type !== 'gap');
  }

  function renderMd(md) {
    const frag = document.createDocumentFragment();
    for (const b of parseMd(md)) {
      if (b.type === 'h') frag.append(inline(el(`h${Math.min(b.level + 2, 5)}`), b.text));
      else if (b.type === 'p') frag.append(inline(el('p'), b.text));
      else if (b.type === 'ul') {
        const ul = el('ul');
        for (const item of b.items) ul.append(inline(el('li'), item));
        frag.append(ul);
      } else if (b.type === 'table') {
        const table = el('table');
        const tr = el('tr');
        for (const c of b.head) tr.append(inline(el('th'), c));
        table.append(tr);
        for (const row of b.rows) {
          const r = el('tr');
          for (const c of row) r.append(inline(el('td'), c));
          table.append(r);
        }
        frag.append(table);
      }
    }
    return frag;
  }

  // 卡片页里可以被框选步骤引用的「行」：列表项和表格行（表头不算），按出现顺序编号
  function lines(md) {
    const out = [];
    for (const b of parseMd(md)) {
      if (b.type === 'ul') out.push(...b.items);
      if (b.type === 'table') out.push(...b.rows.map((r) => r.join('：')));
    }
    return out;
  }

  /* ---------- 常见问题：## 大类，### 问题，下面是答案 ---------- */

  function parseFaq(md) {
    const groups = [];
    let q = null;
    for (const line of String(md).split(/\r?\n/)) {
      if (/^##\s/.test(line) && !/^###/.test(line)) groups.push({ title: line.replace(/^##\s*/, ''), items: [] });
      else if (/^###\s/.test(line) && groups.length) groups[groups.length - 1].items.push((q = { q: line.replace(/^###\s*/, ''), a: '' }));
      else if (q && !/^#\s/.test(line)) q.a += `${line}\n`;
    }
    return groups;
  }

  async function loadFaq() {
    if (faqGroups) return faqGroups;
    try {
      const res = await fetch('/faq.md');
      faqGroups = res.ok ? parseFaq(await res.text()) : [];
    } catch {
      faqGroups = [];
    }
    return faqGroups;
  }

  function faqAnswer(question) {
    for (const g of faqGroups || []) for (const item of g.items) if (item.q === question) return item.a.trim();
    return null;
  }

  function faqView() {
    const box = el('div', 'g-faq');
    const search = el('input', 'g-search');
    search.type = 'search';
    search.placeholder = GUIDE.faqSearch.placeholder;
    search.setAttribute('aria-label', GUIDE.faqSearch.placeholder);
    const list = el('div');
    const none = el('p', 'g-sub', GUIDE.faqSearch.none);
    none.hidden = true;
    const entries = [];
    (faqGroups || []).forEach((g, gi) => {
      const group = el('details', 'g-group');
      group.open = gi === 0;
      group.append(el('summary', null, g.title));
      for (const item of g.items) {
        const d = el('details', 'g-q');
        d.open = gi === 0;
        d.append(el('summary', null, item.q));
        const a = el('div', 'g-a');
        a.append(renderMd(item.a));
        d.append(a);
        group.append(d);
        entries.push({ group, d, text: `${item.q} ${item.a}`.toLowerCase(), first: gi === 0 });
      }
      list.append(group);
    });
    // 搜索：只显示相关问题，结果不多时自动展开
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      const hits = entries.filter((e) => !q || e.text.includes(q));
      for (const e of entries) e.d.hidden = !hits.includes(e);
      for (const g of new Set(entries.map((e) => e.group))) {
        g.hidden = !hits.some((e) => e.group === g);
        g.open = q ? !g.hidden : entries.find((e) => e.group === g).first;
      }
      for (const e of hits) e.d.open = q ? hits.length <= 4 : e.first;
      none.hidden = hits.length > 0;
    });
    box.append(search, none, list);
    return box;
  }

  /* ---------- 通用：遮罩、对话框、焦点 ---------- */

  // 从一个框换到下一个框时只换内容，不重复展开 / 收起窗口
  function open(cls) {
    if (root) {
      root.remove();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    } else {
      opener = document.activeElement;
      opts.beforeShow?.();
    }
    root = el('div', `g-root ${cls}`);
    root.addEventListener('keydown', onKey);
    document.body.append(root);
    return root;
  }

  function close() {
    if (!root) return;
    root.remove();
    root = null;
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    opts.afterHide?.();
    // 焦点回到打开前的按钮；没有的话回到「连接 WHOOP」或「💡 帮助」
    const back = opener && opener !== document.body && document.contains(opener) ? opener : document.querySelector('#login') || document.querySelector('#btn-help, #help');
    back?.focus?.();
    opener = null;
  }

  function focusables() {
    return [...root.querySelectorAll('button, a[href], input, summary, [tabindex="0"]')].filter((n) => !n.disabled && n.offsetParent !== null);
  }

  // Tab 只在框里循环；在搜索框里打字时方向键不翻页
  function onKey(e) {
    if (e.key === 'Tab') {
      const f = focusables();
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) (e.preventDefault(), f[f.length - 1].focus());
      else if (!e.shiftKey && i === f.length - 1) (e.preventDefault(), f[0].focus());
      return;
    }
    if (e.target.tagName === 'INPUT' && e.key !== 'Escape') return;
    const act = root?.keys?.[e.key];
    if (act) {
      e.preventDefault();
      act();
    }
  }

  function button(text, cls, onClick) {
    const b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function dialog(cls, label) {
    const card = el('div', `g-card ${cls}`);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', label);
    return card;
  }

  function brandMark() {
    const mark = el('div', 'g-mark');
    mark.setAttribute('aria-hidden', 'true');
    // 手画的标志：一座桥上跳动的脉搏线（不是 WHOOP 的标志）
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 48 48', width: 44, height: 44, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(k, v);
    for (const d of ['M5 34c6-10 32-10 38 0', 'M5 26h9l3-7 5 14 4-10 3 3h14']) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    mark.append(svg);
    return mark;
  }

  /* ---------- 1. 欢迎框 ---------- */

  function welcome() {
    const r = open('g-center');
    const card = dialog('g-welcome', '欢迎');
    const w = GUIDE.welcome;
    const big = el('h2', 'g-big', `${w.lead} `);
    big.append(el('b', 'g-brand', BRAND.name));
    const skip = () => mustKnow(true);
    const start = button(w.start, 'g-primary', () => mustKnow(false));
    const row = el('div', 'g-row');
    row.append(start, button(w.skip, 'g-link', skip));
    card.append(brandMark(), big, el('p', null, w.text), el('p', 'g-sub', w.next), row, el('p', 'g-foot', w.foot));
    r.append(card);
    r.keys = { Escape: skip };
    start.focus();
  }

  /* ---------- 最重要的一条：没有「跳过」 ---------- */

  function mustKnow(skipped) {
    const r = open('g-center');
    const card = dialog('g-must', GUIDE.mustKnow.title);
    const go = () => {
      if (skipped) {
        // 跳过引导：这一张看完就结束，以后不再自动出现
        markSeen('guideSeen');
        markSeen('tourSeen');
        close();
      } else tour();
    };
    const next = button(skipped ? GUIDE.mustKnow.gotIt : GUIDE.mustKnow.next, 'g-primary', go);
    const body = el('div', 'g-body');
    body.append(renderMd(GUIDE.mustKnow.md));
    const row = el('div', 'g-row');
    row.append(next);
    card.append(el('h3', null, GUIDE.mustKnow.title), body, row);
    r.append(card);
    r.keys = { Enter: go };
    next.focus();
  }

  /* ---------- 2. 框选引导 ---------- */

  let steps = [];
  let at = 0;
  let spot = null;
  let bubble = null;

  function pageLines(id) {
    return lines(GUIDE.pages.find((p) => p.id === id)?.md || '');
  }

  // 按当时的页面找目标和文字；找不到就返回 null（这一步跳过）
  function resolve(step) {
    const visible = (n) => n && n.getClientRects().length && n.offsetParent !== null;
    if (step.targets) {
      const found = step.targets.map((sel, i) => [document.querySelector(sel), step.ref[1][i]]).filter(([n]) => visible(n));
      if (!found.length) return null;
      const all = pageLines(step.ref[0]);
      return { nodes: found.map(([n]) => n), text: found.map(([, k]) => all[k]).join('\n') };
    }
    const node = [...document.querySelectorAll(step.target)].find(visible);
    if (!node) return null;
    const text = step.text || (step.faq ? faqAnswer(step.faq) : pageLines(step.ref[0])[step.ref[1]]);
    return text ? { nodes: [node], text } : null;
  }

  async function tour() {
    await loadFaq();
    opts.prepareTour?.();
    // 没连 WHOOP 时只框「连接 WHOOP」和「💡 帮助」；连上以后「连接」按钮本来就不在页面上
    steps = GUIDE.tour.filter((s) => opts.loggedIn() || s.offline).map(resolve).filter(Boolean);
    at = 0;
    const r = open('g-tour');
    r.append(el('div', 'g-block'));
    spot = el('div', 'g-spot');
    bubble = el('div', 'g-bubble');
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-modal', 'true');
    bubble.setAttribute('aria-label', '新手引导');
    r.append(spot, bubble);
    r.keys = { ArrowRight: () => go(1), ArrowLeft: () => go(-1), Escape: endTour };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    if (!steps.length) return endTour();
    show();
  }

  function go(delta) {
    const next = at + delta;
    if (next < 0) return;
    if (next >= steps.length) return endTour();
    at = next;
    show();
  }

  function endTour() {
    markSeen('guideSeen');
    // 没连 WHOOP 时只看到了一部分，连上以后再问一次
    if (opts.loggedIn()) markSeen('tourSeen');
    close();
    opts.afterTour?.();
  }

  function show() {
    const step = steps[at];
    // 目标可能在滚动区里：先滚过去，再马上定位（不等滚动结束）
    step.nodes[0].scrollIntoView({ block: 'nearest', behavior: 'auto' });
    bubble.replaceChildren();
    bubble.append(el('div', 'g-count', `第 ${at + 1} / ${steps.length} 步`));
    for (const line of step.text.split('\n')) bubble.append(inline(el('p'), line));
    if (at === 0) bubble.append(el('p', 'g-sub', GUIDE.firstStepNote));
    const row = el('div', 'g-row');
    const prev = button('上一步', 'g-ghost', () => go(-1));
    prev.disabled = at === 0;
    const next = button(at === steps.length - 1 ? '完成' : '下一步', 'g-primary', () => go(1));
    row.append(prev, next, button('跳过', 'g-link', endTour));
    bubble.append(row);
    place();
    next.focus();
  }

  // 高亮框跟着目标走；气泡放在目标下方，放不下放上方，窗口窄（小工具）时固定在底部或顶部
  function place() {
    if (!spot || !steps[at]) return;
    const rects = steps[at].nodes.map((n) => n.getBoundingClientRect());
    const box = {
      left: Math.min(...rects.map((r) => r.left)) - 4,
      top: Math.min(...rects.map((r) => r.top)) - 4,
      right: Math.max(...rects.map((r) => r.right)) + 4,
      bottom: Math.max(...rects.map((r) => r.bottom)) + 4,
    };
    const vw = innerWidth;
    const vh = innerHeight;
    // 高亮框不超出窗口
    box.left = Math.max(box.left, 2);
    box.right = Math.min(box.right, vw - 2);
    box.top = Math.max(box.top, 2);
    box.bottom = Math.min(box.bottom, vh - 2);
    Object.assign(spot.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.right - box.left}px`, height: `${box.bottom - box.top}px` });
    const bh = bubble.offsetHeight;
    const narrow = vw < 520 || box.bottom - box.top > vh * 0.45;
    bubble.style.left = bubble.style.right = bubble.style.top = bubble.style.bottom = '';
    if (narrow) {
      // 目标在上半部分时气泡贴底，反之贴顶
      if ((box.top + box.bottom) / 2 < vh / 2) bubble.style.bottom = '8px';
      else bubble.style.top = '8px';
      bubble.style.left = '8px';
      bubble.style.right = '8px';
    } else {
      bubble.style.left = `${Math.min(Math.max(box.left, 8), vw - bubble.offsetWidth - 8)}px`;
      bubble.style.top = `${box.bottom + 10 + bh < vh ? box.bottom + 10 : Math.max(box.top - bh - 10, 8)}px`;
    }
  }

  function askTour() {
    const r = open('g-center');
    const card = dialog('g-ask', GUIDE.askTour.text);
    const yes = button(GUIDE.askTour.yes, 'g-primary', () => {
      markSeen('tourSeen');
      tour();
    });
    const no = () => {
      markSeen('tourSeen');
      close();
    };
    const row = el('div', 'g-row');
    row.append(yes, button(GUIDE.askTour.no, 'g-link', no));
    card.append(brandMark(), el('p', 'g-big-sm', GUIDE.askTour.text), row);
    r.append(card);
    r.keys = { Escape: no };
    yes.focus();
  }

  /* ---------- 3. 💡 帮助卡片 ---------- */

  async function help(pageId) {
    await loadFaq();
    let page = Math.max(0, GUIDE.pages.findIndex((p) => p.id === pageId));
    const r = open('g-center');
    const card = dialog('g-help', '帮助');
    r.append(card);
    const render = () => {
      const p = GUIDE.pages[page];
      const head = el('div', 'g-head');
      head.append(el('span', 'g-count', `💡 帮助 · ${page + 1} / ${GUIDE.pages.length}`), button('×', 'g-x', close));
      head.lastChild.setAttribute('aria-label', '关闭');
      const body = el('div', 'g-body');
      body.append(el('h3', null, p.title));
      if (p.mustKnow) body.append(renderMd(GUIDE.mustKnow.md));
      if (p.md) body.append(renderMd(p.md));
      if (p.replay && opts.mode === 'widget') body.append(button(p.replay, 'g-link g-replay', () => (close(), tour())));
      if (p.faq) body.append(faqView());
      const foot = el('div', 'g-row g-foot-row');
      const prev = button('上一页', 'g-ghost', () => turn(-1));
      prev.disabled = page === 0;
      const last = page === GUIDE.pages.length - 1;
      const next = button(last ? p.done : '下一页', 'g-primary', () => (last ? close() : turn(1)));
      foot.append(prev, next);
      if (!last) foot.append(button('常见问题', 'g-link', () => ((page = GUIDE.pages.length - 1), render())));
      card.replaceChildren(head, body, foot);
      next.focus();
    };
    const turn = (d) => {
      page = Math.min(Math.max(page + d, 0), GUIDE.pages.length - 1);
      render();
    };
    r.keys = { Escape: close, ArrowRight: () => turn(1), ArrowLeft: () => turn(-1) };
    render();
  }

  /* ---------- 记住看过了 ---------- */

  function markSeen(key) {
    if (opts.seen[key]) return;
    opts.seen[key] = true;
    opts.save?.(key);
  }

  return {
    // options: { mode: 'widget' | 'web', seen: { guideSeen, tourSeen }, save(key), loggedIn(), beforeShow(), afterHide(), prepareTour(), afterTour() }
    init(options) {
      opts = options;
    },
    // 页面准备好以后调用：第一次打开显示欢迎框；第一次连上并且有数据时问一次要不要看功能
    ready() {
      if (root || !opts) return;
      if (!opts.seen.guideSeen) welcome();
      else if (!opts.seen.tourSeen && opts.loggedIn()) loadFaq().then(askTour);
    },
    help,
    tour,
    // 给测试和常见问题页用
    renderMd,
    parseFaq,
    get open() {
      return Boolean(root);
    },
  };
})();
