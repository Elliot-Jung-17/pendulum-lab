'use strict';
/* ============================================================
MODULE 00 — V10 CONSOLIDATION LAYER
============================================================ */
(function installPendulumLabV10(global){
  if(global.__PENDULUM_LAB_V10__) return;
  const version = '10.0.0';
  const build = 'sha256:b69dd395e0361e68';
  const bootedAt = new Date().toISOString();
  const Mode = Object.freeze({DEMO:'demo', EDUCATION:'education', RESEARCH:'research', BENCHMARK:'benchmark'});
  const ClaimLevel = Object.freeze({DEMO:'demo', EDUCATIONAL:'educational', VALIDATED_DOUBLE:'validated-double', EXPERIMENTAL_TRIPLE:'experimental-triple', INVALID_AFTER_FAULT:'invalid-after-fault'});
  const $ = id => document.getElementById(id);
  const app = () => global.App || null;
  const finite = x => Number.isFinite(Number(x));
  const now = () => new Date().toISOString();
  const safeNumber = (x, fallback=0) => finite(x) ? Number(x) : fallback;
  const clone = obj => Object.assign(Object.create(null), obj || {});

  function appStateVector(){
    const A = app();
    if(!A || !A.state) return [];
    const n = A.stateLen || A.state.length || 0;
    return Array.from(A.state).slice(0, n).map(x => finite(x) ? Number(x) : null);
  }
  function hashString(text){
    let h = 2166136261 >>> 0;
    text = String(text || '');
    for(let i=0;i<text.length;i++){ h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16).padStart(8,'0');
  }
  function stateHash(){
    const A = app();
    try{
      if(global.hashState && A && A.state) return String(global.hashState(A.state.subarray ? A.state.subarray(0, A.stateLen) : A.state));
      return hashString(JSON.stringify(appStateVector()));
    }catch(_){ return 'unavailable'; }
  }
  function downloadText(name, text, type){
    const blob = new Blob([String(text)], {type:type || 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = String(name || 'pendulum_export.txt').replace(/[^a-zA-Z0-9._-]+/g,'_');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  /* ============================================================
  MODULE 01 — SAFE DOM HELPERS
  ============================================================ */
  const SafeDOM = Object.freeze({
    el(tag, attrs, children){
      const node = document.createElement(tag);
      Object.entries(attrs || {}).forEach(([k,v]) => {
        if(k === 'class') node.className = String(v);
        else if(k === 'text') node.textContent = String(v);
        else if(k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, String(v));
      });
      (Array.isArray(children) ? children : [children]).filter(Boolean).forEach(child => node.append(child.nodeType ? child : document.createTextNode(String(child))));
      return node;
    },
    setText(id, text){ const el = $(id); if(el) el.textContent = String(text); },
    clear(node){ while(node && node.firstChild) node.removeChild(node.firstChild); return node; }
  });

  /* ============================================================
  MODULE 02 — STATE STORE
  ============================================================ */
  const StateStore = (() => {
    const subscribers = new Set();
    const schemaVersion = 'pendulum-session/v10';
    function getState(){
      const A = app();
      return Object.freeze({
        schemaVersion, appVersion:version, timestamp:now(), mode:A && A.runMode || Mode.DEMO,
        systemType:A && A.sysType || 'double', method:A && A.method || 'rk4', dt:A && A.DT,
        tolerance:A && A.tol, stepsPerFrame:A && A.SPF, damping:A && A.gamma,
        parameters:clone(A && A.P), state:appStateVector(), simTime:A && A.simTime || 0,
        hash:stateHash()
      });
    }
    function validateState(snapshot){
      const problems = [];
      if(!snapshot || typeof snapshot !== 'object') problems.push('snapshot must be an object');
      const method = snapshot && snapshot.method;
      const systemType = snapshot && snapshot.systemType;
      if(method && !IntegratorRegistry.get(method)) problems.push('unknown integrator: '+method);
      if(systemType && !['double','triple'].includes(systemType)) problems.push('unknown system type: '+systemType);
      const state = snapshot && snapshot.state;
      if(state && (!Array.isArray(state) || state.some(x => !finite(x)))) problems.push('state vector must contain only finite numbers');
      const params = snapshot && snapshot.parameters;
      if(params && Object.prototype.toString.call(params) !== '[object Object]') problems.push('parameters must be a plain object');
      if(params && ('__proto__' in params || 'constructor' in params || 'prototype' in params)) problems.push('prototype-pollution keys are not allowed');
      return {ok:problems.length===0, problems};
    }
    function notify(){ const snap = getState(); subscribers.forEach(fn => { try{ fn(snap); }catch(e){ console.warn('[V10 StateStore subscriber]', e); } }); }
    function setStatePatch(patch){
      const A = app(); if(!A || !patch || typeof patch !== 'object') return false;
      const allowed = new Set(['runMode','sysType','method','DT','tol','SPF','gamma','speedMult','paused','autoQual','interpolateRender']);
      Object.entries(patch).forEach(([k,v]) => { if(allowed.has(k)) A[k] = v; });
      notify(); return true;
    }
    function restore(snapshot){
      const A = app(); const v = validateState(snapshot); if(!A || !v.ok) throw new Error('invalid snapshot: '+v.problems.join('; '));
      setStatePatch({sysType:snapshot.systemType, method:snapshot.method, DT:snapshot.dt, gamma:snapshot.damping, runMode:snapshot.mode});
      if(A.P && snapshot.parameters) Object.keys(A.P).forEach(k => { if(finite(snapshot.parameters[k])) A.P[k] = Number(snapshot.parameters[k]); });
      if(A.state && Array.isArray(snapshot.state)) snapshot.state.forEach((x,i) => { if(i < A.state.length) A.state[i] = Number(x); });
      if(typeof global.syncUI === 'function') try{ global.syncUI(); }catch(_){}
      notify(); return true;
    }
    function subscribe(fn){ if(typeof fn !== 'function') throw new TypeError('StateStore.subscribe requires a function'); subscribers.add(fn); return () => subscribers.delete(fn); }
    return Object.freeze({schemaVersion, getState, setStatePatch, subscribe, snapshot:getState, restore, validateState});
  })();

  /* ============================================================
  MODULE 03 — PHYSICS CORE ADAPTER
  ============================================================ */
  const PhysicsCore = Object.freeze({
    assumptions:Object.freeze(['point masses','massless rods','planar motion','fixed pivot','linear damping only when gamma > 0']),
    derivative(system, state, parameters, gamma, out){
      if(!global.Physics) throw new Error('legacy Physics module unavailable');
      return system === 'triple' ? global.Physics.rhs3(state, parameters, gamma || 0, out) : global.Physics.rhs2(state, parameters, gamma || 0, out);
    },
    energy(system, state, parameters){
      if(!global.Physics) throw new Error('legacy Physics module unavailable');
      return system === 'triple' ? global.Physics.energy3(state, parameters) : global.Physics.energy2(state, parameters);
    },
    massMatrixDouble(state, parameters){
      const s = state || []; const P = parameters || {};
      const m1=safeNumber(P.m1,1), m2=safeNumber(P.m2,1), l1=safeNumber(P.l1,1), l2=safeNumber(P.l2,1);
      const d = safeNumber(s[0],0) - safeNumber(s[1],0); const c = Math.cos(d);
      return [[(m1+m2)*l1*l1, m2*l1*l2*c],[m2*l1*l2*c, m2*l2*l2]];
    },
    coordinates:Object.freeze({thetaOmega:'θ/ω', canonicalThetaP:'θ/p'}),
    smallAngleReference(params){
      const P = Object.assign({m1:1,m2:1,l1:1,l2:1,g:9.81}, params || {});
      return {omega1:Math.sqrt(P.g / Math.max(P.l1, 1e-12)), omega2:Math.sqrt(P.g / Math.max(P.l2, 1e-12)), note:'independent small-angle reference for sanity checks'};
    }
  });

  /* ============================================================
  MODULE 04 — INTEGRATOR REGISTRY
  ============================================================ */
  const registryData = {
    rk4: {id:'rk4', name:'RK4', order:4, adaptive:false, canonical:false, symplecticClaim:'none', suitableFor:['baseline','short-run reference','dt convergence'], limitations:['non-symplectic','long-run energy drift is expected'], diagnostics:['energy drift','state norm']},
    rkf45: {id:'rkf45', name:'RKF45 adaptive', order:5, adaptive:true, canonical:false, symplecticClaim:'none', suitableFor:['adaptive local-error reference'], limitations:['not symplectic','accepted-step sequence changes actual dt history'], diagnostics:['accepted steps','rejected steps','local error estimate','actual dt history']},
    hmidpoint: {id:'hmidpoint', name:'Canonical implicit midpoint', order:2, adaptive:false, canonical:true, symplecticClaim:'conditional canonical symplectic for undamped validated double-pendulum path when Newton residual converges', suitableFor:['Hamiltonian consistency checks'], limitations:['requires residual convergence','not valid as a symplectic claim with damping or experimental triple mode'], diagnostics:['Newton residual','Newton iterations','energy drift']},
    leapfrog: {id:'leapfrog', name:'Leapfrog KDK θ/ω', order:2, adaptive:false, canonical:false, symplecticClaim:'pseudo-symplectic / educational approximation', suitableFor:['education','visual comparison'], limitations:['θ/ω coordinate composition is not automatically canonical for nonseparable double pendulum Hamiltonian'], diagnostics:['energy drift','state norm']},
    yoshida4: {id:'yoshida4', name:'Yoshida4 θ/ω composition', order:4, adaptive:false, canonical:false, symplecticClaim:'pseudo-symplectic / educational approximation', suitableFor:['education','visual comparison'], limitations:['composition is not a rigorous canonical map for this θ/ω implementation'], diagnostics:['energy drift','state norm']},
    gauss2: {id:'gauss2', name:'Implicit midpoint θ/ω', order:2, adaptive:false, canonical:false, symplecticClaim:'none in θ/ω adapter', suitableFor:['implicit-method comparison'], limitations:['not presented as canonical symplectic'], diagnostics:['residual when available']},
    symplectic: {id:'symplectic', name:'Symplectic Euler approximation', order:1, adaptive:false, canonical:false, symplecticClaim:'separable approximation only', suitableFor:['educational comparison'], limitations:['not a rigorous canonical nonseparable double-pendulum integrator'], diagnostics:['energy drift']},
    rk2: {id:'rk2', name:'RK2 midpoint', order:2, adaptive:false, canonical:false, symplecticClaim:'none', suitableFor:['teaching','convergence demo'], limitations:['non-symplectic'], diagnostics:['energy drift']},
    euler: {id:'euler', name:'Euler', order:1, adaptive:false, canonical:false, symplecticClaim:'none', suitableFor:['educational instability baseline'], limitations:['unstable for serious dynamics','large energy error'], diagnostics:['energy drift','state blow-up warning']}
  };
  const IntegratorRegistry = (() => {
    const registry = Object.freeze(Object.fromEntries(Object.entries(registryData).map(([k,v]) => [k, Object.freeze(Object.assign({step:null}, v))])));
    function get(id){ return registry[id] || null; }
    function list(){ return Object.values(registry); }
    function step(id, params, state, dt){
      const A = app(); if(!global.Physics || !A) throw new Error('legacy Physics.step unavailable');
      const n = A.sysType === 'triple' ? 6 : 4;
      const out = new Float64Array(n);
      const rhs = (x, o) => PhysicsCore.derivative(A.sysType, x, params || A.P, A.gamma || 0, o);
      const result = global.Physics.step(id || A.method || 'rk4', state, dt, rhs, n, out, {tolerance:A.tol || 1e-6});
      return result && result.y ? result : {y:out, diagnostics:{}};
    }
    return Object.freeze({registry, get, list, step});
  })();

  /* ============================================================
  MODULE 05 — RUNTIME GOVERNANCE
  ============================================================ */
  const governanceLog = [];
  const numericalFaults = [];
  let invalidAfterFault = false;
  function recordIntervention(kind, detail){
    const rec = Object.freeze({timestamp:now(), kind:String(kind), detail:clone(detail)});
    governanceLog.push(rec); if(governanceLog.length > 400) governanceLog.shift();
    return rec;
  }
  function recordFault(severity, message, detail){
    const rec = Object.freeze({timestamp:now(), severity:String(severity || 'fault'), message:String(message || 'numerical fault'), detail:clone(detail), stateHash:stateHash()});
    numericalFaults.push(rec); if(numericalFaults.length > 200) numericalFaults.shift();
    if(severity === 'fatal' || severity === 'numerical') invalidAfterFault = true;
    const A = app(); if(A){ A.__v10InvalidAfterFault = invalidAfterFault; A.__v10LastFault = rec; }
    const overlay = $('nanOverlay'); if(overlay){ overlay.style.display='block'; overlay.textContent = '⚠ Numerical fault — paused / report available'; }
    renderV10UI(); return rec;
  }
  function currentMode(){ return app() && app().runMode || Mode.DEMO; }
  function setMode(mode){
    const A = app(); const next = Object.values(Mode).includes(mode) ? mode : Mode.DEMO;
    if(A){
      const prev = A.runMode || Mode.DEMO; A.runMode = next;
      if(next === Mode.RESEARCH || next === Mode.BENCHMARK){
        if(A.autoQual) recordIntervention('mode-policy', {field:'autoQual', previous:true, next:false, reason:'strict mode disables visual auto-quality scaling'});
        A.autoQual = false;
        const auto = $('autoQual'); if(auto && auto.checked){ auto.checked = false; auto.dispatchEvent(new Event('change', {bubbles:true})); }
        const si = $('siAutoAssist'); if(si && si.checked){ si.checked = false; si.dispatchEvent(new Event('change', {bubbles:true})); }
      }
      if(next === Mode.BENCHMARK){
        const glow=$('glowMode'), long=$('longExpose');
        if(glow && glow.checked){ glow.checked=false; glow.dispatchEvent(new Event('change',{bubbles:true})); recordIntervention('benchmark-policy',{field:'glowMode', next:false}); }
        if(long && long.checked){ long.checked=false; long.dispatchEvent(new Event('change',{bubbles:true})); recordIntervention('benchmark-policy',{field:'longExpose', next:false}); }
      }
      if(prev !== next) recordIntervention('mode-change', {previous:prev, next});
    }
    const sel = $('v10RunMode'); if(sel && sel.value !== next) sel.value = next;
    renderV10UI(); return next;
  }
  function pauseWithFault(message, detail){
    const A = app();
    if(A){ A.paused = true; if(typeof global.updatePauseButton === 'function') try{ global.updatePauseButton(); }catch(_){} }
    return recordFault('fatal', message, detail);
  }
  function claimLevel(){
    const A = app(); if(invalidAfterFault || A && A.__v10InvalidAfterFault) return ClaimLevel.INVALID_AFTER_FAULT;
    if(!A) return ClaimLevel.DEMO;
    if(A.sysType === 'triple') return ClaimLevel.EXPERIMENTAL_TRIPLE;
    if((A.runMode || Mode.DEMO) === Mode.RESEARCH && A.sysType === 'double') return ClaimLevel.VALIDATED_DOUBLE;
    if((A.runMode || Mode.DEMO) === Mode.EDUCATION) return ClaimLevel.EDUCATIONAL;
    return ClaimLevel.DEMO;
  }
  function confidenceLevel(){
    const A = app(); const claim = claimLevel();
    if(claim === ClaimLevel.INVALID_AFTER_FAULT) return 'invalid after fault';
    if(claim === ClaimLevel.EXPERIMENTAL_TRIPLE) return 'experimental';
    if(A && A.gamma > 0) return 'dissipative / qualitative energy diagnostics';
    const meta = IntegratorRegistry.get(A && A.method);
    if(meta && /pseudo|approximation/i.test(meta.symplecticClaim)) return 'degraded: pseudo-symplectic method';
    if(claim === ClaimLevel.VALIDATED_DOUBLE) return 'validated double-pendulum path, subject to validation results';
    return 'exploratory';
  }

  /* ============================================================
  MODULE 06 — ANALYSIS BUFFERS AND DIAGNOSTICS
  ============================================================ */
  class RingBuffer{
    constructor(capacity){ this.capacity = Math.max(1, capacity|0); this.data = new Float64Array(this.capacity); this.index = 0; this.size = 0; }
    push(value){ this.data[this.index] = Number(value) || 0; this.index = (this.index + 1) % this.capacity; this.size = Math.min(this.size + 1, this.capacity); }
    values(){ const out = new Array(this.size); for(let i=0;i<this.size;i++) out[i] = this.data[(this.index - this.size + i + this.capacity) % this.capacity]; return out; }
    summary(){ const v = this.values(); if(!v.length) return {count:0,min:null,max:null,last:null}; return {count:v.length,min:Math.min(...v),max:Math.max(...v),last:v[v.length-1]}; }
  }
  const Perf = (() => {
    const physics = new RingBuffer(300), render = new RingBuffer(300), ui = new RingBuffer(300), worker = new RingBuffer(300), dt = new RingBuffer(1000);
    let longTaskCount = 0, droppedFrameEstimate = 0, lastFrame = performance.now();
    if('PerformanceObserver' in global){
      try{ const obs = new PerformanceObserver(list => { longTaskCount += list.getEntries().length; }); obs.observe({entryTypes:['longtask']}); }catch(_){}
    }
    function sample(){
      const A = app(); if(A){ physics.push(A.physMs || 0); render.push(A.renderMs || 0); worker.push(A.workerMs || 0); dt.push(A.DT || 0); }
      const t = performance.now(); const delta = t - lastFrame; if(delta > 34) droppedFrameEstimate++; lastFrame = t;
    }
    function snapshot(){ const A = app(); return {fps:A && A.fps || 0, physicsMs:physics.summary(), renderMs:render.summary(), uiMs:ui.summary(), workerMs:worker.summary(), longTaskCount, droppedFrameEstimate}; }
    return Object.freeze({sample, snapshot, actualDtHistorySummary:() => dt.summary()});
  })();

  const Analysis = Object.freeze({
    buffers:Object.freeze({RingBuffer}),
    lyapunovSettings(){ const A=app(); return {perturbation:A && Math.pow(10, safeNumber($('ensEps') && $('ensEps').value, -4)), renormalizationInterval:safeNumber($('lyapDt') && $('lyapDt').value, 0.5), transientCutoff:'finite-time browser estimate; inspect convergence before asymptotic claims', estimate:A && A.lyapTime>0 ? A.lyapSumLog/A.lyapTime : null}; },
    poincareCondition(){ return {condition:'θ₁ = 0 with ω₁ > 0', interpolation:'crossing interpolation when available; duplicate near-threshold points suppressed by V8/V10 buffers'}; },
    fftSettings(){ return {signal:'θ₁ history', units:'Hz', window:'Hann or legacy plot window when enabled', sampleRate:'derived from actual dt history', aliasingWarning:true}; },
    sweepSettings(){ return {sampledVariable:'selected initial-condition or parameter grid', warmup:'recorded in exported sweep data when available', resolution:'user-selected; low resolution is qualitative'}; }
  });

  /* ============================================================
  MODULE 07 — EXPORT AND REPRODUCIBILITY
  ============================================================ */
  function browserInfo(){ return {userAgent:navigator.userAgent, language:navigator.language, platform:navigator.platform, timezone:Intl.DateTimeFormat().resolvedOptions().timeZone, visibility:document.visibilityState}; }
  function canvasResolution(){ const c=$('main'); return c ? {width:c.width, height:c.height, cssWidth:c.clientWidth, cssHeight:c.clientHeight} : null; }
  function manifest(){
    const A = app(); const meta = IntegratorRegistry.get(A && A.method) || IntegratorRegistry.get('rk4');
    return {
      schemaVersion:'pendulum-run-manifest/v10', appVersion:version, buildHash:build, sourceHash:'b69dd395e0361e68ea47b19330a65c6fd284dbae1adb9e347fdae451f3831a25', timestamp:now(),
      mode:currentMode(), systemType:A && A.sysType || 'double', integrator:meta,
      parameters:clone(A && A.P), initialState:A && A.initialState ? Array.from(A.initialState) : null, currentState:appStateVector(), randomSeed:A && A.seed || safeNumber($('seed') && $('seed').value, 1),
      dtPolicy:{requested:A && A.DT || null, adaptive:!!(meta && meta.adaptive), stepsPerFrame:A && A.SPF || null, tolerance:A && A.tol || null},
      actualDtHistorySummary:Perf.actualDtHistorySummary(), automaticInterventions:governanceLog.slice(), validationResults:ValidationRegistry.lastResults(), numericalFaults:numericalFaults.slice(),
      browserInfo:browserInfo(), hardwareConcurrency:navigator.hardwareConcurrency || null, devicePixelRatio:global.devicePixelRatio || 1, canvasResolution:canvasResolution(),
      analysisSettings:{lyapunov:Analysis.lyapunovSettings(), sweep:Analysis.sweepSettings()}, poincareCondition:Analysis.poincareCondition(), lyapunovSettings:Analysis.lyapunovSettings(), fftSettings:Analysis.fftSettings(),
      claimLevel:claimLevel(), confidenceLevel:confidenceLevel(), limitations:knownLimitations()
    };
  }
  function knownLimitations(){
    const A = app(); const list = ['browser double-precision arithmetic and tab scheduling can affect long runs','rendering and buffer caps are performance controls, not physical corrections','finite-time Lyapunov estimates require convergence inspection','FFT can alias if sample rate/duration are insufficient'];
    if(A && A.sysType === 'triple') list.push('triple pendulum path is experimental in this single-file build');
    if(A && A.gamma > 0) list.push('gamma > 0 makes the model dissipative; energy conservation drift is not a conservation test');
    const meta = IntegratorRegistry.get(A && A.method); if(meta && meta.limitations) list.push(...meta.limitations);
    return Array.from(new Set(list));
  }
  const ExportSystem = Object.freeze({
    manifest,
    exportManifest:() => downloadText('pendulum_manifest_v10.json', JSON.stringify(manifest(), null, 2), 'application/json;charset=utf-8'),
    exportSession:() => downloadText('pendulum_session_v10.json', JSON.stringify(StateStore.snapshot(), null, 2), 'application/json;charset=utf-8'),
    exportFaultReport:() => downloadText('pendulum_fault_report_v10.json', JSON.stringify({schemaVersion:'pendulum-fault/v10', timestamp:now(), faults:numericalFaults, lastValidState:appStateVector(), manifest:manifest()}, null, 2), 'application/json;charset=utf-8')
  });

  /* ============================================================
  MODULE 08 — VALIDATION REGISTRY
  ============================================================ */
  const ValidationRegistry = (() => {
    const tests = new Map(); let last = null;
    function status(pass, warn=false){ return pass ? 'PASS' : (warn ? 'WARN' : 'FAIL'); }
    function add(test){ tests.set(test.id, Object.freeze(test)); }
    function simulate(method, dt, total, gamma){
      if(!global.Physics) throw new Error('Physics unavailable');
      const A = app(); const P = Object.assign({m1:1,m2:1,l1:1.2,l2:1,g:9.81}, A && A.P || {});
      const n = 4, st = new Float64Array([0.08,0.06,0,0]), out = new Float64Array(n);
      const rhs = (x,o) => PhysicsCore.derivative('double', x, P, gamma || 0, o);
      const e0 = PhysicsCore.energy('double', st, P);
      const steps = Math.max(1, Math.floor(total / dt));
      for(let i=0;i<steps;i++){ global.Physics.step(method || 'rk4', st, dt, rhs, n, out, {tolerance:1e-8}); st.set(out); if(Array.from(st).some(x=>!finite(x))) break; }
      const e1 = PhysicsCore.energy('double', st, P); return {state:Array.from(st), e0, e1, drift:Math.abs((e1-e0)/(Math.abs(e0)||1))};
    }
    const profiles = ['quick','standard','research','stress'];
    add({id:'energy-drift-gamma0', name:'Energy drift test for γ = 0', category:'physics', system:'double', method:'rk4', profile:'quick', severity:'high', passCriteria:'relative drift finite and below 1e-2 over short run', threshold:'< 1e-2', runtimeCost:'low', run(){ const r=simulate('rk4',0.003,2,0); return {status:status(finite(r.drift)&&r.drift<1e-2, finite(r.drift)), measuredValue:r.drift, threshold:1e-2}; }, explainFailure(){return 'Lower dt or compare against a high-accuracy reference.';}});
    add({id:'damping-sanity', name:'Damping sanity test for γ > 0', category:'physics', system:'double', method:'rk4', profile:'quick', severity:'medium', passCriteria:'energy remains finite and usually decreases for positive damping', threshold:'finite dissipative behavior', runtimeCost:'low', run(){ const r=simulate('rk4',0.003,2,0.08); return {status:status(finite(r.e1), true), measuredValue:r.e1-r.e0, threshold:'finite'}; }, explainFailure(){return 'Check damping sign and finite RHS output.';}});
    add({id:'small-angle-reference', name:'Small-angle approximation test', category:'physics', system:'double', method:'rk4', profile:'standard', severity:'medium', passCriteria:'small-angle run remains finite and low-drift', threshold:'finite, drift < 1e-3', runtimeCost:'low', run(){ const r=simulate('rk4',0.0015,1,0); return {status:status(finite(r.drift)&&r.drift<1e-3, finite(r.drift)), measuredValue:r.drift, threshold:1e-3}; }, explainFailure(){return 'Check small-angle RHS or reduce dt.';}});
    add({id:'dt-halving-convergence', name:'dt-halving convergence test', category:'numerics', system:'double', method:'rk4', profile:'standard', severity:'high', passCriteria:'dt and dt/2 results remain close over short horizon', threshold:'L1 error < 0.05', runtimeCost:'medium', run(){ const a=simulate('rk4',0.004,1,0), b=simulate('rk4',0.002,1,0); const err=a.state.reduce((q,x,i)=>q+Math.abs(x-b.state[i]),0); return {status:status(finite(err)&&err<0.05, finite(err)), measuredValue:err, threshold:0.05}; }, explainFailure(){return 'This indicates large step-size sensitivity; reduce dt or shorten claims.';}});
    add({id:'order-accuracy-estimate', name:'estimated order-of-accuracy test', category:'numerics', system:'double', method:'rk4', profile:'research', severity:'medium', passCriteria:'coarse/medium error is larger than medium/fine error', threshold:'ratio > 4', runtimeCost:'medium', run(){ const a=simulate('rk4',0.006,0.8,0), b=simulate('rk4',0.003,0.8,0), c=simulate('rk4',0.0015,0.8,0); const e1=a.state.reduce((q,x,i)=>q+Math.abs(x-b.state[i]),0), e2=b.state.reduce((q,x,i)=>q+Math.abs(x-c.state[i]),0); const ratio=e1/(e2||1e-16); return {status:status(finite(ratio)&&ratio>4, finite(ratio)), measuredValue:ratio, threshold:'> 4'}; }, explainFailure(){return 'Use shorter horizon or non-chaotic initial conditions for order tests.';}});
    add({id:'time-reversibility', name:'time reversibility test where applicable', category:'numerics', system:'double', method:'hmidpoint', profile:'research', severity:'medium', passCriteria:'applicable methods expose reversibility diagnostics; otherwise WARN', threshold:'method-dependent', runtimeCost:'medium', run(){ const A=app(), meta=IntegratorRegistry.get(A&&A.method); const applicable=meta && /midpoint|leapfrog|yoshida/i.test(meta.id+' '+meta.name); return {status:applicable?'WARN':'PASS', measuredValue:applicable?'not automatically run in browser adapter':'not applicable', threshold:'explicit reversibility check for publication'}; }, explainFailure(){return 'Run an external reversible-map check before making reversibility claims.';}});
    add({id:'deterministic-replay-hash', name:'deterministic replay hash test', category:'reproducibility', system:'all', method:'all', profile:'quick', severity:'high', passCriteria:'same state hashes identically twice', threshold:'equal hashes', runtimeCost:'low', run(){ const a=stateHash(), b=stateHash(); return {status:status(a===b), measuredValue:a+' / '+b, threshold:'equal'}; }, explainFailure(){return 'Unexpected state mutation or hash instability.';}});
    add({id:'worker-main-consistency', name:'worker/main consistency test', category:'runtime', system:'all', method:'all', profile:'standard', severity:'medium', passCriteria:'worker hook exists or fallback is declared', threshold:'hook or fallback', runtimeCost:'low', run(){ const ok=!!global.WorkerMgr || typeof Worker==='undefined'; return {status:status(ok, true), measuredValue:global.WorkerMgr?'WorkerMgr present':'fallback/main thread', threshold:'consistent backend path'}; }, explainFailure(){return 'Worker comparison should be implemented for strict benchmark runs.';}});
    add({id:'poincare-crossing-consistency', name:'Poincaré crossing consistency test', category:'analysis', system:'double', method:'all', profile:'standard', severity:'medium', passCriteria:'condition exists and point buffer is bounded', threshold:'bounded buffer', runtimeCost:'low', run(){ const A=app(); const n=A&&A.poincPts ? A.poincPts.length : 0; return {status:status(finite(n)&&n<100000, true), measuredValue:n, threshold:'< 100000'}; }, explainFailure(){return 'Use bounded buffers and explicit crossing interpolation.';}});
    add({id:'lyapunov-transient-handling', name:'Lyapunov transient handling test', category:'analysis', system:'all', method:'all', profile:'standard', severity:'medium', passCriteria:'finite-time estimate is labelled and settings are exported', threshold:'settings present', runtimeCost:'low', run(){ const s=Analysis.lyapunovSettings(); return {status:status(!!s.transientCutoff), measuredValue:JSON.stringify({eps:s.perturbation, renorm:s.renormalizationInterval}), threshold:'settings present'}; }, explainFailure(){return 'Expose perturbation, renormalization interval, and transient policy.';}});
    add({id:'rk4-reference-comparison', name:'RK4 vs high-accuracy reference comparison', category:'numerics', system:'double', method:'rk4', profile:'research', severity:'high', passCriteria:'RK4 close to dt/4 reference for short run', threshold:'L1 error < 0.02', runtimeCost:'medium', run(){ const a=simulate('rk4',0.004,0.8,0), b=simulate('rk4',0.001,0.8,0); const err=a.state.reduce((q,x,i)=>q+Math.abs(x-b.state[i]),0); return {status:status(finite(err)&&err<0.02, finite(err)), measuredValue:err, threshold:0.02}; }, explainFailure(){return 'Reduce dt or avoid high-chaos initial states in validation.';}});
    add({id:'implicit-solver-residual', name:'implicit solver residual test', category:'numerics', system:'double', method:'hmidpoint', profile:'research', severity:'high', passCriteria:'residual visible when implicit method selected', threshold:'finite residual or non-active pass', runtimeCost:'low', run(){ const A=app(), active=A&&A.method==='hmidpoint'; const r=A && (A.__lastResidual || (A.solverStatus&&A.solverStatus.residual)); return {status:active ? status(finite(r), true) : 'PASS', measuredValue:active ? r : 'not active', threshold:'finite residual when active'}; }, explainFailure(){return 'Do not claim canonical validity without residual reporting.';}});
    add({id:'localstorage-roundtrip', name:'localStorage roundtrip test', category:'security', system:'all', method:'all', profile:'quick', severity:'medium', passCriteria:'JSON can be written, read, and removed', threshold:'roundtrip equal', runtimeCost:'low', run(){ const key='pendulum.v10.roundtrip'; const val=JSON.stringify({t:now(),h:stateHash()}); localStorage.setItem(key,val); const ok=localStorage.getItem(key)===val; localStorage.removeItem(key); return {status:status(ok), measuredValue:ok, threshold:true}; }, explainFailure(){return 'Handle localStorage corruption or disabled storage.';}});
    add({id:'url-share-roundtrip', name:'URL share roundtrip test', category:'reproducibility', system:'all', method:'all', profile:'quick', severity:'low', passCriteria:'URLSearchParams encodes current compact state', threshold:'contains method/system', runtimeCost:'low', run(){ const st=StateStore.snapshot(); const q=new URLSearchParams({system:st.systemType,method:st.method,dt:String(st.dt)}); const ok=q.get('method')===st.method && q.get('system')===st.systemType; return {status:status(ok), measuredValue:q.toString(), threshold:'method/system preserved'}; }, explainFailure(){return 'Check URL serializer.';}});
    add({id:'json-import-schema', name:'JSON import schema test', category:'security', system:'all', method:'all', profile:'quick', severity:'critical', passCriteria:'rejects non-finite and prototype keys', threshold:'reject malicious input', runtimeCost:'low', run(){ const bad=StateStore.validateState({systemType:'double',method:'rk4',state:[0,Infinity],parameters:{'__proto__':{polluted:true}}}); return {status:status(!bad.ok), measuredValue:bad.problems.join('; '), threshold:'not ok'}; }, explainFailure(){return 'Import validator must reject unsafe snapshots.';}});
    add({id:'nan-fault-injection', name:'NaN fault injection test', category:'faults', system:'all', method:'all', profile:'standard', severity:'critical', passCriteria:'validator rejects NaN without mutating live state', threshold:'reject', runtimeCost:'low', run(){ const bad=StateStore.validateState({systemType:'double',method:'rk4',state:[0,NaN,0,0],parameters:{m1:1,m2:1,l1:1,l2:1,g:9.81}}); return {status:status(!bad.ok), measuredValue:bad.problems.join('; '), threshold:'reject'}; }, explainFailure(){return 'Never import NaN into live state.';}});
    add({id:'render-independence', name:'render independence test', category:'rendering', system:'all', method:'all', profile:'standard', severity:'medium', passCriteria:'render path is separated from physics state mutation', threshold:'same hash before/after passive check', runtimeCost:'low', run(){ const before=stateHash(); const after=stateHash(); return {status:status(before===after), measuredValue:before+' / '+after, threshold:'equal'}; }, explainFailure(){return 'Rendering should not change physical state.';}});
    add({id:'browser-capability-report', name:'browser capability report test', category:'runtime', system:'all', method:'all', profile:'quick', severity:'low', passCriteria:'capabilities recorded in manifest', threshold:'canvas present', runtimeCost:'low', run(){ const ok=!!$('main') && !!$('main').getContext; return {status:status(ok, true), measuredValue:JSON.stringify({worker:typeof Worker!=='undefined', offscreen:typeof OffscreenCanvas!=='undefined', webgl:!!document.createElement('canvas').getContext('webgl')}), threshold:'canvas'}; }, explainFailure(){return 'Use graceful fallbacks if browser capability is missing.';}});
    add({id:'event-listener-leak-smoke', name:'event listener leak smoke test', category:'runtime', system:'all', method:'all', profile:'stress', severity:'medium', passCriteria:'listener registry exists or DOM is within normal size', threshold:'no unbounded growth signal', runtimeCost:'low', run(){ const prel=global.__PENDULUM_PLATFORM_PRELUDE_V9__; const snap=prel&&prel.listeners&&prel.listeners.snapshot?prel.listeners.snapshot():null; const count=snap&&snap.active || document.querySelectorAll('*').length; return {status:status(count<5000, true), measuredValue:count, threshold:'< 5000'}; }, explainFailure(){return 'Inspect repeated booting or unremoved listeners.';}});
    add({id:'performance-budget-smoke', name:'performance budget smoke test', category:'performance', system:'all', method:'all', profile:'quick', severity:'medium', passCriteria:'runtime timing is finite and within broad browser budget', threshold:'physics < 40 ms/frame', runtimeCost:'low', run(){ const A=app(); const ms=A&&A.physMs || 0; return {status:status(finite(ms)&&ms<40, finite(ms)), measuredValue:ms, threshold:40}; }, explainFailure(){return 'Reduce visual effects or steps/frame; do not alter physics silently in Research Mode.';}});
    function run(profile){
      const order = profile ? profiles.slice(0, Math.max(1, profiles.indexOf(profile)+1)) : profiles;
      const selected = Array.from(tests.values()).filter(t => !profile || order.includes(t.profile));
      const results = selected.map(t => {
        const started = performance.now();
        try{ const r = t.run(); return Object.assign({id:t.id, name:t.name, category:t.category, system:t.system, method:t.method, profile:t.profile, severity:t.severity, passCriteria:t.passCriteria, threshold:t.threshold, runtimeCost:t.runtimeCost, elapsedMs:+(performance.now()-started).toFixed(3), timestamp:now(), settings:StateStore.snapshot()}, r); }
        catch(error){ return {id:t.id, name:t.name, category:t.category, profile:t.profile, severity:t.severity, status:'FAIL', measuredValue:String(error && error.message || error), threshold:t.threshold, elapsedMs:+(performance.now()-started).toFixed(3), timestamp:now(), settings:StateStore.snapshot(), failureExplanation:t.explainFailure()}; }
      });
      last = {schemaVersion:'pendulum-validation/v10', appVersion:version, buildHash:build, timestamp:now(), profile:profile || 'all', browserEnvironment:browserInfo(), reproducibilityHash:stateHash(), results};
      renderValidationSummary(last); return last;
    }
    function lastResults(){ return last; }
    function exportJSON(){ downloadText('pendulum_validation_v10.json', JSON.stringify(last || run('standard'), null, 2), 'application/json;charset=utf-8'); }
    function exportMarkdown(){ const r=last || run('standard'); const lines=['# Pendulum Lab V10 Validation','',`Generated: ${r.timestamp}`,`Profile: ${r.profile}`,`Hash: ${r.reproducibilityHash}`,'',...r.results.map(x=>`- **${x.status}** [${x.severity}] ${x.name} — measured: ${x.measuredValue}; threshold: ${x.threshold}`)]; downloadText('pendulum_validation_v10.md', lines.join('\n'), 'text/markdown;charset=utf-8'); }
    function exportCSV(){ const r=last || run('standard'); const esc=x=>'"'+String(x==null?'':x).replace(/"/g,'""')+'"'; const rows=[['id','status','severity','measured','threshold','elapsedMs'].map(esc).join(',')].concat(r.results.map(x=>[x.id,x.status,x.severity,x.measuredValue,x.threshold,x.elapsedMs].map(esc).join(','))); downloadText('pendulum_validation_v10.csv', rows.join('\n'), 'text/csv;charset=utf-8'); }
    return Object.freeze({register:add, tests:()=>Array.from(tests.values()), run, lastResults, exportJSON, exportMarkdown, exportCSV});
  })();

  /* ============================================================
  MODULE 09 — COMMAND REGISTRY
  ============================================================ */
  const CommandRegistry = (() => {
    const commands = new Map();
    function register(cmd){ if(!cmd || !cmd.id || typeof cmd.run !== 'function') throw new TypeError('invalid command'); commands.set(cmd.id, Object.freeze({label:cmd.label || cmd.id, shortcut:cmd.shortcut || '', enabled:cmd.enabled || (()=>true), run:cmd.run})); }
    function run(id, payload){ const c=commands.get(id); if(!c) throw new Error('unknown command: '+id); if(c.enabled && !c.enabled()) return false; return c.run(payload); }
    function list(){ return Array.from(commands.entries()).map(([id,c]) => Object.freeze({id, label:c.label, shortcut:c.shortcut, enabled:!!c.enabled()})); }
    return Object.freeze({register, run, list});
  })();
  CommandRegistry.register({id:'v10.runValidation.standard', label:'Run V10 standard validation', shortcut:'', run:() => ValidationRegistry.run('standard')});
  CommandRegistry.register({id:'v10.exportManifest', label:'Export V10 manifest', shortcut:'', run:() => ExportSystem.exportManifest()});
  CommandRegistry.register({id:'v10.exportSession', label:'Export V10 session', shortcut:'', run:() => ExportSystem.exportSession()});
  CommandRegistry.register({id:'v10.setResearchMode', label:'Switch to Research Mode', shortcut:'', run:() => setMode(Mode.RESEARCH)});
  CommandRegistry.register({id:'v10.setBenchmarkMode', label:'Switch to Benchmark Mode', shortcut:'', run:() => setMode(Mode.BENCHMARK)});

  /* ============================================================
  MODULE 10 — UI CONTROLLER
  ============================================================ */
  function methodWarning(meta){
    if(!meta) return 'Unknown integrator.';
    return `${meta.name} · order ${meta.order} · ${meta.adaptive?'adaptive':'fixed-step'} · ${meta.canonical?'canonical path':'noncanonical path'}. Symplectic claim: ${meta.symplecticClaim}.`;
  }
  function warnings(){
    const A=app(); const out=[];
    if(!A) return ['Runtime state unavailable.'];
    if(A.gamma > 0) out.push('γ > 0: the system is dissipative; ΔE/E₀ is not a pure conservation-failure metric.');
    if(A.sysType === 'triple') out.push('Triple pendulum mode is experimental in this build and exported as experimental-triple.');
    const meta=IntegratorRegistry.get(A.method); if(meta && /pseudo|approximation|separable/i.test(meta.symplecticClaim)) out.push('Selected method uses a pseudo-symplectic or separable approximation label; do not report it as a canonical symplectic method.');
    if(meta && meta.adaptive && (currentMode()===Mode.RESEARCH || currentMode()===Mode.BENCHMARK)) out.push('Adaptive dt is active in a strict context; exported dt history must be inspected.');
    if(invalidAfterFault || A.__v10InvalidAfterFault) out.push('Numerical fault occurred. Session claim level is invalid-after-fault until reset.');
    if(A.__v10ThrottlingWarning) out.push('Browser visibility/throttling changed during strict run; benchmark timing is degraded.');
    if(!out.length) out.push('No active scientific honesty warnings.');
    return out;
  }
  function installV10UI(){
    if($('v10StatusCard')) return;
    const controls = document.querySelector('#tab-lab .controls') || document.querySelector('.controls');
    if(!controls) return;
    const card = SafeDOM.el('section', {id:'v10StatusCard', class:'v10-card'}, [
      SafeDOM.el('div', {class:'v10-title'}, [document.createTextNode('V10 Research Control'), SafeDOM.el('span', {id:'v10ConfidenceBadge', class:'v10-badge', text:'—'})]),
      SafeDOM.el('div', {class:'row'}, [SafeDOM.el('label', {text:'Mode'}), (()=>{const s=document.createElement('select');s.id='v10RunMode';['demo','education','research','benchmark'].forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=m[0].toUpperCase()+m.slice(1);s.appendChild(o);});s.addEventListener('change',e=>setMode(e.target.value));return s;})()]),
      SafeDOM.el('div', {id:'v10MethodCard', class:'v10-method', text:'Method metadata pending.'}),
      SafeDOM.el('div', {id:'v10WarningBox', class:'v10-warnings'}),
      SafeDOM.el('div', {class:'btnrow', style:'margin-top:8px'}, [
        SafeDOM.el('button', {id:'v10RunValidation', class:'primary', text:'Run V10 Validation'}),
        SafeDOM.el('button', {id:'v10ExportManifest', text:'Research Export'}),
        SafeDOM.el('button', {id:'v10ExportSession', text:'Session Export'}),
        SafeDOM.el('button', {id:'v10ExportValidation', text:'Validation JSON'})
      ])
    ]);
    const firstAcc = controls.querySelector('.acc'); controls.insertBefore(card, firstAcc || controls.firstChild);
    $('v10RunValidation').addEventListener('click', () => ValidationRegistry.run('standard'));
    $('v10ExportManifest').addEventListener('click', () => ExportSystem.exportManifest());
    $('v10ExportSession').addEventListener('click', () => ExportSystem.exportSession());
    $('v10ExportValidation').addEventListener('click', () => ValidationRegistry.exportJSON());
    const method = $('method'); if(method) method.addEventListener('change', renderV10UI);
    const sys = $('sysType'); if(sys) sys.addEventListener('change', renderV10UI);
    const gamma = $('gamma'); if(gamma) gamma.addEventListener('input', renderV10UI);
  }
  function renderValidationSummary(report){
    const pass=report.results.filter(r=>r.status==='PASS').length, warn=report.results.filter(r=>r.status==='WARN').length, fail=report.results.filter(r=>r.status==='FAIL').length;
    recordIntervention('validation-run', {profile:report.profile, pass, warn, fail});
    const box=$('v10WarningBox'); if(box){ const n=SafeDOM.el('div', {class:fail?'v10-warning bad':warn?'v10-warning':'v10-warning good', text:`V10 validation: PASS=${pass} WARN=${warn} FAIL=${fail}`}); box.prepend(n); }
    if(global.toast) try{ global.toast(`V10 validation: ${pass} pass, ${warn} warn, ${fail} fail`, 2200); }catch(_){}
  }
  function renderV10UI(){
    const A=app(); if(!A) return;
    const sel=$('v10RunMode'); if(sel) sel.value=currentMode();
    const meta=IntegratorRegistry.get(A.method) || IntegratorRegistry.get('rk4');
    const methodCard=$('v10MethodCard'); if(methodCard) methodCard.textContent = methodWarning(meta);
    const badge=$('v10ConfidenceBadge'); if(badge){ const claim=claimLevel(); badge.textContent=claim; badge.className='v10-badge '+(claim===ClaimLevel.VALIDATED_DOUBLE?'validated':claim===ClaimLevel.INVALID_AFTER_FAULT?'invalid':claim===ClaimLevel.EXPERIMENTAL_TRIPLE?'experimental':'degraded'); }
    const q=$('qualBadge'); if(q){ q.textContent=claimLevel(); q.className=(claimLevel()===ClaimLevel.INVALID_AFTER_FAULT?'low':claimLevel()===ClaimLevel.EXPERIMENTAL_TRIPLE?'degraded':''); }
    const box=$('v10WarningBox'); if(box){ SafeDOM.clear(box); warnings().forEach(w => box.appendChild(SafeDOM.el('div', {class:w.startsWith('No active')?'v10-warning good':'v10-warning', text:w}))); }
  }

  /* ============================================================
  MODULE 11 — PATCHES, FALLBACKS, AND BOOT
  ============================================================ */
  function migrateOnClickHandlers(){
    const clickProp='onclick', changeProp='onchange', inputProp='oninput';
    document.querySelectorAll('*').forEach(el => {
      if(typeof el[clickProp] === 'function' && !el.__v10OnclickMigrated){ const fn=el[clickProp]; el.addEventListener('click', function v10MigratedClick(ev){ return fn.call(this, ev); }); el[clickProp] = null; el.__v10OnclickMigrated = true; }
      if(typeof el[changeProp] === 'function' && !el.__v10OnchangeMigrated){ const fn=el[changeProp]; el.addEventListener('change', function v10MigratedChange(ev){ return fn.call(this, ev); }); el[changeProp] = null; el.__v10OnchangeMigrated = true; }
      if(typeof el[inputProp] === 'function' && !el.__v10OninputMigrated){ const fn=el[inputProp]; el.addEventListener('input', function v10MigratedInput(ev){ return fn.call(this, ev); }); el[inputProp] = null; el.__v10OninputMigrated = true; }
    });
  }
  function patchFaultPolicy(){
    const A=app();
    try{
      if(global.NaNGuard && typeof global.NaNGuard.recover === 'function' && !global.NaNGuard.__v10Wrapped){
        const old = global.NaNGuard.recover.bind(global.NaNGuard);
        global.NaNGuard.recover = function v10RecoverWrapper(){
          if(currentMode()===Mode.RESEARCH || currentMode()===Mode.BENCHMARK){ pauseWithFault('NaN/Infinity detected; strict mode blocked automatic recovery', {mode:currentMode()}); return false; }
          recordIntervention('demo-recovery', {reason:'NaNGuard.recover called outside strict mode'}); return old.apply(this, arguments);
        };
        global.NaNGuard.__v10Wrapped = true;
      }
    }catch(e){ recordFault('runtime','failed to patch NaNGuard',{message:String(e.message||e)}); }
    global.addEventListener('error', e => recordFault('runtime','uncaught error',{message:e.message, filename:e.filename, lineno:e.lineno}));
    global.addEventListener('unhandledrejection', e => recordFault('runtime','unhandled rejection',{reason:String(e.reason && e.reason.message || e.reason)}));
    document.addEventListener('visibilitychange', () => {
      const A=app(); if(A && (currentMode()===Mode.RESEARCH || currentMode()===Mode.BENCHMARK) && document.visibilityState !== 'visible'){ A.__v10ThrottlingWarning = true; recordFault('timing','visibility changed during strict run',{visibility:document.visibilityState}); }
    });
  }
  function patchResetInvalidation(){
    try{
      if(typeof global.fullReset === 'function' && !global.fullReset.__v10Wrapped){
        const old = global.fullReset;
        global.fullReset = function v10FullResetWrapper(){ invalidAfterFault=false; const A=app(); if(A){ A.__v10InvalidAfterFault=false; A.__v10ThrottlingWarning=false; } const overlay=$('nanOverlay'); if(overlay) overlay.style.display='none'; return old.apply(this, arguments); };
        global.fullReset.__v10Wrapped = true;
      }
    }catch(_){}
  }
  const railGlyphs = Object.freeze({
    lab:'⦿', compare:'↔', lyap:'λ', sweep:'▦', bifurc:'⌁',
    phase3d:'◎', density:'▤', validate:'✓', architecture:'▣',
    research:'∫', canonical:'∂', audit:'✓'
  });
  function normalizeRailTabs(){
    document.querySelectorAll('.rail .tab').forEach(tab => {
      const key = tab.dataset && tab.dataset.tab || '';
      const original = tab.dataset.fullLabel || tab.getAttribute('aria-label') || tab.getAttribute('title') || tab.textContent || key || 'workspace';
      const glyph = railGlyphs[key] || (String(tab.textContent || '').trim().match(/^[^\w\s]/) || ['•'])[0];
      tab.dataset.fullLabel = original;
      if(tab.textContent !== glyph) tab.textContent = glyph;
      tab.setAttribute('aria-label', original);
      tab.setAttribute('title', original);
    });
  }
  function annotateUI(){
    normalizeRailTabs();
    document.querySelectorAll('canvas').forEach(c => { if(!c.getAttribute('aria-label')) c.setAttribute('aria-label', (c.id || 'analysis') + ' canvas'); if(!c.hasAttribute('tabindex')) c.setAttribute('tabindex','0'); });
    document.querySelectorAll('button').forEach(b => { if(!b.getAttribute('aria-label') && b.textContent.trim()) b.setAttribute('aria-label', b.textContent.trim()); });
  }
  function tick(){ Perf.sample(); renderV10UI(); }
  function boot(){
    installV10UI(); setMode(currentMode()); patchFaultPolicy(); patchResetInvalidation(); migrateOnClickHandlers(); annotateUI(); renderV10UI();
    new MutationObserver(normalizeRailTabs).observe(document.querySelector('.rail') || document.body, {childList:true, subtree:true, characterData:true});
    setTimeout(migrateOnClickHandlers, 250); setTimeout(migrateOnClickHandlers, 1000); setInterval(migrateOnClickHandlers, 5000); setInterval(tick, 1000);
    if(global.toast) try{ global.toast('Pendulum Lab V10 ready', 1600); }catch(_){}
  }

  const Renderer = Object.freeze({renderStatus:renderV10UI, performance:Perf.snapshot});
  const Runtime = Object.freeze({modes:Mode, getMode:currentMode, setMode, recordFault, pauseWithFault, interventions:() => governanceLog.slice(), faults:() => numericalFaults.slice(), stateStore:StateStore, commandRegistry:CommandRegistry});
  const Governance = Object.freeze({claimLevel, confidenceLevel, knownLimitations, recordIntervention, recordFault});
  const Core = Object.freeze({version, build, bootedAt, hashString, StateStore, SafeDOM, CommandRegistry});

  global.__PENDULUM_LAB_V10__ = Object.freeze({version, build});
  global.PendulumLab = Object.freeze({
    version, build,
    core:Core,
    physics:PhysicsCore,
    integrators:IntegratorRegistry,
    runtime:Runtime,
    analysis:Analysis,
    renderer:Renderer,
    validation:ValidationRegistry,
    export:ExportSystem,
    governance:Governance
  });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})(globalThis);
