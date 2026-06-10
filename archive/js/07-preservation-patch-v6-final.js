/* Final preservation pass: layout, icon rail, import/export safety, validation, and scientific labels. */
const PreservationPatchV6Final = (() => {
  'use strict';

  const VERSION = 'Preservation Patch Final 2026.05.20';
  const SCHEMA_VERSION = 'pendulum-state-v6';
  const ALLOWED_METHODS = new Set(['rk4','rkf45','hmidpoint','leapfrog','verlet','yoshida4','gauss2','symplectic','rk2','euler']);
  const ALLOWED_SYSTEMS = new Set(['double','triple']);
  const MAX_JSON_BYTES = 5_000_000;
  const MAX_VECTOR_LEN = 64;
  const importLog = [];
  const $ = id => document.getElementById(id);

  const METHOD_INFO = Object.freeze({
    rk4: {kind:'Reference', tone:'warn', text:'RK4 is not symplectic; long-run energy drift is expected.'},
    rkf45: {kind:'Adaptive reference', tone:'warn', text:'RKF45 controls local error but is not energy-preserving by default.'},
    hmidpoint: {kind:'Canonical conditional', tone:'good', text:'Canonical midpoint is only treated as symplectic when the canonical bridge and solver convergence are valid.'},
    leapfrog: {kind:'Pseudo-symplectic', tone:'warn', text:'Leapfrog is applied in θ/ω variables here; exact canonical symplectic claims are not made.'},
    yoshida4: {kind:'Pseudo-symplectic', tone:'warn', text:'Yoshida4 composition is useful, but this file’s θ/ω path is an approximation rather than an exact canonical map.'},
    gauss2: {kind:'Implicit midpoint θ/ω', tone:'warn', text:'Implicit midpoint in θ/ω coordinates can improve stability, but canonical symplectic behavior is not assumed.'},
    symplectic: {kind:'Separable approximation', tone:'warn', text:'Symplectic Euler is used as a low-cost separable-style approximation.'},
    rk2: {kind:'Educational baseline', tone:'bad', text:'RK2 is a low-cost midpoint baseline; visible drift is expected.'},
    euler: {kind:'Diagnostic baseline', tone:'bad', text:'Euler is included for comparison; instability and drift are expected.'},
    verlet: {kind:'Pseudo-symplectic', tone:'warn', text:'Verlet-style updates are approximate in this coordinate implementation.'}
  });

  function record(type, message, extra = {}) {
    const rec = {
      type, message,
      timestamp: new Date().toISOString(),
      system: window.App?.sysType ?? null,
      method: window.App?.method ?? null,
      dt: window.App?.DT ?? null,
      simTime: window.App?.simTime ?? null,
      ...extra
    };
    importLog.push(rec);
    if (importLog.length > 200) importLog.shift();
    try {
      if (window.App) {
        App.preservationPatchFinalLog = importLog;
        App.preservationPatchLog = Array.isArray(App.preservationPatchLog)
          ? App.preservationPatchLog.concat([rec]).slice(-260)
          : importLog.slice();
      }
    } catch (_) {}
    return rec;
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function getPath(obj, path) {
    let cur = obj;
    for (const key of path.split('.')) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[key];
    }
    return cur;
  }

  function firstString(...values) {
    for (const v of values) {
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return undefined;
  }

  function firstNumber(...values) {
    for (const v of values) {
      if (v === null || v === undefined || v === '') continue;
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  }

  function firstObject(...values) {
    for (const v of values) {
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    }
    return undefined;
  }

  function firstArray(...values) {
    for (const v of values) {
      if (Array.isArray(v)) return v;
      if (v && typeof v !== 'string' && typeof v.length === 'number') {
        try { return Array.from(v); } catch (_) {}
      }
    }
    return undefined;
  }

  function limitArray(arr, max, label) {
    if (!Array.isArray(arr)) throw new Error(`${label} must be an array`);
    if (arr.length > max) throw new Error(`${label} exceeds supported length ${max}`);
    return arr;
  }

  function parseImportRoot(rawInput) {
    let raw = rawInput;
    if (typeof rawInput === 'string') {
      if (rawInput.length > MAX_JSON_BYTES) throw new Error('payload exceeds 5 MB supported limit');
      raw = JSON.parse(rawInput);
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('top-level JSON object is required');
    let approxLen = 0;
    try { approxLen = JSON.stringify(raw).length; } catch (_) { approxLen = MAX_JSON_BYTES + 1; }
    if (approxLen > MAX_JSON_BYTES) throw new Error('payload exceeds 5 MB supported limit');
    const snapshot = firstObject(raw.snapshot);
    const primary = snapshot ? {...snapshot, manifest: raw.manifest || snapshot.manifest || null} : {...raw};
    return {raw, obj: primary, snapshot};
  }

  function normalizedParams(obj, raw) {
    const source = firstObject(
      obj.parameters,
      obj.params,
      obj.configuration?.params,
      obj.manifest?.parameters,
      obj.manifest?.configuration?.params,
      raw.manifest?.parameters,
      raw.manifest?.configuration?.params,
      raw.snapshot?.parameters,
      raw.snapshot?.params,
      {}
    ) || {};
    const base = window.App?.P ? {...App.P} : {m1:1,m2:1,m3:1,l1:1.2,l2:1,l3:0.8,g:9.81};
    const params = {...base};
    const ranges = {m1:[0.1,5],m2:[0.1,5],m3:[0.1,5],l1:[0.3,2],l2:[0.3,2],l3:[0.3,2],g:[0,20]};
    for (const [key, value] of Object.entries(source)) {
      if (!(key in ranges)) continue;
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`${key} parameter must be finite`);
      const [lo, hi] = ranges[key];
      if (n < lo || n > hi) throw new Error(`${key} outside UI-supported range [${lo}, ${hi}]`);
      params[key] = n;
    }
    return params;
  }

  function normalizeImportObject(rawInput) {
    const {raw, obj} = parseImportRoot(rawInput);

    const systemObject = firstObject(obj.system, obj.manifest?.system, raw.manifest?.system, obj.snapshot?.system, raw.snapshot?.system);
    const sysType = firstString(
      obj.sysType,
      obj.systemType,
      typeof obj.system === 'string' ? obj.system : undefined,
      systemObject?.type,
      obj.manifest?.system?.type,
      raw.manifest?.system?.type,
      obj.snapshot?.system?.type,
      raw.snapshot?.system?.type,
      obj.configuration?.system,
      obj.manifest?.configuration?.system,
      raw.manifest?.configuration?.system,
      window.App?.sysType,
      'double'
    );
    if (!ALLOWED_SYSTEMS.has(sysType)) throw new Error('unsupported system type: ' + sysType);
    const n = sysType === 'triple' ? 6 : 4;

    const methodObject = firstObject(obj.method, obj.integrator, obj.manifest?.integrator, raw.manifest?.integrator, obj.snapshot?.method, raw.snapshot?.method);
    const method = firstString(
      typeof obj.method === 'string' ? obj.method : undefined,
      methodObject?.id,
      typeof obj.integrator === 'string' ? obj.integrator : undefined,
      obj.integrator?.id,
      obj.integratorSettings?.method,
      obj.manifest?.integrator?.id,
      raw.manifest?.integrator?.id,
      obj.snapshot?.method?.id,
      raw.snapshot?.method?.id,
      window.App?.method,
      'rk4'
    );
    if (!ALLOWED_METHODS.has(method)) throw new Error('method is not whitelisted: ' + method);

    const dt = firstNumber(
      obj.dt,
      obj.numerics?.dt,
      obj.integratorSettings?.dt,
      obj.manifest?.numerics?.dt,
      raw.manifest?.numerics?.dt,
      obj.snapshot?.numerics?.dt,
      raw.snapshot?.numerics?.dt,
      obj.configuration?.dt,
      obj.manifest?.configuration?.dt,
      raw.manifest?.configuration?.dt,
      window.App?.DT
    );
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05) throw new Error('dt is outside supported finite range (0, 0.05]');

    const rawGamma = firstNumber(
      obj.gamma,
      obj.damping,
      obj.parameters?.damping,
      obj.params?.damping,
      obj.manifest?.parameters?.damping,
      raw.manifest?.parameters?.damping,
      obj.configuration?.gamma,
      obj.manifest?.configuration?.gamma,
      raw.manifest?.configuration?.gamma,
      window.App?.gamma,
      0
    );
    if (!Number.isFinite(rawGamma)) throw new Error('gamma must be finite');
    const gamma = Math.max(0, Math.min(2, rawGamma));

    const stateRaw = firstArray(
      obj.state,
      obj.vector,
      obj.initialConditions?.currentState,
      obj.initialConditions?.state,
      obj.snapshot?.state,
      obj.snapshot?.initialConditions?.currentState,
      obj.manifest?.initialConditions?.currentState,
      raw.manifest?.initialConditions?.currentState,
      raw.snapshot?.initialConditions?.currentState,
      obj.state?.vector,
      obj.manifest?.state?.vector,
      raw.manifest?.state?.vector
    );
    limitArray(stateRaw, MAX_VECTOR_LEN, 'state vector');
    if (stateRaw.length !== n) throw new Error(`state length ${stateRaw.length} does not match ${sysType} system length ${n}`);
    const state = stateRaw.map((v, i) => {
      const x = Number(v);
      if (!Number.isFinite(x)) throw new Error('non-finite state value at index ' + i);
      if (Math.abs(x) > 1e6) throw new Error('unreasonably large state value at index ' + i);
      return x;
    });

    const previousRaw = firstArray(
      obj.previousState,
      obj.previous,
      obj.initialConditions?.previousState,
      obj.manifest?.initialConditions?.previousState,
      raw.manifest?.initialConditions?.previousState,
      raw.snapshot?.initialConditions?.previousState
    );
    let previousState = null;
    if (previousRaw) {
      limitArray(previousRaw, MAX_VECTOR_LEN, 'previous state');
      if (previousRaw.length === n) {
        previousState = previousRaw.map((v, i) => {
          const x = Number(v);
          if (!Number.isFinite(x) || Math.abs(x) > 1e6) throw new Error('invalid previous state value at index ' + i);
          return x;
        });
      }
    }

    const simTime = firstNumber(obj.simTime, obj.time, obj.state?.time, obj.manifest?.state?.time, raw.manifest?.state?.time, 0);
    if (!Number.isFinite(simTime) || simTime < 0 || simTime > 1e9) throw new Error('simulation time is invalid');

    const params = normalizedParams(obj, raw);
    const schema = firstString(obj.schemaVersion, obj.manifest?.schemaVersion, raw.manifest?.schemaVersion, raw.schemaVersion);
    const warnings = [];
    if (!schema) warnings.push('schema missing; compatibility fields were used');
    if (rawGamma !== gamma) warnings.push(`gamma clamped from ${rawGamma} to ${gamma} after finite validation`);
    if (sysType === 'triple') warnings.push('triple mode is experimental and less validated');
    if (gamma > 0) warnings.push('damping makes the imported system dissipative');

    return {
      schema: schema || null,
      schemaVersion: SCHEMA_VERSION,
      sysType, systemType: sysType,
      n, state, previousState,
      method, dt, gamma,
      params, simTime: Number(simTime),
      manifest: raw.manifest || obj.manifest || null,
      warnings
    };
  }

  function captureSnapshot() {
    const n = window.App?.stateLen || 4;
    return {
      sysType: App.sysType,
      stateLen: App.stateLen,
      method: App.method,
      DT: App.DT,
      gamma: App.gamma,
      P: {...App.P},
      simTime: App.simTime,
      E0: App.E0,
      maxDrift: App.maxDrift,
      drift: App._drift,
      lastEnergy: App._lastE,
      state: App.state ? Array.from(App.state.subarray(0, n)) : [],
      prevState: App.prevState ? Array.from(App.prevState.subarray(0, n)) : [],
      renderState: App.renderState ? Array.from(App.renderState.subarray(0, n)) : []
    };
  }

  function ensureStateArrays(n) {
    const maxDim = Math.max(n, (typeof CONSTS !== 'undefined' && CONSTS.MAX_STATE_DIM) || 8);
    if (!App.state || App.state.length < maxDim) App.state = new Float64Array(maxDim);
    if (!App.prevState || App.prevState.length < maxDim) App.prevState = new Float64Array(maxDim);
    if (!App.renderState || App.renderState.length < maxDim) App.renderState = new Float64Array(maxDim);
    if (!App.shadow || App.shadow.length < maxDim) App.shadow = new Float64Array(maxDim);
  }

  function setControlValue(id, value, dispatch = true) {
    const el = $(id);
    if (!el) return;
    el.value = String(value);
    if (dispatch) {
      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
    }
  }

  function restoreSnapshot(snap) {
    if (!window.App) return;
    App.sysType = snap.sysType;
    App.stateLen = snap.stateLen;
    App.method = snap.method;
    App.DT = snap.DT;
    App.gamma = snap.gamma;
    App.P = {...snap.P};
    App.simTime = snap.simTime;
    App.E0 = snap.E0;
    App.maxDrift = snap.maxDrift;
    App._drift = snap.drift;
    App._lastE = snap.lastEnergy;
    ensureStateArrays(snap.stateLen);
    App.state.fill(0); App.prevState.fill(0); App.renderState.fill(0);
    snap.state.forEach((v, i) => App.state[i] = v);
    snap.prevState.forEach((v, i) => App.prevState[i] = v);
    snap.renderState.forEach((v, i) => App.renderState[i] = v);
    try {
      setControlValue('sysType', App.sysType, false);
      setControlValue('method', App.method, false);
      setControlValue('dt', App.DT, false);
      setControlValue('gamma', App.gamma, false);
    } catch (_) {}
  }

  function applyNormalizedImportAtomic(next) {
    if (!window.App) throw new Error('App runtime is not initialized');
    const snapshot = captureSnapshot();
    try {
      ensureStateArrays(next.n);
      App.sysType = next.sysType;
      App.stateLen = next.n;
      App.method = next.method;
      App.DT = next.dt;
      App.gamma = next.gamma;
      App.P = {...App.P, ...next.params};

      App.state.fill(0);
      App.prevState.fill(0);
      App.renderState.fill(0);
      App.shadow.fill(0);
      next.state.forEach((v, i) => {
        App.state[i] = v;
        App.renderState[i] = v;
        App.shadow[i] = v;
      });
      if (next.previousState) next.previousState.forEach((v, i) => App.prevState[i] = v);
      else next.state.forEach((v, i) => App.prevState[i] = v);
      if (next.n > 0) App.shadow[0] += (typeof CONSTS !== 'undefined' && CONSTS.LYAP_EPS) || 1e-8;

      App.simTime = next.simTime;
      App.E0 = null;
      App.maxDrift = 0;
      App.lyapSumLog = 0;
      App.lyapTime = 0;
      App._drift = 0;
      App._lastE = 0;
      App._dtNext = App.DT;
      if (App._rkfPrevErr) App._rkfPrevErr.value = 0;
      App.poincPts = [];
      App.fftCache = null;
      App.energyCirc?.clear?.();
      App.lyapCirc?.clear?.();
      App.replayCirc?.clear?.();
      App.trajCirc?.clear?.();

      setControlValue('sysType', next.sysType);
      setControlValue('method', next.method);
      setControlValue('dt', next.dt);
      setControlValue('gamma', next.gamma);
      for (const k of ['m1','m2','m3','l1','l2','l3','g']) {
        if (next.params[k] !== undefined) setControlValue(k, next.params[k]);
      }
      if (next.sysType === 'triple') {
        setControlValue('th1', next.state[0]); setControlValue('th2', next.state[1]); setControlValue('th3', next.state[2]);
        setControlValue('iw1', next.state[3]); setControlValue('iw2', next.state[4]); setControlValue('iw3', next.state[5]);
      } else {
        setControlValue('th1', next.state[0]); setControlValue('th2', next.state[1]);
        setControlValue('iw1', next.state[2]); setControlValue('iw2', next.state[3]);
      }

      if (typeof updateSysType === 'function') updateSysType(App.sysType);
      if (typeof rebuildEnsemble === 'function') rebuildEnsemble();
      if (window.NaNGuard?.snapshot) NaNGuard.snapshot(App.state);
      updateHonestyStatus();
      record('import', 'Validated JSON import applied atomically', {stateLength: next.n, schema: next.schema, warnings: next.warnings});
      window.toast?.('✓ Validated state loaded');
      return true;
    } catch (err) {
      restoreSnapshot(snapshot);
      record('import', 'Atomic import rolled back', {error: String(err.message || err)});
      throw err;
    }
  }

  function methodInfo() {
    return METHOD_INFO[window.App?.method] || {kind:'Experimental', tone:'warn', text:'Unregistered method; treat results as experimental until validated.'};
  }

  function currentConservationStatus() {
    if (!window.App) return 'runtime unavailable';
    if (App.gamma > 0) return 'non-conservative / dissipative';
    const recovered = window.NaNGuard?.count?.() || 0;
    if (recovered > 0) return 'recovered / degraded';
    return 'conservative parameterization';
  }

  function captureCurrentExportObject() {
    if (!window.App) throw new Error('App runtime is not initialized');
    const info = methodInfo();
    const n = App.stateLen || 4;
    const state = Array.from(App.state.subarray(0, n));
    const previous = App.prevState ? Array.from(App.prevState.subarray(0, n)) : state.slice();
    const manifest = {
      schemaVersion: SCHEMA_VERSION,
      appVersion: VERSION,
      exportedAt: new Date().toISOString(),
      system: {type: App.sysType, reliability: App.sysType === 'triple' ? 'experimental / less validated' : 'validated double-pendulum path'},
      method: {id: App.method, classification: info.kind, note: info.text},
      integrator: {id: App.method, classification: info.kind, note: info.text},
      numerics: {dt: App.DT, tolerance: App.tol, stepsPerFrame: App.SPF, speedMultiplier: App.speed, adaptive: App.method === 'rkf45', rkf45: App.rkfStats || null},
      parameters: {...App.P, damping: App.gamma, conservative: App.gamma === 0},
      initialConditions: {currentState: state, previousState: previous},
      diagnostics: {
        E0: App.E0,
        lastEnergy: App._lastE,
        currentDrift: App._drift,
        maxDrift: App.maxDrift,
        lyapunovEstimate: App.lyapTime > 0 ? App.lyapSumLog / App.lyapTime : null,
        lyapunovTime: App.lyapTime,
        poincareCount: App.poincPts?.length || 0,
        recoveryCount: window.NaNGuard?.count?.() ?? null
      },
      runtime: {
        mode: App.runMode || 'demo',
        useWorker: !!App.useWorker,
        backend: App.backend || null,
        webgl2: !!App.capabilities?.webgl2,
        sharedArrayBuffer: !!App.capabilities?.sab
      },
      warningNotes: scientificWarnings()
    };
    return {
      schemaVersion: SCHEMA_VERSION,
      appVersion: VERSION,
      exportedAt: manifest.exportedAt,
      system: manifest.system,
      method: manifest.method,
      integrator: manifest.integrator,
      numerics: manifest.numerics,
      parameters: manifest.parameters,
      initialConditions: manifest.initialConditions,
      state,
      previousState: previous,
      params: {...App.P},
      gamma: App.gamma,
      damping: App.gamma,
      sysType: App.sysType,
      systemType: App.sysType,
      dt: App.DT,
      simTime: App.simTime,
      conservativeStatus: currentConservationStatus(),
      manifest,
      diagnostics: manifest.diagnostics,
      validation: App.preservationPatchFinalValidation || App.preservationPatchValidation || null,
      logs: {finalPatchLog: importLog.slice(-120), legacyPatchLog: App.preservationPatchLog || []}
    };
  }

  function scientificWarnings() {
    const w = [];
    if (!window.App) return ['App runtime unavailable'];
    const info = methodInfo();
    if (App.gamma > 0) w.push('γ > 0: dissipative system; energy conservation is not a validity target.');
    if (App.sysType === 'triple') w.push('Triple pendulum mode is treated as experimental and less validated than the double-pendulum path.');
    if (App.method === 'rk4') w.push('RK4 is non-symplectic; long-run energy drift is possible.');
    if (App.method === 'rkf45') w.push('RKF45 adapts local error but is not Hamiltonian-preserving by default.');
    if (info.kind.includes('Pseudo')) w.push('Pseudo-symplectic label: this θ/ω implementation is not an exact canonical map.');
    if (App.autoQual) w.push('Auto-quality must affect rendering policy only; physics dt/method/SPF are not silently changed by this patch.');
    if (App.runMode === 'recovery') w.push('Recovery mode is explicit; recovered trajectories are logged and are not continuous physical evidence.');
    return w;
  }

  function installLogoAndRail() {
    const logo = document.querySelector('.rail-logo');
    if (logo) {
      logo.setAttribute('role', 'img');
      logo.setAttribute('aria-label', 'Pendulum Lab double pendulum logo');
      logo.setAttribute('title', 'Pendulum Lab double-pendulum emblem');
      logo.innerHTML = `
        <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false" class="pendulum-logo-svg">
          <defs>
            <linearGradient id="pendulumRodFinal" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#18d4f8"/>
              <stop offset="0.55" stop-color="#9d78ff"/>
              <stop offset="1" stop-color="#ff7a2c"/>
            </linearGradient>
          </defs>
          <path d="M8.1 7.2c3.8-2.9 9.8-3.4 14.3-1" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.1" stroke-linecap="round"/>
          <path d="M9.3 7.4c5.5 1.4 12.2 7.1 16.7 17.7" fill="none" stroke="rgba(24,212,248,.20)" stroke-width="1.05" stroke-linecap="round"/>
          <circle cx="9.3" cy="7.4" r="2.15" fill="#eef4ff"/>
          <path d="M9.3 7.4 17.8 17.3 27.2 27.2" fill="none" stroke="url(#pendulumRodFinal)" stroke-width="2.05" stroke-linecap="round"/>
          <circle cx="17.8" cy="17.3" r="3.2" fill="#18d4f8" stroke="rgba(255,255,255,.72)" stroke-width=".75"/>
          <circle cx="27.2" cy="27.2" r="3.65" fill="#ff7a2c" stroke="rgba(255,255,255,.78)" stroke-width=".8"/>
        </svg>`;
    }

    document.querySelectorAll('.tab[data-tip]').forEach(btn => {
      const label = btn.getAttribute('data-tip') || btn.getAttribute('aria-label') || 'Navigation tab';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    });

    const flyout = document.querySelector('.dev-flyout');
    if (flyout) {
      const tools = [
        ['validate','✓','Validation suite'], ['lyap','λ','Lyapunov tools'], ['sweep','▦','Chaos map'],
        ['bifurc','∿','Bifurcation analysis'], ['runtime','⊞','Runtime diagnostics'], ['manifest','⬇','Export manifest'],
        ['audit','⚙','Scientific audit'], ['integrity','🛡','Feature integrity'], ['palette','⌘','Command palette'], ['report','▣','Export report']
      ];
      flyout.innerHTML = '<div class="dev-flyout-title">Tools</div><div class="dev-tool-grid" role="menu" aria-label="Compact developer and research tools"></div>';
      const grid = flyout.querySelector('.dev-tool-grid');
      for (const [action, icon, label] of tools) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'dev-tool-btn';
        b.dataset.railAction = action;
        b.textContent = icon;
        b.setAttribute('role', 'menuitem');
        b.setAttribute('aria-label', label);
        b.setAttribute('title', label);
        b.setAttribute('data-tip', label);
        grid.appendChild(b);
      }
      if (!flyout.dataset.finalDelegated) {
        flyout.dataset.finalDelegated = 'true';
        flyout.addEventListener('click', ev => {
          const btn = ev.target.closest('[data-rail-action]');
          if (!btn) return;
          ev.preventDefault();
          invokeRailAction(btn.dataset.railAction);
        });
      }
    }

    const trigger = document.querySelector('.dev-trigger');
    if (trigger) {
      trigger.textContent = '⌥';
      trigger.setAttribute('aria-label', 'Open developer and research tools');
      trigger.setAttribute('title', 'Developer and research tools');
      trigger.setAttribute('aria-haspopup', 'menu');
    }
  }

  function invokeRailAction(action) {
    try {
      const byTab = {validate:'validate', lyap:'lyap', sweep:'sweep', bifurc:'bifurc'};
      if (byTab[action]) return document.querySelector(`[data-tab="${byTab[action]}"]`)?.click();
      if (action === 'runtime') return $('ueToggleDiag')?.click() || $('rgRunProbe')?.click();
      if (action === 'manifest') return $('exportManifestV3')?.click() || $('ueExportManifest')?.click();
      if (action === 'audit') return $('runAPlusAudit')?.click() || $('runPatchValidation')?.click();
      if (action === 'integrity') return window.PendulumFeatureIntegrity?.showPanel?.();
      if (action === 'palette') return document.dispatchEvent(new KeyboardEvent('keydown', {key:'k', ctrlKey:true, bubbles:true}));
      if (action === 'report') return $('exportAPlusReport')?.click() || $('dlReportBtn')?.click();
    } catch (err) {
      record('ui', 'Rail action failed', {action, error: String(err.message || err)});
      window.toast?.('Tool unavailable: ' + action);
    }
    record('ui', 'Rail action invoked', {action});
  }

  function patchImportExportControls() {
    const oldFile = $('jsonFile');
    let file = oldFile;
    if (oldFile && !oldFile.dataset.finalImportBound) {
      file = oldFile.cloneNode(true);
      file.dataset.finalImportBound = 'true';
      oldFile.replaceWith(file);
    }

    const oldLoad = $('loadJsonBtn');
    if (oldLoad && file && !oldLoad.dataset.finalImportBound) {
      const load = oldLoad.cloneNode(true);
      load.dataset.finalImportBound = 'true';
      oldLoad.replaceWith(load);
      load.addEventListener('click', ev => {
        ev.preventDefault();
        file.click();
      });
    }

    if (file) {
      file.addEventListener('change', function() {
        const selected = this.files && this.files[0];
        if (!selected) return;
        if (selected.size > MAX_JSON_BYTES) {
          record('import', 'Rejected oversized JSON', {size: selected.size});
          window.toast?.('⚠ Load failed: file too large');
          this.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const next = normalizeImportObject(String(reader.result));
            applyNormalizedImportAtomic(next);
          } catch (err) {
            record('import', 'JSON import rejected', {error: String(err.message || err)});
            window.toast?.('⚠ Load failed: ' + String(err.message || err));
          }
        };
        reader.onerror = () => {
          record('import', 'FileReader failed', {});
          window.toast?.('⚠ Load failed: unreadable file');
        };
        reader.readAsText(selected);
        this.value = '';
      });
    }

    const oldExport = $('dlJsonBtn');
    if (oldExport && !oldExport.dataset.finalExportBound) {
      const btn = oldExport.cloneNode(true);
      btn.dataset.finalExportBound = 'true';
      oldExport.replaceWith(btn);
      btn.addEventListener('click', ev => {
        ev.preventDefault();
        try {
          const data = captureCurrentExportObject();
          dlText('pendulum_state_v6.json', JSON.stringify(data, null, 2), 'application/json');
          record('export', 'JSON state exported', {schemaVersion: SCHEMA_VERSION, stateLength: data.state.length});
          window.toast?.('⬇ JSON saved with metadata');
        } catch (err) {
          record('export', 'JSON export failed', {error: String(err.message || err)});
          window.toast?.('⚠ Export failed: ' + String(err.message || err));
        }
      });
    }

    const oldReport = $('dlReportBtn');
    if (oldReport && !oldReport.dataset.finalReportBound) {
      const report = oldReport.cloneNode(true);
      report.dataset.finalReportBound = 'true';
      oldReport.replaceWith(report);
      report.addEventListener('click', ev => {
        ev.preventDefault();
        const info = methodInfo();
        const warnings = scientificWarnings();
        const lines = [
          'PENDULUM LAB — SESSION REPORT',
          '================================',
          `Generated: ${new Date().toISOString()}`,
          `System: ${App.sysType} pendulum${App.sysType === 'triple' ? ' (experimental / less validated)' : ''}`,
          `Mode: ${App.runMode || 'demo'}`,
          `Method: ${App.method} — ${info.kind}`,
          `Method note: ${info.text}`,
          `dt: ${App.DT} s · tolerance: ${App.tol} · SPF: ${App.SPF}`,
          `Damping γ: ${App.gamma} (${App.gamma > 0 ? 'dissipative / non-conservative' : 'conservative parameterization'})`,
          '',
          'RESULTS',
          '-------',
          `Simulation time: ${(App.simTime || 0).toFixed(3)} s`,
          `Current |ΔE/E₀|: ${Math.abs(App._drift || 0).toExponential(4)}`,
          `Max |ΔE/E₀|: ${(App.maxDrift || 0).toExponential(4)}`,
          `Lyapunov λ₁: ${App.lyapTime > 0 ? (App.lyapSumLog / App.lyapTime).toFixed(6) + ' /s' : 'N/A'}`,
          `Poincaré points: ${App.poincPts?.length || 0}`,
          `Recovery count: ${window.NaNGuard?.count?.() ?? 'N/A'}`,
          '',
          'SCIENTIFIC NOTES',
          '----------------',
          ...warnings.map(w => '- ' + w),
          '- Recovered trajectories should not be treated as physically continuous through recovery points.',
          '- Browser floating-point arithmetic and finite buffers limit reproducibility claims.'
        ];
        dlText('pendulum_report.txt', lines.join('\n'), 'text/plain');
        record('export', 'Text report exported', {});
        window.toast?.('⬇ Report saved');
      });
    }
  }

  function installScientificHonesty() {
    function update() {
      if (!window.App) return;
      const info = methodInfo();
      const methodBox = $('methodHonesty');
      if (methodBox) {
        methodBox.className = 'honesty-note ' + info.tone;
        methodBox.textContent = `${info.kind}: ${info.text}`;
      }
      const modeBox = $('modeHonesty');
      if (modeBox) {
        const warnings = scientificWarnings();
        modeBox.className = 'honesty-note ' + (warnings.length ? 'warn' : 'good');
        modeBox.textContent = warnings.join(' ') || 'Conservative undamped double-pendulum path with ordinary browser floating-point limits.';
      }
      const cons = $('conservationStat');
      if (cons) {
        cons.textContent = currentConservationStatus();
        cons.className = 'sval ' + (App.gamma > 0 ? 'warn' : 'good');
      }
      const methodNote = $('methodNoteStat');
      if (methodNote) {
        methodNote.textContent = info.kind;
        methodNote.className = 'sval ' + (info.tone === 'good' ? 'good' : info.tone === 'bad' ? 'bad' : 'warn');
      }
    }
    update();
    document.addEventListener('change', ev => {
      if (ev.target && ['method','gamma','sysType','autoQual'].includes(ev.target.id)) setTimeout(update, 0);
    }, true);
    setInterval(update, 1400);
  }

  function patchModeBehavior() {
    const oldModeSel = $('riModeSelect');
    if (!oldModeSel || oldModeSel.dataset.finalModeBound) return;

    /* Clone to remove older mode listeners that silently changed method/worker state. */
    const modeSel = oldModeSel.cloneNode(false);
    modeSel.id = oldModeSel.id;
    modeSel.className = oldModeSel.className;
    modeSel.dataset.finalModeBound = 'true';
    modeSel.innerHTML = '<option value="demo">Demo Mode</option><option value="research">Research / Accuracy Mode</option><option value="performance">Performance Mode</option><option value="recovery">Recovery Mode</option>';
    modeSel.value = oldModeSel.value || 'demo';
    modeSel.title = 'Mode changes must remain visible. Performance mode reduces rendering pressure only.';
    oldModeSel.replaceWith(modeSel);

    modeSel.addEventListener('change', () => {
      const mode = modeSel.value;
      const workerBefore = !!App.useWorker;
      const methodBefore = App.method;
      const dtBefore = App.DT;
      const spfBefore = App.SPF;
      App.runMode = mode;

      if (mode === 'research') {
        const auto = $('autoQual');
        if (auto?.checked) {
          auto.checked = false;
          auto.dispatchEvent(new Event('change', {bubbles:true}));
        }
        App.autoQual = false;
        App.useWorker = workerBefore;
        App.method = methodBefore;
        App.DT = dtBefore;
        App.SPF = spfBefore;
        record('mode', 'Research / Accuracy Mode selected', {
          workerPreserved: workerBefore,
          methodPreserved: methodBefore,
          dtPreserved: dtBefore,
          spfPreserved: spfBefore,
          policy: 'no hidden state repair; no forced worker disable; no silent method or dt change'
        });
      } else if (mode === 'performance') {
        App.useWorker = workerBefore;
        App.method = methodBefore;
        App.DT = dtBefore;
        App.SPF = spfBefore;
        App.glowMode = false;
        App.longExpose = false;
        record('mode', 'Performance Mode selected', {
          policy: 'rendering pressure reduced only; physics dt/method/SPF preserved',
          methodPreserved: methodBefore,
          dtPreserved: dtBefore,
          spfPreserved: spfBefore
        });
      } else if (mode === 'recovery') {
        App.useWorker = workerBefore;
        record('mode', 'Recovery Mode selected explicitly', {policy: 'interventions are logged; recovered trajectory is marked discontinuous'});
      } else {
        App.useWorker = workerBefore;
        record('mode', 'Demo Mode selected', {workerPreserved: workerBefore});
      }
      installScientificHonesty();
    });
  }

  function installLayoutCSS() {
    if ($('finalPreservationStyle')) return;
    const style = document.createElement('style');
    style.id = 'finalPreservationStyle';
    style.textContent = `
      .app-shell{display:grid;grid-template-columns:var(--rail-w) minmax(0,1fr);min-height:100vh;align-items:start}
      .app-shell>.rail{grid-column:1}
      .app-shell>.main-col{grid-column:2;min-width:0}
      .rail .dev-tool-btn,.rail .tab,.rail .dev-trigger{overflow:visible;text-indent:0;white-space:nowrap}
      .rail .dev-tool-btn{font-size:14px;line-height:1}
      .rail .dev-tool-btn span,.rail .dev-trigger span{display:none!important}
      .rail .dev-flyout{max-height:min(70vh,360px);overflow:visible}
      .rail-logo .pendulum-logo-svg text{display:none!important}
      @media(max-width:560px){
        .app-shell{display:block}
        .app-shell>.main-col{grid-column:auto}
        .rail .dev-flyout{overflow:auto}
      }`;
    document.head.appendChild(style);
  }

  function validateResult(name, pass, measured, expected, subsystem, likelyCause, severity = 'medium') {
    return {name, pass: !!pass, measured: String(measured), expected: String(expected), subsystem, likelyCause, severity};
  }

  function estimateFirstScreenVisibility() {
    const main = $('main');
    if (!main) return 'main canvas missing';
    const rect = main.getBoundingClientRect();
    return `top=${rect.top.toFixed(1)}, bottom=${rect.bottom.toFixed(1)}, viewport=${window.innerHeight}`;
  }

  function runFinalValidation(showToast = false) {
    const results = [];
    const add = (...args) => results.push(validateResult(...args));

    try {
      const shell = document.querySelector('.app-shell');
      const direct = shell ? Array.from(shell.children).filter(el => el.nodeType === 1).map(el => `${el.tagName.toLowerCase()}.${Array.from(el.classList).join('.')}`) : [];
      add('main structural layout valid', !!shell && direct.includes('aside.rail') && direct.includes('main.main-col') && direct.length === 2, direct.join(' | ') || 'missing', 'direct children: aside.rail + main.main-col only', 'DOM', 'Malformed closing tag around dev-hub/dev-flyout', 'critical');
    } catch (e) { add('main structural layout valid', false, e.message, 'no exception', 'DOM', 'Layout inspection failed', 'critical'); }

    try {
      const shell = document.querySelector('.app-shell');
      const rail = document.querySelector('aside.rail');
      const main = document.querySelector('main.main-col');
      add('.app-shell contains rail and main-col correctly', !!(shell && rail?.parentElement === shell && main?.parentElement === shell), `rail parent=${rail?.parentElement?.className || 'none'}, main parent=${main?.parentElement?.className || 'none'}`, 'both direct children of .app-shell', 'DOM', 'Main content escaped grid shell', 'critical');
    } catch (e) { add('.app-shell contains rail and main-col correctly', false, e.message, 'no exception', 'DOM', 'Parent check failed', 'critical'); }

    try {
      const rect = $('main')?.getBoundingClientRect();
      add('first-screen pendulum visibility / layout sanity', !!rect && rect.top < Math.min(520, window.innerHeight * 0.85), estimateFirstScreenVisibility(), 'canvas begins within first viewport', 'layout', 'Header/rail DOM nesting pushed canvas below fold', 'high');
    } catch (e) { add('first-screen pendulum visibility / layout sanity', false, e.message, 'no exception', 'layout', 'Canvas visibility check failed', 'high'); }

    try {
      const logo = document.querySelector('.rail-logo');
      const text = (logo?.textContent || '').trim();
      add('logo has no PL visible content', !/PL/i.test(text), text || 'no text content', 'no PL text node in logo', 'UI', 'Logo SVG still contains text element', 'high');
    } catch (e) { add('logo has no PL visible content', false, e.message, 'no exception', 'UI', 'Logo check failed', 'high'); }

    try {
      const bad = Array.from(document.querySelectorAll('.dev-tool-btn,.dev-trigger')).filter(el => (el.textContent || '').trim().length > 2);
      add('no permanent rail text', bad.length === 0, bad.map(b => b.textContent.trim()).join(', ') || 'icon-only', 'no visible lower-rail words', 'UI', 'Text label leaked into compact rail', 'high');
    } catch (e) { add('no permanent rail text', false, e.message, 'no exception', 'UI', 'Rail text check failed', 'high'); }

    try {
      const ids = ['main','energy','lyap','phase','poincare','fft','method','sysType','gamma','dt','dlJsonBtn','jsonFile'];
      const missing = ids.filter(id => !$(id));
      add('required DOM IDs present', missing.length === 0, missing.join(', ') || 'none', 'all required IDs resolve', 'DOM', 'Preserved markup or injector failed', missing.length ? 'high' : 'low');
    } catch (e) { add('required DOM IDs present', false, e.message, 'no exception', 'DOM', 'DOM ID probe failed', 'high'); }

    try {
      const c = $('main');
      add('main canvas initialization', !!(c && c.getContext && c.width > 0 && c.height > 0), c ? `${c.width}×${c.height}` : 'missing', 'valid canvas element', 'rendering', 'Main canvas missing or invalid', 'critical');
    } catch (e) { add('main canvas initialization', false, e.message, 'no exception', 'rendering', 'Canvas probe failed', 'critical'); }

    try {
      const old = App.activeTab || 'lab';
      if (typeof switchTab === 'function') { switchTab('validate'); switchTab(old); }
      add('tab switching', true, `returned to ${old}`, 'no exception', 'UI', 'Tab handler missing or invalid', 'medium');
    } catch (e) { add('tab switching', false, e.message, 'no exception', 'UI', 'Tab switch threw', 'medium'); }

    try { add('method whitelist', ALLOWED_METHODS.has(App.method), App.method, 'method in whitelist', 'numerics', 'Unknown method selected', 'critical'); }
    catch (e) { add('method whitelist', false, e.message, 'no exception', 'numerics', 'Whitelist check failed', 'critical'); }

    try {
      const out = new Float64Array(4);
      Physics.rhs2(new Float64Array([0.2,0.1,0,0]), {m1:1,m2:1,l1:1,l2:1,g:9.81}, 0, out);
      add('finite RHS output', Array.from(out).every(Number.isFinite), Array.from(out).map(x => x.toExponential(2)).join(', '), 'all finite', 'numerics', 'rhs2 produced NaN/Infinity', 'critical');
    } catch (e) { add('finite RHS output', false, e.message, 'no exception', 'numerics', 'RHS probe failed', 'critical'); }

    try {
      const out = new Float64Array(4), st = new Float64Array([0.2,0.1,0,0]);
      Physics.rk4step(st, 0.002, (x,o) => Physics.rhs2(x,{m1:1,m2:1,l1:1,l2:1,g:9.81},0,o), 4, out);
      add('RK4 single-step finite', Array.from(out).every(Number.isFinite), Array.from(out).map(x => x.toExponential(2)).join(', '), 'all finite', 'integrator', 'RK4 step produced invalid state', 'critical');
    } catch (e) { add('RK4 single-step finite', false, e.message, 'no exception', 'integrator', 'RK4 probe failed', 'critical'); }

    try {
      const out = new Float64Array(4), st = new Float64Array([0.2,0.1,0,0]);
      Physics.step('rkf45', st, 0.003, (x,o) => Physics.rhs2(x,{m1:1,m2:1,l1:1,l2:1,g:9.81},0,o), 4, out, {tol:1e-7});
      add('RKF45 accounting sanity', Array.from(out).every(Number.isFinite), 'finite accepted state', 'no NaN/Infinity', 'integrator', 'RKF45 step invalid', 'medium');
    } catch (e) { add('RKF45 accounting sanity', false, e.message, 'no exception', 'integrator', 'RKF45 probe failed', 'medium'); }

    try {
      const E = Physics.energy2 ? Physics.energy2(new Float64Array([0.1,0.11,0,0]), {m1:1,m2:1,l1:1,l2:1,g:9.81}) : NaN;
      add('conservative energy finite', Number.isFinite(E), E, 'finite energy', 'physics', 'Energy evaluator unavailable or invalid', 'medium');
    } catch (e) { add('conservative energy finite', false, e.message, 'no exception', 'physics', 'Energy probe failed', 'medium'); }

    try { add('damping warning correctness', App.gamma > 0 ? currentConservationStatus().includes('dissipative') : true, currentConservationStatus(), 'γ>0 reports non-conservative', 'diagnostics', 'Damping not reflected in conservation status', 'medium'); }
    catch (e) { add('damping warning correctness', false, e.message, 'no exception', 'diagnostics', 'Damping check failed', 'medium'); }

    try {
      const pcOk = Array.isArray(App.poincPts) && App.poincPts.length <= ((typeof CONSTS !== 'undefined' && CONSTS.POINC_CAP) || 100000);
      add('Poincaré data shape', pcOk, `${App.poincPts?.length || 0} points`, 'array within cap', 'analysis', 'Poincaré buffer missing or oversized', 'medium');
    } catch (e) { add('Poincaré data shape', false, e.message, 'no exception', 'analysis', 'Poincaré probe failed', 'medium'); }

    try { add('FFT data shape / cache sanity', App.fftCache === null || typeof App.fftCache === 'object', App.fftCache === null ? 'empty cache' : 'object cache', 'null or object', 'analysis', 'FFT cache malformed', 'low'); }
    catch (e) { add('FFT data shape / cache sanity', false, e.message, 'no exception', 'analysis', 'FFT check failed', 'low'); }

    try { add('Worker availability / fallback', true, typeof Worker !== 'undefined' ? 'Worker API available' : 'fallback required', 'capability check does not throw', 'runtime', 'Worker capability probe failed', 'low'); }
    catch (e) { add('Worker availability / fallback', false, e.message, 'no exception', 'runtime', 'Worker check failed', 'low'); }

    try {
      const gpu = $('gpuCanvas');
      add('WebGL handler presence', true, gpu ? 'GPU canvas present' : 'GPU panel deferred or absent', 'no throw', 'runtime', 'GPU panel not initialized yet', 'low');
    } catch (e) { add('WebGL handler presence', false, e.message, 'no exception', 'runtime', 'WebGL check failed', 'low'); }

    try {
      const data = captureCurrentExportObject();
      add('export schema test', !!(data.schemaVersion && data.system?.type && data.method?.id && data.numerics?.dt && Array.isArray(data.initialConditions?.currentState)), `schema=${data.schemaVersion}, system=${data.system?.type}, method=${data.method?.id}`, 'schema/system/method/numerics/state present', 'export', 'Export object missing required metadata', 'critical');
    } catch (e) { add('export schema test', false, e.message, 'no exception', 'export', 'Export schema failed', 'critical'); }

    try {
      const before = captureSnapshot();
      const exported = captureCurrentExportObject();
      const normalized = normalizeImportObject(JSON.stringify(exported));
      const after = captureSnapshot();
      const unchanged = JSON.stringify(before) === JSON.stringify(after);
      const ok = normalized.sysType === App.sysType && normalized.method === App.method && normalized.dt === App.DT && normalized.gamma === App.gamma && normalized.state.length === App.stateLen && unchanged;
      add('JSON export/import round-trip dry-run', ok, `system=${normalized.sysType}, method=${normalized.method}, dt=${normalized.dt}, γ=${normalized.gamma}, n=${normalized.state.length}, unchanged=${unchanged}`, 'normalize export without live mutation', 'import/export', 'Round-trip normalization failed or mutated live state', 'critical');
    } catch (e) { add('JSON export/import round-trip dry-run', false, e.message, 'no exception', 'import/export', 'Round-trip dry-run failed', 'critical'); }

    try {
      let rejected = false;
      try { normalizeImportObject({sysType:'double', method:'not-a-method', dt:0.003, gamma:0, state:[1,1,0,0]}); } catch (_) { rejected = true; }
      add('invalid method rejected', rejected, rejected ? 'rejected' : 'accepted', 'reject unknown method', 'import', 'Method whitelist failed', 'critical');
    } catch (e) { add('invalid method rejected', false, e.message, 'no exception', 'import', 'Invalid method test failed', 'critical'); }

    try {
      let rejected = false;
      try { normalizeImportObject({sysType:'double', method:'rk4', dt:0.003, gamma:0, state:[1,Infinity,0,0]}); } catch (_) { rejected = true; }
      add('non-finite state rejected', rejected, rejected ? 'rejected' : 'accepted', 'reject Infinity/NaN', 'import', 'Non-finite state accepted', 'critical');
    } catch (e) { add('non-finite state rejected', false, e.message, 'no exception', 'import', 'Non-finite test failed', 'critical'); }

    try {
      let rejected = false;
      try { normalizeImportObject({sysType:'double', method:'rk4', dt:0.003, gamma:0, state:new Array(100).fill(0)}); } catch (_) { rejected = true; }
      add('oversized array rejected', rejected, rejected ? 'rejected' : 'accepted', 'reject oversized arrays', 'import', 'Oversized array accepted', 'high');
    } catch (e) { add('oversized array rejected', false, e.message, 'no exception', 'import', 'Oversized test failed', 'high'); }

    try { add('report export availability', !!$('dlReportBtn'), $('dlReportBtn') ? 'button present' : 'missing', 'report export button present', 'export', 'Report export unavailable', 'medium'); }
    catch (e) { add('report export availability', false, e.message, 'no exception', 'export', 'Report check failed', 'medium'); }

    try { add('crash/audit export availability', !!($('exportPatchLog') || $('exportAPlusReport') || window.PendulumLabEnterprise?.exportCrashDump), 'patch/audit/crash export path checked', 'at least one export path', 'export', 'Crash/audit export unavailable', 'medium'); }
    catch (e) { add('crash/audit export availability', false, e.message, 'no exception', 'export', 'Crash/audit check failed', 'medium'); }

    try {
      const missing = ['validate','lyap','sweep','bifurc','runtime','manifest','audit','integrity','palette','report'].filter(a => !document.querySelector(`[data-rail-action="${a}"]`));
      add('compact rail tool presence', missing.length === 0, missing.join(', ') || 'all present', '10 icon-only rail actions', 'UI', 'Compact rail lost an action', 'medium');
    } catch (e) { add('compact rail tool presence', false, e.message, 'no exception', 'UI', 'Rail action check failed', 'medium'); }

    try {
      const missing = Array.from(document.querySelectorAll('.dev-tool-btn,.tab,.dev-trigger')).filter(b => !b.getAttribute('aria-label') || !b.getAttribute('title')).length;
      add('icon-only accessibility labels', missing === 0, `${missing} missing`, '0 missing', 'accessibility', 'Icon-only control lacks label/title', 'medium');
    } catch (e) { add('icon-only accessibility labels', false, e.message, 'no exception', 'accessibility', 'Accessibility check failed', 'medium'); }

    const passed = results.filter(r => r.pass).length;
    const validation = {schemaVersion: SCHEMA_VERSION, generatedAt: new Date().toISOString(), passed, failed: results.length - passed, results};
    if (window.App) App.preservationPatchFinalValidation = validation;
    const box = $('patchValidationResults');
    if (box) {
      box.innerHTML = results.map(r => `${r.pass ? '✓' : '✗'} ${esc(r.name)} — measured: ${esc(r.measured)} · expected: ${esc(r.expected)} · subsystem: ${esc(r.subsystem)} · severity: ${esc(r.severity)} · likely cause: ${esc(r.likelyCause)}`).join('<br>');
    }
    record('validation', 'Final preservation validation run', {passed, failed: results.length - passed});
    if (showToast) window.toast?.(`Final validation ${passed}/${results.length} passed`);
    return validation;
  }

  function patchValidationControls() {
    const btn = $('runPatchValidation') || $('runValidation');
    if (btn && !btn.dataset.finalValidationBound) {
      btn.dataset.finalValidationBound = 'true';
      btn.addEventListener('click', () => setTimeout(() => runFinalValidation(false), 120));
    }
    const exportBtn = $('exportPatchLog');
    if (exportBtn && !exportBtn.dataset.finalLogBound) {
      exportBtn.dataset.finalLogBound = 'true';
      exportBtn.addEventListener('click', () => {
        const payload = {schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), version: VERSION, validation: App.preservationPatchFinalValidation || null, log: importLog};
        dlText('pendulum_preservation_patch_final_log.json', JSON.stringify(payload, null, 2), 'application/json');
      });
    }
  }

  function install() {
    installLayoutCSS();
    installLogoAndRail();
    patchImportExportControls();
    installScientificHonesty();
    patchModeBehavior();
    patchValidationControls();

    window.normalizeImportObject = normalizeImportObject;
    window.PendulumLabPreservationPatchFinal = Object.freeze({
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      normalizeImportObject,
      applyNormalizedImportAtomic,
      captureCurrentExportObject,
      runFinalValidation,
      logs: () => importLog.slice()
    });

    record('boot', 'Final preservation patch installed', {version: VERSION});
  }

  return Object.freeze({install, version: VERSION});
})();

try {
  PreservationPatchV6Final.install();
} catch (err) {
  console.error('[PreservationPatchV6Final] install failed', err);
}
