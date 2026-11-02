---

A lightweight replacement for Logitech G HUB for the **G435 LIGHTSPEED** headset (dongle `046D:0ACB`) on Windows.
Лёгкая замена Logitech G HUB для гарнитуры **G435 LIGHTSPEED** (донгл `046D:0ACB`) на Windows.

### Which file do I download? / Какой файл скачать?

| File | For |
|---|---|
| `G435-Hub_*_x64-setup.exe` | **Most people.** Installs for the current user, no admin rights. / Выбор по умолчанию: ставится для текущего пользователя, права администратора не нужны. |
| `G435-Hub_*_x64.msi` | Managed PCs and silent install: `msiexec /i G435-Hub_*_x64.msi /qn`. / Для администраторов и тихой установки. |
| `G435-Hub_*_x64-portable.zip` | No installation: unzip and run. / Без установки: распаковать и запустить. |
| `SHA256SUMS.txt` | Checksums. / Контрольные суммы. |

Windows x64 only. The builds are **not code-signed**, so Windows SmartScreen may warn on first run (*More info → Run anyway*). Only Windows is supported: the app talks to the dongle through the Windows HID API and controls the headset volume through Windows Core Audio.
Только Windows x64. Сборки **не подписаны** кодовой подписью, при первом запуске SmartScreen может предупредить (*Подробнее → Выполнить в любом случае*).

Installed copies update themselves from **Settings → Updates**. / Установленная версия обновляется сама: **Настройки → Обновления**.

Details, how the battery estimate works and its limits: see the [README](https://github.com/minchiki/g435-hub#readme). / Подробности и ограничения оценки заряда — в [README](https://github.com/minchiki/g435-hub/blob/main/README.ru.md).
