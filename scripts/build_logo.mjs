// Собирает SVG логотипа G435 Hub: знак «Шкала» + вордмарк Geist в контурах.
// Требует: npm i geist@1.8.1 opentype.js@1.3.4 (рядом со скриптом). Запуск: node build_logo.mjs <папка>
import opentype from 'opentype.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const dir = 'node_modules/geist/dist/fonts/geist-sans/';
const semibold = opentype.loadSync(dir + 'Geist-SemiBold.ttf');
const regular = opentype.loadSync(dir + 'Geist-Regular.ttf');

// Знак на сетке 32: дуга r=9.5 вокруг (16,17), толщина 3; заполнено от левого конца
// 124° (≈ 69% дуги), затем разрыв 16° и короткий хвост до правой чашки.
function arcPoint(deg) { // 0° — левый конец дуги (9 часов), 180° — правый (3 часа)
  const a = Math.PI - (deg * Math.PI) / 180;
  return [16 + 9.5 * Math.cos(a), 17 - 9.5 * Math.sin(a)].map((v) => +v.toFixed(2));
}
const [ax, ay] = arcPoint(0), [bx, by] = arcPoint(124), [cx, cy] = arcPoint(140), [dx, dy] = arcPoint(180);
const MARK = `<path d="M${ax} ${ay}A9.5 9.5 0 0 1 ${bx} ${by}M${cx} ${cy}A9.5 9.5 0 0 1 ${dx} ${dy}" fill="none" stroke="currentColor" stroke-width="3"/>` +
  `<rect x="3" y="16" width="7" height="12" rx="2" fill="currentColor"/><rect x="22" y="16" width="7" height="12" rx="2" fill="currentColor"/>`;

// Фавикон на сетке 16: толщина 2 px, разрыв 2 px, чашки 4×6 по целым пикселям.
function favPoint(deg) { // та же геометрия на сетке 16: центр (8,9), r = 5
  const a = Math.PI - (deg * Math.PI) / 180;
  return [8 + 5 * Math.cos(a), 9 - 5 * Math.sin(a)].map((v) => +v.toFixed(2));
}
const [fa, fb, fc, fd] = [0, 120, 146, 180].map(favPoint);
const FAV = `<path d="M${fa.join(' ')}A5 5 0 0 1 ${fb.join(' ')}M${fc.join(' ')}A5 5 0 0 1 ${fd.join(' ')}" fill="none" stroke="currentColor" stroke-width="2"/>` +
  `<rect x="1" y="8" width="4" height="7" rx="1" fill="currentColor"/><rect x="11" y="8" width="4" height="7" rx="1" fill="currentColor"/>`;

// Вордмарк: «G435» SemiBold + «Hub» Regular. Высота прописных = 12.5 из 32 (≈ высота чашки),
// базовая линия = низ чашек (28). Трекинг −0.02em, пробел сужен до 0.22em.
const capRatio = semibold.tables.os2.sCapHeight / semibold.unitsPerEm;
const size = 12.5 / capRatio;
const tracking = -0.02 * size;
function runPath(font, text, x, y) {
  let d = '';
  let pen = x;
  const glyphs = font.stringToGlyphs(text);
  glyphs.forEach((g, i) => {
    d += g.getPath(pen, y, size).toPathData(2);
    const kern = i < glyphs.length - 1 ? font.getKerningValue(g, glyphs[i + 1]) : 0;
    pen += ((g.advanceWidth + kern) / font.unitsPerEm) * size + tracking;
  });
  return { d, end: pen - tracking };
}
const g = runPath(semibold, 'G435', 40, 28);
const h = runPath(regular, 'Hub', g.end + 0.22 * size, 28);
const width = Math.ceil(h.end + 2);
const WORD = `<path d="${g.d}${h.d}" fill="currentColor"/>`;

const svg = (vb, body, color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" color="${color}">${body}</svg>\n`;
writeFileSync(`${OUT}/logo-mark.svg`, svg('0 0 32 32', `<title>G435 Hub</title>${MARK}`, '#0874ad'));
writeFileSync(`${OUT}/logo-full.svg`, svg(`0 0 ${width} 32`, `<title>G435 Hub</title>${MARK}${WORD}`, '#0874ad'));
writeFileSync(`${OUT}/logo-mono.svg`, svg(`0 0 ${width} 32`, `<title>G435 Hub</title>${MARK}${WORD}`, '#111316'));
writeFileSync(`${OUT}/favicon.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><style>svg{color:#0874ad}@media (prefers-color-scheme:dark){svg{color:#38bdf8}}</style>${FAV}</svg>\n`);
console.log('ok', width, size.toFixed(2));
