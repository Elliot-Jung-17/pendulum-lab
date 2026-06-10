'use strict';
const StableIntuitiveLayer=(()=>{
  const VERSION='vStableIntuitive-2026.05.15';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const safeNum=(v,fb=0)=>Number.isFinite(Number(v))?Number(v):fb;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const localKey='pendulum.stableIntuitive.v1';
  const state={autoAssist:true,lastRecoveries:0,lastFps:60,lastDrift:0,lastAdvice:'Running normally',health:'good',monitor:null};

  function notify(msg,ms=1800){
    try{ if(typeof toast==='function') toast(msg,ms); else console.log('[Pendulum]',msg); }catch(_){console.log('[Pendulum]',msg);}
  }
  function setInputValue(id,value,fire=true){
    const el=document.getElementById(id); if(!el) return false;
    el.value=String(value);
    if(fire){el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
    return true;
  }
  function clickIf(id){const el=document.getElementById(id);if(el)el.click();}
  function currentHealth(){
    const app=typeof App!=='undefined'?App:null;
    const fps=app&&Number.isFinite(app.fps)?app.fps:0;
    const drift=app&&Number.isFinite(app._drift)?Math.abs(app._drift):0;
    const recoveries=typeof NaNGuard!=='undefined'&&NaNGuard.count?NaNGuard.count():0;
    const phys=app&&Number.isFinite(app.physMs)?app.physMs:0;
    let health='good',advice='Running normally';
    if(recoveries>state.lastRecoveries){health='bad';advice='Numerical fault detected — recovered. Reduce dt or apply Stable Defaults.';}
    else if(fps>0&&fps<24){health='warn';advice='Low FPS. Try Performance Mode or reduce trail / ensemble.';}
    else if(drift>1e-2){health='warn';advice='Energy drift is high. Reduce dt or switch to hmidpoint / RK4.';}
    else if(phys>18){health='warn';advice='Simulation cost is high. Reduce steps / frame.';}
    return {fps,drift,recoveries,phys,health,advice};
  }
  function setMetric(id,value,level){
    const box=document.getElementById(id); if(!box) return;
    const span=box.querySelector('span'); if(span) span.textContent=value;
    box.classList.remove('good','warn','bad'); if(level) box.classList.add(level);
  }
  function updateHealthPanel(){
    const h=currentHealth();
    state.lastFps=h.fps;state.lastDrift=h.drift;state.health=h.health;state.lastAdvice=h.advice;
    setMetric('siFps',h.fps?`${h.fps.toFixed(1)} fps`:'—',h.fps>=45?'good':h.fps>=24?'warn':'bad');
    setMetric('siDrift',Number.isFinite(h.drift)?h.drift.toExponential(2):'—',h.drift<1e-4?'good':h.drift<1e-2?'warn':'bad');
    setMetric('siRecoveries',String(h.recoveries),h.recoveries===0?'good':h.recoveries===state.lastRecoveries?'warn':'bad');
    setMetric('siPhys',h.phys?`${h.phys.toFixed(2)} ms`:'—',h.phys<8?'good':h.phys<18?'warn':'bad');
    const advice=$('#siAdvice'); if(advice){
      const label=document.createElement('strong');label.textContent='Status:';
      const text=document.createTextNode(' '+h.advice+' ');
      const badge=document.createElement('span');badge.className='si-badge '+h.health;badge.textContent=h.health.toUpperCase();
      advice.replaceChildren(label,text,badge);
    }
    if(state.autoAssist) applyAdaptiveAssist(h);
    state.lastRecoveries=h.recoveries;
  }
  function applyAdaptiveAssist(h){
    if(typeof App==='undefined') return;
    if(App.runMode==='research'||App.runMode==='benchmark'||App.runMode==='scientific') return;
    const now=performance.now();
    if(App._siLastAssist&&now-App._siLastAssist<2500) return;
    if(h.recoveries>state.lastRecoveries){
      App._siLastAssist=now;
      const dtEl=$('#dt'),spfEl=$('#spf');
      if(dtEl){const next=Math.max(safeNum(dtEl.min,0.0005),safeNum(dtEl.value,App.DT||0.003)*0.7);setInputValue('dt',next.toFixed(4));}
      if(spfEl){const next=Math.max(1,Math.floor(safeNum(spfEl.value,App.SPF||6)*0.75));setInputValue('spf',next);}
      notify('Auto-stabilize: dt and steps/frame reduced.',2400);
    }else if(h.fps>0&&h.fps<18){
      App._siLastAssist=now;
      const trail=$('#trailLen'),ens=$('#ensN');
      if(trail){const next=Math.max(safeNum(trail.min,100),Math.floor(safeNum(trail.value,1500)*0.75));setInputValue('trailLen',next);}
      if(ens){const next=Math.max(safeNum(ens.min,0),Math.floor(safeNum(ens.value,12)*0.75));setInputValue('ensN',next);}
      const glow=$('#glowMode'),long=$('#longExpose');
      if(glow&&glow.checked){glow.checked=false;glow.dispatchEvent(new Event('change',{bubbles:true}));}
      if(long&&long.checked){long.checked=false;long.dispatchEvent(new Event('change',{bubbles:true}));}
      notify('Auto-stabilize: render load reduced.',2200);
    }
  }
  function makePanel(){
    if($('#stableIntuitivePanel')) return;
    const panel=document.createElement('section');
    panel.id='stableIntuitivePanel';panel.className='si-panel';
    panel.innerHTML=`<div class="si-top"><div><div class="si-title">Stable Control Layer</div><div class="si-desc">Runtime assist layer. Auto-actions are disabled in Research/Benchmark modes.</div></div><div class="si-status"><div id="siFps" class="si-metric"><b>FPS</b><span>—</span></div><div id="siPhys" class="si-metric"><b>Sim Cost</b><span>—</span></div><div id="siDrift" class="si-metric"><b>Energy Drift</b><span>—</span></div><div id="siRecoveries" class="si-metric"><b>Recoveries</b><span>0</span></div></div><div class="si-actions"><button id="siStableDefaults" class="primary">Stable Defaults</button><button id="siAccuracyMode">Accuracy Mode</button><button id="siPerfMode">Performance Mode</button><button id="siRecoverBtn" class="danger">Recover</button><button id="siHelpBtn">Help</button><label class="si-toggle"><input id="siAutoAssist" type="checkbox" checked> Auto-stabilize</label></div></div><div class="si-guide"><div id="siAdvice" class="si-note"><strong>Status:</strong> initializing</div><div><input id="siControlSearch" class="si-search" aria-label="Search controls — e.g. dt, mass, trail, lyapunov, validation"><div class="si-small" style="margin-top:5px">Click any group title to collapse / expand. Type to filter related settings.</div></div></div>`;
    const after=document.querySelector('.diag-row')||document.querySelector('header');
    if(after&&after.parentNode) after.parentNode.insertBefore(panel,after.nextSibling); else document.body.insertBefore(panel,document.body.firstChild);
    $('#siStableDefaults')?.addEventListener('click',applyStableDefaults);
    $('#siAccuracyMode')?.addEventListener('click',applyAccuracyMode);
    $('#siPerfMode')?.addEventListener('click',applyPerformanceMode);
    $('#siRecoverBtn')?.addEventListener('click',recoverRuntime);
    $('#siHelpBtn')?.addEventListener('click',showHelp);
    $('#siAutoAssist')?.addEventListener('change',e=>{state.autoAssist=!!e.target.checked;saveSettings();notify(state.autoAssist?'Auto-stabilize: ON':'Auto-stabilize: OFF');});
    const q=$('#siControlSearch'); if(q) q.addEventListener('input',()=>filterControls(q.value));
  }
  function makeHelp(){
    if($('#siHelpBackdrop')) return;
    const d=document.createElement('div');d.id='siHelpBackdrop';d.className='si-help-backdrop';
    const box=document.createElement('div');box.className='si-help';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Pendulum Lab quick help');
    const close=document.createElement('button');close.className='si-close';close.id='siCloseHelp';close.textContent='Close';
    const h=document.createElement('h2');h.textContent='Quick Help';
    const p=document.createElement('p');p.textContent='Long method notes, assumptions, validation philosophy, and interpretation guidance are in README.md. The app keeps only operational controls and warnings.';
    box.append(close,h,p);d.appendChild(box);document.body.appendChild(d);
    $('#siCloseHelp').addEventListener('click',hideHelp); d.addEventListener('click',e=>{if(e.target===d)hideHelp();});
  }
  function showHelp(){makeHelp();$('#siHelpBackdrop').classList.add('show');}
  function hideHelp(){const d=$('#siHelpBackdrop');if(d)d.classList.remove('show');}
  function applyStableDefaults(){
    setInputValue('method','rk4');setInputValue('dt','0.0030');setInputValue('spf','6');setInputValue('speed','1.0');
    setInputValue('trailLen','1200');setInputValue('ensN','12');setInputValue('gamma','0');
    const glow=$('#glowMode'),long=$('#longExpose'),interp=$('#interpolateRender');
    if(glow&&glow.checked){glow.checked=false;glow.dispatchEvent(new Event('change',{bubbles:true}));}
    if(long&&long.checked){long.checked=false;long.dispatchEvent(new Event('change',{bubbles:true}));}
    if(interp&&!interp.checked){interp.checked=true;interp.dispatchEvent(new Event('change',{bubbles:true}));}
    try{if(typeof fullReset==='function')fullReset();else clickIf('resetBtn');}catch(_){clickIf('resetBtn');}
    notify('Stable defaults applied'); highlight('#stableIntuitivePanel');
  }
  function applyAccuracyMode(){
    const method=$('#method');
    if(method&&method.querySelector('option[value="hmidpoint"]')) setInputValue('method','hmidpoint'); else setInputValue('method','rk4');
    setInputValue('dt','0.0015');setInputValue('spf','8');setInputValue('speed','1.0');setInputValue('trailLen','1800');setInputValue('ensN','8');setInputValue('gamma','0');
    notify('Accuracy Mode applied — smaller dt and conservative settings'); highlight('#method');
  }
  function applyPerformanceMode(){
    setInputValue('dt','0.0040');setInputValue('spf','4');setInputValue('trailLen','600');setInputValue('ensN','4');
    const glow=$('#glowMode'),long=$('#longExpose');
    if(glow&&glow.checked){glow.checked=false;glow.dispatchEvent(new Event('change',{bubbles:true}));}
    if(long&&long.checked){long.checked=false;long.dispatchEvent(new Event('change',{bubbles:true}));}
    notify('Performance Mode applied — reduced render / ensemble load'); highlight('#fpsBadge');
  }
  function recoverRuntime(){
    try{clickIf('clearTrailBtn');clickIf('clearPoincBtn');}catch(_){}
    const glow=$('#glowMode'),long=$('#longExpose');
    if(glow&&glow.checked){glow.checked=false;glow.dispatchEvent(new Event('change',{bubbles:true}));}
    if(long&&long.checked){long.checked=false;long.dispatchEvent(new Event('change',{bubbles:true}));}
    const dt=$('#dt'),spf=$('#spf');
    if(dt&&safeNum(dt.value,0.003)>0.004)setInputValue('dt','0.0030');
    if(spf&&safeNum(spf.value,6)>10)setInputValue('spf','6');
    try{if(typeof NaNGuard!=='undefined'&&NaNGuard.snapshot&&typeof App!=='undefined')NaNGuard.snapshot(App.state);}catch(_){}
    notify('Recovery complete — cleared trails and heavy effects');
  }
  function highlight(sel){const el=$(sel);if(!el)return;el.classList.add('si-highlight');setTimeout(()=>el.classList.remove('si-highlight'),2400);}
  function makeGroupsCollapsible(){
    $$('.controls .grp').forEach((grp,idx)=>{
      if(grp.classList.contains('si-collapsible'))return;
      grp.classList.add('si-collapsible');grp.dataset.siIndex=String(idx);
      const title=$('.grp-title',grp); if(!title)return;
      title.title='Click to collapse / expand';
      title.addEventListener('click',e=>{if(e.target&&['BUTTON','INPUT','SELECT'].includes(e.target.tagName))return;grp.classList.toggle('si-collapsed');saveSettings();});
    });
    restoreCollapsedGroups();
  }
  function filterControls(raw){
    const q=(raw||'').trim().toLowerCase();
    $$('.controls .grp').forEach(grp=>{
      if(!q){grp.classList.remove('si-row-hidden');$$('.row,.btnrow,.shorts,.stats',grp).forEach(el=>el.classList.remove('si-row-hidden'));return;}
      const title=($('.grp-title',grp)?.textContent||'').toLowerCase();
      let any=title.includes(q);
      $$('.row,.btnrow,.shorts,.stats',grp).forEach(el=>{
        const match=(el.textContent||'').toLowerCase().includes(q)||Array.from(el.querySelectorAll('input,select,button')).some(x=>(x.id||x.value||x.textContent||'').toLowerCase().includes(q));
        el.classList.toggle('si-row-hidden',!match&&!title.includes(q));
        if(match)any=true;
      });
      grp.classList.toggle('si-row-hidden',!any);
    });
  }
  function installTooltips(){
    const tips={
      lab:'Base simulation with live energy / phase / FFT',compare:'Compare energy conservation and divergence across integrators',lyap:'QR-stabilized Lyapunov spectrum',sweep:'Chaos map across initial-condition grid',bifurc:'Bifurcation structure under parameter changes',phase3d:'3D phase-space trajectory',density:'WebGL2 phase-density accumulation',validate:'Determinism, convergence, replay validation',aplus:'Generalized N-link engine and scientific audit'
    };
    $$('.tab').forEach(t=>{const k=t.dataset.tab;if(k&&tips[k])t.title=tips[k];});
    const controlTips={
      dt:'Time step per physics tick — smaller is more stable but slower.',spf:'Physics steps per frame — higher = faster sim time but heavier load.',method:'Numerical integration method. For long-term conservation, compare hmidpoint / Leapfrog family with RK4.',tol:'Tolerance for the RKF45 adaptive integrator.',trailLen:'Length of the on-screen trail — large values increase render load.',ensN:'Ensemble of nearby initial conditions for chaos divergence — heavier on CPU.',gamma:'Damping coefficient. 0 = conservative system, ideal for energy-conservation tests.'
    };
    for(const [id,tip] of Object.entries(controlTips)){const el=document.getElementById(id);if(el)el.title=tip;const lab=el?.closest('.row')?.querySelector('label');if(lab)lab.title=tip;}
  }
  function sanitizeInputElement(el){
    if(!el||!['range','number'].includes(el.type))return;
    const min=el.min!==''?safeNum(el.min,-Infinity):-Infinity;
    const max=el.max!==''?safeNum(el.max,Infinity):Infinity;
    const cur=safeNum(el.value,NaN);
    if(!Number.isFinite(cur)){if(Number.isFinite(min))el.value=String(min);return;}
    const next=clamp(cur,min,max);
    if(next!==cur)el.value=String(next);
  }
  function installInputGuards(){
    document.addEventListener('change',e=>sanitizeInputElement(e.target),true);
    document.addEventListener('input',e=>sanitizeInputElement(e.target),true);
    window.addEventListener('error',e=>{console.error('[StableIntuitiveLayer] Runtime error:',e.error||e.message);notify('Error detected — check the console log and the Recover button.',3200);});
    window.addEventListener('unhandledrejection',e=>{console.error('[StableIntuitiveLayer] Promise rejection:',e.reason);notify('Async error detected — operation aborted, state preserved.',3200);});
    document.addEventListener('webglcontextlost',e=>{e.preventDefault();notify('WebGL context lost — restoring GPU density…',3200);},true);
    document.addEventListener('webglcontextrestored',()=>{try{if(typeof gpuInit==='function')gpuInit();}catch(_){}notify('WebGL context restored');},true);
  }
  function saveSettings(){
    try{
      const collapsed=$$('.controls .grp.si-collapsed').map(g=>g.dataset.siIndex);
      localStorage.setItem(localKey,JSON.stringify({autoAssist:state.autoAssist,collapsed}));
    }catch(_){}
  }
  function loadSettings(){
    try{
      const raw=localStorage.getItem(localKey); if(!raw)return;
      const s=JSON.parse(raw); if(typeof s.autoAssist==='boolean')state.autoAssist=s.autoAssist;
    }catch(_){}
  }
  function restoreCollapsedGroups(){
    try{
      const raw=localStorage.getItem(localKey);if(!raw)return;const s=JSON.parse(raw);const set=new Set(s.collapsed||[]);
      $$('.controls .grp').forEach(g=>g.classList.toggle('si-collapsed',set.has(g.dataset.siIndex)));
      const cb=$('#siAutoAssist');if(cb)cb.checked=state.autoAssist;
    }catch(_){}
  }
  function installKeyboard(){
    document.addEventListener('keydown',e=>{
      if(e.target&&['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
      if(e.key==='?'||e.key==='F1'){e.preventDefault();showHelp();}
      if(e.key.toLowerCase()==='s'&&e.altKey){e.preventDefault();applyStableDefaults();}
      if(e.key.toLowerCase()==='f'&&e.altKey){e.preventDefault();applyPerformanceMode();}
    });
  }
  function exposeAPI(){
    window.PendulumStableUI=Object.freeze({version:VERSION,applyStableDefaults,applyAccuracyMode,applyPerformanceMode,recoverRuntime,health:currentHealth});
  }
  function install(){
    loadSettings();makePanel();makeHelp();makeGroupsCollapsible();installTooltips();installInputGuards();installKeyboard();exposeAPI();
    const cb=$('#siAutoAssist');if(cb)cb.checked=state.autoAssist;
    state.monitor=setInterval(updateHealthPanel,1000);updateHealthPanel();
    try{if(typeof Log!=='undefined'&&Log.info)Log.info('BOOT','Stable intuitive layer installed',{version:VERSION});}catch(_){}
    notify('Stable Control Layer ready',1400);
  }
  return Object.freeze({install,version:VERSION,applyStableDefaults,applyAccuracyMode,applyPerformanceMode,recoverRuntime,health:currentHealth});
})();
try{StableIntuitiveLayer.install();}catch(e){console.error('[StableIntuitiveLayer] install failed',e);}
