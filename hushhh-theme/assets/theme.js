/* HUSHHH theme — base JS: cart (AJAX API), cart drawer, hero slideshow, countdown bar, mobile nav */
(function () {
  'use strict';

  /* ---------------- Cart drawer + AJAX cart ---------------- */
  var CartDrawer = {
    root: null,
    overlay: null,
    init: function () {
      this.root = document.querySelector('[data-cart-drawer]');
      this.overlay = document.querySelector('[data-cart-drawer-overlay]');
      if (!this.root) return;
      document.addEventListener('click', this.onClick.bind(this));
      document.addEventListener('submit', this.onSubmit.bind(this));
      this.renderFromSections();
    },
    open: function () {
      if (!this.root) return;
      this.root.classList.add('is-open');
      this.overlay && this.overlay.classList.add('is-open');
      this.root.setAttribute('aria-hidden', 'false');
    },
    close: function () {
      if (!this.root) return;
      this.root.classList.remove('is-open');
      this.overlay && this.overlay.classList.remove('is-open');
      this.root.setAttribute('aria-hidden', 'true');
    },
    onClick: function (e) {
      if (e.target.closest('[data-cart-drawer-toggle]')) {
        e.preventDefault();
        this.open();
      }
      if (e.target.closest('[data-cart-drawer-close]') || e.target === this.overlay) {
        this.close();
      }
      var remove = e.target.closest('[data-cart-remove]');
      if (remove) {
        e.preventDefault();
        this.changeLine(remove.getAttribute('data-cart-remove'), 0);
      }
      var plus = e.target.closest('[data-qty-plus]');
      var minus = e.target.closest('[data-qty-minus]');
      if (plus || minus) {
        e.preventDefault();
        var btn = plus || minus;
        var wrapper = btn.closest('[data-cart-line]');
        var input = wrapper.querySelector('input[data-qty-input]');
        var qty = parseInt(input.value, 10) || 1;
        qty = plus ? qty + 1 : Math.max(0, qty - 1);
        input.value = qty;
        this.changeLine(wrapper.getAttribute('data-cart-line'), qty);
      }
    },
    onSubmit: function (e) {
      var form = e.target.closest('form[data-add-to-cart-form]');
      if (!form) return;
      e.preventDefault();
      var formData = new FormData(form);
      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.setAttribute('disabled', 'disabled');
      fetch(window.Shopify && window.Shopify.routes ? window.Shopify.routes.root + 'cart/add.js' : '/cart/add.js', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData
      })
        .then(function (r) { return r.json(); })
        .then(function () {
          CartDrawer.renderFromSections();
          CartDrawer.open();
        })
        .catch(function (err) { console.error('Add to cart failed', err); })
        .finally(function () {
          if (submitBtn) submitBtn.removeAttribute('disabled');
        });
    },
    changeLine: function (key, qty) {
      fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: key, quantity: qty })
      })
        .then(function (r) { return r.json(); })
        .then(function () { CartDrawer.renderFromSections(); });
    },
    renderFromSections: function () {
      var sectionId = this.root ? this.root.getAttribute('data-section-id') : null;
      if (!sectionId) return;
      fetch('/?section_id=' + sectionId)
        .then(function (r) { return r.text(); })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var newRoot = doc.querySelector('[data-cart-drawer]');
          if (newRoot && CartDrawer.root) {
            CartDrawer.root.innerHTML = newRoot.innerHTML;
          }
          var count = doc.querySelector('[data-cart-drawer]')
            ? doc.querySelector('[data-cart-count-value]')
            : null;
          document.querySelectorAll('[data-cart-count]').forEach(function (el) {
            var val = count ? count.textContent.trim() : '0';
            el.textContent = val;
            el.hidden = val === '0';
          });
        });
    }
  };

  /* ---------------- Hero slideshow ---------------- */
  function initSlideshows() {
    document.querySelectorAll('[data-hero-slideshow]').forEach(function (root) {
      var track = root.querySelector('[data-slideshow-track]');
      var slides = root.querySelectorAll('[data-slide]');
      var dots = root.querySelectorAll('[data-slide-dot]');
      if (!track || slides.length < 2) return;
      var index = 0;
      var interval = parseInt(root.getAttribute('data-autoplay-speed'), 10) || 5000;
      function go(i) {
        index = (i + slides.length) % slides.length;
        track.style.transform = 'translateX(-' + index * 100 + '%)';
        dots.forEach(function (d, di) { d.classList.toggle('is-active', di === index); });
      }
      root.querySelectorAll('[data-slide-next]').forEach(function (b) { b.addEventListener('click', function () { go(index + 1); }); });
      root.querySelectorAll('[data-slide-prev]').forEach(function (b) { b.addEventListener('click', function () { go(index - 1); }); });
      dots.forEach(function (d, di) { d.addEventListener('click', function () { go(di); }); });
      if (root.getAttribute('data-autoplay') === 'true') {
        setInterval(function () { go(index + 1); }, interval);
      }
      go(0);
    });
  }

  /* ---------------- Countdown timer bar ---------------- */
  function initCountdowns() {
    document.querySelectorAll('[data-countdown]').forEach(function (el) {
      var end = new Date(el.getAttribute('data-end-date') + 'T' + (el.getAttribute('data-end-time') || '23:59:59'));
      function tick() {
        var diff = end.getTime() - Date.now();
        if (diff <= 0) {
          if (el.getAttribute('data-hide-on-complete') === 'true') el.style.display = 'none';
          return;
        }
        var d = Math.floor(diff / 86400000);
        var h = Math.floor((diff % 86400000) / 3600000);
        var m = Math.floor((diff % 3600000) / 60000);
        var s = Math.floor((diff % 60000) / 1000);
        var set = function (sel, v) {
          var t = el.querySelector(sel);
          if (t) t.textContent = String(v).padStart(2, '0');
        };
        set('[data-days]', d);
        set('[data-hours]', h);
        set('[data-minutes]', m);
        set('[data-seconds]', s);
      }
      tick();
      setInterval(tick, 1000);
    });
  }

  /* ---------------- Mobile nav ---------------- */
  function initMobileNav() {
    var toggle = document.querySelector('[data-mobile-nav-toggle]');
    var panel = document.querySelector('[data-mobile-nav-panel]');
    if (!toggle || !panel) return;
    toggle.addEventListener('click', function () {
      panel.classList.toggle('is-open');
    });
    panel.querySelectorAll('[data-mobile-nav-close]').forEach(function (b) {
      b.addEventListener('click', function () { panel.classList.remove('is-open'); });
    });
  }

  /* ---------------- Newsletter (Shopify customer form, progressive enhancement) ---------------- */
  function initNewsletter() {
    document.querySelectorAll('[data-newsletter-form]').forEach(function (form) {
      form.addEventListener('submit', function () {
        var msg = form.querySelector('[data-newsletter-message]');
        if (msg) msg.hidden = false;
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    CartDrawer.init();
    initSlideshows();
    initCountdowns();
    initMobileNav();
    initNewsletter();
  });
})();
