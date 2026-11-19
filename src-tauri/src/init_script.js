
(function() {
  var h = window.location.hostname;
  if (h === 'tauri.localhost' || h === 'localhost' || window.location.protocol === 'tauri:') return;

    var invoke = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;

  // Mark this session as running inside the SIMATS Secure Browser.
  // The web app checks window.__SIMATS_SECURE_BROWSER__ to skip fullscreen enforcement.
  window.__SIMATS_SECURE_BROWSER__ = true;

    function publishDeviceId(deviceId) {
        if (!deviceId) return;

        window.__SIMATS_DEVICE_ID__ = deviceId;
        window.getSimatsDeviceId = function() { return window.__SIMATS_DEVICE_ID__ || null; };

        try {
            localStorage.setItem('simats_device_id', deviceId);
            sessionStorage.setItem('simats_device_id', deviceId);
        } catch (e) {}

        try {
            document.cookie = 'simats_device_id=' + encodeURIComponent(deviceId) + '; path=/; SameSite=Lax';
        } catch (e) {}

        try {
            document.documentElement.setAttribute('data-simats-device-id', deviceId);
            window.dispatchEvent(new CustomEvent('simats-device-id-ready', {
                detail: { deviceId: deviceId }
            }));
        } catch (e) {}
    }

    if (invoke) {
        invoke('get_device_id')
            .then(publishDeviceId)
            .catch(function() {});
    }

    document.addEventListener('submit', function(e) {
        var form = e.target;
        if (!form || !window.__SIMATS_DEVICE_ID__) return;

        var input = form.querySelector('input[name="device_id"]');
        if (!input) {
            input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'device_id';
            form.appendChild(input);
        }
        input.value = window.__SIMATS_DEVICE_ID__;
    }, true);

  // Disable right-click context menu on exam pages — capture phase ensures
  // this fires before the web app's own contextmenu listener.
  // stopImmediatePropagation prevents the event reaching any other listener.
  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  }, true);

  // ── Fullscreen API shim ──────────────────────────────────────────────────
  // The exam app checks document.fullscreenElement and listens to
  // fullscreenchange to confirm entry. We mock the API so:
  //  - fullscreenElement always returns documentElement (always "in fullscreen")
  //  - requestFullscreen() fires a fake fullscreenchange so the app gets the
  //    confirmation it waits for, but never actually triggers a real OS prompt
  //  - exitFullscreen() is a no-op so the app can never truly exit fullscreen
  (function() {
    // Always report as fullscreen
    Object.defineProperty(document, 'fullscreenElement',        { get: function() { return document.documentElement; }, configurable: true });
    Object.defineProperty(document, 'webkitFullscreenElement',  { get: function() { return document.documentElement; }, configurable: true });
    Object.defineProperty(document, 'mozFullScreenElement',     { get: function() { return document.documentElement; }, configurable: true });
    Object.defineProperty(document, 'msFullscreenElement',      { get: function() { return document.documentElement; }, configurable: true });
    Object.defineProperty(document, 'fullscreenEnabled',        { get: function() { return true; }, configurable: true });
    Object.defineProperty(document, 'webkitFullscreenEnabled',  { get: function() { return true; }, configurable: true });

    // exitFullscreen is a no-op — cannot leave fullscreen
    document.exitFullscreen        = function() { return Promise.resolve(); };
    document.webkitExitFullscreen  = function() {};
    document.mozCancelFullScreen   = function() {};
    document.msExitFullscreen      = function() {};

    // requestFullscreen dispatches a fake fullscreenchange event so the exam
    // app's listener fires and sees fullscreenElement = documentElement (true)
    var _fireFullscreenChange = function() {
      try {
        var evt = new Event('fullscreenchange', { bubbles: true });
        document.dispatchEvent(evt);
        var wevt = new Event('webkitfullscreenchange', { bubbles: true });
        document.dispatchEvent(wevt);
      } catch(e) {}
      return Promise.resolve();
    };
    Element.prototype.requestFullscreen        = _fireFullscreenChange;
    Element.prototype.webkitRequestFullscreen  = _fireFullscreenChange;
    Element.prototype.mozRequestFullScreen     = _fireFullscreenChange;
    Element.prototype.msRequestFullscreen      = _fireFullscreenChange;

    // Mock window/screen dimensions so dimension-based checks also pass
    try {
      Object.defineProperty(window, 'innerHeight',        { get: function() { return screen.height; }, configurable: true });
      Object.defineProperty(window, 'innerWidth',         { get: function() { return screen.width;  }, configurable: true });
      Object.defineProperty(window, 'outerHeight',        { get: function() { return screen.height; }, configurable: true });
      Object.defineProperty(window, 'outerWidth',         { get: function() { return screen.width;  }, configurable: true });
      Object.defineProperty(screen,  'availHeight',       { get: function() { return screen.height; }, configurable: true });
      Object.defineProperty(screen,  'availWidth',        { get: function() { return screen.width;  }, configurable: true });
    } catch(e) {}

    // On every page load, fire a fake fullscreenchange so the exam app
    // immediately knows it is "in fullscreen" without needing to call requestFullscreen
    window.addEventListener('load', function() {
      try {
        document.dispatchEvent(new Event('fullscreenchange', { bubbles: true }));
        document.dispatchEvent(new Event('webkitfullscreenchange', { bubbles: true }));
      } catch(e) {}
    });
  })();

  // Block all exit shortcuts on exam pages
  document.addEventListener('keydown', function(e) {
    // Alt+F4, Alt+Tab, Alt+Esc
    if (e.altKey && (e.key === 'F4' || e.key === 'Tab' || e.key === 'Escape')) { e.preventDefault(); return false; }
    // Windows / Meta key
    if (e.metaKey || e.key === 'Meta') { e.preventDefault(); return false; }
    // Ctrl+Esc (Start menu)
    if (e.ctrlKey && e.key === 'Escape') { e.preventDefault(); return false; }
  }, true);

  function doInject() {
    if (document.getElementById('_simats_exit')) return;

    var div = document.createElement('div');
    div.id = '_simats_exit';
    div.innerHTML = '<button id="_sx_btn" style="position:fixed;top:12px;left:21vw;z-index:2147483647;background:#dc2626;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35)">Secure Exit</button><div id="_sx_modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;align-items:center;justify-content:center"><div style="background:#fff;border-radius:12px;padding:24px;width:320px;font-family:sans-serif"><h3 style="margin:0 0 8px;font-size:18px">Secure Exit</h3><p style="margin:0 0 16px;color:#555;font-size:14px">Enter the invigilator password to close the browser.</p><input id="_sx_pw" type="password" placeholder="Password" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box"><p id="_sx_err" style="color:#dc2626;font-size:13px;margin:8px 0 0;min-height:18px"></p><div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end"><button id="_sx_cancel" style="padding:8px 16px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer">Cancel</button><button id="_sx_confirm" style="padding:8px 16px;background:#dc2626;color:#fff;border:none;border-radius:8px;cursor:pointer">Exit</button></div></div></div>';
  document.body.appendChild(div);

  var modal = document.getElementById('_sx_modal');
  var pw    = document.getElementById('_sx_pw');
  var err   = document.getElementById('_sx_err');

  document.getElementById('_sx_btn').onclick = function() {
    modal.style.display = 'flex'; pw.value = ''; err.textContent = ''; pw.focus();
  };
  document.getElementById('_sx_cancel').onclick = function() { modal.style.display = 'none'; };
  document.getElementById('_sx_confirm').onclick = async function() {
    if (!pw.value) { err.textContent = 'Enter the password.'; return; }
    try {
      if (!invoke) { err.textContent = 'Tauri API not available.'; return; }
      var ok = await invoke('verify_exit_password', { password: pw.value });
      if (ok) { await invoke('secure_exit'); }
      else { err.textContent = 'Incorrect password. Exit denied.'; }
    } catch(e) { err.textContent = 'Error: ' + e; }
  };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', doInject);
  } else {
    doInject();
  }
})();
