// WHOOP 官方 API（v2）的授权和数据读取。
// 文档：https://developer.whoop.com/api/
const fs = require('fs');
const path = require('path');

const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const API_BASE = 'https://api.prod.whoop.com/developer';

// offline 用来换取 refresh_token，这样不用每小时重新登录
const SCOPES = [
  'offline',
  'read:profile',
  'read:body_measurement',
  'read:cycles',
  'read:recovery',
  'read:sleep',
  'read:workout',
];

// 源码运行是项目里的 data/，打包版在用户数据文件夹里（见 lib/paths.js）
const DATA_DIR = require('./paths').DATA_DIR;
const TOKEN_FILE = path.join(DATA_DIR, 'token.json');

// 带类型的错误，页面据此显示中文原因：auth 登录过期、network 网络不通、rate 请求太频繁、http 其他
function syncError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// 网络层失败（断网、DNS、超时）统一成"网络不通"
async function send(url, options) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(30 * 1000) });
  } catch {
    throw syncError('network', '网络不通');
  }
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function authorizeUrl(config, state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: SCOPES.join(' '),
    state,
  });
  return `${AUTH_URL}?${params}`;
}

async function requestToken(config, body) {
  const res = await send(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...body,
    }),
  });
  // 不转述返回内容，里面可能带令牌相关信息
  if (res.status === 400 || res.status === 401) throw syncError('auth', '登录过期，请重新连接');
  if (res.status === 429) throw syncError('rate', '请求太频繁，稍后再试');
  if (!res.ok) throw syncError('http', `换取令牌失败（HTTP ${res.status}）`);
  const token = await res.json();
  // 提前 60 秒视为过期，避免请求途中失效
  token.expires_at = Date.now() + (token.expires_in - 60) * 1000;
  writeJson(TOKEN_FILE, token);
  return token;
}

function exchangeCode(config, code) {
  return requestToken(config, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
  });
}

function loadToken() {
  return readJson(TOKEN_FILE);
}

function clearToken() {
  fs.rmSync(TOKEN_FILE, { force: true });
}

async function validToken(config) {
  const token = loadToken();
  if (!token) return null;
  if (Date.now() < token.expires_at) return token;
  if (!token.refresh_token) return null;
  return requestToken(config, {
    grant_type: 'refresh_token',
    refresh_token: token.refresh_token,
    scope: 'offline',
  });
}

// WHOOP 限制每分钟 100 次：每次请求之间至少隔 0.65 秒（约 92 次/分）；遇到 429 等一会儿再试，最多 3 次
const GAP = 650;
let lastRequest = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiGet(token, pathname, query = {}) {
  const url = new URL(API_BASE + pathname);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequest + GAP - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    const res = await send(url, { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (res.status === 429) {
      if (attempt >= 2) throw syncError('rate', '请求太频繁，稍后再试');
      const after = Number(res.headers.get('retry-after'));
      await sleep(Math.min(Number.isFinite(after) && after > 0 ? after * 1000 : 20 * 1000, 60 * 1000));
      continue;
    }
    if (res.status === 401) throw syncError('auth', '登录过期，请重新连接');
    if (!res.ok) throw syncError('http', `读取 ${pathname} 失败（HTTP ${res.status}）`);
    return res.json();
  }
}

// 集合类接口每页最多 25 条，用 nextToken 翻页
async function apiGetAll(token, pathname, start) {
  const records = [];
  let nextToken;
  for (let page = 0; page < 40; page++) {
    const data = await apiGet(token, pathname, { limit: 25, start, nextToken });
    records.push(...(data.records || []));
    nextToken = data.next_token;
    if (!nextToken) break;
  }
  return records;
}

// 增量同步时往回重拉几天：当前还没结束的周期、最近几晚可能被重新评分的睡眠都在这个范围里
const OVERLAP_DAYS = 4;

// 按记录的 id 合并：新拉到的覆盖旧的；恢复度没有自己的 id，用 cycle_id
function merge(old, fresh, key, since) {
  const map = new Map(old.map((r) => [key(r), r]));
  for (const r of fresh) map.set(key(r), r);
  return [...map.values()].filter((r) => Date.parse(r.start || r.created_at) >= since).sort((a, b) => Date.parse(b.start || b.created_at) - Date.parse(a.start || a.created_at));
}

// cached 有效且覆盖了 days 天时只拉最近几天并合并，否则全部重拉
async function fetchAll(config, days, cached = null) {
  const token = await validToken(config);
  if (!token) throw syncError('auth', '登录过期，请重新连接');
  const now = Date.now();
  const since = now - days * 24 * 3600 * 1000;
  const incremental = cached && cached.days >= days && Array.isArray(cached.cycles) && now - Date.parse(cached.fetched_at) < 7 * 24 * 3600 * 1000;
  const from = incremental ? Math.max(since, Date.parse(cached.fetched_at) - OVERLAP_DAYS * 24 * 3600 * 1000) : since;
  const start = new Date(from).toISOString();

  // 依次请求，避免瞬间请求过多触发每分钟 100 次的限额
  const profile = await apiGet(token, '/v2/user/profile/basic');
  const body = await apiGet(token, '/v2/user/measurement/body');
  const cycles = await apiGetAll(token, '/v2/cycle', start);
  const recoveries = await apiGetAll(token, '/v2/recovery', start);
  const sleeps = await apiGetAll(token, '/v2/activity/sleep', start);
  const workouts = await apiGetAll(token, '/v2/activity/workout', start);

  const fresh = { cycles, recoveries, sleeps, workouts };
  const byId = (r) => r.id;
  const keys = { cycles: byId, recoveries: (r) => r.cycle_id, sleeps: byId, workouts: byId };
  const lists = Object.fromEntries(Object.keys(fresh).map((k) => [k, incremental ? merge(cached[k] || [], fresh[k], keys[k], since) : fresh[k]]));
  return {
    fetched_at: new Date().toISOString(),
    days,
    profile,
    body,
    ...lists,
  };
}

module.exports = {
  DATA_DIR,
  authorizeUrl,
  exchangeCode,
  loadToken,
  clearToken,
  fetchAll,
  readJson,
  writeJson,
};
