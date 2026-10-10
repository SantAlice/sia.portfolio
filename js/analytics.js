/* Public counter IDs only. Empty configuration makes no tracking requests. */
(function () {
  'use strict';
  fetch('analytics-config.json', { cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) throw new Error('Analytics configuration unavailable');
      return response.json();
    })
    .then(function (config) {
      var google = typeof config.googleMeasurementId === 'string' && /^G-[A-Z0-9]+$/.test(config.googleMeasurementId)
        ? config.googleMeasurementId : null;
      var yandex = /^[1-9][0-9]*$/.test(String(config.yandexMetrikaId))
        ? Number(config.yandexMetrikaId) : null;

      if (google) {
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('config', google);
        var googleScript = document.createElement('script');
        googleScript.async = true;
        googleScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(google);
        document.head.appendChild(googleScript);
      }
      if (yandex) {
        window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
        window.ym.l = Date.now();
        var yandexScript = document.createElement('script');
        yandexScript.async = true;
        yandexScript.src = 'https://mc.yandex.ru/metrika/tag.js?id=' + encodeURIComponent(yandex);
        document.head.appendChild(yandexScript);
        window.ym(yandex, 'init', {
          clickmap: true,
          trackLinks: true,
          accurateTrackBounce: true,
          webvisor: true,
          ssr: true,
          ecommerce: "dataLayer",
          referrer: document.referrer,
          url: location.href
        });
      }
      if (!google && !yandex) return;

      document.addEventListener('click', function (event) {
        var link = event.target.closest('a[href]');
        if (!link) return;
        var url;
        try { url = new URL(link.href); } catch (_) { return; }
        if (url.hostname !== 't.me') return;
        var kind = url.pathname === '/cassiopeianse' ? 'project'
          : url.pathname === '/aaautomation' ? 'channel' : null;
        if (!kind) return;
        if (google) window.gtag('event', kind === 'project' ? 'generate_lead' : 'telegram_channel_click', {
          contact_type: kind,
          link_url: url.href,
          link_text: link.textContent.trim()
        });
        if (yandex) window.ym(yandex, 'reachGoal', kind === 'channel'
          ? (config.yandexChannelGoal || 'telegram_channel') : 'telegram_project', {
          contact_type: kind,
          link_url: url.href
        });
      });
    })
    .catch(function () { /* A counter outage must not affect the portfolio. */ });
}());
