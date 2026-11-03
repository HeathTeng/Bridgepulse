// 本地小服务器：负责 WHOOP 登录、同步数据、提供中文页面（产品名见 public/brand.js）。
// 只监听本机 127.0.0.1，局域网里的其他设备访问不到。
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const whoop = require('./lib/whoop');
const demo = require('./lib/demo');
const BRAND = require('./public/brand');

// .env 的位置：平时就是项目文件夹里的 .env；BRIDGEPULSE_ENV_FILE 只给测试用，指向临时的假文件
const ENV_FILE = process.env.BRIDGEPULSE_ENV_FILE || path.join(__dirname, '.env');
const ENV_EXAMPLE = path.join(__dirname, '.env.example');
loadEnv(ENV_FILE);

let DEMO = process.argv.includes('--demo');
const PORT = Number(process.env.PORT) || 3000;
const config = {
  clientId: process.env.WHOOP_CLIENT_ID,
  clientSecret: process.env.WHOOP_CLIENT_SECRET,
  redirectUri: process.env.WHOOP_REDIRECT_URI || `http://localhost:${PORT}/callback`,
};
// 可选的 AI 改写：OpenAI 兼容的 /chat/completions 接口，三项都在 .env 里填了才开启。密钥只在这里用，不发给页面、不写日志
const ai = {
  baseUrl: (process.env.AI_BASE_URL || '').trim().replace(/\/+$/, ''),
  key: (process.env.AI_API_KEY || '').trim(),
  model: (process.env.AI_MODEL || '').trim(),
};
const AI_TIMEOUT = 30 * 1000;
// 同一天的 AI 结果缓存在内存里，页面要求重新生成时才再请求
const aiCache = new Map();
const CACHE_FILE = path.join(whoop.DATA_DIR, 'cache.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
// 常见问题只写在 docs/FAQ.md 一个文件里，页面从 /faq.md 读
const FAQ_FILE = path.join(__dirname, 'docs', 'FAQ.md');
// 网页大看板自己的小设置（今日建议展开 / 收起），记在 data/widget.json 的 web 里，和桌面小工具分开；示例模式只记在内存里
const PREFS_FILE = path.join(whoop.DATA_DIR, 'widget.json');
let demoPrefs = { adviceOpen: false };

function webPrefs() {
  if (DEMO) return demoPrefs;
  return { adviceOpen: whoop.readJson(PREFS_FILE)?.web?.adviceOpen === true };
}

function saveWebPrefs(prefs) {
  if (DEMO) {
    demoPrefs = { ...demoPrefs, ...prefs };
    return;
  }
  const all = whoop.readJson(PREFS_FILE) || {};
  all.web = { ...all.web, ...prefs };
  try {
    whoop.writeJson(PREFS_FILE, all);
  } catch {
    // 写不进去就算了，只是下次不记得
  }
}
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// 防止伪造的登录回调（OAuth 的 state 校验）
const pendingStates = new Set();

// 读取 .env 文件里的 KEY=VALUE，不依赖第三方库
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

// 填了真正的值（不是 .env.example 里「在这里填…」的提示）才算填了
function filled(value) {
  return Boolean(value && String(value).trim() && !String(value).trim().startsWith('在这里'));
}

function configured() {
  return filled(config.clientId) && filled(config.clientSecret);
}

/* ---------- 设置填写框：把 WHOOP 和 AI 的配置写进 .env ---------- */

// 只认这几个键，别的一律忽略
const SETUP_KEYS = ['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET', 'AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL'];

// 给页面看的只有「填了没有」，任何值都不返回
function setupStatus() {
  return Object.fromEntries(SETUP_KEYS.map((k) => [k, filled(process.env[k])]));
}

// 只替换这几行，别的行和注释原样保留；.env 不存在就照 .env.example 新建；先写临时文件再改名，避免写一半
function writeEnv(values) {
  let text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : fs.existsSync(ENV_EXAMPLE) ? fs.readFileSync(ENV_EXAMPLE, 'utf8') : '';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  for (const [key, value] of Object.entries(values)) {
    const line = new RegExp(`^[ \\t]*${key}[ \\t]*=.*$`, 'm');
    if (line.test(text)) text = text.replace(line, () => `${key}=${value}`);
    else text = `${text}${text && !text.endsWith('\n') ? eol : ''}${key}=${value}${eol}`;
  }
  const tmp = `${ENV_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, ENV_FILE);
}

// 保存后马上在内存里生效，不用重启：这几项按 .env 文件里现在的内容重新读一遍（照 .env.example 新建时也带上例子里的值）
function applyEnv() {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && SETUP_KEYS.includes(match[1])) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  config.clientId = process.env.WHOOP_CLIENT_ID;
  config.clientSecret = process.env.WHOOP_CLIENT_SECRET;
  ai.baseUrl = (process.env.AI_BASE_URL || '').trim().replace(/\/+$/, '');
  ai.key = (process.env.AI_API_KEY || '').trim();
  ai.model = (process.env.AI_MODEL || '').trim();
  aiCache.clear();
}

async function handleSetup(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' });
  if (!fromLocalPage(req)) return sendJson(res, 403, { error: '只接受本机页面的请求' });
  let body;
  try {
    body = JSON.parse(await readBody(req, 8 * 1024));
  } catch {
    return sendJson(res, 400, { error: '请求格式不对' });
  }
  const values = {};
  for (const key of SETUP_KEYS) {
    if (typeof body?.[key] !== 'string') continue;
    const value = body[key].trim();
    // 留空就是不改
    if (!value) continue;
    if (/[\r\n]/.test(value)) return sendJson(res, 400, { error: '内容里不能有换行，请只粘贴一行' });
    values[key] = value;
  }
  if (DEMO) return sendJson(res, 200, { ok: false, demo: true, message: '示例模式不保存', setup: setupStatus() });
  if (!Object.keys(values).length) return sendJson(res, 200, { ok: true, saved: [], setup: setupStatus() });
  try {
    writeEnv(values);
  } catch {
    return sendJson(res, 500, { error: '写不进 .env 文件，请检查文件夹是不是只读' });
  }
  applyEnv();
  return sendJson(res, 200, { ok: true, saved: Object.keys(values), setup: setupStatus() });
}

function aiHost() {
  try {
    const url = new URL(ai.baseUrl);
    return /^https?:$/.test(url.protocol) ? url.host : null;
  } catch {
    return null;
  }
}

function aiEnabled() {
  return !DEMO && Boolean(ai.key && ai.model && aiHost()) && !ai.key.startsWith('在这里');
}

// 只接受本机页面发来的请求：别的网站不能借你的浏览器偷偷调用 AI、消耗额度
function fromLocalPage(req) {
  const local = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
  if (!local.has(req.headers.host)) return false;
  const origin = req.headers.origin;
  if (origin && !local.has(origin.replace(/^http:\/\//, ''))) return false;
  return /^application\/json\b/.test(req.headers['content-type'] || '');
}

function readBody(req, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求内容太大'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const AI_PROMPT = [
  '你是一位懂运动和睡眠的健康助手。用户会给你两样东西：WHOOP 手环最近几天的数字摘要，以及一个小工具按规则生成的今日建议。',
  '请据此用简体中文、自然口语，给出今天怎么练、今晚怎么睡、要留意什么。',
  '要求：总共不超过 200 字；不做医疗诊断，不提药物；数字明显异常时只建议多休息，必要时咨询医生；不要编造摘要里没有的数字；不用 Markdown 标题和列表符号。',
].join('\n');

// 把 AI 服务的 HTTP 状态翻译成中文原因（不转述对方返回的原文，避免把敏感信息带回页面）
function aiError(status) {
  if (status === 401 || status === 403) return '密钥不对或没有权限，请检查 AI_API_KEY';
  if (status === 402) return '账户余额不足';
  if (status === 404) return '接口地址或模型名不对，请检查 AI_BASE_URL 和 AI_MODEL';
  if (status === 400 || status === 422) return '请求被拒绝，常见原因是模型名不对，请检查 AI_MODEL';
  if (status === 429) return '请求太频繁或额度用完了，稍后再试';
  if (status >= 500) return 'AI 服务暂时出错，稍后再试';
  return `AI 服务返回了错误（${status}）`;
}

async function callAi(summary, rules) {
  let res;
  try {
    res = await fetch(`${ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.key}` },
      body: JSON.stringify({
        model: ai.model,
        messages: [
          { role: 'system', content: AI_PROMPT },
          { role: 'user', content: `${summary}\n\n小工具的规则建议：\n${rules}` },
        ],
        max_tokens: 600,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT),
    });
  } catch (err) {
    throw new Error(err.name === 'TimeoutError' ? 'AI 服务 30 秒内没有回应' : `连不上 ${aiHost()}，请检查网络或 AI_BASE_URL`);
  }
  if (!res.ok) throw new Error(aiError(res.status));
  const data = await res.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('AI 没有返回内容');
  return text.trim();
}

async function handleAdvice(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' });
  if (!fromLocalPage(req)) return sendJson(res, 403, { error: '只接受本机页面的请求' });
  if (DEMO) return sendJson(res, 400, { error: '示例模式下不调用 AI' });
  if (!aiEnabled()) return sendJson(res, 400, { error: '还没有在「⚙ 设置」里填写 AI 的接口地址、密钥和模型名' });
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJson(res, 400, { error: err.message === '请求内容太大' ? err.message : '请求格式不对' });
  }
  // 只转发数字摘要和规则建议两段文字，各自限制长度
  const summary = String(body.summary || '').slice(0, 4000);
  const rules = String(body.rules || '').slice(0, 4000);
  const day = String(body.day || '').slice(0, 40);
  if (!summary) return sendJson(res, 400, { error: '没有收到数据摘要' });
  const key = `${day}|${ai.model}`;
  if (!body.refresh && aiCache.has(key)) return sendJson(res, 200, { text: aiCache.get(key), cached: true });
  try {
    const text = await callAi(summary, rules);
    aiCache.set(key, text);
    return sendJson(res, 200, { text });
  } catch (err) {
    return sendJson(res, 502, { error: err.message });
  }
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function serveStatic(res, pathname) {
  const file = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('页面不存在');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/login') {
    if (!configured()) return sendJson(res, 400, { error: '还没有在「⚙ 设置」里填写 Client ID 和 Client Secret。' });
    const state = crypto.randomBytes(16).toString('hex');
    pendingStates.add(state);
    return redirect(res, whoop.authorizeUrl(config, state));
  }

  if (url.pathname === '/callback') {
    const state = url.searchParams.get('state');
    if (url.searchParams.get('error')) {
      return sendJson(res, 400, { error: `WHOOP 拒绝了授权：${url.searchParams.get('error_description') || url.searchParams.get('error')}` });
    }
    if (!pendingStates.delete(state)) {
      return sendJson(res, 400, { error: '登录校验失败，请回到首页重新点击“连接 WHOOP”。' });
    }
    await whoop.exchangeCode(config, url.searchParams.get('code'));
    return redirect(res, '/?synced=0');
  }

  if (url.pathname === '/logout') {
    whoop.clearToken();
    fs.rmSync(CACHE_FILE, { force: true });
    return redirect(res, '/');
  }

  if (url.pathname === '/api/status') {
    return sendJson(res, 200, {
      demo: DEMO,
      configured: configured(),
      loggedIn: DEMO || Boolean(whoop.loadToken()),
      cachedAt: DEMO ? null : whoop.readJson(CACHE_FILE)?.fetched_at || null,
      // 只告诉页面开没开、发到哪个域名，密钥不出服务器
      ai: { enabled: aiEnabled(), host: aiEnabled() ? aiHost() : null },
      // 设置框用：每一项只说填了没有
      setup: setupStatus(),
      // 回调地址不是密钥，设置框里要显示给用户复制
      callback: config.redirectUri,
    });
  }

  if (url.pathname === '/api/setup') return handleSetup(req, res);

  if (url.pathname === '/api/advice') return handleAdvice(req, res);

  if (url.pathname === '/api/prefs') {
    if (req.method === 'GET') return sendJson(res, 200, webPrefs());
    if (req.method !== 'POST' || !fromLocalPage(req)) return sendJson(res, 403, { error: '只接受本机页面的请求' });
    let body;
    try {
      body = JSON.parse(await readBody(req, 1024));
    } catch {
      return sendJson(res, 400, { error: '请求格式不对' });
    }
    saveWebPrefs({ adviceOpen: body.adviceOpen === true });
    return sendJson(res, 200, webPrefs());
  }

  if (url.pathname === '/faq.md') {
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
    return fs.createReadStream(FAQ_FILE).on('error', () => res.end('')).pipe(res);
  }

  if (url.pathname === '/api/data') {
    const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 30, 7), 180);
    if (DEMO) return sendJson(res, 200, demo.generate(days));
    let data = whoop.readJson(CACHE_FILE);
    const refresh = url.searchParams.get('refresh') === '1';
    if (refresh || !data || data.days < days) {
      try {
        data = await sync(days, data);
      } catch (err) {
        const status = { auth: 401, rate: 429, network: 503 }[err.code] || 502;
        return sendJson(res, status, { error: err.message, code: err.code || 'http' });
      }
    }
    return sendJson(res, 200, data);
  }

  return serveStatic(res, url.pathname);
}

// 同一时间只跑一次同步：小工具的定时同步和手动点同步撞在一起时，共用同一个结果
let syncing = null;
function sync(days, cached) {
  if (!syncing) {
    syncing = whoop
      .fetchAll(config, days, cached)
      .then((data) => {
        whoop.writeJson(CACHE_FILE, data);
        return data;
      })
      .finally(() => {
        syncing = null;
      });
  }
  return syncing;
}

// 启动服务器；桌面小工具（electron/main.js）也会调用它
function start({ demo = DEMO } = {}) {
  DEMO = demo;
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      handle(req, res).catch((err) => sendJson(res, 500, { error: err.message }));
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`${BRAND.name} 已启动：http://localhost:${PORT}${DEMO ? '（示例数据模式）' : ''}`);
      if (!DEMO && !configured()) {
        console.log('提示：还没有填写 WHOOP 的 Client ID 和 Secret，打开页面后在「⚙ 设置」里粘贴就行。');
      }
      resolve(`http://127.0.0.1:${PORT}`);
    });
  });
}

module.exports = { start, PORT };

if (require.main === module) {
  start().catch((err) => {
    console.error(err.code === 'EADDRINUSE' ? `端口 ${PORT} 已被占用，可能看板已经在运行了。` : err.message);
    process.exit(1);
  });
}
