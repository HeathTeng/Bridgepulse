// 「⚙ 设置」填写框：WHOOP 的 Client ID / Secret，可选的 AI 三项。小工具和网页大看板共用。
// 只把用户这次填了的项发给 /api/setup；服务器只告诉页面「填了没有」，已有的值不会回到页面上。

const Setup = (() => {
  const FIELDS = {
    whoop: [
      { key: 'WHOOP_CLIENT_ID', label: 'Client ID', type: 'text', hint: '粘贴 Client ID' },
      { key: 'WHOOP_CLIENT_SECRET', label: 'Client Secret', type: 'password', hint: '粘贴 Client Secret' },
    ],
    ai: [
      { key: 'AI_BASE_URL', label: '接口地址', type: 'text', hint: 'https://api.deepseek.com' },
      { key: 'AI_API_KEY', label: '密钥', type: 'password', hint: '粘贴 AI 平台的密钥' },
      { key: 'AI_MODEL', label: '模型名', type: 'text', hint: 'deepseek-chat' },
    ],
  };
  const FILLED = '已填写（不显示内容）';

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function field(f, setup) {
    const row = el('label', 's-field');
    row.append(el('span', null, f.label));
    const input = el('input');
    input.type = f.type;
    input.name = f.key;
    input.autocomplete = 'off';
    input.spellcheck = false;
    // 已经填过的不显示内容，留空就是不改
    input.placeholder = setup?.[f.key] ? FILLED : f.hint;
    row.append(input);
    return row;
  }

  // status：/api/status 的结果；onSaved()：保存成功后调用（例如重新读取数据）
  function form(status, onSaved) {
    const setup = status?.setup || {};
    const box = el('form', 's-form');
    box.noValidate = true;
    box.append(el('h3', null, '⚙ 设置'));

    const whoop = el('fieldset', 's-group');
    whoop.append(el('legend', null, 'WHOOP'));
    const callback = status?.callback || `http://localhost:${location.port || 3000}/callback`;
    const tip = el('p', 's-tip');
    tip.append('去 developer.whoop.com 申请，回调地址填 ');
    tip.append(el('code', null, callback));
    const copy = el('button', 's-copy', '复制');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(callback);
        copy.textContent = '已复制';
      } catch {
        copy.textContent = '复制失败，请手动选中';
      }
      setTimeout(() => (copy.textContent = '复制'), 2000);
    });
    tip.append(' ', copy);
    whoop.append(tip, ...FIELDS.whoop.map((f) => field(f, setup)));

    // AI（可选），默认折叠
    const ai = el('details', 's-group s-ai');
    ai.append(el('summary', null, 'AI（可选）'));
    ai.append(el('p', 's-tip', '例子（DeepSeek）：接口地址 https://api.deepseek.com，模型名 deepseek-chat。数据会发到你填的这家公司，按用量收费。'));
    ai.append(...FIELDS.ai.map((f) => field(f, setup)));

    const msg = el('p', 's-msg');
    msg.setAttribute('role', 'status');
    const save = el('button', 's-save', '保存');
    save.type = 'submit';
    const foot = el('div', 's-foot');
    foot.append(save, el('small', null, '只保存在你电脑上的 .env 文件里，不会上传'));
    box.append(whoop, ai, foot, msg);

    box.addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = {};
      for (const input of box.querySelectorAll('input')) if (input.value.trim()) values[input.name] = input.value.trim();
      if (!Object.keys(values).length) {
        msg.textContent = '没有填写新的内容。';
        return;
      }
      save.disabled = true;
      msg.textContent = '正在保存…';
      try {
        const res = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || `保存失败（${res.status}）`);
        if (result.demo) {
          msg.textContent = '示例模式不保存。关掉示例预览，双击「启动桌面小工具」再填。';
          return;
        }
        // 保存成功：清空输入框，已填的显示「已填写」
        for (const input of box.querySelectorAll('input')) {
          input.value = '';
          if (result.setup?.[input.name]) input.placeholder = FILLED;
        }
        msg.textContent = '已保存。';
        onSaved?.(result);
      } catch (err) {
        msg.textContent = err.message === 'Failed to fetch' ? `连不上本机服务器，${PLATFORM_TEXT.serverHint}` : err.message;
      } finally {
        save.disabled = false;
      }
    });
    return box;
  }

  // 用新手引导同一套弹出框（guide.css）打开
  function open(status, onSaved) {
    const root = el('div', 'g-root g-center s-modal');
    const card = el('div', 'g-card s-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', '设置');
    const opener = document.activeElement;
    const close = () => {
      root.remove();
      opener?.focus?.();
    };
    const x = el('button', 's-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', '关闭');
    x.addEventListener('click', close);
    const body = el('div', 'g-body');
    body.append(form(status, onSaved));
    card.append(x, body);
    root.append(card);
    root.addEventListener('keydown', (e) => e.key === 'Escape' && close());
    root.addEventListener('click', (e) => e.target === root && close());
    document.body.append(root);
    card.querySelector('input')?.focus();
    return close;
  }

  return { form, open };
})();
