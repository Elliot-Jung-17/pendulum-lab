(function installDirectFileRuntimePatch(global) {
  'use strict';

  function text(id, value) {
    var element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function applyPatch() {
    var app = global.App;
    if (!app) return;

    if (location.protocol === 'file:') {
      app.useWorker = false;
      app.workerReady = false;
      app.paused = false;
      app.backendStatus = 'main-thread fallback';
      app.workerBackendState = 'main-thread fallback';

      var workerToggle = document.getElementById('useWorker');
      if (workerToggle && 'checked' in workerToggle) workerToggle.checked = false;
      text('modeLabel', 'running');
      if (app.physMs === undefined) app.physMs = 0;
    }

    var before = Number(app.simTime || 0);
    global.setTimeout(function verifyMotion() {
      var current = global.App;
      if (!current) return;
      if (!current.paused && Number(current.simTime || 0) <= before) {
        current.useWorker = false;
        current.workerReady = false;
        current.backendStatus = 'main-thread fallback';
        current.workerBackendState = 'main-thread fallback';
        current.paused = false;
      }
    }, 900);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPatch, { once: true });
  } else {
    applyPatch();
  }
})(globalThis);
