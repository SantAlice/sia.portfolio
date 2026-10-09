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

  /* ── 6. Направления: раскрывающиеся строки ──── */
  var dirs = document.getElementById('dirs');

  function panelOf(row) { return row.querySelector('.drow__panel'); }

  function openRow(row) {
    var p = panelOf(row);
    row.classList.add('is-open');
    row.querySelector('.drow__bar').setAttribute('aria-expanded', 'true');
    p.style.maxHeight = p.scrollHeight + 'px';
  }

  function closeRow(row) {
    var p = panelOf(row);
    row.classList.remove('is-open');
    row.querySelector('.drow__bar').setAttribute('aria-expanded', 'false');
    p.style.maxHeight = 0;
  }

  function toggleRow(row) {
    if (row.classList.contains('is-open')) closeRow(row); else openRow(row);
  }

  if (dirs) {
    dirs.addEventListener('click', function (e) {
      var bar = e.target.closest('.drow__bar');
      if (bar) toggleRow(bar.parentElement);
    });

    var expandAll = document.getElementById('expandAll');
    var collapseAll = document.getElementById('collapseAll');
    var rows = dirs.querySelectorAll('.drow');

    if (expandAll) expandAll.addEventListener('click', function () {
      rows.forEach(openRow);
    });
    if (collapseAll) collapseAll.addEventListener('click', function () {
      rows.forEach(closeRow);
    });

    // высота открытых строк пересчитывается при ресайзе и после загрузки медиа
    function refresh() {
      rows.forEach(function (row) {
        if (row.classList.contains('is-open')) {
          var p = panelOf(row);
          p.style.maxHeight = 'none';
          var h = p.scrollHeight;
          p.style.maxHeight = h + 'px';
        }
      });
    }
    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(refresh, 150);
    });
    window.addEventListener('load', refresh);

    // ссылка вида index.html#photo сразу раскрывает нужное направление
    var hash = (location.hash || '').replace('#', '');
    if (hash) {
      var target = dirs.querySelector('.drow[data-key="' + hash + '"]');
      if (target) {
        openRow(target);
        target.scrollIntoView({ block: 'center' });
      }
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

  /* ── 9. Аватар в шапке: взгляд следует за курсором (дорожка v7) ──
     Видео не проигрывается — currentTime вручную привязан к направлению
     от глаз персонажа к курсору. Покрыта дуга 313°→0°→245°. Верхний
     сектор 245–313° в дорожке отсутствует: там персонаж возвращается
     в нейтраль настоящими кадрами исходника. */
  (function () {
    var box = document.getElementById('avatarBox');
    var video = document.getElementById('avatarVideo');
    if (!box || !video) return;

    var DURATION = 8.8125;   // длительность дорожки, секунды
    var EASE = 0.1;          // доля пути за кадр при 60 Гц; меньше — ленивее
    var AR = 720 / 1076;     // пропорция видео
    var STEP = 1 / 96;       // половина кадра при 48 fps

    // Покрытая дуга: направление взгляда -> позиция на дорожке 0..1.
    // Градусы экранные: 0 вправо, 90 вниз, 180 влево, 270 вверх.
    // Дуга проходит через 0°, поэтому углы развёрнуты в непрерывную
    // шкалу 315..605 (605 = 245 + 360). Значения сняты покадрово —
    // скорость движения по дуге неравномерная. Формулой не выводится.
    var MAP = [
      [ 315.0, 0.1147 ], [ 328.0, 0.1430 ], [ 336.0, 0.1572 ],
      [ 342.0, 0.1714 ], [ 350.0, 0.1856 ], [ 358.0, 0.1998 ],
      [ 361.0, 0.2092 ], [ 378.0, 0.2565 ], [ 384.0, 0.2707 ],
      [ 392.0, 0.2849 ], [ 405.0, 0.3132 ], [ 415.0, 0.3416 ],
      [ 425.0, 0.3700 ], [ 437.0, 0.3983 ], [ 448.0, 0.4267 ],
      [ 456.0, 0.4551 ], [ 463.0, 0.4882 ], [ 468.0, 0.5496 ],
      [ 468.5, 0.5544 ], [ 490.0, 0.5733 ], [ 505.0, 0.5969 ],
      [ 532.0, 0.6158 ], [ 548.0, 0.6395 ], [ 560.0, 0.6631 ],
      [ 574.0, 0.6868 ], [ 584.0, 0.7104 ], [ 593.0, 0.7293 ],
      [ 600.0, 0.7530 ], [ 605.0, 0.7861 ]
    ];

    var ARC_LO = 313;        // начало дуги — взгляд вверх-вправо
    var ARC_HI = 605;        // конец дуги — взгляд вверх-влево (245° + 360)
    var NEUTRAL = 0.0;       // фронтальная поза, первый кадр дорожки

    function angleToPos(deg) {
      // разворачиваем в непрерывную шкалу: дуга идёт через 0°
      var u = deg % 360;
      if (u < 0) u += 360;
      if (u < 245) u += 360;

      if (u >= ARC_LO && u <= ARC_HI) {
        for (var i = 0; i < MAP.length - 1; i++) {
          var a = MAP[i], b = MAP[i + 1];
          if (u >= a[0] && u <= b[0]) {
            return a[1] + (b[1] - a[1]) * ((u - a[0]) / (b[0] - a[0]));
          }
        }
        return MAP[0][1];    // 313..315 — самый край дуги
      }
      // сектор 245..313 — верх, в дорожке его нет: идём в нейтраль.
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
        x: r.left + (r.width  - vw) / 2 + vw * 0.482,
        y: r.top  + (r.height - vh) / 2 + vh * 0.184
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

    var target = NEUTRAL;
    var current = NEUTRAL;
    var last = 0;
    var lastSeek = -1;

    video.addEventListener('loadedmetadata', function () {
      video.currentTime = 0;
    }, { once: true });

    window.addEventListener('mousemove', function (e) {
      var p = eyePoint();
      var deg = Math.atan2(e.clientY - p.y, e.clientX - p.x) * 180 / Math.PI;
      if (deg < 0) deg += 360;
      target = angleToPos(deg);
    }, { passive: true });

    function loop(now) {
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

})();
