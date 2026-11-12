(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const POLL_MS = 5000;
  const HIST = 36;

  /* ───────── браузер ───────── */
  // Преломление через SVG-фильтр работает только в Chromium; в остальных остаётся обычное размытие.
  if (/Chrome\//.test(navigator.userAgent) && matchMedia('(pointer: fine)').matches && !reduce) {
    document.documentElement.classList.add('refract');
  }

  /* ───────── фон: бегущие буквы ───────── */
  const unit = (t) => `<span>${(t + ' ').repeat(3)}</span>`;
  document.querySelector('.r1').innerHTML = unit('PearGram') + unit('PearGram');
  document.querySelector('.r2').innerHTML = unit('peargram.online') + unit('peargram.online');

  /* ───────── курсор: параллакс фона, блик и наклон стекла ───────── */
  addEventListener('pointermove', (e) => {
    const root = document.documentElement.style;
    root.setProperty('--px', (e.clientX / innerWidth - 0.5).toFixed(3));
    root.setProperty('--py', (e.clientY / innerHeight - 0.5).toFixed(3));
  }, { passive: true });

  document.querySelectorAll('[data-tilt]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      if (!reduce && e.pointerType === 'mouse') {
        el.style.transform = `perspective(900px) rotateX(${((0.5 - y) * 5).toFixed(2)}deg) rotateY(${((x - 0.5) * 7).toFixed(2)}deg)`;
      }
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });

  /* ───────── волны жидкости в капле ───────── */
  function wavePath(period, amp, base) {
    let d = `M0 ${base}`;
    for (let x = 0; x <= 600; x += 6) {
      d += ` L${x} ${(base + amp * Math.sin((x / period) * Math.PI * 2)).toFixed(2)}`;
    }
    return d + ' L600 340 L0 340 Z';
  }
  $('w1').setAttribute('d', wavePath(150, 8, 0));
  $('w2').setAttribute('d', wavePath(120, 6, -7));
  const liquid = $('liquid');
  function setLevel(pct) {
    const lvl = Math.min(0.97, Math.max(0.05, pct / 100));
    liquid.style.transform = `translateY(${(300 * (1 - lvl)).toFixed(1)}px)`;
  }

  /* ───────── числа ───────── */
  function num(el, to, dec = 0) {
    if (to == null || Number.isNaN(to)) { el.textContent = '—'; delete el.dataset.v; return; }
    const from = el.dataset.v === undefined ? 0 : parseFloat(el.dataset.v);
    el.dataset.v = to;
    const show = (v) => { el.textContent = v.toFixed(dec).replace('.', ','); };
    if (reduce || from === to) { show(to); return; }
    const t0 = performance.now(), dur = 1100;
    (function step(now) {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 4);
      show(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ───────── графики ───────── */
  const W = 300, H = 90, PAD = 8;
  function pts(arr, max) {
    const a = arr.length === 1 ? [arr[0], arr[0]] : arr;
    return a.map((v, i) => [
      (i / (a.length - 1)) * W,
      H - PAD - (Math.min(v, max) / max) * (H - PAD * 2),
    ]);
  }
  function smooth(p) {
    let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const [x0, y0] = p[i], [x1, y1] = p[i + 1], mx = (x0 + x1) / 2;
      d += ` C${mx.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return d;
  }
  function spark(wrap, series, max) {
    if (!series[0] || !series[0].length) return;
    const main = pts(series[0], max);
    const dMain = smooth(main);
    wrap.querySelector('.line').setAttribute('d', dMain);
    const area = wrap.querySelector('.area');
    if (area) area.setAttribute('d', `${dMain} L${W} ${H} L0 ${H} Z`);
    if (series[1] && series[1].length) wrap.querySelector('.line.b').setAttribute('d', smooth(pts(series[1], max)));
    const end = wrap.querySelector('.end');
    if (end) end.style.top = ((main[main.length - 1][1] / H) * 100).toFixed(1) + '%';
  }

  /* ───────── форматирование ───────── */
  const gb = (b) => (b / 1073741824).toFixed(1).replace('.', ',');
  function rate(b) {
    return b >= 1048576 ? [(b / 1048576).toFixed(1).replace('.', ','), 'МБ/с'] : [String(Math.round(b / 1024)), 'КБ/с'];
  }
  function uptime(s) {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d} д ${h} ч`;
    if (h > 0) return `${h} ч ${m} мин`;
    return `${m} мин`;
  }
  const clock = (d) => d.toLocaleTimeString('ru-RU');

  /* ───────── заголовок: буквы появляются по очереди ───────── */
  const headline = $('headline');
  function setHeadline(text) {
    if (headline.dataset.t === text) return;
    headline.dataset.t = text;
    headline.textContent = '';
    let i = 0;
    text.split(' ').forEach((word, wi, all) => {
      const w = document.createElement('span');
      w.className = 'w';
      for (const c of word) {
        const k = document.createElement('span');
        k.className = 'ch';
        k.textContent = c;
        k.style.animationDelay = (i++ * 26 + 120) + 'ms';
        w.appendChild(k);
      }
      headline.appendChild(w);
      if (wi < all.length - 1) headline.appendChild(document.createTextNode(' '));
    });
  }

  /* ───────── оценка состояния ───────── */
  function evaluate(d) {
    const issues = [];
    let state = 'ok';
    const bump = (s) => { if (s === 'down' || state === 'ok') state = s; };

    if (!d.site.up) { bump('down'); issues.push('Сайт не отвечает'); }
    if (d.server) {
      const s = d.server;
      if (s.cpu >= 90) { bump('degraded'); issues.push('Процессор перегружен'); }
      if (s.ram.pct >= 90) { bump('degraded'); issues.push('Почти не осталось памяти'); }
      if (s.disk.pct >= 90) { bump('degraded'); issues.push('Заканчивается место на диске'); }
      (s.services || []).filter((x) => !x.up).forEach((x) => { bump('degraded'); issues.push(`Служба «${x.name}» не работает`); });
    } else if (d.configured !== false) {
      bump('degraded');
      issues.push('Сервер не передаёт данные');
    }
    if (d.site.up && d.site.ms >= 1500) { bump('degraded'); issues.push('Сайт отвечает медленно'); }
    return { state, issues };
  }

  /* ───────── отрисовка ───────── */
  const siteHist = [];
  let lastSvcSig = '';

  function chip(label, value) {
    const c = document.createElement('div');
    c.className = 'chip';
    c.append(label + ' ');
    const s = document.createElement('span');
    s.textContent = value;
    c.appendChild(s);
    return c;
  }

  function render(d, demo) {
    document.body.classList.remove('stale');
    $('demoBadge').hidden = !demo;

    const { state, issues } = evaluate(d);
    document.body.dataset.state = state;

    const sv = d.server;
    const sub = $('sub');
    if (state === 'ok') {
      setHeadline('Всё работает');
      sub.innerHTML = '';
      sub.append('Сайт отвечает за ');
      const b = document.createElement('b'); b.textContent = `${d.site.ms} мс`; sub.appendChild(b);
      sub.append(sv ? `, сервер работает ${uptime(sv.uptime)}.` : '.');
    } else if (state === 'down') {
      setHeadline('Сайт не отвечает');
      sub.textContent = issues.join('. ') + '.';
    } else {
      setHeadline('Есть замечания');
      sub.textContent = issues.join('. ') + '.';
    }

    const chips = $('chips');
    chips.textContent = '';
    chips.appendChild(chip('Сайт', d.site.up ? `HTTP ${d.site.status}` : 'недоступен'));
    if (sv) {
      const upCount = (sv.services || []).filter((x) => x.up).length;
      if ((sv.services || []).length) chips.appendChild(chip('Службы', `${upCount} из ${sv.services.length}`));
      chips.appendChild(chip('Без перезагрузки', uptime(sv.uptime)));
    } else {
      chips.appendChild(chip('Сервер', 'агент не подключён'));
    }

    /* сайт */
    num($('siteMs'), d.site.ms);
    $('siteNote').textContent = d.site.up ? 'Время ответа главной страницы' : 'Главная страница не открылась';
    if (d.site.up) { siteHist.push(d.site.ms); if (siteHist.length > HIST) siteHist.shift(); }
    spark($('spSite'), [siteHist], Math.max(300, Math.max(...siteHist, 0) * 1.25));

    if (sv) {
      /* процессор */
      num($('cpuNum'), sv.cpu);
      setLevel(sv.cpu);
      spark($('spCpu'), [sv.history.cpu], 100);
      $('l1').textContent = sv.load[0].toFixed(2);
      $('l5').textContent = sv.load[1].toFixed(2);
      $('l15').textContent = sv.load[2].toFixed(2);
      $('upNote').textContent = `Ядер: ${sv.cores}. Процессор за последние минуты.`;

      /* память и диск */
      num($('ramPct'), sv.ram.pct);
      tube($('ramFill'), sv.ram.pct);
      $('ramNote').textContent = `${gb(sv.ram.used)} из ${gb(sv.ram.total)} ГБ`;
      num($('diskPct'), sv.disk.pct);
      tube($('diskFill'), sv.disk.pct);
      $('diskNote').textContent = `${gb(sv.disk.used)} из ${gb(sv.disk.total)} ГБ`;

      /* сеть */
      const [rx, rxu] = rate(sv.net.rx), [tx, txu] = rate(sv.net.tx);
      $('rxNum').textContent = rx; $('rxUnit').textContent = rxu;
      $('txNum').textContent = tx; $('txUnit').textContent = txu;
      const top = Math.max(1024, ...sv.history.rx, ...sv.history.tx) * 1.25;
      spark($('spNet'), [sv.history.rx, sv.history.tx], top);
    } else {
      ['cpuNum', 'ramPct', 'diskPct'].forEach((id) => num($(id), null));
      ['l1', 'l5', 'l15', 'rxNum', 'txNum'].forEach((id) => { $(id).textContent = '—'; });
      $('upNote').textContent = 'Агент на сервере не подключён';
    }

    /* службы */
    const list = [{ name: 'Сайт', up: d.site.up }].concat(sv ? sv.services || [] : []);
    const sig = JSON.stringify(list);
    if (sig !== lastSvcSig) {
      lastSvcSig = sig;
      const box = $('svc');
      box.textContent = '';
      list.forEach((s, i) => {
        const el = document.createElement('div');
        el.className = 'svc' + (s.up ? '' : ' bad');
        el.style.setProperty('--i', i);
        const dot = document.createElement('i'); dot.className = 'd';
        const name = document.createElement('span'); name.textContent = s.name;
        const st = document.createElement('em'); st.textContent = s.up ? 'работает' : 'не работает';
        el.append(dot, name, st);
        box.appendChild(el);
      });
    }

    /* время обновления + перезапуск кольца */
    $('upd').textContent = `Обновлено в ${clock(new Date())}`;
    const ring = $('ring');
    ring.style.animation = 'none';
    void ring.offsetWidth;
    ring.style.animation = '';
  }

  function tube(el, pct) {
    el.style.width = Math.max(2, Math.min(100, pct)) + '%';
    el.dataset.lv = pct >= 90 ? 'hot' : pct >= 75 ? 'warn' : '';
  }

  /* ───────── демо-данные, пока API не подключён ───────── */
  const demo = { cpu: 34, ram: 58, disk: 41, rx: 180e3, tx: 90e3, ms: 96, h: { cpu: [], rx: [], tx: [] } };
  const walk = (v, step, lo, hi) => Math.min(hi, Math.max(lo, v + (Math.random() - 0.5) * step));
  function demoTick() {
    demo.cpu = walk(demo.cpu, 18, 8, 80);
    demo.ram = walk(demo.ram, 1.2, 40, 75);
    demo.rx = walk(demo.rx, 160e3, 20e3, 900e3);
    demo.tx = walk(demo.tx, 90e3, 10e3, 500e3);
    demo.ms = Math.round(walk(demo.ms, 40, 60, 180));
    const h = demo.h;
    h.cpu.push(demo.cpu); h.rx.push(demo.rx); h.tx.push(demo.tx);
    Object.values(h).forEach((a) => { while (a.length > HIST) a.shift(); });
  }
  for (let i = 0; i < HIST; i++) demoTick();
  function demoData() {
    demoTick();
    const total = 4 * 1073741824;
    return {
      site: { up: true, ms: demo.ms, status: 200 },
      server: {
        cpu: demo.cpu, cores: 2, load: [demo.cpu / 60, demo.cpu / 70, demo.cpu / 80],
        ram: { pct: demo.ram, used: total * demo.ram / 100, total },
        disk: { pct: demo.disk, used: 30 * 1073741824 * demo.disk / 100, total: 30 * 1073741824 },
        net: { rx: demo.rx, tx: demo.tx },
        uptime: 12 * 86400 + 4 * 3600,
        services: [{ name: 'Веб-сервер', up: true }, { name: 'База данных', up: true }, { name: 'Кэш', up: true }],
        history: demo.h,
      },
    };
  }

  /* ───────── опрос API ───────── */
  let real = false;
  async function tick() {
    try {
      const r = await fetch('api/status', { cache: 'no-store' });
      if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error('api ' + r.status);
      const d = await r.json();
      real = true;
      render(d, false);
    } catch (e) {
      if (real) {
        document.body.dataset.state = 'offline';
        document.body.classList.add('stale');
        setHeadline('Нет связи со статусом');
        $('sub').textContent = 'Не удаётся получить данные. Пробуем снова.';
        $('upd').textContent = 'Нет связи';
      } else {
        render(demoData(), true);
      }
    }
  }

  let timer;
  function loop() {
    clearTimeout(timer);
    tick().finally(() => { timer = setTimeout(loop, POLL_MS); });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });
  loop();
})();
