// Interface strings. English is the source language; Russian is the second translation.
// Static text in index.html carries data-i18n="key" (textContent), data-i18n-html="key" (markup from
// this file only) and data-i18n-attr="attr:key;attr:key". Plural entries are arrays: English
// [one, other], Russian [one, few, many]. {name} placeholders are filled by t().

const en = {
  'win.minimize': 'Minimize',
  'win.close': 'Close to tray',
  'win.close.title': 'Close. The battery stays in the tray',
  'nav.label': 'Sections',
  'nav.overview': 'Overview',
  'nav.power': 'Power',
  'nav.sound': 'Sound',
  'nav.look': 'Appearance',
  'nav.controls': 'Controls',
  'nav.settings': 'Settings',

  'dev.searching': 'Looking for the dongle…',
  'dev.nodongle': 'Dongle not connected',
  'dev.off': 'Headset is off',
  'dev.ok': 'Connected',
  'dev.charging': '{p}% · charging',
  'dev.left': '{p}% · about {t}',

  'ov.lead': 'LIGHTSPEED wireless headset',
  'stat.charge': 'Charge',
  'stat.left': 'Time left',
  'stat.volume': 'Volume',
  'stat.volume.aria': 'Headphone volume',
  'stat.charging': 'Charging',
  'stat.off': 'headset is off',
  'stat.muted': 'Muted',
  'meta.mv': '{mv} mV · {ago}',
  'meta.mv.updated': '{mv} mV · updated {ago}',
  'src.charging': 'from the voltage rise',
  'src.trend': 'from the discharge rate',
  'src.spec': 'from the nominal 18 h',

  'pw.title': 'Power',
  'pw.lead': 'The headset reports only its voltage; the percentage is an estimate from the discharge curve.',
  'pw.charging': 'Charging',
  'pw.charging.now': 'Charging now',
  'pw.refresh': 'Refresh battery',
  'pw.off': 'The headset is off, so the last reading is shown. Switch it on and the charge updates by itself.',
  'pw.deferred': 'Audio is playing, so the scheduled read waits for a pause (30 minutes at most). “Refresh battery” reads right away.',
  'pw.error': 'Could not read the battery: {err}. The hub will try again in a minute.',
  'pw.left': 'Time left',
  'pw.left.none': 'The estimate appears after the first reading',
  'pw.left.off': 'The headset is off',
  'pw.poll': 'Auto-refresh',
  'pw.poll.hint': 'After 20 minutes without audio it reads once an hour, so the headset can switch itself off',
  'poll.5': 'Every 5 minutes',
  'poll.15': 'Every 15 minutes',
  'poll.30': 'Every 30 minutes',
  'poll.0': 'Manually only',

  'chart.day': 'Battery over the last 24 hours',
  'chart.hours': ['Battery over the last {n} hour', 'Battery over the last {n} hours'],
  'chart.empty': 'The chart appears after the second reading. By default the battery is read every 15 minutes.',
  'chart.caption': 'Battery readings',
  'chart.time': 'Time',
  'chart.charge': 'Charge',
  'chart.voltage': 'Voltage',
  'chart.now': 'now',

  'snd.title': 'Sound',
  'snd.lead': 'Volume of the G435 devices in Windows. The buttons on the ear cup change the same level.',
  'snd.hp': 'Headphones',
  'snd.volume': 'Volume',
  'snd.hp.aria': 'Headphone volume',
  'snd.mic': 'Microphone',
  'snd.rec': 'Recording level',
  'snd.mic.aria': 'Microphone level',
  'snd.note': 'The mute button on the headset silences the microphone inside it and does not tell the computer, so its state is not visible here.',
  'snd.notfound': 'Not found',
  'snd.muted': 'Muted',
  'snd.off': 'Off',
  'snd.mute': 'Mute',
  'snd.unmute': 'Unmute',

  'look.title': 'Appearance',
  'look.lead': 'The model colour in the app. The headset itself is not changed.',
  'look.aria': 'Colourway',
  'look.blue': 'Blue shell, raspberry cushions',
  'look.black': 'All black, neon springs',
  'look.white': 'White shell, lilac headband and cushions',
  'stage.hint': 'Drag to rotate',
  'stage.aria': '3D model of the G435. Drag to rotate',

  'ctl.title': 'Controls',
  'ctl.lead': 'These features live in the headset firmware and are set only with its buttons.',
  'ctl.power': 'Power',
  'ctl.power.text': 'A short press: the LED colour shows the charge. Green <span class="nowrap">31–100%</span>, red <span class="nowrap">15–30%</span>, flashing red under 15%.',
  'ctl.mute2.text': 'Turn sidetone on or off.',
  'ctl.mutevol.text': 'Sidetone volume.',
  'ctl.limit.text': 'Volume limiter: 85 or 100 dB.',
  'ctl.3s': '3 s',
  'ctl.note': 'With no activity the headset switches itself off after 30 minutes.',

  'set.title': 'Settings',
  'set.lead': 'The hub keeps running in the tray when the window is closed.',
  'set.general': 'General',
  'set.theme': 'Theme',
  'theme.system': 'System',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'set.lang': 'Language',
  'lang.auto': 'System',
  'set.autostart': 'Start with Windows',
  'set.autostart.hint': 'Straight to the tray, no window',
  'set.notifications': 'Notifications',
  'set.alert': 'Warn about low battery',
  'set.alert.hint': 'One more notification arrives at 5%',
  'set.alert.sr': 'Threshold, percent',
  'set.alert.invalid': 'From 5 to 50',
  'set.data': 'Data',
  'set.history': 'Battery history',
  'set.history.hint': 'Kept for 7 days on this computer',
  'set.history.count': ['{n} reading in the last 24 hours · kept for 7 days', '{n} readings in the last 24 hours · kept for 7 days'],
  'set.clear': 'Clear',
  'set.updates': 'Updates',
  'set.autoupdate': 'Check automatically',
  'upd.title': 'Check for updates',
  'set.autoupdate.hint': 'When the window opens. This is the only time the app uses the network: it asks github.com for the latest version number.',
  'upd.check': 'Check now',
  'upd.checking': 'Checking…',
  'upd.latest': 'You have the latest version.',
  'upd.available': 'Version {v} is available.',
  'upd.install': 'Install {v}',
  'upd.installing': 'Downloading and installing…',
  'upd.failed': 'Could not check for updates.',
  'upd.install.failed': 'The update failed.',
  'set.support': 'Support',
  'set.diag': 'Diagnostics',
  'set.diag.hint': 'Versions and the last readings, no personal data. Paste it into a bug report.',
  'set.diag.copy': 'Copy',
  'set.issue': 'Report a problem',
  'set.issue.hint': 'Opens GitHub in your browser',
  'set.issue.open': 'Open',
  'diag.copied': 'Diagnostics copied',
  'diag.copied.text': 'Paste it into your bug report.',
  'diag.failed': 'Could not copy',
  'set.about': 'About',
  'about.version': 'Version',
  'about.protocol': 'Battery protocol',
  'about.model': '3D model',
  'about.fonts': 'Font and icons',
  'about.note': 'Unofficial program, not affiliated with Logitech.',

  'modal.clear.title': 'Clear the battery history?',
  'modal.clear.text': 'The chart and the “time left” estimate start over. The current charge does not change.',
  'modal.cancel': 'Cancel',
  'toast.close': 'Close',
  'toast.updated': 'Battery updated',
  'toast.updated.text': '{p}% · {mv} mV',
  'toast.failed': 'Could not read the battery',
  'toast.autostart.on': 'Start with Windows is on',
  'toast.autostart.on.text': 'The hub will start in the tray with Windows.',
  'toast.autostart.off': 'Start with Windows is off',
  'toast.autostart.failed': 'Could not change start with Windows',
  'toast.cleared': 'History cleared',
  'toast.cleared.text': 'The “time left” estimate starts over.',

  'err.headset_off': 'the headset is off',
  'err.dongle_missing': 'the dongle is not connected',
  'err.no_reply': 'the headset did not reply',
  'err.hid_error': 'a USB error ({detail})',

  'empty.nodongle.title': 'Dongle not connected',
  'empty.nodongle.text': 'Plug the LIGHTSPEED receiver into a USB port. The hub finds it by itself, there is nothing to click.',
  'empty.off.title': 'Headset is off',
  'empty.off.text': 'Press the power button on the left ear cup and wait a couple of seconds until the LED lights up.',
  'empty.off.retry': 'Check again',

  'unit.mv': 'mV',
  'time.now': 'just now',
  'time.min': '{n} min ago',
  'time.hour': '{n} h ago',
  'hours.min': '{n} min',
  'hours.h': '{n} h',
};

const ru = {
  'win.minimize': 'Свернуть',
  'win.close': 'Закрыть в трей',
  'win.close.title': 'Закрыть. Заряд останется в трее',
  'nav.label': 'Разделы',
  'nav.overview': 'Обзор',
  'nav.power': 'Питание',
  'nav.sound': 'Звук',
  'nav.look': 'Внешний вид',
  'nav.controls': 'Управление',
  'nav.settings': 'Настройки',

  'dev.searching': 'Поиск донгла…',
  'dev.nodongle': 'Донгл не подключён',
  'dev.off': 'Гарнитура выключена',
  'dev.ok': 'Подключено',
  'dev.charging': '{p}% · заряжается',
  'dev.left': '{p}% · ≈ {t}',

  'ov.lead': 'Беспроводная гарнитура LIGHTSPEED',
  'stat.charge': 'Заряд',
  'stat.left': 'Осталось',
  'stat.volume': 'Громкость',
  'stat.volume.aria': 'Громкость наушников',
  'stat.charging': 'Заряжается',
  'stat.off': 'гарнитура выключена',
  'stat.muted': 'Без звука',
  'meta.mv': '{mv} мВ · {ago}',
  'meta.mv.updated': '{mv} мВ · обновлено {ago}',
  'src.charging': 'по росту напряжения',
  'src.trend': 'по скорости разрядки',
  'src.spec': 'по паспорту, до 18 ч',

  'pw.title': 'Питание',
  'pw.lead': 'Гарнитура сообщает только напряжение, процент — оценка по кривой разрядки.',
  'pw.charging': 'Заряжается',
  'pw.charging.now': 'Идёт зарядка',
  'pw.refresh': 'Обновить заряд',
  'pw.off': 'Гарнитура выключена — показан последний замер. Включите её, и заряд обновится сам.',
  'pw.deferred': 'В наушниках играет звук — плановое чтение ждёт паузы, но не дольше 30 минут. Кнопка «Обновить заряд» читает сразу.',
  'pw.error': 'Не удалось прочитать заряд: {err}. Хаб повторит через минуту.',
  'pw.left': 'Осталось',
  'pw.left.none': 'Оценка появится после первого замера',
  'pw.left.off': 'Гарнитура выключена',
  'pw.poll': 'Автоопрос',
  'pw.poll.hint': 'Если звука нет больше 20 минут — раз в час, чтобы гарнитура могла выключиться',
  'poll.5': 'Каждые 5 минут',
  'poll.15': 'Каждые 15 минут',
  'poll.30': 'Каждые 30 минут',
  'poll.0': 'Только вручную',

  'chart.day': 'Заряд за сутки',
  'chart.hours': ['Заряд за {n} час', 'Заряд за {n} часа', 'Заряд за {n} часов'],
  'chart.empty': 'График появится после второго замера. По умолчанию заряд читается раз в 15 минут.',
  'chart.caption': 'Замеры заряда',
  'chart.time': 'Время',
  'chart.charge': 'Заряд',
  'chart.voltage': 'Напряжение',
  'chart.now': 'сейчас',

  'snd.title': 'Звук',
  'snd.lead': 'Громкость устройств G435 в Windows. Кнопки на чашке меняют её же.',
  'snd.hp': 'Наушники',
  'snd.volume': 'Громкость',
  'snd.hp.aria': 'Громкость наушников',
  'snd.mic': 'Микрофон',
  'snd.rec': 'Уровень записи',
  'snd.mic.aria': 'Уровень микрофона',
  'snd.note': 'Кнопка mute на гарнитуре глушит микрофон внутри неё и не сообщает об этом компьютеру, поэтому её состояние здесь не видно.',
  'snd.notfound': 'Не найдено',
  'snd.muted': 'Без звука',
  'snd.off': 'Выключен',
  'snd.mute': 'Выключить',
  'snd.unmute': 'Включить',

  'look.title': 'Внешний вид',
  'look.lead': 'Цвет модели в приложении. На гарнитуру не влияет.',
  'look.aria': 'Расцветка',
  'look.blue': 'Синий корпус, малиновые амбушюры',
  'look.black': 'Всё чёрное, неоновые пружинки',
  'look.white': 'Белый корпус, сиреневые оголовье и амбушюры',
  'stage.hint': 'Перетащите, чтобы повернуть',
  'stage.aria': '3D-модель G435. Перетащите, чтобы повернуть',

  'ctl.title': 'Управление',
  'ctl.lead': 'Эти функции живут в прошивке и настраиваются только кнопками на гарнитуре.',
  'ctl.power': 'Питание',
  'ctl.power.text': 'Коротко — цвет индикатора показывает заряд: зелёный <span class="nowrap">31–100%</span>, красный <span class="nowrap">15–30%</span>, мигающий красный — меньше 15%.',
  'ctl.mute2.text': 'Включить или выключить самопрослушивание.',
  'ctl.mutevol.text': 'Громкость самопрослушивания.',
  'ctl.limit.text': 'Ограничитель громкости: 85 или 100 дБ.',
  'ctl.3s': '3 с',
  'ctl.note': 'Без активности гарнитура выключается сама через 30 минут.',

  'set.title': 'Настройки',
  'set.lead': 'Хаб работает в трее, даже когда окно закрыто.',
  'set.general': 'Общие',
  'set.theme': 'Тема',
  'theme.system': 'Система',
  'theme.light': 'Светлая',
  'theme.dark': 'Тёмная',
  'set.lang': 'Язык',
  'lang.auto': 'Система',
  'set.autostart': 'Запускать вместе с Windows',
  'set.autostart.hint': 'Сразу в трей, без окна',
  'set.notifications': 'Уведомления',
  'set.alert': 'Предупреждать о низком заряде',
  'set.alert.hint': 'Ещё одно уведомление придёт при 5%',
  'set.alert.sr': 'Порог, процентов',
  'set.alert.invalid': 'От 5 до 50',
  'set.data': 'Данные',
  'set.history': 'История заряда',
  'set.history.hint': 'Хранится 7 дней на этом компьютере',
  'set.history.count': ['{n} замер за сутки · хранится 7 дней', '{n} замера за сутки · хранится 7 дней', '{n} замеров за сутки · хранится 7 дней'],
  'set.clear': 'Очистить',
  'set.updates': 'Обновления',
  'set.autoupdate': 'Проверять автоматически',
  'upd.title': 'Проверка обновлений',
  'set.autoupdate.hint': 'При открытии окна. Это единственный раз, когда программа обращается к сети: она спрашивает у github.com номер последней версии.',
  'upd.check': 'Проверить',
  'upd.checking': 'Проверка…',
  'upd.latest': 'Установлена последняя версия.',
  'upd.available': 'Доступна версия {v}.',
  'upd.install': 'Установить {v}',
  'upd.installing': 'Загрузка и установка…',
  'upd.failed': 'Не удалось проверить обновления.',
  'upd.install.failed': 'Не удалось обновиться.',
  'set.support': 'Поддержка',
  'set.diag': 'Диагностика',
  'set.diag.hint': 'Версии и последние замеры, без личных данных. Вставьте в сообщение об ошибке.',
  'set.diag.copy': 'Копировать',
  'set.issue': 'Сообщить о проблеме',
  'set.issue.hint': 'Откроет GitHub в браузере',
  'set.issue.open': 'Открыть',
  'diag.copied': 'Диагностика скопирована',
  'diag.copied.text': 'Вставьте её в сообщение об ошибке.',
  'diag.failed': 'Не удалось скопировать',
  'set.about': 'О программе',
  'about.version': 'Версия',
  'about.protocol': 'Протокол батареи',
  'about.model': '3D-модель',
  'about.fonts': 'Шрифт и иконки',
  'about.note': 'Неофициальная программа, не связана с Logitech.',

  'modal.clear.title': 'Очистить историю заряда?',
  'modal.clear.text': 'График и оценка «осталось» начнут считаться заново. Текущий заряд не изменится.',
  'modal.cancel': 'Отмена',
  'toast.close': 'Закрыть',
  'toast.updated': 'Заряд обновлён',
  'toast.updated.text': '{p}% · {mv} мВ',
  'toast.failed': 'Не удалось прочитать заряд',
  'toast.autostart.on': 'Автозапуск включён',
  'toast.autostart.on.text': 'Хаб будет стартовать в трей вместе с Windows.',
  'toast.autostart.off': 'Автозапуск выключен',
  'toast.autostart.failed': 'Не удалось изменить автозапуск',
  'toast.cleared': 'История очищена',
  'toast.cleared.text': 'Оценка «осталось» начнёт считаться заново.',

  'err.headset_off': 'гарнитура выключена',
  'err.dongle_missing': 'донгл не подключён',
  'err.no_reply': 'гарнитура не ответила',
  'err.hid_error': 'ошибка USB ({detail})',

  'empty.nodongle.title': 'Донгл не подключён',
  'empty.nodongle.text': 'Вставьте приёмник LIGHTSPEED в USB-порт компьютера. Хаб найдёт его сам — ничего нажимать не нужно.',
  'empty.off.title': 'Гарнитура выключена',
  'empty.off.text': 'Нажмите кнопку питания на левой чашке и подождите пару секунд, пока индикатор не загорится.',
  'empty.off.retry': 'Проверить снова',

  'unit.mv': 'мВ',
  'time.now': 'только что',
  'time.min': '{n} мин назад',
  'time.hour': '{n} ч назад',
  'hours.min': '{n} мин',
  'hours.h': '{n} ч',
};

const DICT = { en, ru };
let lang = 'en';

export const getLang = () => lang;
export const locale = () => (lang === 'ru' ? 'ru-RU' : 'en-GB');

export function setLang(l) {
  lang = DICT[l] ? l : 'en';
  document.documentElement.lang = lang;
}

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (vars && k in vars ? vars[k] : `{${k}}`));

export function t(key, vars) {
  const v = DICT[lang][key] ?? en[key];
  if (v === undefined) return key;
  return fill(Array.isArray(v) ? v[0] : v, vars);
}

/** Plural form for a count: t('set.history.count') is an array of forms. */
export function tn(key, n, vars = {}) {
  const forms = DICT[lang][key] ?? en[key];
  let i;
  if (lang === 'ru') i = n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2;
  else i = n === 1 ? 0 : 1;
  return fill(forms[Math.min(i, forms.length - 1)], { n, ...vars });
}

/** Translates everything in the page that is marked up with data-i18n*. */
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr.trim(), t(key.trim()));
    }
  });
}

/** Language to start with before the backend has answered: ?lang=, saved choice, browser language. */
export function guessLang(saved) {
  const q = new URLSearchParams(location.search).get('lang');
  if (DICT[q]) return q;
  if (DICT[saved]) return saved;
  return (navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}
