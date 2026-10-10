/* ============================================================
   Настя — AI-креатор. Логика каркаса.
   Всё на ванильном JS, без зависимостей.
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 1. Появление хиро при загрузке ───────────── */
  var loadItems = document.querySelectorAll('.load');
  window.addEventListener('load', function () {
    loadItems.forEach(function (el) {
      var order = parseInt(el.dataset.load || '1', 10);
      setTimeout(function () { el.classList.add('is-in'); }, reduced ? 0 : order * 110);
    });
  });

  /* ── 2. Появление блоков при скролле ──────────── */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { threshold: 0.16, rootMargin: '0px 0px -60px' });

  document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });

  /* ── 3. Шапка и прогресс-полоса ───────────────── */
  var header = document.getElementById('header');
  var progress = document.getElementById('progress');

  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop;
    header.classList.toggle('is-stuck', y > 40);
    var h = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── 4. Мобильное меню ────────────────────────── */
  var burger = document.getElementById('burger');
  var nav = document.querySelector('.nav');
  if (burger) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── 5. Счётчики ──────────────────────────────── */
  var counters = document.querySelectorAll('.num[data-count]');
  var cio = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      count(e.target);
      cio.unobserve(e.target);
    });
  }, { threshold: 0.6 });
  counters.forEach(function (el) { cio.observe(el); });

  function count(el) {
    var target = parseInt(el.dataset.count, 10) || 0;
    if (reduced) { el.textContent = target; return; }
    var dur = 1100, start = performance.now();
    function tick(now) {
      var p = Math.min((now - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ── 6. Направления: лента ↔ сетка ──────────────────────────────
     Рубрика по умолчанию «наполовину открыта»: работы лежат лентой
     в одну строку, хвост уходит под полупрозрачную подложку, листается
     колесом. Клик по строке или по «Показать все» разворачивает ленту
     в сетку-кладку. Рубрики, где работ не больше, чем влезает в строку,
     и пустые — живут раскрытыми: прятать там нечего. */
  var dirs = document.getElementById('dirs');

  if (dirs) {
    var rows = [].slice.call(dirs.querySelectorAll('.drow'));


    function toggleable(row) { return !!row.querySelector('.drow__all'); }

    // раскладка считается чистым CSS, расчёт высот в JS больше не нужен
    function layoutAll() {}
    window.__dirsLayout = layoutAll;

    function setOpen(row, open) {
      if (!toggleable(row)) return;
      row.classList.toggle('is-open', open);
      row.classList.toggle('is-peek', !open);
      row.querySelector('.drow__bar').setAttribute('aria-expanded', open ? 'true' : 'false');
      var all = row.querySelector('.drow__all');
      if (all) {
        all.textContent = open
          ? 'Свернуть'
          : 'Показать все ' + row.querySelectorAll('.work').length;
      }
      if (open) {
        [].forEach.call(row.querySelectorAll(".work__img"), function (i) { i.loading = "eager"; });
      }
      var st = row.querySelector('.dgrid');
      if (st && st.__syncNav) setTimeout(st.__syncNav, 0);
    }

    dirs.addEventListener('click', function (e) {
      var hit = e.target.closest('.drow__all') || e.target.closest('.drow__bar');
      if (!hit) return;
      var row = hit.closest('.drow');
      if (row) setOpen(row, !row.classList.contains('is-open'));
    });

    // Колесо листает ленту вбок. Слушатель висит на самой ленте, а не на
    // всей секции: непассивный обработчик на большом контейнере заставляет
    // браузер ждать JS перед каждой прокруткой — страница начинает тормозить.
    // Страницу не перехватываем, пока лента не домотана до края.
    [].forEach.call(dirs.querySelectorAll('.dgrid'), function (strip) {
      var row = strip.closest('.drow');

      // Перехват вертикального колеса убран намеренно. Он останавливал
      // прокрутку страницы, пока лента не домотана до конца: в «Фото»
      // это 21 работа, то есть страница вставала насмерть. Горизонтальное
      // колесо и свайп тачпада лента ловит сама, через overflow-x.
      // Для мыши есть стрелки и перетаскивание — см. ниже.

      // перетаскивание мышью
      var down = false, startX = 0, startLeft = 0, moved = 0;
      strip.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch') return;      // пальцем и так работает
        if (strip.scrollWidth <= strip.clientWidth + 1) return;
        down = true; moved = 0;
        startX = e.clientX; startLeft = strip.scrollLeft;
      });
      strip.addEventListener('pointermove', function (e) {
        if (!down) return;
        var dx = e.clientX - startX;
        moved = Math.max(moved, Math.abs(dx));
        if (moved <= 6) return;
        strip.classList.add('is-drag');
        strip.scrollLeft = startLeft - dx;
      });
      function endDrag() { down = false; strip.classList.remove('is-drag'); }
      strip.addEventListener('pointerup', endDrag);
      strip.addEventListener('pointercancel', endDrag);
      strip.addEventListener('pointerleave', endDrag);
      // после перетаскивания не открываем карточку
      strip.addEventListener('click', function (e) {
        if (moved > 6) { e.preventDefault(); e.stopPropagation(); moved = 0; }
      }, true);

      // стрелки: единственный способ листать ленту мышью, не отнимая
      // колесо у страницы
      var wrap = strip.parentElement;
      var prev = document.createElement('button');
      var next = document.createElement('button');
      prev.type = next.type = 'button';
      prev.className = 'dnav dnav--prev';
      next.className = 'dnav dnav--next';
      prev.setAttribute('aria-label', 'Предыдущие работы');
      next.setAttribute('aria-label', 'Следующие работы');
      wrap.appendChild(prev);
      wrap.appendChild(next);

      function page(dir) {
        var amount = dir * Math.round(strip.clientWidth * 0.8);
        var from = strip.scrollLeft;
        strip.scrollBy({ left: amount, behavior: 'smooth' });
        // подстраховка: если плавная прокрутка недоступна, доводим рывком —
        // лучше без анимации, чем мёртвая кнопка
        setTimeout(function () {
          if (strip.scrollLeft === from) strip.scrollLeft = from + amount;
        }, 250);
      }
      prev.addEventListener('click', function (e) { e.stopPropagation(); page(-1); });
      next.addEventListener('click', function (e) { e.stopPropagation(); page(1); });

      function syncNav() {
        var scrollable = row.classList.contains('is-peek') &&
                         strip.scrollWidth > strip.clientWidth + 1;
        wrap.classList.toggle('has-nav', scrollable);
        if (!scrollable) return;
        prev.disabled = strip.scrollLeft <= 2;
        next.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2;
        row.classList.toggle('is-end', next.disabled);
      }
      strip.addEventListener('scroll', syncNav, { passive: true });
      window.addEventListener('resize', syncNav, { passive: true });
      strip.__syncNav = syncNav;
      syncNav();
    });

    var expandAll = document.getElementById('expandAll');
    var collapseAll = document.getElementById('collapseAll');
    if (expandAll) expandAll.addEventListener('click', function () {
      rows.forEach(function (r) { setOpen(r, true); });
    });
    if (collapseAll) collapseAll.addEventListener('click', function () {
      rows.forEach(function (r) { setOpen(r, false); });
    });

    [].forEach.call(dirs.querySelectorAll('.work__img'), function (img) {
      if (!img.complete) img.addEventListener('load', layoutAll, { once: true });
    });
    var tDirs;
    window.addEventListener('resize', function () {
      clearTimeout(tDirs); tDirs = setTimeout(layoutAll, 150);
    }, { passive: true });
    window.addEventListener('load', layoutAll);
    layoutAll();

    // ссылка вида index.html#photo раскрывает нужное направление
    var hash = (location.hash || '').replace('#', '');
    if (hash) {
      var target = dirs.querySelector('.drow[data-key="' + hash + '"]');
      if (target) { setOpen(target, true); target.scrollIntoView({ block: 'center' }); }
    }
  }

  /* ── 7. Смета: вычёркивание строк ─────────────── */
  var invoice = document.querySelector('.invoice');
  if (invoice) {
    var iio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        invoice.classList.add('is-on');
        iio.unobserve(e.target);
      });
    }, { threshold: 0.35 });
    iio.observe(invoice);
  }

  /* ── 8. Аккордеон FAQ ─────────────────────────── */
  var acc = document.getElementById('acc');
  if (acc) {
    acc.addEventListener('click', function (e) {
      var q = e.target.closest('.acc__q');
      if (!q) return;
      var item = q.parentElement;
      var body = item.querySelector('.acc__a');
      var open = item.classList.toggle('is-open');
      body.style.maxHeight = open ? body.scrollHeight + 'px' : 0;
    });
  }

  /* ── 9. Аватар в шапке: взгляд следует за курсором (дорожка v8) ──
     Видео не проигрывается — currentTime вручную привязан к направлению
     от глаз персонажа к курсору. Покрыта дуга 318°→0°→185°, то есть 227°
     из 360°. Верхний сектор 185–318° в дорожке отсутствует: там персонаж
     уходит в нейтраль настоящими кадрами исходника. Туда же он уходит,
     если мышь молчит дольше IDLE, курсор покинул окно или вкладку свернули. */
  (function () {
    var box = document.getElementById('avatarBox');
    var video = document.getElementById('avatarVideo');
    if (!box || !video) return;

    var DURATION = 9.75;     // длительность дорожки, секунды
    var EASE = 0.1;          // доля пути за кадр при 60 Гц; меньше — ленивее
    var AR = 720 / 1078;     // пропорция видео
    var STEP = 1 / 120;      // половина кадра при 60 fps
    var IDLE = 3000;         // мышь молчит дольше — уходим в нейтраль, мс

    // Покрытая дуга: направление взгляда -> позиция на дорожке 0..1.
    // Дуга проходит через 0°, поэтому углы развёрнуты в непрерывную
    // шкалу 318..545 (545 = 185 + 360). Значения сняты покадрово —
    // скорость движения по дуге неравномерная. Формулой не выводится.
    var MAP = [
      [ 318.0, 0.0829 ], [ 326.0, 0.1103 ], [ 337.0, 0.1376 ],
      [ 348.0, 0.1718 ], [ 353.0, 0.2060 ], [ 357.0, 0.2402 ],
      [ 365.0, 0.2744 ], [ 383.0, 0.3085 ], [ 395.0, 0.3427 ],
      [ 405.0, 0.3838 ], [ 420.0, 0.4248 ], [ 430.0, 0.4658 ],
      [ 440.0, 0.5068 ], [ 450.0, 0.5479 ], [ 456.0, 0.5889 ],
      [ 470.0, 0.6299 ], [ 484.0, 0.6573 ], [ 500.0, 0.6846 ],
      [ 515.0, 0.7188 ], [ 530.0, 0.7530 ], [ 538.0, 0.7872 ],
      [ 542.0, 0.8214 ], [ 545.0, 0.8556 ]
    ];

    var ARC_LO = 318;        // начало дуги — взгляд вверх-вправо
    var ARC_HI = 545;        // конец дуги — взгляд влево (185° + 360)
    var WEDGE  = 185;        // ниже этого угла разворачиваем шкалу
    var NEUTRAL = 0.0;       // фронтальная поза, первый кадр дорожки

    function angleToPos(deg) {
      // разворачиваем в непрерывную шкалу: дуга идёт через 0°
      var u = deg % 360;
      if (u < 0) u += 360;
      if (u < WEDGE) u += 360;

      if (u >= ARC_LO && u <= ARC_HI) {
        for (var i = 0; i < MAP.length - 1; i++) {
          var a = MAP[i], b = MAP[i + 1];
          if (u >= a[0] && u <= b[0]) {
            return a[1] + (b[1] - a[1]) * ((u - a[0]) / (b[0] - a[0]));
          }
        }
      }
      // верхний сектор 185..318 — его в дорожке нет: идём в нейтраль.
      // К какому её краю — решает кратчайшая дуга в loop(),
      // поэтому голова возвращается той же стороной, откуда пришла.
      return NEUTRAL;
    }

    // точка отсчёта — глаза персонажа внутри РЕАЛЬНОЙ области видео,
    // а не внутри блока: при object-fit: contain блок может быть больше
    // видео, и отсчёт от блока даёт систематическую ошибку угла
    function eyePoint() {
      var r = box.getBoundingClientRect();
      var vw, vh;
      if (r.width / r.height > AR) { vh = r.height; vw = vh * AR; }
      else                         { vw = r.width;  vh = vw / AR; }
      return {
        x: r.left + (r.width  - vw) / 2 + vw * 0.486,
        y: r.top  + (r.height - vh) / 2 + vh * 0.188
      };
    }

    var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var canHover = window.matchMedia('(hover: hover)').matches;

    // на тач-устройствах курсора нет — крутим дорожку в цикле
    if (!canHover || still) {
      video.loop = true;
      video.play().catch(function () {});
      return;
    }

    video.pause();

    var aim = NEUTRAL;       // куда смотреть по курсору
    var current = NEUTRAL;   // где голова сейчас
    var lastMove = -1e9;     // когда мышь двигалась в последний раз
    var last = 0;
    var lastSeek = -1;

    video.addEventListener('loadedmetadata', function () {
      video.currentTime = 0;
    }, { once: true });

    window.addEventListener('mousemove', function (e) {
      lastMove = performance.now();
      var p = eyePoint();
      var deg = Math.atan2(e.clientY - p.y, e.clientX - p.x) * 180 / Math.PI;
      if (deg < 0) deg += 360;
      aim = angleToPos(deg);
    }, { passive: true });

    // курсор ушёл из окна — сразу считаем это простоем
    document.addEventListener('mouseleave', function () {
      lastMove = -1e9;
    });

    // вкладку свернули — не держим позу
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) lastMove = -1e9;
    });

    function loop(now) {
      // мышь молчит дольше IDLE — возвращаемся в нейтраль.
      // Возврат идёт тем же сглаживанием, что и обычное движение,
      // поэтому голова не дёргается, а плавно опускается вперёд
      var target = (now - lastMove > IDLE) ? NEUTRAL : aim;

      // шаг сглаживания считаем от реального времени кадра, а не от его номера:
      // иначе на 120 Гц голова догоняет курсор вдвое быстрее, чем на 60 Гц,
      // а при просадке кадров — рывками
      var dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
      last = now;
      var k = 1 - Math.pow(1 - EASE, dt * 60);

      // кратчайшая дуга: оба конца дорожки — одна и та же нейтральная
      // поза, поэтому переход через край непрерывен. Не убирать.
      var diff = target - current;
      if (diff > 0.5) diff -= 1;
      if (diff < -0.5) diff += 1;
      current = (current + diff * k + 1) % 1;

      if (video.readyState >= 1) {
        var t = current * DURATION;
        // не дёргать currentTime, пока голова стоит: лишние перемотки
        // заставляют браузер пересобирать кадр и дают микрорывки
        if (isFinite(t) && Math.abs(t - lastSeek) >= STEP) {
          lastSeek = t;
          video.currentTime = Math.min(DURATION - 0.001, Math.max(0, t));
        }
      }

      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  })();


  /* ── 11. Скролл-вставка «гигантская девушка» ─────────────────────
     Видео не играет само: currentTime привязан к прогрессу прокрутки
     секции. Ключевые кадры в файле стоят каждые 10 — без этого
     перемотка дёргалась бы. На мобильных перемотки нет: в Safari
     currentTime отдаёт кадр с задержкой, там честный луп. */
  (() => {
    const section = document.querySelector('.giant');
    const video   = document.querySelector('.giant__video');
    if (!section || !video) return;

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const isMobile = matchMedia('(max-width: 767px)').matches;
    const px = window.innerWidth * (window.devicePixelRatio || 1);
    const srcFor = video.dataset[(!isMobile && px > 1400) ? 'srcHd' : 'srcSd'];

    // Источник подставляем не сразу: секция далеко внизу, а файл тяжёлый.
    // Пока он качался на старте, страница тормозила по всей высоте.
    function loadSrc() {
      if (video.src) return;
      video.src = srcFor;
      if (isMobile) video.loop = true;
    }

    // Load nearby, but play only while the section and tab are visible.
    if (isMobile) {
      let visible = false;
      function syncPlayback() {
        if (visible && !document.hidden) {
          loadSrc();
          video.play().catch(() => {});
        } else video.pause();
      }
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(es => { if (es[0].isIntersecting) loadSrc(); },
                                 { rootMargin: '400px 0px' }).observe(section);
        new IntersectionObserver(es => {
          visible = es[0].isIntersecting;
          syncPlayback();
        }).observe(section);
      } else {
        visible = true;
        syncPlayback();
      }
      document.addEventListener('visibilitychange', syncPlayback);
      return;
    }

    let target = 0, current = 0, raf = null, ready = false, near = false;

    video.addEventListener('loadedmetadata', () => { ready = true; tick(); });

    // Секция далеко — не делаем вообще ничего. Прежняя версия считала
    // прогресс и дёргала перемотку на каждый скролл по всей странице,
    // из-за чего колесо «вязло» даже там, где вставки на экране нет.
    if ('IntersectionObserver' in window) {
      // широкий запас — чтобы файл успел встать к подходу к секции
      new IntersectionObserver(es => {
        if (es[0].isIntersecting) loadSrc();
      }, { rootMargin: '600px 0px' }).observe(section);

      new IntersectionObserver(es => {
        near = es[0].isIntersecting;
        if (near && !raf) raf = requestAnimationFrame(tick);
      }, { rootMargin: '150px 0px' }).observe(section);
    } else {
      loadSrc();
      near = true;
    }

    function progress() {
      const r = section.getBoundingClientRect();
      const total = section.offsetHeight - window.innerHeight;
      if (total <= 0) return 0;
      return Math.min(1, Math.max(0, -r.top / total));
    }

    function tick() {
      raf = null;
      if (!ready || !near || document.hidden) return;
      target = progress() * Math.max(0, (video.duration || 0) - 1 / 60);
      current += (target - current) * 0.12;           // сглаживание
      const done = Math.abs(target - current) <= 1 / 60;
      if (done) current = target;
      // Новую перемотку шлём, только когда предыдущая завершилась.
      // Иначе запросы копятся быстрее, чем декодер успевает отдавать
      // кадры, и картинка застревает — это и есть «виснет».
      // Setting the same time still starts a seek in some browsers. Stop
      // once the displayed frame is close enough, including at the end.
      if (!video.seeking && Math.abs(video.currentTime - current) >= 1 / 30) {
        video.currentTime = current;
      }
      if (!done || video.seeking) raf = requestAnimationFrame(tick);
    }

    function kick() { if (near && !document.hidden && !raf) raf = requestAnimationFrame(tick); }
    document.addEventListener('visibilitychange', kick);
    addEventListener('scroll', kick, { passive: true });
    addEventListener('resize', kick, { passive: true });
  })();


  /* ── 12. Просмотр работы ─────────────────────────────────────────
     Одна точка входа на все рубрики. Видеокейс открывается роликом,
     фотокейс — самой картинкой. Видео грузится только при открытии:
     файлы тяжёлые, сервер отдаёт их диапазонами, поэтому качается
     лишь просмотренное, а при закрытии буфер освобождается. */
  (() => {
    const lb = document.getElementById('lb');
    if (!lb) return;

    const video   = document.getElementById('lbVideo');
    const still   = document.getElementById('lbImage');
    const elBrand = document.getElementById('lbBrand');
    const elTags  = document.getElementById('lbTags');
    let lastFocus = null;

    function open(btn) {
      const d = btn.dataset;
      elBrand.textContent = d.brand || '';
      elTags.textContent  = d.type || '';

      if (d.src) {                       // видеокейс
        still.hidden = true;
        video.hidden = false;
        video.src = d.src;
        video.play().catch(() => {});
      } else {                           // фотокейс: показываем сам кадр
        video.hidden = true;
        still.hidden = false;
        const img = btn.querySelector('.work__img');
        still.src = img ? img.currentSrc || img.src : '';
        still.alt = img ? img.alt : '';
      }

      lb.hidden = false;
      document.body.style.overflow = 'hidden';
      lastFocus = btn;
    }

    function close() {
      video.pause();
      video.removeAttribute('src');
      video.load();                      // освобождаем буфер тяжёлого файла
      still.removeAttribute('src');
      lb.hidden = true;
      document.body.style.overflow = '';
      if (lastFocus) lastFocus.focus();
    }

    document.addEventListener('click', e => {
      const btn = e.target.closest('.work__btn');
      if (btn) { open(btn); return; }
      if (e.target.closest('[data-close]') || e.target.closest('#lbClose')) close();
    });
    addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) close(); });
  })();

  /* ── 13. Размытие только у видимых карточек ──────────────────────
     backdrop-filter пересчитывается на каждом кадре прокрутки. Десять
     слоёв разом (стекло шапки плюс девять секций) кладут скролл даже
     там, где ничего не происходит. За экраном размытие выключаем —
     выглядит так же, а стоит на порядок дешевле. */
  (() => {
    const cards = document.querySelectorAll('.section, .hero__glass');
    if (!cards.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => e.target.classList.toggle('no-blur', !e.isIntersecting));
    }, { rootMargin: '250px 0px' });
    cards.forEach(c => { c.classList.add('no-blur'); io.observe(c); });
  })();
})();
