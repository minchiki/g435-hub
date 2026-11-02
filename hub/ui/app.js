import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { t, tn, setLang, getLang, locale, applyStatic, guessLang } from './i18n.js';

const $ =(s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const tauri = window.__TAURI__;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const icon = (name) => `<svg class="icon"><use href="icons.svg#i-${name}"/></svg>`;
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } },
};

// ================================================================ backend
// В обычном браузере (предпросмотр) — демо-данные. ?state=nodongle|off|loading|empty|charging
const demo = new URLSearchParams(location.search).get('state');
const now = Date.now(), MIN = 60000;
const demoHistory = [3840, 3832, 3825, 3820, 3812, 3806, 3800, 3797, 3791, 3789]
  .map((mv, i, a) => [now - (a.length - 1 - i) * 30 * MIN, mv]);
const demoState = {
  dongle: demo !== 'nodongle', reading: demo === 'loading', deferred: false,
  error: demo === 'off' ? 'headset_off' : null,
  lang: guessLang(null),
  battery: demo === 'loading' || demo === 'nodongle' ? null : {
    millivolts: demo === 'charging' ? 3905 : 3789, percent: demo === 'charging' ? 71 : 52, at_ms: now - 2 * MIN,
    charging: demo === 'charging', hours_left: demo === 'charging' ? null : 8.6, hours_source: 'trend',
  },
  headphones: demo === 'nodongle' ? null : { volume: 0.58, muted: false },
  microphone: demo === 'nodongle' ? null : { volume: 0.27, muted: false },
  history: demo === 'empty' || demo === 'loading' ? [] : demoHistory,
  settings: { poll_minutes: 15, alert_percent: 15, language: 'auto', auto_update: true },
};
const backend = tauri ? {
  invoke: (cmd, args) => tauri.core.invoke(cmd, args),
  onState: (fn) => tauri.event.listen('hub://state', (e) => fn(e.payload)),
  minimize: () => tauri.window.getCurrentWindow().minimize(),
  close: () => tauri.window.getCurrentWindow().close(),
  version: () => tauri.app.getVersion(),
} : {
  invoke: async (cmd) => (cmd === 'get_state' ? demoState : cmd === 'get_autostart' ? false
    : cmd === 'get_diagnostics' ? 'G435 Hub (preview)\nno backend' : null),
  onState: () => {},
  minimize: () => {},
  close: () => {},
  version: async () => '1.1.0',
};

// Links open in the default browser through the backend (it allows only known https:// prefixes).
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[target="_blank"]');
  if (!a || !tauri) return;
  e.preventDefault();
  backend.invoke('open_url', { url: a.href });
});

// ================================================================ theme
function applyTheme(value) {
  if (value === 'light' || value === 'dark') document.documentElement.dataset.theme = value;
  else delete document.documentElement.dataset.theme;
  $$('[data-theme-value]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeValue === value)));
  stage.applyTheme();
}
$$('[data-theme-value]').forEach((b) => b.addEventListener('click', () => {
  store.set('theme', b.dataset.themeValue);
  applyTheme(b.dataset.themeValue);
}));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => stage.applyTheme());
const isDark = () => getComputedStyle(document.documentElement).colorScheme.includes('dark');

// ================================================================ toasts
function toast(title, text = '', kind = '') {
  const el = document.createElement('div');
  el.className = `toast${kind ? ' toast--' + kind : ''}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  const iconName = kind === 'success' ? 'circle-check' : kind === 'error' ? 'circle-alert' : 'info';
  el.innerHTML = `${icon(iconName)}<div><p class="toast__title"></p><p class="toast__text"></p></div>
    <button class="btn btn--ghost btn--icon" aria-label="${t('toast.close')}">${icon('x')}</button>`;
  el.querySelector('.toast__title').textContent = title;
  el.querySelector('.toast__text').textContent = text;
  const close = () => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 200); };
  el.querySelector('button').addEventListener('click', close);
  $('#toasts').append(el);
  setTimeout(close, kind === 'error' ? 7000 : 4000);
}

// ================================================================ 3D stage
// Одна сцена и один canvas: при смене раздела canvas переезжает в нужный .stage.
const stage = (() => {
  const canvas = document.createElement('canvas');
  const hint = document.createElement('p');
  hint.className = 'stage__hint';
  const setTexts = () => {
    canvas.setAttribute('aria-label', t('stage.aria'));
    hint.textContent = t('stage.hint');
  };
  setTexts();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  // при масштабе 100% рендерим в 1.5× — кромки и мелкие детали заметно чётче; кадр рисуется только по запросу
  renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio, 1.5), 2));
  const anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(2.9, 1.1, 4.9);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-0.6, 7, 1.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -2;
  key.shadow.camera.right = key.shadow.camera.top = 2;
  key.shadow.radius = 6;
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x38bdf8, 1.6);
  rim.position.set(3.5, 2.5, -4);
  scene.add(rim);
  const fill = new THREE.HemisphereLight(0xdfe6f2, 0x101114, 0.4);
  scene.add(fill);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.3 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.08;
  shadow.receiveShadow = true;
  scene.add(shadow);

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: 3.4,
    maxDistance: 10, minPolarAngle: 0.35, maxPolarAngle: 1.62, rotateSpeed: 0.7 });
  controls.target.set(0, -0.08, 0);

  const pivot = new THREE.Group();
  scene.add(pivot);
  let material = null, intro = null, needsFrame = true, visible = false;
  const loader = new THREE.TextureLoader();
  // Копия картинки в памяти страницы после загрузки в видеопамять не нужна — отпускаем её.
  const releaseAfterUpload = (tex) => {
    tex.onUpdate = () => { tex.image?.close?.(); tex.source.data = null; tex.onUpdate = null; };
  };
  const invalidate = () => { needsFrame = true; };
  controls.addEventListener('change', invalidate);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  }
  new ResizeObserver(resize).observe(canvas);

  let last = performance.now();
  function frame(t = performance.now()) {
    requestAnimationFrame(frame);
    const dt = Math.min((t - last) / 1000, 0.05);
    last = t;
    if (!visible || document.hidden) return;
    if (controls.update()) needsFrame = true;
    if (intro) {
      intro.t = Math.min(1, intro.t + dt / 1.2);
      const e = 1 - Math.pow(1 - intro.t, 3);
      pivot.rotation.y = intro.from + (intro.to - intro.from) * e;
      if (intro.t >= 1) intro = null;
      needsFrame = true;
    }
    if (needsFrame) { renderer.render(scene, camera); needsFrame = false; }
  }
  requestAnimationFrame(frame);

  new GLTFLoader().load('assets/g435.glb', (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = 2.3 / Math.max(size.x, size.y, size.z);
    model.position.sub(box.getCenter(new THREE.Vector3())).multiplyScalar(scale);
    model.scale.setScalar(scale);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; material = o.material; } });
    material.metalnessMap.anisotropy = anisotropy;
    releaseAfterUpload(material.metalnessMap);
    pivot.add(model);
    pivot.visible = false; // до первой текстуры расцветки
    setColorway(currentColorway);
  });

  function reveal() {
    const yaw = 0.35;
    pivot.visible = true;
    pivot.rotation.y = reduceMotion ? yaw : yaw - 0.9;
    intro = reduceMotion ? null : { t: 0, from: yaw - 0.9, to: yaw };
  }

  // В памяти живёт только текстура текущей расцветки (2048² ≈ 22 МБ видеопамяти с мипмапами).
  function setColorway(id) {
    if (!material || material.map?.name === id) return;
    loader.load(`assets/base_${id}.jpg`, (tex) => {
      if (currentColorway !== id) return tex.dispose();
      const ref = material.metalnessMap; // общий сэмплер glTF
      Object.assign(tex, { name: id, flipY: ref.flipY, wrapS: ref.wrapS, wrapT: ref.wrapT, anisotropy });
      tex.colorSpace = THREE.SRGBColorSpace;
      releaseAfterUpload(tex);
      material.map?.dispose();
      material.map = tex;
      material.needsUpdate = true;
      if (!pivot.visible) reveal();
      invalidate();
    });
  }

  function applyTheme() {
    const dark = isDark();
    renderer.toneMappingExposure = dark ? 1.05 : 1.0;
    scene.environmentIntensity = dark ? 0.55 : 0.75;
    rim.intensity = dark ? 1.6 : 0.6;
    shadow.material.opacity = dark ? 0.4 : 0.12;
    invalidate();
  }

  return {
    mount(host) {
      if (!host) { visible = false; return; }
      if (canvas.parentElement !== host) { host.prepend(canvas); host.append(hint); }
      visible = true;
      resize();
    },
    setColorway, applyTheme, setTexts,
  };
})();

// ================================================================ colorways
const COLORWAYS = [
  { id: 'blue', name: 'Blue & Raspberry', chips: ['#2f64d6', '#e0486f'] },
  { id: 'black', name: 'Black & Neon Yellow', chips: ['#1a1b1e', '#cdf019'] },
  { id: 'white', name: 'White & Lilac', chips: ['#ecedf0', '#9caaea'] },
];
let currentColorway = COLORWAYS.some((c) => c.id === store.get('colorway')) ? store.get('colorway') : 'blue';
function renderSwatches() {
  $('#swatches').innerHTML = COLORWAYS.map((c) => `
    <button class="card card--interactive swatch" role="radio" data-colorway="${c.id}" aria-checked="${c.id === currentColorway}">
      <span class="swatch__chips">${c.chips.map((x) => `<i style="background:${x}"></i>`).join('')}</span>
      <span><span class="card__title">${c.name}</span><span class="card__meta">${t('look.' + c.id)}</span></span>
    </button>`).join('');
}
function chooseColorway(id) {
  currentColorway = id;
  store.set('colorway', id);
  $$('[data-colorway]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.colorway === id)));
  stage.setColorway(id);
}
$('#swatches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-colorway]');
  if (b) chooseColorway(b.dataset.colorway);
});

// ================================================================ router
const ROUTES = ['overview', 'power', 'sound', 'look', 'controls', 'settings'];
function route() {
  const name = ROUTES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  $$('.page').forEach((p) => p.classList.toggle('is-active', p.dataset.page === name));
  $$('[data-route]').forEach((a) => (a.dataset.route === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  stage.mount($(`[data-page="${name}"] [data-stage]`));
  $('#main').scrollTop = 0;
  if (name === 'power' && lastState) renderChart(lastState.history || []);
}
addEventListener('hashchange', route);

// ================================================================ formatting
const hoursText = (h) => (h < 1 ? t('hours.min', { n: Math.max(5, Math.round(h * 60)) }) : t('hours.h', { n: Math.round(h) }));
function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return t('time.now');
  if (s < 3600) return t('time.min', { n: Math.floor(s / 60) });
  return t('time.hour', { n: Math.floor(s / 3600) });
}
const hhmm = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const leftSource = (b) => t(b.charging ? 'src.charging' : b.hours_source === 'trend' ? 'src.trend' : 'src.spec');
/** Backend error code (hid::Error::code) to a phrase. */
const errText = (code) => (code.startsWith('hid_error:') ? t('err.hid_error', { detail: code.slice(10) })
  : t(`err.${code}`) === `err.${code}` ? code : t(`err.${code}`));
function connection(s) {
  if (!s.dongle) return { key: 'nodongle', text: t('dev.nodongle'), dot: 'err', badge: 'error' };
  if (s.error === 'headset_off') return { key: 'off', text: t('dev.off'), dot: 'warn', badge: 'warning' };
  return { key: 'ok', text: t('dev.ok'), dot: 'ok', badge: 'success' };
}

// ================================================================ empty states
function emptyHtml(kind) {
  const E = {
    nodongle: ['usb', t('empty.nodongle.title'), t('empty.nodongle.text'), ''],
    off: ['power', t('empty.off.title'), t('empty.off.text'), `<button class="btn" data-action="refresh">${t('empty.off.retry')}</button>`],
  }[kind];
  return `<div class="empty"><span class="empty__icon">${icon(E[0]).replace('class="icon"', 'class="icon icon--20"')}</span>
    <h2 class="empty__title">${E[1]}</h2><p class="empty__text">${E[2]}</p>${E[3]}</div>`;
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="refresh"]')) refresh();
});

// ================================================================ render
let lastState = null;
let refreshing = false;

function render(s) {
  const prev = lastState;
  lastState = s;
  const c = connection(s);
  const b = s.battery;

  // сайдбар
  $('#dev-dot').className = `dot dot--${c.dot}`;
  $('#dev-status').textContent = c.text;
  $('#dev-battery').textContent = b && c.key === 'ok'
    ? (b.charging ? t('dev.charging', { p: b.percent })
      : b.hours_left != null ? t('dev.left', { p: b.percent, t: hoursText(b.hours_left) }) : `${b.percent}%`) : '';

  // обзор
  const badge = $('#ov-badge');
  badge.className = `badge badge--${c.badge}`;
  badge.innerHTML = `${icon(c.key === 'ok' ? 'circle-check' : c.key === 'off' ? 'power' : 'unplug')}`;
  badge.append(c.text);
  // без донгла модель закрывает пустое состояние; при выключенной гарнитуре видны последние данные
  const ovEmpty = $('#ov-empty');
  const ovBlank = c.key === 'nodongle' || (c.key === 'off' && !b);
  ovEmpty.hidden = !ovBlank;
  if (ovBlank) ovEmpty.innerHTML = emptyHtml(c.key);
  $('#ov-stats').hidden = c.key === 'nodongle';
  if (b) {
    $('#ov-pct').innerHTML = `${b.percent}<small>%</small>`;
    $('#ov-mv').textContent = t('meta.mv', { mv: b.millivolts, ago: ago(b.at_ms) });
    $('#ov-left').textContent = c.key === 'off' ? '—' : b.charging ? t('stat.charging') : b.hours_left != null ? `≈ ${hoursText(b.hours_left)}` : '—';
    $('#ov-left-src').textContent = c.key === 'off' ? t('stat.off') : leftSource(b);
  } else if (!s.reading) {
    $('#ov-pct').textContent = '—';
    $('#ov-left').textContent = '—';
  }

  // питание
  const pwBlank = c.key === 'nodongle' || (c.key === 'off' && !b);
  $('#power-empty').hidden = !pwBlank;
  $('#power-body').hidden = pwBlank;
  if (pwBlank) $('#power-empty').innerHTML = emptyHtml(c.key);
  $('#pw-off').hidden = c.key !== 'off';
  if (b) {
    $('#pw-pct').textContent = b.percent;
    $('#pw-meta').textContent = t('meta.mv.updated', { mv: b.millivolts, ago: ago(b.at_ms) });
    $('#pw-left').textContent = c.key === 'off' ? '—' : b.charging ? t('pw.charging.now') : b.hours_left != null ? `≈ ${hoursText(b.hours_left)}` : '—';
    $('#pw-left-src').textContent = c.key === 'off' ? t('pw.left.off') : leftSource(b);
  } else {
    $('#pw-left-src').textContent = t('pw.left.none');
  }
  $('#pw-charging').hidden = !(b && b.charging);
  $('#pw-deferred').hidden = !s.deferred;
  $('#pw-error').hidden = !s.error || c.key === 'off';
  $('#pw-error-text').textContent = s.error ? t('pw.error', { err: errText(s.error) }) : '';
  const btn = $('#btn-refresh');
  btn.disabled = !s.dongle;
  btn.classList.toggle('is-loading', !!s.reading);
  if ($('[data-page="power"]').classList.contains('is-active')) renderChart(s.history || []);
  $('#hist-count').textContent = s.history && s.history.length
    ? tn('set.history.count', s.history.length) : t('set.history.hint');

  // звук
  for (const kind of ['headphones', 'microphone']) renderLevel(kind, s[kind]);
  const hp = s.headphones;
  if (hp && !dragging.ov) {
    const v = Math.round(hp.volume * 100);
    $('#ov-vol').textContent = hp.muted ? t('stat.muted') : `${v}%`;
    $('#ov-vol-range').value = v;
    $('#ov-vol-range').style.setProperty('--fill', `${v}%`);
  }
  $('#ov-vol-range').disabled = !hp;

  // настройки
  if (s.settings) {
    setPollUi(s.settings.poll_minutes);
    if (document.activeElement !== $('#alert')) $('#alert').value = s.settings.alert_percent;
    $$('[data-language-value]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.languageValue === s.settings.language)));
    $('#autoupdate').setAttribute('aria-checked', String(!!s.settings.auto_update));
  }

  // тосты по завершении ручного чтения
  if (refreshing && prev && prev.reading && !s.reading) {
    refreshing = false;
    if (s.error) toast(t('toast.failed'), `${capitalize(errText(s.error))}.`, 'error');
    else if (b) toast(t('toast.updated'), t('toast.updated.text', { p: b.percent, mv: b.millivolts }), 'success');
  }
}
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// ---------------------------------------------------------------- уровни звука
const dragging = { headphones: false, microphone: false, ov: false };
function renderLevel(kind, lv) {
  const box = $(`#lv-${kind}`);
  box.classList.toggle('is-unavailable', !lv);
  if (!lv) { $(`#v-${kind}`).textContent = t('snd.notfound'); return; }
  const v = Math.round(lv.volume * 100);
  if (!dragging[kind]) {
    $(`#r-${kind}`).value = v;
    $(`#r-${kind}`).style.setProperty('--fill', `${v}%`);
    $(`#v-${kind}`).textContent = lv.muted ? t(kind === 'headphones' ? 'snd.muted' : 'snd.off') : `${v}%`;
  }
  box.classList.toggle('is-muted', lv.muted);
  const m = $(`#m-${kind}`);
  m.setAttribute('aria-pressed', String(lv.muted));
  const on = kind === 'headphones' ? 'volume-2' : 'mic';
  const off = kind === 'headphones' ? 'volume-x' : 'mic-off';
  m.innerHTML = icon(lv.muted ? off : on);
  m.setAttribute('aria-label', t(lv.muted ? 'snd.unmute' : 'snd.mute'));
}
function bindSlider(range, kind, key = kind) {
  range.addEventListener('pointerdown', () => { dragging[key] = true; });
  addEventListener('pointerup', () => { dragging[key] = false; });
  range.addEventListener('input', () => {
    range.style.setProperty('--fill', `${range.value}%`);
    const out = key === 'ov' ? $('#ov-vol') : $(`#v-${kind}`);
    out.textContent = `${range.value}%`;
    backend.invoke('set_volume', { kind, value: range.value / 100 });
  });
}
bindSlider($('#r-headphones'), 'headphones');
bindSlider($('#r-microphone'), 'microphone');
bindSlider($('#ov-vol-range'), 'headphones', 'ov');
for (const kind of ['headphones', 'microphone']) {
  $(`#m-${kind}`).addEventListener('click', () => {
    backend.invoke('set_mute', { kind, muted: $(`#m-${kind}`).getAttribute('aria-pressed') !== 'true' });
  });
}

// ---------------------------------------------------------------- чтение заряда
function refresh() {
  refreshing = true;
  backend.invoke('refresh_battery');
  if (!tauri) setTimeout(() => toast(t('toast.updated'), t('toast.updated.text', { p: 52, mv: 3789 }), 'success'), 600);
}
$('#btn-refresh').addEventListener('click', refresh);

// ---------------------------------------------------------------- график
// Один ряд: линия 2 px цвета акцента, перекрестье с подсказкой (значение, затем время).
const CURVE = [[4200, 100], [4150, 95], [4100, 90], [4050, 85], [4000, 80], [3950, 75], [3900, 70],
  [3850, 62], [3800, 55], [3750, 41], [3720, 34], [3705, 29], [3700, 27], [3690, 17], [3675, 11],
  [3650, 9], [3600, 7], [3550, 5], [3500, 4], [3450, 2], [3400, 1], [3300, 0]];
function mvToPercent(mv) {
  if (mv >= CURVE[0][0]) return 100;
  for (let i = 0; i < CURVE.length - 1; i++) {
    const [hiMv, hiP] = CURVE[i], [loMv, loP] = CURVE[i + 1];
    if (mv >= loMv) return loP + ((mv - loMv) / (hiMv - loMv)) * (hiP - loP);
  }
  return 0;
}
let chartPts = [];
function renderChart(points) {
  const plot = $('#chart-plot'), svg = $('#chart-svg');
  const enough = points.length >= 2;
  plot.hidden = !enough;
  $('#chart-empty').hidden = enough;
  const HOUR = 3600000, t1 = Date.now();
  const t0 = enough ? Math.min(t1 - HOUR, Math.max(t1 - 24 * HOUR, points[0][0])) : t1 - HOUR;
  const hours = Math.max(1, Math.round((t1 - t0) / HOUR));
  $('#chart-title').textContent = hours >= 24 ? t('chart.day') : tn('chart.hours', hours);
  $('#chart-range').textContent = enough ? `${hhmm(t0)} – ${hhmm(t1)}` : '';
  $('#chart-table tbody').replaceChildren(...points.map(([tm, mv]) => {
    const tr = document.createElement('tr');
    for (const v of [hhmm(tm), `${Math.round(mvToPercent(mv))}%`, `${mv} ${t('unit.mv')}`]) {
      const td = document.createElement('td'); td.textContent = v; tr.append(td);
    }
    return tr;
  }));
  if (!enough) return;
  const W = plot.clientWidth, H = plot.clientHeight, padL = 36, padB = 24, padT = 8;
  const x = (tm) => padL + ((tm - t0) / (t1 - t0)) * (W - padL);
  const y = (p) => padT + (1 - p / 100) * (H - padB - padT);
  chartPts = points.map(([tm, mv]) => ({ t: tm, mv, p: mvToPercent(mv), x: x(tm), y: y(mvToPercent(mv)) }));
  // Перерыв больше 2 ч (хаб или гарнитура были выключены) — разрыв линии: на нём ничего не измерено.
  const runs = [];
  for (const q of chartPts) {
    const cur = runs.at(-1);
    if (cur && q.t - cur.at(-1).t <= 2 * HOUR) cur.push(q); else runs.push([q]);
  }
  const pts = (run) => run.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
  const grid = [0, 50, 100].map((p) => `<line class="grid" x1="${padL}" x2="${W}" y1="${y(p)}" y2="${y(p)}"/>
    <text class="axis" x="${padL - 8}" y="${y(p) + 4}" text-anchor="end">${p}%</text>`).join('');
  const ticks = [t0, (t0 + t1) / 2, t1].map((tm, i) => `<text class="axis" x="${x(tm)}" y="${H - 4}"
    text-anchor="${['start', 'middle', 'end'][i]}">${i === 2 ? t('chart.now') : hhmm(tm)}</text>`).join('');
  const charge = runs.map((run) => run.slice(1).map((q, i) => (q.mv - run[i].mv >= 15
    ? `<line class="line line--charge" x1="${run[i].x}" y1="${run[i].y}" x2="${q.x}" y2="${q.y}"/>` : '')).join('')).join('');
  const body = runs.map((run) => run.length < 2
    ? `<circle class="marker" cx="${run[0].x}" cy="${run[0].y}" r="2.5"/>`
    : `<polygon class="area" points="${run[0].x},${y(0)} ${pts(run)} ${run.at(-1).x},${y(0)}"/>` +
      `<polyline class="line" points="${pts(run)}"/>`).join('');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = grid + ticks + body + charge +
    `<line class="cross" id="cross" y1="${padT}" y2="${y(0)}" visibility="hidden"/>` +
    `<circle class="marker" id="marker" r="4" visibility="hidden"/>`;
}
function chartHover(clientX) {
  if (!chartPts.length) return;
  const r = $('#chart-plot').getBoundingClientRect();
  const px = clientX - r.left;
  const q = chartPts.reduce((a, b) => (Math.abs(b.x - px) < Math.abs(a.x - px) ? b : a));
  const cross = $('#cross'), marker = $('#marker'), tip = $('#chart-tip');
  cross.setAttribute('x1', q.x); cross.setAttribute('x2', q.x); cross.setAttribute('visibility', 'visible');
  marker.setAttribute('cx', q.x); marker.setAttribute('cy', q.y); marker.setAttribute('visibility', 'visible');
  $('#tip-value').textContent = `${Math.round(q.p)}%`;
  $('#tip-time').textContent = `${hhmm(q.t)} · ${q.mv} ${t('unit.mv')}`;
  tip.hidden = false;
  tip.style.left = `${Math.min(Math.max(q.x, 64), r.width - 64)}px`;
  tip.style.top = `${Math.max(0, q.y - 56)}px`;
}
function chartLeave() {
  $('#chart-tip').hidden = true;
  $('#cross')?.setAttribute('visibility', 'hidden');
  $('#marker')?.setAttribute('visibility', 'hidden');
}
$('#chart-plot').addEventListener('pointermove', (e) => chartHover(e.clientX));
$('#chart-plot').addEventListener('pointerleave', chartLeave);
new ResizeObserver(() => lastState && $('[data-page="power"]').classList.contains('is-active') && renderChart(lastState.history || [])).observe($('#chart-plot'));

// ---------------------------------------------------------------- дропдаун опроса
const POLL_LABEL = new Proxy({}, { get: (_, k) => (['5', '15', '30', '0'].includes(String(k)) ? t(`poll.${k}`) : undefined) });
const dd =$('#poll'), ddBtn = dd.querySelector('.dropdown__trigger'), ddItems = [...dd.querySelectorAll('.menu__item')];
let ddActive = -1;
function setPollUi(minutes) {
  const v = String(minutes || 0);
  ddBtn.querySelector('span').textContent = POLL_LABEL[v] || POLL_LABEL[15];
  ddItems.forEach((li) => li.setAttribute('aria-selected', String(li.dataset.value === v)));
}
function ddOpen(open) {
  dd.classList.toggle('is-open', open);
  ddBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    ddActive = Math.max(0, ddItems.findIndex((li) => li.getAttribute('aria-selected') === 'true'));
    ddHighlight();
    dd.querySelector('.menu').focus();
  }
}
function ddHighlight() { ddItems.forEach((li, i) => li.classList.toggle('is-active-desc', i === ddActive)); }
function ddChoose(li) {
  const minutes = Number(li.dataset.value) || null;
  setPollUi(minutes);
  backend.invoke('set_poll', { minutes });
  ddOpen(false);
  ddBtn.focus();
}
ddBtn.addEventListener('click', () => ddOpen(!dd.classList.contains('is-open')));
ddItems.forEach((li, i) => {
  li.addEventListener('click', () => ddChoose(li));
  li.addEventListener('pointermove', () => { ddActive = i; ddHighlight(); });
});
dd.querySelector('.menu').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    ddActive = (ddActive + (e.key === 'ArrowDown' ? 1 : -1) + ddItems.length) % ddItems.length;
    ddHighlight();
  } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ddChoose(ddItems[ddActive]); }
  else if (e.key === 'Escape' || e.key === 'Tab') { ddOpen(false); ddBtn.focus(); }
});
document.addEventListener('pointerdown', (e) => { if (!dd.contains(e.target)) ddOpen(false); });

// ---------------------------------------------------------------- настройки
const alertInput = $('#alert'), alertField = $('#alert-field');
alertInput.addEventListener('input', () => {
  alertInput.value = alertInput.value.replace(/\D/g, '');
  const v = Number(alertInput.value);
  const ok = v >= 5 && v <= 50;
  alertField.classList.toggle('is-invalid', !ok);
  $('#alert-hint').hidden = ok;
  if (ok) backend.invoke('set_alert', { percent: v });
});
alertInput.addEventListener('blur', () => {
  if (alertField.classList.contains('is-invalid') && lastState) {
    alertInput.value = lastState.settings.alert_percent;
    alertField.classList.remove('is-invalid');
    $('#alert-hint').hidden = true;
  }
});

const autostart = $('#autostart');
backend.invoke('get_autostart').then((on) => autostart.setAttribute('aria-checked', String(!!on)));
autostart.addEventListener('click', async () => {
  const on = autostart.getAttribute('aria-checked') !== 'true';
  autostart.disabled = true;
  try {
    await backend.invoke('set_autostart', { enabled: on });
    autostart.setAttribute('aria-checked', String(on));
    toast(t(on ? 'toast.autostart.on' : 'toast.autostart.off'), on ? t('toast.autostart.on.text') : '');
  } catch (e) {
    toast(t('toast.autostart.failed'), String(e), 'error');
  } finally { autostart.disabled = false; }
});

const modal = $('#modal-clear');
$('#btn-clear').addEventListener('click', () => modal.showModal());
modal.addEventListener('close', () => {
  if (modal.returnValue !== 'confirm') return;
  backend.invoke('clear_history');
  toast(t('toast.cleared'), t('toast.cleared.text'), 'success');
});

$('#btn-min').addEventListener('click', () => backend.minimize());
$('#btn-close').addEventListener('click', () => backend.close());

// ---------------------------------------------------------------- язык
// Выбор хранится в бэкенде (трей и уведомления тоже переводятся); в браузере предпросмотра — локально.
function applyLanguage(lang) {
  if (lang === getLang()) return;
  setLang(lang);
  store.set('lang', lang);
  applyStatic();
  stage.setTexts();
  renderSwatches();
  if (lastState) render(lastState);
  renderUpdateUi();
}
$('#language').addEventListener('click', (e) => {
  const b = e.target.closest('[data-language-value]');
  if (!b) return;
  if (tauri) backend.invoke('set_language', { language: b.dataset.languageValue });
  else {
    const v = b.dataset.languageValue;
    demoState.settings.language = v;
    applyLanguage(v === 'auto' ? guessLang(null) : v);
  }
});

// ---------------------------------------------------------------- обновления и диагностика
// Единственное обращение приложения к сети: спросить у GitHub номер последней версии.
let pendingUpdate = null;
let updateState = 'idle'; // idle | checking | latest | available | installing | failed | install-failed
function renderUpdateUi() {
  const status = $('#upd-status'), btn = $('#btn-update');
  const texts = {
    idle: '', checking: t('upd.checking'), latest: t('upd.latest'),
    available: pendingUpdate ? t('upd.available', { v: pendingUpdate.version }) : '',
    installing: t('upd.installing'), failed: t('upd.failed'), 'install-failed': t('upd.install.failed'),
  };
  status.textContent = texts[updateState];
  const canInstall = updateState === 'available' && pendingUpdate;
  btn.textContent = canInstall ? t('upd.install', { v: pendingUpdate.version }) : t('upd.check');
  btn.classList.toggle('btn--primary', !!canInstall);
  btn.classList.toggle('is-loading', updateState === 'checking' || updateState === 'installing');
  btn.disabled = updateState === 'checking' || updateState === 'installing' || !tauri;
}
async function checkForUpdate() {
  if (!tauri?.updater) return;
  updateState = 'checking';
  renderUpdateUi();
  try {
    pendingUpdate = await tauri.updater.check();
    updateState = pendingUpdate ? 'available' : 'latest';
  } catch {
    updateState = 'failed';
  }
  store.set('upd_checked', String(Date.now()));
  renderUpdateUi();
}
async function installUpdate() {
  updateState = 'installing';
  renderUpdateUi();
  try {
    await pendingUpdate.downloadAndInstall(); // Windows закрывает приложение и запускает установщик
  } catch {
    updateState = 'install-failed';
    renderUpdateUi();
  }
}
$('#btn-update').addEventListener('click', () => (updateState === 'available' && pendingUpdate ? installUpdate() : checkForUpdate()));
$('#autoupdate').addEventListener('click', () => {
  const on = $('#autoupdate').getAttribute('aria-checked') !== 'true';
  $('#autoupdate').setAttribute('aria-checked', String(on));
  backend.invoke('set_auto_update', { enabled: on });
});
let autoChecked = false;
function maybeAutoCheck(s) {
  if (autoChecked || !tauri || !s.settings) return;
  autoChecked = true;
  const last = Number(store.get('upd_checked')) || 0;
  if (s.settings.auto_update && Date.now() - last > 24 * 3600 * 1000) checkForUpdate();
}

$('#btn-diag').addEventListener('click', async () => {
  try {
    const text = '```\n' + await backend.invoke('get_diagnostics') + '```';
    try {
      if (tauri) await backend.invoke('copy_text', { text }); // буфер обмена Windows через бэкенд: не зависит от фокуса окна
      else await navigator.clipboard.writeText(text);
    } catch { // запасной путь — через выделение
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (!ok) throw new Error('clipboard unavailable');
    }
    toast(t('diag.copied'), t('diag.copied.text'), 'success');
  } catch (e) {
    toast(t('diag.failed'), String(e), 'error');
  }
});

backend.version().then((v) => { $('#about-version').textContent = v; });

// ================================================================ start
setLang(guessLang(store.get('lang')));
applyTheme(new URLSearchParams(location.search).get('theme') || store.get('theme') || 'system');
applyStatic();
renderSwatches();
route();
renderUpdateUi();
backend.onState((s) => { if (s.lang && s.lang !== getLang()) applyLanguage(s.lang); render(s); maybeAutoCheck(s); });
backend.invoke('get_state').then((s) => {
  if (!s) return;
  if (s.lang && s.lang !== getLang()) applyLanguage(s.lang);
  render(s);
  maybeAutoCheck(s);
});
setInterval(() => lastState && render(lastState), 30000);
