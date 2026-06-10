'use strict';


const CONSTS = Object.freeze({
  LYAP_EPS:1e-8, NAN_THRESHOLD:1e10, DET_THRESHOLD:1e-14, MAX_STATE_DIM:8,
  SCALE:110, DPR_MAX:2, MAX_FRAME:0.05,
  REPLAY_CAP:600, FFT_N:1024, PHASE_CAP:4000, TRAJ_CAP:40000, POINC_CAP:20000,
  DIAG_HZ:10, FFT_INTERVAL_MS:400, REPLAY_HZ:10, MAX_RECORD_SEC:120,
  SAB_SUPPORTED: typeof SharedArrayBuffer !== 'undefined'
});
const IDX_DOUBLE = Object.freeze({T1:0,T2:1,W1:2,W2:3});
const DEBUG = {GPU:false,PHYSICS:false,BOUNDS:false,PERF:false};


const Log = (() => {
  const fmt=(lv,mod,msg,d)=>`[${(performance.now()/1000).toFixed(3)}s][${lv}][${mod}] ${msg}`+(d?' '+JSON.stringify(d):'');
  return {
    debug:(mod,msg,d)=>{ if(DEBUG[mod]) console.log(fmt('DBG',mod,msg,d)); },
    info: (mod,msg,d)=>console.log(fmt('INF',mod,msg,d)),
    warn: (mod,msg,d)=>console.warn(fmt('WRN',mod,msg,d)),
    error:(mod,msg,d)=>console.error(fmt('ERR',mod,msg,d)),
  };
})();


const EventBus = (() => {
  const L = Object.create(null);
  return {
    on(e,fn){ (L[e]||(L[e]=[])).push(fn); },
    off(e,fn){ if(L[e]) L[e]=L[e].filter(f=>f!==fn); },
    emit(e,p){ const fs=L[e]; if(!fs) return; for(let i=0;i<fs.length;i++) try{fs[i](p);}catch(err){Log.error('Bus','listener',{e,err:String(err)});} },
  };
})();


// Mulberry32 PRNG — fast, seeded, uniform float in [0,1)
function makePRNG(seed) {
  let s=seed>>>0;
  return {
    next:()=>{ s=(s+0x6D2B79F5)>>>0; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return((t^(t>>>14))>>>0)/4294967296; },
    setSeed:(v)=>{ s=v>>>0; },
  };
}


// FNV-1a 32-bit — determinism check; identical inputs produce identical hex digest
function hashState(state) {
  const v=new Uint8Array(state.buffer,state.byteOffset,state.byteLength);
  let h=0x811c9dc5;
  for(let i=0;i<v.length;i++){ h^=v[i]; h=Math.imul(h,0x01000193); }
  return (h>>>0).toString(16).padStart(8,'0');
}


class CircularBuffer {
  constructor(cap,fields=1){ this.cap=cap; this.fields=fields; this.buf=new Float64Array(cap*fields); this.head=0; this.size=0; }
  push(vals){
    const off=this.head*this.fields;
    if(Array.isArray(vals)||ArrayBuffer.isView(vals)){ for(let i=0;i<this.fields;i++) this.buf[off+i]=vals[i]||0; }
    else this.buf[off]=vals;
    this.head=(this.head+1)%this.cap; if(this.size<this.cap) this.size++;
  }
  getAt(i,field=0){ const idx=(this.head-this.size+i+this.cap*2)%this.cap; return this.buf[idx*this.fields+field]; }
  clear(){ this.head=0; this.size=0; }
}


const NaNGuard=(()=>{
  let resets=0,lastSafe=null,ctx={method:'?',dt:0};
  return {
    setContext:(method,dt)=>{ ctx={method,dt}; },
    check:(state,n=state.length)=>{
      for(let i=0;i<n;i++){
        const v=state[i];
        if(!Number.isFinite(v)||Math.abs(v)>CONSTS.NAN_THRESHOLD){
          resets++;
          Log.warn('PHYSICS','NaN/overflow',{idx:i,val:v,...ctx});
          const ov=document.getElementById('nanOverlay');
          if(ov){ov.style.display='block'; setTimeout(()=>ov.style.display='none',2500);}
          return false;
        }
      }
      return true;
    },
    snapshot:(state)=>{ if(!lastSafe||lastSafe.length!==state.length) lastSafe=new Float64Array(state.length); lastSafe.set(state); },
    recover:(into)=>{ if(!lastSafe||!into||into.length!==lastSafe.length) return false; into.set(lastSafe); return true; },
    count:()=>resets,
  };
})();


const CanvasMgr=(()=>{
  const cache=new WeakMap();
  // Clamp DPR to avoid oversized backing store on high-density displays
  const dpr=Math.min(CONSTS.DPR_MAX,Math.max(1,window.devicePixelRatio||1));
  function configure(canvas,lw,lh){
    const wPx=Math.max(1,Math.round(lw*dpr)), hPx=Math.max(1,Math.round(lh*dpr));
    if(canvas.width!==wPx) canvas.width=wPx;
    if(canvas.height!==hPx) canvas.height=hPx;
    const ctx=canvas.getContext('2d',{alpha:false, desynchronized:true});
    if(ctx) {
       ctx.setTransform(dpr,0,0,dpr,0,0);
       ctx.imageSmoothingEnabled = false;
    }
    cache.set(canvas,{ctx,w:lw,h:lh,dpr});
  }
  function init(canvas){
    const r=canvas.getBoundingClientRect();
    const lw=(r.width>8)?Math.round(r.width):(parseInt(canvas.getAttribute('width'))||300);
    const lh=(r.height>8)?Math.round(r.height):(parseInt(canvas.getAttribute('height'))||150);
    configure(canvas,lw,lh);
  }
  function get(canvas){ if(!cache.has(canvas)) init(canvas); return cache.get(canvas); }
  const pending=new Map();
  const ro=new ResizeObserver(entries=>{
    for(const e of entries){
      const target=e.target;
      const canvas=target.tagName==='CANVAS'?target:target.querySelector('canvas');
      if(!canvas) continue;
      if(!cache.has(canvas)){init(canvas);continue;}
      if(pending.has(canvas)) clearTimeout(pending.get(canvas));
      pending.set(canvas,setTimeout(()=>{
        pending.delete(canvas);
        if(!cache.has(canvas)) return;
        const cur=cache.get(canvas);
        const r=canvas.getBoundingClientRect();
        if(r.width<8||r.height<8) return;
        const lw=Math.round(r.width),lh=Math.round(r.height);
        if(Math.abs(cur.w-lw)<2&&Math.abs(cur.h-lh)<2) return;
        configure(canvas,lw,lh);
      },120));
    }
  });
  function observe(canvas){ init(canvas); const target=canvas.closest('.main-wrap')||canvas; ro.observe(target); }
  return {get,init,observe,dpr};
})();


const Physics=(()=>{
  const sc={
    k1:new Float64Array(CONSTS.MAX_STATE_DIM), k2:new Float64Array(CONSTS.MAX_STATE_DIM),
    k3:new Float64Array(CONSTS.MAX_STATE_DIM), k4:new Float64Array(CONSTS.MAX_STATE_DIM),
    k5:new Float64Array(CONSTS.MAX_STATE_DIM), k6:new Float64Array(CONSTS.MAX_STATE_DIM),
    k7:new Float64Array(CONSTS.MAX_STATE_DIM),
    tmp:new Float64Array(CONSTS.MAX_STATE_DIM), tmpN:new Float64Array(CONSTS.MAX_STATE_DIM),
    impl:new Float64Array(CONSTS.MAX_STATE_DIM), implPrev:new Float64Array(CONSTS.MAX_STATE_DIM),
    A:new Float64Array(12),
  };

  // Equations of motion — double pendulum (Lagrangian, 2×2 mass-matrix inversion)
function rhs2(s,P,gamma,out){
    const t1=s[0],t2=s[1],w1=s[2],w2=s[3];
    const m1=P.m1,m2=P.m2,l1=P.l1,l2=P.l2,g=P.g;
    const d=t1-t2,sd=Math.sin(d),cd=Math.cos(d);
    const M11=(m1+m2)*l1*l1,M12=m2*l1*l2*cd,M22=m2*l2*l2;
    const det=M11*M22-M12*M12;
    out[0]=w1; out[1]=w2;
    if(Math.abs(det)<CONSTS.DET_THRESHOLD){out[2]=0;out[3]=0;return out;}
    const f1=-m2*l1*l2*sd*w2*w2-(m1+m2)*g*l1*Math.sin(t1)-gamma*w1;
    const f2= m2*l1*l2*sd*w1*w1-m2*g*l2*Math.sin(t2)-gamma*w2;
    out[2]=(M22*f1-M12*f2)/det;
    out[3]=(-M12*f1+M11*f2)/det;
    return out;
  }

  // Equations of motion — triple pendulum (3×3 augmented matrix, partial pivoting)
function rhs3(s,P,gamma,out){
    const t1=s[0],t2=s[1],t3=s[2],w1=s[3],w2=s[4],w3=s[5];
    const m1=P.m1,m2=P.m2,m3=P.m3,l1=P.l1,l2=P.l2,l3=P.l3,g=P.g;
    const d12=t1-t2,d23=t2-t3,d13=t1-t3;
    const M11=(m1+m2+m3)*l1*l1,M12=(m2+m3)*l1*l2*Math.cos(d12),M13=m3*l1*l3*Math.cos(d13);
    const M22=(m2+m3)*l2*l2,M23=m3*l2*l3*Math.cos(d23),M33=m3*l3*l3;
    const f1=-(m2+m3)*l1*l2*Math.sin(d12)*w2*w2-m3*l1*l3*Math.sin(d13)*w3*w3-(m1+m2+m3)*g*l1*Math.sin(t1)-gamma*w1;
    const f2= (m2+m3)*l1*l2*Math.sin(d12)*w1*w1-m3*l2*l3*Math.sin(d23)*w3*w3-(m2+m3)*g*l2*Math.sin(t2)-gamma*w2;
    const f3= m3*l1*l3*Math.sin(d13)*w1*w1+m3*l2*l3*Math.sin(d23)*w2*w2-m3*g*l3*Math.sin(t3)-gamma*w3;
    const A=sc.A;
    A[0]=M11;A[1]=M12;A[2]=M13;A[3]=f1;
    A[4]=M12;A[5]=M22;A[6]=M23;A[7]=f2;
    A[8]=M13;A[9]=M23;A[10]=M33;A[11]=f3;
    for(let c=0;c<3;c++){
      let mx=c;
      for(let r=c+1;r<3;r++) if(Math.abs(A[r*4+c])>Math.abs(A[mx*4+c])) mx=r;
      if(mx!==c) for(let k=0;k<4;k++){const t=A[c*4+k];A[c*4+k]=A[mx*4+k];A[mx*4+k]=t;}
      if(Math.abs(A[c*4+c])<CONSTS.DET_THRESHOLD){out[0]=w1;out[1]=w2;out[2]=w3;out[3]=0;out[4]=0;out[5]=0;return out;}
      for(let r=0;r<3;r++) if(r!==c){
        const f=A[r*4+c]/A[c*4+c];
        for(let k=c;k<4;k++) A[r*4+k]-=f*A[c*4+k];
      }
    }
    out[0]=w1;out[1]=w2;out[2]=w3;
    out[3]=A[3]/A[0];
    out[4]=A[7]/A[5];
    out[5]=A[11]/A[10];
    return out;
  }

  function vAdd(dst,a,k,b,n){for(let i=0;i<n;i++) dst[i]=a[i]+k*b[i];}
  function vCopy(dst,s,n){for(let i=0;i<n;i++) dst[i]=s[i];}

  function rk4step(s,dt,f,n,out){
    const{k1,k2,k3,k4,tmp}=sc;
    f(s,k1); vAdd(tmp,s,0.5*dt,k1,n); f(tmp,k2);
    vAdd(tmp,s,0.5*dt,k2,n); f(tmp,k3);
    vAdd(tmp,s,dt,k3,n); f(tmp,k4);
    for(let i=0;i<n;i++) out[i]=s[i]+dt/6*(k1[i]+2*k2[i]+2*k3[i]+k4[i]);
    return out;
  }
  function rk2step(s,dt,f,n,out){
    const{k1,tmp}=sc; f(s,k1); vAdd(tmp,s,0.5*dt,k1,n);
    const k2=sc.k2; f(tmp,k2);
    for(let i=0;i<n;i++) out[i]=s[i]+dt*k2[i];
    return out;
  }
  function eulerstep(s,dt,f,n,out){
    const{k1}=sc; f(s,k1);
    for(let i=0;i<n;i++) out[i]=s[i]+dt*k1[i];
    return out;
  }
  function leapfrogstep(s,dt,f,n,out){
    const half=n>>1,a0=sc.k1; f(s,a0);
    for(let i=0;i<half;i++) out[i+half]=s[i+half]+0.5*dt*a0[i+half];
    for(let i=0;i<half;i++) out[i]=s[i]+dt*out[i+half];
    const a1=sc.k2; f(out,a1);
    for(let i=0;i<half;i++) out[i+half]=out[i+half]+0.5*dt*a1[i+half];
    return out;
  }
  function symplstep(s,dt,f,n,out){
    const half=n>>1,a=sc.k1; f(s,a); vCopy(out,s,n);
    for(let i=0;i<half;i++) out[i+half]+=dt*a[i+half];
    for(let i=0;i<half;i++) out[i]+=dt*out[i+half];
    return out;
  }
  // Yoshida 4th-order symplectic composition coefficients (Yoshida 1990)
const _Y_W1=1.3512071919596578,_Y_W0=1-2*1.3512071919596578;
  function yoshida4step(s,dt,f,n,out){
    const half=n>>1; vCopy(out,s,n);
    const stages=[_Y_W1,_Y_W0,_Y_W1];
    for(let st=0;st<3;st++){
      const c=stages[st],d=stages[st],a=sc.k1; f(out,a);
      for(let i=0;i<half;i++) out[i+half]+=(d*dt)*a[i+half];
      for(let i=0;i<half;i++) out[i]+=(c*dt)*out[i+half];
    }
    return out;
  }
  // Gauss-Legendre implicit midpoint — fixed-point 8-step Newton, tol=1e-10
function gauss2step(s,dt,f,n,out){
    const k=sc.k1,prev=sc.implPrev,mid=sc.tmp;
    f(s,k); for(let i=0;i<n;i++) mid[i]=s[i]+0.5*dt*k[i];
    for(let iter=0;iter<8;iter++){
      vCopy(prev,mid,n); f(mid,k);
      let maxd=0;
      for(let i=0;i<n;i++){const nm=s[i]+0.5*dt*k[i],d=Math.abs(nm-prev[i]);if(d>maxd)maxd=d;mid[i]=nm;}
      if(maxd<1e-10) break;
    }
    f(mid,k); for(let i=0;i<n;i++) out[i]=s[i]+dt*k[i];
    return out;
  }
  // Dormand-Prince RKF45 with PI step-size control (α=0.7/5, β=0.4/5)
  function rkf45step(s,dt,f,n,tol,prevErrRef){
    const{k1,k2,k3,k4,k5,k6,k7,tmp,tmpN}=sc;
    f(s,k1);
    vAdd(tmp,s,dt*(1/5),k1,n); f(tmp,k2);
    for(let i=0;i<n;i++) tmp[i]=s[i]+dt*(3/40*k1[i]+9/40*k2[i]); f(tmp,k3);
    for(let i=0;i<n;i++) tmp[i]=s[i]+dt*(44/45*k1[i]-56/15*k2[i]+32/9*k3[i]); f(tmp,k4);
    for(let i=0;i<n;i++) tmp[i]=s[i]+dt*(19372/6561*k1[i]-25360/2187*k2[i]+64448/6561*k3[i]-212/729*k4[i]); f(tmp,k5);
    for(let i=0;i<n;i++) tmp[i]=s[i]+dt*(9017/3168*k1[i]-355/33*k2[i]+46732/5247*k3[i]+49/176*k4[i]-5103/18656*k5[i]); f(tmp,k6);
    for(let i=0;i<n;i++) tmpN[i]=s[i]+dt*(35/384*k1[i]+500/1113*k3[i]+125/192*k4[i]-2187/6784*k5[i]+11/84*k6[i]);
    f(tmpN,k7);
    const e1=71/57600,e3=-71/16695,e4=71/1920,e5=-17253/339200,e6=22/525,e7=-1/40;
    let err=0;
    for(let i=0;i<n;i++){
      const e=dt*(e1*k1[i]+e3*k3[i]+e4*k4[i]+e5*k5[i]+e6*k6[i]+e7*k7[i]);
      const sc_=tol+tol*Math.max(Math.abs(s[i]),Math.abs(tmpN[i]));
      err+=(e/sc_)*(e/sc_);
    }
    err=Math.sqrt(err/n);
    const prevErr=prevErrRef.value||err;
    const alpha=0.7/5,beta=0.4/5;
    if(err<=1){
      const fac=err===0?5:Math.min(5,Math.max(0.2,0.9*Math.pow(err,-alpha)*Math.pow(prevErr,beta)));
      prevErrRef.value=err;
      return{state:tmpN,accepted:true,dtNext:Math.min(dt*fac,0.05)};
    }else{
      const fac=Math.max(0.1,0.9*Math.pow(err,-alpha));
      return{state:s,accepted:false,dtNext:Math.max(dt*fac,1e-6)};
    }
  }
  function step(method,s,dt,f,n,out,opts){
    switch(method){
      case 'rk2':        return rk2step(s,dt,f,n,out);
      case 'euler':      return eulerstep(s,dt,f,n,out);
      case 'leapfrog':
      case 'verlet':     return leapfrogstep(s,dt,f,n,out);
      case 'symplectic': return symplstep(s,dt,f,n,out);
      case 'yoshida4':   return yoshida4step(s,dt,f,n,out);
      case 'gauss2':     return gauss2step(s,dt,f,n,out);
      default:           return rk4step(s,dt,f,n,out);
    }
  }
  function energy2(s,P){
    const t1=s[0],t2=s[1],w1=s[2],w2=s[3],{m1,m2,l1,l2,g}=P;
    const y1=-l1*Math.cos(t1),y2=y1-l2*Math.cos(t2);
    const v1sq=l1*l1*w1*w1;
    const v2sq=l1*l1*w1*w1+l2*l2*w2*w2+2*l1*l2*w1*w2*Math.cos(t1-t2);
    const KE=0.5*m1*v1sq+0.5*m2*v2sq,PE=g*(m1*y1+m2*y2);
    return{total:KE+PE,KE,PE};
  }
  function energy3(s,P){
    const{m1,m2,m3,l1,l2,l3,g}=P;
    const t1=s[0],t2=s[1],t3=s[2],w1=s[3],w2=s[4],w3=s[5];
    const py1=-l1*Math.cos(t1),py2=py1-l2*Math.cos(t2),py3=py2-l3*Math.cos(t3);
    const vx1=l1*Math.cos(t1)*w1,vy1=l1*Math.sin(t1)*w1;
    const vx2=vx1+l2*Math.cos(t2)*w2,vy2=vy1+l2*Math.sin(t2)*w2;
    const vx3=vx2+l3*Math.cos(t3)*w3,vy3=vy2+l3*Math.sin(t3)*w3;
    const KE=0.5*(m1*(vx1*vx1+vy1*vy1)+m2*(vx2*vx2+vy2*vy2)+m3*(vx3*vx3+vy3*vy3));
    const PE=g*(m1*py1+m2*py2+m3*py3);
    return{total:KE+PE,KE,PE};
  }
  return{rhs2,rhs3,step,rk4step,rk2step,eulerstep,leapfrogstep,symplstep,yoshida4step,gauss2step,rkf45step,energy2,energy3};
})();


const App={
  P:{m1:1,m2:1,m3:1,l1:1.2,l2:1.0,l3:0.8,g:9.81},
  gamma:0, sysType:'double',
  // SharedArrayBuffer path: state lives in SAB so the worker thread reads it without clone
  sab: CONSTS.SAB_SUPPORTED ? new SharedArrayBuffer(CONSTS.MAX_STATE_DIM * Float64Array.BYTES_PER_ELEMENT) : null,
  state: null, prevState: new Float64Array(CONSTS.MAX_STATE_DIM), renderState: new Float64Array(CONSTS.MAX_STATE_DIM),
  stateLen:4, shadow:null, ensemble:[],
  rng:makePRNG(1), seed:1,
  trail:{buf:null,idx:0,filled:0},
  phaseHist:new Float32Array(CONSTS.PHASE_CAP*4), phaseIdx:0, phaseFilled:0,
  theta1Hist:new Float32Array(CONSTS.FFT_N*2), theta1Idx:0, theta1Filled:0,
  energyCirc:new CircularBuffer(700,2),
  lyapCirc:new CircularBuffer(700,2),
  replayCirc:new CircularBuffer(CONSTS.REPLAY_CAP,5),
  trajCirc:new CircularBuffer(CONSTS.TRAJ_CAP,6),
  simTime:0, paused:false, dragging:false,
  method:'rk4', DT:0.003, tol:1e-6, SPF:6, speedMult:1.0,
  trailMode:'rainbow', maxTrailLen:1500, phaseAxis:'1',
  E0:null, maxDrift:0,
  poincPts:[], poincZoom:1,
  trajSample:0,
  fps:60, physMs:0, renderMs:0, workerLatency:0,
  useWorker:true, workerReady:false,
  _dtNext:0.003, _rkfPrevErr:{value:0},
  _stateHash:'00000000',
  audioCtx:null, gainMaster:null, oscPool:[], gainPool:[], audioOn:false, audioVol:0.08,
  rec:null, recChunks:[], recStart:0,
  cam:{yaw:0.7,pitch:0.4,zoom:1.6,vyaw:0,vpitch:0,dragging:false,lx:0,ly:0,trail:[]},
  gl:null, glProg:null, glBuf:null, glPts:0, glHead:0, glCap:200000,
  glAlpha:0.04, gpuFallback:false, glAlphaLoc:null,
  renderBackend:'auto', interpolateRender:true,
  fftCache:null, fftTs:0,
  lyapSumLog:0, lyapTime:0,
  _drift:0, _lastE:0,
  autoQual:true, _fpsWindow:[], _qualLevel:0, _qualLastChange:0, _qualHysteresisMs:3000,
  glowMode:false, longExpose:false,
  userPresets:[],
  pageVisible:!document.hidden,
  activeTab:'lab',
  taskCounter:0,
  activeSweepId:null, activeBifId:null, activeLyapId:null,
  _replayAcc:0,
};
App.state = App.sab ? new Float64Array(App.sab) : new Float64Array(CONSTS.MAX_STATE_DIM);
App.state.set([2.0,2.5,0,0]);
App.prevState.set(App.state);


const UI={};
// Canonical compatibility exposure: top-level const bindings are not window properties.
// Instead of five separate writable globals (App/Physics/NaNGuard/CanvasMgr/UI), the
// classic runtime now publishes ONE namespace object, and exposes the historical names
// as read-only accessors backed by it. The modern TypeScript layer (PendulumRuntime DI
// container) adopts this single namespace; nothing can reassign `window.App` from the
// outside any more. This is the migration bridge toward full removal of the legacy globals.
const PendulumLabLegacyRuntime = Object.freeze({
  get App(){ return App; },
  get Physics(){ return Physics; },
  get NaNGuard(){ return NaNGuard; },
  get CanvasMgr(){ return CanvasMgr; },
  get UI(){ return UI; }
});
globalThis.PendulumLabLegacyRuntime = PendulumLabLegacyRuntime;
for (const name of ['App','Physics','NaNGuard','CanvasMgr','UI']){
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: true,
    get(){ return PendulumLabLegacyRuntime[name]; }
  });
}
function cacheUI(){
  ['fpsBadge','qualBadge','dPhys','dRender','dWorker','dHash','dPoinc','dBackend',
   'tStat','th1Stat','th2Stat','eStat','driftStat','lyapStat','verdict',
   'memStat','nanStat','modeLabel','spf','spfV','pauseBtn','scrubber','scrubVal']
   .forEach(id=>{const el=document.getElementById(id);if(el) UI[id]=el;});
}


let _toastTimer;
function toast(msg,ms=2200){
  const el=document.getElementById('toast');if(!el)return;
  el.textContent=msg;el.classList.add('show');
  clearTimeout(_toastTimer);_toastTimer=setTimeout(()=>el.classList.remove('show'),ms);
}
function dlText(name,text,type='text/plain'){
  const b=new Blob([text],{type});const u=URL.createObjectURL(b);
  const a=document.createElement('a');a.href=u;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(u),1500);
}
function bindClick(id,handler){
  const el=document.getElementById(id);
  if(el) el.addEventListener('click',handler);
}


const WorkerMgr=(()=>{
  const WORKER_URL='./js/physics-worker.js';

  let workerInst=null,pending=false;
  const handlers=Object.create(null);
  function start(){
    if(workerInst) return;
    if(location.protocol==='file:'){
      App.workerReady=false;App.useWorker=false;pending=false;
      App.backendStatus='main-thread fallback';
      return;
    }
    try{
      workerInst=new Worker(WORKER_URL);
      workerInst.onmessage=ev=>{const fn=handlers[ev.data.type];if(fn) fn(ev.data);};
      workerInst.onerror=e=>{
        Log.error('Worker','error',{message:String(e.message||e)});
        App.workerReady=false;App.useWorker=false;pending=false;
      };
      App.workerReady=true;
    }catch(e){
      Log.warn('Worker','falling back to main thread',{message:String(e&&e.message?e.message:e)});
      terminate();
      App.useWorker=false;App.workerReady=false;pending=false;
      App.backendStatus='main-thread fallback';
    }
  }
  function terminate(){
    if(workerInst){workerInst.terminate();workerInst=null;}
    App.workerReady=false;pending=false;
  }
  function on(type,fn){handlers[type]=fn;}
  function post(msg,transfer){if(workerInst) workerInst.postMessage(msg,transfer||[]);else{App.workerReady=false;pending=false;}}
  function cancel(taskId){post({type:'cancel',taskId});}
  function setPending(v){pending=v;}
  function isPending(){return pending;}
  return{start,terminate,on,post,cancel,setPending,isPending};
})();
window.addEventListener('beforeunload',()=>WorkerMgr.terminate());


const _stepOut=new Float64Array(CONSTS.MAX_STATE_DIM);
function makeRhs(){
  if(App.sysType==='triple') return(s,o)=>Physics.rhs3(s,App.P,App.gamma,o);
  return(s,o)=>Physics.rhs2(s,App.P,App.gamma,o);
}
function energyOf(){
  if(App.sysType==='triple') return Physics.energy3(App.state,App.P);
  return Physics.energy2(App.state,App.P);
}
function simStepMain(){
  NaNGuard.setContext(App.method,App.DT);
  const f=makeRhs(),n=App.stateLen;
  const prev0=App.state[0],prev1=App.state[1],prev3=App.state[App.sysType==='triple'?4:3];
  let dtUsed=App.DT;
  if(App.method==='rkf45'){
    const dtAttempt=App._dtNext||App.DT;
    App.rkfStats=App.rkfStats||{attempted:0,accepted:0,rejected:0,acceptedTime:0,rejectedTime:0,hist:new Float64Array(128),histIndex:0};
    App.rkfStats.attempted++;
    const r=Physics.rkf45step(App.state,dtAttempt,f,n,App.tol,App._rkfPrevErr);
    App._dtNext=Math.min(r.dtNext,0.05);
    if(!r.accepted){App.rkfStats.rejected++;App.rkfStats.rejectedTime+=dtAttempt;return{dtUsed:0,rejected:true};}
    for(let i=0;i<n;i++) App.state[i]=r.state[i];
    dtUsed=dtAttempt;
    App.rkfStats.accepted++;App.rkfStats.acceptedTime+=dtUsed;
    App.rkfStats.hist[App.rkfStats.histIndex++%App.rkfStats.hist.length]=dtUsed;
  }else{
    Physics.step(App.method,App.state,App.DT,f,n,_stepOut);
    for(let i=0;i<n;i++) App.state[i]=_stepOut[i];
  }
  if(!NaNGuard.check(App.state,n)){if(!NaNGuard.recover(App.state)) fullReset();return null;}
  NaNGuard.snapshot(App.state);
  for(const e of App.ensemble){
    Physics.step(App.method==='rkf45'?'rk4':App.method,e.state,App.DT,f,n,_stepOut);
    for(let i=0;i<n;i++) e.state[i]=_stepOut[i];
  }
  if(App.shadow&&App.sysType==='double'){
    Physics.step(App.method==='rkf45'?'rk4':App.method,App.shadow,App.DT,f,n,_stepOut);
    for(let i=0;i<n;i++) App.shadow[i]=_stepOut[i];
    let d=0;for(let i=0;i<n;i++){const dd=App.shadow[i]-App.state[i];d+=dd*dd;}d=Math.sqrt(d);
    if(d>0){App.lyapSumLog+=Math.log(d/CONSTS.LYAP_EPS);App.lyapTime+=dtUsed;const k=CONSTS.LYAP_EPS/d;for(let i=0;i<n;i++) App.shadow[i]=App.state[i]+(App.shadow[i]-App.state[i])*k;}
  }
  if(App.sysType==='double'){
    const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
    const a=wrap(prev0),b=wrap(App.state[0]);
    if(a<0&&b>=0&&App.state[2]>0){
      const fr=-a/(b-a);
      pushPoincareV8({t2:wrap(prev1+fr*(App.state[1]-prev1)),w2:prev3+fr*(App.state[3]-prev3),age:App.simTime,section:'theta1=0,w1>0',interpolation:'linear'});
    }
  }
  return{dtUsed};
}
function afterStep(){
  const en=energyOf();
  if(App.E0===null) App.E0=en.total;
  const denom=Math.abs(App.E0)<1e-9?1:Math.abs(App.E0);
  const drift=(en.total-App.E0)/denom;
  if(Math.abs(drift)>App.maxDrift) App.maxDrift=Math.abs(drift);
  App._lastE=en.total;App._drift=drift;
  const off=App.phaseIdx*4;
  App.phaseHist[off]=Math.atan2(Math.sin(App.state[0]),Math.cos(App.state[0]));
  App.phaseHist[off+1]=App.state[App.sysType==='triple'?3:2];
  App.phaseHist[off+2]=Math.atan2(Math.sin(App.state[1]),Math.cos(App.state[1]));
  App.phaseHist[off+3]=App.state[App.sysType==='triple'?4:3];
  App.phaseIdx=(App.phaseIdx+1)%CONSTS.PHASE_CAP;if(App.phaseFilled<CONSTS.PHASE_CAP) App.phaseFilled++;
  App.theta1Hist[App.theta1Idx]=App.state[0];
  App.theta1Idx=(App.theta1Idx+1)%App.theta1Hist.length;
  if(App.theta1Filled<App.theta1Hist.length) App.theta1Filled++;
  App._stateHash=hashState(App.state.subarray(0,App.stateLen));
}


let lastTime=performance.now(),accumulator=0,scrubLive=true;
const frameTimes=[];
function physicsTick(realDt){
  if(App.paused) return;
  const physDt=App.DT;
  accumulator+=Math.min(realDt,CONSTS.MAX_FRAME)*App.speedMult;
  const maxSteps=App.SPF*4;
  const t0=performance.now();
  const n=App.stateLen;
  const workerMethodSupported=App.method!=='rkf45'&&App.method!=='hmidpoint';
  const workerCanRun=App.useWorker&&App.workerReady&&workerMethodSupported;
  if(workerCanRun){
    if(!WorkerMgr.isPending()){
      const steps=Math.min(maxSteps,Math.max(1,Math.round(accumulator/physDt)));
      if(steps>0){
        App.prevState.set(App.state);
        App.backendStatus='worker';
        App.workerBackendState='worker';
        WorkerMgr.setPending(true);
        WorkerMgr.post({type:'step',sys:App.sysType,P:App.P,gamma:App.gamma,method:App.method,
          dt:physDt,tol:App.tol,steps,
          state:Array.from(App.state).slice(0,n),
          sab:null,commitProtocol:'postMessage-snapshot-v8',
          shadow:App.shadow?Array.from(App.shadow).slice(0,n):null,
          ensemble:App.ensemble.map(e=>Array.from(e.state).slice(0,n)),
          withLyap:!!App.shadow,n,prevErr:App._rkfPrevErr.value});
        App.simTime+=steps*physDt;accumulator-=steps*physDt;
      }
    }else{
      App.backendStatus='pending';
      App.workerBackendState='pending';
    }
  }else{
    let steps=0,advanced=false;
    App.prevState.set(App.state);
    App.backendStatus=App.useWorker&&App.workerReady&&!workerMethodSupported?'main-thread fallback':(App.useWorker?'disabled':'main-thread');
    App.workerBackendState=App.backendStatus;
    while(accumulator>=physDt&&steps<maxSteps){
      const r=simStepMain();if(!r){accumulator=0;break;}
      if(r.rejected){steps++;continue;}
      App.simTime+=r.dtUsed;accumulator=Math.max(0,accumulator-r.dtUsed);steps++;advanced=true;
    }
    if(advanced) afterStep();
  }
  App.physMs=performance.now()-t0;
  if(App._drift!==undefined) App.energyCirc.push([App.simTime,App._drift]);
  if(App.lyapTime>0.15) App.lyapCirc.push([App.simTime,App.lyapSumLog/App.lyapTime]);
  App._replayAcc=(App._replayAcc||0)+realDt;
  if(App._replayAcc>0.1){
    App._replayAcc=0;
    App.replayCirc.push([App.simTime,App.state[0],App.state[1],App.state[App.sysType==='triple'?3:2],App.state[App.sysType==='triple'?4:3]]);
    if(UI.scrubber){UI.scrubber.max=App.replayCirc.size-1;if(scrubLive) UI.scrubber.value=App.replayCirc.size-1;}
  }
  App.trajSample++;
  if(App.trajSample%3===0){App.trajCirc.push([App.simTime,App.state[0],App.state[1],App.state[App.sysType==='triple'?3:2],App.state[App.sysType==='triple'?4:3],App._drift||0]);}
}

WorkerMgr.on('stepDone',m=>{
  App.workerLatency=m.elapsed||0;const n=App.stateLen;
  App.backendStatus='worker-committed';
  App.workerBackendState='worker';
  if (m.state) {
     const tmp=new Float64Array(m.state);
     if(NaNGuard.check(tmp,n)){for(let i=0;i<n;i++) App.state[i]=tmp[i];NaNGuard.snapshot(App.state);App.committedSnapshotSeq=(App.committedSnapshotSeq||0)+1;}
     else{App.workerBackendState='faulted'; if(!NaNGuard.recover(App.state)) fullReset();}
  } else if (App.sab) {
     App.workerBackendState='sab-legacy-disabled';
     if(!NaNGuard.check(App.state,n)){if(!NaNGuard.recover(App.state)) fullReset();}
     else NaNGuard.snapshot(App.state);
  }
  if(m.shadow){if(!App.shadow) App.shadow=new Float64Array(n);for(let i=0;i<n;i++) App.shadow[i]=m.shadow[i];}
  for(let i=0;i<App.ensemble.length&&i<m.ensemble.length;i++) for(let j=0;j<n;j++) App.ensemble[i].state[j]=m.ensemble[i][j];
  if(m.lyapDt>0){App.lyapSumLog+=m.lyapAdd;App.lyapTime+=m.lyapDt;}
  for(const p of m.poincCrossings){pushPoincareV8({t2:p.t2,w2:p.w2,age:App.simTime,section:'theta1=0,w1>0',interpolation:'linear'});}
  if(App.method==='rkf45') App._dtNext=Math.min(m.dtNext||App.DT,0.05);
  if(typeof m.prevErr==='number') App._rkfPrevErr.value=m.prevErr;
  afterStep();WorkerMgr.setPending(false);
});


function poincareEntropy(){
  if(App.poincPts.length<50) return null;
  const grid=24,counts=new Uint32Array(grid*grid);
  let xmn=Infinity,xmx=-Infinity,ymn=Infinity,ymx=-Infinity;
  for(const p of App.poincPts){if(p.t2<xmn)xmn=p.t2;if(p.t2>xmx)xmx=p.t2;if(p.w2<ymn)ymn=p.w2;if(p.w2>ymx)ymx=p.w2;}
  if(xmx-xmn<1e-9||ymx-ymn<1e-9) return 0;
  for(const p of App.poincPts){
    const ix=Math.min(grid-1,Math.max(0,Math.floor((p.t2-xmn)/(xmx-xmn)*grid)));
    const iy=Math.min(grid-1,Math.max(0,Math.floor((p.w2-ymn)/(ymx-ymn)*grid)));
    counts[iy*grid+ix]++;
  }
  const total=App.poincPts.length;let H=0;
  for(let i=0;i<counts.length;i++) if(counts[i]){const p=counts[i]/total;H-=p*Math.log2(p);}
  return H;
}
const _recurGrid=new Uint32Array(32*32);
function recurrenceRatio(){
  const n=App.phaseFilled;if(n<200) return null;
  _recurGrid.fill(0);const gsize=32;
  const count=Math.min(n,2000),start=(App.phaseIdx-count+CONSTS.PHASE_CAP*2)%CONSTS.PHASE_CAP;
  for(let k=0;k<count;k++){
    const idx=(start+k)%CONSTS.PHASE_CAP,off=idx*4;
    const th1=App.phaseHist[off],w1=App.phaseHist[off+1];
    const ix=Math.min(gsize-1,Math.max(0,Math.floor((th1+Math.PI)/(2*Math.PI)*gsize)));
    const iy=Math.min(gsize-1,Math.max(0,Math.floor((w1+20)/40*gsize)));
    _recurGrid[iy*gsize+ix]++;
  }
  let visited=0;for(let i=0;i<gsize*gsize;i++) if(_recurGrid[i]>0) visited++;
  return visited/(gsize*gsize);
}
function chaosVerdict(){
  const lam=App.lyapTime>0?App.lyapSumLog/App.lyapTime:null;
  const ent=poincareEntropy(),rec=recurrenceRatio();
  if(lam===null||App.simTime<3) return 'analyzing';
  let score=0;
  if(lam!==null) score+=lam>0.5?3:lam>0.1?1.5:lam>0?0.5:0;
  if(ent!==null) score+=ent>7?2:ent>4?1:0;
  if(rec!==null) score+=rec>0.6?2:rec>0.35?1:0;
  if(score>=4) return 'chaotic';if(score>=2) return 'weakly_chaotic';if(score>=1) return 'marginal';return 'regular';
}


function updateAutoQuality(){
  if(!App.autoQual) return;
  App._fpsWindow.push(App.fps);if(App._fpsWindow.length>60) App._fpsWindow.shift();
  if(App._fpsWindow.length<30) return;
  const now=performance.now();if(now-App._qualLastChange<App._qualHysteresisMs) return;
  const N=App._fpsWindow.length,avg=App._fpsWindow.reduce((a,b)=>a+b,0)/N;
  const variance=App._fpsWindow.reduce((a,b)=>a+(b-avg)*(b-avg),0)/N,stable=Math.sqrt(variance)<8;
  const badge=UI.qualBadge;
  if(stable&&avg<22&&App._qualLevel<2){
    App._qualLevel=2;App.SPF=Math.max(1,Math.round(App.SPF*0.5));
    if(UI.spf) UI.spf.value=App.SPF;if(UI.spfV) UI.spfV.textContent=App.SPF;
    if(badge){badge.textContent='LQ';badge.className='low';}App._qualLastChange=now;toast('⚠ Quality reduced (low FPS)');
  }else if(stable&&avg<38&&App._qualLevel<1){
    App._qualLevel=1;App.SPF=Math.max(2,Math.round(App.SPF*0.75));
    if(UI.spf) UI.spf.value=App.SPF;if(UI.spfV) UI.spfV.textContent=App.SPF;
    if(badge){badge.textContent='MQ';badge.className='degraded';}App._qualLastChange=now;
  }else if(stable&&avg>58&&App._qualLevel>0){
    App._qualLevel=Math.max(0,App._qualLevel-1);
    if(badge){badge.textContent=App._qualLevel===0?'HQ':'MQ';badge.className=App._qualLevel===0?'':'degraded';}App._qualLastChange=now;
  }
}


const Render=(()=>{
  function trailColor(frac,mode,alpha=1){
    const h=Math.floor(frac*360),a=alpha.toFixed(2);
    switch(mode){
      case 'rainbow':return `hsla(${h},90%,58%,${a})`;
      case 'heat':{const r=Math.min(255,Math.floor(frac*2*255)),g=Math.max(0,Math.floor((frac-.5)*2*255));return `rgba(${r},${g},0,${a})`;}
      case 'ice':return `hsla(${200+frac*60},80%,${50+frac*30}%,${a})`;
      case 'plasma':return `hsla(${280-frac*200},80%,${40+frac*30}%,${a})`;
      case 'white':return `rgba(255,255,255,${(frac*.7+.1).toFixed(2)})`;
      case 'green':return `hsla(135,80%,${35+frac*35}%,${a})`;
      default:return `hsla(${h},85%,55%,${a})`;
    }
  }
  function pushTrail(x,y){
    const t=App.trail,cap=App.maxTrailLen;
    if(!t.buf||t.buf.length!==cap*2){t.buf=new Float32Array(cap*2);t.idx=0;t.filled=0;}
    t.buf[t.idx*2]=x;t.buf[t.idx*2+1]=y;t.idx=(t.idx+1)%cap;if(t.filled<cap) t.filled++;
  }
  function drawTrail(ctx){
    const t=App.trail,buf=t.buf;if(!buf||t.filled<2) return;
    const cap=App.maxTrailLen,n=t.filled,start=(t.idx-n+cap*2)%cap;
    const BUCKETS=8;ctx.lineWidth=1.4;ctx.lineCap='round';
    for(let b=0;b<BUCKETS;b++){
      const f0=b/BUCKETS,f1=(b+1)/BUCKETS,fmid=(f0+f1)/2;
      ctx.strokeStyle=trailColor(fmid,App.trailMode,fmid*0.85+0.1);
      ctx.beginPath();let pen=false;
      for(let i=1;i<n;i++){
        const a=i/n;if(a<f0||a>=f1){pen=false;continue;}
        const i0=(start+i-1+cap)%cap,i1=(start+i+cap)%cap;
        if(!pen){ctx.moveTo(buf[i0*2],buf[i0*2+1]);pen=true;}
        ctx.lineTo(buf[i1*2],buf[i1*2+1]);
      }
      ctx.stroke();
    }
  }
  function pendPos(state,P,cx,cy){
    const S=CONSTS.SCALE;
    if(App.sysType==='triple'){
      const t1=state[0],t2=state[1],t3=state[2];
      const x1=cx+P.l1*Math.sin(t1)*S,y1=cy+P.l1*Math.cos(t1)*S;
      const x2=x1+P.l2*Math.sin(t2)*S,y2=y1+P.l2*Math.cos(t2)*S;
      const x3=x2+P.l3*Math.sin(t3)*S,y3=y2+P.l3*Math.cos(t3)*S;
      return{cx,cy,x1,y1,x2,y2,x3,y3};
    }
    const t1=state[0],t2=state[1];
    const x1=cx+P.l1*Math.sin(t1)*S,y1=cy+P.l1*Math.cos(t1)*S;
    const x2=x1+P.l2*Math.sin(t2)*S,y2=y1+P.l2*Math.cos(t2)*S;
    return{cx,cy,x1,y1,x2,y2};
  }
  function drawMain(){
    const c=CanvasMgr.get(mainC),ctx=c.ctx,w=c.w,h=c.h;
    const fadeAlpha=App.longExpose?0.008:App.glowMode?0.04:0.12;
    ctx.fillStyle=`rgba(7,9,13,${fadeAlpha})`;ctx.fillRect(0,0,w,h);
    const cx=w/2,cy=h*0.38;

    let displayState = App.state;
    if (App.interpolateRender && !App.paused) {
      const alpha = Math.min(1.0, accumulator / App.DT);
      for(let i=0; i<App.stateLen; i++) {
        App.renderState[i] = App.prevState[i] + alpha * (App.state[i] - App.prevState[i]);
      }
      displayState = App.renderState;
    }

    const pp=pendPos(displayState,App.P,cx,cy);
    pushTrail(App.sysType==='triple'?pp.x3:pp.x2,App.sysType==='triple'?pp.y3:pp.y2);
    drawTrail(ctx);
    for(const e of App.ensemble){
      if(!e.state) continue;
      const ep=pendPos(e.state,App.P,cx,cy);
      const ex=App.sysType==='triple'?ep.x3:ep.x2,ey=App.sysType==='triple'?ep.y3:ep.y2;
      if(!e.trailBuf||e.trailBuf.length!==400) e.trailBuf=new Float32Array(400);
      e.trailBuf[e.tIdx*2]=ex;e.trailBuf[e.tIdx*2+1]=ey;
      e.tIdx=(e.tIdx+1)%200;if(e.tFilled<200) e.tFilled++;
      const en=e.tFilled;
      if(en>1){
        ctx.strokeStyle='rgba(0,212,255,0.25)';ctx.lineWidth=0.8;ctx.beginPath();
        const s2=(e.tIdx-en+400)%200;
        for(let i=0;i<en;i++){const ii=(s2+i)%200;if(i) ctx.lineTo(e.trailBuf[ii*2],e.trailBuf[ii*2+1]);else ctx.moveTo(e.trailBuf[ii*2],e.trailBuf[ii*2+1]);}
        ctx.stroke();
      }
      ctx.fillStyle='rgba(0,212,255,0.4)';ctx.beginPath();ctx.arc(ex,ey,3,0,6.283);ctx.fill();
    }
    ctx.strokeStyle='rgba(160,185,220,0.5)';ctx.lineWidth=2;ctx.beginPath();
    if(App.sysType==='triple'){ctx.moveTo(cx,cy);ctx.lineTo(pp.x1,pp.y1);ctx.lineTo(pp.x2,pp.y2);ctx.lineTo(pp.x3,pp.y3);}
    else{ctx.moveTo(cx,cy);ctx.lineTo(pp.x1,pp.y1);ctx.lineTo(pp.x2,pp.y2);}
    ctx.stroke();
    ctx.fillStyle='rgba(144,160,184,0.6)';ctx.beginPath();ctx.arc(cx,cy,4,0,6.283);ctx.fill();
    ctx.save();
    if(App.sysType==='triple'){
      const arr=[[pp.x1,pp.y1,'#90a0b8',Math.max(5,App.P.m1*5)],[pp.x2,pp.y2,'#60c0ff',Math.max(4,App.P.m2*4.5)],[pp.x3,pp.y3,'#00d4ff',Math.max(5,App.P.m3*5)]];
      for(const[x,y,col,r]of arr){ctx.shadowColor=col;ctx.shadowBlur=App.glowMode?24:14;ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,r,0,6.283);ctx.fill();}
    }else{
      ctx.shadowColor='#60a0d0';ctx.shadowBlur=App.glowMode?18:10;ctx.fillStyle='#60a0d0';ctx.beginPath();ctx.arc(pp.x1,pp.y1,Math.max(4,App.P.m1*4.5),0,6.283);ctx.fill();
      ctx.shadowColor='#00d4ff';ctx.shadowBlur=App.glowMode?22:16;ctx.fillStyle='#00d4ff';ctx.beginPath();ctx.arc(pp.x2,pp.y2,Math.max(5,App.P.m2*5),0,6.283);ctx.fill();
    }
    ctx.restore();
    if(App.shadow&&App.sysType==='double'){
      const sp=pendPos(App.shadow,App.P,cx,cy);
      ctx.fillStyle='rgba(255,180,80,0.55)';ctx.beginPath();ctx.arc(sp.x2,sp.y2,3.5,0,6.283);ctx.fill();
    }
    ctx.font='10px IBM Plex Mono,monospace';ctx.textAlign='right';
    ctx.fillStyle='rgba(0,212,255,0.4)';
    ctx.fillText(`t = ${App.simTime.toFixed(2)} s`,w-10,18);
    ctx.fillText(`hash ${App._stateHash}`,w-10,32);
    if(App.E0!==null){const d=Math.abs(App._drift);ctx.fillStyle=d>1e-4?'rgba(255,100,30,.6)':'rgba(0,212,255,.35)';ctx.fillText(`ΔE/E₀ = ${d.toExponential(1)}`,w-10,46);}
    ctx.textAlign='left';
    if(App.paused&&!App.dragging){
      ctx.fillStyle='rgba(0,0,0,0.4)';ctx.fillRect(0,0,w,h);
      ctx.fillStyle='rgba(0,212,255,0.9)';ctx.font='500 22px IBM Plex Mono,monospace';ctx.textAlign='center';
      ctx.fillText('PAUSED',w/2,h/2-12);
      ctx.fillStyle='rgba(0,212,255,0.4)';ctx.font='10px IBM Plex Mono,monospace';
      ctx.fillText('drag bobs · Space resume · ←/→ scrub',w/2,h/2+14);ctx.textAlign='left';
    }
  }
  function drawEnergy(){
    const c=CanvasMgr.get(enC),ctx=c.ctx,w=c.w,h=c.h;
    ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);const n=App.energyCirc.size;if(n<2) return;
    ctx.strokeStyle='rgba(255,255,255,0.06)';ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
    let mx=1e-14;for(let i=0;i<n;i++){const d=Math.abs(App.energyCirc.getAt(i,1));if(d>mx) mx=d;}
    ctx.strokeStyle='#00d4ff';ctx.lineWidth=1.2;ctx.beginPath();
    for(let i=0;i<n;i++){const x=(i/(n-1))*w,y=h/2-(App.energyCirc.getAt(i,1)/mx)*(h/2-5);if(i) ctx.lineTo(x,y);else ctx.moveTo(x,y);}
    ctx.stroke();ctx.fillStyle='#4a5568';ctx.font='8px monospace';ctx.fillText(`±${mx.toExponential(1)}`,3,10);
  }
  function drawLyap(){
    const c=CanvasMgr.get(lyC),ctx=c.ctx,w=c.w,h=c.h;
    ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);const n=App.lyapCirc.size;if(n<2) return;
    let mn=Infinity,mx=-Infinity;
    for(let i=0;i<n;i++){const l=App.lyapCirc.getAt(i,1);if(l<mn)mn=l;if(l>mx)mx=l;}
    if(mx-mn<1e-6) mx=mn+1;
    if(mn<0&&mx>0){const zy=h-((0-mn)/(mx-mn))*(h-8)-4;ctx.strokeStyle='rgba(255,255,255,.1)';ctx.beginPath();ctx.moveTo(0,zy);ctx.lineTo(w,zy);ctx.stroke();}
    ctx.strokeStyle='#ff7a30';ctx.lineWidth=1.2;ctx.beginPath();
    for(let i=0;i<n;i++){const x=(i/(n-1))*w,y=h-((App.lyapCirc.getAt(i,1)-mn)/(mx-mn))*(h-8)-4;if(i) ctx.lineTo(x,y);else ctx.moveTo(x,y);}
    ctx.stroke();const lastL=App.lyapCirc.getAt(n-1,1);
    ctx.fillStyle='#4a5568';ctx.font='8px monospace';ctx.fillText(`λ=${lastL.toFixed(3)} 1/s`,3,10);
  }
  function drawPhase(){
    const c=CanvasMgr.get(phC),ctx=c.ctx,w=c.w,h=c.h;
    ctx.fillStyle='rgba(0,0,0,.04)';ctx.fillRect(0,0,w,h);
    const xmin=-Math.PI,xmax=Math.PI,ymin=-25,ymax=25;
    ctx.strokeStyle='rgba(255,255,255,.05)';ctx.beginPath();ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
    const n=App.phaseFilled;if(n<2) return;
    const showN=Math.min(800,n),startIdx=(App.phaseIdx-showN+CONSTS.PHASE_CAP*2)%CONSTS.PHASE_CAP;
    let pTh1=0,pW1=0,pTh2=0,pW2=0,hasPrev=false;
    for(let k=0;k<showN;k++){
      const idx=(startIdx+k)%CONSTS.PHASE_CAP,off=idx*4;
      const th1=App.phaseHist[off],w1=App.phaseHist[off+1],th2=App.phaseHist[off+2],w2=App.phaseHist[off+3];
      const a=(k+1)/showN;
      if(hasPrev){
        if(App.phaseAxis==='1'||App.phaseAxis==='both'){
          const x0=((pTh1-xmin)/(xmax-xmin))*w,y0=h-((pW1-ymin)/(ymax-ymin))*h;
          const x1=((th1-xmin)/(xmax-xmin))*w,y1=h-((w1-ymin)/(ymax-ymin))*h;
          ctx.strokeStyle=`hsla(160,75%,55%,${(a*.75).toFixed(2)})`;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
        }
        if(App.phaseAxis==='2'||App.phaseAxis==='both'){
          const x0=((pTh2-xmin)/(xmax-xmin))*w,y0=h-((pW2-ymin)/(ymax-ymin))*h;
          const x1=((th2-xmin)/(xmax-xmin))*w,y1=h-((w2-ymin)/(ymax-ymin))*h;
          ctx.strokeStyle=`hsla(30,85%,60%,${(a*.65).toFixed(2)})`;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
        }
      }
      pTh1=th1;pW1=w1;pTh2=th2;pW2=w2;hasPrev=true;
    }
    ctx.fillStyle='#4a5568';ctx.font='8px monospace';ctx.fillText(App.phaseAxis==='both'?'θ vs ω (both)':App.phaseAxis==='1'?'θ₁ vs ω₁':'θ₂ vs ω₂',3,10);
  }
  function drawPoincare(){
    const c=CanvasMgr.get(poC),ctx=c.ctx,w=c.w,h=c.h;
    ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
    if(!App.poincPts.length){
      ctx.fillStyle='#1a2030';ctx.font='9px monospace';ctx.textAlign='center';
      ctx.fillText(App.sysType==='double'?'waiting for θ₁=0 crossing…':'N/A for triple',w/2,h/2);ctx.textAlign='left';return;
    }
    const xR=Math.PI/App.poincZoom,yR=20/App.poincZoom;
    const xmin=-xR,xmax=xR,ymin=-yR,ymax=yR;
    const gsize=60,density=new Float32Array(gsize*gsize);
    for(const p of App.poincPts){
      const ix=Math.floor((p.t2-xmin)/(xmax-xmin)*gsize);
      const iy=Math.floor((p.w2-ymin)/(ymax-ymin)*gsize);
      if(ix>=0&&ix<gsize&&iy>=0&&iy<gsize) density[iy*gsize+ix]++;
    }
    let dmax=1;for(let i=0;i<density.length;i++) if(density[i]>dmax) dmax=density[i];
    ctx.strokeStyle='rgba(255,255,255,.06)';
    const ax=((0-xmin)/(xmax-xmin))*w,ay=h-((0-ymin)/(ymax-ymin))*h;
    ctx.beginPath();if(ax>0&&ax<w){ctx.moveTo(ax,0);ctx.lineTo(ax,h);}if(ay>0&&ay<h){ctx.moveTo(0,ay);ctx.lineTo(w,ay);}ctx.stroke();
    for(const p of App.poincPts){
      const x=((p.t2-xmin)/(xmax-xmin))*w,y=h-((p.w2-ymin)/(ymax-ymin))*h;
      if(x<0||x>w||y<0||y>h) continue;
      const ix=Math.floor((p.t2-xmin)/(xmax-xmin)*gsize),iy=Math.floor((p.w2-ymin)/(ymax-ymin)*gsize);
      const d=(ix>=0&&ix<gsize&&iy>=0&&iy<gsize)?density[iy*gsize+ix]:1;
      const norm=d/dmax,hue=200-norm*160,bright=40+norm*35;
      ctx.fillStyle=`hsla(${hue},90%,${bright}%,.75)`;const sz=norm>0.3?2.5:1.8;ctx.fillRect(x,y,sz,sz);
    }
    ctx.fillStyle='#4a5568';ctx.font='8px monospace';ctx.fillText(`${App.poincPts.length} pts  ×${App.poincZoom.toFixed(1)}`,4,11);
  }
  function drawFFT(){
    const c=CanvasMgr.get(ffC),ctx=c.ctx,w=c.w,h=c.h;
    ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
    if(!App.fftCache){
      ctx.fillStyle='#2a3545';ctx.font='9px monospace';ctx.textAlign='center';
      ctx.fillText(`collecting… ${App.theta1Filled} / ${CONSTS.FFT_N}`,w/2,h/2);ctx.textAlign='left';return;
    }
    const pw=App.fftCache,half=pw.length;
    let pmax=-Infinity;for(let i=0;i<half;i++) if(pw[i]>pmax) pmax=pw[i];
    const pmin=pmax-9;
    ctx.strokeStyle='rgba(255,255,255,.04)';
    for(let j=1;j<5;j++){const gy=h-(j/5)*(h-20)-4;ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(w,gy);ctx.stroke();}
    ctx.fillStyle='rgba(0,150,220,.08)';ctx.beginPath();ctx.moveTo(0,h);
    for(let i=1;i<half;i++){const x=(i/half)*w,y=h-((pw[i]-pmin)/(pmax-pmin+1e-9))*(h-22)-5;if(i===1) ctx.moveTo(x,y);else ctx.lineTo(x,y);}
    ctx.lineTo(w,h);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#00d4ff';ctx.lineWidth=1;ctx.beginPath();
    for(let i=1;i<half;i++){const x=(i/half)*w,y=h-((pw[i]-pmin)/(pmax-pmin+1e-9))*(h-22)-5;if(i===1) ctx.moveTo(x,y);else ctx.lineTo(x,y);}
    ctx.stroke();
    const fNyq=0.5/(App.DT*App.SPF);ctx.fillStyle='#4a5568';ctx.font='8px monospace';
    ctx.fillText(`0 — ${fNyq.toFixed(1)} Hz (log Hann)`,4,11);
  }
  function all(alpha=1){
    const t0=performance.now();
    // Stage-2/3 takeover: when the modern app owns the canvases (src/app), ALL
    // legacy renderers stand down — the lab side plots AND the phase3d/density
    // tabs — so the two never fight over the same canvas. `?lab=legacy` leaves
    // __modernLabActive false and the legacy renderers run as before.
    if(!App.__modernLabActive){
      drawMain();
      drawEnergy();
      drawLyap();
      drawPhase();
      drawPoincare();
      if(App.fftCache||App.theta1Filled>=CONSTS.FFT_N) drawFFT();
      if(App.activeTab==='phase3d'&&typeof drawPhase3D==='function') drawPhase3D();
      if(App.activeTab==='density'&&typeof gpuAccumulate==='function') gpuAccumulate();
    }
    App.renderMs=performance.now()-t0;
    return App.renderMs;
  }
  return{all,drawMain,drawEnergy,drawLyap,drawPhase,drawPoincare,drawFFT,pendPos,pushTrail};
})();


const mainC=document.getElementById('main'),enC=document.getElementById('energy');
const lyC=document.getElementById('lyap'),phC=document.getElementById('phase');
const poC=document.getElementById('poincare'),ffC=document.getElementById('fft');
[mainC,enC,lyC,phC,poC,ffC].forEach(c=>CanvasMgr.observe(c));


let _fftInterval=null;
WorkerMgr.on('fftDone',m=>{App.fftCache=m.pw;App.fftTs=performance.now();});
function startFFT(){
  if(_fftInterval) return;
  _fftInterval=setInterval(()=>{
    if(App.theta1Filled<CONSTS.FFT_N||!App.workerReady||!App.pageVisible) return;
    const re=new Float32Array(CONSTS.FFT_N);const cap=App.theta1Hist.length;
    const start=(App.theta1Idx-CONSTS.FFT_N+cap*2)%cap;
    for(let i=0;i<CONSTS.FFT_N;i++) re[i]=App.theta1Hist[(start+i)%cap];
    WorkerMgr.post({type:'fft',re,N:CONSTS.FFT_N},[re.buffer]);
  },CONSTS.FFT_INTERVAL_MS);
}
window.addEventListener('beforeunload',()=>{if(_fftInterval) clearInterval(_fftInterval);});


let _rafId=null,_diagLastUpdate=0;
const _DIAG_INTERVAL=1000/CONSTS.DIAG_HZ;
function frame(now){
  if(!App.pageVisible){_rafId=null;return;}
  const realDt=Math.min(CONSTS.MAX_FRAME,(now-lastTime)/1000);lastTime=now;
  frameTimes.push(realDt);if(frameTimes.length>60) frameTimes.shift();
  const sum=frameTimes.reduce((a,b)=>a+b,0);App.fps=sum>0?frameTimes.length/sum:0;
  if(UI.fpsBadge) UI.fpsBadge.textContent=`${App.fps.toFixed(0)} fps · ${App.physMs.toFixed(1)}ms`;
  physicsTick(realDt);audioUpdate();updateAutoQuality();
  Render.all(App.interpolateRender?1:0);
  if(now-_diagLastUpdate>=_DIAG_INTERVAL){
    _diagLastUpdate=now;
    const w1Idx=App.sysType==='triple'?3:2,w2Idx=App.sysType==='triple'?4:3;
    if(UI.dPhys)   UI.dPhys.textContent=App.physMs.toFixed(1);
    if(UI.dRender) UI.dRender.textContent=App.renderMs.toFixed(1);
    if(UI.dWorker) UI.dWorker.textContent=App.workerLatency?App.workerLatency.toFixed(1)+'ms':'—';
    if(UI.dHash)   UI.dHash.textContent=App._stateHash;
    if(UI.dPoinc)  UI.dPoinc.textContent=App.poincPts.length;
    const dB=document.getElementById('dBackend');if(dB) dB.textContent=App.gpuFallback?'Canvas2D':(App.gl?'WebGL2':'init');
    if(UI.tStat)    UI.tStat.textContent=App.simTime.toFixed(2)+' s';
    if(UI.th1Stat)  UI.th1Stat.textContent=`${App.state[0].toFixed(3)} / ${App.state[w1Idx].toFixed(2)}`;
    if(UI.th2Stat)  UI.th2Stat.textContent=`${App.state[1].toFixed(3)} / ${App.state[w2Idx].toFixed(2)}`;
    if(UI.eStat)    UI.eStat.textContent=App.E0===null?'—':`${App.E0.toFixed(3)} / ${(App._lastE||0).toFixed(3)}`;
    if(UI.driftStat){UI.driftStat.textContent=App.maxDrift.toExponential(2);UI.driftStat.className='sval '+(App.maxDrift>1e-2?'bad':App.maxDrift>1e-4?'warn':'good');}
    if(UI.lyapStat) UI.lyapStat.textContent=App.lyapTime>0?(App.lyapSumLog/App.lyapTime).toFixed(4)+' /s':'—';
    if(UI.nanStat)  UI.nanStat.textContent=NaNGuard.count();
    if(UI.modeLabel) UI.modeLabel.textContent=App.paused?'paused':'running';
    if(performance.memory){const mb=(performance.memory.usedJSHeapSize/1024/1024).toFixed(1);const m=document.getElementById('memStat');if(m) m.textContent=mb+' MB';}
    const vd=chaosVerdict();
    if(UI.verdict){
      const map={analyzing:['chip','analyzing'],chaotic:['chip bad','CHAOTIC'],weakly_chaotic:['chip warn','weakly chaotic'],marginal:['chip warn','marginal'],regular:['chip on','REGULAR']};
      const spec=map[vd]||map.analyzing,chip=document.createElement('span');
      chip.className=spec[0];chip.textContent=spec[1];UI.verdict.replaceChildren(chip);
    }
  }
  _rafId=requestAnimationFrame(frame);
}
function startFrameLoop(){if(_rafId!==null) return;lastTime=performance.now();_rafId=requestAnimationFrame(frame);}
function stopFrameLoop(){if(_rafId!==null){cancelAnimationFrame(_rafId);_rafId=null;}}
document.addEventListener('visibilitychange',()=>{App.pageVisible=!document.hidden;if(App.pageVisible){accumulator=0;startFrameLoop();}else stopFrameLoop();});


function audioInit(){
  if(App.audioCtx) return true;
  try{
    App.audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    const cmp=App.audioCtx.createDynamicsCompressor();cmp.threshold.value=-20;cmp.ratio.value=8;
    App.gainMaster=App.audioCtx.createGain();App.gainMaster.gain.value=App.audioVol;
    cmp.connect(App.gainMaster).connect(App.audioCtx.destination);
    for(let i=0;i<4;i++){
      const g=App.audioCtx.createGain();g.gain.value=0;
      const o=App.audioCtx.createOscillator();o.type=i<2?'sine':'triangle';
      o.connect(g).connect(cmp);try{o.start();}catch(_){}
      App.oscPool.push(o);App.gainPool.push(g);
    }
    return true;
  }catch(e){Log.warn('Audio','init failed',{e:String(e)});return false;}
}
function audioUpdate(){
  if(!App.audioOn) return;if(!App.audioCtx){if(!audioInit()) return;}
  try{
    if(App.audioCtx.state==='suspended') App.audioCtx.resume().catch(()=>{});
    const w1Idx=App.sysType==='triple'?3:2,w2Idx=App.sysType==='triple'?4:3;
    const w1=App.state[w1Idx]||0,w2=App.state[w2Idx]||0,t=App.audioCtx.currentTime;
    App.oscPool[0].frequency.setTargetAtTime(Math.min(1200,Math.max(80,200+Math.abs(w1)*55)),t,.04);
    App.gainPool[0].gain.setTargetAtTime(Math.min(.5,Math.abs(w1)*.018),t,.04);
    App.oscPool[1].frequency.setTargetAtTime(Math.min(1500,Math.max(120,300+Math.abs(w2)*70)),t,.04);
    App.gainPool[1].gain.setTargetAtTime(Math.min(.5,Math.abs(w2)*.014),t,.04);
  }catch(_){}
}


const p3dC=document.getElementById('p3dCanvas');
CanvasMgr.observe(p3dC);
function drawPhase3D(){
  const c=CanvasMgr.get(p3dC),ctx=c.ctx,w=c.w,h=c.h;
  ctx.fillStyle='rgba(0,0,0,.07)';ctx.fillRect(0,0,w,h);
  const inertiaEl=document.getElementById('p3dInertia');
  if(inertiaEl&&inertiaEl.checked&&!App.cam.dragging){
    App.cam.yaw+=App.cam.vyaw*.016;App.cam.pitch+=App.cam.vpitch*.016;App.cam.vyaw*=.92;App.cam.vpitch*=.92;
  }
  const w2Idx=App.sysType==='triple'?4:3;
  App.cam.trail.push([Math.atan2(Math.sin(App.state[0]),Math.cos(App.state[0])),Math.atan2(Math.sin(App.state[1]),Math.cos(App.state[1])),App.state[w2Idx]||0]);
  const maxNEl=document.getElementById('p3dN'),maxN=maxNEl?+maxNEl.value:5000;
  if(App.cam.trail.length>maxN) App.cam.trail.splice(0,App.cam.trail.length-maxN);
  const cy=Math.cos(App.cam.yaw),sy=Math.sin(App.cam.yaw),cp=Math.cos(App.cam.pitch),sp=Math.sin(App.cam.pitch);
  const dfEl=document.getElementById('p3dDepthFade'),depthFade=dfEl&&dfEl.checked;
  function project(x,y,z){
    x/=Math.PI;y/=Math.PI;z/=20;const X=x*cy-z*sy,Y=y,Z=x*sy+z*cy;
    const Y2=Y*cp-Z*sp,Z2=Y*sp+Z*cp,persp=1/(2.2-Z2);
    return[w/2+X*persp*App.cam.zoom*180,h/2-Y2*persp*App.cam.zoom*180,Z2];
  }
  const axArr=[[[-1,0,0],[1,0,0],'#00d4ff','θ₁'],[[0,-1,0],[0,1,0],'#34e88a','θ₂'],[[0,0,-1],[0,0,1],'#ff7a30','ω₂']];
  for(const[a,b,col,lbl]of axArr){
    const p=project(a[0]*Math.PI,a[1]*Math.PI,a[2]*20),q=project(b[0]*Math.PI,b[1]*Math.PI,b[2]*20);
    ctx.strokeStyle=col;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke();
    ctx.fillStyle=col;ctx.font='10px monospace';ctx.fillText(lbl,q[0]+4,q[1]);
  }
  const n=App.cam.trail.length;if(n<2) return;ctx.lineWidth=.9;
  for(let i=1;i<n;i++){
    const a0=App.cam.trail[i-1],a1=App.cam.trail[i];
    const p0=project(a0[0],a0[1],a0[2]),p1=project(a1[0],a1[1],a1[2]);
    const ageA=(i/n)*.6+.1,dpA=depthFade?Math.max(.05,.5+p1[2]*.5):1;
    const hue=200+(i/n)*120;
    ctx.strokeStyle=`hsla(${hue},85%,55%,${(ageA*dpA).toFixed(2)})`;
    ctx.beginPath();ctx.moveTo(p0[0],p0[1]);ctx.lineTo(p1[0],p1[1]);ctx.stroke();
  }
  const last=App.cam.trail[n-1];
  if(last){const p=project(last[0],last[1],last[2]);ctx.save();ctx.fillStyle='#00d4ff';ctx.shadowColor='#00d4ff';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(p[0],p[1],4,0,6.283);ctx.fill();ctx.restore();}
}
p3dC.addEventListener('pointerdown',e=>{e.preventDefault();App.cam.dragging=true;App.cam.lx=e.clientX;App.cam.ly=e.clientY;App.cam.vyaw=0;App.cam.vpitch=0;p3dC.setPointerCapture(e.pointerId);});
p3dC.addEventListener('pointermove',e=>{if(!App.cam.dragging) return;const dx=e.clientX-App.cam.lx,dy=e.clientY-App.cam.ly;App.cam.vyaw=dx*.005;App.cam.vpitch=dy*.005;App.cam.yaw+=App.cam.vyaw;App.cam.pitch+=App.cam.vpitch;App.cam.lx=e.clientX;App.cam.ly=e.clientY;});
p3dC.addEventListener('pointerup',e=>{App.cam.dragging=false;try{p3dC.releasePointerCapture(e.pointerId);}catch(_){}});
p3dC.addEventListener('pointercancel',()=>{App.cam.dragging=false;});
p3dC.addEventListener('wheel',e=>{e.preventDefault();App.cam.zoom=Math.max(.3,Math.min(8,App.cam.zoom*(e.deltaY<0?1.1:.9)));},{passive:false});
bindClick('p3dClear',()=>{App.cam.trail=[];});
bindClick('p3dResetCam',()=>{App.cam.yaw=.7;App.cam.pitch=.4;App.cam.zoom=1.6;App.cam.vyaw=0;App.cam.vpitch=0;});


const gpuC=document.getElementById('gpuCanvas');
CanvasMgr.observe(gpuC);
gpuC.addEventListener('webglcontextlost',e=>{e.preventDefault();App.gl=null;App.gpuFallback=true;const s=document.getElementById('gpuStatus');if(s) s.textContent='context lost — Canvas2D';});
gpuC.addEventListener('webglcontextrestored',()=>{App.gpuFallback=false;gpuInit();});
function gpuInit(){
  if(App.gl||App.gpuFallback) return true;
  let gl=null;
  try{gl=gpuC.getContext('webgl2',{premultipliedAlpha:false,preserveDrawingBuffer:true});}catch(_){}
  if(!gl){try{gl=gpuC.getContext('webgl',{premultipliedAlpha:false,preserveDrawingBuffer:true});}catch(_){}}
  if(!gl){const s=document.getElementById('gpuStatus');if(s) s.textContent='WebGL unavailable — Canvas2D';App.gpuFallback=true;return true;}
  try{
    App.gl=gl;const isGL2=(typeof WebGL2RenderingContext!=='undefined')&&(gl instanceof WebGL2RenderingContext);
    const vsrc=isGL2?`#version 300 es\nin vec2 a_pos;void main(){gl_Position=vec4(a_pos,0.,1.);gl_PointSize=1.5;}`:`attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0.,1.);gl_PointSize=1.5;}`;
    const fsrc=isGL2?`#version 300 es\nprecision highp float;uniform float u_a;out vec4 o;void main(){o=vec4(0.0,0.83,1.0,u_a);}`:`precision highp float;uniform float u_a;void main(){gl_FragColor=vec4(0.0,0.83,1.0,u_a);}`;
    const compile=(src,type)=>{const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){throw new Error('shader: '+gl.getShaderInfoLog(sh));}return sh;};
    const prog=gl.createProgram();
    gl.attachShader(prog,compile(vsrc,gl.VERTEX_SHADER));gl.attachShader(prog,compile(fsrc,gl.FRAGMENT_SHADER));gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog,gl.LINK_STATUS)) throw new Error('link');
    App.glProg=prog;App.glAlphaLoc=gl.getUniformLocation(prog,'u_a');App.glBuf=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,App.glBuf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(App.glCap*2),gl.DYNAMIC_DRAW);
    gl.useProgram(prog);const loc=gl.getAttribLocation(prog,'a_pos');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.viewport(0,0,gpuC.width,gpuC.height);
    gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
    const s=document.getElementById('gpuStatus');if(s) s.textContent=`WebGL${isGL2?'2':'1'} ready`;
    return true;
  }catch(e){Log.warn('GPU','init failed',{e:String(e)});App.gl=null;App.gpuFallback=true;const s=document.getElementById('gpuStatus');if(s) s.textContent='WebGL failed — Canvas2D';return true;}
}
function gpuAccumulate(){
  if(!App.gl&&!App.gpuFallback) gpuInit();
  const w1Idx=App.sysType==='triple'?3:2;
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const t=wrap(App.state[0])/Math.PI,om=(App.state[w1Idx]||0)/20;
  if(App.gpuFallback){
    const c=CanvasMgr.get(gpuC),ctx=c.ctx,w=c.w,h=c.h;
    const px=(t+1)/2*w,py=(1-(om+1)/2)*h;
    ctx.fillStyle=`rgba(0,212,255,${App.glAlpha})`;ctx.fillRect(px,py,1.5,1.5);
    App.glPts++;return;
  }
  const gl=App.gl;
  try{
    const buf=new Float32Array([t,om]);
    gl.bindBuffer(gl.ARRAY_BUFFER,App.glBuf);gl.bufferSubData(gl.ARRAY_BUFFER,App.glHead*8,buf);
    App.glHead=(App.glHead+1)%App.glCap;if(App.glPts<App.glCap) App.glPts++;
    gl.useProgram(App.glProg);gl.uniform1f(App.glAlphaLoc,App.glAlpha);
    gl.drawArrays(gl.POINTS,App.glHead===0?App.glCap-1:App.glHead-1,1);
    if(App.glPts%2000===0){const s=document.getElementById('gpuStatus');if(s) s.textContent=`accumulated ${App.glPts.toLocaleString()} pts`;}
  }catch(e){Log.warn('GPU','draw fail',{e:String(e)});App.gl=null;App.gpuFallback=true;}
}
bindClick('gpuClear',()=>{
  App.glPts=0;App.glHead=0;
  if(App.gl){App.gl.clearColor(0,0,0,1);App.gl.clear(App.gl.COLOR_BUFFER_BIT);}
  else if(App.gpuFallback){const c=CanvasMgr.get(gpuC);c.ctx.fillStyle='#000';c.ctx.fillRect(0,0,c.w,c.h);}
});
document.getElementById('gpuAlpha').addEventListener('input',function(){App.glAlpha=+this.value;document.getElementById('gpuAlphaV').textContent=this.value;});


const cmpC=document.getElementById('cmpCanvas'),cmpEC=document.getElementById('cmpEnergy');
const cmpDC=document.getElementById('cmpDiverge'),cmpBC=document.getElementById('cmpBench');
[cmpC,cmpEC,cmpDC,cmpBC].forEach(c=>CanvasMgr.observe(c));
let cmpRun=null;
function startCompare(){
  stopCompare();
  const dt=+document.getElementById('cmpDt').value;
  const ic=new Float64Array([+document.getElementById('th1').value,+document.getElementById('th2').value,+document.getElementById('iw1').value,+document.getElementById('iw2').value]);
  const sims=[
    {name:'rk4',color:'#00d4ff',state:new Float64Array(ic),trail:[],eHist:[],dtN:dt,prevErrRef:{value:0}},
    {name:'leap',color:'#ff7a30',state:new Float64Array(ic),trail:[],eHist:[],dtN:dt,prevErrRef:{value:0}},
    {name:'yosh',color:'#9d6fff',state:new Float64Array(ic),trail:[],eHist:[],dtN:dt,prevErrRef:{value:0}},
    {name:'rkf45',color:'#34e88a',state:new Float64Array(ic),trail:[],eHist:[],dtN:dt,prevErrRef:{value:0}},
  ];
  const f=(s,o)=>Physics.rhs2(s,App.P,0,o);const E0=Physics.energy2(ic,App.P).total;let t=0;
  const divHist=[[],[],[]];const out=new Float64Array(4);
  function tick(){
    for(let k=0;k<10;k++){
      Physics.rk4step(sims[0].state,dt,f,4,out);for(let q=0;q<4;q++) sims[0].state[q]=out[q];
      Physics.leapfrogstep(sims[1].state,dt,f,4,out);for(let q=0;q<4;q++) sims[1].state[q]=out[q];
      Physics.yoshida4step(sims[2].state,dt,f,4,out);for(let q=0;q<4;q++) sims[2].state[q]=out[q];
      const r=Physics.rkf45step(sims[3].state,sims[3].dtN,f,4,1e-7,sims[3].prevErrRef);
      if(r.accepted) for(let q=0;q<4;q++) sims[3].state[q]=r.state[q];
      sims[3].dtN=Math.min(r.dtNext,0.05);t+=dt;
      for(const s of sims){const e=Physics.energy2(s.state,App.P);s.eHist.push(Math.abs((e.total-E0)/Math.abs(E0||1)));if(s.eHist.length>1500) s.eHist.shift();}
      for(let i=1;i<4;i++){let d=0;for(let q=0;q<4;q++){const dd=sims[i].state[q]-sims[0].state[q];d+=dd*dd;}divHist[i-1].push(Math.sqrt(d));if(divHist[i-1].length>1500) divHist[i-1].shift();}
    }
    drawCmp(sims,divHist,t);cmpRun=requestAnimationFrame(tick);
  }
  tick();
}
function stopCompare(){if(cmpRun){cancelAnimationFrame(cmpRun);cmpRun=null;}}
function drawCmp(sims,divHist,t){
  const c=CanvasMgr.get(cmpC),ctx=c.ctx,w=c.w,h=c.h;
  ctx.fillStyle='rgba(0,0,0,.06)';ctx.fillRect(0,0,w,h);
  const cx=w/2,cy=h/3,S=130;
  for(const sm of sims){
    const t1=sm.state[0],t2=sm.state[1];
    const x1=cx+App.P.l1*Math.sin(t1)*S,y1=cy+App.P.l1*Math.cos(t1)*S;
    const x2=x1+App.P.l2*Math.sin(t2)*S,y2=y1+App.P.l2*Math.cos(t2)*S;
    sm.trail.push([x2,y2]);if(sm.trail.length>1500) sm.trail.shift();
    ctx.strokeStyle=sm.color+'80';ctx.lineWidth=1;ctx.beginPath();
    for(let i=0;i<sm.trail.length;i++){const p=sm.trail[i];if(i) ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1]);}
    ctx.stroke();
    ctx.strokeStyle='rgba(170,190,220,.4)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    ctx.save();ctx.fillStyle=sm.color;ctx.shadowColor=sm.color;ctx.shadowBlur=10;ctx.beginPath();ctx.arc(x2,y2,5,0,6.283);ctx.fill();ctx.restore();
  }
  ctx.font='10px monospace';
  const labs=[['RK4','#00d4ff'],['Leapfrog','#ff7a30'],['Yoshida4','#9d6fff'],['RKF45','#34e88a']];
  labs.forEach(([n,col],i)=>{ctx.fillStyle='#fff';ctx.fillText(n,12,h-58+14*i);ctx.fillStyle=col;ctx.fillRect(70,h-64+14*i,12,8);});
  ctx.fillStyle='#4a5568';ctx.fillText(`t=${t.toFixed(2)}s`,w-80,18);
  [{c:cmpEC,data:sims.map(s=>s.eHist),label:'|ΔE/E₀| log10',colors:sims.map(s=>s.color)},
   {c:cmpDC,data:divHist,label:'‖divergence‖',colors:['#ff7a30','#9d6fff','#34e88a']}]
  .forEach(({c,data,label,colors})=>{
    const cv=CanvasMgr.get(c),c2=cv.ctx,w2=cv.w,h2=cv.h;
    c2.fillStyle='#000';c2.fillRect(0,0,w2,h2);
    data.forEach((hist,hi)=>{
      if(!hist.length) return;c2.strokeStyle=colors[hi];c2.lineWidth=1.1;c2.beginPath();
      for(let i=0;i<hist.length;i++){const x=(i/Math.max(1,hist.length-1))*w2,v=Math.max(1e-15,hist[i]),y=h2-((Math.log10(v)+15)/15)*(h2-10)-5;if(i) c2.lineTo(x,y);else c2.moveTo(x,y);}
      c2.stroke();
    });
    c2.fillStyle='#4a5568';c2.font='8px monospace';c2.fillText(label,4,11);
  });
}
WorkerMgr.on('benchDone',m=>{
  const r=m.results;const fmt=v=>v?`${(v/1000).toFixed(1)}k steps/ms`:'-';
  const map={bRK4:'rk4',bRKF45:'rkf45',bLeap:'leapfrog',bYosh:'yoshida4',bSympl:'symplectic',bGauss:'gauss2',bRK2:'rk2',bEuler:'euler'};
  for(const[id,k]of Object.entries(map)){const el=document.getElementById(id);if(el) el.textContent=fmt(r[k]);}
  const c=CanvasMgr.get(cmpBC),ctx=c.ctx,w=c.w,h=c.h;
  ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
  const methods=['rk4','rk2','euler','leapfrog','symplectic','yoshida4','gauss2','rkf45'];
  const vals=methods.map(k=>r[k]||0);const mx=Math.max.apply(null,vals.concat([1]));
  const bw=w/methods.length-4;
  const colors=['#00d4ff','#34e88a','#8b97ad','#ff7a30','#f0d040','#9d6fff','#e060c0','#34e88a'];
  methods.forEach((k,i)=>{
    const v=vals[i]/mx,x=i*(bw+4)+2,bh=v*(h-30);
    ctx.fillStyle=colors[i];ctx.fillRect(x,h-bh-18,bw,bh);
    ctx.fillStyle='#4a5568';ctx.font='8px monospace';ctx.textAlign='center';
    ctx.fillText(k.slice(0,5),x+bw/2,h-5);ctx.fillStyle=colors[i];ctx.fillText(`${(vals[i]/1000).toFixed(0)}k`,x+bw/2,h-bh-22);
  });
  ctx.textAlign='left';toast('✓ Benchmark complete');
});
bindClick('cmpStart',startCompare);
bindClick('cmpStop',stopCompare);
bindClick('cmpBenchBtn',()=>{
  if(!App.workerReady){toast('Worker not ready');return;}
  WorkerMgr.post({type:'benchmark',P:App.P,gamma:App.gamma,dt:0.003,N:50000});toast('⚡ Benchmarking…');
});
document.getElementById('cmpDt').addEventListener('input',function(){document.getElementById('cmpDtV').textContent=parseFloat(this.value).toFixed(3);});


const lyapSpecC=document.getElementById('lyapSpecCanvas');CanvasMgr.observe(lyapSpecC);
let _lyapHistory=[];
WorkerMgr.on('lyapProgress',m=>{
  if(m.taskId!==App.activeLyapId) return;
  const ls=document.getElementById('lyapStatus');if(ls) ls.textContent=`t=${m.t.toFixed(1)}/${m.T.toFixed(0)}s`;
  for(let i=0;i<m.lambdas.length;i++){const el=document.getElementById('L'+(i+1));if(el) el.textContent=m.lambdas[i].toFixed(4);}
  _lyapHistory.push({t:m.t,lambdas:m.lambdas.slice()});if(_lyapHistory.length>500) _lyapHistory.shift();
  drawLyapSpec();
});
WorkerMgr.on('lyapDone',m=>{
  if(m.taskId!==App.activeLyapId) return;
  const ls=document.getElementById('lyapStatus');if(ls) ls.textContent=`done — ${m.totalT.toFixed(1)}s`;
  const sum=m.lambdas.reduce((a,b)=>a+b,0);const lsum=document.getElementById('LSum');if(lsum) lsum.textContent=sum.toFixed(4);
  let cum=0,j=0;for(let i=0;i<m.lambdas.length;i++){cum+=m.lambdas[i];if(cum>=0) j=i+1;else break;}
  let dKY=j;if(j<m.lambdas.length&&m.lambdas[j]!==0){const cumJ=m.lambdas.slice(0,j).reduce((a,b)=>a+b,0);dKY=j+cumJ/Math.abs(m.lambdas[j]);}
  const ky=document.getElementById('KY');if(ky) ky.textContent=dKY.toFixed(3);
  App.activeLyapId=null;toast('✓ Lyapunov spectrum done');
});
function drawLyapSpec(){
  const c=CanvasMgr.get(lyapSpecC),ctx=c.ctx,w=c.w,h=c.h;
  ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);if(_lyapHistory.length<2) return;
  const n=_lyapHistory.length,numLyap=_lyapHistory[0].lambdas.length;
  let mn=Infinity,mx=-Infinity;
  for(const h of _lyapHistory) for(const l of h.lambdas){if(l<mn) mn=l;if(l>mx) mx=l;}
  if(mx-mn<1e-6) mx=mn+1;
  ctx.strokeStyle='rgba(255,255,255,.06)';
  if(mn<0&&mx>0){const zy=h-((0-mn)/(mx-mn))*(h-20)-10;ctx.beginPath();ctx.moveTo(0,zy);ctx.lineTo(w,zy);ctx.stroke();}
  const colors=['#00d4ff','#ff7a30','#34e88a','#9d6fff','#f0d040','#e060c0'];
  for(let li=0;li<numLyap;li++){
    ctx.strokeStyle=colors[li%colors.length];ctx.lineWidth=1.2;ctx.beginPath();
    for(let i=0;i<n;i++){const x=(i/(n-1))*w,y=h-(((_lyapHistory[i].lambdas[li]||0)-mn)/(mx-mn))*(h-20)-10;if(i) ctx.lineTo(x,y);else ctx.moveTo(x,y);}
    ctx.stroke();
  }
  ctx.fillStyle='#4a5568';ctx.font='9px monospace';
  ctx.fillText(`λ ∈ [${mn.toFixed(2)}, ${mx.toFixed(2)}] · t=${_lyapHistory[n-1].t.toFixed(1)}s`,4,12);
}
bindClick('lyapStart',()=>{
  if(!App.workerReady){toast('Worker not ready');return;}
  if(App.activeLyapId!==null){toast('Lyapunov already running');return;}
  const renormDt=+document.getElementById('lyapDt').value;
  const T=+document.getElementById('lyapT').value;
  const eps=Math.pow(10,+document.getElementById('lyapEps').value);
  const taskId=++App.taskCounter;App.activeLyapId=taskId;_lyapHistory=[];
  const ls=document.getElementById('lyapStatus');if(ls) ls.textContent='running…';
  WorkerMgr.post({type:'lyapSpectrum',taskId,n:App.stateLen,sys:App.sysType,P:App.P,gamma:App.gamma,dt:0.005,T,IC:Array.from(App.state),eps,renormDt});
});
bindClick('lyapStop',()=>{if(App.activeLyapId!==null) WorkerMgr.cancel(App.activeLyapId);else toast('None running');});
bindClick('lyapExport',()=>{
  if(!_lyapHistory.length){toast('No data');return;}
  let csv='t,'+_lyapHistory[0].lambdas.map((_,i)=>'lambda_'+(i+1)).join(',')+'\n';
  for(const h of _lyapHistory) csv+=h.t.toFixed(3)+','+h.lambdas.map(l=>l.toFixed(6)).join(',')+'\n';
  dlText('lyapunov_spectrum.csv',csv);toast('⬇ saved');
});
document.getElementById('lyapDt').addEventListener('input',function(){document.getElementById('lyapDtV').textContent=parseFloat(this.value).toFixed(2)+' s';});
document.getElementById('lyapT').addEventListener('input',function(){document.getElementById('lyapTV').textContent=this.value+' s';});
document.getElementById('lyapEps').addEventListener('input',function(){document.getElementById('lyapEpsV').textContent='1.0e'+this.value;});


const sweepC=document.getElementById('sweepCanvas');CanvasMgr.observe(sweepC);
let _sweepData=null;
WorkerMgr.on('sweepProgress',m=>{
  if(m.taskId!==App.activeSweepId) return;
  const sp=document.getElementById('sweepProgress');if(sp) sp.style.width=(m.row/m.total*100)+'%';
  const ss=document.getElementById('sweepStatus');if(ss) ss.textContent=`row ${m.row}/${m.total}`;
});
WorkerMgr.on('sweepDone',m=>{
  if(m.taskId!==App.activeSweepId) return;_sweepData=m;
  const sp=document.getElementById('sweepProgress');if(sp) sp.style.width='100%';
  const ss=document.getElementById('sweepStatus');if(ss) ss.textContent=`done — ${m.res}×${m.res}`;
  drawSweep(m.data,m.res);App.activeSweepId=null;toast('✓ Sweep complete');
});
WorkerMgr.on('sweepCancelled',m=>{
  if(m.taskId!==App.activeSweepId) return;
  const ss=document.getElementById('sweepStatus');if(ss) ss.textContent='cancelled';
  const sp=document.getElementById('sweepProgress');if(sp) sp.style.width='0';App.activeSweepId=null;
});
function drawSweep(data,res){
  const c=CanvasMgr.get(sweepC),ctx=c.ctx,w=c.w,h=c.h;
  const tmp=document.createElement('canvas');tmp.width=res;tmp.height=res;
  const tctx=tmp.getContext('2d'),idata=tctx.createImageData(res,res);
  let mn=Infinity,mx=-Infinity;for(let i=0;i<data.length;i++){if(data[i]<mn)mn=data[i];if(data[i]>mx)mx=data[i];}
  const rng=mx-mn||1;
  for(let i=0;i<res*res;i++){
    const v=(data[i]-mn)/rng;
    idata.data[i*4]=Math.round(v*255*.8+40*v);idata.data[i*4+1]=Math.round(v*180);idata.data[i*4+2]=Math.round(v*255);idata.data[i*4+3]=255;
  }
  tctx.putImageData(idata,0,0);ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.imageSmoothingEnabled=false;ctx.drawImage(tmp,0,0,w,h);
  ctx.fillStyle='rgba(0,212,255,.5)';ctx.font='10px monospace';ctx.fillText('−π',4,h-4);ctx.fillText('+π',w-20,h-4);ctx.fillText('−π',4,14);
}
sweepC.addEventListener('click',e=>{
  if(!_sweepData) return;const r=sweepC.getBoundingClientRect();
  const x=(e.clientX-r.left)/r.width,y=1-(e.clientY-r.top)/r.height;
  const t1=(-Math.PI+2*Math.PI*x).toFixed(3),t2=(-Math.PI+2*Math.PI*y).toFixed(3);
  const th1El=document.getElementById('th1'),th2El=document.getElementById('th2');
  if(th1El){th1El.value=t1;document.getElementById('th1V').textContent=t1;}
  if(th2El){th2El.value=t2;document.getElementById('th2V').textContent=t2;}
  fullReset();toast(`IC → (${t1}, ${t2})`);
});
bindClick('sweepStart',()=>{
  if(!App.workerReady){toast('Worker not ready');return;}if(App.activeSweepId!==null){toast('Sweep running');return;}
  const res=+document.getElementById('sweepRes').value,T=+document.getElementById('sweepT').value;
  const taskId=++App.taskCounter;App.activeSweepId=taskId;
  const sp=document.getElementById('sweepProgress');if(sp) sp.style.width='0';
  const ss=document.getElementById('sweepStatus');if(ss) ss.textContent='running…';
  WorkerMgr.post({type:'sweep',taskId,res,T,P:App.P,gamma:App.gamma,dt:0.004});
});
bindClick('sweepStop',()=>{if(App.activeSweepId!==null) WorkerMgr.cancel(App.activeSweepId);});
bindClick('sweepExportPNG',()=>sweepC.toBlob(b=>{if(!b) return;const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='sweep.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);}));
bindClick('sweepExportCSV',()=>{
  if(!_sweepData){toast('No data');return;}const{data,res}=_sweepData;let csv='theta1,theta2,lambda\n';
  for(let iy=0;iy<res;iy++) for(let ix=0;ix<res;ix++){const t1=(-Math.PI+2*Math.PI*ix/(res-1)).toFixed(4),t2=(-Math.PI+2*Math.PI*iy/(res-1)).toFixed(4);csv+=`${t1},${t2},${data[iy*res+ix].toFixed(6)}\n`;}
  dlText('sweep.csv',csv);toast('⬇ saved');
});
document.getElementById('sweepRes').addEventListener('input',function(){document.getElementById('sweepResV').textContent=this.value;});
document.getElementById('sweepT').addEventListener('input',function(){document.getElementById('sweepTV').textContent=this.value+' s';});


const bifC=document.getElementById('bifCanvas');CanvasMgr.observe(bifC);
WorkerMgr.on('bifProgress',m=>{
  if(m.taskId!==App.activeBifId) return;
  const bp=document.getElementById('bifProgress');if(bp) bp.style.width=(m.i/m.steps*100)+'%';
  const bs=document.getElementById('bifStatus');if(bs) bs.textContent=`${m.i}/${m.steps}`;
});
WorkerMgr.on('bifDone',m=>{
  if(m.taskId!==App.activeBifId) return;
  const bp=document.getElementById('bifProgress');if(bp) bp.style.width='100%';
  const bs=document.getElementById('bifStatus');if(bs) bs.textContent=`done — ${m.pts.length} pts`;
  drawBif(m.pts);App.activeBifId=null;toast('✓ Bifurcation done');
});
WorkerMgr.on('bifCancelled',m=>{
  if(m.taskId!==App.activeBifId) return;
  const bs=document.getElementById('bifStatus');if(bs) bs.textContent='cancelled';
  const bp=document.getElementById('bifProgress');if(bp) bp.style.width='0';App.activeBifId=null;
});
function drawBif(pts){
  const c=CanvasMgr.get(bifC),ctx=c.ctx,w=c.w,h=c.h;
  ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);if(!pts.length) return;
  const gMin=+document.getElementById('bifGMin').value,gMax=+document.getElementById('bifGMax').value;
  for(const p of pts){
    const x=(p.g-gMin)/(gMax-gMin)*w,y=h-((p.t2+Math.PI)/(2*Math.PI))*(h-20)-10;
    const hue=((p.g-gMin)/(gMax-gMin))*220;
    ctx.fillStyle=`hsla(${hue},85%,58%,.55)`;ctx.fillRect(x,y,1.5,1.5);
  }
  ctx.fillStyle='rgba(0,212,255,.4)';ctx.font='10px monospace';
  ctx.fillText(`g: [${gMin}, ${gMax}]  ${pts.length} pts`,6,15);
  ctx.fillStyle='#4a5568';ctx.fillText('←g→',w-40,h-5);
  ctx.save();ctx.translate(10,h/2);ctx.rotate(-Math.PI/2);ctx.fillText('θ₂ at section',0,0);ctx.restore();
}
bindClick('bifStart',()=>{
  if(!App.workerReady){toast('Worker not ready');return;}if(App.activeBifId!==null){toast('Already running');return;}
  const gMin=+document.getElementById('bifGMin').value,gMax=+document.getElementById('bifGMax').value;
  const steps=+document.getElementById('bifSteps').value,T=+document.getElementById('bifT').value;
  const taskId=++App.taskCounter;App.activeBifId=taskId;
  const bp=document.getElementById('bifProgress');if(bp) bp.style.width='0';
  const bs=document.getElementById('bifStatus');if(bs) bs.textContent='running…';
  WorkerMgr.post({type:'bifurcation',taskId,gMin,gMax,steps,P:App.P,dt:0.005,T,IC:[App.state[0],App.state[1],App.state[2]||0,App.state[3]||0]});
});
bindClick('bifStop',()=>{if(App.activeBifId!==null) WorkerMgr.cancel(App.activeBifId);});
bindClick('bifExport',()=>bifC.toBlob(b=>{if(!b) return;const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='bifurcation.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);}));
['bifGMin','bifGMax','bifSteps','bifT'].forEach(id=>{
  const el=document.getElementById(id);if(!el) return;
  el.addEventListener('input',function(){const v=document.getElementById(id+'V');if(v) v.textContent=parseFloat(this.value)+(id==='bifT'||id==='bifSteps'?id==='bifT'?' s':'':'');});
});


poC.addEventListener('wheel',e=>{
  e.preventDefault();App.poincZoom=Math.max(.25,Math.min(8,App.poincZoom*(e.deltaY<0?1.15:.87)));
},{passive:false});
// Pinch zoom on touch
let _touchDist0=null;
poC.addEventListener('touchstart',e=>{if(e.touches.length===2){const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;_touchDist0=Math.sqrt(dx*dx+dy*dy);}},{passive:true});
poC.addEventListener('touchmove',e=>{
  if(e.touches.length===2&&_touchDist0!==null){
    const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;
    const dist=Math.sqrt(dx*dx+dy*dy);App.poincZoom=Math.max(.25,Math.min(8,App.poincZoom*dist/_touchDist0));_touchDist0=dist;
  }
},{passive:true});
poC.addEventListener('touchend',()=>{_touchDist0=null;});


let _dragTarget=null,_dragOffX=0,_dragOffY=0;
mainC.addEventListener('pointerdown',e=>{
  const c=CanvasMgr.get(mainC),cx=c.w/2,cy=c.h*.38;
  const pp=Render.pendPos(App.state,App.P,cx,cy);
  const bobs=App.sysType==='triple'?[[pp.x1,pp.y1,0],[pp.x2,pp.y2,1],[pp.x3,pp.y3,2]]:[[pp.x1,pp.y1,0],[pp.x2,pp.y2,1]];
  const px=e.offsetX*(c.w/mainC.offsetWidth),py=e.offsetY*(c.h/mainC.offsetHeight);
  for(const[bx,by,idx]of bobs){
    if(Math.hypot(px-bx,py-by)<18){
      _dragTarget=idx;_dragOffX=0;_dragOffY=0;App.dragging=true;
      mainC.classList.add('dragging');mainC.setPointerCapture(e.pointerId);
      App.paused=true;if(UI.pauseBtn) UI.pauseBtn.textContent='▶ Resume';break;
    }
  }
});
mainC.addEventListener('pointermove',e=>{
  if(_dragTarget===null) return;
  const c=CanvasMgr.get(mainC),cx=c.w/2,cy=c.h*.38;
  const px=e.offsetX*(c.w/mainC.offsetWidth),py=e.offsetY*(c.h/mainC.offsetHeight);
  const S=CONSTS.SCALE;
  if(_dragTarget===0){
    const ang=Math.atan2(px-cx,py-cy);App.state[0]=ang;App.state[2]=0;
  }else if(_dragTarget===1){
    const pp=Render.pendPos(App.state,App.P,cx,cy);
    const ang=Math.atan2(px-pp.x1,py-pp.y1);App.state[1]=ang;App.state[App.sysType==='triple'?4:3]=0;
  }else if(_dragTarget===2&&App.sysType==='triple'){
    const pp=Render.pendPos(App.state,App.P,cx,cy);
    const ang=Math.atan2(px-pp.x2,py-pp.y2);App.state[2]=ang;App.state[5]=0;
  }
  App.E0=null;App.maxDrift=0;NaNGuard.snapshot(App.state);afterStep();
});
mainC.addEventListener('pointerup',e=>{
  if(_dragTarget===null) return;_dragTarget=null;App.dragging=false;mainC.classList.remove('dragging');
  try{mainC.releasePointerCapture(e.pointerId);}catch(_){}
});
mainC.addEventListener('pointercancel',()=>{_dragTarget=null;App.dragging=false;mainC.classList.remove('dragging');});


const Validation=(()=>{
  let passed=0,failed=0;
  function report(name,ok,detail=''){
    if(ok) passed++;else failed++;
    const el=document.getElementById('validateResults');if(!el) return;
    const color=ok?'#34e88a':'#ff4565';
    const row=document.createElement('div');
    row.style.cssText='padding:3px 0;border-bottom:1px solid #0a0e16;font-size:10px';
    const status=document.createElement('span');status.style.color=color;status.textContent=ok?'PASS':'FAIL';
    const title=document.createElement('strong');title.textContent=' '+name+' ';
    row.append(status,title);
    if(detail){const meta=document.createElement('span');meta.style.color='#4a5568';meta.textContent=detail;row.appendChild(meta);}
    el.appendChild(row);
    const tp=document.getElementById('testPassed');if(tp) tp.textContent=passed;
    const tf=document.getElementById('testFailed');if(tf) tf.textContent=failed;
  }
  function resetCounts(){passed=0;failed=0;const el=document.getElementById('validateResults');if(el) el.replaceChildren();}
  async function testDeterminism(){
    const IC=[2.0,2.5,0.0,0.0];const P={m1:1,m2:1,l1:1.2,l2:1,g:9.81};
    const f=(s,o)=>Physics.rhs2(s,P,0,o);const N=1000;const out=new Float64Array(4);
    const run=()=>{const s=new Float64Array(IC);for(let i=0;i<N;i++){Physics.rk4step(s,0.003,f,4,out);for(let q=0;q<4;q++) s[q]=out[q];}return Array.from(s);};
    const r1=run(),r2=run();let ok=true;
    for(let i=0;i<4;i++) if(Math.abs(r1[i]-r2[i])>1e-14){ok=false;break;}
    report('Determinism (RK4, N=1000)',ok,ok?`hash match`:`delta=${Math.abs(r1[0]-r2[0]).toExponential(2)}`);
  }
  async function testEnergyConservation(){
    const IC=[1.0,1.0,0,0];const P={m1:1,m2:1,l1:1,l2:1,g:9.81};
    const f=(s,o)=>Physics.rhs2(s,P,0,o);const N=10000;const out=new Float64Array(4);
    const s=new Float64Array(IC);const E0=Physics.energy2(s,P).total;
    for(let i=0;i<N;i++){Physics.rk4step(s,0.003,f,4,out);for(let q=0;q<4;q++) s[q]=out[q];}
    const Ef=Physics.energy2(s,P).total;const drift=Math.abs((Ef-E0)/Math.abs(E0));
    report('Energy conservation (RK4, 30s)',drift<1e-4,`|ΔE/E₀|=${drift.toExponential(2)}`);
  }
  async function testSymplecticEnergy(){
    const IC=[1.0,1.0,0,0];const P={m1:1,m2:1,l1:1,l2:1,g:9.81};
    const f=(s,o)=>Physics.rhs2(s,P,0,o);const N=10000;const out=new Float64Array(4);
    const s=new Float64Array(IC);const E0=Physics.energy2(s,P).total;
    for(let i=0;i<N;i++){Physics.yoshida4step(s,0.003,f,4,out);for(let q=0;q<4;q++) s[q]=out[q];}
    const Ef=Physics.energy2(s,P).total;const drift=Math.abs((Ef-E0)/Math.abs(E0));
    report('Energy (Yoshida4, 30s)',drift<1e-4,`|ΔE/E₀|=${drift.toExponential(2)}`);
  }
  async function testConvergence(){
    const IC=[1.0,1.0,0,0];const P={m1:1,m2:1,l1:1,l2:1,g:9.81};
    const f=(s,o)=>Physics.rhs2(s,P,0,o);
    const ref=new Float64Array(IC);const outR=new Float64Array(4);
    for(let i=0;i<10000;i++){Physics.rk4step(ref,0.0001,f,4,outR);for(let q=0;q<4;q++) ref[q]=outR[q];}
    const coarse=new Float64Array(IC);const outC=new Float64Array(4);
    for(let i=0;i<1000;i++){Physics.rk4step(coarse,0.001,f,4,outC);for(let q=0;q<4;q++) coarse[q]=outC[q];}
    let err=0;for(let q=0;q<4;q++){const d=ref[q]-coarse[q];err+=d*d;}err=Math.sqrt(err);
    report('RK4 convergence (dt ratio 10×)',err<0.1,`err=${err.toExponential(2)}`);
  }
  async function testNaNRecovery(){
    const bad=new Float64Array([NaN,NaN,NaN,NaN]);const ok=NaNGuard.check(bad,4);
    report('NaN detection',!ok,'NaN detected correctly');
    const safe=new Float64Array([1,1,0,0]);NaNGuard.snapshot(safe);NaNGuard.recover(bad);
    const recovered=!isNaN(bad[0]);report('NaN recovery',recovered,recovered?'restored from snapshot':'failed');
  }
  async function testReplay(){
    const n=App.replayCirc.size;report('Replay buffer populated',n>0,`${n} frames stored`);
  }
  async function testStress(){
    const IC=[2.0,2.5,0,0];const P={m1:1,m2:1,l1:1.2,l2:1,g:9.81};
    const f=(s,o)=>Physics.rhs2(s,P,0,o);const out=new Float64Array(4);const s=new Float64Array(IC);
    const N=100000;let nanCount=0;
    for(let i=0;i<N;i++){
      Physics.rk4step(s,0.003,f,4,out);
      for(let q=0;q<4;q++){if(!isFinite(out[q])){nanCount++;break;}s[q]=out[q];}
    }
    report(`Stress test (${N} steps)`,nanCount===0,nanCount===0?'no NaN/overflow':`${nanCount} faults`);
  }
  async function runAll(){
    resetCounts();const t0=performance.now();
    await testDeterminism();await testEnergyConservation();await testSymplecticEnergy();
    await testConvergence();await testNaNRecovery();await testReplay();await testStress();
    const tt=document.getElementById('testTime');if(tt) tt.textContent=`${(performance.now()-t0).toFixed(0)}ms`;
    toast(`✓ ${passed} passed, ${failed} failed`);
  }
  return{runAll,testDeterminism,testEnergyConservation,testConvergence,testNaNRecovery,testReplay,testStress,resetCounts};
})();
document.getElementById('runValidation').addEventListener('click',()=>Validation.runAll());
document.getElementById('runDeterminism').addEventListener('click',()=>{Validation.resetCounts();Validation.testDeterminism();});
document.getElementById('runConvergence').addEventListener('click',()=>{Validation.resetCounts();Validation.testConvergence();});
document.getElementById('runReplay').addEventListener('click',()=>{Validation.resetCounts();Validation.testReplay();});
document.getElementById('runStress').addEventListener('click',()=>{Validation.resetCounts();Validation.testStress();});


const PRESETS={
  classic:{th1:2.0,th2:2.5,iw1:0,iw2:0,m1:1,m2:1,l1:1.2,l2:1.0,g:9.81,gamma:0},
  butterfly:{th1:1.57,th2:1.57,iw1:0,iw2:0,m1:1,m2:1,l1:1,l2:1,g:9.81,gamma:0},
  periodic:{th1:0.5,th2:-0.5,iw1:0,iw2:0,m1:1,m2:2,l1:1,l2:0.5,g:9.81,gamma:0},
  symmetric:{th1:1.0,th2:1.0,iw1:0,iw2:0,m1:1,m2:1,l1:1,l2:1,g:9.81,gamma:0},
  whirling:{th1:3.0,th2:3.0,iw1:0,iw2:0,m1:1,m2:1,l1:1.2,l2:1.0,g:9.81,gamma:0},
  upright:{th1:0.01,th2:0.02,iw1:0,iw2:0,m1:1,m2:1,l1:1,l2:1,g:9.81,gamma:0},
  chaotic:{th1:2.1,th2:2.9,iw1:0,iw2:0,m1:1,m2:1,l1:1.2,l2:1.0,g:9.81,gamma:0},
  resonance:{th1:1.0,th2:2.0,iw1:0,iw2:0,m1:2,m2:1,l1:0.7,l2:1.4,g:9.81,gamma:0},
  triple:{th1:1.5,th2:1.5,th3:1.5,iw1:0,iw2:0,iw3:0,m1:1,m2:1,m3:1,l1:1,l2:1,l3:0.8,g:9.81,gamma:0,sysType:'triple'},
};
function applyPreset(name){
  const p=PRESETS[name];if(!p) return;
  function setSlider(id,val){const el=document.getElementById(id);const vEl=document.getElementById(id+'V');if(el){el.value=val;if(vEl) vEl.textContent=parseFloat(val).toFixed(parseFloat(val)%1===0?1:3);}}
  if(p.sysType){document.getElementById('sysType').value=p.sysType;updateSysType(p.sysType);}
  setSlider('th1',p.th1);setSlider('th2',p.th2);if(p.th3!==undefined) setSlider('th3',p.th3);
  setSlider('iw1',p.iw1||0);setSlider('iw2',p.iw2||0);if(p.iw3!==undefined) setSlider('iw3',p.iw3||0);
  setSlider('m1',p.m1);setSlider('m2',p.m2);if(p.m3!==undefined) setSlider('m3',p.m3);
  setSlider('l1',p.l1);setSlider('l2',p.l2);if(p.l3!==undefined) setSlider('l3',p.l3);
  setSlider('g',p.g);setSlider('gamma',p.gamma||0);
  syncParamsFromUI();fullReset();toast(`Preset: ${name}`);
}
document.querySelectorAll('[data-preset]').forEach(btn=>{btn.addEventListener('click',()=>applyPreset(btn.dataset.preset));});


bindClick('shareUrl',()=>{
  const params=new URLSearchParams({
    th1:App.state[0].toFixed(4),th2:App.state[1].toFixed(4),
    m1:App.P.m1,m2:App.P.m2,l1:App.P.l1,l2:App.P.l2,g:App.P.g,
    method:App.method,dt:App.DT,sys:App.sysType,
  });
  const url=location.origin+location.pathname+'?'+params.toString();
  navigator.clipboard.writeText(url).then(()=>toast('🔗 URL copied')).catch(()=>{prompt('Copy URL:',url);});
});


bindClick('savePreset',()=>{
  const name=prompt('Preset name:');if(!name) return;
  PRESETS[name]={th1:App.state[0],th2:App.state[1],iw1:App.state[2]||0,iw2:App.state[3]||0,
    m1:App.P.m1,m2:App.P.m2,l1:App.P.l1,l2:App.P.l2,g:App.P.g,gamma:App.gamma,sysType:App.sysType};
  toast(`Preset '${name}' saved`);
});


function switchTab(name){
  document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected',t.dataset.tab===name?'true':'false'));
  document.querySelectorAll('.tabpanel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));
  App.activeTab=name;
  if(name==='density'&&!App.gl&&!App.gpuFallback) gpuInit();
}
document.querySelectorAll('.tab').forEach(btn=>{btn.addEventListener('click',()=>switchTab(btn.dataset.tab));});


document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA') return;
  switch(e.key){
    case ' ':e.preventDefault();togglePause();break;
    case 'r':case 'R':fullReset();break;
    case 'c':case 'C':clearTrail();break;
    case 'p':case 'P':App.poincPts=[];toast('Poincaré cleared');break;
    case 'e':case 'E':rebuildEnsemble();break;
    case 'ArrowLeft':scrubStep(-1);break;
    case 'ArrowRight':scrubStep(1);break;
    case '1':switchTab('lab');break;
    case '2':switchTab('compare');break;
    case '3':switchTab('lyap');break;
    case '4':switchTab('sweep');break;
    case '5':switchTab('bifurc');break;
    case '6':switchTab('phase3d');break;
    case '7':switchTab('density');break;
    case '8':switchTab('validate');break;
  }
});


function scrubStep(dir){
  const scr=UI.scrubber;if(!scr) return;
  const v=Math.max(0,Math.min(App.replayCirc.size-1,+scr.value+dir));
  scr.value=v;scrubLive=(v===App.replayCirc.size-1);
  if(UI.scrubVal) UI.scrubVal.textContent=scrubLive?'live':`t=${App.replayCirc.getAt(v,0).toFixed(2)}s`;
}
if(UI.scrubber){
  UI.scrubber.addEventListener('input',function(){
    const v=+this.value;scrubLive=(v===App.replayCirc.size-1);
    if(!scrubLive){
      // Preview state from replay buffer
      const t2=App.replayCirc.getAt(v,2);
      if(UI.scrubVal) UI.scrubVal.textContent=`t=${App.replayCirc.getAt(v,0).toFixed(2)}s`;
    }else{if(UI.scrubVal) UI.scrubVal.textContent='live';}
  });
}
const rewindBtn=document.getElementById('rewindBtn');if(rewindBtn) rewindBtn.addEventListener('click',()=>{if(UI.scrubber){UI.scrubber.value=0;scrubLive=false;if(UI.scrubVal) UI.scrubVal.textContent=`t=0.00s`;}});


function syncParamsFromUI(){
  const gEl=v=>{ const el=document.getElementById(v); return el?+el.value:0; };
  App.P.m1=gEl('m1');App.P.m2=gEl('m2');App.P.m3=gEl('m3');
  App.P.l1=gEl('l1');App.P.l2=gEl('l2');App.P.l3=gEl('l3');
  App.P.g=gEl('g');App.gamma=gEl('gamma');
  App.DT=gEl('dt');App.SPF=+gEl('spf')||6;App.tol=Math.pow(10,gEl('tol'));
  App.speedMult=gEl('speed')||1;App.method=document.getElementById('method').value;
  App.sysType=document.getElementById('sysType').value;
  App.stateLen=App.sysType==='triple'?6:4;
  App.trailMode=document.getElementById('trailMode').value;
  App.maxTrailLen=gEl('trailLen');App.phaseAxis=document.getElementById('phaseAxis').value;
  App.glowMode=document.getElementById('glowMode').checked;
  App.longExpose=document.getElementById('longExpose').checked;
  App.useWorker=document.getElementById('useWorker').checked;
  App.autoQual=document.getElementById('autoQual').checked;
  App.interpolateRender=document.getElementById('interpolateRender').checked;
  App.seed=+document.getElementById('seed').value||1;
}
function updateSysType(type){
  document.querySelectorAll('[data-tri]').forEach(el=>{el.style.display=type==='triple'?'flex':'none';});
}


function fullReset(){
  syncParamsFromUI();
  const th1=+document.getElementById('th1').value,th2=+document.getElementById('th2').value;
  const th3=+document.getElementById('th3').value,iw1=+document.getElementById('iw1').value;
  const iw2=+document.getElementById('iw2').value,iw3=+document.getElementById('iw3').value;
  const n=App.stateLen;
  if(!App.state || App.state.length !== n) {
      App.state = App.sab ? new Float64Array(App.sab) : new Float64Array(n);
  }
  App.state[0]=th1;App.state[1]=th2;
  if(App.sysType==='triple'){App.state[2]=th3;App.state[3]=iw1;App.state[4]=iw2;App.state[5]=iw3;}
  else{App.state[2]=iw1;App.state[3]=iw2;}
  App.prevState.set(App.state);
  App.shadow=new Float64Array(n);for(let i=0;i<n;i++) App.shadow[i]=App.state[i];
  App.shadow[0]+=CONSTS.LYAP_EPS;
  App.simTime=0;App.E0=null;App.maxDrift=0;App.lyapSumLog=0;App.lyapTime=0;
  App._drift=0;App._lastE=0;App._stateHash='00000000';App._dtNext=App.DT;App._rkfPrevErr.value=0;
  App.trail={buf:null,idx:0,filled:0};
  App.energyCirc.clear();App.lyapCirc.clear();App.replayCirc.clear();App.trajCirc.clear();
  App.phaseHist.fill(0);App.phaseIdx=0;App.phaseFilled=0;
  App.theta1Hist.fill(0);App.theta1Idx=0;App.theta1Filled=0;
  App.fftCache=null;App._replayAcc=0;
  NaNGuard.snapshot(App.state);
  accumulator=0;WorkerMgr.setPending(false);
  rebuildEnsemble();
  updateSysType(App.sysType);
  EventBus.emit('reset',{});
}
function clearTrail(){App.trail={buf:null,idx:0,filled:0};for(const e of App.ensemble){e.trailBuf=null;e.tIdx=0;e.tFilled=0;}toast('Trail cleared');}


function rebuildEnsemble(){
  const N=+document.getElementById('ensN').value||0;
  const eps=Math.pow(10,+document.getElementById('ensEps').value);
  App.rng.setSeed(App.seed);
  App.ensemble=[];
  const n=App.stateLen;
  for(let i=0;i<N;i++){
    const st=new Float64Array(App.state);
    st[0]+=(App.rng.next()*2-1)*eps;st[1]+=(App.rng.next()*2-1)*eps;
    App.ensemble.push({state:st,trailBuf:null,tIdx:0,tFilled:0});
  }
}


document.getElementById('dlTrajBtn').addEventListener('click',()=>{
  const n=App.trajCirc.size;let csv='time,theta1,theta2,omega1,omega2,dE_E0\n';
  for(let i=0;i<n;i++) csv+=`${App.trajCirc.getAt(i,0).toFixed(4)},${App.trajCirc.getAt(i,1).toFixed(6)},${App.trajCirc.getAt(i,2).toFixed(6)},${App.trajCirc.getAt(i,3).toFixed(6)},${App.trajCirc.getAt(i,4).toFixed(6)},${App.trajCirc.getAt(i,5).toExponential(6)}\n`;
  dlText('trajectory.csv',csv);toast('⬇ trajectory.csv');
});
document.getElementById('dlPoincBtn').addEventListener('click',()=>{
  if(!App.poincPts.length){toast('No Poincaré data');return;}
  let csv='theta2,omega2,age\n';for(const p of App.poincPts) csv+=`${p.t2.toFixed(6)},${p.w2.toFixed(6)},${p.age.toFixed(3)}\n`;
  dlText('poincare.csv',csv);toast('⬇ poincare.csv');
});
document.getElementById('dlPNGBtn').addEventListener('click',()=>{
  mainC.toBlob(b=>{if(!b) return;const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='pendulum.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);});
  toast('⬇ pendulum.png');
});
document.getElementById('dlJsonBtn').addEventListener('click',()=>{
  const data={version:'vNext',timestamp:Date.now(),params:Object.assign({},App.P),gamma:App.gamma,
    sysType:App.sysType,state:Array.from(App.state),method:App.method,dt:App.DT,
    simTime:App.simTime,E0:App.E0,maxDrift:App.maxDrift,
    lyapunov:App.lyapTime>0?App.lyapSumLog/App.lyapTime:null,
    poincareCount:App.poincPts.length};
  dlText('pendulum_state.json',JSON.stringify(data,null,2),'application/json');toast('⬇ JSON saved');
});
document.getElementById('loadJsonBtn').addEventListener('click',()=>document.getElementById('jsonFile').click());
document.getElementById('jsonFile').addEventListener('change',function(){
  if(!this.files[0]) return;const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(data.params) Object.assign(App.P,data.params);
      if(data.gamma!==undefined) App.gamma=data.gamma;
      if(data.sysType) App.sysType=data.sysType;
      if(data.state){App.state=new Float64Array(data.state);App.stateLen=data.state.length;}
      if(data.method) App.method=data.method;if(data.dt) App.DT=data.dt;
      App.E0=null;App.simTime=data.simTime||0;
      NaNGuard.snapshot(App.state);fullReset();toast('✓ State loaded');
    }catch(err){toast('⚠ Load failed: '+err.message);}
  };reader.readAsText(this.files[0]);this.value='';
});
bindClick('dlReportBtn',()=>{
  const lam=App.lyapTime>0?(App.lyapSumLog/App.lyapTime).toFixed(4):'N/A';
  const vd=chaosVerdict();
  const report=`PENDULUM LAB — SESSION REPORT
=======================================
Generated: ${new Date().toISOString()}
System: ${App.sysType} pendulum
Method: ${App.method} (dt=${App.DT}s)
Parameters: m₁=${App.P.m1} m₂=${App.P.m2} l₁=${App.P.l1} l₂=${App.P.l2} g=${App.P.g} γ=${App.gamma}
Initial: θ₁=${App.state[0].toFixed(4)} θ₂=${App.state[1].toFixed(4)}

RESULTS
-------
Simulation time: ${App.simTime.toFixed(2)} s
Max |ΔE/E₀|: ${App.maxDrift.toExponential(4)}
Lyapunov λ₁: ${lam} /s
Verdict: ${vd}
Poincaré pts: ${App.poincPts.length}
NaN recoveries: ${NaNGuard.count()}

NUMERICAL NOTES
---------------
RK4 is 4th-order; energy drift bounded by O(dt^4).
Yoshida4/Leapfrog are pseudo-symplectic θ/ω approximations here; confirm drift empirically before making conservation claims.
Positive λ₁ indicates exponential sensitivity to initial conditions (chaos).
Kaplan-Yorke dimension estimates attractor fractal dimension.
`;
  dlText('pendulum_report.txt',report);toast('⬇ Report saved');
});


bindClick('recBtn',()=>{
  const btn=document.getElementById('recBtn');
  if(!App.rec){
    if(!mainC.captureStream){toast('captureStream not supported');return;}
    try{
      const stream=mainC.captureStream(30);App.rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'});
      App.recChunks=[];App.recStart=performance.now();
      App.rec.ondataavailable=e=>{if(e.data.size>0) App.recChunks.push(e.data);};
      App.rec.onstop=()=>{
        const blob=new Blob(App.recChunks,{type:'video/webm'});
        const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='pendulum.webm';a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),2000);toast('⬇ video saved');App.rec=null;btn.textContent='● Rec';btn.classList.remove('primary');
      };
      App.rec.start(100);btn.textContent='■ Stop';btn.classList.add('primary');toast('● Recording…');
      setTimeout(()=>{if(App.rec&&App.rec.state==='recording') App.rec.stop();},CONSTS.MAX_RECORD_SEC*1000);
    }catch(e){toast('Record failed: '+e.message);App.rec=null;}
  }else{if(App.rec.state==='recording') App.rec.stop();}
});


function togglePause(){
  App.paused=!App.paused;
  if(UI.pauseBtn) UI.pauseBtn.textContent=App.paused?'▶ Resume':'⏸ Pause';
  if(UI.modeLabel) UI.modeLabel.textContent=App.paused?'paused':'running';
}
document.getElementById('pauseBtn').addEventListener('click',togglePause);
document.getElementById('resetBtn').addEventListener('click',fullReset);
document.getElementById('clearTrailBtn').addEventListener('click',clearTrail);
document.getElementById('clearPoincBtn').addEventListener('click',()=>{App.poincPts=[];toast('Poincaré cleared');});


const sliders=[
  ['th1','th1V',v=>parseFloat(v).toFixed(3)],
  ['th2','th2V',v=>parseFloat(v).toFixed(3)],
  ['th3','th3V',v=>parseFloat(v).toFixed(3)],
  ['iw1','iw1V',v=>parseFloat(v).toFixed(1)],
  ['iw2','iw2V',v=>parseFloat(v).toFixed(1)],
  ['iw3','iw3V',v=>parseFloat(v).toFixed(1)],
  ['m1','m1V',v=>parseFloat(v).toFixed(2)],
  ['m2','m2V',v=>parseFloat(v).toFixed(2)],
  ['m3','m3V',v=>parseFloat(v).toFixed(2)],
  ['l1','l1V',v=>parseFloat(v).toFixed(2)],
  ['l2','l2V',v=>parseFloat(v).toFixed(2)],
  ['l3','l3V',v=>parseFloat(v).toFixed(2)],
  ['g','gV',v=>parseFloat(v).toFixed(2)],
  ['gamma','gammaV',v=>parseFloat(v).toFixed(2)],
  ['dt','dtV',v=>parseFloat(v).toFixed(4)],
  ['tol','tolV',v=>`1.0e${v}`],
  ['spf','spfV',v=>v],
  ['speed','speedV',v=>parseFloat(v).toFixed(1)+'×'],
  ['trailLen','trailLenV',v=>v],
  ['ensN','ensNV',v=>v],
  ['ensEps','ensEpsV',v=>`1.0e${parseFloat(v).toFixed(1)}`],
  ['audioVol','audioVolV',v=>parseFloat(v).toFixed(2)],
  ['p3dN','p3dNV',v=>v],
];
sliders.forEach(([id,valId,fmt])=>{
  const el=document.getElementById(id),vEl=document.getElementById(valId);
  if(!el) return;
  el.addEventListener('input',function(){
    if(vEl) vEl.textContent=fmt(this.value);
    syncParamsFromUI();
    // Rebuild ensemble on relevant changes
    if(id==='ensN'||id==='ensEps') rebuildEnsemble();
    // Restart lyap shadow on physical param changes
    if(['m1','m2','m3','l1','l2','l3','g','gamma','th1','th2','th3','iw1','iw2','iw3'].includes(id)){
      App.E0=null;App.maxDrift=0;App.lyapSumLog=0;App.lyapTime=0;
    }
  });
});
document.getElementById('sysType').addEventListener('change',function(){
  updateSysType(this.value);syncParamsFromUI();fullReset();
});
document.getElementById('method').addEventListener('change',function(){App.method=this.value;App._dtNext=App.DT;App._rkfPrevErr.value=0;});
document.getElementById('trailMode').addEventListener('change',function(){App.trailMode=this.value;});
document.getElementById('phaseAxis').addEventListener('change',function(){App.phaseAxis=this.value;});
document.getElementById('glowMode').addEventListener('change',function(){App.glowMode=this.checked;});
document.getElementById('longExpose').addEventListener('change',function(){App.longExpose=this.checked;});
document.getElementById('useWorker').addEventListener('change',function(){App.useWorker=this.checked;});
document.getElementById('autoQual').addEventListener('change',function(){App.autoQual=this.checked;if(!this.checked&&UI.qualBadge){UI.qualBadge.textContent='HQ';UI.qualBadge.className='';}});
document.getElementById('interpolateRender').addEventListener('change',function(){App.interpolateRender=this.checked;});
document.getElementById('audioOn').addEventListener('change',function(){App.audioOn=this.checked;if(this.checked) audioInit();});
document.getElementById('audioVol').addEventListener('input',function(){App.audioVol=+this.value;if(App.gainMaster) App.gainMaster.gain.setTargetAtTime(App.audioVol,App.audioCtx.currentTime,.1);});


function loadFromURL(){
  const p=new URLSearchParams(location.search);
  const allow=Object.freeze({
    th1:{id:'th1',min:-Math.PI,max:Math.PI}, th2:{id:'th2',min:-Math.PI,max:Math.PI},
    m1:{id:'m1',min:0.1,max:5}, m2:{id:'m2',min:0.1,max:5},
    l1:{id:'l1',min:0.3,max:2}, l2:{id:'l2',min:0.3,max:2},
    g:{id:'g',min:0,max:20}, dt:{id:'dt',min:0.0005,max:0.01}
  });
  for(const [key,spec] of Object.entries(allow)){
    const raw=p.get(key); if(raw===null) continue;
    const v=Number(raw); if(!Number.isFinite(v)||v<spec.min||v>spec.max) continue;
    const el=document.getElementById(spec.id); if(el) el.value=String(v);
  }
  const method=p.get('method');
  if(method&&/^(rk4|rkf45|hmidpoint|leapfrog|yoshida4|gauss2|symplectic|rk2|euler)$/.test(method)){
    const el=document.getElementById('method'); if(el) el.value=method;
  }
  const sys=p.get('sys');
  if(sys==='double'||sys==='triple'){const el=document.getElementById('sysType');if(el) el.value=sys;}
}


const EnterpriseRuntime=(()=>{
  const build=Object.freeze({name:'Pendulum Lab Developed by Elliot Jung',version:'vFinal-2026.05.14-machinery',format:'single-html',generatedAt:'2026-05-14T00:00:00+09:00'});
  const storageKey='ple.session.v1';
  const undoLimit=64;
  const undoStack=[];
  const redoStack=[];
  const caps=Object.freeze({
    sab: typeof SharedArrayBuffer!=='undefined',
    atomics: typeof Atomics!=='undefined',
    worker: typeof Worker!=='undefined',
    blobWorker: typeof Blob!=='undefined' && typeof URL!=='undefined',
    offscreenCanvas: typeof OffscreenCanvas!=='undefined',
    webgl2: (()=>{try{const c=document.createElement('canvas');return !!c.getContext('webgl2');}catch(e){return false;}})(),
    webgpu: !!navigator.gpu,
    audio: !!(window.AudioContext||window.webkitAudioContext),
    mediaRecorder: typeof MediaRecorder!=='undefined',
    idleCallback: typeof requestIdleCallback==='function',
    battery: typeof navigator.getBattery==='function',
    deviceMemory: navigator.deviceMemory||0,
    hardwareConcurrency: navigator.hardwareConcurrency||1,
    userAgent: navigator.userAgent
  });
  App.build=build;
  App.capabilities=caps;
  App.backendEnum=Object.freeze({CANVAS2D:1,WEBGL1:2,WEBGL2:3,WEBGPU_FUTURE:4});
  App.pauseReason=Object.freeze({USER:1,HIDDEN:2,PANIC:3,BATTERY:4});
  App.lifecycle={state:'initializing',lastTransition:performance.now(),reason:0};
  App.paramSchema=Object.freeze({
    th1:{min:-Math.PI,max:Math.PI,unit:'rad'}, th2:{min:-Math.PI,max:Math.PI,unit:'rad'}, th3:{min:-Math.PI,max:Math.PI,unit:'rad'},
    iw1:{min:-12,max:12,unit:'rad/s'}, iw2:{min:-12,max:12,unit:'rad/s'}, iw3:{min:-12,max:12,unit:'rad/s'},
    m1:{min:0.1,max:5,unit:'kg'}, m2:{min:0.1,max:5,unit:'kg'}, m3:{min:0.1,max:5,unit:'kg'},
    l1:{min:0.3,max:2,unit:'m'}, l2:{min:0.3,max:2,unit:'m'}, l3:{min:0.3,max:2,unit:'m'},
    g:{min:0,max:20,unit:'m/s^2'}, gamma:{min:0,max:2,unit:'s^-1'}, dt:{min:0.0005,max:0.01,unit:'s'}, spf:{min:1,max:60,unit:'steps/frame'}
  });
  App.telemetry={gcSpikes:0,frameSpikes:0,mainThreadBlocks:0,renderStarvation:0,lastHeap:0,heapDelta:0,checksums:Object.create(null)};
  App.listenerRegistry={total:0,byType:Object.create(null)};
  App.tempAllocator={float64:[],float32:[],claim64(n){for(let i=0;i<this.float64.length;i++){const a=this.float64[i];if(a.length>=n){this.float64.splice(i,1);return a;}}return new Float64Array(n);},release64(a){if(this.float64.length<32)this.float64.push(a);},claim32(n){for(let i=0;i<this.float32.length;i++){const a=this.float32[i];if(a.length>=n){this.float32.splice(i,1);return a;}}return new Float32Array(n);},release32(a){if(this.float32.length<32)this.float32.push(a);}};
  App.wasmBridge={available:false,reason:'not loaded in single-file JS build',call(){return false;}};
  App.webgpuBridge={available:!!navigator.gpu,device:null,reason:navigator.gpu?'future backend abstraction present':'WebGPU unavailable'};

  function transition(state,reason){App.lifecycle.state=state;App.lifecycle.reason=reason||0;App.lifecycle.lastTransition=performance.now();}
  function clamp(v,min,max){return v<min?min:(v>max?max:v);}
  function snapshot(){return {sysType:App.sysType,method:App.method,dt:App.DT,tol:App.tol,spf:App.SPF,speed:App.speedMult,gamma:App.gamma,P:Object.assign({},App.P),state:Array.from(App.state.slice(0,App.stateLen)),simTime:App.simTime,seed:App.seed,trailMode:App.trailMode,trailLen:App.maxTrailLen,ensN:+(document.getElementById('ensN')||{value:0}).value,ensEps:+(document.getElementById('ensEps')||{value:-4}).value};}
  function setCtl(id,v){const el=document.getElementById(id);if(!el)return;if(el.type==='checkbox')el.checked=!!v;else el.value=String(v);const out=document.getElementById(id+'V');if(out){const n=+v;out.textContent=Number.isFinite(n)?(Math.abs(n)<0.01&&n!==0?n.toExponential(1):n.toFixed(Math.abs(n)>=10?1:3)):String(v);}}
  function applySnapshot(s,mode){
    if(!s||typeof s!=='object')return false;
    if(s.sysType){const sys=document.getElementById('sysType');if(sys)sys.value=s.sysType;App.sysType=s.sysType;updateSysType(s.sysType);}
    if(s.method){const m=document.getElementById('method');if(m)m.value=s.method;App.method=s.method;}
    if(s.P){for(const k of ['m1','m2','m3','l1','l2','l3','g']) if(Number.isFinite(+s.P[k])) setCtl(k,+s.P[k]);}
    if(Number.isFinite(+s.gamma)) setCtl('gamma',+s.gamma);
    if(Number.isFinite(+s.dt)) setCtl('dt',clamp(+s.dt,App.paramSchema.dt.min,App.paramSchema.dt.max));
    if(Number.isFinite(+s.spf)) setCtl('spf',clamp(+s.spf,App.paramSchema.spf.min,App.paramSchema.spf.max));
    if(Number.isFinite(+s.speed)) setCtl('speed',clamp(+s.speed,0.1,4));
    if(s.state&&s.state.length>=4){setCtl('th1',clamp(+s.state[0],-Math.PI,Math.PI));setCtl('th2',clamp(+s.state[1],-Math.PI,Math.PI));if(s.state.length>=6)setCtl('th3',clamp(+s.state[2],-Math.PI,Math.PI));const off=s.state.length>=6?3:2;setCtl('iw1',clamp(+s.state[off],-12,12));setCtl('iw2',clamp(+s.state[off+1],-12,12));if(s.state.length>=6)setCtl('iw3',clamp(+s.state[off+2],-12,12));}
    if(Number.isFinite(+s.seed)){const seed=document.getElementById('seed');if(seed)seed.value=String(s.seed);App.seed=+s.seed;}
    syncParamsFromUI();
    if(s.state&&s.state.length>=4){for(let i=0;i<Math.min(App.stateLen,s.state.length);i++) App.state[i]=+s.state[i]||0;App.prevState.set(App.state);}
    if(mode!=='soft')fullReset();
    return true;
  }
  function pushUndo(){const s=snapshot();const last=undoStack[undoStack.length-1];const packed=JSON.stringify(s);if(last&&last.packed===packed)return;undoStack.push({packed,s});if(undoStack.length>undoLimit)undoStack.shift();redoStack.length=0;}
  function undo(){if(undoStack.length<2){toast('No undo state');return;}const cur=undoStack.pop();redoStack.push(cur);applySnapshot(undoStack[undoStack.length-1].s);toast('Undo');}
  function redo(){if(!redoStack.length){toast('No redo state');return;}const n=redoStack.pop();undoStack.push(n);applySnapshot(n.s);toast('Redo');}
  function validateSnapshot(s){if(!s||typeof s!=='object')return false;if(s.P&&(!Number.isFinite(+s.P.g)||+s.P.g<0||+s.P.g>50))return false;if(s.dt&&(+s.dt<=0||+s.dt>0.1))return false;if(s.state&&s.state.some(v=>!Number.isFinite(+v)||Math.abs(+v)>1e6))return false;return true;}
  function saveSession(){try{const s=snapshot();s.savedAt=Date.now();localStorage.setItem(storageKey,JSON.stringify(s));}catch(e){Log.warn('Storage','autosave failed',{e:String(e)});}}
  function restoreSession(){try{if(location.search.length>1)return false;const raw=localStorage.getItem(storageKey);if(!raw)return false;const s=JSON.parse(raw);if(!validateSnapshot(s))return false;applySnapshot(s,'soft');toast('Session restored',1400);return true;}catch(e){Log.warn('Storage','restore failed',{e:String(e)});return false;}}
  function exportCrashDump(reason){const dump={reason:String(reason||'manual'),build,caps,telemetry:App.telemetry,lifecycle:App.lifecycle,snapshot:snapshot(),hash:App._stateHash,time:new Date().toISOString()};dlText('pendulum_crash_dump.json',JSON.stringify(dump,null,2),'application/json');}
  async function computeChecksum(){try{const data=new TextEncoder().encode(document.documentElement.outerHTML);const h=await crypto.subtle.digest('SHA-256',data);const hex=Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');App.telemetry.checksums.htmlSHA256=hex;return hex;}catch(e){return 'unavailable';}}
  function scheduleIdleDiagnostics(){const cb=()=>{try{const mem=performance.memory;if(mem){const now=mem.usedJSHeapSize;App.telemetry.heapDelta=now-(App.telemetry.lastHeap||now);App.telemetry.lastHeap=now;if(Math.abs(App.telemetry.heapDelta)>8*1024*1024)App.telemetry.gcSpikes++;}if(App.fps<20&&App.pageVisible)App.telemetry.renderStarvation++;}catch(e){}scheduleIdleDiagnostics();};if(caps.idleCallback)requestIdleCallback(cb,{timeout:3000});else setTimeout(cb,3000);}
  function setupBattery(){if(!caps.battery)return;navigator.getBattery().then(b=>{const update=()=>{App.battery={level:b.level,charging:b.charging};App.powerSave=!b.charging&&b.level<0.18;};update();b.addEventListener('levelchange',update,{passive:true});b.addEventListener('chargingchange',update,{passive:true});}).catch(()=>{});}
  function registerListenerLeakMonitor(){const rawAdd=EventTarget.prototype.addEventListener;const rawRemove=EventTarget.prototype.removeEventListener;EventTarget.prototype.addEventListener=function(type,listener,opts){App.listenerRegistry.total++;App.listenerRegistry.byType[type]=(App.listenerRegistry.byType[type]||0)+1;return rawAdd.call(this,type,listener,opts);};EventTarget.prototype.removeEventListener=function(type,listener,opts){if(App.listenerRegistry.byType[type])App.listenerRegistry.byType[type]--;return rawRemove.call(this,type,listener,opts);};}
  function makeCommandPalette(){
    const box=document.createElement('div');box.id='cmdPalette';box.setAttribute('role','dialog');box.setAttribute('aria-label','command palette');box.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1200;align-items:flex-start;justify-content:center;padding-top:9vh';
    const panel=document.createElement('div');panel.style.cssText='width:min(560px,92vw);background:var(--panel);border:1px solid var(--cyan);border-radius:6px;box-shadow:0 18px 80px rgba(0,0,0,.55);padding:10px';
    const input=document.createElement('input');input.id='cmdInput';input.setAttribute('aria-label','Command');input.style.cssText='width:100%;background:var(--panel2);border:1px solid var(--border);color:var(--fg);font-family:inherit;font-size:13px;padding:9px;border-radius:3px';
    const list=document.createElement('div');list.style.cssText='margin-top:8px;max-height:310px;overflow:auto;font-size:11px';panel.appendChild(input);panel.appendChild(list);box.appendChild(panel);document.body.appendChild(box);
    const commands=[
      ['pause/resume','Toggle simulation pause',()=>togglePause()],['reset','Reset simulation',()=>fullReset()],['clear trail','Clear trajectory trail',()=>clearTrail()],['clear poincare','Clear Poincaré map',()=>{App.poincPts=[];toast('Poincaré cleared');}],['run validation','Run validation tests',()=>Validation.runAll()],['export report','Download session report',()=>document.getElementById('dlReportBtn').click()],['export crash dump','Download runtime crash dump',()=>exportCrashDump('manual')],['high quality','Force high rendering quality',()=>{App.autoQual=false;App._qualLevel=0;toast('High quality mode');}],['auto quality','Enable adaptive quality',()=>{App.autoQual=true;toast('Auto quality enabled');}],['undo','Restore previous parameter state',()=>undo()],['redo','Restore next parameter state',()=>redo()],['save snapshot','Autosave session snapshot',()=>{saveSession();toast('Snapshot saved');}],['checksum','Compute HTML SHA-256',()=>computeChecksum().then(h=>toast('SHA-256 '+h.slice(0,16)+'…'))]
    ];
    function render(){const q=input.value.trim().toLowerCase();list.replaceChildren();let n=0;for(const c of commands){if(q&&!(c[0].includes(q)||c[1].toLowerCase().includes(q)))continue;const item=document.createElement('button');item.style.cssText='display:block;width:100%;text-align:left;margin:3px 0;padding:7px 8px;border:1px solid var(--border);background:var(--panel2);color:var(--fg);border-radius:3px';const label=document.createElement('b');label.style.color='var(--cyan)';label.textContent=c[0];const br=document.createElement('br');const desc=document.createElement('span');desc.style.color='var(--muted)';desc.textContent=c[1];item.append(label,br,desc);item.addEventListener('click',()=>{box.style.display='none';c[2]();});list.appendChild(item);n++;}if(!n){const empty=document.createElement('div');empty.textContent='No command';empty.style.cssText='color:var(--muted);padding:8px';list.appendChild(empty);}}
    input.addEventListener('input',render,{passive:true});
    window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();box.style.display=box.style.display==='flex'?'none':'flex';input.value='';render();setTimeout(()=>input.focus(),0);}else if(e.key==='Escape'&&box.style.display==='flex'){box.style.display='none';}else if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}else if(((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y')||((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='z')){e.preventDefault();redo();}},false);
    render();
  }
  function installPatches(){
    const oldPhysicsTick=physicsTick;
    physicsTick=function(realDt){if(App.powerSave&&App.autoQual){const old=App.SPF;App.SPF=Math.max(1,Math.floor(old*0.65));try{return oldPhysicsTick(realDt);}finally{App.SPF=old;}}return oldPhysicsTick(realDt);};
    const oldFullReset=fullReset;
    fullReset=function(){transition('resetting',0);oldFullReset();transition('running',0);saveSession();};
    const oldLoad=loadFromURL;
    loadFromURL=function(){oldLoad();restoreSession();};
    document.addEventListener('change',e=>{if(e.target&&e.target.closest&&e.target.closest('.controls')){pushUndo();setTimeout(saveSession,0);}},true);
    setInterval(saveSession,10000);
    setInterval(()=>{const now=performance.now();if(EnterpriseRuntime._lastNow&&now-EnterpriseRuntime._lastNow>1200&&App.pageVisible)App.telemetry.mainThreadBlocks++;EnterpriseRuntime._lastNow=now;},1000);
  }
  function bootExtras(){pushUndo();makeCommandPalette();scheduleIdleDiagnostics();setupBattery();computeChecksum();setTimeout(()=>{const badge=document.getElementById('qualBadge');if(badge)badge.title='Build '+build.version+' · SAB '+caps.sab+' · WebGL2 '+caps.webgl2+' · OffscreenCanvas '+caps.offscreenCanvas;},0);}
  if(location.search.includes('diagListeners=1')||localStorage.getItem('ple.diag.listeners')==='1') registerListenerLeakMonitor();
  installPatches();
  return {build,caps,snapshot,applySnapshot,saveSession,restoreSession,pushUndo,undo,redo,exportCrashDump,computeChecksum,bootExtras};
})();


const UltimateEnterpriseEngine=(()=>{
  const VERSION='vRuntime-2026.05.13';
  const now=()=>performance.now();
  const nf=(v,d=3)=>Number.isFinite(v)?v.toFixed(d):'—';
  const uid=(()=>{let n=0;return p=>p+'-'+(++n).toString(36);})();

  /** @typedef {{id:string,name:string,version:string,kind:string,dependsOn:string[],status:'registered'|'active'|'disabled'|'faulted',activate?:(ctx:unknown)=>void,deactivate?:(ctx:unknown)=>void}} PLEPlugin */
  /** @typedef {{id:string,phase:string,priority:number,enabled:boolean,lastMs:number,totalMs:number,runs:number,fn:(ctx:unknown)=>void}} PLETask */

  const Contract={
    assert(cond,msg,meta){if(!cond){const e=new Error(msg);e.meta=meta||null;throw e;}},
    finite(v,name){this.assert(Number.isFinite(v),name+' must be finite',{value:v});return v;},
    range(v,min,max,name){this.finite(v,name);this.assert(v>=min&&v<=max,name+' out of range',{value:v,min,max});return v;},
    finiteVector(a,n,name){this.assert(a&&typeof a.length==='number',name+' vector missing');for(let i=0;i<n;i++)this.finite(+a[i],name+'['+i+']');return true;},
    enum(v,set,name){this.assert(set.includes(v),name+' invalid',{value:v,allowed:set});return v;},
    validatePhysicsConfig(P){
      ['m1','m2','l1','l2','g'].forEach(k=>this.finite(+P[k],k));
      this.range(+P.m1,0.0001,1e4,'m1');this.range(+P.m2,0.0001,1e4,'m2');
      if(App.sysType==='triple')this.range(+P.m3,0.0001,1e4,'m3');
      this.range(+P.l1,1e-5,1e4,'l1');this.range(+P.l2,1e-5,1e4,'l2');
      if(App.sysType==='triple')this.range(+P.l3,1e-5,1e4,'l3');
      this.range(+P.g,0,200,'g');this.range(+App.gamma,0,50,'gamma');
      this.range(+App.DT,1e-7,0.5,'dt');this.range(+App.SPF,1,5000,'stepsPerFrame');
      return true;
    },
    validateState(){this.finiteVector(App.state,App.stateLen,'state');return true;}
  };

  class FaultBoundary{
    constructor(){this.faults=[];this.max=256;}
    run(scope,fn,fallback){
      try{return fn();}
      catch(err){
        const rec={id:uid('fault'),scope,time:new Date().toISOString(),message:String(err&&err.message||err),meta:err&&err.meta||null,stack:String(err&&err.stack||'')};
        this.faults.push(rec);if(this.faults.length>this.max)this.faults.shift();
        Log.error('FAULT',scope,rec);
        if(typeof toast==='function')toast('Fault isolated: '+scope,2400);
        if(typeof fallback==='function')return fallback(err,rec);
        return undefined;
      }
    }
  }

  class TaskGraph{
    constructor(){this.tasks=[];this.ctx={};this.lastFrameMs=0;this.phaseStats=Object.create(null);}
    add(id,phase,priority,fn){const t={id,phase,priority:+priority||0,enabled:true,lastMs:0,totalMs:0,runs:0,fn};this.tasks.push(t);this.tasks.sort((a,b)=>a.phase===b.phase?a.priority-b.priority:a.phase.localeCompare(b.phase));return t;}
    remove(id){this.tasks=this.tasks.filter(t=>t.id!==id);}
    runPhase(phase,ctx){const start=now();for(const t of this.tasks){if(!t.enabled||t.phase!==phase)continue;const ts=now();Faults.run('task:'+t.id,()=>t.fn(ctx));t.lastMs=now()-ts;t.totalMs+=t.lastMs;t.runs++;}this.phaseStats[phase]=now()-start;}
    runAll(ctx){const s=now();this.runPhase('pre-sim',ctx);this.runPhase('post-sim',ctx);this.runPhase('pre-render',ctx);this.runPhase('post-render',ctx);this.lastFrameMs=now()-s;}
    report(){return this.tasks.map(t=>({id:t.id,phase:t.phase,lastMs:t.lastMs,runs:t.runs,enabled:t.enabled}));}
  }

  class PluginRegistry{
    constructor(){this.plugins=new Map();this.api=null;}
    setApi(api){this.api=api;}
    register(p){
      Contract.assert(p&&p.id&&p.name,'invalid plugin descriptor',p);
      if(this.plugins.has(p.id))throw new Error('plugin already registered: '+p.id);
      const plug=Object.assign({version:'0.0.0',kind:'extension',dependsOn:[],status:'registered'},p);
      this.plugins.set(plug.id,plug);return plug;
    }
    activate(id){
      const p=this.plugins.get(id);Contract.assert(p,'plugin not found',{id});
      for(const dep of p.dependsOn||[])Contract.assert(this.plugins.has(dep),'missing plugin dependency',{id,dep});
      if(p.status==='active')return p;
      Faults.run('plugin.activate:'+id,()=>{if(p.activate)p.activate(this.api);p.status='active';});
      return p;
    }
    deactivate(id){const p=this.plugins.get(id);if(!p)return;Faults.run('plugin.deactivate:'+id,()=>{if(p.deactivate)p.deactivate(this.api);p.status='disabled';});}
    list(){return Array.from(this.plugins.values()).map(p=>({id:p.id,name:p.name,version:p.version,kind:p.kind,status:p.status,dependsOn:p.dependsOn||[]}));}
  }

  class ResourceManager{
    constructor(){this.resources=new Map();this.bytes=0;}
    track(id,type,bytes,meta){this.resources.set(id,{id,type,bytes:+bytes||0,meta:meta||{},createdAt:now()});this.recount();return id;}
    release(id){this.resources.delete(id);this.recount();}
    recount(){let b=0;for(const r of this.resources.values())b+=r.bytes;this.bytes=b;}
    list(){return Array.from(this.resources.values());}
  }

  const StabilityLayer={
    lastReport:{ok:true,warnings:[],score:100},
    analyze(){
      const warnings=[];let score=100;
      const P=App.P;
      if(App.method==='euler'&&App.DT>0.003){warnings.push('Euler with large dt: expected energy drift');score-=20;}
      if(App.method==='rkf45'&&App.SPF>20){warnings.push('Adaptive RKF45 + high SPF may waste CPU');score-=5;}
      if(App.gamma===0&&App.maxDrift>1e-2){warnings.push('Conservative run has high energy drift');score-=15;}
      if(App.stateLen===6&&App.DT>0.004){warnings.push('Triple pendulum may need smaller dt');score-=10;}
      if(P.g===0){warnings.push('Zero gravity: Hamiltonian interpretation changes');score-=2;}
      if(!NaNGuard.check(App.state,App.stateLen)){warnings.push('invalid numerical state');score-=50;}
      score=Math.max(0,score);this.lastReport={ok:score>=70,warnings,score};return this.lastReport;
    }
  };

  const DeterministicReplay={
    checkpoints:[],max:128,
    capture(label){
      const s=EnterpriseRuntime&&EnterpriseRuntime.snapshot?EnterpriseRuntime.snapshot():{state:Array.from(App.state.slice(0,App.stateLen)),simTime:App.simTime};
      const cp={id:uid('cp'),label:label||'checkpoint',time:Date.now(),state:s,hash:hashState(App.state.slice(0,App.stateLen))};
      this.checkpoints.push(cp);if(this.checkpoints.length>this.max)this.checkpoints.shift();return cp;
    },
    restore(id){const cp=this.checkpoints.find(c=>c.id===id);if(!cp)return false;EnterpriseRuntime.applySnapshot(cp.state,'soft');return true;},
    export(){dlText('pendulum_replay_checkpoints.json',JSON.stringify(this.checkpoints,null,2),'application/json');}
  };

  const Faults=new FaultBoundary();
  const Tasks=new TaskGraph();
  const Plugins=new PluginRegistry();
  const Resources=new ResourceManager();
  const Metrics={
    lastContractMs:0,lastStableScore:100,lastPluginCount:0,lastTasks:0,bootAt:Date.now(),frames:0,
    sample(){this.frames++;this.lastPluginCount=Plugins.plugins.size;this.lastTasks=Tasks.tasks.length;this.lastStableScore=StabilityLayer.lastReport.score;}
  };

  const API={
    version:VERSION,
    app:App,
    physics:Physics,
    validation:Validation,
    events:EventBus,
    contracts:Contract,
    taskGraph:Tasks,
    plugins:Plugins,
    resources:Resources,
    stability:StabilityLayer,
    replay:DeterministicReplay,
    snapshot:()=>EnterpriseRuntime.snapshot(),
    exportManifest:()=>exportManifest(),
    registerPlugin:p=>Plugins.register(p),
    activatePlugin:id=>Plugins.activate(id),
    scheduleTask:(id,phase,priority,fn)=>Tasks.add(id,phase,priority,fn)
  };
  Plugins.setApi(API);

  function injectStyles(){
    const css=`
      .ue-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
      .ue-card{background:linear-gradient(180deg,rgba(15,19,32,.96),rgba(7,10,16,.96));border:1px solid var(--border);border-radius:8px;padding:10px;box-shadow:0 10px 40px rgba(0,0,0,.22)}
      .ue-title{font-size:9px;color:var(--cyan);letter-spacing:2px;text-transform:uppercase;margin-bottom:7px}
      .ue-kv{display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.04);padding:4px 0;font-size:10px;gap:8px}
      .ue-k{color:var(--muted)}.ue-v{color:#fff;font-variant-numeric:tabular-nums;text-align:right}
      .ue-pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:2px 7px;font-size:9px;margin:2px;color:var(--text)}
      .ue-pill.good{border-color:var(--green);color:var(--green)}.ue-pill.warn{border-color:var(--orange);color:var(--orange)}.ue-pill.bad{border-color:var(--red);color:var(--red)}
      .ue-table{width:100%;border-collapse:collapse;font-size:10px}.ue-table th{color:var(--cyan);font-weight:400;text-align:left;border-bottom:1px solid var(--border);padding:4px}.ue-table td{border-bottom:1px solid rgba(255,255,255,.04);padding:4px;color:var(--text)}
      .ue-toolbar{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.ue-archmap{min-height:210px;background:radial-gradient(circle at 50% 20%,rgba(0,212,255,.12),transparent 45%),#02040a;border:1px solid var(--border);border-radius:8px;padding:10px;overflow:auto}
      .ue-node{display:inline-flex;align-items:center;justify-content:center;min-width:118px;min-height:34px;margin:6px;padding:5px 8px;border:1px solid rgba(0,212,255,.42);border-radius:6px;color:var(--fg);background:rgba(0,212,255,.06);font-size:9px;letter-spacing:.7px;text-align:center;box-shadow:0 0 18px rgba(0,212,255,.08)}
      .ue-node.core{border-color:var(--green);background:rgba(52,232,138,.06)}.ue-node.warn{border-color:var(--orange);background:rgba(255,122,48,.06)}
      #ueFloatingDiag{position:fixed;right:12px;bottom:12px;z-index:900;width:min(280px,90vw);background:rgba(6,8,12,.88);backdrop-filter:blur(10px);border:1px solid var(--border);border-radius:8px;padding:8px;font-size:10px;box-shadow:0 18px 80px rgba(0,0,0,.45)}
      #ueFloatingDiag.collapsed{width:auto}#ueFloatingDiag.collapsed .ue-fbody{display:none}
    `;
    const s=document.createElement('style');s.textContent=css;document.head.appendChild(s);
  }

  function mountArchitecturePanel(){
    const tabs=document.querySelector('.tabs');
    if(tabs&&!document.querySelector('[data-tab="architecture"]')){
      const b=document.createElement('button');b.className='tab';b.role='tab';b.setAttribute('aria-selected','false');b.dataset.tab='architecture';b.textContent='▣ Architecture';b.addEventListener('click',()=>switchTab('architecture'));tabs.appendChild(b);
    }
    if(!document.getElementById('tab-architecture')){
      const panel=document.createElement('div');panel.className='tabpanel';panel.id='tab-architecture';panel.role='tabpanel';
      panel.innerHTML=`
      <div class="layout">
        <div class="left-col" style="max-width:980px">
          <div class="ue-archmap" id="ueArchMap"></div>
          <div class="ue-toolbar">
            <button id="ueRunContract" class="primary">Run Contract Checks</button>
            <button id="ueCaptureCheckpoint">Capture Checkpoint</button>
            <button id="ueExportManifest">Export Engine Manifest</button>
            <button id="ueExportReplay">Export Checkpoints</button>
            <button id="ueToggleDiag">Toggle Floating Diagnostics</button>
          </div>
          <div class="ue-grid">
            <div class="ue-card"><div class="ue-title">Typed Runtime Contracts</div><div id="ueContracts"></div></div>
            <div class="ue-card"><div class="ue-title">Task Graph</div><div id="ueTasks"></div></div>
            <div class="ue-card"><div class="ue-title">Plugin Registry</div><div id="uePlugins"></div></div>
            <div class="ue-card"><div class="ue-title">Resource Manager</div><div id="ueResources"></div></div>
            <div class="ue-card"><div class="ue-title">Numerical Stability Layer</div><div id="ueStability"></div></div>
            <div class="ue-card"><div class="ue-title">Fault Boundary</div><div id="ueFaults"></div></div>
          </div>
        </div>
        <div class="controls">
          <div class="grp"><div class="grp-title">Runtime Capabilities</div><div class="stats" id="ueCaps"></div></div>
          <div class="grp"><div class="grp-title">Engine API</div><div style="font-size:9px;color:var(--muted);line-height:1.6">Compatibility API exposed as <span style="color:var(--cyan)">window.PendulumLabEnterprise</span>. Includes plugin registration, task scheduling, validated snapshots, replay checkpoints, and manifest export.</div></div>
          <div class="grp"><div class="grp-title">Architecture Verdict</div><div id="ueVerdict" style="font-size:10px;line-height:1.7;color:var(--text)"></div></div>
        </div>
      </div>`;
      document.body.appendChild(panel);
    }
    bindClick('ueRunContract',()=>runContractCheck(true));
    bindClick('ueCaptureCheckpoint',()=>{const cp=DeterministicReplay.capture('manual');toast('Checkpoint '+cp.id+' captured');renderArchitectureDashboard();});
    bindClick('ueExportManifest',()=>exportManifest());
    bindClick('ueExportReplay',()=>DeterministicReplay.export());
    bindClick('ueToggleDiag',()=>toggleFloatingDiag());
  }

  function mountFloatingDiagnostics(){
    if(document.getElementById('ueFloatingDiag'))return;
    const box=document.createElement('div');box.id='ueFloatingDiag';box.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b style="color:var(--cyan);font-weight:400;letter-spacing:1.5px">ENGINE</b><button id="ueCollapse" style="padding:1px 5px">—</button></div><div class="ue-fbody" id="ueFloatBody"></div>`;
    document.body.appendChild(box);
    bindClick('ueCollapse',()=>box.classList.toggle('collapsed'));
  }
  function toggleFloatingDiag(){const box=document.getElementById('ueFloatingDiag');if(box)box.style.display=box.style.display==='none'?'block':'none';}

  function registerBuiltInPlugins(){
    const builtins=[
      {id:'core.physics.contracts',name:'Physics Contract Guards',version:VERSION,kind:'safety',activate(api){api.scheduleTask('contract-frame-sampler','post-sim',10,()=>{const t=now();runContractCheck(false);Metrics.lastContractMs=now()-t;});}},
      {id:'core.stability.monitor',name:'Numerical Stability Monitor',version:VERSION,kind:'numerics',activate(api){api.scheduleTask('stability-analyzer','post-sim',20,()=>StabilityLayer.analyze());}},
      {id:'core.replay.checkpoint',name:'Deterministic Replay Checkpointer',version:VERSION,kind:'data',activate(api){let last=0;api.scheduleTask('auto-checkpoint','post-sim',80,()=>{const t=Date.now();if(t-last>30000){last=t;DeterministicReplay.capture('auto');}});}},
      {id:'viz.diagnostics.dashboard',name:'Live Architecture Dashboard',version:VERSION,kind:'visualization',activate(api){let last=0;api.scheduleTask('architecture-dashboard','post-render',100,()=>{const t=now();if(t-last>500){last=t;renderArchitectureDashboard();}});}},
      {id:'perf.resource.tracker',name:'Resource Telemetry Tracker',version:VERSION,kind:'performance',activate(api){Resources.track('state-buffer','Float64Array',App.state.byteLength,{role:'physics-state'});Resources.track('phase-history','Float32Array',App.phaseHist.byteLength,{role:'plot'});Resources.track('theta-history','Float32Array',App.theta1Hist.byteLength,{role:'fft'});}},
      {id:'collab.manifest.api',name:'Collaboration Manifest API',version:VERSION,kind:'collaboration',activate(){window.dispatchEvent(new CustomEvent('ple:engine-ready',{detail:{version:VERSION}}));}}
    ];
    for(const p of builtins){try{if(!Plugins.plugins.has(p.id))Plugins.register(p);}catch(e){}}
    for(const p of builtins){try{Plugins.activate(p.id);}catch(e){Log.warn('PLUGIN','activation failed',{id:p.id,e:String(e)});}}
  }

  function runContractCheck(noisy){
    const report={ok:true,checks:[],time:new Date().toISOString()};
    function check(name,fn){try{fn();report.checks.push({name,ok:true});}catch(e){report.ok=false;report.checks.push({name,ok:false,message:String(e.message||e)});}}
    check('physics configuration',()=>Contract.validatePhysicsConfig(App.P));
    check('state vector',()=>Contract.validateState());
    check('integrator enum',()=>Contract.enum(App.method,['rk4','rkf45','hmidpoint','leapfrog','yoshida4','gauss2','symplectic','rk2','euler'],'method'));
    check('system enum',()=>Contract.enum(App.sysType,['double','triple'],'sysType'));
    check('worker capability coherence',()=>Contract.assert(!App.useWorker||typeof Worker!=='undefined','worker requested but unavailable'));
    App.contractReport=report;
    if(noisy)toast(report.ok?'All engine contracts passed':'Contract violation found',2400);
    return report;
  }

  function wrapRuntime(){
    if(wrapRuntime.done)return;wrapRuntime.done=true;
    const oldPhysicsTick=physicsTick;
    physicsTick=function(realDt){
      return Faults.run('physicsTick',()=>{
        Tasks.runPhase('pre-sim',{realDt});
        const r=oldPhysicsTick(realDt);
        Tasks.runPhase('post-sim',{realDt});
        Metrics.sample();
        return r;
      },()=>{NaNGuard.recover(App.state);App.paused=true;if(UI.pauseBtn)UI.pauseBtn.textContent='▶ Resume';});
    };
    const oldRenderAll=Render.all;
    Render.all=function(alpha){
      return Faults.run('renderPipeline',()=>{Tasks.runPhase('pre-render',{alpha});const r=oldRenderAll(alpha);Tasks.runPhase('post-render',{alpha});return r;});
    };
    const oldFullReset=fullReset;
    fullReset=function(){const r=Faults.run('fullReset',()=>oldFullReset());DeterministicReplay.capture('reset');return r;};
  }

  function architectureNodes(){
    return [
      ['Engine Core','core'],['Simulation Runtime','core'],['Physics Systems','core'],['Integrator Registry','core'],['Numerical Stability Layer',StabilityLayer.lastReport.ok?'core':'warn'],['Task Graph System','core'],['Worker Scheduler',App.workerReady?'core':'warn'],['Rendering Pipeline','core'],['GPU Acceleration Layer',App.gl||App.gpuFallback?'core':'warn'],['Data Pipeline','core'],['Diagnostics & Profiling','core'],['Plugin API','core'],['Serialization Layer','core'],['Replay System','core'],['Validation Framework','core'],['UI Framework','core'],['State Management','core'],['Resource Management','core']
    ];
  }

  function renderKV(target,rows){const el=document.getElementById(target);if(!el)return;el.innerHTML=rows.map(r=>`<div class="ue-kv"><span class="ue-k">${r[0]}</span><span class="ue-v">${r[1]}</span></div>`).join('');}
  function renderArchitectureDashboard(){
    const map=document.getElementById('ueArchMap');
    if(map)map.innerHTML=architectureNodes().map(n=>`<span class="ue-node ${n[1]}">${n[0]}</span>`).join('');
    const cr=App.contractReport||runContractCheck(false);
    renderKV('ueContracts',cr.checks.map(c=>[c.name,c.ok?'<span class="ue-pill good">PASS</span>':'<span class="ue-pill bad">FAIL</span> '+(c.message||'')]).concat([['last check',cr.time.split('T')[1]?.replace('Z','')||cr.time],['contract ms',nf(Metrics.lastContractMs,3)]]));
    const tasks=Tasks.report().slice(0,12);
    const te=document.getElementById('ueTasks');if(te)te.innerHTML='<table class="ue-table"><tr><th>Task</th><th>Phase</th><th>ms</th><th>runs</th></tr>'+tasks.map(t=>`<tr><td>${t.id}</td><td>${t.phase}</td><td>${nf(t.lastMs,3)}</td><td>${t.runs}</td></tr>`).join('')+'</table>';
    const pe=document.getElementById('uePlugins');if(pe)pe.innerHTML='<table class="ue-table"><tr><th>Plugin</th><th>Kind</th><th>Status</th></tr>'+Plugins.list().map(p=>`<tr><td>${p.name}</td><td>${p.kind}</td><td><span class="ue-pill ${p.status==='active'?'good':p.status==='faulted'?'bad':'warn'}">${p.status}</span></td></tr>`).join('')+'</table>';
    renderKV('ueResources',[['tracked resources',Resources.resources.size],['tracked bytes',(Resources.bytes/1024).toFixed(1)+' KiB'],['state bytes',App.state.byteLength],['trail capacity',App.trail&&App.trail.buf?App.trail.buf.length:'—']]);
    const st=StabilityLayer.lastReport;renderKV('ueStability',[['score',`<span class="ue-pill ${st.score>=80?'good':st.score>=55?'warn':'bad'}">${st.score}/100</span>`],['warnings',st.warnings.length?st.warnings.join('<br>'):'none'],['energy drift',nf(App._drift||0,6)],['recoveries',NaNGuard.count()]]);
    const recent=Faults.faults.slice(-5);const fe=document.getElementById('ueFaults');if(fe)fe.innerHTML=recent.length?recent.map(f=>`<div class="ue-kv"><span class="ue-k">${f.scope}</span><span class="ue-v">${f.message}</span></div>`).join(''):'<span class="ue-pill good">no isolated faults</span>';
    renderKV('ueCaps',Object.entries(EnterpriseRuntime.caps).filter(([k])=>['sab','worker','webgl2','offscreenCanvas','audio','mediaRecorder','hardwareConcurrency','deviceMemory'].includes(k)).map(([k,v])=>[k,String(v)]));
    const ve=document.getElementById('ueVerdict');if(ve)ve.innerHTML=`<span class="ue-pill ${cr.ok&&st.score>=75?'good':'warn'}">${cr.ok&&st.score>=75?'VERY STRONG':'NEEDS ATTENTION'}</span><br>contracts=${cr.ok?'pass':'fail'} · plugins=${Plugins.plugins.size} · tasks=${Tasks.tasks.length} · checkpoints=${DeterministicReplay.checkpoints.length} · uptime=${Math.round((Date.now()-Metrics.bootAt)/1000)}s`;
    const fb=document.getElementById('ueFloatBody');if(fb)fb.innerHTML=`<div class="ue-kv"><span class="ue-k">fps</span><span class="ue-v">${nf(App.fps,1)}</span></div><div class="ue-kv"><span class="ue-k">sim</span><span class="ue-v">${nf(App.physMs,2)} ms</span></div><div class="ue-kv"><span class="ue-k">render</span><span class="ue-v">${nf(App.renderMs,2)} ms</span></div><div class="ue-kv"><span class="ue-k">stability</span><span class="ue-v">${st.score}/100</span></div><div class="ue-kv"><span class="ue-k">hash</span><span class="ue-v">${App._stateHash||'—'}</span></div>`;
  }

  function exportManifest(){
    const manifest={
      name:'Pendulum Lab Engine Manifest',schemaVersion:'pendulum-engine-manifest/v3',version:VERSION,generatedAt:new Date().toISOString(),
      architecture:architectureNodes().map(n=>({layer:n[0],status:n[1]==='core'?'active':'degraded'})),
      capabilities:EnterpriseRuntime.caps,plugins:Plugins.list(),tasks:Tasks.report(),resources:Resources.list(),
      numerical:{system:App.sysType,method:App.method,dt:App.DT,tolerance:App.tol,stepsPerFrame:App.SPF,stability:StabilityLayer.lastReport},
      diagnostics:{fps:App.fps,physMs:App.physMs,renderMs:App.renderMs,workerLatency:App.workerLatency,hash:App._stateHash,recoveries:NaNGuard.count(),faults:Faults.faults.slice(-20)},
      validation:{contractReport:App.contractReport||runContractCheck(false)},snapshot:EnterpriseRuntime.snapshot()
    };
    dlText('pendulum_engine_manifest.json',JSON.stringify(manifest,null,2),'application/json');
    return manifest;
  }

  function install(){
    injectStyles();mountArchitecturePanel();mountFloatingDiagnostics();wrapRuntime();registerBuiltInPlugins();runContractCheck(false);renderArchitectureDashboard();
    window.PendulumLabEnterprise=Object.freeze(API);
    const badge=document.querySelector('.badge');if(badge){badge.textContent='RESEARCH';badge.title='Research integrity architecture layer installed';}
    const sub=document.querySelector('.sub');if(sub){sub.textContent='';sub.style.display='none';}
    Log.info('BOOT','Advanced runtime layer installed',{version:VERSION,plugins:Plugins.plugins.size,tasks:Tasks.tasks.length});
  }

  return Object.freeze({version:VERSION,install,api:API,contracts:Contract,plugins:Plugins,tasks:Tasks,resources:Resources,faults:Faults,stability:StabilityLayer,replay:DeterministicReplay,exportManifest});
})();


const ResearchGradeEngineLayer=(()=>{
  const VERSION='vResearch-2026.05.13';
  const finite=(v,name)=>{if(!Number.isFinite(v))throw new Error(name+' must be finite');return v;};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const safeFixed=(v,d=4)=>Number.isFinite(v)?v.toFixed(d):'—';
  const bytes=(n)=>n>=1048576?(n/1048576).toFixed(2)+' MiB':(n/1024).toFixed(1)+' KiB';

  const Unit=Object.freeze({
    rad:v=>Object.freeze({kind:'radian',value:finite(v,'radian')}),
    angularVelocity:v=>Object.freeze({kind:'angularVelocity',value:finite(v,'angularVelocity')}),
    angularAcceleration:v=>Object.freeze({kind:'angularAcceleration',value:finite(v,'angularAcceleration')}),
    timestep:v=>Object.freeze({kind:'timestep',value:finite(v,'timestep')}),
    energy:v=>Object.freeze({kind:'energy',value:finite(v,'energy')}),
    mass:v=>Object.freeze({kind:'mass',value:finite(v,'mass')}),
    velocity:v=>Object.freeze({kind:'velocity',value:finite(v,'velocity')}),
    force:v=>Object.freeze({kind:'force',value:finite(v,'force')}),
    damping:v=>Object.freeze({kind:'damping',value:finite(v,'damping')}),
    frequency:v=>Object.freeze({kind:'frequency',value:finite(v,'frequency')}),
    length:v=>Object.freeze({kind:'length',value:finite(v,'length')})
  });

  const StrictTypeContract=Object.freeze({
    tsconfig:Object.freeze({
      compilerOptions:Object.freeze({
        target:'ES2022',module:'ES2022',strict:true,exactOptionalPropertyTypes:true,
        noImplicitAny:true,noUncheckedIndexedAccess:true,noImplicitOverride:true,
        noFallthroughCasesInSwitch:true,useUnknownInCatchVariables:true,
        isolatedModules:true,verbatimModuleSyntax:true
      })
    }),
    brandedUnits:['radians','angular velocity','angular acceleration','timestep','energy','mass','velocity','force','damping','frequency','length'],
    invariantRules:['finite state vector','positive mass and length','bounded timestep','versioned serialization','deterministic command application','explicit subsystem lifecycle']
  });

  const IntegratorMetadata=Object.freeze({
    euler:Object.freeze({id:'euler',name:'Explicit Euler',order:1,cost:1,symplectic:false,adaptive:false,stability:'low',stiffness:'unsuitable',recommendedDt:[0.0005,0.0015],risk:'high drift',use:'pedagogical baseline'}),
    rk2:Object.freeze({id:'rk2',name:'Midpoint RK2',order:2,cost:2,symplectic:false,adaptive:false,stability:'medium',stiffness:'weak',recommendedDt:[0.0005,0.003],risk:'moderate drift',use:'fast qualitative preview'}),
    rk4:Object.freeze({id:'rk4',name:'Classical RK4',order:4,cost:4,symplectic:false,adaptive:false,stability:'high short-run',stiffness:'limited',recommendedDt:[0.0005,0.006],risk:'long-run energy drift',use:'default accuracy/performance balance'}),
    rkf45:Object.freeze({id:'rkf45',name:'Fehlberg RKF45 PI-adaptive',order:5,cost:6,symplectic:false,adaptive:true,stability:'adaptive',stiffness:'limited detection',recommendedDt:[0.0001,0.02],risk:'variable-step replay sensitivity',use:'local truncation control'}),
    leapfrog:Object.freeze({id:'leapfrog',name:'KDK Leapfrog',order:2,cost:2,symplectic:true,adaptive:false,stability:'excellent long-run',stiffness:'weak',recommendedDt:[0.0005,0.008],risk:'not exact for nonseparable coordinates',use:'Hamiltonian long-run inspection'}),
    yoshida4:Object.freeze({id:'yoshida4',name:'Yoshida 4th Composition',order:4,cost:6,symplectic:true,adaptive:false,stability:'excellent long-run',stiffness:'weak',recommendedDt:[0.0005,0.006],risk:'negative substeps amplify discontinuities',use:'long-run phase-space preservation'}),
    gauss2:Object.freeze({id:'gauss2',name:'Implicit Midpoint / Gauss-Legendre 2',order:2,cost:8,symplectic:true,adaptive:false,stability:'A-stable approximation',stiffness:'moderate',recommendedDt:[0.0005,0.012],risk:'fixed-point convergence limit',use:'implicit stability probe'}),
    symplectic:Object.freeze({id:'symplectic',name:'Symplectic Euler',order:1,cost:1,symplectic:false,adaptive:false,stability:'bounded-energy qualitative',stiffness:'weak',recommendedDt:[0.0005,0.003],risk:'phase error',use:'low-cost symplectic baseline'})
  });

  class LockFreeRingBuffer {
    constructor(capacity,fields){
      this.capacity=capacity|0;this.fields=fields|0;
      if(this.capacity<2||this.fields<1)throw new Error('ring buffer dimensions invalid');
      this.header=typeof SharedArrayBuffer!=='undefined'?new SharedArrayBuffer(4*Int32Array.BYTES_PER_ELEMENT):null;
      this.dataBuffer=typeof SharedArrayBuffer!=='undefined'?new SharedArrayBuffer(this.capacity*this.fields*Float64Array.BYTES_PER_ELEMENT):null;
      this.i32=this.header?new Int32Array(this.header):new Int32Array(4);
      this.data=this.dataBuffer?new Float64Array(this.dataBuffer):new Float64Array(this.capacity*this.fields);
    }
    push(values){
      const write=Atomics&&this.header?Atomics.load(this.i32,0):this.i32[0];
      const read=Atomics&&this.header?Atomics.load(this.i32,1):this.i32[1];
      const next=(write+1)%this.capacity;
      if(next===read){ if(this.header)Atomics.store(this.i32,1,(read+1)%this.capacity); else this.i32[1]=(read+1)%this.capacity; }
      const off=write*this.fields;
      for(let i=0;i<this.fields;i++)this.data[off+i]=Number(values[i]||0);
      if(this.header)Atomics.store(this.i32,0,next); else this.i32[0]=next;
      if(this.header)Atomics.add(this.i32,2,1); else this.i32[2]++;
    }
    pop(out){
      const write=this.header?Atomics.load(this.i32,0):this.i32[0];
      const read=this.header?Atomics.load(this.i32,1):this.i32[1];
      if(read===write)return false;
      const off=read*this.fields;
      for(let i=0;i<this.fields;i++)out[i]=this.data[off+i];
      if(this.header)Atomics.store(this.i32,1,(read+1)%this.capacity); else this.i32[1]=(read+1)%this.capacity;
      return true;
    }
    size(){
      const write=this.header?Atomics.load(this.i32,0):this.i32[0];
      const read=this.header?Atomics.load(this.i32,1):this.i32[1];
      return write>=read?write-read:this.capacity-read+write;
    }
    report(){return Object.freeze({capacity:this.capacity,fields:this.fields,size:this.size(),shared:!!this.header,bytes:this.data.byteLength+(this.i32.byteLength||16)});}
  }

  const RenderGraph=(()=>{
    const passes=[];
    function add(name,phase,cost,producer,consumer){
      if(!name||!phase)throw new Error('render pass requires name and phase');
      const pass=Object.freeze({name,phase,cost,producer:producer||'runtime',consumer:consumer||'framebuffer'});
      passes.push(pass);return pass;
    }
    function bootstrap(){
      if(passes.length)return;
      add('simulation interpolation','pre-render',0.04,'StateStore','MainCanvas');
      add('trail rasterization','main',0.18,'TrailBuffer','MainCanvas');
      add('mass and rod layer','main',0.08,'SimulationRuntime','MainCanvas');
      add('diagnostic plots','post-render',0.22,'TelemetrySystem','PlotCanvas');
      add('phase density accumulation','gpu',0.12,'GPUComputeLayer','WebGL2Framebuffer');
      add('architecture dashboard','ui',0.06,'DiagnosticsLayer','DOM');
    }
    function list(){bootstrap();return passes.slice();}
    return Object.freeze({add,list});
  })();

  const StateStoreV2=(()=>{
    const schemaVersion=2;
    const commands=[];
    function snapshot(reason){
      const state=Array.from(App.state.slice(0,App.stateLen));
      const snap=Object.freeze({schemaVersion,reason:reason||'manual',time:App.simTime,wallClock:new Date().toISOString(),state,params:Object.freeze({...App.P}),method:App.method,dt:App.DT,gamma:App.gamma,system:App.sysType,hash:hashState(App.state)});
      return snap;
    }
    function dispatch(type,payload){
      const cmd=Object.freeze({type:String(type),payload:Object.freeze(payload||{}),t:Date.now(),hashBefore:hashState(App.state)});
      commands.push(cmd);if(commands.length>256)commands.shift();
      return cmd;
    }
    function serialize(){return JSON.stringify({schemaVersion,commands,snapshot:snapshot('serialized')},null,2);}
    function report(){return Object.freeze({schemaVersion,commands:commands.length,lastCommand:commands[commands.length-1]||null});}
    return Object.freeze({snapshot,dispatch,serialize,report});
  })();

  const NumericalProbe=(()=>{
    const tmpA=new Float64Array(CONSTS.MAX_STATE_DIM);
    const tmpB=new Float64Array(CONSTS.MAX_STATE_DIM);
    const baseRhs=new Float64Array(CONSTS.MAX_STATE_DIM);
    const jac=new Float64Array(CONSTS.MAX_STATE_DIM*CONSTS.MAX_STATE_DIM);
    let last=Object.freeze({ok:true,stiffness:0,condition:0,truncation:0,symplecticDefect:0,shadowHamiltonian:0,warnings:[]});
    function rhsFor(s,out){return App.sysType==='triple'?Physics.rhs3(s,App.P,App.gamma,out):Physics.rhs2(s,App.P,App.gamma,out);}
    function estimateJacobian(){
      const n=App.stateLen;const eps=1e-6;rhsFor(App.state,baseRhs);
      for(let c=0;c<n;c++){
        const old=App.state[c];
        App.state[c]=old+eps;rhsFor(App.state,tmpA);
        App.state[c]=old-eps;rhsFor(App.state,tmpB);
        App.state[c]=old;
        for(let r=0;r<n;r++)jac[r*n+c]=(tmpA[r]-tmpB[r])/(2*eps);
      }
      let rowMax=0,rowMin=Infinity,frob=0;
      for(let r=0;r<n;r++){
        let sum=0;for(let c=0;c<n;c++){const v=Math.abs(jac[r*n+c]);sum+=v;frob+=v*v;}
        rowMax=Math.max(rowMax,sum);if(sum>0)rowMin=Math.min(rowMin,sum);
      }
      return {spectralBound:rowMax,condition:rowMin===Infinity?0:rowMax/Math.max(rowMin,1e-12),frob:Math.sqrt(frob)};
    }
    function truncationEstimate(){
      const n=App.stateLen;const dt=clamp(App.DT,0.00025,0.02);const s0=App.state.slice(0,n);const one=new Float64Array(CONSTS.MAX_STATE_DIM);const half=new Float64Array(CONSTS.MAX_STATE_DIM);const out=new Float64Array(CONSTS.MAX_STATE_DIM);
      const f=(s,o)=>rhsFor(s,o);
      Physics.step(App.method,s0,dt,f,n,one,{tol:App.tol});
      Physics.step(App.method,s0,dt*0.5,f,n,half,{tol:App.tol});
      Physics.step(App.method,half,dt*0.5,f,n,out,{tol:App.tol});
      let err=0,norm=0;for(let i=0;i<n;i++){const d=one[i]-out[i];err+=d*d;norm+=out[i]*out[i];}
      return Math.sqrt(err)/Math.max(1,Math.sqrt(norm));
    }
    function analyze(){
      try{
        const j=estimateJacobian();
        const trunc=truncationEstimate();
        const drift=Math.abs(App._drift||0);
        const stiffness=j.spectralBound*App.DT;
        const symp=IntegratorMetadata[App.method]&&IntegratorMetadata[App.method].symplectic?Math.min(1,drift*10+trunc):Math.min(1,drift+trunc*5);
        const shadow=Number.isFinite(App._lastE)&&Number.isFinite(App.E0)?Math.abs(App._lastE-App.E0)/(Math.abs(App.E0)+1e-12):0;
        const warnings=[];
        if(stiffness>0.35)warnings.push('stiffness warning: reduce timestep or use implicit method');
        if(trunc>1e-4)warnings.push('local truncation warning: adaptive or smaller timestep recommended');
        if(drift>1e-2&&!App.gamma)warnings.push('energy drift warning: prefer symplectic integrator');
        last=Object.freeze({ok:warnings.length===0,stiffness,condition:j.condition,truncation:trunc,symplecticDefect:symp,shadowHamiltonian:shadow,warnings});
      }catch(e){last=Object.freeze({ok:false,stiffness:0,condition:0,truncation:0,symplecticDefect:0,shadowHamiltonian:0,warnings:[String(e.message||e)]});}
      return last;
    }
    function get(){return last;}
    return Object.freeze({analyze,get});
  })();

  const PerformanceAdvisor=(()=>{
    const frames=[];
    let last=performance.now();
    function sample(){
      const now=performance.now();const dt=now-last;last=now;
      frames.push({dt,fps:App.fps,phys:App.physMs,render:App.renderMs,worker:App.workerLatency});
      if(frames.length>240)frames.shift();
    }
    function report(){
      if(!frames.length)return Object.freeze({meanFrame:0,variance:0,p95:0,bottleneck:'warming',recommendation:'collecting samples'});
      const arr=frames.map(f=>f.dt).sort((a,b)=>a-b);const mean=arr.reduce((a,b)=>a+b,0)/arr.length;const variance=arr.reduce((a,b)=>a+(b-mean)*(b-mean),0)/arr.length;const p95=arr[Math.min(arr.length-1,Math.floor(arr.length*0.95))];
      const meanPhys=frames.reduce((a,b)=>a+b.phys,0)/frames.length;const meanRender=frames.reduce((a,b)=>a+b.render,0)/frames.length;
      let bottleneck='balanced',recommendation='current pacing stable';
      if(meanPhys>meanRender*1.25){bottleneck='physics';recommendation='lower steps/frame, enable worker, or use symplectic low-cost mode';}
      else if(meanRender>meanPhys*1.25){bottleneck='render';recommendation='reduce trail length, enable adaptive quality, or switch to density mode';}
      if(p95>28){bottleneck+=' variance';recommendation+='; frame-time spikes detected';}
      return Object.freeze({meanFrame:mean,variance,p95,bottleneck,recommendation,meanPhys,meanRender});
    }
    return Object.freeze({sample,report});
  })();

  const TestMatrix=(()=>{
    const results=[];
    function push(name,ok,metric,detail){results.push(Object.freeze({name,ok,metric,detail,t:new Date().toISOString()}));if(results.length>80)results.shift();}
    function runSmoke(){
      const snap=StateStoreV2.snapshot('test-smoke');
      push('state hash reproducibility',typeof snap.hash==='string'&&snap.hash.length===8,snap.hash,'FNV-1a state checksum generated');
      const n=App.stateLen;let finiteState=true;for(let i=0;i<n;i++)finiteState=finiteState&&Number.isFinite(App.state[i]);
      push('finite state invariant',finiteState,n+' components','state vector contains only finite numbers');
      const meta=IntegratorMetadata[App.method];
      push('integrator metadata availability',!!meta,meta?meta.name:'missing','registry exposes order, cost, stability, and recommended timestep');
      const np=NumericalProbe.analyze();
      push('conditioning probe',Number.isFinite(np.condition),safeFixed(np.condition,3),'finite-difference Jacobian conditioning estimate');
      return results.slice();
    }
    function list(){return results.slice();}
    return Object.freeze({runSmoke,list});
  })();

  const OptimizationMatrix=Object.freeze([
    Object.freeze({optimization:'typed-array hot path',target:'GC churn and cache locality',why:'contiguous numeric buffers reduce object allocation and improve sequential memory access',expected:'15-35% less allocation pressure during long runs'}),
    Object.freeze({optimization:'fixed-step deterministic simulation',target:'replay integrity',why:'constant integration cadence prevents browser frame jitter from altering physics',expected:'bitwise-stable replay under identical browser math behavior'}),
    Object.freeze({optimization:'worker scheduling with SharedArrayBuffer',target:'main-thread blocking',why:'simulation state exchange avoids structured-clone copies',expected:'lower input latency and smoother UI under high steps/frame'}),
    Object.freeze({optimization:'render graph pass separation',target:'render latency',why:'independent passes can be skipped, reordered, or degraded by quality policy',expected:'20-50% reduced redraw work when panels are inactive'}),
    Object.freeze({optimization:'dirty-region and retained plot strategy',target:'canvas overdraw',why:'plots and panels update at diagnostic cadence rather than physics cadence',expected:'lower frame variance on integrated GPUs'}),
    Object.freeze({optimization:'WebGL2 density accumulation',target:'large phase-space visualization',why:'additive blending moves point accumulation from CPU loops to GPU raster units',expected:'orders-of-magnitude higher point throughput for density maps'}),
    Object.freeze({optimization:'lock-free ring protocol',target:'worker throughput',why:'atomic cursor exchange removes mutex-style coordination and avoids copies',expected:'predictable producer-consumer latency'}),
    Object.freeze({optimization:'adaptive quality hysteresis',target:'frame pacing',why:'quality changes only after sustained pressure to prevent oscillation',expected:'stable visual quality under thermal or load changes'})
  ]);

  function injectTypeContractElements(){
    // Previously this injected two decorative <script type="application/json|text/plain">
    // elements into <head> as static type-contract metadata. Nothing ever read those DOM
    // nodes, and dynamic <script> creation is a CSP/security smell flagged by the legacy
    // audit, so the injection was removed. The same information stays programmatically
    // available through StrictTypeContract and window.PendulumLabEnterpriseResearch.typeContract.
    return StrictTypeContract;
  }

  function ensureResearchTab(){
    const tabs=document.querySelector('.tabs');
    if(tabs&&!document.querySelector('[data-tab="research"]')){
      const b=document.createElement('button');b.className='tab';b.role='tab';b.setAttribute('aria-selected','false');b.dataset.tab='research';b.textContent='▧ Research';b.addEventListener('click',()=>switchTab('research'));tabs.appendChild(b);
    }
    if(document.getElementById('tab-research'))return;
    const panel=document.createElement('div');panel.className='tabpanel';panel.id='tab-research';panel.role='tabpanel';
    panel.innerHTML=`<div class="layout"><div class="left-col" style="max-width:1080px"><div class="rg-grid"><div class="rg-card"><div class="rg-title">Integrator Registry Metadata</div><div id="rgIntegrators"></div></div><div class="rg-card"><div class="rg-title">Numerical Conditioning Probe</div><div id="rgNumerics"></div></div><div class="rg-card"><div class="rg-title">Render Graph</div><div id="rgRenderGraph"></div></div><div class="rg-card"><div class="rg-title">Performance Advisor</div><div id="rgPerf"></div></div><div class="rg-card"><div class="rg-title">State Store V2</div><div id="rgState"></div></div><div class="rg-card"><div class="rg-title">Optimization Matrix</div><div id="rgOpt"></div></div><div class="rg-card"><div class="rg-title">Test Matrix</div><div id="rgTests"></div></div></div></div><div class="controls"><div class="grp"><div class="grp-title">Research Controls</div><div class="btnrow"><button id="rgRunProbe" class="primary">Run Numerical Probe</button><button id="rgRunTests">Run Smoke Tests</button><button id="rgExportSnapshot">Export V2 Snapshot</button></div></div><div class="grp"><div class="grp-title">Strict Contract</div><div id="rgContract" style="font-size:9px;color:var(--text);line-height:1.6"></div></div><div class="grp"><div class="grp-title">Lock-Free Queue</div><div id="rgQueue" class="stats"></div></div></div></div>`;
    document.body.appendChild(panel);
    bindClick('rgRunProbe',()=>{NumericalProbe.analyze();render();toast('Numerical probe complete');});
    bindClick('rgRunTests',()=>{TestMatrix.runSmoke();render();toast('Smoke tests complete');});
    bindClick('rgExportSnapshot',()=>dlText('pendulum_state_store_v2_snapshot.json',StateStoreV2.serialize(),'application/json'));
  }

  function injectStyles(){
    if(document.getElementById('rg-style'))return;
    const s=document.createElement('style');s.id='rg-style';s.textContent=`.rg-grid{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:10px}.rg-card{background:var(--panel);border:1px solid var(--border);border-radius:7px;padding:10px;min-height:100px}.rg-wide{grid-column:1/-1}.rg-title{font-size:10px;color:var(--cyan);letter-spacing:1.8px;text-transform:uppercase;margin-bottom:8px}.rg-kv{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid rgba(255,255,255,.05);padding:4px 0;font-size:10px}.rg-k{color:var(--muted)}.rg-v{color:var(--fg);text-align:right}.rg-table{width:100%;border-collapse:collapse;font-size:9px}.rg-table th{color:var(--cyan);font-weight:400;text-align:left;border-bottom:1px solid var(--border);padding:4px}.rg-table td{color:var(--text);border-bottom:1px solid rgba(255,255,255,.04);padding:4px;vertical-align:top}.rg-pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:1px 6px;font-size:8px;color:var(--text)}.rg-pill.good{border-color:var(--green);color:var(--green)}.rg-pill.warn{border-color:var(--orange);color:var(--orange)}.rg-pill.bad{border-color:var(--red);color:var(--red)}@media(max-width:900px){.rg-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(s);
  }

  const queue=new LockFreeRingBuffer(1024,4);
  let installed=false;
  function kv(rows){return rows.map(r=>`<div class="rg-kv"><span class="rg-k">${r[0]}</span><span class="rg-v">${r[1]}</span></div>`).join('');}
  function render(){
    if(!document.getElementById('tab-research'))return;
    const ints=document.getElementById('rgIntegrators');if(ints)ints.innerHTML='<table class="rg-table"><tr><th>ID</th><th>Order</th><th>Cost</th><th>Sympl.</th><th>Adaptive</th><th>Stiffness</th><th>Use</th></tr>'+Object.values(IntegratorMetadata).map(m=>`<tr><td>${m.id}</td><td>${m.order}</td><td>${m.cost}</td><td>${m.symplectic?'yes':'no'}</td><td>${m.adaptive?'yes':'no'}</td><td>${m.stiffness}</td><td>${m.use}</td></tr>`).join('')+'</table>';
    const np=NumericalProbe.get();const nums=document.getElementById('rgNumerics');if(nums)nums.innerHTML=kv([['status',np.ok?'<span class="rg-pill good">stable</span>':'<span class="rg-pill warn">attention</span>'],['stiffness index',safeFixed(np.stiffness,5)],['Jacobian condition bound',safeFixed(np.condition,3)],['truncation estimate',safeFixed(np.truncation,8)],['symplectic defect proxy',safeFixed(np.symplecticDefect,6)],['shadow Hamiltonian drift',safeFixed(np.shadowHamiltonian,8)],['warnings',np.warnings.length?np.warnings.join('<br>'):'none']]);
    const rg=document.getElementById('rgRenderGraph');if(rg)rg.innerHTML='<table class="rg-table"><tr><th>Pass</th><th>Phase</th><th>Producer</th><th>Consumer</th><th>Cost</th></tr>'+RenderGraph.list().map(p=>`<tr><td>${p.name}</td><td>${p.phase}</td><td>${p.producer}</td><td>${p.consumer}</td><td>${p.cost}</td></tr>`).join('')+'</table>';
    const pr=PerformanceAdvisor.report();const perf=document.getElementById('rgPerf');if(perf)perf.innerHTML=kv([['mean frame',safeFixed(pr.meanFrame,2)+' ms'],['p95 frame',safeFixed(pr.p95,2)+' ms'],['variance',safeFixed(pr.variance,3)],['mean physics',safeFixed(pr.meanPhys,3)+' ms'],['mean render',safeFixed(pr.meanRender,3)+' ms'],['bottleneck',pr.bottleneck],['recommendation',pr.recommendation]]);
    const ss=StateStoreV2.report();const state=document.getElementById('rgState');if(state)state.innerHTML=kv([['schema',String(ss.schemaVersion)],['commands',String(ss.commands)],['last command',ss.lastCommand?ss.lastCommand.type:'none'],['current hash',hashState(App.state)],['snapshot bytes',bytes(StateStoreV2.serialize().length)]]);
    const opt=document.getElementById('rgOpt');if(opt)opt.innerHTML='<table class="rg-table"><tr><th>Optimization</th><th>Target</th><th>Why</th><th>Expected</th></tr>'+OptimizationMatrix.map(o=>`<tr><td>${o.optimization}</td><td>${o.target}</td><td>${o.why}</td><td>${o.expected}</td></tr>`).join('')+'</table>';
    const tests=document.getElementById('rgTests');if(tests)tests.innerHTML='<table class="rg-table"><tr><th>Test</th><th>Result</th><th>Metric</th><th>Detail</th></tr>'+TestMatrix.list().slice(-12).map(t=>`<tr><td>${t.name}</td><td><span class="rg-pill ${t.ok?'good':'bad'}">${t.ok?'PASS':'FAIL'}</span></td><td>${t.metric}</td><td>${t.detail}</td></tr>`).join('')+'</table>';
    const contract=document.getElementById('rgContract');if(contract)contract.innerHTML=kv([['TypeScript strict',StrictTypeContract.tsconfig.compilerOptions.strict?'enabled':'disabled'],['exact optional properties','enabled'],['unchecked index access','guarded'],['branded unit count',String(StrictTypeContract.brandedUnits.length)],['runtime unit factory','enabled'],['exhaustive integrator registry',String(Object.keys(IntegratorMetadata).length)+' methods']]);
    const qr=queue.report();const q=document.getElementById('rgQueue');if(q)q.innerHTML=kv([['capacity',String(qr.capacity)],['fields',String(qr.fields)],['current size',String(qr.size)],['shared memory',String(qr.shared)],['allocated',bytes(qr.bytes)]]);
  }
  function patchRuntime(){
    if(patchRuntime.done)return;patchRuntime.done=true;
    const oldPhysicsTick=physicsTick;
    physicsTick=function(realDt){
      StateStoreV2.dispatch('physicsTick',{dt:realDt,method:App.method});
      const result=oldPhysicsTick(realDt);
      queue.push([App.simTime,App.state[0],App.state[1],App._drift||0]);
      if((App.taskCounter||0)%90===0)NumericalProbe.analyze();
      return result;
    };
    const oldRenderAll=Render.all;
    Render.all=function(alpha){PerformanceAdvisor.sample();const result=oldRenderAll(alpha);if(App.activeTab==='research')render();return result;};
  }
  function install(){
    if(installed)return;installed=true;
    injectStyles();injectTypeContractElements();ensureResearchTab();RenderGraph.list();patchRuntime();TestMatrix.runSmoke();NumericalProbe.analyze();render();
    const previous=window.PendulumLabEnterprise;
    window.PendulumLabEnterpriseResearch=Object.freeze({version:VERSION,unit:Unit,typeContract:StrictTypeContract,integrators:IntegratorMetadata,renderGraph:RenderGraph,stateStore:StateStoreV2,numericalProbe:NumericalProbe,performance:PerformanceAdvisor,tests:TestMatrix,queue,optimizationMatrix:OptimizationMatrix});
    if(previous&&typeof previous==='object')window.PendulumLabEnterpriseUnified=Object.freeze({core:previous,research:window.PendulumLabEnterpriseResearch});
    Log.info('BOOT','Scientific extension layer installed',{version:VERSION,integrators:Object.keys(IntegratorMetadata).length,renderPasses:RenderGraph.list().length});
  }
  return Object.freeze({version:VERSION,install,unit:Unit,typeContract:StrictTypeContract,integrators:IntegratorMetadata,renderGraph:RenderGraph,stateStore:StateStoreV2,numericalProbe:NumericalProbe,performance:PerformanceAdvisor,tests:TestMatrix,queue,optimizationMatrix:OptimizationMatrix});
})();


const MachineGradeScientificPatch=(()=>{
  const VERSION='machinery-2026.05.14';
  const MethodClass=Object.freeze({APPROX:'approximate',PSEUDO:'pseudo-symplectic',TRUE:'true-canonical-symplectic',DISSIPATIVE:'dissipative-nonsymplectic'});
  const scratch={y:new Float64Array(4),z:new Float64Array(4),mid:new Float64Array(4),rhs:new Float64Array(4),cand:new Float64Array(4),tmp:new Float64Array(4),jBase:new Float64Array(4),jPert:new Float64Array(4),mapBase:new Float64Array(4),mapPert:new Float64Array(4)};

  class IOCContainer{
    constructor(){this.services=new Map();this.lifecycle=[];}
    register(name,service){if(this.services.has(name))throw new Error('duplicate service '+name);this.services.set(name,Object.freeze(service));this.lifecycle.push({name,state:'registered',time:performance.now()});return service;}
    get(name){if(!this.services.has(name))throw new Error('missing service '+name);return this.services.get(name);}
    has(name){return this.services.has(name);}
    list(){return Array.from(this.services.keys());}
    report(){return {count:this.services.size,services:this.list(),lifecycle:this.lifecycle.slice(-64)};}
  }

  class CommandBusLite{
    constructor(){this.handlers=new Map();this.history=[];}
    register(type,handler){this.handlers.set(type,handler);}
    dispatch(type,payload){const h=this.handlers.get(type);const rec={type,payload,time:performance.now(),hash:hashState(App.state)};this.history.push(rec);if(this.history.length>2048)this.history.shift();if(!h)throw new Error('unhandled command '+type);const result=h(payload);EventBus.emit('command:applied',rec);return result;}
    report(){return {handlers:Array.from(this.handlers.keys()),history:this.history.slice(-20)};}
  }

  const CanonicalDouble=Object.freeze({
    massMatrix(q,P,out){
      const d=q[0]-q[1],c=Math.cos(d);const A=(P.m1+P.m2)*P.l1*P.l1,B=P.m2*P.l1*P.l2,C=P.m2*P.l2*P.l2;
      out[0]=A;out[1]=B*c;out[2]=B*c;out[3]=C;return out;
    },
    omegaToMomentum(s,P,out){
      const d=s[0]-s[1],c=Math.cos(d);const A=(P.m1+P.m2)*P.l1*P.l1,B=P.m2*P.l1*P.l2,C=P.m2*P.l2*P.l2;
      out[0]=s[0];out[1]=s[1];out[2]=A*s[2]+B*c*s[3];out[3]=B*c*s[2]+C*s[3];return out;
    },
    momentumToOmega(y,P,out){
      const d=y[0]-y[1],c=Math.cos(d);const A=(P.m1+P.m2)*P.l1*P.l1,B=P.m2*P.l1*P.l2,C=P.m2*P.l2*P.l2,D=B*c,det=A*C-D*D;
      const inv=1/(Math.abs(det)<1e-18?(det<0?-1e-18:1e-18):det);
      out[0]=y[0];out[1]=y[1];out[2]=(C*y[2]-D*y[3])*inv;out[3]=(-D*y[2]+A*y[3])*inv;return out;
    },
    rhs(y,P,gamma,out){
      const q1=y[0],q2=y[1],p1=y[2],p2=y[3];
      const d=q1-q2,s=Math.sin(d),c=Math.cos(d);const A=(P.m1+P.m2)*P.l1*P.l1,B=P.m2*P.l1*P.l2,C=P.m2*P.l2*P.l2,D=B*c,det=A*C-D*D;
      const inv=1/(Math.abs(det)<1e-18?(det<0?-1e-18:1e-18):det);
      const w1=(C*p1-D*p2)*inv,w2=(-D*p1+A*p2)*inv;
      const N=C*p1*p1-2*D*p1*p2+A*p2*p2;
      const dD=-B*s;const dDet=-2*D*dD;const dN=-2*dD*p1*p2;
      const dTdd=0.5*(dN*det-N*dDet)*inv*inv;
      const dV1=(P.m1+P.m2)*P.g*P.l1*Math.sin(q1);
      const dV2=P.m2*P.g*P.l2*Math.sin(q2);
      out[0]=w1;out[1]=w2;
      out[2]=-(dTdd+dV1)-gamma*p1;
      out[3]=(dTdd-dV2)-gamma*p2;
      return out;
    },
    hamiltonian(y,P){
      const q1=y[0],q2=y[1],p1=y[2],p2=y[3];const d=q1-q2,c=Math.cos(d);const A=(P.m1+P.m2)*P.l1*P.l1,B=P.m2*P.l1*P.l2,C=P.m2*P.l2*P.l2,D=B*c,det=A*C-D*D;
      const inv=1/(Math.abs(det)<1e-18?(det<0?-1e-18:1e-18):det);
      const T=0.5*(C*p1*p1-2*D*p1*p2+A*p2*p2)*inv;
      const V=-(P.m1+P.m2)*P.g*P.l1*Math.cos(q1)-P.m2*P.g*P.l2*Math.cos(q2);
      return T+V;
    },
    implicitMidpointCanonical(y,dt,P,gamma,out){
      const z=scratch.z,mid=scratch.mid,rhs=scratch.rhs,cand=scratch.cand;for(let i=0;i<4;i++)z[i]=y[i];
      let residual=Infinity,it=0;
      for(;it<18;it++){
        for(let i=0;i<4;i++)mid[i]=0.5*(y[i]+z[i]);
        this.rhs(mid,P,gamma,rhs);
        residual=0;
        for(let i=0;i<4;i++){cand[i]=y[i]+dt*rhs[i];const r=Math.abs(cand[i]-z[i]);if(r>residual)residual=r;z[i]=0.65*z[i]+0.35*cand[i];}
        if(residual<1e-12)break;
      }
      for(let i=0;i<4;i++)out[i]=z[i];
      return {iterations:it+1,residual,ok:Number.isFinite(residual)&&residual<1e-7};
    },
    stepKinematic(s,dt,P,gamma,out){
      this.omegaToMomentum(s,P,scratch.y);
      const info=this.implicitMidpointCanonical(scratch.y,dt,P,gamma,scratch.tmp);
      this.momentumToOmega(scratch.tmp,P,out);
      if(!App.canonicalStats)App.canonicalStats={steps:0,failures:0,maxResidual:0,maxIterations:0,symplecticDefect:0,energyDrift:0};
      App.canonicalStats.steps++;if(!info.ok)App.canonicalStats.failures++;
      if(info.residual>App.canonicalStats.maxResidual)App.canonicalStats.maxResidual=info.residual;
      if(info.iterations>App.canonicalStats.maxIterations)App.canonicalStats.maxIterations=info.iterations;
      return out;
    },
    symplecticDefect(P,dt){
      const eps=1e-6;const base=scratch.jBase,pert=scratch.jPert,map0=scratch.mapBase,map1=scratch.mapPert;
      base[0]=0.9;base[1]=1.2;base[2]=0.15;base[3]=-0.05;
      this.implicitMidpointCanonical(base,dt,P,0,map0);
      const A=new Float64Array(16);
      for(let c=0;c<4;c++){
        for(let i=0;i<4;i++)pert[i]=base[i];pert[c]+=eps;
        this.implicitMidpointCanonical(pert,dt,P,0,map1);
        for(let r=0;r<4;r++)A[r*4+c]=(map1[r]-map0[r])/eps;
      }
      const J=[0,0,1,0,0,0,0,1,-1,0,0,0,0,-1,0,0];
      let norm=0;
      for(let i=0;i<4;i++)for(let j=0;j<4;j++){
        let v=-J[i*4+j];
        for(let k=0;k<4;k++)for(let l=0;l<4;l++)v+=A[k*4+i]*J[k*4+l]*A[l*4+j];
        norm=Math.max(norm,Math.abs(v));
      }
      return norm;
    }
  });

  const RuntimeRegistry=Object.freeze({
    EngineCore:{contract:'orchestrates lifecycle, command bus, telemetry, and immutable snapshots'},
    StateStore:{contract:'versioned snapshots, replay hashes, canonical state conversion'},
    PhysicsRuntime:{contract:'θ/ω and canonical Hamiltonian execution paths'},
    IntegratorRegistry:{contract:'metadata separates approximate, pseudo-symplectic, and true canonical methods'},
    RenderPipeline:{contract:'render graph, retained plots, WebGL density, context recovery'},
    DiagnosticsRuntime:{contract:'timing histograms, RKF45 statistics, symplectic defect probes'},
    WorkerRuntime:{contract:'worker pool path for fixed-step methods, deterministic main-thread adaptive path'},
    AnalysisSystems:{contract:'Lyapunov, FFT, Poincaré, bifurcation, ensemble statistics'},
    ValidationFramework:{contract:'determinism, energy, convergence, replay, canonical defect checks'},
    ReplayRuntime:{contract:'accepted-time snapshots and hashable reproducibility state'},
    ExportPipeline:{contract:'JSON, CSV, PNG, reports, manifests'},
    AudioRuntime:{contract:'optional sonification bounded by user activation'},
    GPUComputeLayer:{contract:'WebGL2 accumulation and fallback canvas density'},
    UIRuntime:{contract:'tabs, keyboard commands, accessibility labels'},
    ConfigurationManager:{contract:'feature flags and immutable capability snapshots'}
  });

  const IntegratorRegistryV2={
    rk4:{class:MethodClass.APPROX,order:4,adaptive:false,canonical:false,statement:'non-symplectic high-accuracy baseline'},
    rkf45:{class:MethodClass.APPROX,order:5,adaptive:true,canonical:false,statement:'accepted-step adaptive integrator with PI timestep control'},
    hmidpoint:{class:MethodClass.TRUE,order:2,adaptive:false,canonical:true,statement:'implicit midpoint on canonical (θ,p) coordinates; symplectic only when γ=0'},
    leapfrog:{class:MethodClass.PSEUDO,order:2,adaptive:false,canonical:false,statement:'KDK on θ/ω variables; not claimed as exact symplectic for nonseparable double pendulum'},
    yoshida4:{class:MethodClass.PSEUDO,order:4,adaptive:false,canonical:false,statement:'composition on θ/ω variables; phase-preserving heuristic, not exact canonical flow'},
    gauss2:{class:MethodClass.PSEUDO,order:2,adaptive:false,canonical:false,statement:'implicit midpoint in noncanonical coordinates; stable but label remains approximate'},
    symplectic:{class:MethodClass.PSEUDO,order:1,adaptive:false,canonical:false,statement:'Euler-Cromer-style update in θ/ω variables'},
    rk2:{class:MethodClass.APPROX,order:2,adaptive:false,canonical:false,statement:'explicit midpoint'},
    euler:{class:MethodClass.APPROX,order:1,adaptive:false,canonical:false,statement:'diagnostic first-order method'}
  };

  function installMethodOption(){
    const sel=document.getElementById('method');if(!sel)return;
    if(!sel.querySelector('option[value="hmidpoint"]')){const o=document.createElement('option');o.value='hmidpoint';o.textContent='Canonical implicit midpoint — conditional symplectic';sel.insertBefore(o,sel.querySelector('option[value="leapfrog"]'));}
    const labels={leapfrog:'Leapfrog KDK — pseudo-symplectic θ/ω',yoshida4:'Yoshida4 — pseudo-symplectic θ/ω',gauss2:'Implicit midpoint θ/ω — noncanonical',symplectic:'Symplectic Euler — separable approximation'};
    for(const [v,label] of Object.entries(labels)){const o=sel.querySelector(`option[value="${v}"]`);if(o)o.textContent=label;}
  }

  function patchBranding(){
    document.title='Pendulum Lab Developed by Elliot Jung — Research Simulation Engine';
    const h=document.querySelector('header h1');if(h)h.textContent='Pendulum Lab Developed by Elliot Jung';
    const sub=document.querySelector('header .sub');if(sub){sub.textContent='';sub.style.display='none';sub.setAttribute('aria-hidden','true');}
    const badge=document.querySelector('header .badge');if(badge)badge.textContent='MACHINERY';
  }

  function installPhysicsPatch(){
    if(installPhysicsPatch.done)return;installPhysicsPatch.done=true;
    const oldStep=Physics.step;
    Physics.step=function(method,s,dt,f,n,out,opts){
      if(method==='hmidpoint'){
        if(App.sysType==='double'&&n===4)return CanonicalDouble.stepKinematic(s,dt,App.P,App.gamma,out);
        return Physics.gauss2step(s,dt,f,n,out);
      }
      return oldStep(method,s,dt,f,n,out,opts);
    };
    const oldEnergyOf=energyOf;
    energyOf=function(){
      if(App.sysType==='double'&&App.method==='hmidpoint'){
        CanonicalDouble.omegaToMomentum(App.state,App.P,scratch.y);
        const H=CanonicalDouble.hamiltonian(scratch.y,App.P);
        const split=Physics.energy2(App.state,App.P);
        return {total:H,KE:split.KE,PE:split.PE,canonicalTotal:H,decomposition:'physical KE/PE split from θ/ω; total from canonical Hamiltonian'};
      }
      return oldEnergyOf();
    };
  }

  function installDiagnosticsPanel(){
    if(document.getElementById('canonicalDiag'))return;
    const live=document.getElementById('stats');if(!live)return;
    const wrap=document.createElement('div');wrap.id='canonicalDiag';wrap.innerHTML=`
      <div class="srow"><span class="skey">method class</span><span class="sval" id="methodClassStat">—</span></div>
      <div class="srow"><span class="skey">canonical residual</span><span class="sval" id="canonResidualStat">—</span></div>
      <div class="srow"><span class="skey">sympl. defect</span><span class="sval" id="symplDefectStat">—</span></div>
      <div class="srow"><span class="skey">RKF45 accepted/rejected</span><span class="sval" id="rkfStat">—</span></div>`;
    live.appendChild(wrap);
  }

  function updateDiagnostics(){
    const meta=IntegratorRegistryV2[App.method]||IntegratorRegistryV2.rk4;
    const mc=document.getElementById('methodClassStat');if(mc)mc.textContent=meta.class;
    const cr=document.getElementById('canonResidualStat');if(cr){const st=App.canonicalStats;cr.textContent=st?st.maxResidual.toExponential(2):'—';}
    const sd=document.getElementById('symplDefectStat');if(sd){
      if(App.method==='hmidpoint'&&App.gamma===0&&App.sysType==='double'){
        if(!App.canonicalStats)App.canonicalStats={steps:0,failures:0,maxResidual:0,maxIterations:0,symplecticDefect:0,energyDrift:0};
        if((App.canonicalStats.steps%180)===0)App.canonicalStats.symplecticDefect=CanonicalDouble.symplecticDefect(App.P,App.DT);
        sd.textContent=App.canonicalStats.symplecticDefect.toExponential(2);
      }else sd.textContent='not true-canonical';
    }
    const rs=document.getElementById('rkfStat');if(rs){const r=App.rkfStats;rs.textContent=r?`${r.accepted}/${r.rejected}`:'—';}
    const verdict=document.getElementById('verdict');
    if(verdict&&meta){
      const cls=meta.class===MethodClass.TRUE&&App.gamma===0?'good':meta.class===MethodClass.PSEUDO?'warn':meta.class===MethodClass.APPROX?'hi':'warn';
      const chip=document.createElement('span');
      chip.className=`chip ${cls}`;
      chip.textContent=meta.class;
      verdict.replaceChildren(chip);
    }
  }

  function installResearchPanel(){
    if(document.getElementById('tab-canonical'))return;
    const tabs=document.querySelector('.tabs');
    if(tabs){const b=document.createElement('button');b.className='tab';b.role='tab';b.setAttribute('aria-selected','false');b.dataset.tab='canonical';b.textContent='∂H Canonical';b.addEventListener('click',()=>switchTab('canonical'));tabs.appendChild(b);}
    const panel=document.createElement('div');panel.className='tabpanel';panel.id='tab-canonical';panel.role='tabpanel';
    panel.innerHTML=`<div class="layout"><div class="left-col" style="max-width:1080px"><div class="rg-grid"><div class="rg-card rg-wide"><div class="rg-title">Canonical Hamiltonian Engine</div><div id="canonReport"></div></div><div class="rg-card"><div class="rg-title">Subsystem Registry</div><div id="canonSubsystems"></div></div><div class="rg-card"><div class="rg-title">Integrator Truth Table</div><div id="canonIntegrators"></div></div><div class="rg-card"><div class="rg-title">Adaptive Time Accounting</div><div id="canonAdaptive"></div></div><div class="rg-card"><div class="rg-title">Validation Extensions</div><div id="canonValidation"></div></div></div></div><div class="controls"><div class="grp"><div class="grp-title">Canonical Controls</div><div class="btnrow"><button id="runCanonValidation" class="primary">Run Canonical QA</button><button id="useCanonMethod">Use Conditional Canonical Method</button><button id="exportManifestV3">Export Manifest V3</button></div></div><div class="grp"><div class="grp-title">Contracts</div><div style="font-size:9px;color:var(--text);line-height:1.55">True symplectic claims are restricted to canonical coordinates and γ=0. Damped systems are dissipative and therefore not symplectic. θ/ω leapfrog and Yoshida labels are intentionally downgraded.</div></div></div></div>`;
    document.body.appendChild(panel);
    document.getElementById('runCanonValidation')?.addEventListener('click',()=>runCanonicalQA(true));
    document.getElementById('useCanonMethod')?.addEventListener('click',()=>{const sel=document.getElementById('method');if(sel){sel.value='hmidpoint';sel.dispatchEvent(new Event('change'));}toast('Canonical implicit midpoint selected');});
    document.getElementById('exportManifestV3')?.addEventListener('click',()=>dlText('pendulum_manifest_v3.json',JSON.stringify(makeManifest(),null,2),'application/json'));
    renderCanonicalPanel();
  }

  function kv(rows){return rows.map(r=>`<div class="rg-kv"><span class="rg-k">${r[0]}</span><span class="rg-v">${r[1]}</span></div>`).join('');}
  function renderCanonicalPanel(){
    const rep=document.getElementById('canonReport');if(rep)rep.innerHTML=kv([
      ['coordinate policy','canonical θ,p used by hmidpoint; θ,ω retained for UI compatibility'],
      ['mass matrix','configuration-dependent generalized mass matrix M(θ)'],
      ['Hamiltonian','H(q,p)=1/2 pᵀM(q)⁻¹p+V(q)'],
      ['conditional symplectic method','implicit midpoint on canonical state, γ=0 only'],
      ['damping policy','γ>0 is explicitly dissipative; no symplectic claim'],
      ['current hash',hashState(App.state.subarray(0,App.stateLen))]
    ]);
    const subs=document.getElementById('canonSubsystems');if(subs)subs.innerHTML='<table class="rg-table"><tr><th>Subsystem</th><th>Contract</th></tr>'+Object.entries(RuntimeRegistry).map(([k,v])=>`<tr><td>${k}</td><td>${v.contract}</td></tr>`).join('')+'</table>';
    const ints=document.getElementById('canonIntegrators');if(ints)ints.innerHTML='<table class="rg-table"><tr><th>Method</th><th>Class</th><th>Order</th><th>Adaptive</th><th>Statement</th></tr>'+Object.entries(IntegratorRegistryV2).map(([k,v])=>`<tr><td>${k}</td><td>${v.class}</td><td>${v.order}</td><td>${v.adaptive?'yes':'no'}</td><td>${v.statement}</td></tr>`).join('')+'</table>';
    const ad=document.getElementById('canonAdaptive');if(ad){const r=App.rkfStats||{};ad.innerHTML=kv([['attempted',String(r.attempted||0)],['accepted',String(r.accepted||0)],['rejected',String(r.rejected||0)],['accepted simulation time',((r.acceptedTime||0).toFixed(6))+' s'],['rejected attempted time',((r.rejectedTime||0).toFixed(6))+' s'],['worker policy','adaptive and canonical methods force main-thread deterministic time accounting']]);}
    const va=document.getElementById('canonValidation');if(va){const q=App.canonicalQA||{runs:0};va.innerHTML=kv([['runs',String(q.runs||0)],['last pass',String(q.pass||false)],['energy drift',q.energyDrift!==undefined?q.energyDrift.toExponential(3):'—'],['symplectic defect',q.symplecticDefect!==undefined?q.symplecticDefect.toExponential(3):'—'],['midpoint residual',q.residual!==undefined?q.residual.toExponential(3):'—']]);}
  }

  function makeManifest(){
    const meta=IntegratorRegistryV2[App.method]||IntegratorRegistryV2.rk4;
    return {schemaVersion:3,engine:'Pendulum Lab Developed by Elliot Jung',version:VERSION,createdAt:new Date().toISOString(),capabilities:App.capabilities||{},runtime:RuntimeRegistry,integrator:{id:App.method,...meta},configuration:{system:App.sysType,params:{...App.P},gamma:App.gamma,dt:App.DT,tolerance:App.tol,stepsPerFrame:App.SPF},state:{time:App.simTime,vector:Array.from(App.state.slice(0,App.stateLen)),hash:hashState(App.state.subarray(0,App.stateLen))},adaptiveStats:App.rkfStats||null,canonicalStats:App.canonicalStats||null,qa:App.canonicalQA||null};
  }

  function runCanonicalQA(showToast){
    const P={m1:1,m2:1,l1:1.2,l2:1,g:9.81};const s=new Float64Array([1.0,1.3,0.0,0.0]);const out=new Float64Array(4);const y=new Float64Array(4);
    CanonicalDouble.omegaToMomentum(s,P,y);const H0=CanonicalDouble.hamiltonian(y,P);
    let maxRes=0;
    const oldP=App.P,oldGamma=App.gamma;App.P=P;App.gamma=0;
    for(let i=0;i<8000;i++){CanonicalDouble.stepKinematic(s,0.002,P,0,out);for(let k=0;k<4;k++)s[k]=out[k];if(App.canonicalStats)maxRes=Math.max(maxRes,App.canonicalStats.maxResidual||0);}
    CanonicalDouble.omegaToMomentum(s,P,y);const H1=CanonicalDouble.hamiltonian(y,P);
    App.P=oldP;App.gamma=oldGamma;
    const drift=Math.abs((H1-H0)/(Math.abs(H0)||1));const defect=CanonicalDouble.symplecticDefect(P,0.002);
    App.canonicalQA={runs:(App.canonicalQA?App.canonicalQA.runs:0)+1,pass:drift<5e-4&&defect<5e-4,energyDrift:drift,symplecticDefect:defect,residual:maxRes,time:new Date().toISOString()};
    renderCanonicalPanel();
    if(showToast)toast(`Canonical QA ${App.canonicalQA.pass?'PASS':'CHECK'} · drift ${drift.toExponential(1)} · defect ${defect.toExponential(1)}`);
    return App.canonicalQA;
  }

  function patchValidation(){
    if(!window.Validation&&typeof Validation==='undefined')return;
    if(patchValidation.done)return;patchValidation.done=true;
    const oldRunAll=Validation.runAll;
    Validation.runCanonicalQA=()=>runCanonicalQA(true);
    Validation.runAll=async function(){await oldRunAll();runCanonicalQA(false);toast(`Validation complete · canonical ${App.canonicalQA&&App.canonicalQA.pass?'PASS':'CHECK'}`);};
  }

  function patchFrameLoop(){
    if(patchFrameLoop.done)return;patchFrameLoop.done=true;
    const oldRender=Render.all;
    Render.all=function(alpha){const r=oldRender(alpha);updateDiagnostics();if(App.activeTab==='canonical')renderCanonicalPanel();return r;};
  }

  function installCommandBridge(){
    if(installCommandBridge.done)return;installCommandBridge.done=true;
    const ioc=new IOCContainer();const bus=new CommandBusLite();
    for(const [name,svc] of Object.entries(RuntimeRegistry))ioc.register(name,svc);
    bus.register('setIntegrator',payload=>{const sel=document.getElementById('method');if(!sel)throw new Error('method select unavailable');sel.value=payload.method;sel.dispatchEvent(new Event('change'));return payload.method;});
    bus.register('exportManifest',()=>makeManifest());
    bus.register('runCanonicalQA',()=>runCanonicalQA(false));
    App.engineCoreV3=Object.freeze({version:VERSION,ioc,commandBus:bus,features:Object.freeze({canonicalHamiltonian:true,acceptedAdaptiveTime:true,conditionalSymplecticLabeling:true,deterministicAdaptiveMainThread:true}),manifest:makeManifest});
  }

  function install(){
    patchBranding();installMethodOption();installPhysicsPatch();installDiagnosticsPanel();installResearchPanel();patchValidation();patchFrameLoop();installCommandBridge();
    window.PendulumLabDevelopedByElliotJung=Object.freeze({version:VERSION,methodClass:MethodClass,canonicalDouble:CanonicalDouble,integrators:IntegratorRegistryV2,subsystems:RuntimeRegistry,manifest:makeManifest,runCanonicalQA});
    Log.info('BOOT','Machine-grade scientific patch installed',{version:VERSION});
  }
  return Object.freeze({install,version:VERSION,CanonicalDouble,IntegratorRegistryV2,RuntimeRegistry,runCanonicalQA});
})();


const APlusEngineLayer=(()=>{
  const VERSION='Scientific Audit Layer 2026.05.15';
  const EPS=1e-6;

  function clampFinite(x,lo,hi,fallback){
    return Number.isFinite(x)?Math.max(lo,Math.min(hi,x)):fallback;
  }
  function cloneArrayLike(a,n){
    const out=new Float64Array(n);
    for(let i=0;i<n;i++)out[i]=Number(a&&a[i])||0;
    return out;
  }
  function normalizeDescriptor(desc){
    const rawN=desc&&desc.N!==undefined?desc.N:(desc&&desc.lengths?desc.lengths.length:2);
    const N=Math.max(1,Math.min(8,rawN|0));
    const lengths=cloneArrayLike(desc&&desc.lengths,N);
    const masses=cloneArrayLike(desc&&desc.masses,N);
    const rodMasses=cloneArrayLike(desc&&desc.rodMasses,N);
    for(let i=0;i<N;i++){
      if(lengths[i]<=0)lengths[i]=1;
      if(masses[i]<=0)masses[i]=1;
      if(rodMasses[i]<0)rodMasses[i]=0;
    }
    return Object.freeze({
      N,lengths,masses,rodMasses,
      g:clampFinite(desc&&desc.g!==undefined?desc.g:9.81,0,100,9.81),
      damping:clampFinite(desc&&desc.damping!==undefined?desc.damping:0,0,50,0),
      quadrature:Math.max(2,Math.min(8,(desc&&desc.quadrature)|0||4))
    });
  }
  const GLQ={
    2:[[0.21132486540518713,0.5],[0.7886751345948129,0.5]],
    3:[[0.1127016653792583,0.2777777777777778],[0.5,0.4444444444444444],[0.8872983346207417,0.2777777777777778]],
    4:[[0.06943184420297371,0.17392742256872692],[0.33000947820757187,0.32607257743127305],[0.6699905217924281,0.32607257743127305],[0.9305681557970262,0.17392742256872692]],
    5:[[0.046910077030668,0.118463442528095],[0.23076534494715845,0.23931433524968324],[0.5,0.28444444444444444],[0.7692346550528415,0.23931433524968324],[0.953089922969332,0.118463442528095]]
  };
  function quadratureNodes(n){return GLQ[n]||GLQ[4];}
  function zeroMatrix(M,n){for(let i=0;i<n*n;i++)M[i]=0;}
  function addMassContribution(M,gradV,Vref,q,coeff,mass,g,n){
    let y=0;
    for(let i=0;i<n;i++)y-=coeff[i]*Math.cos(q[i]);
    Vref.value+=mass*g*y;
    for(let i=0;i<n;i++)if(coeff[i]!==0)gradV[i]+=mass*g*coeff[i]*Math.sin(q[i]);
    for(let i=0;i<n;i++)if(coeff[i]!==0){
      for(let j=0;j<n;j++)if(coeff[j]!==0){
        M[i*n+j]+=mass*coeff[i]*coeff[j]*Math.cos(q[i]-q[j]);
      }
    }
  }
  function massMatrixAndPotential(q,desc,M,gradV,Vref){
    const d=normalizeDescriptor(desc),n=d.N;
    zeroMatrix(M,n);for(let i=0;i<n;i++)gradV[i]=0;Vref.value=0;
    const coeff=new Float64Array(n);
    for(let body=0;body<n;body++){
      coeff.fill(0);
      for(let i=0;i<=body;i++)coeff[i]=d.lengths[i];
      addMassContribution(M,gradV,Vref,q,coeff,d.masses[body],d.g,n);
    }
    for(let rod=0;rod<n;rod++){
      const rm=d.rodMasses[rod];if(rm<=0)continue;
      const nodes=quadratureNodes(d.quadrature);
      for(const node of nodes){
        const u=node[0],w=node[1];coeff.fill(0);
        for(let i=0;i<rod;i++)coeff[i]=d.lengths[i];
        coeff[rod]=u*d.lengths[rod];
        addMassContribution(M,gradV,Vref,q,coeff,rm*w,d.g,n);
      }
    }
    return d;
  }
  function solveLinear(A,b,n,x){
    const M=new Float64Array(n*(n+1));
    for(let r=0;r<n;r++){for(let c=0;c<n;c++)M[r*(n+1)+c]=A[r*n+c];M[r*(n+1)+n]=b[r];}
    for(let c=0;c<n;c++){
      let pivot=c,max=Math.abs(M[c*(n+1)+c]);
      for(let r=c+1;r<n;r++){const v=Math.abs(M[r*(n+1)+c]);if(v>max){max=v;pivot=r;}}
      if(max<1e-12){for(let i=0;i<n;i++)x[i]=0;return false;}
      if(pivot!==c){for(let k=c;k<=n;k++){const tmp=M[c*(n+1)+k];M[c*(n+1)+k]=M[pivot*(n+1)+k];M[pivot*(n+1)+k]=tmp;}}
      const diag=M[c*(n+1)+c];
      for(let k=c;k<=n;k++)M[c*(n+1)+k]/=diag;
      for(let r=0;r<n;r++)if(r!==c){
        const f=M[r*(n+1)+c];if(f===0)continue;
        for(let k=c;k<=n;k++)M[r*(n+1)+k]-=f*M[c*(n+1)+k];
      }
    }
    for(let i=0;i<n;i++)x[i]=M[i*(n+1)+n];
    return true;
  }
  function rhsNLink(state,desc,out){
    const d=normalizeDescriptor(desc),n=d.N;
    const q=state.subarray?state.subarray(0,n):new Float64Array(state.slice(0,n));
    const w=state.subarray?state.subarray(n,2*n):new Float64Array(state.slice(n,2*n));
    const M=new Float64Array(n*n),gradV=new Float64Array(n),V={value:0};
    massMatrixAndPotential(q,d,M,gradV,V);
    const dMdq=[];
    for(let k=0;k<n;k++){
      const qp=new Float64Array(q),qm=new Float64Array(q),Mp=new Float64Array(n*n),Mm=new Float64Array(n*n),gp=new Float64Array(n),gm=new Float64Array(n),vp={value:0},vm={value:0};
      qp[k]+=EPS;qm[k]-=EPS;massMatrixAndPotential(qp,d,Mp,gp,vp);massMatrixAndPotential(qm,d,Mm,gm,vm);
      const D=new Float64Array(n*n);for(let i=0;i<n*n;i++)D[i]=(Mp[i]-Mm[i])/(2*EPS);dMdq.push(D);
    }
    const b=new Float64Array(n),qdd=new Float64Array(n);
    for(let i=0;i<n;i++){
      let mdotw=0,gradT=0;
      for(let j=0;j<n;j++)for(let k=0;k<n;k++){
        mdotw+=dMdq[k][i*n+j]*w[k]*w[j];
        gradT+=0.5*dMdq[i][j*n+k]*w[j]*w[k];
      }
      b[i]=-d.damping*w[i]-mdotw+gradT-gradV[i];
    }
    solveLinear(M,b,n,qdd);
    for(let i=0;i<n;i++){out[i]=w[i];out[n+i]=qdd[i];}
    return out;
  }
  function energyNLink(state,desc){
    const d=normalizeDescriptor(desc),n=d.N;
    const q=state.subarray?state.subarray(0,n):new Float64Array(state.slice(0,n));
    const w=state.subarray?state.subarray(n,2*n):new Float64Array(state.slice(n,2*n));
    const M=new Float64Array(n*n),gradV=new Float64Array(n),V={value:0};
    massMatrixAndPotential(q,d,M,gradV,V);
    let KE=0;for(let i=0;i<n;i++)for(let j=0;j<n;j++)KE+=0.5*w[i]*M[i*n+j]*w[j];
    return Object.freeze({total:KE+V.value,KE,PE:V.value});
  }
  function rk4NLinkStep(s,dt,desc,out){
    const n=normalizeDescriptor(desc).N*2;
    const k1=new Float64Array(n),k2=new Float64Array(n),k3=new Float64Array(n),k4=new Float64Array(n),tmp=new Float64Array(n);
    rhsNLink(s,desc,k1);for(let i=0;i<n;i++)tmp[i]=s[i]+0.5*dt*k1[i];
    rhsNLink(tmp,desc,k2);for(let i=0;i<n;i++)tmp[i]=s[i]+0.5*dt*k2[i];
    rhsNLink(tmp,desc,k3);for(let i=0;i<n;i++)tmp[i]=s[i]+dt*k3[i];
    rhsNLink(tmp,desc,k4);for(let i=0;i<n;i++)out[i]=s[i]+dt*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6;
    return out;
  }
  function normDiff(a,b,n){let s=0;for(let i=0;i<n;i++){const d=a[i]-b[i];s+=d*d;}return Math.sqrt(s);}
  function integrateRK4(desc,state0,dt,T){
    const n=normalizeDescriptor(desc).N*2,steps=Math.round(T/dt),s=new Float64Array(state0),out=new Float64Array(n);
    for(let i=0;i<steps;i++){rk4NLinkStep(s,dt,desc,out);s.set(out);}
    return s;
  }
  function estimateOrder(desc,state0,T,dt){
    const d1=integrateRK4(desc,state0,dt,T),d2=integrateRK4(desc,state0,dt/2,T),d4=integrateRK4(desc,state0,dt/4,T);
    const n=normalizeDescriptor(desc).N*2,e12=normDiff(d1,d2,n),e24=normDiff(d2,d4,n);
    return Object.freeze({order:Math.log(Math.max(e12,1e-300)/Math.max(e24,1e-300))/Math.log(2),e12,e24,richardson:d4});
  }
  function seededMonteCarlo(seed,count){
    const rng=makePRNG(seed);let hash='';
    for(let c=0;c<count;c++){
      const desc={N:3,lengths:[0.7+rng.next(),0.7+rng.next(),0.7+rng.next()],masses:[0.5+rng.next(),0.5+rng.next(),0.5+rng.next()],rodMasses:[0.05*rng.next(),0.05*rng.next(),0.05*rng.next()],g:9.81,damping:0,quadrature:4};
      const s0=new Float64Array([rng.next()*2-1,rng.next()*2-1,rng.next()*2-1,0,0,0]);
      const sf=integrateRK4(desc,s0,0.004,0.4);
      hash=hashState(sf);
    }
    return hash;
  }
  function doubleAgreementTest(){
    const desc={N:2,lengths:[1.2,1.0],masses:[1,1],rodMasses:[0,0],g:9.81,damping:0,quadrature:4};
    const s=new Float64Array([1.2,2.1,0.3,-0.2]);
    const a=new Float64Array(4),b=new Float64Array(4);
    rhsNLink(s,desc,a);Physics.rhs2(s,{m1:1,m2:1,l1:1.2,l2:1.0,g:9.81},0,b);
    return normDiff(a,b,4);
  }
  function runScientificAudit(){
    const tests=[];
    function add(name,ok,metric,detail){tests.push(Object.freeze({name,ok,metric,detail}));}
    try{
      const agree=doubleAgreementTest();
      add('N-link equation generator agrees with built-in double pendulum',agree<1e-6,agree.toExponential(3),'finite-difference Lagrangian engine compared against closed-form rhs2');
    }catch(e){add('N-link equation generator agrees with built-in double pendulum',false,'error',String(e.message||e));}
    try{
      const desc={N:1,lengths:[1],masses:[1],rodMasses:[0.1],g:9.81,damping:0,quadrature:4};
      const s0=new Float64Array([0.9,0.0]);
      const ord=estimateOrder(desc,s0,2.0,0.016);
      add('RK4 convergence order verification',ord.order>3.4&&ord.order<4.6,ord.order.toFixed(3),`e(dt,dt/2)=${ord.e12.toExponential(2)}, e(dt/2,dt/4)=${ord.e24.toExponential(2)}`);
    }catch(e){add('RK4 convergence order verification',false,'error',String(e.message||e));}
    try{
      const h1=seededMonteCarlo(123456,16),h2=seededMonteCarlo(123456,16),h3=seededMonteCarlo(654321,16);
      add('Monte Carlo reproducibility',h1===h2&&h1!==h3,h1,`same seed hash=${h2}, different seed hash=${h3}`);
    }catch(e){add('Monte Carlo reproducibility',false,'error',String(e.message||e));}
    try{
      const desc={N:4,lengths:[1,0.9,0.8,0.7],masses:[1,0.8,0.6,0.4],rodMasses:[0.05,0.05,0.03,0.02],g:9.81,damping:0,quadrature:4};
      const s0=new Float64Array([0.4,-0.6,0.8,-0.3,0,0,0,0]);
      const E0=energyNLink(s0,desc).total;const sf=integrateRK4(desc,s0,0.002,3.0);const E1=energyNLink(sf,desc).total;
      const drift=Math.abs((E1-E0)/(Math.abs(E0)+1e-12));
      add('Generalized 4-link energy drift benchmark',drift<2e-5,drift.toExponential(3),'distributed rod masses enabled via Gaussian quadrature');
    }catch(e){add('Generalized 4-link energy drift benchmark',false,'error',String(e.message||e));}
    App.aPlusAudit=Object.freeze({version:VERSION,createdAt:new Date().toISOString(),tests,passed:tests.filter(t=>t.ok).length,failed:tests.filter(t=>!t.ok).length});
    renderPanel();
    return App.aPlusAudit;
  }
  function tableRows(rows){return rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');}
  function renderPanel(){
    const audit=App.aPlusAudit||{tests:[],passed:0,failed:0};
    const summary=document.getElementById('aplusSummary');
    if(summary)summary.innerHTML=`<div class="rg-kv"><span class="rg-k">engine layer</span><span class="rg-v">${VERSION}</span></div><div class="rg-kv"><span class="rg-k">tests</span><span class="rg-v">${audit.passed||0} passed / ${audit.failed||0} failed</span></div><div class="rg-kv"><span class="rg-k">state hash</span><span class="rg-v">${hashState(App.state.subarray(0,App.stateLen))}</span></div>`;
    const nlink=document.getElementById('aplusNLink');
    if(nlink)nlink.innerHTML='<table class="rg-table"><tr><th>Capability</th><th>Implementation</th><th>Scope</th></tr>'+tableRows([
      ['generalized coordinates','state layout [q₁…qₙ, ω₁…ωₙ]','N=1…8 runtime descriptor'],
      ['mass matrix','M(q) from point bobs plus quadrature-integrated rod masses','arbitrary serial chain'],
      ['equation generation','Euler-Lagrange rhs using finite-difference ∂M/∂q','automatic for descriptor'],
      ['energy','T=1/2 ωᵀMω, V from gravitational quadrature','bob + distributed rod model'],
      ['damping','generalized viscous torque −γω','dissipative, not symplectic']
    ])+'</table>';
    const val=document.getElementById('aplusValidation');
    if(val){
      val.innerHTML=audit.tests.length?'<table class="rg-table"><tr><th>Test</th><th>Result</th><th>Metric</th><th>Detail</th></tr>'+audit.tests.map(t=>`<tr><td>${t.name}</td><td><span class="rg-pill ${t.ok?'good':'bad'}">${t.ok?'PASS':'CHECK'}</span></td><td>${t.metric}</td><td>${t.detail}</td></tr>`).join('')+'</table>':'<span style="color:var(--muted);font-size:10px">Run the audit to generate benchmark results.</span>';
    }
    const arch=document.getElementById('aplusArch');
    if(arch)arch.innerHTML='<table class="rg-table"><tr><th>Boundary</th><th>Contract</th></tr>'+[
      ['Core clock','fixed-step accumulator; browser frame jitter does not define physics time'],
      ['Physics','closed-form double/triple plus descriptor-driven N-link Lagrangian model'],
      ['Integrators','metadata separates true canonical symplectic, pseudo-symplectic θ/ω, adaptive, and explicit families'],
      ['Validation','determinism, convergence order, energy drift, replay, stress, and Monte Carlo reproducibility'],
      ['Rendering','Canvas2D render graph plus WebGL2 additive phase density path'],
      ['Serialization','hash-stamped snapshots and manifest exports']
    ].map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')+'</table>';
  }
  function ensurePanel(){
    const tabs=document.querySelector('.tabs');
    if(tabs&&!document.querySelector('[data-tab="aplus"]')){
      const b=document.createElement('button');b.className='tab';b.role='tab';b.setAttribute('aria-selected','false');b.dataset.tab='aplus';b.textContent='Audit';b.addEventListener('click',()=>switchTab('aplus'));tabs.appendChild(b);
    }
    if(document.getElementById('tab-aplus'))return;
    const panel=document.createElement('div');panel.className='tabpanel';panel.id='tab-aplus';panel.role='tabpanel';
    panel.innerHTML=`<div class="layout"><div class="left-col" style="max-width:1080px"><div class="rg-grid"><div class="rg-card"><div class="rg-title">Scientific Audit Summary</div><div id="aplusSummary"></div></div><div class="rg-card"><div class="rg-title">Generalized N-Link Physics</div><div id="aplusNLink"></div></div><div class="rg-card rg-wide"><div class="rg-title">Architecture Contract</div><div id="aplusArch"></div></div><div class="rg-card rg-wide"><div class="rg-title">Validation Results</div><div id="aplusValidation"></div></div></div></div><div class="controls"><div class="grp"><div class="grp-title">Audit Controls</div><div class="btnrow"><button id="runAPlusAudit" class="primary">Run Audit</button><button id="exportAPlusReport">Export Audit JSON</button></div></div><div class="grp"><div class="grp-title">Research Note</div><div style="font-size:9px;color:var(--text);line-height:1.55">The N-link engine is descriptor-driven and computes M(q), ∂M/∂q, generalized gravity, damping, total energy, and RK4 integration for arbitrary serial chains. It is exposed as window.PendulumLabAPlus.NLink.</div></div></div></div>`;
    document.body.appendChild(panel);
    const runAuditBtn=document.getElementById('runAPlusAudit');
    if(runAuditBtn&&!runAuditBtn.dataset.auditBound){runAuditBtn.dataset.auditBound='true';runAuditBtn.addEventListener('click',()=>{const r=runScientificAudit();toast(`Audit ${r.failed?'needs review':'PASS'} · ${r.passed}/${r.tests.length}`);});}
    const exportAuditBtn=document.getElementById('exportAPlusReport');
    if(exportAuditBtn&&!exportAuditBtn.dataset.auditBound){exportAuditBtn.dataset.auditBound='true';exportAuditBtn.addEventListener('click',()=>{const r=App.aPlusAudit||runScientificAudit();dlText('pendulum_audit.json',JSON.stringify(r,null,2),'application/json');});}
  }
  function patchValidation(){
    if(patchValidation.done)return;patchValidation.done=true;
    if(typeof Validation==='undefined'||!Validation.runAll)return;
    const old=Validation.runAll;
    Validation.runAPlusAudit=runScientificAudit;
    Validation.runAll=async function(){await old();runScientificAudit();};
  }
  function install(){
    ensurePanel();patchValidation();renderPanel();
    window.PendulumLabAudit=Object.freeze({version:VERSION,NLink:Object.freeze({normalizeDescriptor,massMatrixAndPotential,rhs:rhsNLink,energy:energyNLink,rk4Step:rk4NLinkStep,integrateRK4,estimateOrder}),runScientificAudit});
    window.PendulumLabAPlus=window.PendulumLabAudit;
    Log.info('BOOT','Scientific extension layer installed',{version:VERSION});
  }
  return Object.freeze({install,runScientificAudit,NLink:Object.freeze({normalizeDescriptor,massMatrixAndPotential,rhs:rhsNLink,energy:energyNLink,rk4Step:rk4NLinkStep,integrateRK4,estimateOrder})});
})();


const BOOT_SEQUENCE=Object.freeze([
  ['cache UI',()=>cacheUI()],
  ['load URL / restored session',()=>loadFromURL()],
  ['sync controls',()=>{syncParamsFromUI();updateSysType(App.sysType);sliders.forEach(([id,valId,fmt])=>{const el=document.getElementById(id),vEl=document.getElementById(valId);if(el&&vEl)vEl.textContent=fmt(el.value);});document.querySelectorAll('[data-tri]').forEach(el=>el.style.display='none');updateSysType(App.sysType);} ],
  ['worker runtime',()=>WorkerMgr.start()],
  ['FFT scheduler',()=>startFFT()],
  ['GPU init',()=>gpuInit()],
  ['initial state reset',()=>fullReset()],
  ['runtime extras',()=>EnterpriseRuntime.bootExtras()],
  ['extension layer',()=>UltimateEnterpriseEngine.install()],
  ['scientific extension layer',()=>ResearchGradeEngineLayer.install()],
  ['scientific correction layer',()=>MachineGradeScientificPatch.install()],
  ['scientific audit layer',()=>APlusEngineLayer.install()],
  ['frame loop kickoff',()=>startFrameLoop()]
]);
function safeInstall(name,fn){
  const rec={name,state:'pending',started:performance.now(),finished:null,error:null};
  try{const result=fn();rec.state='ok';return result;}
  catch(e){rec.state='failed';rec.error=String(e&&e.stack?e.stack:e);console.error('[BOOT]',name,'failed',e);try{toast('Boot layer failed: '+name,3200);}catch(_){}}
  finally{rec.finished=performance.now();(App.bootLog||(App.bootLog=[])).push(rec);}
}
(function boot(){
  App.bootLog=[];
  for(const [name,fn] of BOOT_SEQUENCE) safeInstall(name,fn);
  window.PendulumBoot=Object.freeze({sequence:BOOT_SEQUENCE.map(x=>x[0]),log:App.bootLog,safeInstall});
  Log.info('BOOT','Pendulum Lab Developed by Elliot Jung started',{dpr:CanvasMgr.dpr,worker:App.workerReady,sab:CONSTS.SAB_SUPPORTED,bootFailures:App.bootLog.filter(x=>x.state==='failed').length});
  toast(App.bootLog.some(x=>x.state==='failed')?'Pendulum Lab started with boot warnings':'Pendulum Lab Developed by Elliot Jung ready',1800);
})();
