'use strict';

const FeatureIntegrityGuard=(()=>{
  const VERSION='Feature Integrity Guard 2026.05.15';
  const requiredDomIds=["KY", "L1", "L2", "L3", "L4", "LSum", "aplusArch", "aplusNLink", "aplusSummary", "aplusValidation", "audioOn", "audioVol", "audioVolV", "autoQual", "bEuler", "bGauss", "bLeap", "bRK2", "bRK4", "bRKF45", "bSympl", "bYosh", "bifCanvas", "bifExport", "bifGMax", "bifGMaxV", "bifGMin", "bifGMinV", "bifProgress", "bifStart", "bifStatus", "bifSteps", "bifStepsV", "bifStop", "bifT", "bifTV", "canonAdaptive", "canonIntegrators", "canonReport", "canonResidualStat", "canonSubsystems", "canonValidation", "clearPoincBtn", "clearTrailBtn", "cmpBench", "cmpBenchBtn", "cmpCanvas", "cmpDiverge", "cmpDt", "cmpDtV", "cmpEnergy", "cmpStart", "cmpStop", "dBackend", "dHash", "dPhys", "dPoinc", "dRender", "dWorker", "dlJsonBtn", "dlPNGBtn", "dlPoincBtn", "dlReportBtn", "dlTrajBtn", "driftStat", "dt", "dtV", "eStat", "energy", "ensEps", "ensEpsV", "ensN", "ensNV", "exportAPlusReport", "exportManifestV3", "fft", "fpsBadge", "g", "gV", "gamma", "gammaV", "glowMode", "gpuAlpha", "gpuAlphaV", "gpuCanvas", "gpuClear", "gpuStatus", "interpolateRender", "iw1", "iw1V", "iw2", "iw2V", "iw3", "iw3V", "jsonFile", "l1", "l1V", "l2", "l2V", "l3", "l3V", "loadJsonBtn", "longExpose", "lyap", "lyapDt", "lyapDtV", "lyapEps", "lyapEpsV", "lyapExport", "lyapResults", "lyapSpecCanvas", "lyapStart", "lyapStat", "lyapStatus", "lyapStop", "lyapT", "lyapTV", "m1", "m1V", "m2", "m2V", "m3", "m3V", "main", "memStat", "method", "methodClassStat", "modeLabel", "nanOverlay", "nanStat", "p3dCanvas", "p3dClear", "p3dDepthFade", "p3dInertia", "p3dN", "p3dNV", "p3dResetCam", "pauseBtn", "phase", "phaseAxis", "poincare", "qualBadge", "recBtn", "resetBtn", "rewindBtn", "rgContract", "rgExportSnapshot", "rgIntegrators", "rgNumerics", "rgOpt", "rgPerf", "rgQueue", "rgRenderGraph", "rgRunProbe", "rgRunTests", "rgState", "rgTests", "rkfStat", "runAPlusAudit", "runCanonValidation", "runConvergence", "runDeterminism", "runReplay", "runStress", "runValidation", "savePreset", "scrubVal", "scrubber", "seed", "shareUrl", "siAccuracyMode", "siAdvice", "siAutoAssist", "siCloseHelp", "siControlSearch", "siDrift", "siFps", "siHelpBtn", "siPerfMode", "siPhys", "siRecoverBtn", "siRecoveries", "siStableDefaults", "speed", "speedV", "spf", "spfV", "stable-intuitive-layer", "stable-intuitive-style", "stats", "sweepCanvas", "sweepExportCSV", "sweepExportPNG", "sweepProgress", "sweepRes", "sweepResV", "sweepStart", "sweepStatus", "sweepStop", "sweepT", "sweepTV", "symplDefectStat", "sysType", "tStat", "tab-bifurc", "tab-compare", "tab-density", "tab-lab", "tab-lyap", "tab-phase3d", "tab-sweep", "tab-validate", "testFailed", "testPassed", "testStats", "testTime", "th1", "th1Stat", "th1V", "th2", "th2Stat", "th2V", "th3", "th3V", "toast", "tol", "tolV", "trailLen", "trailLenV", "trailMode", "ueArchMap", "ueCaps", "ueCaptureCheckpoint", "ueCollapse", "ueContracts", "ueExportManifest", "ueExportReplay", "ueFaults", "ueFloatBody", "uePlugins", "ueResources", "ueRunContract", "ueStability", "ueTasks", "ueToggleDiag", "ueVerdict", "useCanonMethod", "useWorker", "validateResults", "verdict"];
  const requiredSymbols=["CONSTS", "IDX_DOUBLE", "Log", "EventBus", "makePRNG", "hashState", "CircularBuffer", "NaNGuard", "CanvasMgr", "Physics", "App", "UI", "WorkerMgr", "MachineGradeScientificPatch", "ResearchGradeEngineLayer", "UltimateEnterpriseEngine", "APlusEngineLayer", "StableIntuitiveLayer", "ResearchHonestyLayer", "Validation", "fullReset", "physicsTick", "switchTab", "startFrameLoop", "dlText"];
  const featureInventory=[["Lab simulation", "double/triple pendulum, trails, energy, phase, FFT"], ["Integrator comparison", "RK4/RKF45/Leapfrog/Yoshida/Gauss/Symplectic/RK2/Euler comparison"], ["Lyapunov spectrum", "QR/Benettin Lyapunov spectrum analysis"], ["Parameter sweep", "chaos map over initial conditions"], ["Bifurcation", "Poincaré samples versus parameter changes"], ["3D phase", "interactive 3D phase-space visualization"], ["GPU density", "WebGL2 phase-density accumulation and fallback"], ["Validation", "determinism, convergence, replay, stress checks"], ["QA layer", "generalized N-link engine and scientific audit"], ["Stable Control", "safe defaults, accuracy/performance modes, recovery, search, help"], ["Exports", "CSV, JSON, PNG, Poincaré, reports, manifest"], ["Replay", "scrubbing and reproducible state hashing"], ["Audio", "optional sonification"], ["Worker runtime", "worker/SAB path where supported"]];
  const staticCoverage={"original_ids_missing_in_stable_static_compare": 0, "aplus_ids_missing_in_stable_static_compare": 0, "original_functions_missing_in_stable_static_compare": 0, "aplus_functions_missing_in_stable_static_compare": 0, "original_class_const_let_var_missing_in_stable_static_compare": 0, "aplus_class_const_let_var_missing_in_stable_static_compare": 0};
  const css=`
    .fig-badge{position:fixed;right:12px;bottom:12px;z-index:1200;background:rgba(11,14,21,.94);border:1px solid var(--border,#1a2030);border-radius:10px;padding:8px 10px;font:10px/1.35 'IBM Plex Mono',ui-monospace,monospace;color:var(--text,#8b97ad);box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:320px}
    .fig-badge b{color:var(--cyan,#00d4ff);font-weight:500}
    .fig-badge.good{border-color:var(--green,#34e88a)} .fig-badge.warn{border-color:var(--orange,#ff7a30)} .fig-badge.bad{border-color:var(--red,#ff4565)}
    .fig-actions{display:flex;gap:5px;margin-top:6px;flex-wrap:wrap} .fig-actions button{font-size:9px;padding:3px 7px}
    .fig-panel{position:fixed;inset:6vh 5vw;z-index:1300;background:rgba(6,8,12,.98);border:1px solid var(--cyan,#00d4ff);border-radius:8px;padding:14px;overflow:auto;box-shadow:0 20px 80px rgba(0,0,0,.6);font:11px/1.55 'IBM Plex Mono',ui-monospace,monospace;color:var(--fg,#d4dfee)}
    .fig-panel h2{font-size:13px;color:var(--cyan,#00d4ff);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px} .fig-panel h3{font-size:11px;color:var(--text,#8b97ad);margin:12px 0 5px}
    .fig-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px} .fig-card{border:1px solid var(--border,#1a2030);background:var(--panel,#0b0e15);border-radius:6px;padding:8px}
    .fig-ok{color:var(--green,#34e88a)} .fig-warn{color:var(--orange,#ff7a30)} .fig-bad{color:var(--red,#ff4565)} .fig-muted{color:var(--muted,#4a5568)}
    .fig-list{max-height:180px;overflow:auto;white-space:pre-wrap;background:#05070a;border:1px solid var(--border,#1a2030);border-radius:4px;padding:6px}
  `;
  let lastReport=null;
  function addStyle(){if(document.getElementById('figStyle'))return;const s=document.createElement('style');s.id='figStyle';s.textContent=css;document.head.appendChild(s);}
  function typeOfSymbol(name){
    const registry={CONSTS,IDX_DOUBLE,Log,EventBus,makePRNG,hashState,CircularBuffer,NaNGuard,CanvasMgr,Physics,App,UI,WorkerMgr,MachineGradeScientificPatch,ResearchGradeEngineLayer,UltimateEnterpriseEngine,APlusEngineLayer,StableIntuitiveLayer,ResearchHonestyLayer,Validation,fullReset,physicsTick,switchTab,startFrameLoop,dlText};
    return Object.prototype.hasOwnProperty.call(registry,name)?typeof registry[name]:'undefined';
  }
  function collect(){
    const missingDom=requiredDomIds.filter(id=>!document.getElementById(id));
    const missingSymbols=requiredSymbols.filter(name=>{const t=typeOfSymbol(name);return t==='undefined'||t==='error';});
    const tabs=Array.from(document.querySelectorAll('.tab')).map(t=>t.dataset.tab||t.textContent.trim()).filter(Boolean);
    const buttons=Array.from(document.querySelectorAll('button')).map(b=>b.id||b.textContent.trim()).filter(Boolean);
    const caps={
      sab:typeof SharedArrayBuffer!=='undefined',worker:typeof Worker!=='undefined',webgl2:(()=>{try{return !!document.createElement('canvas').getContext('webgl2');}catch(_){return false;}})(),
      audio:typeof AudioContext!=='undefined'||typeof webkitAudioContext!=='undefined',mediaRecorder:typeof MediaRecorder!=='undefined'
    };
    const ok=missingDom.length===0&&missingSymbols.length===0;
    return lastReport={version:VERSION,generatedAt:new Date().toISOString(),ok,missingDom,missingSymbols,tabs,buttonsCount:buttons.length,capabilities:caps,featureInventory,staticCoverage};
  }
  function renderBadge(){
    const r=collect();let el=document.getElementById('figBadge');
    if(!el){el=document.createElement('div');el.id='figBadge';el.className='fig-badge';document.body.appendChild(el);}
    el.className='fig-badge '+(r.ok?'good':(r.missingDom.length+r.missingSymbols.length<4?'warn':'bad'));
    el.innerHTML=`<b>Integrity</b> ${r.ok?'<span class="fig-ok">PASS</span>':'<span class="fig-bad">CHECK</span>'}<br><span class="fig-muted">DOM missing=${r.missingDom.length} · API missing=${r.missingSymbols.length}</span><div class="fig-actions"><button id="figOpen">Details</button><button id="figExport">Audit JSON</button><button id="figHide">Hide</button></div>`;
    document.getElementById('figOpen')?.addEventListener('click',showPanel);
    document.getElementById('figExport')?.addEventListener('click',exportReport);
    document.getElementById('figHide')?.addEventListener('click',()=>{el.style.display='none';});
  }
  function showPanel(){
    const r=collect();removePanel();const p=document.createElement('div');p.id='figPanel';p.className='fig-panel';
    const featureHtml=r.featureInventory.map(f=>`<div class="fig-card"><b>${f[0]}</b><br><span class="fig-muted">${f[1]}</span></div>`).join('');
    p.innerHTML=`<button style="float:right" id="figClose">Close</button><h2>Feature Integrity Audit</h2><div class="fig-grid"><div class="fig-card"><b>Overall</b><br>${r.ok?'<span class="fig-ok">PASS — original / / stable UI surfaces intact</span>':'<span class="fig-bad">Possible missing items</span>'}</div><div class="fig-card"><b>Runtime capabilities</b><br>SAB=${r.capabilities.sab} · Worker=${r.capabilities.worker} · WebGL2=${r.capabilities.webgl2} · Audio=${r.capabilities.audio}</div><div class="fig-card"><b>Tabs</b><br>${r.tabs.join(', ')}</div><div class="fig-card"><b>Static compare</b><br>Original / declarations missing: 0<br>Original / ids missing: 0</div></div><h3>Feature inventory</h3><div class="fig-grid">${featureHtml}</div><h3>Missing DOM ids</h3><div class="fig-list">${r.missingDom.length?r.missingDom.join('\n'):'none'}</div><h3>Missing critical API symbols</h3><div class="fig-list">${r.missingSymbols.length?r.missingSymbols.join('\n'):'none'}</div>`;
    document.body.appendChild(p);document.getElementById('figClose')?.addEventListener('click',removePanel);
  }
  function removePanel(){const p=document.getElementById('figPanel');if(p)p.remove();}
  function exportReport(){
    const r=collect();
    const blob=new Blob([JSON.stringify(r,null,2)],{type:'application/json'});const u=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=u;a.download='pendulum_feature_integrity_report.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1200);
  }
  function install(){addStyle();setTimeout(renderBadge,400);setTimeout(renderBadge,1400);window.PendulumFeatureIntegrity=Object.freeze({version:VERSION,collect,showPanel,exportReport});}
  return Object.freeze({version:VERSION,install,collect,showPanel,exportReport});
})();
try{FeatureIntegrityGuard.install();}catch(e){console.error('[FeatureIntegrityGuard] install failed',e);}
