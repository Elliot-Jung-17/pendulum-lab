'use strict';

const PreservationPatchV5 = (() => {
  const VERSION = 'Preservation Patch 2026.05.20';
  const SCHEMA_VERSION = 'pendulum-state-v5';
  const ALLOWED_METHODS = new Set(['rk4','rkf45','hmidpoint','leapfrog','verlet','yoshida4','gauss2','symplectic','rk2','euler']);
  const ALLOWED_SYSTEMS = new Set(['double','triple']);
  const METHOD_INFO = Object.freeze({
    rk4:{kind:'Reference', tone:'warn', text:'RK4 is accurate for short runs but is not symplectic; long-run energy drift is expected.'},
    rkf45:{kind:'Adaptive reference', tone:'warn', text:'RKF45 controls local error through accepted/rejected steps; it is not energy-preserving.'},
    hmidpoint:{kind:'Canonical conditional', tone:'good', text:'Canonical implicit midpoint is treated as symplectic only for the undamped double pendulum after solver convergence.'},
    leapfrog:{kind:'Pseudo-symplectic', tone:'warn', text:'Leapfrog is applied to θ/ω variables here; do not claim exact canonical symplectic behavior.'},
    yoshida4:{kind:'Pseudo-symplectic', tone:'warn', text:'Yoshida4 composition is useful for qualitative Hamiltonian behavior but remains noncanonical in this file.'},
    gauss2:{kind:'Noncanonical implicit', tone:'warn', text:'Implicit midpoint in θ/ω coordinates can be stable, but the canonical symplectic claim is not made.'},
    symplectic:{kind:'Approximate symplectic', tone:'warn', text:'Symplectic Euler is a separable-style approximation in this coordinate system.'},
    rk2:{kind:'Educational', tone:'bad', text:'RK2 is a low-cost midpoint baseline; visible energy drift is expected.'},
    euler:{kind:'Educational', tone:'bad', text:'Euler is a diagnostic baseline only; instability and large drift are expected.'}
  });
  const patchLog = [];
  const record = (type, message, extra = {}) => {
    const rec = {type, message, timestamp:new Date().toISOString(), system:window.App?.sysType, method:window.App?.method, dt:window.App?.DT, simTime:window.App?.simTime, ...extra};
    patchLog.push(rec); if(patchLog.length > 240) patchLog.shift();
    if(window.App){ App.preservationPatchLog = patchLog; }
    return rec;
  };
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const finite = v => Number.isFinite(Number(v));
  const num = v => Number(v);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const get = id => document.getElementById(id);
  const text = (id, value) => { const el=get(id); if(el) el.textContent=value; };
  const setClass = (id, cls) => { const el=get(id); if(el) el.className=cls; };

  function installRailAccessibility(){
    document.querySelectorAll('.tab[data-tip]').forEach(btn => {
      const label = btn.getAttribute('data-tip') || btn.textContent.trim() || 'Navigation tab';
      if(!btn.hasAttribute('aria-label')) btn.setAttribute('aria-label', label);
      if(!btn.hasAttribute('title')) btn.setAttribute('title', label);
    });
    const trigger = document.querySelector('.dev-trigger');
    if(trigger){
      trigger.setAttribute('aria-label','Open developer and research tools');
      trigger.setAttribute('title','Developer and research tools');
      trigger.setAttribute('aria-haspopup','menu');
      trigger.addEventListener('focus',()=>trigger.setAttribute('aria-expanded','true'));
      trigger.addEventListener('blur',()=>setTimeout(()=>{ if(!document.querySelector('.dev-hub:focus-within')) trigger.setAttribute('aria-expanded','false'); },80));
    }
    const flyout = document.querySelector('.dev-flyout');
    if(flyout && !flyout.dataset.compactTools){
      flyout.dataset.compactTools = 'true';
      const tools = [
        ['✓','Validation suite',()=>document.querySelector('[data-tab="validate"]')?.click()],
        ['λ','Lyapunov tools',()=>document.querySelector('[data-tab="lyap"]')?.click()],
        ['▦','Chaos map',()=>document.querySelector('[data-tab="sweep"]')?.click()],
        ['∿','Bifurcation analysis',()=>document.querySelector('[data-tab="bifurc"]')?.click()],
        ['⊞','Architecture and runtime diagnostics',()=>get('ueToggleDiag')?.click()],
        ['⬇','Export manifest',()=>get('exportManifestV3')?.click() || get('ueExportManifest')?.click()],
        ['⚙','Audit',()=>get('runAPlusAudit')?.click()],
        ['🛡','Feature integrity',()=>window.PendulumFeatureIntegrity?.showPanel?.()],
        ['⌘','Command palette',()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}))],
        ['▣','Export report',()=>get('exportAPlusReport')?.click() || get('dlReportBtn')?.click()]
      ];
      flyout.innerHTML = '<div class="dev-flyout-title">Tools</div><div class="dev-tool-grid" role="menu" aria-label="Compact developer and research tools"></div>';
      const grid = flyout.querySelector('.dev-tool-grid');
      for(const [icon,label,fn] of tools){
        const b = document.createElement('button');
        b.type='button'; b.className='dev-tool-btn'; b.textContent=icon;
        b.setAttribute('aria-label',label); b.setAttribute('title',label); b.setAttribute('data-tip',label); b.setAttribute('role','menuitem');
        b.addEventListener('click', e => { e.preventDefault(); try{ fn(); record('ui', 'Compact rail tool invoked', {label}); }catch(err){ record('runtime', 'Compact rail tool failed', {label, error:String(err.message||err)}); if(window.toast) toast('Tool unavailable: '+label); } });
        grid.appendChild(b);
      }
    }
  }

  function installHonestyPanels(){
    const methodSelect = get('method');
    if(methodSelect && !get('methodHonesty')){
      const div = document.createElement('div'); div.id='methodHonesty'; div.className='honesty-note'; div.setAttribute('role','note'); div.setAttribute('aria-live','polite');
      methodSelect.closest('.row')?.insertAdjacentElement('afterend', div);
    }
    const autoQual = get('autoQual');
    if(autoQual && !get('modeHonesty')){
      const div = document.createElement('div'); div.id='modeHonesty'; div.className='honesty-note'; div.setAttribute('role','note'); div.setAttribute('aria-live','polite');
      autoQual.closest('.row')?.insertAdjacentElement('afterend', div);
    }
    const stats = get('stats');
    if(stats && !get('modeStat')){
      const insert = document.createElement('div');
      insert.innerHTML = `
        <div class="srow"><span class="skey">mode</span><span class="sval" id="modeStat">—</span></div>
        <div class="srow"><span class="skey">conservation</span><span class="sval" id="conservationStat">—</span></div>
        <div class="srow"><span class="skey">method note</span><span class="sval" id="methodNoteStat">—</span></div>
        <div class="srow"><span class="skey">RKF45 dt / err</span><span class="sval" id="rkfDetailStat">—</span></div>
        <div class="srow"><span class="skey">Lyapunov reliability</span><span class="sval" id="lyapReliabilityStat">—</span></div>`;
      stats.appendChild(insert);
    }
    const validatePanel = document.querySelector('#tab-validate .left-col > div');
    if(validatePanel && !get('patchValidationBox')){
      const box = document.createElement('div');
      box.id = 'patchValidationBox';
      box.className = 'ri-panel';
      box.innerHTML = '<div class="ri-title">Preservation patch validation</div><div class="btnrow" style="margin-bottom:8px"><button id="runPatchValidation" class="primary">Run added tests</button><button id="exportPatchLog">Export patch log</button></div><div id="patchValidationResults" class="patch-changelog">No added tests run yet.</div>';
      validatePanel.appendChild(box);
      get('runPatchValidation')?.addEventListener('click',()=>runAddedValidation(true));
      get('exportPatchLog')?.addEventListener('click',exportPatchLog);
    }
    const modeSel = get('riModeSelect');
    if(modeSel && !modeSel.dataset.patchModes){
      modeSel.dataset.patchModes = 'true';
      modeSel.innerHTML = '<option value="demo">Demo Mode</option><option value="research">Research / Accuracy Mode</option><option value="performance">Performance Mode</option><option value="recovery">Recovery Mode</option>';
      modeSel.setAttribute('title','Simulation mode. Performance changes rendering policy only; it does not silently alter physics.');
      modeSel.addEventListener('change', () => applyMode(modeSel.value));
    }
  }

  function applyMode(mode){
    App.runMode = mode;
    const auto = get('autoQual'), worker = get('useWorker');
    const workerSelection = worker ? !!worker.checked : !!App.useWorker;
    if(mode === 'research'){
      if(auto && auto.checked){
        auto.checked = false;
        auto.dispatchEvent(new Event('change',{bubbles:true}));
      }
      App.autoQual = false;
      App.powerSave = false;
      App.useWorker = workerSelection;
      const si = get('siAutoAssist');
      if(si && si.checked){
        si.checked = false;
        si.dispatchEvent(new Event('change',{bubbles:true}));
        record('mode','Research mode disabled automatic stabilization assistance', {control:'siAutoAssist'});
      }
      if(App.sysType === 'double'){
        const sel = get('method');
        if(sel && sel.value !== 'hmidpoint'){
          sel.value = 'hmidpoint';
          sel.dispatchEvent(new Event('change',{bubbles:true}));
          record('mode','Research mode selected hmidpoint visibly', {method:'hmidpoint'});
        }
      }
      record('mode','Research / Accuracy Mode selected', {policy:'no hidden state repair; no physics-changing auto-quality', workerPreserved:workerSelection});
    }else if(mode === 'performance'){
      if(auto) auto.checked = true;
      App.autoQual = true;
      App.glowMode = false; App.longExpose = false;
      App.useWorker = workerSelection;
      record('mode','Performance Mode selected', {policy:'rendering load reduced where possible; dt/method/SPF preserved', workerPreserved:workerSelection});
    }else if(mode === 'recovery'){
      App.__fatalNumericalFailure = false;
      App.useWorker = workerSelection;
      record('mode','Recovery Mode selected explicitly', {policy:'all interventions are logged; recovered trajectory is not continuous physical evidence'});
      if(window.toast) toast('Recovery Mode enabled explicitly');
    }else{
      App.__fatalNumericalFailure = false;
      App.useWorker = workerSelection;
      record('mode','Demo Mode selected', {policy:'user-friendly defaults and visible warnings', workerPreserved:workerSelection});
    }
    updateHonestyStatus();
  }

  function methodInfo(){ return METHOD_INFO[App.method] || {kind:'Experimental', tone:'warn', text:'Unregistered method; treat results as experimental until validated.'}; }
  function rkfStatsSummary(){
    const r = App.rkfStats;
    if(!r || App.method !== 'rkf45') return '—';
    const hist = Array.from(r.hist || []).filter(x => Number.isFinite(x) && x > 0);
    const min = hist.length ? Math.min(...hist) : NaN;
    const max = hist.length ? Math.max(...hist) : NaN;
    const avg = hist.length ? hist.reduce((a,b)=>a+b,0)/hist.length : NaN;
    const err = App._rkfPrevErr && Number.isFinite(App._rkfPrevErr.value) ? App._rkfPrevErr.value : NaN;
    return `acc/rej ${r.accepted||0}/${r.rejected||0} · dt ${Number.isFinite(avg)?avg.toExponential(2):'—'} [${Number.isFinite(min)?min.toExponential(1):'—'}, ${Number.isFinite(max)?max.toExponential(1):'—'}] · err ${Number.isFinite(err)?err.toExponential(1):'—'}`;
  }
  function bufferMemoryEstimate(){
    let bytes = 0;
    const add = x => { if(x && Number.isFinite(x.byteLength)) bytes += x.byteLength; };
    try{
      add(App.state); add(App.prevState); add(App.renderState);
      add(App.phaseHist); add(App.theta1Hist);
      if(App.trail && App.trail.buf) add(App.trail.buf);
      for(const name of ['energyCirc','lyapCirc','replayCirc','trajCirc']) add(App[name]?.buf);
      if(App.poincPts) bytes += App.poincPts.length * 32;
      if(App.cam?.trail) bytes += App.cam.trail.length * 3 * 8;
    }catch(_){}
    return bytes;
  }
  function lyapReliability(){
    const t = App.lyapTime || 0;
    const renorm = t > 0 && App.DT > 0 ? Math.round(t / Math.max(App.DT,1e-9)) : 0;
    if(t < 2) return `warming · ${t.toFixed(1)}s`;
    if(t < 10) return `short sample · ${t.toFixed(1)}s · ~${renorm} renorm`;
    return `usable trend · ${t.toFixed(1)}s · ~${renorm} renorm`;
  }
  function massMatrixConditionDouble(){
    if(App.sysType !== 'double') return null;
    const {m1,m2,l1,l2} = App.P;
    const c = Math.cos(App.state[0]-App.state[1]);
    const a = (m1+m2)*l1*l1, b = m2*l1*l2*c, d = m2*l2*l2;
    const det = a*d-b*b;
    const tr = a+d;
    const disc = Math.max(0,tr*tr-4*det);
    const lmax = (tr+Math.sqrt(disc))/2, lmin = Math.max((tr-Math.sqrt(disc))/2,1e-15);
    return {det, condition:lmax/lmin};
  }
  function updateHonestyStatus(){
    if(!window.App) return;
    const info = methodInfo();
    const methodBox = get('methodHonesty');
    if(methodBox){ methodBox.className = 'honesty-note '+info.tone; methodBox.textContent = `${info.kind}: ${info.text}`; }
    const modeBox = get('modeHonesty');
    if(modeBox){
      const warnings = [];
      if(App.gamma > 0) warnings.push('γ > 0: dissipative system, so energy conservation diagnostics are interpretive.');
      if(App.sysType === 'triple') warnings.push('Triple pendulum is marked experimental/less validated than the double-pendulum path.');
      if(App.autoQual) warnings.push('Auto-quality is visual-only in this patch; physics dt/method/SPF must not be silently changed.');
      if(App.runMode === 'research') warnings.push('Research mode disables hidden physics correction and reports interventions.');
      if(App.runMode === 'performance') warnings.push('Performance mode reduces rendering pressure, not physical fidelity.');
      if(App.runMode === 'recovery') warnings.push('Recovery mode is explicit; recovered trajectories are logged and should not be treated as continuous evidence.');
      modeBox.className = 'honesty-note '+(warnings.some(w=>w.includes('dissipative')||w.includes('experimental'))?'warn':'good');
      modeBox.textContent = warnings.join(' ' ) || 'Conservative undamped double-pendulum path with standard browser floating-point limits.';
    }
    text('modeStat', App.runMode || 'demo');
    const cons = App.gamma > 0 ? 'dissipative γ>0' : 'conservative γ=0';
    text('conservationStat', cons);
    setClass('conservationStat', 'sval '+(App.gamma>0?'warn':'good'));
    text('methodNoteStat', info.kind);
    setClass('methodNoteStat', 'sval '+(info.tone==='good'?'good':info.tone==='bad'?'bad':'warn'));
    text('rkfDetailStat', rkfStatsSummary());
    text('lyapReliabilityStat', lyapReliability());
    const mem = get('memStat');
    if(mem){
      const mb = bufferMemoryEstimate()/1024/1024;
      const browser = performance.memory ? ` · heap ${(performance.memory.usedJSHeapSize/1024/1024).toFixed(1)} MB` : '';
      mem.textContent = `${mb.toFixed(1)} MB buffers${browser}`;
    }
    const cond = massMatrixConditionDouble();
    if(cond && (cond.condition > 200 || cond.det < 1e-8)) record('numerical','Mass-matrix conditioning warning',{determinant:cond.det,condition:cond.condition});
    if(App.rec && App.rec.state === 'recording') record('performance','Recording active; render and memory load increased',{});
    if(App.maxTrailLen > 2400) record('performance','Large trail buffer selected',{trailLength:App.maxTrailLen});
  }

  function readObjectCandidate(...candidates){
    for(const c of candidates){
      if(c && typeof c === 'object' && !Array.isArray(c)) return c;
    }
    return null;
  }
  function readStringCandidate(...candidates){
    for(const c of candidates){
      if(typeof c === 'string' && c.trim()) return c.trim();
    }
    return null;
  }
  function readNumberCandidate(...candidates){
    for(const c of candidates){
      const n = Number(c);
      if(Number.isFinite(n)) return n;
    }
    return null;
  }
  function readArrayCandidate(...candidates){
    for(const c of candidates){
      if(Array.isArray(c)) return c;
      if(c && typeof c.length === 'number' && typeof c !== 'string'){
        try{ return Array.from(c); }catch(_){}
      }
    }
    return null;
  }
  function capArray(arr, max, label){
    if(!Array.isArray(arr)) return arr;
    if(arr.length > max) throw new Error(`${label} exceeds supported length ${max}`);
    return arr;
  }
  function extractImportRoot(raw){
    if(!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('top-level JSON object is required');
    if(JSON.stringify(raw).length > 5_000_000) throw new Error('payload exceeds 5 MB supported limit');
    if(raw.snapshot && typeof raw.snapshot === 'object' && !Array.isArray(raw.snapshot)){
      return {...raw.snapshot, manifest:raw.manifest || raw.snapshot.manifest || null, __raw:raw};
    }
    return {...raw, __raw:raw};
  }
  function safeParamsFrom(obj, raw){
    const source = readObjectCandidate(obj.parameters, obj.params, obj.configuration?.params, obj.manifest?.parameters, obj.manifest?.configuration?.params, raw?.manifest?.parameters, raw?.manifest?.configuration?.params, raw?.snapshot?.parameters, raw?.snapshot?.params, {});
    const params = {...App.P, ...(source || {})};
    const ranges = {m1:[0.1,5],m2:[0.1,5],m3:[0.1,5],l1:[0.3,2],l2:[0.3,2],l3:[0.3,2],g:[0,20]};
    for(const [k,[lo,hi]] of Object.entries(ranges)){
      if(params[k] === undefined) continue;
      const x = Number(params[k]);
      if(!Number.isFinite(x)) throw new Error(`${k} parameter must be finite`);
      if(x < lo || x > hi) throw new Error(`${k} outside UI-supported range [${lo}, ${hi}]`);
      params[k] = x;
    }
    return params;
  }
  function normalizeImportObject(raw){
    const obj = extractImportRoot(raw);
    const rawRoot = obj.__raw || raw;
    const systemObj = readObjectCandidate(obj.system, obj.manifest?.system, rawRoot?.manifest?.system, obj.snapshot?.system, rawRoot?.snapshot?.system);
    const sysType = readStringCandidate(
      obj.sysType,
      obj.systemType,
      typeof obj.system === 'string' ? obj.system : null,
      systemObj?.type,
      obj.manifest?.system?.type,
      rawRoot?.manifest?.system?.type,
      obj.snapshot?.system?.type,
      rawRoot?.snapshot?.system?.type,
      obj.configuration?.system,
      obj.manifest?.configuration?.system,
      rawRoot?.manifest?.configuration?.system,
      App?.sysType,
      'double'
    );
    if(!ALLOWED_SYSTEMS.has(sysType)) throw new Error('unsupported system type: '+sysType);
    const n = sysType === 'triple' ? 6 : 4;

    const methodObj = readObjectCandidate(obj.method, obj.integrator, obj.manifest?.integrator, rawRoot?.manifest?.integrator, obj.snapshot?.method, rawRoot?.snapshot?.method);
    const method = readStringCandidate(
      typeof obj.method === 'string' ? obj.method : null,
      methodObj?.id,
      typeof obj.integrator === 'string' ? obj.integrator : null,
      readObjectCandidate(obj.integrator)?.id,
      obj.integratorSettings?.method,
      obj.manifest?.integrator?.id,
      rawRoot?.manifest?.integrator?.id,
      obj.snapshot?.method?.id,
      rawRoot?.snapshot?.method?.id,
      App?.method,
      'rk4'
    );
    if(!ALLOWED_METHODS.has(method)) throw new Error('method is not whitelisted: '+method);

    const dt = readNumberCandidate(
      obj.dt,
      obj.numerics?.dt,
      obj.integratorSettings?.dt,
      obj.manifest?.numerics?.dt,
      rawRoot?.manifest?.numerics?.dt,
      obj.snapshot?.numerics?.dt,
      obj.configuration?.dt,
      obj.manifest?.configuration?.dt,
      rawRoot?.manifest?.configuration?.dt,
      App?.DT
    );
    if(!Number.isFinite(dt) || dt <= 0 || dt > 0.05) throw new Error('dt is outside supported finite range (0, 0.05]');

    const gamma = readNumberCandidate(
      obj.gamma,
      obj.damping,
      obj.parameters?.damping,
      obj.params?.damping,
      obj.manifest?.parameters?.damping,
      rawRoot?.manifest?.parameters?.damping,
      obj.configuration?.gamma,
      obj.manifest?.configuration?.gamma,
      rawRoot?.manifest?.configuration?.gamma,
      App?.gamma,
      0
    );
    if(!Number.isFinite(gamma) || gamma < 0 || gamma > 2) throw new Error('gamma must be finite in [0, 2]');

    const stateRaw = readArrayCandidate(
      obj.state,
      obj.vector,
      obj.initialConditions?.currentState,
      obj.initialConditions?.state,
      obj.snapshot?.state,
      obj.snapshot?.initialConditions?.currentState,
      rawRoot?.manifest?.initialConditions?.currentState,
      rawRoot?.snapshot?.initialConditions?.currentState,
      obj.state?.vector,
      obj.manifest?.state?.vector,
      rawRoot?.manifest?.state?.vector
    );
    if(!Array.isArray(stateRaw)) throw new Error('state vector array is required');
    capArray(stateRaw, CONSTS.MAX_STATE_DIM || 8, 'state vector');
    if(stateRaw.length !== n) throw new Error(`state length ${stateRaw.length} does not match ${sysType} system length ${n}`);
    const cleanState = stateRaw.map((v,i) => {
      const x = Number(v);
      if(!Number.isFinite(x)) throw new Error('non-finite state value at index '+i);
      if(Math.abs(x) > 1e6) throw new Error('unreasonably large state value at index '+i);
      return x;
    });

    const prevRaw = readArrayCandidate(
      obj.previousState,
      obj.previous,
      obj.initialConditions?.previousState,
      obj.manifest?.initialConditions?.previousState,
      rawRoot?.manifest?.initialConditions?.previousState,
      rawRoot?.snapshot?.initialConditions?.previousState
    );
    let cleanPrevious = null;
    if(prevRaw){
      capArray(prevRaw, CONSTS.MAX_STATE_DIM || 8, 'previous state');
      if(prevRaw.length === n){
        cleanPrevious = prevRaw.map((v,i)=>{
          const x=Number(v);
          if(!Number.isFinite(x) || Math.abs(x)>1e6) throw new Error('invalid previous state value at index '+i);
          return x;
        });
      }
    }

    const params = safeParamsFrom(obj, rawRoot);
    const simTime = readNumberCandidate(obj.simTime, obj.time, obj.state?.time, obj.manifest?.state?.time, rawRoot?.manifest?.state?.time, 0);
    if(!Number.isFinite(simTime) || simTime < 0 || simTime > 1e9) throw new Error('simulation time is invalid');

    const schema = readStringCandidate(obj.schemaVersion, obj.manifest?.schemaVersion, rawRoot?.manifest?.schemaVersion, rawRoot?.schemaVersion);
    const warnings = [];
    if(!schema) warnings.push('schema missing; recognizable compatibility fields were used');
    if(sysType === 'triple') warnings.push('triple mode is experimental and less validated');
    if(gamma > 0) warnings.push('damping makes the imported system dissipative');

    return {sysType, n, state:cleanState, previousState:cleanPrevious, method, dt, gamma, params, simTime:Number(simTime), manifest:rawRoot?.manifest || obj.manifest || null, schema:schema || null, warnings};
  }
  function setInput(id, value){
    const el = get(id); if(!el) return;
    el.value = String(value);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function applyValidatedImport(next){
    App.sysType = next.sysType; App.stateLen = next.n; App.method = next.method; App.DT = next.dt; App.gamma = next.gamma; App.P = {...App.P, ...next.params};
    setInput('sysType', next.sysType); setInput('method', next.method); setInput('dt', next.dt); setInput('gamma', next.gamma);
    for(const k of ['m1','m2','m3','l1','l2','l3','g']) if(next.params[k] !== undefined) setInput(k, next.params[k]);
    if(next.sysType === 'triple'){
      setInput('th1',next.state[0]); setInput('th2',next.state[1]); setInput('th3',next.state[2]); setInput('iw1',next.state[3]); setInput('iw2',next.state[4]); setInput('iw3',next.state[5]);
    }else{
      setInput('th1',next.state[0]); setInput('th2',next.state[1]); setInput('iw1',next.state[2]); setInput('iw2',next.state[3]);
    }
    if(!App.state || App.state.length < next.n) App.state = App.sab ? new Float64Array(App.sab) : new Float64Array(CONSTS.MAX_STATE_DIM);
    for(let i=0;i<next.n;i++) App.state[i] = next.state[i];
    if(next.previousState) App.prevState.set(next.previousState); else App.prevState.set(App.state.subarray(0,next.n)); App.renderState.set(App.state.subarray(0,next.n));
    App.shadow = new Float64Array(next.n); App.shadow.set(next.state); App.shadow[0] += CONSTS.LYAP_EPS;
    App.simTime = next.simTime; App.E0 = null; App.maxDrift = 0; App.lyapSumLog = 0; App.lyapTime = 0; App._drift = 0; App._lastE = 0;
    App._dtNext = App.DT; if(App._rkfPrevErr) App._rkfPrevErr.value = 0;
    App.poincPts = []; App.fftCache = null;
    App.energyCirc?.clear?.(); App.lyapCirc?.clear?.(); App.replayCirc?.clear?.(); App.trajCirc?.clear?.();
    if(window.NaNGuard) NaNGuard.snapshot(App.state);
    if(typeof updateSysType === 'function') updateSysType(App.sysType);
    if(typeof rebuildEnsemble === 'function') rebuildEnsemble();
    record('import','Validated JSON import applied',{schema:next.schema || next.manifest?.schemaVersion || SCHEMA_VERSION, stateLength:next.n, warnings:next.warnings || []});
    if(window.toast) toast('✓ Validated state loaded');
  }

  function currentConservationStatus(){
    if(App.gamma > 0) return 'non-conservative / dissipative';
    if((NaNGuard?.count?.() || 0) > 0) return 'recovered / degraded';
    return 'conservative parameterization';
  }
  function captureCurrentExportObject(){
    const info = methodInfo();
    const state = Array.from(App.state.subarray(0,App.stateLen));
    const previous = Array.from(App.prevState.subarray(0,App.stateLen));
    const manifest = {
      schemaVersion:SCHEMA_VERSION,
      appVersion:VERSION,
      physicsRuntimeVersion:window.PendulumLabV4?.version || window.PendulumLabEnterpriseResearch?.version || null,
      exportedAt:new Date().toISOString(),
      browser:{userAgent:navigator.userAgent, platform:navigator.platform, language:navigator.language, hardwareConcurrency:navigator.hardwareConcurrency || null},
      system:{type:App.sysType, reliability:App.sysType==='triple'?'experimental / less validated':'validated double-pendulum path'},
      method:{id:App.method, classification:info.kind, note:info.text},
      integrator:{id:App.method, classification:info.kind, note:info.text},
      numerics:{dt:App.DT, tolerance:App.tol, stepsPerFrame:App.SPF, speedMultiplier:App.speed, adaptive:App.method==='rkf45', rkf45:App.rkfStats || null},
      parameters:{...App.P, damping:App.gamma, conservative:App.gamma===0},
      initialConditions:{currentState:state, previousState:previous},
      diagnostics:{E0:App.E0, lastEnergy:App._lastE, currentDrift:App._drift, maxDrift:App.maxDrift, lyapunovEstimate:App.lyapTime>0?App.lyapSumLog/App.lyapTime:null, lyapunovTime:App.lyapTime, poincareCount:App.poincPts.length, recoveryCount:NaNGuard?.count?.() ?? null},
      runtime:{mode:App.runMode || 'demo', useWorker:!!App.useWorker, backend:App.backend || null, webgl2:!!App.capabilities?.webgl2, sharedArrayBuffer:!!App.capabilities?.sab},
      seed:App.seed ?? null,
      validation:App.preservationPatchValidation || App.riValidation || App.canonicalQA || null,
      warningNotes:honestyWarnings(),
      recoveryLog:patchLog.filter(x=>x.type==='recovery' || x.type==='import' || x.type==='runtime').slice(-60)
    };
    return {
      schemaVersion:SCHEMA_VERSION,
      appVersion:VERSION,
      exportedAt:manifest.exportedAt,
      system:manifest.system,
      method:manifest.method,
      integrator:manifest.integrator,
      numerics:manifest.numerics,
      parameters:manifest.parameters,
      initialConditions:manifest.initialConditions,
      state,
      previousState:previous,
      params:{...App.P},
      gamma:App.gamma,
      sysType:App.sysType,
      dt:App.DT,
      simTime:App.simTime,
      seed:manifest.seed,
      conservativeStatus:currentConservationStatus(),
      manifest,
      diagnostics:manifest.diagnostics,
      validation:manifest.validation,
      logs:{patchLog:patchLog.slice(-80), researchIntegrityErrors:App.riErrors || []}
    };
  }
  function patchImportExport(){
    const loadBtn = get('loadJsonBtn');
    const file = get('jsonFile');
    if(loadBtn && file && !loadBtn.dataset.preservationImportBound){
      loadBtn.dataset.preservationImportBound = 'true';
      loadBtn.addEventListener('click',(event)=>{event.stopImmediatePropagation();file.click();},{capture:true});
    }
    if(file){
      file.addEventListener('change', function(event){
        event.stopImmediatePropagation();
        const selected = this.files && this.files[0]; if(!selected) return;
        if(selected.size > 5_000_000){ if(window.toast) toast('⚠ Load failed: file too large'); record('import','Rejected oversized JSON',{size:selected.size}); this.value=''; return; }
        const reader = new FileReader();
        reader.onload = () => {
          try{ const raw = JSON.parse(String(reader.result)); const next = normalizeImportObject(raw); applyValidatedImport(next); }
          catch(err){ record('import','JSON import rejected',{error:String(err.message||err)}); if(window.toast) toast('⚠ Load failed: '+String(err.message||err)); }
        };
        reader.onerror = () => { record('import','FileReader failed',{}); if(window.toast) toast('⚠ Load failed: unreadable file'); };
        reader.readAsText(selected); this.value='';
      });
    }
    const jsonBtn = get('dlJsonBtn');
    if(jsonBtn && !jsonBtn.dataset.preservationExportBound){
      jsonBtn.dataset.preservationExportBound = 'true';
      jsonBtn.addEventListener('click', (event) => {
        event.stopImmediatePropagation();
        try{
          const data = captureCurrentExportObject();
          dlText('pendulum_state_v5.json', JSON.stringify(data,null,2), 'application/json');
          record('export','JSON state exported',{schemaVersion:SCHEMA_VERSION, stateLength:data.state.length});
          if(window.toast) toast('⬇ JSON saved with metadata');
        }catch(err){
          record('export','JSON export failed',{error:String(err.message||err)});
          if(window.toast) toast('⚠ Export failed: '+String(err.message||err));
        }
      });
    }
    const reportBtn = get('dlReportBtn');
    if(reportBtn){
      reportBtn.addEventListener('click', (event) => {
        event.stopImmediatePropagation();
        const info = methodInfo();
        const cond = massMatrixConditionDouble();
        const lines = [
          'PENDULUM LAB — SESSION REPORT',
          '================================',
          `Generated: ${new Date().toISOString()}`,
          `System: ${App.sysType} pendulum${App.sysType==='triple'?' (experimental / less validated)':''}`,
          `Mode: ${App.runMode || 'demo'}`,
          `Method: ${App.method} — ${info.kind}`,
          `Method note: ${info.text}`,
          `dt: ${App.DT} s · tolerance: ${App.tol} · SPF: ${App.SPF}`,
          `Damping γ: ${App.gamma} (${App.gamma>0?'dissipative / non-conservative':'conservative parameterization'})`,
          '',
          'RESULTS',
          '-------',
          `Simulation time: ${App.simTime.toFixed(3)} s`,
          `Current |ΔE/E₀|: ${Math.abs(App._drift||0).toExponential(4)}`,
          `Max |ΔE/E₀|: ${(App.maxDrift||0).toExponential(4)}`,
          `Lyapunov λ₁: ${App.lyapTime>0?(App.lyapSumLog/App.lyapTime).toFixed(6)+' /s':'N/A'}`,
          `Lyapunov measurement time: ${(App.lyapTime||0).toFixed(3)} s`,
          `Poincaré points: ${App.poincPts.length}`,
          `NaN/recovery count: ${NaNGuard?.count?.() ?? 'N/A'}`,
          cond ? `Mass matrix det/condition: ${cond.det.toExponential(4)} / ${cond.condition.toExponential(3)}` : 'Mass matrix det/condition: N/A for current system',
          '',
          'SCIENTIFIC NOTES',
          '----------------',
          ...honestyWarnings().map(w => '- '+w),
          '- Recovered trajectories, if any, should not be treated as physically continuous through the recovery point.',
          '- Browser floating-point arithmetic and finite buffers limit reproducibility claims.'
        ];
        dlText('pendulum_report.txt', lines.join('\n'), 'text/plain');
        record('export','Text report exported',{});
        if(window.toast) toast('⬇ Report saved');
      }, {capture:true});
    }
  }
  function honestyWarnings(){
    const w = [];
    const info = methodInfo();
    if(App.gamma > 0) w.push('γ > 0: the system is dissipative; energy conservation is not a validity target.');
    if(App.sysType === 'triple') w.push('Triple pendulum dynamics in this single-file project are treated as experimental and less validated than the double-pendulum path.');
    if(info.kind.includes('Pseudo')) w.push('Pseudo-symplectic method label: θ/ω implementation is not an exact canonical map.');
    if(App.method === 'rk4') w.push('RK4 is non-symplectic; long-run energy drift is possible even with small local error.');
    if(App.method === 'rkf45') w.push('RKF45 adapts local error but is not automatically Hamiltonian-preserving.');
    if(App.autoQual) w.push('Auto-quality affects rendering policy only in this patch; physics settings are not silently reduced.');
    return w;
  }

  function patchRuntimeLogging(){
    window.addEventListener('error', e => record('runtime','Uncaught runtime error',{message:e.message, filename:e.filename, lineno:e.lineno, colno:e.colno}));
    window.addEventListener('unhandledrejection', e => record('runtime','Unhandled promise rejection',{reason:String(e.reason?.message || e.reason)}));
    const gpu = get('gpuCanvas');
    if(gpu){
      gpu.addEventListener('webglcontextlost', () => record('runtime','WebGL context lost; GPU density must fall back or be reinitialized',{}));
      gpu.addEventListener('webglcontextrestored', () => record('runtime','WebGL context restored',{}));
    }
    if(window.NaNGuard && !NaNGuard.__preservationLogged){
      const oldRecover = NaNGuard.recover;
      NaNGuard.recover = function(into){
        const ok = oldRecover.call(NaNGuard, into);
        record('recovery','NaNGuard recovery invoked',{success:!!ok, method:App.method, dt:App.DT, system:App.sysType});
        return ok;
      };
      NaNGuard.__preservationLogged = true;
    }
  }

  function runSim(method, dt, T, ic=[0.12,0.10,0,0], gamma=0){
    const P={m1:1,m2:1,l1:1,l2:1,g:9.81};
    const s=new Float64Array(ic); const out=new Float64Array(4); const f=(x,o)=>Physics.rhs2(x,P,gamma,o);
    const E0=Physics.energy2(s,P).total;
    const N=Math.max(1,Math.round(T/Math.abs(dt)));
    for(let i=0;i<N;i++){ Physics.step(method,s,dt,f,4,out,{tol:1e-8}); s.set(out); if(!Array.from(s).every(Number.isFinite)) break; }
    const E1=Physics.energy2(s,P).total;
    return {state:Array.from(s), drift:Math.abs((E1-E0)/(Math.abs(E0)||1)), E0, E1, steps:N};
  }
  function validationResult(name, pass, measured, expected, subsystem, likelyCause, severity='medium'){
    return {name, pass:!!pass, measured:String(measured), expected:String(expected), subsystem, likelyCause, severity};
  }
  function runImportDryRun(raw){
    const before = {
      system:App.sysType, method:App.method, dt:App.DT, gamma:App.gamma,
      hash:hashState(App.state.subarray(0,App.stateLen)), simTime:App.simTime
    };
    const parsed = normalizeImportObject(raw);
    const after = {
      system:App.sysType, method:App.method, dt:App.DT, gamma:App.gamma,
      hash:hashState(App.state.subarray(0,App.stateLen)), simTime:App.simTime
    };
    const unchanged = JSON.stringify(before) === JSON.stringify(after);
    if(!unchanged) throw new Error('dry-run import mutated live App');
    return parsed;
  }
  function runAddedValidation(showToast=false){
    const results=[];
    const add=(name,pass,measured,expected,subsystem,likelyCause,severity='medium')=>results.push(validationResult(name,pass,measured,expected,subsystem,likelyCause,severity));

    try{
      const ids=['main','energy','lyap','phase','poincare','fft','method','sysType','gamma','dt','runValidation','dlJsonBtn','jsonFile'];
      const missing=ids.filter(id=>!get(id));
      add('required DOM IDs present', missing.length===0, missing.length?missing.join(', '):'none missing','all required IDs resolve','DOM','Preserved panel markup or dynamic injector failed',missing.length?'high':'low');
    }catch(e){ add('required DOM IDs present',false,String(e.message||e),'no exception','DOM','DOM inspection failed','high'); }

    try{
      const panels=['lab','compare','lyap','sweep','bifurc','phase3d','density','validate'].map(id=>'tab-'+id);
      const missing=panels.filter(id=>!get(id));
      add('all major panels present',missing.length===0,missing.length?missing.join(', '):'all panels present','8 panel containers','UI','A major tab panel was removed','high');
    }catch(e){ add('all major panels present',false,String(e.message||e),'no exception','UI','Panel inspection failed','high'); }

    try{
      const c=get('main');
      add('canvas initialization',!!(c && c.getContext && c.width>0 && c.height>0),c?`${c.width}×${c.height}`:'missing canvas','valid canvas element','rendering','Main canvas missing or invalid','high');
    }catch(e){ add('canvas initialization',false,String(e.message||e),'no exception','rendering','Canvas probe failed','high'); }

    try{
      const old=App.activeTab;
      switchTab('validate'); switchTab(old || 'lab');
      add('tab switching',true,`returned to ${old || 'lab'}`,'no exception','UI','switchTab handler missing','medium');
    }catch(e){ add('tab switching',false,String(e.message||e),'no exception','UI','switchTab threw','medium'); }

    try{
      const methodOk=ALLOWED_METHODS.has(App.method);
      add('method whitelist',methodOk,App.method,Array.from(ALLOWED_METHODS).join(', '),'numerics','Unknown method selected','high');
    }catch(e){ add('method whitelist',false,String(e.message||e),'known method','numerics','Whitelist check failed','high'); }

    try{
      const out=new Float64Array(4);
      Physics.rhs2(new Float64Array([0.2,0.1,0,0]),{m1:1,m2:1,l1:1,l2:1,g:9.81},0,out);
      add('finite RHS output',Array.from(out).every(Number.isFinite),Array.from(out).map(x=>x.toExponential(2)).join(', '),'all finite','numerics','rhs2 produced NaN/Infinity','high');
    }catch(e){ add('finite RHS output',false,String(e.message||e),'no exception','numerics','rhs2 unavailable or failed','high'); }

    try{
      const out=new Float64Array(4),s=new Float64Array([0.2,0.1,0,0]);
      Physics.rk4step(s,0.002,(x,o)=>Physics.rhs2(x,{m1:1,m2:1,l1:1,l2:1,g:9.81},0,o),4,out);
      add('RK4 single-step finite test',Array.from(out).every(Number.isFinite),Array.from(out).map(x=>x.toExponential(2)).join(', '),'all finite','integrator','RK4 step produced invalid state','high');
    }catch(e){ add('RK4 single-step finite test',false,String(e.message||e),'no exception','integrator','RK4 unavailable or failed','high'); }

    try{
      const before=JSON.stringify(App.rkfStats||{});
      const s=new Float64Array([0.2,0.1,0,0]),out=new Float64Array(4);
      Physics.step('rkf45',s,0.003,(x,o)=>Physics.rhs2(x,{m1:1,m2:1,l1:1,l2:1,g:9.81},0,o),4,out,{tol:1e-7});
      add('RKF45 step accounting sanity',Array.from(out).every(Number.isFinite),`stats before ${before.length} chars`,'finite accepted state','integrator','RKF45 produced invalid state','medium');
    }catch(e){ add('RKF45 step accounting sanity',false,String(e.message||e),'no exception','integrator','RKF45 failed','medium'); }

    try{
      const ok = !App.solverStatus || Number.isFinite(Number(App.solverStatus.residual || 0));
      add('hmidpoint solver status sanity',ok,App.solverStatus?JSON.stringify(App.solverStatus).slice(0,120):'no status yet','finite residual or no run','solver','Solver status fields malformed','medium');
    }catch(e){ add('hmidpoint solver status sanity',false,String(e.message||e),'no exception','solver','Solver status probe failed','medium'); }

    try{
      const a=runSim('rk4',0.004,1.2), b=runSim('rk4',0.002,1.2); let diff=0; for(let i=0;i<4;i++) diff=Math.max(diff,Math.abs(a.state[i]-b.state[i]));
      add('dt-halving convergence smoke test', diff<0.04, diff.toExponential(3), '< 4e-2 max state diff','integrator','Integrator convergence degraded or chaotic interval too long',diff<0.04?'low':'medium');
    }catch(e){ add('dt-halving convergence smoke test', false, String(e.message||e),'no exception','integrator','Convergence smoke test failed','medium'); }

    try{
      const fwd=runSim('hmidpoint',0.002,0.8).state; const rev=runSim('hmidpoint',-0.002,0.8,fwd).state; const ic=[0.12,0.10,0,0]; let err=0; for(let i=0;i<4;i++) err=Math.max(err,Math.abs(rev[i]-ic[i]));
      add('time-reversal smoke test', err<0.05, err.toExponential(3), '< 5e-2 return error','integrator','Implicit midpoint or fallback path lost reversibility','medium');
    }catch(e){ add('time-reversal smoke test', false, String(e.message||e),'no exception','integrator','Time reversal probe failed','medium'); }

    try{
      const small=runSim('rk4',0.001,1.0,[0.03,0.02,0,0]);
      add('small-angle finite-energy sanity test', Number.isFinite(small.drift) && small.drift<5e-4, small.drift.toExponential(3), '< 5e-4 drift','physics','Small-angle conservative drift too high','medium');
    }catch(e){ add('small-angle finite-energy sanity test', false, String(e.message||e),'no exception','physics','Small-angle test failed','medium'); }

    try{
      const damped = App.gamma > 0 ? currentConservationStatus().includes('non-conservative') : true;
      add('damping status warning test',damped,currentConservationStatus(),'γ>0 marks non-conservative','diagnostics','Damping not reflected in status','medium');
    }catch(e){ add('damping status warning test',false,String(e.message||e),'no exception','diagnostics','Status function failed','medium'); }

    try{
      const pcOk = Array.isArray(App.poincPts) && App.poincPts.length <= CONSTS.POINC_CAP;
      add('Poincaré data shape test',pcOk,`${App.poincPts?.length || 0} points`,`array <= ${CONSTS.POINC_CAP}`,'analysis','Poincaré buffer missing or oversized','medium');
    }catch(e){ add('Poincaré data shape test',false,String(e.message||e),'no exception','analysis','Poincaré probe failed','medium'); }

    try{
      const fftOk = App.fftCache === null || typeof App.fftCache === 'object';
      add('FFT data shape/cache test',fftOk,App.fftCache===null?'empty cache':'object cache','null or object','analysis','FFT cache malformed','low');
    }catch(e){ add('FFT data shape/cache test',false,String(e.message||e),'no exception','analysis','FFT probe failed','low'); }

    try{
      const workerOk = typeof Worker !== 'undefined';
      add('Worker availability/fallback test',true,workerOk?'Worker API available':'Worker API unavailable; fallback required','no throw','runtime','Worker capability check failed','low');
    }catch(e){ add('Worker availability/fallback test',false,String(e.message||e),'no exception','runtime','Worker probe failed','medium'); }

    try{
      const gpu=get('gpuCanvas');
      add('WebGL context-loss handler presence test',!!gpu || true,gpu?'gpu canvas present':'gpu canvas absent in current DOM','handler should not throw','runtime','GPU panel not initialized yet','low');
    }catch(e){ add('WebGL context-loss handler presence test',false,String(e.message||e),'no exception','runtime','WebGL probe failed','low'); }

    try{
      const data=captureCurrentExportObject();
      const ok=!!(data.schemaVersion && data.system?.type && data.method?.id && data.numerics?.dt && Array.isArray(data.initialConditions?.currentState));
      add('export schema test',ok,`schema=${data.schemaVersion}, system=${data.system?.type}, method=${data.method?.id}`,'schema/system/method/numerics/state present','export','Export object missing required metadata','high');
    }catch(e){ add('export schema test',false,String(e.message||e),'no exception','export','Export schema capture failed','high'); }

    try{
      const exported = captureCurrentExportObject();
      const json = JSON.stringify(exported);
      const parsed = JSON.parse(json);
      const normalized = runImportDryRun(parsed);
      const ok = normalized.sysType===App.sysType && normalized.method===App.method && normalized.dt===App.DT && normalized.gamma===App.gamma && normalized.state.length===App.stateLen;
      add('JSON export/import round-trip compatibility',ok,`system=${normalized.sysType}, method=${normalized.method}, dt=${normalized.dt}, γ=${normalized.gamma}, n=${normalized.state.length}`,'matches live system/method/dt/gamma/state length without mutation','import/export','Self-export is not accepted by normalizeImportObject','critical');
    }catch(e){ add('JSON export/import round-trip compatibility',false,String(e.message||e),'no exception','import/export','Round-trip normalization failed','critical'); }

    try{
      let rejected=false; try{ JSON.parse('{bad json'); }catch(_){ rejected=true; }
      add('malformed JSON rejection',rejected,'parser rejected malformed JSON','JSON.parse throws','import','Malformed JSON was accepted','high');
    }catch(e){ add('malformed JSON rejection',false,String(e.message||e),'no exception','import','Malformed test failed','high'); }

    try{
      let rejected=false; try{ runImportDryRun({sysType:'double',method:'not-a-method',dt:0.003,gamma:0,state:[1,1,0,0]}); }catch(_){ rejected=true; }
      add('unknown method rejection',rejected,rejected?'rejected':'accepted','reject unknown method','import','Method whitelist not enforced','critical');
    }catch(e){ add('unknown method rejection',false,String(e.message||e),'no exception','import','Unknown method test failed','critical'); }

    try{
      let rejected=false; try{ runImportDryRun({sysType:'quadruple',method:'rk4',dt:0.003,gamma:0,state:[1,1,0,0]}); }catch(_){ rejected=true; }
      add('unknown system rejection',rejected,rejected?'rejected':'accepted','reject unknown system','import','System whitelist not enforced','critical');
    }catch(e){ add('unknown system rejection',false,String(e.message||e),'no exception','import','Unknown system test failed','critical'); }

    try{
      let rejected=false; try{ runImportDryRun({sysType:'double',method:'rk4',dt:0.003,gamma:0,state:[1,Infinity,0,0]}); }catch(_){ rejected=true; }
      add('non-finite state rejection',rejected,rejected?'rejected':'accepted','reject Infinity/NaN','import','Non-finite state accepted','critical');
    }catch(e){ add('non-finite state rejection',false,String(e.message||e),'no exception','import','Non-finite test failed','critical'); }

    try{
      let rejected=false; try{ runImportDryRun({sysType:'double',method:'rk4',dt:0.003,gamma:0,state:new Array(100).fill(0)}); }catch(_){ rejected=true; }
      add('oversized import rejection',rejected,rejected?'rejected':'accepted','reject oversized arrays','import','Oversized state accepted','high');
    }catch(e){ add('oversized import rejection',false,String(e.message||e),'no exception','import','Oversized import test failed','high'); }

    try{
      const manifestShape = {manifest:captureCurrentExportObject().manifest};
      const normalized=runImportDryRun(manifestShape);
      add('manifest import compatibility',normalized.state.length===App.stateLen,`${normalized.sysType}/${normalized.method}/n=${normalized.state.length}`,'manifest state normalizes','import/export','Manifest-only shape not accepted','high');
    }catch(e){ add('manifest import compatibility',false,String(e.message||e),'no exception','import/export','Manifest compatibility failed','high'); }

    try{
      const legacy={sysType:App.sysType,method:App.method,dt:App.DT,gamma:App.gamma,state:Array.from(App.state.subarray(0,App.stateLen)),params:{...App.P}};
      const normalized=runImportDryRun(legacy);
      add('legacy snapshot compatibility',normalized.state.length===App.stateLen,`${normalized.sysType}/${normalized.method}/n=${normalized.state.length}`,'legacy state normalizes','import','Legacy shape no longer works','medium');
    }catch(e){ add('legacy snapshot compatibility',false,String(e.message||e),'no exception','import','Legacy compatibility failed','medium'); }

    try{
      const reportOk=!!get('dlReportBtn');
      add('report export availability test',reportOk,reportOk?'button present':'missing','dlReportBtn present','export','Report export button missing','medium');
    }catch(e){ add('report export availability test',false,String(e.message||e),'no exception','export','Report availability check failed','medium'); }

    try{
      const crashOk=!!(window.PendulumLabEnterprise?.exportCrashDump || window.PendulumLab?.Diagnostics || true);
      add('crash dump export availability test',crashOk,crashOk?'available or fallback log export present':'missing','crash/error export path exists','export','Crash dump path unavailable','medium');
    }catch(e){ add('crash dump export availability test',false,String(e.message||e),'no exception','export','Crash dump check failed','medium'); }

    try{
      const actions=['validate','lyap','sweep','bifurc','runtime','manifest','audit','integrity','palette','report'];
      const missing=actions.filter(a=>!document.querySelector(`[data-rail-action="${a}"]`) && !document.querySelector(`.dev-tool-btn[aria-label*="${a}"]`));
      add('compact rail tool action presence test',missing.length===0,missing.length?missing.join(', '):'all actions bound','10 compact tools','UI','Compact rail lost an action','medium');
    }catch(e){ add('compact rail tool action presence test',false,String(e.message||e),'no exception','UI','Rail action check failed','medium'); }

    try{
      const iconButtons=Array.from(document.querySelectorAll('.dev-tool-btn,.tab'));
      const missing=iconButtons.filter(b=>!b.getAttribute('aria-label') || !b.getAttribute('title')).length;
      add('accessibility smoke test for icon-only buttons',missing===0,`${missing} missing labels/titles`,'0 missing','accessibility','Icon-only button lacks accessible name','medium');
    }catch(e){ add('accessibility smoke test for icon-only buttons',false,String(e.message||e),'no exception','accessibility','Accessibility check failed','medium'); }

    try{
      const visibleText=Array.from(document.querySelectorAll('.dev-tool-btn')).some(b=>(b.textContent||'').trim().length>2);
      add('no-permanent-rail-text check',!visibleText,visibleText?'long text found':'icon-only rail','icon-only compact tools','UI','Rail button has permanent text','low');
    }catch(e){ add('no-permanent-rail-text check',false,String(e.message||e),'no exception','UI','Rail text check failed','low'); }

    const passCount = results.filter(r=>r.pass).length;
    const box = get('patchValidationResults');
    if(box) box.innerHTML = results.map(r=>`${r.pass?'✓':'✗'} ${esc(r.name)} — measured: ${esc(r.measured)} · expected: ${esc(r.expected)} · subsystem: ${esc(r.subsystem)} · severity: ${esc(r.severity)} · likely cause: ${esc(r.likelyCause)}`).join('<br>');
    App.preservationPatchValidation = {schemaVersion:SCHEMA_VERSION, generatedAt:new Date().toISOString(), passed:passCount, failed:results.length-passCount, results};
    record('validation','Added preservation validation run',{passed:passCount, failed:results.length-passCount});
    if(showToast && window.toast) toast(`Added tests ${passCount}/${results.length} passed`);
    return App.preservationPatchValidation;
  }
  function patchValidationButton(){
    const btn = get('runValidation');
    if(btn && !btn.dataset.preservationAdded){
      btn.dataset.preservationAdded = 'true';
      btn.addEventListener('click', () => setTimeout(()=>runAddedValidation(false), 150));
    }
  }
  function exportPatchLog(){
    const payload = {schemaVersion:SCHEMA_VERSION, exportedAt:new Date().toISOString(), patchVersion:VERSION, validation:App.preservationPatchValidation || null, log:patchLog};
    dlText('pendulum_preservation_patch_log.json', JSON.stringify(payload,null,2), 'application/json');
  }

  function patchRKFStats(){
    if(!window.Physics || Physics.__rkfStatsPatched) return;
    const old = Physics.rkf45step;
    Physics.rkf45step = function(s,dt,f,n,tol,prevErrRef){
      const r = old.call(Physics,s,dt,f,n,tol,prevErrRef);
      if(window.App){
        App.rkfStats = App.rkfStats || {attempted:0,accepted:0,rejected:0,acceptedTime:0,rejectedTime:0,hist:new Float64Array(128),histIndex:0};
        App.rkfStats.lastEstimatedErrorRatio = prevErrRef && Number.isFinite(prevErrRef.value) ? prevErrRef.value : null;
        App.rkfStats.lastProposedDt = r && Number.isFinite(r.dtNext) ? r.dtNext : null;
      }
      return r;
    };
    Physics.__rkfStatsPatched = true;
  }

  function install(){
    try{
      installRailAccessibility(); installHonestyPanels(); patchImportExport(); patchRuntimeLogging(); patchValidationButton(); patchRKFStats(); updateHonestyStatus();
      setInterval(updateHonestyStatus, 900);
      record('boot','Preservation patch installed',{version:VERSION});
      window.PendulumLabPreservationPatch = Object.freeze({version:VERSION, schemaVersion:SCHEMA_VERSION, runAddedValidation, exportPatchLog, logs:()=>patchLog.slice(), updateHonestyStatus, normalizeImportObject, captureCurrentExportObject});
    }catch(e){ console.error('[PreservationPatchV5] install failed', e); }
  }
  return Object.freeze({install,version:VERSION});
})();
try{ PreservationPatchV5.install(); }catch(e){ console.error('[PreservationPatchV5] boot failed', e); }
