'use strict';

const ResearchHonestyLayer=(()=>{
  const VERSION='honesty-2026.05.17';
  const watchedControls=new Set(['dt','spf','trailLen','ensN','glowMode','longExpose','useWorker','autoQual','method','gamma','sysType']);
  const PRESET_DESCRIPTIONS={
    classic:'Balanced double-pendulum starting point. Useful for visual demonstrations and baseline drift checks.',
    butterfly:'Nearly identical high-sensitivity initial angles. Expected to show rapid chaotic divergence.',
    periodic:'Lower-energy configuration intended to show more regular motion before nonlinear coupling dominates.',
    symmetric:'Equal angles and lengths. Useful for checking symmetry preservation and visual phase behavior.',
    whirling:'Near-inverted high-energy pose. Expected to rotate and stress the integrator.',
    upright:'Small perturbation near the unstable upright equilibrium. Good for instability demonstration.',
    chaotic:'Large-angle double-pendulum configuration. Expected to produce positive Lyapunov behavior.',
    resonance:'Unequal masses and lengths. Useful for mode coupling and energy exchange.',
    triple:'Three-link extension. Some canonical double-pendulum diagnostics fall back to θ/ω dynamics.'
  };
  const TERMS={
    'Poincaré section':'A lower-dimensional slice of phase space sampled when a chosen crossing condition is met.',
    'Lyapunov exponent':'Rate at which nearby trajectories separate. Positive values are evidence of chaos, not a proof by themselves.',
    'symplectic':'A structure-preserving property of Hamiltonian time maps. Here it is claimed only conditionally for canonical hmidpoint when damping is zero and solver residual is small.',
    'Hamiltonian':'Total energy function expressed in canonical coordinates for conservative systems.',
    'FFT':'Fast Fourier Transform, used here to estimate dominant frequencies from θ₁ history.',
    'bifurcation':'Qualitative change in long-term behavior as a parameter is varied.',
    'phase space':'State space containing positions and velocities or momenta.',
    'Research Mode':'Mode that disables silent parameter mutation and favors explicit warnings over automatic correction.'
  };
  function nowISO(){return new Date().toISOString();}
  function finite(v,d='—'){return Number.isFinite(v)?v:d;}
  function fmt(v,d=3){return Number.isFinite(v)?Number(v).toFixed(d):'—';}
  function exp(v){return Number.isFinite(v)?Number(v).toExponential(2):'—';}
  function esc(s){return String(s).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}
  function ensureArrays(){
    App.auditLog=App.auditLog||[];App.errorLog=App.errorLog||[];App.longTaskLog=App.longTaskLog||[];App.validationBadges=App.validationBadges||{};
    App.solverStatus=App.solverStatus||{method:'—',converged:null,residual:null,iterations:null,failures:0};
    App.runMode=App.runMode||'demo';
  }
  function audit(kind,field,oldValue,newValue,reason){
    ensureArrays();
    const rec={kind,field,oldValue,newValue,reason:reason||'unspecified',simTime:App.simTime||0,t:nowISO()};
    App.auditLog.push(rec);if(App.auditLog.length>160)App.auditLog.shift();renderAuditLog();return rec;
  }
  function logError(kind,error){
    ensureArrays();
    const rec={kind,message:String(error&&error.message?error.message:error),stack:String(error&&error.stack?error.stack:''),t:nowISO(),simTime:App.simTime||0};
    App.errorLog.push(rec);if(App.errorLog.length>80)App.errorLog.shift();renderErrorLog();return rec;
  }
  function researchActive(){return App.runMode==='research'||App.runMode==='scientific';}
  function makeCard(title,id,content=''){
    const d=document.createElement('div');d.className='plx-card';if(id)d.id=id;d.innerHTML='<div class="plx-title">'+title+'</div>'+content;return d;
  }
  function installControlCard(){
    const controls=document.querySelector('#tab-lab .controls');if(!controls||document.getElementById('plxModeCard'))return;
    const card=makeCard('Mode & Scientific Honesty','plxModeCard',`<select id="plxRunMode" class="plx-select" title="Demo allows visual auto-scaling. Scientific/Research modes block silent parameter mutation."><option value="demo">Demo Mode — visual assist allowed</option><option value="scientific">Scientific Mode — diagnostics + no silent changes</option><option value="education">Education Mode — explanatory labels</option><option value="research">Research Mode — strict no-mutation policy</option></select><div class="plx-note" id="plxModeNote" style="margin-top:8px"></div>`);
    controls.insertBefore(card,controls.firstElementChild?controls.firstElementChild.nextSibling:null);
    const status=makeCard('Current Physics Summary','plxPhysicsCard','<div id="plxPhysicsSummary" class="plx-grid"></div>');
    controls.appendChild(status);
    const badges=makeCard('Validation Badges','plxBadgesCard','<div id="plxBadges" class="plx-badge-row"></div>');
    controls.appendChild(badges);
    const runtime=makeCard('Runtime / Error Log','plxRuntimeCard','<div id="plxRuntimeSummary" class="plx-grid"></div><div class="plx-log" id="plxErrorLog" style="margin-top:8px">no runtime errors</div>');
    controls.appendChild(runtime);
    const auditCard=makeCard('Auto-Stabilization Audit','plxAuditCard','<div class="plx-log" id="plxAuditLog">no automatic mutations recorded</div>');
    controls.appendChild(auditCard);
    document.getElementById('plxRunMode').addEventListener('change',e=>setRunMode(e.target.value));
  }
  function installCompareNote(){
    const controls=document.querySelector('#tab-compare .controls');if(!controls||document.getElementById('plxCompareNote'))return;
    const card=makeCard('Comparison Contract','plxCompareNote','<div class="plx-note"><strong>Fixed-step methods</strong> share identical initial conditions, dt, mass, length, gravity, damping, and duration. <strong>RKF45</strong> uses accepted adaptive steps, so its trace is normalized visually but not identical in timestep semantics.</div>');
    controls.insertBefore(card,controls.firstElementChild);
  }
  function installValidationExtensions(){
    const panel=document.querySelector('#tab-validate .left-col > div');if(panel&&!document.getElementById('plxDriftTests')){
      const box=document.createElement('div');box.id='plxDriftTests';box.style.marginTop='14px';box.innerHTML=`<div class="btnrow"><button id="plxDrift10">Energy Drift 10s</button><button id="plxDrift60">Energy Drift 60s</button><button id="plxDriftExt">Energy Drift Extended</button></div><div id="plxDriftResults" class="plx-log" style="margin-top:10px">No long-run drift test has been run.</div>`;
      panel.appendChild(box);
      document.getElementById('plxDrift10')?.addEventListener('click',()=>runEnergyDriftTest(10));
      document.getElementById('plxDrift60')?.addEventListener('click',()=>runEnergyDriftTest(60));
      document.getElementById('plxDriftExt')?.addEventListener('click',()=>runEnergyDriftTest(180));
    }
  }
  function installAboutPanel(){ return; }
  function methodologyText(){return `Pendulum Lab methodology\nGenerated: ${nowISO()}\nSystem: ${App.sysType}\nMethod: ${App.method}\ndt: ${App.DT}\nDamping: ${App.gamma}\nLimitations: point masses, ideal rods, browser floating-point, rendering approximations, triple fallback diagnostics.\n`;}
  function sessionSummary(){return `Pendulum Lab session — ${App.sysType}, method=${App.method}, dt=${App.DT}, gamma=${App.gamma}, maxDrift=${exp(App.maxDrift)}, t=${fmt(App.simTime,2)}s`;}
  function setRunMode(mode){
    ensureArrays();
    const prev=App.runMode;App.runMode=mode;
    const select=document.getElementById('plxRunMode');if(select&&select.value!==mode)select.value=mode;
    const note=document.getElementById('plxModeNote');
    if(researchActive()){
      const auto=document.getElementById('autoQual');if(auto&&auto.checked){auto.checked=false;auto.dispatchEvent(new Event('change',{bubbles:true}));audit('mode','autoQual',true,false,'Research/Scientific mode blocks silent quality scaling');}
      const si=document.getElementById('siAutoAssist');if(si&&si.checked){si.checked=false;si.dispatchEvent(new Event('change',{bubbles:true}));audit('mode','siAutoAssist',true,false,'Research/Scientific mode blocks automatic stabilization');}
      App.autoQual=false;App.powerSave=false;
      if(note)note.innerHTML='Silent parameter mutation is blocked. Warnings and explicit user actions remain allowed.';
    }else if(mode==='education'){
      if(note)note.innerHTML='Education labels and tooltips are emphasized. Automatic visual aids are allowed unless disabled manually.';
    }else{
      if(note)note.innerHTML='Demo mode allows visual quality scaling and assistance for smoother presentation.';
    }
    if(prev!==mode)audit('mode','runMode',prev,mode,'user mode selection');
    renderBadges();
  }
  function patchAutoQuality(){
    if(patchAutoQuality.done||typeof updateAutoQuality!=='function')return;patchAutoQuality.done=true;
    const old=updateAutoQuality;
    updateAutoQuality=function(){
      if(researchActive()){if(App.autoQual){audit('blocked','autoQual',true,false,'blocked by Research/Scientific mode');App.autoQual=false;}return;}
      const before={spf:App.SPF,level:App._qualLevel,badge:document.getElementById('qualBadge')?.textContent};
      const r=old.apply(this,arguments);
      if(before.spf!==App.SPF)audit('auto-quality','SPF',before.spf,App.SPF,'FPS hysteresis auto-quality scaling');
      if(before.level!==App._qualLevel)audit('auto-quality','qualityLevel',before.level,App._qualLevel,'FPS hysteresis auto-quality scaling');
      return r;
    };
  }
  function patchCanonicalSolver(){
    try{
      const cd=MachineGradeScientificPatch&&MachineGradeScientificPatch.CanonicalDouble;
      if(!cd||patchCanonicalSolver.done)return;patchCanonicalSolver.done=true;
      const old=cd.implicitMidpointCanonical;
      cd.implicitMidpointCanonical=function(y,dt,P,gamma,out){
        const info=old.call(cd,y,dt,P,gamma,out);
        App.solverStatus={method:'hmidpoint',converged:!!info.ok,residual:info.residual,iterations:info.iterations,failures:(App.solverStatus&&App.solverStatus.failures||0)+(info.ok?0:1),lastUpdate:nowISO()};
        if(!info.ok)audit('solver','implicitResidual',null,info.residual,'implicit midpoint failed convergence tolerance');
        return info;
      };
    }catch(e){logError('patchCanonicalSolver',e);}
  }
  function patchValidationMessages(){
    if(!Validation||patchValidationMessages.done)return;patchValidationMessages.done=true;
    const oldRunAll=Validation.runAll;
    Validation.runAll=async function(){
      const t0=performance.now();
      try{await oldRunAll.apply(Validation,arguments);}finally{
        App.validationBadges.deterministic={level:'info',text:'Determinism checked'};
        App.validationBadges.energy=App.maxDrift>1e-2?{level:'warn',text:'Energy Drift Warning'}:{level:'good',text:'Energy Drift Monitored'};
        const st=App.solverStatus||{};App.validationBadges.solver=st.converged===false?{level:'warn',text:'Solver Residual Warning'}:{level:'good',text:'Solver Residual OK'};
        App.validationBadges.research=researchActive()?{level:'info',text:'Research Mode Active'}:{level:'info',text:'Demo/Education Mode'};
        const tt=document.getElementById('testTime');if(tt)tt.textContent=`${(performance.now()-t0).toFixed(0)}ms`;
        renderBadges();
      }
    };
  }
  function runEnergyDriftTest(T){
    const el=document.getElementById('plxDriftResults');
    try{
      const n=App.sysType==='triple'?6:4;
      if(App.sysType==='triple'&&App.method==='hmidpoint'){if(el)el.textContent='Triple mode uses fallback dynamics for hmidpoint. Drift test continued with current θ/ω energy.';}
      const s=new Float64Array(App.state.slice(0,n));const P={...App.P};const gamma=App.gamma;const method=App.method;const dt=Math.max(0.0005,Math.min(App.DT||0.003,0.005));
      const f=App.sysType==='triple'?((x,o)=>Physics.rhs3(x,P,gamma,o)):((x,o)=>Physics.rhs2(x,P,gamma,o));
      const out=new Float64Array(CONSTS.MAX_STATE_DIM);const energy=()=>App.sysType==='triple'?Physics.energy3(s,P).total:Physics.energy2(s,P).total;
      const E0=energy();let max=0,sum=0,count=0,final=0;const steps=Math.min(500000,Math.ceil(T/dt));
      for(let i=0;i<steps;i++){
        Physics.step(method==='rkf45'?'rk4':method,s,dt,f,n,out);for(let k=0;k<n;k++)s[k]=out[k];
        const d=Math.abs((energy()-E0)/Math.max(1e-12,Math.abs(E0)));max=Math.max(max,d);sum+=d;count++;final=d;
      }
      const mean=sum/Math.max(1,count);const tol=method==='hmidpoint'||method==='rk4'||method==='yoshida4'?1e-3:1e-2;const ok=max<tol;
      const line=`${T}s drift test | method=${method} | dt=${dt} | max=${max.toExponential(3)} | mean=${mean.toExponential(3)} | final=${final.toExponential(3)} | tol=${tol.toExponential(1)} | ${ok?'PASS':'CHECK'}`;
      if(el)el.textContent=line;
      App.validationBadges.longDrift={level:ok?'good':'warn',text:`${T}s Drift ${ok?'Passed':'Warning'}`};renderBadges();audit('validation','energyDriftTest',null,{T,max,mean,final,tol,ok},'manual long-run validation');
    }catch(e){if(el)el.textContent='Drift test failed: '+e.message;logError('energyDriftTest',e);}
  }
  function patchReportExport(){
    const btn=document.getElementById('dlReportBtn');if(!btn||patchReportExport.done)return;patchReportExport.done=true;
    btn.addEventListener('click',()=>{
      const lam=App.lyapTime>0?(App.lyapSumLog/App.lyapTime):null;
      const st=App.solverStatus||{};
      const caps=App.capabilities||{};
      const report=`PENDULUM LAB — SCIENTIFIC SESSION REPORT\n=========================================\nGenerated: ${nowISO()}\nRun mode: ${App.runMode}\nSystem: ${App.sysType} pendulum\nIntegrator: ${App.method}\nIntegrator note: ${integratorStatement()}\n\nINITIAL / CURRENT STATE\n-----------------------\nθ1=${fmt(App.state[0],6)} θ2=${fmt(App.state[1],6)} ${App.sysType==='triple'?`θ3=${fmt(App.state[2],6)} `:''}\nState hash: ${App._stateHash}\n\nPARAMETERS\n----------\ndt=${App.DT} s\nsteps/frame=${App.SPF}\ntolerance=${App.tol}\ngamma=${App.gamma}\nm1=${App.P.m1} m2=${App.P.m2} m3=${App.P.m3}\nl1=${App.P.l1} l2=${App.P.l2} l3=${App.P.l3}\ng=${App.P.g}\n\nRESULTS\n-------\nSimulation time: ${fmt(App.simTime,3)} s\nMax |ΔE/E0|: ${exp(App.maxDrift)}\nCurrent ΔE/E0: ${exp(App._drift)}\nLyapunov estimate: ${lam===null?'N/A':fmt(lam,6)+' /s'}\nPoincare points: ${App.poincPts.length} / ${CONSTS.POINC_CAP}\nNaN recoveries: ${NaNGuard.count()}\n\nSOLVER STATUS\n-------------\nConverged: ${st.converged}\nResidual: ${exp(st.residual)}\nIterations: ${st.iterations??'—'}\nFailures: ${st.failures??0}\n\nRUNTIME\n-------\nFPS: ${fmt(App.fps,1)}\nPhysics ms: ${fmt(App.physMs,2)}\nRender ms: ${fmt(App.renderMs,2)}\nWorker latency: ${fmt(App.workerLatency,2)}\nWorker: ${caps.worker} · SharedArrayBuffer: ${caps.sab} · OffscreenCanvas: ${caps.offscreenCanvas} · WebGL2: ${caps.webgl2}\n\nAUTO-STABILIZATION EVENTS\n-------------------------\n${(App.auditLog||[]).slice(-20).map(x=>`${x.t} ${x.kind}.${x.field}: ${JSON.stringify(x.oldValue)} -> ${JSON.stringify(x.newValue)} | ${x.reason}`).join('\n')||'none'}\n\nVALIDATION BADGES\n-----------------\n${Object.values(App.validationBadges||{}).map(b=>`[${b.level}] ${b.text}`).join('\n')||'not run'}\n\nLIMITATIONS\n-----------\nPoint masses, ideal/massless rods where applicable, simplified damping, browser floating-point arithmetic, tab throttling, plot/render throttling, capped trail/Poincare buffers, and triple-pendulum fallback diagnostics. Damped runs are not conservative Hamiltonian systems.\n`;
      dlText('pendulum_scientific_report.txt',report);toast('Scientific report saved');
    });
  }
  function integratorStatement(){
    const m=App.method;
    if(m==='hmidpoint')return App.sysType==='double'&&App.gamma===0?'Canonical implicit midpoint: symplectic claim is conditional on solver convergence.':'Canonical midpoint label not fully applicable because damping or triple fallback is active.';
    if(m==='rkf45')return 'Adaptive accepted-step integrator; compare separately from fixed-step methods.';
    if(['leapfrog','yoshida4','symplectic','gauss2'].includes(m))return 'θ/ω pseudo-symplectic or noncanonical approximation; not exact canonical symplectic flow for nonseparable double pendulum.';
    return 'Explicit non-symplectic reference integrator.';
  }
  function patchPlotThrottle(){
    if(!Render||patchPlotThrottle.done)return;patchPlotThrottle.done=true;
    const names=['drawEnergy','drawLyap','drawPhase','drawPoincare'];
    for(const name of names){
      const old=Render[name];if(typeof old!=='function')continue;let last=0;
      Render[name]=function(){const n=performance.now();if(n-last<120)return;last=n;return old.apply(Render,arguments);};
    }
    const oldFFT=Render.drawFFT;if(typeof oldFFT==='function'){let last=0;Render.drawFFT=function(){const n=performance.now();if(n-last<CONSTS.FFT_INTERVAL_MS)return;last=n;return oldFFT.apply(Render,arguments);};}
  }
  function installErrorHandlers(){
    if(installErrorHandlers.done)return;installErrorHandlers.done=true;
    window.addEventListener('error',e=>logError('runtime',e.error||e.message));
    window.addEventListener('unhandledrejection',e=>logError('promise',e.reason));
  }
  function installRAFWatchdog(){
    if(installRAFWatchdog.done)return;installRAFWatchdog.done=true;
    window.addEventListener('load',()=>setTimeout(()=>{try{if(!document.hidden&&typeof startFrameLoop==='function')startFrameLoop();}catch(e){logError('postLoadRAF',e);}},80));
    setInterval(()=>{
      try{
        App.pageVisible=!document.hidden;
        if(!document.hidden&&!App.paused&&typeof startFrameLoop==='function'&&typeof _rafId!=='undefined'&&_rafId===null){audit('watchdog','raf',null,'restart','RAF stopped while visible');startFrameLoop();}
        if(typeof CanvasMgr!=='undefined'){for(const id of ['main','energy','lyap','phase','poincare','fft']){const c=document.getElementById(id);if(!c)continue;const r=c.getBoundingClientRect();if(r.width<8||r.height<8)continue;CanvasMgr.init(c);}}
      }catch(e){logError('rafWatchdog',e);}
    },1500);
  }
  function installLongTaskObserver(){
    if(installLongTaskObserver.done)return;installLongTaskObserver.done=true;
    try{
      if('PerformanceObserver' in window){
        const po=new PerformanceObserver(list=>{for(const entry of list.getEntries()){App.longTaskLog.push({duration:entry.duration,start:entry.startTime,t:nowISO()});if(App.longTaskLog.length>80)App.longTaskLog.shift();if(entry.duration>120)audit('performance','longTask',null,entry.duration,'PerformanceObserver long task');}});
        po.observe({entryTypes:['longtask']});App.longTaskObserver=po;
      }
    }catch(e){logError('longTaskObserver',e);}
  }
  function installTooltips(){
    for(const btn of document.querySelectorAll('[data-preset]')){const d=PRESET_DESCRIPTIONS[btn.dataset.preset];if(d)btn.title=d;}
    const hints={method:'Selects numerical integrator. hmidpoint is conditionally symplectic only for undamped double-pendulum canonical dynamics.',gamma:'Damping coefficient. Any positive value makes the system dissipative, so energy conservation diagnostics become interpretive.',tol:'Adaptive RKF45 tolerance. Smaller values usually increase accuracy and cost.',cmpDt:'Fixed comparison timestep for nonadaptive methods.'};
    for(const [id,msg] of Object.entries(hints)){const el=document.getElementById(id);if(el)el.title=msg;}
    for(const [term,msg] of Object.entries(TERMS)){/* reserved for dynamically generated help */}
  }
  function renderKV(container,rows){
    const el=typeof container==='string'?document.getElementById(container):container;if(!el)return;
    el.innerHTML=rows.map(([k,v])=>`<div class="plx-kv"><span>${esc(k)}</span><span title="${esc(v)}">${esc(v)}</span></div>`).join('');
  }
  function renderPhysicsSummary(){
    renderKV('plxPhysicsSummary',[
      ['mode',App.runMode||'demo'],['system',App.sysType],['integrator',App.method],['dt',String(App.DT)],['damping γ',String(App.gamma)],['energy drift',exp(App.maxDrift)],['solver',solverText()],['Poincaré',`${App.poincPts.length}/${CONSTS.POINC_CAP}`],['trail cap',String(App.maxTrailLen)],['backend',backendText()]
    ]);
    const caps=document.getElementById('plxMethodCaps');if(caps)renderKV(caps,[['Worker',String(App.capabilities?.worker??(typeof Worker!=='undefined'))],['SharedArrayBuffer',String(CONSTS.SAB_SUPPORTED)],['OffscreenCanvas',String(App.capabilities?.offscreenCanvas??(typeof OffscreenCanvas!=='undefined'))],['WebGL2',String(App.capabilities?.webgl2??false)],['GPU density',App.gpuFallback?'Canvas fallback':(App.gl?'WebGL active':'not initialized')]]);
  }
  function solverText(){const s=App.solverStatus||{};if(App.method!=='hmidpoint')return 'not implicit';if(s.converged===false)return `WARN ${exp(s.residual)}`;if(s.converged===true)return `OK ${exp(s.residual)}`;return 'pending';}
  function backendText(){return App.gpuFallback?'Canvas2D fallback':(App.gl?'WebGL active':'Canvas2D');}
  function renderRuntimeSummary(){
    renderKV('plxRuntimeSummary',[
      ['boot failures',String((App.bootLog||[]).filter(x=>x.state==='failed').length)],['last RAF',typeof _rafId==='undefined'?'unknown':(_rafId===null?'stopped':'active')],['worker',App.workerReady?'ready':'unavailable/pending'],['last fault',(App.errorLog&&App.errorLog.length)?App.errorLog[App.errorLog.length-1].kind:'none'],['long tasks',String((App.longTaskLog||[]).length)],['recoveries',String(NaNGuard.count())]
    ]);
  }
  function renderBadges(){
    const el=document.getElementById('plxBadges');if(!el)return;
    const st=App.solverStatus||{};
    const badges=[
      {level:researchActive()?'info':'info',text:researchActive()?'Research Mode Active':'Demo/Education Mode'},
      {level:App.gamma>0?'warn':'good',text:App.gamma>0?'Damped: non-Hamiltonian':'Conservative γ=0'},
      {level:App.method==='hmidpoint'&&App.sysType==='double'&&App.gamma===0?'good':'info',text:integratorStatement().slice(0,46)},
      {level:st.converged===false?'warn':'good',text:st.converged===false?'Solver Residual Warning':'Solver Status OK'},
      {level:App.maxDrift>1e-2?'warn':'good',text:App.maxDrift>1e-2?'Energy Drift Warning':'Energy Drift OK'},
      ...Object.values(App.validationBadges||{})
    ];
    el.innerHTML=badges.map(b=>`<span class="plx-badge ${b.level||'info'}">${esc(b.text)}</span>`).join('');
  }
  function renderAuditLog(){
    const el=document.getElementById('plxAuditLog');if(!el)return;
    const rows=(App.auditLog||[]).slice(-16).reverse();el.textContent=rows.length?rows.map(r=>`${r.t.split('T')[1].replace('Z','')} ${r.kind}.${r.field}: ${JSON.stringify(r.oldValue)} → ${JSON.stringify(r.newValue)} | ${r.reason}`).join('\n'):'no automatic mutations recorded';
  }
  function renderErrorLog(){
    const el=document.getElementById('plxErrorLog');if(!el)return;
    const rows=(App.errorLog||[]).slice(-10).reverse();el.textContent=rows.length?rows.map(r=>`${r.t.split('T')[1].replace('Z','')} [${r.kind}] ${r.message}`).join('\n'):'no runtime errors';
  }
  function tick(){renderPhysicsSummary();renderRuntimeSummary();renderBadges();renderAuditLog();renderErrorLog();}
  function exposeNamespace(){
    window.PendulumLab=Object.freeze({version:VERSION,App,Physics,Validation,Diagnostics:{audit,logError,get auditLog(){return App.auditLog||[];},get errors(){return App.errorLog||[];},get solver(){return App.solverStatus;}},Layers:{ResearchHonestyLayer,MachineGradeScientificPatch,ResearchGradeEngineLayer,UltimateEnterpriseEngine,APlusEngineLayer,StableIntuitiveLayer},metadata:{singleFile:true,limits:['browser floating point','point-mass idealization','triple fallback diagnostics','plot/render throttling']}});
  }
  function install(){
    ensureArrays();installControlCard();installCompareNote();installValidationExtensions();installAboutPanel();installTooltips();
    patchAutoQuality();patchCanonicalSolver();patchValidationMessages();patchReportExport();patchPlotThrottle();installErrorHandlers();installRAFWatchdog();installLongTaskObserver();
    setRunMode(App.runMode||'demo');setInterval(tick,500);tick();exposeNamespace();
    try{Log.info('BOOT','Research honesty layer installed',{version:VERSION});}catch(_){ }
  }
  return Object.freeze({version:VERSION,install,audit,logError,setRunMode,runEnergyDriftTest});
})();
try{ResearchHonestyLayer.install();}catch(e){console.error('[ResearchHonestyLayer] install failed',e);}
