# PearGram — страница состояния

Стеклянная страница статуса для Vercel и маленький агент для VPS.

```
Браузер ──► Vercel (страница + /api/status) ──► peargram.online (проверка сайта)
                                            └─► агент на VPS (процессор, память, диск, сеть, службы)
```

Пока агент не подключён, страница работает на демо-данных и показывает плашку «Демо-данные».

## Что нужно знать о VPS

| Что | Зачем | Где посмотреть |
|---|---|---|
| Доступ по SSH (логин + ключ или пароль) | поставить агент | у хостера в панели |
| ОС: Ubuntu / Debian | агент читает `/proc`, службы через systemd | `cat /etc/os-release` |
| Node.js 18 или новее | запуск агента | `node -v` (нет: `apt install nodejs`) |
| Имена служб systemd | показать «Веб-сервер», «База данных» и т.д. | `systemctl list-units --type=service --state=running` |
| Какой диск показывать | процент занятого места | `df -h`, обычно `/` |
| Поддомен для агента, например `agent.peargram.online` | чтобы Vercel ходил по HTTPS | DNS: A-запись на IP сервера |
| Веб-сервер: nginx или Caddy | отдаёт агента наружу с HTTPS | `systemctl status nginx` |

Пароли и ключи мне присылать не нужно: агент ставите вы сами за 5 минут по шагам ниже.

## 1. Агент на VPS

```bash
# файлы агента на сервер
scp agent/agent.js root@IP_СЕРВЕРА:/opt/peargram-agent/agent.js     # сначала: ssh root@IP "mkdir -p /opt/peargram-agent"
scp agent/peargram-agent.service root@IP_СЕРВЕРА:/etc/systemd/system/

# на сервере
openssl rand -hex 24          # это ваш токен, сохраните его
nano /etc/peargram-agent.env
```

Содержимое `/etc/peargram-agent.env`:

```
AGENT_TOKEN=вставьте_токен
PORT=9101
HOST=127.0.0.1
DISK_PATH=/
SERVICES=Веб-сервер=nginx,База данных=postgresql,Кэш=redis-server
```

```bash
systemctl daemon-reload
systemctl enable --now peargram-agent
curl -H "Authorization: Bearer ВАШ_ТОКЕН" http://127.0.0.1:9101/metrics   # должен вернуться JSON
```

## 2. Открыть агента наружу по HTTPS

Caddy (сам выпустит сертификат), файл `/etc/caddy/Caddyfile`:

```
agent.peargram.online {
    reverse_proxy 127.0.0.1:9101
}
```

Если у вас nginx, проксируйте `agent.peargram.online` на `127.0.0.1:9101` и выпустите сертификат через certbot.
Без токена агент отвечает 401, наружу торчит только `/metrics`.

## 3. Выложить на Vercel

```bash
npm i -g vercel
cd peargram-status
vercel            # первый запуск, ответьте на вопросы
```

Затем в Vercel → Project → Settings → Environment Variables:

| Имя | Значение |
|---|---|
| `AGENT_URL` | `https://agent.peargram.online/metrics` |
| `AGENT_TOKEN` | токен из шага 1 |
| `SITE_URL` | `https://peargram.online` (можно не задавать) |

После этого `vercel --prod`. Чтобы страница жила на `status.peargram.online`, добавьте домен в Project → Settings → Domains и CNAME у регистратора.

## Что показывает страница

- **Ответ сайта** — сколько миллисекунд Vercel ждёт главную страницу (замер из Франкфурта).
- **Процессор, память, диск, сеть, нагрузка, аптайм** — из `/proc` на сервере.
- **Службы** — `systemctl is-active` для каждой из `SERVICES`.
- **Цвет и заголовок** меняются сами: зелёный «Всё работает», жёлтый «Есть замечания» (процессор, память или диск выше 90%, остановлена служба, сайт отвечает дольше 1,5 с), красный «Сайт не отвечает».

Запросы к VPS кэшируются на стороне Vercel на 4 секунды, поэтому нагрузка на сервер не растёт с числом посетителей.
