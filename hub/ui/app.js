import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (s) => document.querySelector(s);
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
  error: demo === 'off' ? 'гарнитура выключена' : null,
  battery: demo === 'loading' || demo === 'nodongle' ? null : {
    millivolts: demo === 'charging' ? 3905 : 3789, percent: demo === 'charging' ? 71 : 52, at_ms: now - 2 * MIN,
    charging: demo === 'charging', hours_left: demo === 'charging' ? null : 8.6, hours_source: 'trend',
  },
  headphones: demo === 'nodongle' ? null : { volume: 0.58, muted: false },
  microphone: demo === 'nodongle' ? null : { volume: 0.27, muted: false },
  history: demo === 'empty' || demo === 'loading' ? [] : demoHistory,
  settings: { poll_minutes: 15, alert_percent: 15 },
};
const backend = tauri ? {
  invoke: (cmd, args) => tauri.core.invoke(cmd, args),
  onState: (fn) => tauri.event.listen('hub://state', (e) => fn(e.payload)),
  minimize: () => tauri.window.getCurrentWindow().minimize(),
  close: () => tauri.window.getCurrentWindow().close(),
} : {
  invoke: async (cmd) => (cmd === 'get_state' ? demoState : cmd === 'get_autostart' ? false : null),
  onState: () => {},
  minimize: () => {},
  close: () => {},
};

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
    <button class="btn btn--ghost btn--icon" aria-label="Закрыть">${icon('x')}</button>`;
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
  canvas.setAttribute('aria-label', '3D-модель G435. Перетащите, чтобы повернуть');
  const hint = document.createElement('p');
  hint.className = 'stage__hint';
  hint.textContent = 'Перетащите, чтобы повернуть';
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
    setColorway, applyTheme,
  };
})();

// ================================================================ colorways
const COLORWAYS = [
  { id: 'blue', name: 'Blue & Raspberry', note: 'Синий корпус, малиновые амбушюры', chips: ['#2f64d6', '#e0486f'] },
  { id: 'black', name: 'Black & Neon Yellow', note: 'Всё чёрное, неоновые пружинки', chips: ['#1a1b1e', '#cdf019'] },
  { id: 'white', name: 'White & Lilac', note: 'Белый корпус, сиреневые оголовье и амбушюры', chips: ['#ecedf0', '#9caaea'] },
];
let currentColorway = COLORWAYS.some((c) => c.id === store.get('colorway')) ? store.get('colorway') : 'blue';
$('#swatches').innerHTML = COLORWAYS.map((c) => `
  <button class="card card--interactive swatch" role="radio" data-colorway="${c.id}" aria-checked="false">
    <span class="swatch__chips">${c.chips.map((x) => `<i style="background:${x}"></i>`).join('')}</span>
    <span><span class="card__title">${c.name}</span><span class="card__meta">${c.note}</span></span>
  </button>`).join('');
function chooseColorway(id) {
  currentColorway = id;
  store.set('colorway', id);
  $$('[data-colorway]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.colorway === id)));
  stage.setColorway(id);
}
$$('[data-colorway]').forEach((b) => b.addEventListener('click', () => chooseColorway(b.dataset.colorway)));
chooseColorway(currentColorway);

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
const hoursText = (h) => (h < 1 ? `${Math.max(5, Math.round(h * 60))} мин` : `${Math.round(h)} ч`);
function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  return `${Math.floor(s / 3600)} ч назад`;
}
const hhmm = (t) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const leftSource = (b) => (b.charging ? 'по росту напряжения'
  : b.hours_source === 'trend' ? 'по скорости разрядки' : 'по паспорту, до 18 ч');
function connection(s) {
  if (!s.dongle) return { key: 'nodongle', text: 'Донгл не подключён', dot: 'err', badge: 'error' };
  if (s.error && s.error.includes('выключена')) return { key: 'off', text: 'Гарнитура выключена', dot: 'warn', badge: 'warning' };
  return { key: 'ok', text: 'Подключено', dot: 'ok', badge: 'success' };
}

// ================================================================ empty states
function emptyHtml(kind) {
  const E = {
    nodongle: ['usb', 'Донгл не подключён', 'Вставьте приёмник LIGHTSPEED в USB-порт компьютера. Хаб найдёт его сам — ничего нажимать не нужно.', ''],
    off: ['power', 'Гарнитура выключена', 'Нажмите кнопку питания на левой чашке и подождите пару секунд, пока индикатор не загорится.', '<button class="btn" data-action="refresh">Проверить снова</button>'],
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
    ? `${b.percent}%${b.charging ? ' · заряжается' : b.hours_left != null ? ` · ≈ ${hoursText(b.hours_left)}` : ''}` : '';

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
    $('#ov-mv').textContent = `${b.millivolts} мВ · ${ago(b.at_ms)}`;
    $('#ov-left').textContent = c.key === 'off' ? '—' : b.charging ? 'Заряжается' : b.hours_left != null ? `≈ ${hoursText(b.hours_left)}` : '—';
    $('#ov-left-src').textContent = c.key === 'off' ? 'гарнитура выключена' : leftSource(b);
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
    $('#pw-meta').textContent = `${b.millivolts} мВ · обновлено ${ago(b.at_ms)}`;
    $('#pw-left').textContent = c.key === 'off' ? '—' : b.charging ? 'Идёт зарядка' : b.hours_left != null ? `≈ ${hoursText(b.hours_left)}` : '—';
    $('#pw-left-src').textContent = c.key === 'off' ? 'Гарнитура выключена' : leftSource(b);
  }
  $('#pw-charging').hidden = !(b && b.charging);
  $('#pw-deferred').hidden = !s.deferred;
  $('#pw-error').hidden = !s.error || c.key === 'off';
  $('#pw-error-text').textContent = s.error ? `Не удалось прочитать заряд: ${s.error}. Хаб повторит через минуту.` : '';
  const btn = $('#btn-refresh');
  btn.disabled = !s.dongle;
  btn.classList.toggle('is-loading', !!s.reading);
  if ($('[data-page="power"]').classList.contains('is-active')) renderChart(s.history || []);
  $('#hist-count').textContent = s.history && s.history.length
    ? `${s.history.length} ${plural(s.history.length, 'замер', 'замера', 'замеров')} за сутки · хранится 7 дней`
    : 'Хранится 7 дней на этом компьютере';

  // звук
  for (const kind of ['headphones', 'microphone']) renderLevel(kind, s[kind]);
  const hp = s.headphones;
  if (hp && !dragging.ov) {
    const v = Math.round(hp.volume * 100);
    $('#ov-vol').textContent = hp.muted ? 'Без звука' : `${v}%`;
    $('#ov-vol-range').value = v;
    $('#ov-vol-range').style.setProperty('--fill', `${v}%`);
  }
  $('#ov-vol-range').disabled = !hp;

  // настройки
  if (s.settings) {
    setPollUi(s.settings.poll_minutes);
    if (document.activeElement !== $('#alert')) $('#alert').value = s.settings.alert_percent;
  }

  // тосты по завершении ручного чтения
  if (refreshing && prev && prev.reading && !s.reading) {
    refreshing = false;
    if (s.error) toast('Не удалось прочитать заряд', `${capitalize(s.error)}.`, 'error');
    else if (b) toast('Заряд обновлён', `${b.percent}% · ${b.millivolts} мВ`, 'success');
  }
}
const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one
  : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// ---------------------------------------------------------------- уровни звука
const dragging = { headphones: false, microphone: false, ov: false };
function renderLevel(kind, lv) {
  const box = $(`#lv-${kind}`);
  box.classList.toggle('is-unavailable', !lv);
  if (!lv) { $(`#v-${kind}`).textContent = 'Не найдено'; return; }
  const v = Math.round(lv.volume * 100);
  if (!dragging[kind]) {
    $(`#r-${kind}`).value = v;
    $(`#r-${kind}`).style.setProperty('--fill', `${v}%`);
    $(`#v-${kind}`).textContent = lv.muted ? 'Выключен' : `${v}%`;
  }
  box.classList.toggle('is-muted', lv.muted);
  const m = $(`#m-${kind}`);
  m.setAttribute('aria-pressed', String(lv.muted));
  const on = kind === 'headphones' ? 'volume-2' : 'mic';
  const off = kind === 'headphones' ? 'volume-x' : 'mic-off';
  m.innerHTML = icon(lv.muted ? off : on);
  m.setAttribute('aria-label', lv.muted ? 'Включить' : 'Выключить');
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
  if (!tauri) setTimeout(() => toast('Заряд обновлён', '52% · 3789 мВ', 'success'), 600);
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
  $('#chart-title').textContent = hours >= 24 ? 'Заряд за сутки' : `Заряд за ${hours} ${plural(hours, 'час', 'часа', 'часов')}`;
  $('#chart-range').textContent = enough ? `${hhmm(t0)} – ${hhmm(t1)}` : '';
  $('#chart-table tbody').replaceChildren(...points.map(([t, mv]) => {
    const tr = document.createElement('tr');
    for (const v of [hhmm(t), `${Math.round(mvToPercent(mv))}%`, `${mv} мВ`]) {
      const td = document.createElement('td'); td.textContent = v; tr.append(td);
    }
    return tr;
  }));
  if (!enough) return;
  const W = plot.clientWidth, H = plot.clientHeight, padL = 36, padB = 24, padT = 8;
  const x = (t) => padL + ((t - t0) / (t1 - t0)) * (W - padL);
  const y = (p) => padT + (1 - p / 100) * (H - padB - padT);
  chartPts = points.map(([t, mv]) => ({ t, mv, p: mvToPercent(mv), x: x(t), y: y(mvToPercent(mv)) }));
  // Перерыв больше 2 ч (хаб или гарнитура были выключены) — разрыв линии: на нём ничего не измерено.
  const runs = [];
  for (const q of chartPts) {
    const cur = runs.at(-1);
    if (cur && q.t - cur.at(-1).t <= 2 * HOUR) cur.push(q); else runs.push([q]);
  }
  const pts = (run) => run.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
  const grid = [0, 50, 100].map((p) => `<line class="grid" x1="${padL}" x2="${W}" y1="${y(p)}" y2="${y(p)}"/>
    <text class="axis" x="${padL - 8}" y="${y(p) + 4}" text-anchor="end">${p}%</text>`).join('');
  const ticks = [t0, (t0 + t1) / 2, t1].map((t, i) => `<text class="axis" x="${x(t)}" y="${H - 4}"
    text-anchor="${['start', 'middle', 'end'][i]}">${i === 2 ? 'сейчас' : hhmm(t)}</text>`).join('');
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
  $('#tip-time').textContent = `${hhmm(q.t)} · ${q.mv} мВ`;
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
const POLL_LABEL = { 5: 'Каждые 5 минут', 15: 'Каждые 15 минут', 30: 'Каждые 30 минут', 0: 'Только вручную' };
const dd = $('#poll'), ddBtn = dd.querySelector('.dropdown__trigger'), ddItems = [...dd.querySelectorAll('.menu__item')];
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
    toast(on ? 'Автозапуск включён' : 'Автозапуск выключен', on ? 'Хаб будет стартовать в трей вместе с Windows.' : '');
  } catch (e) {
    toast('Не удалось изменить автозапуск', String(e), 'error');
  } finally { autostart.disabled = false; }
});

const modal = $('#modal-clear');
$('#btn-clear').addEventListener('click', () => modal.showModal());
modal.addEventListener('close', () => {
  if (modal.returnValue !== 'confirm') return;
  backend.invoke('clear_history');
  toast('История очищена', 'Оценка «осталось» начнёт считаться заново.', 'success');
});

$('#btn-min').addEventListener('click', () => backend.minimize());
$('#btn-close').addEventListener('click', () => backend.close());

// ================================================================ start
applyTheme(new URLSearchParams(location.search).get('theme') || store.get('theme') || 'system');
route();
backend.onState(render);
backend.invoke('get_state').then((s) => s && render(s));
setInterval(() => lastState && render(lastState), 30000);
