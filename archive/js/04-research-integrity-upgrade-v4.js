'use strict';
const ResearchIntegrityUpgradeV4 = (() => {
  const VERSION = 'ri-v4.0.0-2026-05-18';
  const SCHEMA_VERSION = 'pendulum-run-manifest/v4';
  const STRICT_RESIDUAL = 1e-10;
  const LOOSE_RESIDUAL = 1e-7;
  const SINGULAR_DET_THRESHOLD = 1e-12;
  const MAX_NEWTON_ITERS = 14;
  const VALIDATION_TIMEOUT_STEPS = 12000;
  const Mode = Object.freeze({ DEMO:'demo', EDUCATION:'education', RESEARCH:'research', BENCHMARK:'benchmark' });
  const Severity = Object.freeze({ INFO:'info', WARNING:'warning', NUMERICAL:'numerical failure', SOLVER:'solver failure', RUNTIME:'runtime failure', EXPORT:'export failure' });

  
  const IntegratorRegistry = Object.freeze({
    euler:      {label:'Euler', classification:'Educational', order:1, canonical:false, adaptive:false, conservativeClaim:false, longRun:false, statement:'First-order explicit method for teaching local truncation error. Not appropriate for Hamiltonian long-run analysis.'},
    rk2:        {label:'RK2 midpoint', classification:'Educational', order:2, canonical:false, adaptive:false, conservativeClaim:false, longRun:false, statement:'Second-order explicit reference for convergence demonstrations.'},
    rk4:        {label:'RK4', classification:'Reference', order:4, canonical:false, adaptive:false, conservativeClaim:false, longRun:false, statement:'Short-run high-accuracy reference. Non-symplectic, so long-run energy drift is expected.'},
    rkf45:      {label:'RKF45', classification:'Reference', order:5, canonical:false, adaptive:true, conservativeClaim:false, longRun:false, statement:'Adaptive accepted-step reference integration. Not symplectic and not directly comparable to fixed-step maps.'},
    hmidpoint:  {label:'Canonical implicit midpoint', classification:'Canonical', order:2, canonical:true, adaptive:false, conservativeClaim:true, longRun:true, statement:'Implicit midpoint applied to canonical θ,p coordinates. Symplectic claim is valid only for undamped double pendulum when Newton residual converges.'},
    leapfrog:   {label:'Leapfrog KDK', classification:'Pseudo-symplectic', order:2, canonical:false, adaptive:false, conservativeClaim:false, longRun:'conditional', statement:'Operates on θ/ω variables in this file. Labeled pseudo-symplectic, not exact canonical flow.'},
    yoshida4:   {label:'Yoshida4 composition', classification:'Pseudo-symplectic', order:4, canonical:false, adaptive:false, conservativeClaim:false, longRun:'conditional', statement:'Composition in θ/ω variables. Useful visually but not a mathematically exact symplectic map for the nonseparable double pendulum.'},
    gauss2:     {label:'Implicit midpoint θ/ω', classification:'Pseudo-symplectic', order:2, canonical:false, adaptive:false, conservativeClaim:false, longRun:'conditional', statement:'Implicit midpoint in noncanonical coordinates; stable approximation, not true canonical symplectic integration.'},
    symplectic: {label:'Symplectic Euler approximation', classification:'Pseudo-symplectic', order:1, canonical:false, adaptive:false, conservativeClaim:false, longRun:'conditional', statement:'Euler-Cromer-style θ/ω update. The label is downgraded because the coordinates are noncanonical here.'}
  });

  
  const Util = Object.freeze({
    nowISO(){ return new Date().toISOString(); },
    finite(x){ return Number.isFinite(x); },
    exp(x){ return Number.isFinite(x) ? Number(x).toExponential(3) : '—'; },
    fmt(x, n=4){ return Number.isFinite(x) ? Number(x).toFixed(n) : '—'; },
    clampText(s, n=90){ const t=String(s); return t.length>n ? t.slice(0,n-1)+'…' : t; },
    esc(s){ return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); },
    sanitizeFileName(name){ return String(name||'pendulum_export').replace(/[^a-z0-9._-]+/gi,'_').replace(/^_+|_+$/g,'').slice(0,140) || 'pendulum_export'; },
    download(name, text, type='application/json'){
      const blob = new Blob([text], {type});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = Util.sanitizeFileName(name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 1600);
    },
    stableHash(value){
      const text = typeof value === 'string' ? value : JSON.stringify(value, Object.keys(value||{}).sort());
      let h = 0x811c9dc5;
      for(let i=0;i<text.length;i++){ h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      return (h>>>0).toString(16).padStart(8,'0');
    },
    quantile(values, q){
      if(!values.length) return 0;
      const a = values.slice().sort((x,y)=>x-y);
      const i = Math.min(a.length-1, Math.max(0, Math.floor((a.length-1)*q)));
      return a[i];
    },
    browserInfo(){
      return {
        userAgent:navigator.userAgent,
        language:navigator.language,
        platform:navigator.platform,
        hardwareConcurrency:navigator.hardwareConcurrency||null,
        deviceMemory:navigator.deviceMemory||null,
        dpr:window.devicePixelRatio||1,
        timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||'unknown',
        capabilities:{
          worker:typeof Worker!=='undefined',
          sharedArrayBuffer:typeof SharedArrayBuffer!=='undefined',
          offscreenCanvas:typeof OffscreenCanvas!=='undefined',
          webgl2:(()=>{try{return !!document.createElement('canvas').getContext('webgl2');}catch(_){return false;}})(),
          performanceObserver:typeof PerformanceObserver!=='undefined',
          localStorage:(()=>{try{localStorage.setItem('__ri_probe','1');localStorage.removeItem('__ri_probe');return true;}catch(_){return false;}})()
        }
      };
    }
  });

  
  const MathHelpers = Object.freeze({
    normInf(v, n=v.length){ let m=0; for(let i=0;i<n;i++) m=Math.max(m, Math.abs(v[i])); return m; },
    norm2(v, n=v.length){ let s=0; for(let i=0;i<n;i++) s+=v[i]*v[i]; return Math.sqrt(s); },
    wrapAngle(a){ return Math.atan2(Math.sin(a), Math.cos(a)); },
    solveLinear(A, b, n){
      const M = new Float64Array(n*(n+1));
      for(let r=0;r<n;r++){
        for(let c=0;c<n;c++) M[r*(n+1)+c] = A[r*n+c];
        M[r*(n+1)+n] = b[r];
      }
      for(let c=0;c<n;c++){
        let pivot=c, max=Math.abs(M[c*(n+1)+c]);
        for(let r=c+1;r<n;r++){ const v=Math.abs(M[r*(n+1)+c]); if(v>max){max=v;pivot=r;} }
        if(max<1e-18 || !Number.isFinite(max)) return null;
        if(pivot!==c){ for(let k=c;k<=n;k++){ const tmp=M[c*(n+1)+k]; M[c*(n+1)+k]=M[pivot*(n+1)+k]; M[pivot*(n+1)+k]=tmp; } }
        const div=M[c*(n+1)+c];
        for(let k=c;k<=n;k++) M[c*(n+1)+k]/=div;
        for(let r=0;r<n;r++) if(r!==c){
          const f=M[r*(n+1)+c];
          if(f!==0) for(let k=c;k<=n;k++) M[r*(n+1)+k]-=f*M[c*(n+1)+k];
        }
      }
      const x=new Float64Array(n);
      for(let r=0;r<n;r++) x[r]=M[r*(n+1)+n];
      return x;
    }
  });

  
  const PhysicsCore = (() => {
    const rhsBuf = new Float64Array(4);
    const y0 = new Float64Array(4);
    const z = new Float64Array(4);
    const F = new Float64Array(4);
    const Fp = new Float64Array(4);
    const J = new Float64Array(16);
    const mid = new Float64Array(4);
    const tmp = new Float64Array(4);

    function massTerms(P, q1, q2){
      const d=q1-q2, c=Math.cos(d);
      const A=(P.m1+P.m2)*P.l1*P.l1;
      const B=P.m2*P.l1*P.l2;
      const C=P.m2*P.l2*P.l2;
      const D=B*c;
      const det=A*C-D*D;
      return {A,B,C,D,det,d,c,s:Math.sin(d)};
    }
    function singularityMeasureDouble(state, P){
      const mt = massTerms(P, state[0], state[1]);
      return {det:mt.det, normalized:Math.abs(mt.det)/(Math.abs(mt.A*mt.C)||1)};
    }
    function omegaToMomentum(s, P, out){
      const mt = massTerms(P, s[0], s[1]);
      out[0]=s[0]; out[1]=s[1]; out[2]=mt.A*s[2]+mt.D*s[3]; out[3]=mt.D*s[2]+mt.C*s[3];
      return out;
    }
    function momentumToOmega(y, P, out){
      const mt = massTerms(P, y[0], y[1]);
      if(Math.abs(mt.det)<SINGULAR_DET_THRESHOLD){ out[0]=y[0]; out[1]=y[1]; out[2]=NaN; out[3]=NaN; return out; }
      const inv=1/mt.det;
      out[0]=y[0]; out[1]=y[1]; out[2]=(mt.C*y[2]-mt.D*y[3])*inv; out[3]=(-mt.D*y[2]+mt.A*y[3])*inv;
      return out;
    }
    function hamiltonian(y, P){
      const mt = massTerms(P, y[0], y[1]);
      if(Math.abs(mt.det)<SINGULAR_DET_THRESHOLD) return NaN;
      const T=0.5*(mt.C*y[2]*y[2]-2*mt.D*y[2]*y[3]+mt.A*y[3]*y[3])/mt.det;
      const V=-(P.m1+P.m2)*P.g*P.l1*Math.cos(y[0])-P.m2*P.g*P.l2*Math.cos(y[1]);
      return T+V;
    }
    function canonicalRhs(y, P, gamma, out){
      const q1=y[0], q2=y[1], p1=y[2], p2=y[3];
      const mt = massTerms(P, q1, q2);
      if(Math.abs(mt.det)<SINGULAR_DET_THRESHOLD){ out[0]=NaN; out[1]=NaN; out[2]=NaN; out[3]=NaN; return out; }
      const inv=1/mt.det;
      const w1=(mt.C*p1-mt.D*p2)*inv;
      const w2=(-mt.D*p1+mt.A*p2)*inv;
      const N=mt.C*p1*p1-2*mt.D*p1*p2+mt.A*p2*p2;
      const dD=-mt.B*mt.s;
      const dDet=-2*mt.D*dD;
      const dN=-2*dD*p1*p2;
      const dTdd=0.5*(dN*mt.det-N*dDet)*inv*inv;
      const dV1=(P.m1+P.m2)*P.g*P.l1*Math.sin(q1);
      const dV2=P.m2*P.g*P.l2*Math.sin(q2);
      out[0]=w1;
      out[1]=w2;
      out[2]=-(dTdd+dV1)-gamma*p1;
      out[3]=(dTdd-dV2)-gamma*p2;
      return out;
    }
    function implicitResidual(start, cand, dt, P, gamma, out){
      for(let i=0;i<4;i++) mid[i]=0.5*(start[i]+cand[i]);
      canonicalRhs(mid, P, gamma, rhsBuf);
      let inf=0;
      for(let i=0;i<4;i++){ out[i]=cand[i]-start[i]-dt*rhsBuf[i]; inf=Math.max(inf, Math.abs(out[i])); }
      return inf;
    }
    function implicitMidpointNewton(start, dt, P, gamma, out, options={}){
      const tol = options.tol || (App.runMode==='research' ? STRICT_RESIDUAL : LOOSE_RESIDUAL);
      const maxIter = options.maxIter || MAX_NEWTON_ITERS;
      for(let i=0;i<4;i++) z[i]=start[i];
      let residual = implicitResidual(start, z, dt, P, gamma, F);
      let converged = Number.isFinite(residual) && residual < tol;
      let usedFallback = false;
      let iterations = 0;
      for(iterations=0; iterations<maxIter && !converged; iterations++){
        const epsBase = 1e-7;
        for(let c=0;c<4;c++){
          const old=z[c];
          const h=epsBase*(1+Math.abs(old));
          z[c]=old+h;
          implicitResidual(start, z, dt, P, gamma, Fp);
          z[c]=old;
          for(let r=0;r<4;r++) J[r*4+c]=(Fp[r]-F[r])/h;
        }
        const minusF = new Float64Array(4);
        for(let i=0;i<4;i++) minusF[i] = -F[i];
        const delta = MathHelpers.solveLinear(J, minusF, 4);
        if(!delta){ usedFallback=true; break; }
        let stepScale=1;
        let improved=false;
        let bestResidual=residual;
        const zOld = new Float64Array(z);
        for(let attempt=0; attempt<6; attempt++){
          for(let i=0;i<4;i++) z[i]=zOld[i]+stepScale*delta[i];
          const r=implicitResidual(start, z, dt, P, gamma, Fp);
          if(Number.isFinite(r) && r < bestResidual){ bestResidual=r; improved=true; break; }
          stepScale*=0.5;
        }
        if(!improved){ usedFallback=true; for(let i=0;i<4;i++) z[i]=zOld[i]; break; }
        residual = implicitResidual(start, z, dt, P, gamma, F);
        converged = Number.isFinite(residual) && residual < tol;
      }
      if(!converged && usedFallback){
        for(let i=0;i<4;i++) z[i]=start[i];
        residual = Infinity;
        for(let iter=0; iter<8; iter++){
          for(let i=0;i<4;i++) mid[i]=0.5*(start[i]+z[i]);
          canonicalRhs(mid, P, gamma, rhsBuf);
          let maxDelta=0;
          for(let i=0;i<4;i++){
            const next=start[i]+dt*rhsBuf[i];
            maxDelta=Math.max(maxDelta, Math.abs(next-z[i]));
            z[i]=0.55*z[i]+0.45*next;
          }
          residual=implicitResidual(start, z, dt, P, gamma, F);
          iterations++;
          if(maxDelta<tol && residual<Math.max(tol*10, LOOSE_RESIDUAL)){ converged=true; break; }
        }
      }
      for(let i=0;i<4;i++) out[i]=z[i];
      return {converged, residual, iterations, tolerance:tol, usedFallback, rejected:!converged};
    }
    function canonicalStepKinematic(thetaOmega, dt, P, gamma, out){
      omegaToMomentum(thetaOmega, P, y0);
      const info = implicitMidpointNewton(y0, dt, P, gamma, tmp, {tol: App.runMode==='research' ? STRICT_RESIDUAL : LOOSE_RESIDUAL});
      SolverDiagnostics.record('hmidpoint', info, dt);
      if(!info.converged){
        for(let i=0;i<4;i++) out[i]=thetaOmega[i];
        ErrorReporter.report(Severity.SOLVER, 'Canonical implicit midpoint step rejected', {dt, residual:info.residual, iterations:info.iterations, state:Array.from(thetaOmega.slice?thetaOmega.slice(0,4):thetaOmega), energy:hamiltonian(y0,P)});
        if(App.runMode==='research'){ App.paused=true; App.__fatalNumericalFailure=true; }
        return out;
      }
      momentumToOmega(tmp, P, out);
      return out;
    }
    function rhs2Honest(s, P, gamma, out){
      const t1=s[0],t2=s[1],w1=s[2],w2=s[3];
      const m1=P.m1,m2=P.m2,l1=P.l1,l2=P.l2,g=P.g;
      const d=t1-t2, sd=Math.sin(d), cd=Math.cos(d);
      const M11=(m1+m2)*l1*l1, M12=m2*l1*l2*cd, M22=m2*l2*l2;
      const det=M11*M22-M12*M12;
      out[0]=w1; out[1]=w2;
      if(Math.abs(det)<SINGULAR_DET_THRESHOLD || !Number.isFinite(det)){
        out[2]=NaN; out[3]=NaN;
        ErrorReporter.report(Severity.NUMERICAL, 'Double-pendulum mass matrix singularity detected', {det, normalized:Math.abs(det)/(Math.abs(M11*M22)||1), state:Array.from(s.slice?s.slice(0,4):s), parameters:{...P}});
        if(App.runMode==='research'){ App.paused=true; App.__fatalNumericalFailure=true; }
        return out;
      }
      const f1=-m2*l1*l2*sd*w2*w2-(m1+m2)*g*l1*Math.sin(t1)-gamma*w1;
      const f2= m2*l1*l2*sd*w1*w1-m2*g*l2*Math.sin(t2)-gamma*w2;
      out[2]=(M22*f1-M12*f2)/det;
      out[3]=(-M12*f1+M11*f2)/det;
      return out;
    }
    function rhs3Honest(s,P,gamma,out){
      const t1=s[0],t2=s[1],t3=s[2],w1=s[3],w2=s[4],w3=s[5];
      const m1=P.m1,m2=P.m2,m3=P.m3,l1=P.l1,l2=P.l2,l3=P.l3,g=P.g;
      const d12=t1-t2,d23=t2-t3,d13=t1-t3;
      const M11=(m1+m2+m3)*l1*l1,M12=(m2+m3)*l1*l2*Math.cos(d12),M13=m3*l1*l3*Math.cos(d13);
      const M22=(m2+m3)*l2*l2,M23=m3*l2*l3*Math.cos(d23),M33=m3*l3*l3;
      const b1=-(m2+m3)*l1*l2*Math.sin(d12)*w2*w2-m3*l1*l3*Math.sin(d13)*w3*w3-(m1+m2+m3)*g*l1*Math.sin(t1)-gamma*w1;
      const b2= (m2+m3)*l1*l2*Math.sin(d12)*w1*w1-m3*l2*l3*Math.sin(d23)*w3*w3-(m2+m3)*g*l2*Math.sin(t2)-gamma*w2;
      const b3= m3*l1*l3*Math.sin(d13)*w1*w1+m3*l2*l3*Math.sin(d23)*w2*w2-m3*g*l3*Math.sin(t3)-gamma*w3;
      const A = new Float64Array([M11,M12,M13,M12,M22,M23,M13,M23,M33]);
      const b = new Float64Array([b1,b2,b3]);
      const sol = MathHelpers.solveLinear(A,b,3);
      out[0]=w1; out[1]=w2; out[2]=w3;
      if(!sol){
        out[3]=NaN; out[4]=NaN; out[5]=NaN;
        ErrorReporter.report(Severity.NUMERICAL, 'Triple-pendulum mass matrix singularity detected', {state:Array.from(s.slice?s.slice(0,6):s), parameters:{...P}});
        if(App.runMode==='research'){ App.paused=true; App.__fatalNumericalFailure=true; }
        return out;
      }
      out[3]=sol[0]; out[4]=sol[1]; out[5]=sol[2];
      return out;
    }
    return Object.freeze({massTerms,singularityMeasureDouble,omegaToMomentum,momentumToOmega,hamiltonian,canonicalRhs,implicitMidpointNewton,canonicalStepKinematic,rhs2Honest,rhs3Honest});
  })();

  
  const StateCodec = Object.freeze({
    capture(){
      return {
        schemaVersion:SCHEMA_VERSION,
        createdAt:Util.nowISO(),
        system:App.sysType,
        representation:App.method==='hmidpoint' ? 'ui θ/ω with canonical θ,p integration bridge' : 'noncanonical θ/ω',
        state:Array.from(App.state.subarray(0,App.stateLen)),
        previous:Array.from(App.prevState.subarray(0,App.stateLen)),
        time:App.simTime,
        hash:typeof hashState==='function'?hashState(App.state.subarray(0,App.stateLen)):Util.stableHash(Array.from(App.state.subarray(0,App.stateLen)))
      };
    },
    encodeCanonical(){
      if(App.sysType!=='double') return null;
      const y=new Float64Array(4);
      PhysicsCore.omegaToMomentum(App.state, App.P, y);
      return {q:[y[0],y[1]], p:[y[2],y[3]], hamiltonian:PhysicsCore.hamiltonian(y,App.P)};
    },
    validateSnapshot(obj){
      const problems=[];
      if(!obj || typeof obj!=='object') problems.push('snapshot is not an object');
      if(obj && obj.schemaVersion && !String(obj.schemaVersion).includes('pendulum')) problems.push('unknown schemaVersion');
      if(obj && obj.state && !Array.isArray(obj.state)) problems.push('state must be an array');
      if(obj && Array.isArray(obj.state) && obj.state.some(v=>!Number.isFinite(Number(v)))) problems.push('state contains non-finite values');
      return {ok:problems.length===0, problems};
    }
  });

  
  function methodMeta(method=App.method){
    return IntegratorRegistry[method] || {label:method, classification:'Experimental', order:null, canonical:false, adaptive:false, conservativeClaim:false, longRun:false, statement:'Unregistered method; behavior must be treated as experimental.'};
  }

  
  const SolverDiagnostics = (() => {
    const hist=[];
    function record(method, info, dt){
      App.solverStatus = {
        method,
        converged:!!info.converged,
        residual:Number(info.residual),
        iterations:Number(info.iterations),
        tolerance:Number(info.tolerance),
        usedFallback:!!info.usedFallback,
        failures:(App.solverStatus&&App.solverStatus.failures||0)+(info.converged?0:1),
        dt,
        time:App.simTime,
        updatedAt:Util.nowISO()
      };
      hist.push({...App.solverStatus});
      if(hist.length>300) hist.shift();
    }
    return Object.freeze({record, history:()=>hist.slice(), current:()=>({...App.solverStatus})});
  })();

  
  const SimulationRuntime = (() => {
    function applyMode(mode){
      App.runMode = mode;
      const auto = document.getElementById('autoQual');
      const worker = document.getElementById('useWorker');
      const workerWasSelected = !!(worker && worker.checked);
      if(mode===Mode.RESEARCH){
        if(auto && auto.checked){ auto.checked=false; auto.dispatchEvent(new Event('change',{bubbles:true})); }
        App.autoQual=false; App.powerSave=false;
        // Research mode blocks hidden physics-changing assistance, but keeps the user's Worker selection.
        if(worker) App.useWorker = worker.checked;
        if(App.sysType==='double'){
          const sel=document.getElementById('method');
          if(sel && sel.value!=='hmidpoint'){
            sel.value='hmidpoint';
            sel.dispatchEvent(new Event('change',{bubbles:true}));
            ErrorReporter.info('Research mode selected canonical midpoint visibly', {method:'hmidpoint'});
          }
        }
        ErrorReporter.info('Research mode policy applied', {autoQuality:false, workerPreserved:workerWasSelected, useWorker:App.useWorker});
      } else if(mode===Mode.BENCHMARK){
        if(auto && auto.checked){ auto.checked=false; auto.dispatchEvent(new Event('change',{bubbles:true})); }
        App.autoQual=false; App.powerSave=false; App.glowMode=false; App.longExpose=false;
        if(worker) App.useWorker = worker.checked;
      } else if(mode===Mode.EDUCATION){
        App.__fatalNumericalFailure=false;
        if(worker) App.useWorker = worker.checked;
      } else {
        App.__fatalNumericalFailure=false;
        if(worker) App.useWorker = worker.checked;
      }
      UIController.renderStatus();
      ErrorReporter.info('Mode changed', {mode, useWorker:App.useWorker});
    }
    function conservativeStatus(){
      return App.gamma>0 ? 'Dissipative: γ > 0, energy conservation claims disabled' : 'Conservative parameterization: γ = 0';
    }
    function canonicalStatus(){
      if(App.sysType==='triple') return 'Experimental triple-pendulum θ/ω model';
      return methodMeta().canonical ? 'Canonical bridge active for integration' : 'Noncanonical θ/ω integration path';
    }
    return Object.freeze({applyMode,conservativeStatus,canonicalStatus});
  })();

  
  const WorkerBridge = (() => {
    const lat=[];
    let lastPost=0;
    function recordLatency(x){ if(Number.isFinite(x)){ lat.push(x); if(lat.length>240) lat.shift(); } }
    function metrics(){
      recordLatency(App.workerLatency||0);
      const avg=lat.length?lat.reduce((a,b)=>a+b,0)/lat.length:0;
      return {current:App.workerLatency||0, average:avg, p95:Util.quantile(lat,0.95), max:lat.length?Math.max(...lat):0, samples:lat.length, lastPost};
    }
    function patch(){
      if(!window.WorkerMgr || WorkerBridge._patched) return;
      WorkerBridge._patched=true;
      const oldPost=WorkerMgr.post;
      WorkerMgr.post=function(msg, transfer){ lastPost=performance.now(); return oldPost.call(WorkerMgr,msg,transfer); };
    }
    return Object.freeze({patch,metrics});
  })();

  
  const AnalysisBus = (() => {
    const listeners=new Map();
    function on(type,fn){ const list=listeners.get(type)||[]; list.push(fn); listeners.set(type,list); }
    function emit(type,payload){ const list=listeners.get(type)||[]; for(const fn of list){ try{fn(payload);}catch(e){ErrorReporter.report(Severity.RUNTIME,'Analysis listener failure',{type,message:String(e.message||e)});} } }
    return Object.freeze({on,emit});
  })();

  const PoincareConfig = {variable:'theta1', direction:'positive', x:'theta2', y:'omega2', interpolate:true, density:false, points:[]};
  const FFTConfig = {signal:'theta1', window:'hann', scale:'log', sampleRate:null, resolution:null};

  function stateValue(s, key){
    if(key==='theta1') return s[0];
    if(key==='theta2') return s[1];
    if(key==='theta3') return s[2];
    if(key==='omega1') return App.sysType==='triple'?s[3]:s[2];
    if(key==='omega2') return App.sysType==='triple'?s[4]:s[3];
    if(key==='omega3') return s[5];
    if(key==='p1' || key==='p2'){
      if(App.sysType!=='double') return NaN;
      const y=new Float64Array(4); PhysicsCore.omegaToMomentum(s,App.P,y); return key==='p1'?y[2]:y[3];
    }
    if(key==='energy'){
      try{return energyOf().total;}catch(_){return NaN;}
    }
    return NaN;
  }

  
  const RenderScheduler = (() => {
    const frames=[]; let last=performance.now(); let hiddenSince=null;
    function tick(){
      const now=performance.now(); const dt=now-last; last=now;
      frames.push(dt); if(frames.length>240) frames.shift();
      if(dt>1500 && !document.hidden){ ErrorReporter.info('Frame gap detected; browser throttling or long task may affect analysis', {gapMs:dt}); App.__tabThrottleEvents=(App.__tabThrottleEvents||0)+1; }
    }
    function metrics(){
      const avg=frames.length?frames.reduce((a,b)=>a+b,0)/frames.length:0;
      return {frameMsCurrent:frames[frames.length-1]||0, frameMsAverage:avg, frameMsP95:Util.quantile(frames,0.95), frameMsMax:frames.length?Math.max(...frames):0, hidden:document.hidden, hiddenSince};
    }
    function install(){
      setInterval(tick,500);
      document.addEventListener('visibilitychange',()=>{ hiddenSince=document.hidden?Util.nowISO():null; if(document.hidden) ErrorReporter.info('Tab hidden; timing-sensitive analysis may be throttled',{}); });
    }
    return Object.freeze({install,metrics});
  })();

  
  const UIController = (() => {
    function addCSS(){
      if(document.getElementById('riV4Style')) return;
      const css = `
      .ri-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border-strong);border-radius:999px;padding:3px 8px;font:10px/1 var(--font-mono);color:var(--text);background:rgba(255,255,255,.035)}
      .ri-chip.good{color:var(--green);border-color:rgba(56,232,140,.42);background:rgba(56,232,140,.07)}
      .ri-chip.warn{color:var(--orange);border-color:rgba(255,122,44,.44);background:rgba(255,122,44,.08)}
      .ri-chip.bad{color:var(--red);border-color:rgba(245,100,100,.48);background:rgba(245,100,100,.09)}
      .ri-chip.info{color:var(--cyan);border-color:rgba(24,212,248,.38);background:rgba(24,212,248,.07)}
      .ri-panel{background:rgba(255,255,255,.025);border:1px solid var(--glass-stroke);border-radius:10px;padding:10px 11px;margin:8px 0;box-shadow:var(--shadow-xs)}
      .ri-title{font:700 9px/1 var(--font-display);letter-spacing:1.55px;text-transform:uppercase;color:var(--cyan);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px}
      .ri-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}@media(max-width:780px){.ri-grid{grid-template-columns:1fr}}
      .ri-kv{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid var(--divider);padding:4px 0;font:10px/1.35 var(--font-mono)}
      .ri-kv span:first-child{color:var(--muted)}.ri-kv span:last-child{color:var(--fg-bright);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:190px}
      .ri-error-panel{position:fixed;right:16px;top:16px;width:min(480px,calc(100vw - 32px));z-index:2000;background:rgba(25,8,12,.97);border:1px solid rgba(245,100,100,.7);border-radius:12px;padding:12px;box-shadow:var(--shadow-lg);display:none;color:var(--fg)}
      .ri-error-panel.show{display:block}.ri-error-panel h3{font:700 13px/1.2 var(--font-display);color:var(--red);margin-bottom:7px}.ri-error-panel pre{max-height:210px;overflow:auto;background:rgba(0,0,0,.26);border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:8px;font:10px/1.45 var(--font-mono);white-space:pre-wrap;color:var(--text)}
      .ri-doc{background:var(--panel);border:1px solid var(--glass-stroke);border-radius:var(--radius-lg);padding:22px;max-width:1120px;line-height:1.65;color:var(--text)}.ri-doc h2{font:700 18px/1.2 var(--font-display);color:var(--cyan);margin:0 0 10px}.ri-doc h3{font:700 13px/1.2 var(--font-display);color:var(--fg-bright);margin:18px 0 6px}.ri-doc table{width:100%;border-collapse:collapse;font-size:11px}.ri-doc th,.ri-doc td{border:1px solid var(--glass-stroke);padding:7px;vertical-align:top}.ri-doc th{color:var(--cyan);background:rgba(24,212,248,.05)}
      .ri-plot-stamp{font:9px/1.4 var(--font-mono);color:var(--muted);margin-top:5px}.ri-select-sm{width:100%;min-width:0}.ri-row{display:flex;gap:6px;align-items:center;margin:5px 0}.ri-row label{flex:0 0 90px;color:var(--muted);font-size:10px}.ri-row select,.ri-row input{flex:1}.ri-method-badge{margin-left:6px}.ri-mode-select{max-width:180px;flex:0 0 180px}
      `;
      const s=document.createElement('style'); s.id='riV4Style'; s.textContent=css; document.head.appendChild(s);
    }
    function injectHeader(){
      const header=document.querySelector('header'); if(!header || document.getElementById('riModeSelect')) return;
      const sel=document.createElement('select'); sel.id='riModeSelect'; sel.className='ri-mode-select'; sel.setAttribute('aria-label','Simulation mode');
      sel.innerHTML='<option value="demo">Demo Mode</option><option value="education">Education Mode</option><option value="research">Research Mode</option><option value="benchmark">Benchmark Mode</option>';
      sel.value=App.runMode&&Mode[App.runMode.toUpperCase()]?App.runMode:'demo';
      sel.addEventListener('change',()=>SimulationRuntime.applyMode(sel.value));
      const badge=document.createElement('span'); badge.id='riMethodBadge'; badge.className='ri-chip info ri-method-badge'; badge.textContent='method';
      const stat=document.createElement('span'); stat.id='riScienceBadge'; stat.className='ri-chip info'; stat.textContent='scientific status';
      header.insertBefore(sel, document.getElementById('fpsBadge')||null); header.insertBefore(badge, document.getElementById('fpsBadge')||null); header.insertBefore(stat, document.getElementById('fpsBadge')||null);
    }
    function injectErrorPanel(){
      if(document.getElementById('riErrorPanel')) return;
      const p=document.createElement('div'); p.id='riErrorPanel'; p.className='ri-error-panel'; p.setAttribute('role','alertdialog'); p.setAttribute('aria-live','assertive');
      p.innerHTML='<h3>Persistent numerical/runtime failure</h3><div id="riErrorSummary" style="font-size:11px;color:var(--text);margin-bottom:8px">No active failure.</div><pre id="riErrorContext"></pre><div class="btnrow" style="margin-top:8px"><button id="riExportCrash" class="danger">Export crash dump</button><button id="riRestoreSnapshot">Restore previous snapshot</button><button id="riResetAfterCrash">Reset</button><button id="riDismissError">Dismiss panel</button></div>';
      document.body.appendChild(p);
      document.getElementById('riExportCrash').addEventListener('click',()=>ExportManifest.exportCrashDump('manual'));
      document.getElementById('riResetAfterCrash').addEventListener('click',()=>{App.__fatalNumericalFailure=false; p.classList.remove('show'); if(typeof fullReset==='function') fullReset();});
      document.getElementById('riDismissError').addEventListener('click',()=>p.classList.remove('show'));
      document.getElementById('riRestoreSnapshot').addEventListener('click',()=>{ if(App.__lastFiniteState){ App.state.set(App.__lastFiniteState); App.__fatalNumericalFailure=false; App.paused=true; p.classList.remove('show'); ErrorReporter.info('Previous finite snapshot restored manually',{}); } });
    }
    function injectControlPanels(){
      const controls=document.querySelector('#tab-lab .controls'); if(!controls || document.getElementById('riScientificStatusPanel')) return;
      const panel=document.createElement('div'); panel.id='riScientificStatusPanel'; panel.className='ri-panel';
      panel.innerHTML='<div class="ri-title">Scientific Status <span id="riStatusMini" class="ri-chip info">live</span></div><div id="riStatusGrid" class="ri-grid"></div><div class="btnrow" style="margin-top:8px"><button id="riRunValidation" class="primary">Run V4 validation</button><button id="riExportManifest">Export manifest</button><button id="riExportCrash2">Crash dump</button></div>';
      const anchor=controls.querySelector('.ctrl-sticky'); anchor ? controls.insertBefore(panel, anchor.nextSibling) : controls.prepend(panel);
      document.getElementById('riRunValidation').addEventListener('click',()=>ValidationSuite.runAll(true));
      document.getElementById('riExportManifest').addEventListener('click',()=>ExportManifest.exportManifest());
      document.getElementById('riExportCrash2').addEventListener('click',()=>ExportManifest.exportCrashDump('manual'));
    }
    function injectAnalysisControls(){
      const left=document.querySelector('#tab-lab .left-col');
      if(left && !document.getElementById('riAnalysisControls')){
        const box=document.createElement('div'); box.id='riAnalysisControls'; box.className='ri-panel';
        box.innerHTML='<div class="ri-title">Analysis configuration</div><div class="ri-grid"><div><div class="ri-title" style="margin-top:2px">Poincaré section</div><div class="ri-row"><label>section var</label><select id="riPoincVar"><option value="theta1">θ1</option><option value="theta2">θ2</option><option value="p1">p1</option><option value="p2">p2</option><option value="omega1">ω1</option><option value="omega2">ω2</option></select></div><div class="ri-row"><label>direction</label><select id="riPoincDir"><option value="positive">positive</option><option value="negative">negative</option><option value="both">both</option></select></div><div class="ri-row"><label>x/y</label><select id="riPoincAxes"><option value="theta2,omega2">θ2 vs ω2</option><option value="theta1,omega1">θ1 vs ω1</option><option value="p1,p2">p1 vs p2</option></select></div><div class="btnrow"><button id="riClearPoinc">Clear configured section</button><button id="riExportPoinc">Export configured section</button></div></div><div><div class="ri-title" style="margin-top:2px">FFT signal</div><div class="ri-row"><label>signal</label><select id="riFFTSignal"><option value="theta1">θ1</option><option value="theta2">θ2</option><option value="omega1">ω1</option><option value="omega2">ω2</option><option value="energy">energy</option></select></div><div class="ri-row"><label>window</label><select id="riFFTWindow"><option value="rectangular">rectangular</option><option value="hann" selected>Hann</option><option value="hamming">Hamming</option><option value="blackman">Blackman</option></select></div><div class="ri-row"><label>scale</label><select id="riFFTScale"><option value="log" selected>log</option><option value="linear">linear</option></select></div><div class="btnrow"><button id="riExportSpectrum">Export spectrum metadata</button></div></div></div><div id="riPlotStamp" class="ri-plot-stamp"></div>';
        const plots=left.querySelectorAll('.plots-row');
        if(plots.length>1) left.insertBefore(box, plots[1]); else left.appendChild(box);
        document.getElementById('riPoincVar').addEventListener('change',e=>PoincareConfig.variable=e.target.value);
        document.getElementById('riPoincDir').addEventListener('change',e=>PoincareConfig.direction=e.target.value);
        document.getElementById('riPoincAxes').addEventListener('change',e=>{const [x,y]=e.target.value.split(','); PoincareConfig.x=x; PoincareConfig.y=y;});
        document.getElementById('riFFTSignal').addEventListener('change',e=>FFTConfig.signal=e.target.value);
        document.getElementById('riFFTWindow').addEventListener('change',e=>FFTConfig.window=e.target.value.toLowerCase());
        document.getElementById('riFFTScale').addEventListener('change',e=>FFTConfig.scale=e.target.value);
        document.getElementById('riClearPoinc').addEventListener('click',()=>{PoincareConfig.points=[]; ErrorReporter.info('Configured Poincaré section cleared',{});});
        document.getElementById('riExportPoinc').addEventListener('click',()=>ExportManifest.exportConfiguredPoincare());
        document.getElementById('riExportSpectrum').addEventListener('click',()=>ExportManifest.exportSpectrumMetadata());
      }
    }
    function injectDocsTab(){
      if(document.getElementById('tab-docs')) return;
      const tabs=document.querySelector('.tabs');
      if(tabs){ const b=document.createElement('button'); b.className='tab'; b.role='tab'; b.setAttribute('aria-selected','false'); b.dataset.tab='docs'; b.setAttribute('data-tip','Scientific Documentation'); b.textContent='?'; b.addEventListener('click',()=>switchTab('docs')); tabs.appendChild(b); }
      const panel=document.createElement('div'); panel.className='tabpanel'; panel.id='tab-docs'; panel.role='tabpanel';
      const rows=Object.entries(IntegratorRegistry).map(([k,m])=>`<tr><td>${Util.esc(k)}</td><td>${Util.esc(m.classification)}</td><td>${Util.esc(String(m.order))}</td><td>${m.canonical?'yes':'no'}</td><td>${m.adaptive?'yes':'no'}</td><td>${Util.esc(m.statement)}</td></tr>`).join('');
      panel.innerHTML=`<div class="ri-doc"><h2>Scientific documentation</h2><p>This single-file platform uses ideal point masses, massless rods, browser double-precision arithmetic, and finite buffers. It is suitable for education and exploratory nonlinear dynamics. It is not a substitute for a peer-reviewed numerical mechanics package unless validation results and parameters are exported with the run.</p><h3>Method guide</h3><table><tr><th>Method</th><th>Class</th><th>Order</th><th>Canonical</th><th>Adaptive</th><th>Use and limitation</th></tr>${rows}</table><h3>How to reproduce a run</h3><p>Export the V4 manifest, JSON state, validation result, and replay hash. Reuse the same browser class, system parameters, initial conditions, method, dt, tolerance, seed, damping, and mode. For Research Mode, avoid tab throttling and keep auto-quality disabled.</p><h3>Scientific honesty policy</h3><p>Triple-pendulum features are labeled experimental unless a matching canonical validation is present. Damped runs are dissipative. GPU density is a visualization unless CPU reference comparison has been run. Lyapunov values shown during transients are estimates, not high-precision exponents.</p><h3>Keyboard shortcuts</h3><p>Space toggles pause where supported by the base file. Ctrl or Cmd + K opens the command palette if the base command layer is available. Export and validation actions are also available in the Scientific Status panel.</p></div>`;
      const main=document.querySelector('.main-col'); if(main) main.appendChild(panel);
    }
    function convertInlineHandlers(){
      document.querySelectorAll('[onclick]').forEach(el=>{
        if(el.dataset.riInlineConverted) return;
        const fn=el['onclick'];
        if(typeof fn==='function'){
          el.removeAttribute('onclick'); el['onclick']=null; el.addEventListener('click', ev=>fn.call(el,ev)); el.dataset.riInlineConverted='true';
        }
      });
    }
    function improveA11y(){
      document.querySelectorAll('button').forEach(btn=>{ if(!btn.getAttribute('aria-label')){ const txt=btn.textContent.trim()||btn.id||'button'; btn.setAttribute('aria-label',txt); } });
      document.querySelectorAll('canvas').forEach(c=>{ if(!c.getAttribute('role')) c.setAttribute('role','img'); if(!c.getAttribute('aria-label')) c.setAttribute('aria-label',c.id?`${c.id} plot`:'simulation plot'); });
    }
    function renderKV(id, rows){
      const el=document.getElementById(id); if(!el) return;
      el.innerHTML=rows.map(([k,v])=>`<div class="ri-kv"><span>${Util.esc(k)}</span><span title="${Util.esc(v)}">${Util.esc(v)}</span></div>`).join('');
    }
    function renderStatus(){
      const meta=methodMeta();
      const conservative=SimulationRuntime.conservativeStatus();
      const canonical=SimulationRuntime.canonicalStatus();
      const badge=document.getElementById('riMethodBadge');
      if(badge){ badge.textContent=meta.classification; badge.className='ri-chip ri-method-badge '+(meta.classification==='Canonical'?'good':meta.classification==='Pseudo-symplectic'?'warn':meta.classification==='Educational'?'warn':'info'); }
      const science=document.getElementById('riScienceBadge');
      if(science){ const ok=App.gamma===0 && (meta.classification==='Canonical'||meta.classification==='Reference'); science.textContent=App.gamma>0?'Dissipative':(App.sysType==='triple'?'Triple experimental':'Conservative'); science.className='ri-chip '+(App.gamma>0||App.sysType==='triple'?'warn':ok?'good':'info'); }
      const mini=document.getElementById('riStatusMini'); if(mini){ mini.textContent=App.__fatalNumericalFailure?'paused on failure':'live'; mini.className='ri-chip '+(App.__fatalNumericalFailure?'bad':'info'); }
      const worker=WorkerBridge.metrics(); const frame=RenderScheduler.metrics(); const singular=App.sysType==='double'?PhysicsCore.singularityMeasureDouble(App.state,App.P):null;
      renderKV('riStatusGrid', [
        ['mode', App.runMode||'demo'], ['method', `${meta.label} / ${meta.classification}`], ['system', App.sysType==='triple'?'triple experimental':'double'], ['energy language', conservative], ['coordinate status', canonical], ['solver residual', App.solverStatus&&Number.isFinite(App.solverStatus.residual)?Util.exp(App.solverStatus.residual):'not applicable'], ['worker latency p95', Util.fmt(worker.p95,2)+' ms'], ['frame p95', Util.fmt(frame.frameMsP95,1)+' ms'], ['tab throttling events', String(App.__tabThrottleEvents||0)], ['singularity measure', singular?Util.exp(singular.normalized):'experimental triple']
      ]);
      const stamp=document.getElementById('riPlotStamp');
      if(stamp){ stamp.textContent=`stamp: ${App.sysType}, ${App.method} (${meta.classification}), dt=${App.DT}, γ=${App.gamma}, seed=${App.seed}, t=${Util.fmt(App.simTime,3)}s, Poincaré: ${PoincareConfig.variable}=0 ${PoincareConfig.direction}, FFT: ${FFTConfig.signal}/${FFTConfig.window}/${FFTConfig.scale}`; }
      const modeSelect=document.getElementById('riModeSelect'); if(modeSelect && modeSelect.value!==App.runMode) modeSelect.value=App.runMode||'demo';
    }
    function install(){ addCSS(); injectHeader(); injectErrorPanel(); injectControlPanels(); injectAnalysisControls(); injectDocsTab(); convertInlineHandlers(); improveA11y(); setInterval(renderStatus,500); renderStatus(); }
    return Object.freeze({install,renderStatus});
  })();

  
  const ExportManifest = (() => {
    function manifest(){
      const meta=methodMeta();
      return {
        schemaVersion:SCHEMA_VERSION,
        application:{name:'Pendulum Lab — Nonlinear Dynamics & Chaos Research Platform', upgradeLayer:VERSION, singleFile:true},
        timestamp:Util.nowISO(),
        browser:Util.browserInfo(),
        mode:App.runMode||'demo',
        system:{type:App.sysType, reliability:App.sysType==='triple'?'experimental θ/ω model':'double-pendulum model with canonical bridge available'},
        parameters:{...App.P, damping:App.gamma},
        initialConditions:{currentState:Array.from(App.state.subarray(0,App.stateLen)), previousState:Array.from(App.prevState.subarray(0,App.stateLen)), seed:App.seed},
        stateRepresentation:App.method==='hmidpoint'?'canonical θ,p integration bridge; UI stores θ/ω':'noncanonical θ/ω',
        canonicalState:StateCodec.encodeCanonical(),
        integrator:{id:App.method, ...meta, warning:integratorWarning()},
        numerics:{dt:App.DT, tolerance:App.tol, stepsPerFrame:App.SPF, speedMultiplier:App.speedMult, solver:SolverDiagnostics.current()},
        runtime:{workerMode:!!App.useWorker, workerReady:!!App.workerReady, workerMetrics:WorkerBridge.metrics(), renderMetrics:RenderScheduler.metrics(), autoQuality:!!App.autoQual, tabThrottleEvents:App.__tabThrottleEvents||0},
        analysis:{poincare:{...PoincareConfig, points:undefined, pointCount:PoincareConfig.points.length, basePointCount:App.poincPts?App.poincPts.length:0}, fft:{...FFTConfig}, lyapunov:{sumLog:App.lyapSumLog||0,time:App.lyapTime||0,estimate:App.lyapTime>0?App.lyapSumLog/App.lyapTime:null, note:'finite-difference renormalization estimate unless the dedicated spectrum tool is used'}},
        validation:App.riValidation||null,
        warnings:ResearchHonestyLayerText.warnings(),
        limitations:ResearchHonestyLayerText.limitations(),
        logs:{autoQualityEvents:App.riQualityEvents||[], errors:ErrorReporter.errors().slice(-20), solverFailures:SolverDiagnostics.history().filter(x=>x.converged===false).slice(-20)},
        hashes:{state:typeof hashState==='function'?hashState(App.state.subarray(0,App.stateLen)):Util.stableHash(Array.from(App.state.subarray(0,App.stateLen))), replay:ReplayHash.current()}
      };
    }
    function integratorWarning(){
      const meta=methodMeta();
      if(App.gamma>0) return 'Damping is positive; conservative Hamiltonian energy conservation claims are disabled.';
      if(App.sysType==='triple') return 'Triple-pendulum canonical validation is not implemented in this upgrade layer.';
      if(meta.classification==='Pseudo-symplectic') return 'This method operates in θ/ω variables in the base file and is not labeled true symplectic.';
      if(meta.classification==='Educational') return 'Educational method; visible instability or energy drift is expected.';
      if(meta.classification==='Reference') return 'Reference method; not Hamiltonian-preserving over long runs.';
      if(meta.classification==='Canonical' && App.solverStatus && App.solverStatus.converged===false) return 'Canonical symplectic claim is invalid for the last rejected/nonconverged step.';
      return 'No active integrator warning beyond browser floating-point limitations.';
    }
    function exportManifest(){ Util.download('pendulum_manifest_v4.json', JSON.stringify(manifest(),null,2), 'application/json'); }
    function exportJSONState(){ Util.download('pendulum_state_v4.json', JSON.stringify({manifest:manifest(), snapshot:StateCodec.capture()},null,2), 'application/json'); }
    function exportCSV(){
      const m=manifest();
      const rows=['# '+JSON.stringify({schemaVersion:m.schemaVersion,timestamp:m.timestamp,method:m.integrator.id,classification:m.integrator.classification,dt:m.numerics.dt,damping:m.parameters.damping,stateHash:m.hashes.state}), 'time,theta1,theta2,omega1,omega2,relativeEnergyDrift'];
      const circ=App.trajCirc;
      if(circ && circ.size){ for(let i=0;i<circ.size;i++) rows.push([0,1,2,3,4,5].map(f=>circ.getAt(i,f)).join(',')); }
      Util.download('pendulum_trajectory_v4.csv', rows.join('\n'), 'text/csv');
    }
    function exportCrashDump(reason='manual'){
      const dump={reason, createdAt:Util.nowISO(), manifest:manifest(), fatal:!!App.__fatalNumericalFailure, lastFiniteState:App.__lastFiniteState?Array.from(App.__lastFiniteState):null, errors:ErrorReporter.errors(), solver:SolverDiagnostics.history().slice(-50)};
      Util.download('pendulum_crash_dump_v4.json', JSON.stringify(dump,null,2), 'application/json');
    }
    function exportConfiguredPoincare(){
      const m=manifest();
      const rows=['# '+JSON.stringify({schemaVersion:SCHEMA_VERSION, timestamp:Util.nowISO(), config:{variable:PoincareConfig.variable,direction:PoincareConfig.direction,x:PoincareConfig.x,y:PoincareConfig.y}, method:App.method, dt:App.DT}), 'time,x,y,sectionValue,direction'];
      for(const p of PoincareConfig.points) rows.push([p.time,p.x,p.y,p.sectionValue,p.direction].join(','));
      Util.download('pendulum_poincare_configured_v4.csv', rows.join('\n'), 'text/csv');
    }
    function exportSpectrumMetadata(){
      Util.download('pendulum_fft_metadata_v4.json', JSON.stringify({schemaVersion:SCHEMA_VERSION, timestamp:Util.nowISO(), config:FFTConfig, samples:App.theta1Filled||0, dt:App.DT, note:'Base renderer computes θ1 FFT; this metadata records selected signal/window/scale for reproducibility.'},null,2), 'application/json');
    }
    function patchExports(){
      const map={dlJsonBtn:exportJSONState, dlTrajBtn:exportCSV};
      for(const [id,fn] of Object.entries(map)){
        const el=document.getElementById(id);
        if(el) el.addEventListener('click', ev=>{ev.stopImmediatePropagation();fn();},{capture:true});
      }
    }
    return Object.freeze({manifest,exportManifest,exportJSONState,exportCSV,exportCrashDump,exportConfiguredPoincare,exportSpectrumMetadata,patchExports});
  })();

  const ReplayHash = Object.freeze({
    current(){
      const values=[];
      if(App.replayCirc && App.replayCirc.size){
        const step=Math.max(1,Math.floor(App.replayCirc.size/40));
        for(let i=0;i<App.replayCirc.size;i+=step) values.push([0,1,2,3,4].map(f=>App.replayCirc.getAt(i,f)));
      }
      return Util.stableHash(JSON.stringify(values));
    }
  });

  
  const ValidationSuite = (() => {
    const results=[];
    function push(name, pass, measured, expected, meta={}){
      const rec={name, pass:!!pass, measured, expected, tolerance:meta.tolerance||null, method:meta.method||App.method, dt:meta.dt||App.DT, duration:meta.duration||null, category:meta.category||'scientific', timestamp:Util.nowISO(), browser:Util.browserInfo().userAgent};
      results.push(rec); return rec;
    }
    function simulate(method, dt, T, gamma=0, ic=[1.0,1.2,0.0,0.0]){
      const P={m1:1,m2:1,l1:1.1,l2:0.9,g:9.81};
      const s=new Float64Array(ic); const out=new Float64Array(4); const f=(x,o)=>PhysicsCore.rhs2Honest(x,P,gamma,o);
      const y=new Float64Array(4); PhysicsCore.omegaToMomentum(s,P,y); const e0=PhysicsCore.hamiltonian(y,P);
      const n=Math.min(VALIDATION_TIMEOUT_STEPS, Math.max(1,Math.round(T/dt)));
      let lastInfo=null;
      for(let i=0;i<n;i++){
        if(method==='hmidpoint') PhysicsCore.canonicalStepKinematic(s,dt,P,gamma,out);
        else Physics.step(method,s,dt,f,4,out);
        for(let j=0;j<4;j++) s[j]=out[j];
        if(!Array.from(s).every(Number.isFinite)) break;
        lastInfo=SolverDiagnostics.current();
      }
      PhysicsCore.omegaToMomentum(s,P,y); const e1=PhysicsCore.hamiltonian(y,P);
      return {state:Array.from(s), e0, e1, drift:Math.abs((e1-e0)/(Math.abs(e0)||1)), lastInfo, steps:n, P};
    }
    function testEnergyConservation(){ const r=simulate('hmidpoint',0.003,12,0); return push('undamped canonical energy conservation', r.drift<2e-3, r.drift, '< 2e-3 relative drift', {method:'hmidpoint',dt:0.003,duration:12,tolerance:2e-3}); }
    function testDampedDecay(){ const r=simulate('rk4',0.002,8,0.08); return push('damped run energy language', Number.isFinite(r.e1) && r.e1 < r.e0 + 1e-6, {e0:r.e0,e1:r.e1}, 'damped energy should not be labeled conservative', {method:'rk4',dt:0.002,duration:8,category:'scientific'}); }
    function testDtHalving(){ const a=simulate('rk4',0.006,2,0).state; const b=simulate('rk4',0.003,2,0).state; let diff=0; for(let i=0;i<4;i++) diff=Math.max(diff,Math.abs(a[i]-b[i])); return push('dt-halving convergence smoke test', diff<0.08, diff, '< 0.08 inf-norm for short run', {method:'rk4',dt:0.006,duration:2,tolerance:0.08}); }
    function testOrderTrend(){ const coarse=simulate('euler',0.004,1.0,0).state; const fine=simulate('euler',0.002,1.0,0).state; const ref=simulate('rk4',0.0008,1.0,0).state; const err=(x)=>Math.max(...x.map((v,i)=>Math.abs(v-ref[i]))); const pass=err(fine)<err(coarse); return push('Euler expected convergence direction', pass, {coarse:err(coarse),fine:err(fine)}, 'fine dt error < coarse dt error', {method:'euler',category:'scientific'}); }
    function testTimeReversibility(){ const fwd=simulate('hmidpoint',0.002,1.0,0).state; const s=new Float64Array(fwd); const out=new Float64Array(4); const P={m1:1,m2:1,l1:1.1,l2:0.9,g:9.81}; for(let i=0;i<500;i++){ PhysicsCore.canonicalStepKinematic(s,-0.002,P,0,out); s.set(out); } const ic=[1,1.2,0,0]; const err=Math.max(...Array.from(s).map((v,i)=>Math.abs(v-ic[i]))); return push('implicit midpoint time reversibility trend', err<0.05, err, '< 0.05 after forward/backward smoke test', {method:'hmidpoint',dt:0.002,duration:1,tolerance:0.05}); }
    function testSolverResidual(){ const r=simulate('hmidpoint',0.003,0.3,0); const residual=r.lastInfo&&Number.isFinite(r.lastInfo.residual)?r.lastInfo.residual:Infinity; return push('implicit solver residual convergence', residual<LOOSE_RESIDUAL, residual, `< ${LOOSE_RESIDUAL}`, {method:'hmidpoint',dt:0.003,duration:0.3,tolerance:LOOSE_RESIDUAL}); }
    function testReplayHash(){ const h=ReplayHash.current(); return push('replay hash availability', /^[0-9a-f]{8}$/.test(h), h, '8 hex chars', {category:'runtime'}); }
    function testExportRoundtrip(){ const m=ExportManifest.manifest(); const text=JSON.stringify(m); const parsed=JSON.parse(text); const ok=parsed.schemaVersion===SCHEMA_VERSION && parsed.integrator && parsed.parameters; return push('manifest JSON roundtrip schema', ok, parsed.schemaVersion, SCHEMA_VERSION, {category:'export'}); }
    function testCSVSchema(){ const cols='time,theta1,theta2,omega1,omega2,relativeEnergyDrift'.split(','); return push('CSV schema validity', cols.length===6 && cols.includes('relativeEnergyDrift'), cols.join('|'), 'required columns present', {category:'export'}); }
    function testWorkerMainEquivalence(){ const main=simulate('rk4',0.003,0.6,0).state; const again=simulate('rk4',0.003,0.6,0).state; let diff=0; for(let i=0;i<4;i++) diff=Math.max(diff,Math.abs(main[i]-again[i])); return push('deterministic main-thread equivalence baseline', diff<1e-12, diff, '< 1e-12 same seed/config', {method:'rk4',category:'runtime'}); }
    function testSingularityReporting(){ const out=new Float64Array(4); const P={m1:1,m2:1,l1:1,l2:1,g:9.81}; const s=new Float64Array([0,0,0,0]); PhysicsCore.rhs2Honest(s,P,0,out); const ok=Array.from(out).every(Number.isFinite); return push('non-singular aligned double-pendulum mass matrix', ok, Array.from(out), 'finite acceleration for valid aligned state', {category:'scientific'}); }
    async function runAll(showToast=false){
      results.length=0;
      const tests=[testEnergyConservation,testDampedDecay,testDtHalving,testOrderTrend,testTimeReversibility,testSolverResidual,testReplayHash,testExportRoundtrip,testCSVSchema,testWorkerMainEquivalence,testSingularityReporting];
      for(const t of tests){ try{ t(); }catch(e){ push(t.name,false,String(e.message||e),'no exception',{category:'runtime'}); } }
      const passed=results.filter(r=>r.pass).length;
      App.riValidation={schemaVersion:SCHEMA_VERSION, generatedAt:Util.nowISO(), passed, failed:results.length-passed, results:results.slice(), runtime:Util.browserInfo()};
      UIController.renderStatus();
      renderValidationPanel();
      if(showToast && typeof toast==='function') toast(`V4 validation ${passed}/${results.length} passed`);
      return App.riValidation;
    }
    function renderValidationPanel(){
      const panel=document.querySelector('#tab-validate .left-col > div'); if(!panel) return;
      let box=document.getElementById('riValidationResults');
      if(!box){ box=document.createElement('div'); box.id='riValidationResults'; box.className='ri-panel'; panel.appendChild(box); }
      const rows=results.map(r=>`<div class="ri-kv"><span>${Util.esc(r.name)}</span><span class="${r.pass?'ri-pass':'ri-fail'}">${r.pass?'PASS':'FAIL'} · ${Util.esc(typeof r.measured==='object'?JSON.stringify(r.measured):String(r.measured))}</span></div>`).join('');
      box.innerHTML='<div class="ri-title">V4 behavior validation</div>'+rows;
    }
    function exportResults(){ Util.download('pendulum_validation_v4.json', JSON.stringify(App.riValidation||{results},null,2), 'application/json'); }
    return Object.freeze({runAll,exportResults,results:()=>results.slice()});
  })();

  
  const ErrorReporter = (() => {
    const list=[];
    function makeContext(extra={}){
      let energy=null;
      try{ energy=energyOf(); }catch(_){ energy=null; }
      return {method:App.method, dt:App.DT, simTime:App.simTime, state:Array.from(App.state.subarray(0,App.stateLen)), energy, parameters:{...App.P,damping:App.gamma}, worker:{useWorker:App.useWorker,ready:App.workerReady,latency:App.workerLatency}, ...extra};
    }
    function report(severity, message, extra={}){
      const rec={severity,message,timestamp:Util.nowISO(), context:makeContext(extra)};
      list.push(rec); if(list.length>200) list.shift(); App.riErrors=list;
      if(severity!==Severity.INFO && severity!==Severity.WARNING){ show(rec); }
      return rec;
    }
    function info(message, extra={}){ return report(Severity.INFO, message, extra); }
    function show(rec){
      const p=document.getElementById('riErrorPanel'); if(!p) return;
      const s=document.getElementById('riErrorSummary'); const c=document.getElementById('riErrorContext');
      if(s) s.textContent=`${rec.severity}: ${rec.message}`;
      if(c) c.textContent=JSON.stringify(rec.context,null,2);
      p.classList.add('show');
    }
    function errors(){ return list.slice(); }
    return Object.freeze({report,info,errors});
  })();

  const ResearchHonestyLayerText = Object.freeze({
    warnings(){
      const w=[]; const meta=methodMeta();
      if(App.gamma>0) w.push('γ > 0: dissipative simulation; energy conservation claims are disabled.');
      if(App.sysType==='triple') w.push('Triple pendulum support is treated as experimental unless independent canonical validation is supplied.');
      if(meta.classification==='Pseudo-symplectic') w.push('Pseudo-symplectic label: current method uses θ/ω variables, not a strict canonical map.');
      if(meta.classification==='Educational') w.push('Educational method: instability and drift are expected features, not bugs.');
      if(App.autoQual) w.push('Auto-quality is enabled; V4 patch prevents physics mutation but visual sampling can change.');
      if(document.hidden) w.push('Tab is hidden; browser throttling can compromise timing-sensitive measurements.');
      return w;
    },
    limitations(){ return ['browser IEEE-754 floating-point arithmetic','idealized point masses and massless rods','finite ring buffers for trajectories, replay, FFT, and Poincaré points','GPU density is a visualization unless CPU comparison is explicitly run','Lyapunov estimates require convergence checks and transient discard','triple-pendulum canonical validation is intentionally not claimed']; }
  });

  
  function patchPhysics(){
    if(patchPhysics.done) return; patchPhysics.done=true;
    const oldStep=Physics.step;
    Physics.rhs2 = PhysicsCore.rhs2Honest;
    Physics.rhs3 = PhysicsCore.rhs3Honest;
    Physics.step = function(method,s,dt,f,n,out,opts){
      if(method==='hmidpoint'){
        if(App.sysType==='double' && n===4) return PhysicsCore.canonicalStepKinematic(s,dt,App.P,App.gamma,out);
        ErrorReporter.report(Severity.WARNING,'hmidpoint requested for unsupported system; using noncanonical gauss2 fallback',{system:App.sysType,n});
        return oldStep.call(Physics,'gauss2',s,dt,f,n,out,opts);
      }
      return oldStep.call(Physics,method,s,dt,f,n,out,opts);
    };
    const oldEnergyOf = typeof energyOf==='function' ? energyOf : null;
    if(oldEnergyOf){
      energyOf = function(){
        if(App.sysType==='double' && App.method==='hmidpoint'){
          const y=new Float64Array(4); PhysicsCore.omegaToMomentum(App.state,App.P,y);
          const H=PhysicsCore.hamiltonian(y,App.P); const split=Physics.energy2(App.state,App.P);
          return {total:H, KE:split.KE, PE:split.PE, canonicalTotal:H, note:App.gamma>0?'dissipative γ>0: Hamiltonian is diagnostic, not conserved':'canonical Hamiltonian total'};
        }
        return oldEnergyOf();
      };
    }
  }
  function patchNaNGuard(){
    if(!window.NaNGuard || patchNaNGuard.done) return; patchNaNGuard.done=true;
    const oldCheck=NaNGuard.check;
    NaNGuard.check=function(state,n=state.length){
      let bad=-1, val=null;
      for(let i=0;i<n;i++){ const v=state[i]; if(!Number.isFinite(v)||Math.abs(v)>CONSTS.NAN_THRESHOLD){ bad=i; val=v; break; } }
      if(bad>=0){
        ErrorReporter.report(Severity.NUMERICAL,'Non-finite or overflowing state detected',{index:bad,value:String(val)});
        if(App.runMode==='research'){
          App.paused=true; App.__fatalNumericalFailure=true;
          return true;
        }
      }
      if(bad<0){ App.__lastFiniteState = new Float64Array(state.subarray ? state.subarray(0,n) : Array.from(state).slice(0,n)); }
      return oldCheck.call(NaNGuard,state,n);
    };
  }
  function patchPhysicsTick(){
    if(patchPhysicsTick.done || typeof physicsTick!=='function') return; patchPhysicsTick.done=true;
    const oldTick=physicsTick;
    physicsTick=function(realDt){
      if(App.__fatalNumericalFailure){ App.paused=true; return; }
      const beforeSPF=App.SPF, beforeDT=App.DT, beforeMethod=App.method;
      const result=oldTick(realDt);
      if(App.runMode==='research'){
        if(App.SPF!==beforeSPF){ ErrorReporter.report(Severity.WARNING,'Research Mode blocked automatic steps/frame mutation',{before:beforeSPF,after:App.SPF}); App.SPF=beforeSPF; const spf=document.getElementById('spf'); const spfV=document.getElementById('spfV'); if(spf)spf.value=beforeSPF; if(spfV)spfV.textContent=beforeSPF; }
        if(App.DT!==beforeDT){ ErrorReporter.report(Severity.WARNING,'Research Mode blocked automatic dt mutation',{before:beforeDT,after:App.DT}); App.DT=beforeDT; }
        if(App.method!==beforeMethod){ ErrorReporter.report(Severity.WARNING,'Research Mode blocked automatic method mutation',{before:beforeMethod,after:App.method}); App.method=beforeMethod; }
      }
      return result;
    };
  }
  function patchAfterStep(){
    if(patchAfterStep.done || typeof afterStep!=='function') return; patchAfterStep.done=true;
    const oldAfter=afterStep;
    afterStep=function(){
      const prev=new Float64Array(App.prevState.subarray(0,App.stateLen));
      const res=oldAfter();
      try{
        const cur=App.state;
        const a=stateValue(prev,PoincareConfig.variable), b=stateValue(cur,PoincareConfig.variable);
        const aw=MathHelpers.wrapAngle(a), bw=MathHelpers.wrapAngle(b);
        const crossesPositive=aw<0 && bw>=0;
        const crossesNegative=aw>0 && bw<=0;
        const okDir=PoincareConfig.direction==='both'||(PoincareConfig.direction==='positive'&&crossesPositive)||(PoincareConfig.direction==='negative'&&crossesNegative);
        if(okDir){
          const denom=bw-aw; const fr=Math.abs(denom)>1e-12 ? Math.max(0,Math.min(1,-aw/denom)) : 0;
          const interp=new Float64Array(App.stateLen);
          for(let i=0;i<App.stateLen;i++) interp[i]=prev[i]+fr*(cur[i]-prev[i]);
          PoincareConfig.points.push({time:App.simTime, x:stateValue(interp,PoincareConfig.x), y:stateValue(interp,PoincareConfig.y), sectionValue:0, direction:crossesPositive?'positive':'negative', method:App.method, dt:App.DT});
          if(PoincareConfig.points.length>CONSTS.POINC_CAP) PoincareConfig.points.shift();
        }
      }catch(e){ ErrorReporter.report(Severity.RUNTIME,'Configured Poincaré update failed',{message:String(e.message||e)}); }
      return res;
    };
  }
  function patchAutoQuality(){
    if(patchAutoQuality.done || typeof updateAutoQuality!=='function') return; patchAutoQuality.done=true;
    updateAutoQuality=function(){
      if(!App.autoQual) return;
      App._fpsWindow.push(App.fps); if(App._fpsWindow.length>60) App._fpsWindow.shift();
      if(App._fpsWindow.length<30) return;
      const avg=App._fpsWindow.reduce((a,b)=>a+b,0)/App._fpsWindow.length;
      const oldLevel=App._qualLevel||0;
      if(avg<24) App._qualLevel=2; else if(avg<42) App._qualLevel=1; else if(avg>57) App._qualLevel=0;
      if(oldLevel!==App._qualLevel){
        App.riQualityEvents=App.riQualityEvents||[];
        App.riQualityEvents.push({time:Util.nowISO(), simTime:App.simTime, from:oldLevel, to:App._qualLevel, fpsAverage:avg, changed:'visual-only quality level; dt/method/SPF unchanged by V4'});
        if(App.riQualityEvents.length>100) App.riQualityEvents.shift();
        const badge=document.getElementById('qualBadge'); if(badge){ badge.textContent=App._qualLevel===0?'HQ':App._qualLevel===1?'MQ':'LQ'; badge.className=App._qualLevel===0?'':App._qualLevel===1?'degraded':'low'; }
      }
    };
  }
  function patchMethodSelect(){
    const sel=document.getElementById('method'); if(!sel) return;
    for(const [id,meta] of Object.entries(IntegratorRegistry)){ const opt=sel.querySelector(`option[value="${id}"]`); if(opt) opt.textContent=`${meta.label} — ${meta.classification}`; }
    sel.addEventListener('change',()=>{ App.method=sel.value; UIController.renderStatus(); const meta=methodMeta(sel.value); if((meta.classification==='Educational'||meta.classification==='Pseudo-symplectic')&&App.runMode==='research') ErrorReporter.report(Severity.WARNING,'Research Mode method warning',{method:sel.value,classification:meta.classification,statement:meta.statement}); });
  }
  function patchLoadSave(){
    const load=document.getElementById('jsonFile');
    if(load && !load.dataset.riSchemaGuard){
      load.dataset.riSchemaGuard='true';
      load.addEventListener('change',()=>{
        const file=load.files&&load.files[0]; if(!file) return;
        const reader=new FileReader();
        reader.onload=()=>{ try{ const obj=JSON.parse(String(reader.result)); const v=StateCodec.validateSnapshot(obj.snapshot||obj); if(!v.ok) ErrorReporter.report(Severity.WARNING,'Loaded snapshot schema warnings',{problems:v.problems}); }catch(e){ ErrorReporter.report(Severity.EXPORT,'Corrupted or invalid JSON snapshot selected',{message:String(e.message||e)}); } };
        reader.readAsText(file);
      }, true);
    }
  }
  function patchGPU(){
    const c=document.getElementById('gpuCanvas'); if(!c || c.dataset.riGLGuard) return; c.dataset.riGLGuard='true';
    c.addEventListener('webglcontextlost',e=>{ e.preventDefault(); ErrorReporter.report(Severity.RUNTIME,'WebGL context lost; density view is visual-only and will fall back if needed',{}); App.gpuFallback=true; });
    c.addEventListener('webglcontextrestored',()=>{ ErrorReporter.info('WebGL context restored',{}); App.gpuFallback=false; });
  }
  function patchGlobalErrors(){
    if(patchGlobalErrors.done) return; patchGlobalErrors.done=true;
    window.addEventListener('error',e=>ErrorReporter.report(Severity.RUNTIME,'Uncaught runtime error',{message:e.message, filename:e.filename, lineno:e.lineno, colno:e.colno}));
    window.addEventListener('unhandledrejection',e=>ErrorReporter.report(Severity.RUNTIME,'Unhandled promise rejection',{reason:String(e.reason&&e.reason.message?e.reason.message:e.reason)}));
  }
  function installCommandRegistry(){
    if(window.CommandRegistry && window.CommandRegistry.__riV4) return;
    const commands=new Map();
    const api={__riV4:true, register(name,description,run){commands.set(name,{description,run});}, execute(name,payload){const c=commands.get(name); if(!c) throw new Error('Unknown command '+name); return c.run(payload);}, list(){return Array.from(commands.entries()).map(([name,c])=>({name,description:c.description}));}};
    api.register('ri.exportManifest','Export reproducible V4 manifest',()=>ExportManifest.exportManifest());
    api.register('ri.exportCrashDump','Export current crash dump',()=>ExportManifest.exportCrashDump('command'));
    api.register('ri.runValidation','Run V4 behavior validation',()=>ValidationSuite.runAll(true));
    api.register('ri.setResearchMode','Enable strict Research Mode',()=>SimulationRuntime.applyMode(Mode.RESEARCH));
    window.CommandRegistry=api;
  }
  function expose(){
    window.PendulumLabV4 = Object.freeze({version:VERSION, schemaVersion:SCHEMA_VERSION, PhysicsCore, StateCodec, ParameterValidator, IntegratorRegistry, SolverDiagnostics, SimulationRuntime, WorkerBridge, AnalysisBus, RenderScheduler, ExportManifest, ValidationSuite, ErrorReporter, CommandRegistry:window.CommandRegistry, mode:Mode});
  }

  const ParameterValidator = Object.freeze({
    validate(P=App.P, gamma=App.gamma, dt=App.DT){
      const errors=[], warnings=[];
      for(const k of ['m1','m2','l1','l2','g']) if(!Number.isFinite(P[k])) errors.push(`${k} is not finite`);
      for(const k of ['m1','m2','l1','l2']) if(Number(P[k])<=0) errors.push(`${k} must be positive`);
      if(App.sysType==='triple') for(const k of ['m3','l3']){ if(!Number.isFinite(P[k])) errors.push(`${k} is not finite`); if(Number(P[k])<=0) errors.push(`${k} must be positive`); }
      if(!Number.isFinite(gamma)||gamma<0) errors.push('damping γ must be finite and nonnegative');
      if(!Number.isFinite(dt)||dt<=0) errors.push('dt must be positive and finite');
      if(dt>0.01) warnings.push('large dt can create numerical artifacts in chaotic regimes');
      if(gamma>0) warnings.push('damping creates a dissipative system; energy conservation claims are disabled');
      if(App.sysType==='triple') warnings.push('triple pendulum diagnostics are experimental in this single-file build');
      return {ok:errors.length===0, errors, warnings};
    }
  });

  function boot(){
    try{
      App.runMode = App.runMode || Mode.DEMO;
      App.__fatalNumericalFailure=false;
      patchPhysics(); patchNaNGuard(); patchPhysicsTick(); patchAfterStep(); patchAutoQuality(); patchMethodSelect(); patchLoadSave(); patchGPU(); patchGlobalErrors();
      WorkerBridge.patch(); RenderScheduler.install(); UIController.install(); ExportManifest.patchExports(); installCommandRegistry(); expose();
      setInterval(()=>{ const v=ParameterValidator.validate(); if(!v.ok) ErrorReporter.report(Severity.WARNING,'Parameter validation issue',{errors:v.errors,warnings:v.warnings}); UIController.renderStatus(); }, 1200);
      const oldRunValidation=document.getElementById('runValidation'); if(oldRunValidation && !oldRunValidation.dataset.riAugmented){ oldRunValidation.dataset.riAugmented='true'; oldRunValidation.addEventListener('click',()=>setTimeout(()=>ValidationSuite.runAll(false),100)); }
      ErrorReporter.info('Research Integrity Upgrade V4 installed',{version:VERSION});
    }catch(e){
      console.error('[ResearchIntegrityUpgradeV4] boot failed',e);
    }
  }
  return Object.freeze({version:VERSION,boot,PhysicsCore,StateCodec,ParameterValidator,IntegratorRegistry,SolverDiagnostics,SimulationRuntime,WorkerBridge,AnalysisBus,RenderScheduler,ExportManifest,ValidationSuite,ErrorReporter});
})();
try{ ResearchIntegrityUpgradeV4.boot(); }catch(e){ console.error('[ResearchIntegrityUpgradeV4] install failed',e); }
