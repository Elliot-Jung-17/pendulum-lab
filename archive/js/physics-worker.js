'use strict';
const CONSTS={LYAP_EPS:1e-8,NAN_THRESHOLD:1e10,DET_THRESHOLD:1e-14,MAX_STATE_DIM:8};
const sc={
  k1:new Float64Array(8),k2:new Float64Array(8),k3:new Float64Array(8),k4:new Float64Array(8),
  k5:new Float64Array(8),k6:new Float64Array(8),k7:new Float64Array(8),
  tmp:new Float64Array(8),tmpN:new Float64Array(8),
  impl:new Float64Array(8),implPrev:new Float64Array(8),A:new Float64Array(12),
};
// Yoshida 4th-order symplectic composition coefficients (Yoshida 1990)
const _Y_W1=1.3512071919596578,_Y_W0=1-2*1.3512071919596578;
function vAdd(dst,a,k,b,n){for(let i=0;i<n;i++) dst[i]=a[i]+k*b[i];}
function vCopy(dst,s,n){for(let i=0;i<n;i++) dst[i]=s[i];}
// Equations of motion — double pendulum (Lagrangian, 2×2 mass-matrix inversion)
function rhs2(s,P,gamma,out){
  const t1=s[0],t2=s[1],w1=s[2],w2=s[3],m1=P.m1,m2=P.m2,l1=P.l1,l2=P.l2,g=P.g;
  const d=t1-t2,sd=Math.sin(d),cd=Math.cos(d);
  const M11=(m1+m2)*l1*l1,M12=m2*l1*l2*cd,M22=m2*l2*l2;
  const det=M11*M22-M12*M12;
  out[0]=w1;out[1]=w2;
  if(Math.abs(det)<1e-14){out[2]=0;out[3]=0;return out;}
  const f1=-m2*l1*l2*sd*w2*w2-(m1+m2)*g*l1*Math.sin(t1)-gamma*w1;
  const f2=m2*l1*l2*sd*w1*w1-m2*g*l2*Math.sin(t2)-gamma*w2;
  out[2]=(M22*f1-M12*f2)/det;out[3]=(-M12*f1+M11*f2)/det;return out;
}
// Equations of motion — triple pendulum (3×3 augmented matrix, partial pivoting)
function rhs3(s,P,gamma,out){
  const t1=s[0],t2=s[1],t3=s[2],w1=s[3],w2=s[4],w3=s[5];
  const m1=P.m1,m2=P.m2,m3=P.m3,l1=P.l1,l2=P.l2,l3=P.l3,g=P.g;
  const d12=t1-t2,d23=t2-t3,d13=t1-t3;
  const M11=(m1+m2+m3)*l1*l1,M12=(m2+m3)*l1*l2*Math.cos(d12),M13=m3*l1*l3*Math.cos(d13);
  const M22=(m2+m3)*l2*l2,M23=m3*l2*l3*Math.cos(d23),M33=m3*l3*l3;
  const f1=-(m2+m3)*l1*l2*Math.sin(d12)*w2*w2-m3*l1*l3*Math.sin(d13)*w3*w3-(m1+m2+m3)*g*l1*Math.sin(t1)-gamma*w1;
  const f2=(m2+m3)*l1*l2*Math.sin(d12)*w1*w1-m3*l2*l3*Math.sin(d23)*w3*w3-(m2+m3)*g*l2*Math.sin(t2)-gamma*w2;
  const f3=m3*l1*l3*Math.sin(d13)*w1*w1+m3*l2*l3*Math.sin(d23)*w2*w2-m3*g*l3*Math.sin(t3)-gamma*w3;
  const A=sc.A;
  A[0]=M11;A[1]=M12;A[2]=M13;A[3]=f1;A[4]=M12;A[5]=M22;A[6]=M23;A[7]=f2;A[8]=M13;A[9]=M23;A[10]=M33;A[11]=f3;
  for(let c=0;c<3;c++){
    let mx=c;for(let r=c+1;r<3;r++) if(Math.abs(A[r*4+c])>Math.abs(A[mx*4+c])) mx=r;
    if(mx!==c) for(let k=0;k<4;k++){const t=A[c*4+k];A[c*4+k]=A[mx*4+k];A[mx*4+k]=t;}
    if(Math.abs(A[c*4+c])<1e-14){out[0]=w1;out[1]=w2;out[2]=w3;out[3]=0;out[4]=0;out[5]=0;return out;}
    for(let r=0;r<3;r++) if(r!==c){const f=A[r*4+c]/A[c*4+c];for(let k=c;k<4;k++) A[r*4+k]-=f*A[c*4+k];}
  }
  out[0]=w1;out[1]=w2;out[2]=w3;
  out[3]=Math.max(-200,Math.min(200,A[3]/A[0]));
  out[4]=Math.max(-200,Math.min(200,A[7]/A[5]));
  out[5]=Math.max(-200,Math.min(200,A[11]/A[10]));
  return out;
}
function rk4step(s,dt,f,n,out){
  const{k1,k2,k3,k4,tmp}=sc;
  f(s,k1);vAdd(tmp,s,0.5*dt,k1,n);f(tmp,k2);vAdd(tmp,s,0.5*dt,k2,n);f(tmp,k3);vAdd(tmp,s,dt,k3,n);f(tmp,k4);
  for(let i=0;i<n;i++) out[i]=s[i]+dt/6*(k1[i]+2*k2[i]+2*k3[i]+k4[i]);return out;
}
function rk2step(s,dt,f,n,out){const{k1,k2,tmp}=sc;f(s,k1);vAdd(tmp,s,0.5*dt,k1,n);f(tmp,k2);for(let i=0;i<n;i++) out[i]=s[i]+dt*k2[i];return out;}
function eulerstep(s,dt,f,n,out){const{k1}=sc;f(s,k1);for(let i=0;i<n;i++) out[i]=s[i]+dt*k1[i];return out;}
function leapfrogstep(s,dt,f,n,out){
  const half=n>>1,a0=sc.k1;f(s,a0);
  for(let i=0;i<half;i++) out[i+half]=s[i+half]+0.5*dt*a0[i+half];
  for(let i=0;i<half;i++) out[i]=s[i]+dt*out[i+half];
  const a1=sc.k2;f(out,a1);
  for(let i=0;i<half;i++) out[i+half]=out[i+half]+0.5*dt*a1[i+half];return out;
}
function symplstep(s,dt,f,n,out){
  const half=n>>1,a=sc.k1;f(s,a);vCopy(out,s,n);
  for(let i=0;i<half;i++) out[i+half]+=dt*a[i+half];
  for(let i=0;i<half;i++) out[i]+=dt*out[i+half];return out;
}
function yoshida4step(s,dt,f,n,out){
  const half=n>>1;vCopy(out,s,n);const stages=[_Y_W1,_Y_W0,_Y_W1];
  for(let st=0;st<3;st++){const c=stages[st],a=sc.k1;f(out,a);for(let i=0;i<half;i++) out[i+half]+=(c*dt)*a[i+half];for(let i=0;i<half;i++) out[i]+=(c*dt)*out[i+half];}
  return out;
}
// Gauss-Legendre implicit midpoint — fixed-point 8-step Newton, tol=1e-10
function gauss2step(s,dt,f,n,out){
  const k=sc.k1,prev=sc.implPrev,mid=sc.tmp;f(s,k);
  for(let i=0;i<n;i++) mid[i]=s[i]+0.5*dt*k[i];
  for(let iter=0;iter<8;iter++){vCopy(prev,mid,n);f(mid,k);let mx=0;for(let i=0;i<n;i++){const nm=s[i]+0.5*dt*k[i],d=Math.abs(nm-prev[i]);if(d>mx)mx=d;mid[i]=nm;}if(mx<1e-10)break;}
  f(mid,k);for(let i=0;i<n;i++) out[i]=s[i]+dt*k[i];return out;
}
function rkf45step(s,dt,f,n,tol,prevErrRef){
  const{k1,k2,k3,k4,k5,k6,k7,tmp,tmpN}=sc;
  f(s,k1);vAdd(tmp,s,dt*(1/5),k1,n);f(tmp,k2);
  for(let i=0;i<n;i++) tmp[i]=s[i]+dt*(3/40*k1[i]+9/40*k2[i]);f(tmp,k3);
  for(let i=0;i<n;i++) tmp[i]=s[i]+dt*(44/45*k1[i]-56/15*k2[i]+32/9*k3[i]);f(tmp,k4);
  for(let i=0;i<n;i++) tmp[i]=s[i]+dt*(19372/6561*k1[i]-25360/2187*k2[i]+64448/6561*k3[i]-212/729*k4[i]);f(tmp,k5);
  for(let i=0;i<n;i++) tmp[i]=s[i]+dt*(9017/3168*k1[i]-355/33*k2[i]+46732/5247*k3[i]+49/176*k4[i]-5103/18656*k5[i]);f(tmp,k6);
  for(let i=0;i<n;i++) tmpN[i]=s[i]+dt*(35/384*k1[i]+500/1113*k3[i]+125/192*k4[i]-2187/6784*k5[i]+11/84*k6[i]);
  f(tmpN,k7);
  const e1=71/57600,e3=-71/16695,e4=71/1920,e5=-17253/339200,e6=22/525,e7=-1/40;
  let err=0;
  for(let i=0;i<n;i++){const e=dt*(e1*k1[i]+e3*k3[i]+e4*k4[i]+e5*k5[i]+e6*k6[i]+e7*k7[i]);const sc_=tol+tol*Math.max(Math.abs(s[i]),Math.abs(tmpN[i]));err+=(e/sc_)*(e/sc_);}
  err=Math.sqrt(err/n);const prevErr=prevErrRef.value||err;const alpha=0.7/5,beta=0.4/5;
  if(err<=1){const fac=err===0?5:Math.min(5,Math.max(0.2,0.9*Math.pow(err,-alpha)*Math.pow(prevErr,beta)));prevErrRef.value=err;return{state:tmpN,accepted:true,dtNext:Math.min(dt*fac,0.05)};}
  else{return{state:s,accepted:false,dtNext:Math.max(dt*0.5,1e-6)};}
}
function doStep(method,s,dt,f,n,out){
  if(method==='rk2') return rk2step(s,dt,f,n,out);
  if(method==='euler') return eulerstep(s,dt,f,n,out);
  if(method==='leapfrog'||method==='verlet') return leapfrogstep(s,dt,f,n,out);
  if(method==='symplectic') return symplstep(s,dt,f,n,out);
  if(method==='yoshida4') return yoshida4step(s,dt,f,n,out);
  if(method==='gauss2') return gauss2step(s,dt,f,n,out);
  return rk4step(s,dt,f,n,out);
}
function makeF(sys,P,gamma){if(sys==='triple') return(s,o)=>rhs3(s,P,gamma,o);return(s,o)=>rhs2(s,P,gamma,o);}
const cancelled=new Set();
self.onmessage=(ev)=>{
  const m=ev.data;const t0=performance.now();
  if(m.type==='cancel'){cancelled.add(m.taskId);return;}
  if(m.type==='step'){
    const{sys,P,gamma,method,dt,tol,steps,shadow,ensemble,withLyap,n}=m;
    const f=makeF(sys,P,gamma);
    const s = m.sab ? new Float64Array(m.sab) : new Float64Array(m.state);
    const sh=shadow?new Float64Array(shadow):null;
    const ens=ensemble.map(e=>new Float64Array(e));
    const sout=new Float64Array(n),shout=new Float64Array(n),eout=new Float64Array(n);
    const prevErrRef={value:m.prevErr||0};
    let lyapAdd=0,lyapDt=0,dtNext=dt;
    const poincCrossings=[];
    const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
    for(let i=0;i<steps;i++){
      const prev0=s[0],prev1=s[1],prev3=s[sys==='triple'?4:3];
      let ok=true;
      if(method==='rkf45'){
        const r=rkf45step(s,dtNext,f,n,tol||1e-6,prevErrRef);
        dtNext=Math.min(r.dtNext,0.05);if(!r.accepted)continue;
        for(let q=0;q<n;q++) sout[q]=r.state[q];
      }else{doStep(method,s,dt,f,n,sout);}
      for(let q=0;q<n;q++) if(!isFinite(sout[q])||Math.abs(sout[q])>1e10){ok=false;break;}
      if(!ok) break;
      for(let q=0;q<n;q++) s[q]=sout[q];
      for(let k=0;k<ens.length;k++){doStep(method==='rkf45'?'rk4':method,ens[k],dt,f,n,eout);for(let q=0;q<n;q++) ens[k][q]=eout[q];}
      if(sh&&withLyap){
        doStep(method==='rkf45'?'rk4':method,sh,dt,f,n,shout);for(let q=0;q<n;q++) sh[q]=shout[q];
        let dist=0;for(let q=0;q<n;q++){const d=sh[q]-s[q];dist+=d*d;}dist=Math.sqrt(dist);
        if(dist>0){lyapAdd+=Math.log(dist/1e-8);lyapDt+=dt;const k=1e-8/dist;for(let q=0;q<n;q++) sh[q]=s[q]+(sh[q]-s[q])*k;}
      }
      if(sys==='double'){
        const a=wrap(prev0),b=wrap(s[0]);
        if(a<0&&b>=0&&s[2]>0){const fr=-a/(b-a);poincCrossings.push({t2:wrap(prev1+fr*(s[1]-prev1)),w2:prev3+fr*(s[3]-prev3)});}
      }
    }
    self.postMessage({type:'stepDone', state: m.sab ? null : Array.from(s), shadow:sh?Array.from(sh):null,
      ensemble:ens.map(e=>Array.from(e)),lyapAdd,lyapDt,poincCrossings,dtNext,prevErr:prevErrRef.value,elapsed:performance.now()-t0});
  }
  else if(m.type==='sweep'){
    const{taskId,res,T,P,gamma,dt}=m;const out=new Float32Array(res*res);const eps=1e-8;
    const f=(s,o)=>rhs2(s,P,gamma,o);
    const sBuf=new Float64Array(4),shBuf=new Float64Array(4),tmpOut=new Float64Array(4);
    for(let iy=0;iy<res;iy++){
      if(cancelled.has(taskId)){self.postMessage({type:'sweepCancelled',taskId});cancelled.delete(taskId);return;}
      for(let ix=0;ix<res;ix++){
        const t1=-Math.PI+2*Math.PI*ix/(res-1),t2=-Math.PI+2*Math.PI*iy/(res-1);
        sBuf[0]=t1;sBuf[1]=t2;sBuf[2]=0;sBuf[3]=0;
        shBuf[0]=t1+eps;shBuf[1]=t2;shBuf[2]=0;shBuf[3]=0;
        let sum=0,time=0;const N=Math.round(T/dt);
        for(let k=0;k<N;k++){
          rk4step(sBuf,dt,f,4,tmpOut);for(let q=0;q<4;q++) sBuf[q]=tmpOut[q];
          rk4step(shBuf,dt,f,4,tmpOut);for(let q=0;q<4;q++) shBuf[q]=tmpOut[q];
          let d=0;for(let q=0;q<4;q++){const dd=shBuf[q]-sBuf[q];d+=dd*dd;}d=Math.sqrt(d);
          if(d>0){sum+=Math.log(d/eps);time+=dt;const kk=eps/d;for(let q=0;q<4;q++) shBuf[q]=sBuf[q]+(shBuf[q]-sBuf[q])*kk;}
        }
        out[iy*res+ix]=time>0?sum/time:0;
      }
      if(iy%4===0) self.postMessage({type:'sweepProgress',taskId,row:iy,total:res});
    }
    cancelled.delete(taskId);self.postMessage({type:'sweepDone',taskId,data:out,res},[out.buffer]);
  }
  else if(m.type==='bifurcation'){
    const{taskId,gMin,gMax,steps,P,dt,T,IC}=m;const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
    const pts=[];const sBuf=new Float64Array(4),tmpOut=new Float64Array(4);
    for(let i=0;i<steps;i++){
      if(cancelled.has(taskId)){self.postMessage({type:'bifCancelled',taskId});cancelled.delete(taskId);return;}
      const g=gMin+(gMax-gMin)*i/(steps-1),Pg=Object.assign({},P,{g});
      const f=(s,o)=>rhs2(s,Pg,0,o);
      for(let q=0;q<4;q++) sBuf[q]=IC[q];
      const Nw=Math.round(20/dt);
      for(let k=0;k<Nw;k++){rk4step(sBuf,dt,f,4,tmpOut);for(let q=0;q<4;q++) sBuf[q]=tmpOut[q];}
      const N=Math.round(T/dt);let cap=0;
      for(let k=0;k<N&&cap<60;k++){
        const prev0=sBuf[0],prev1=sBuf[1];
        rk4step(sBuf,dt,f,4,tmpOut);for(let q=0;q<4;q++) sBuf[q]=tmpOut[q];
        const a=wrap(prev0),b=wrap(sBuf[0]);
        if(a<0&&b>=0&&sBuf[2]>0){const fr=-a/(b-a);pts.push({g,t2:wrap(prev1+fr*(sBuf[1]-prev1))});cap++;}
      }
      if(i%10===0) self.postMessage({type:'bifProgress',taskId,i,steps});
    }
    cancelled.delete(taskId);self.postMessage({type:'bifDone',taskId,pts});
  }
  else if(m.type==='lyapSpectrum'){
    const{taskId,n,sys,P,gamma,dt,T,IC,eps,renormDt}=m;const f=makeF(sys,P,gamma);
    const refState=new Float64Array(IC),perts=[];
    for(let i=0;i<n;i++){const p=new Float64Array(refState);p[i]+=eps;perts.push(p);}
    const sumLogs=new Float64Array(n);let totalT=0;
    const spr=Math.max(1,Math.round(renormDt/dt)),totalSteps=Math.round(T/dt);
    const refOut=new Float64Array(n),pOut=new Float64Array(n);
    for(let step=0;step<totalSteps;step++){
      if(cancelled.has(taskId)){self.postMessage({type:'lyapCancelled',taskId});cancelled.delete(taskId);return;}
      rk4step(refState,dt,f,n,refOut);for(let q=0;q<n;q++) refState[q]=refOut[q];
      for(const p of perts){rk4step(p,dt,f,n,pOut);for(let q=0;q<n;q++) p[q]=pOut[q];}
      if((step+1)%spr===0){
        const devs=perts.map(p=>{const d=new Float64Array(n);for(let q=0;q<n;q++) d[q]=p[q]-refState[q];return d;});
        for(let i=0;i<n;i++){
          for(let j=0;j<i;j++){let dot=0;for(let q=0;q<n;q++) dot+=devs[i][q]*devs[j][q];for(let q=0;q<n;q++) devs[i][q]-=dot*devs[j][q];}
          let nm=0;for(let q=0;q<n;q++) nm+=devs[i][q]*devs[i][q];nm=Math.sqrt(nm);
          if(nm>1e-300){sumLogs[i]+=Math.log(nm/eps);for(let q=0;q<n;q++) devs[i][q]=(devs[i][q]/nm)*eps;}
          for(let q=0;q<n;q++) perts[i][q]=refState[q]+devs[i][q];
        }
        totalT+=renormDt;
        if(step%(spr*4)===0){const out=new Float64Array(n);for(let i=0;i<n;i++) out[i]=totalT>0?sumLogs[i]/totalT:0;self.postMessage({type:'lyapProgress',taskId,t:totalT,T,lambdas:Array.from(out)});}
      }
    }
    const out=new Float64Array(n);if(totalT>0) for(let i=0;i<n;i++) out[i]=sumLogs[i]/totalT;
    cancelled.delete(taskId);self.postMessage({type:'lyapDone',taskId,lambdas:Array.from(out),totalT});
  }
  else if(m.type==='fft'){
    const{re:reIn,N}=m;const re=new Float32Array(reIn),im=new Float32Array(N);
    let mean=0;for(let i=0;i<N;i++) mean+=re[i];mean/=N;
    for(let i=0;i<N;i++) re[i]=(re[i]-mean)*(0.5*(1-Math.cos(2*Math.PI*i/(N-1))));
    for(let i=1,j=0;i<N;i++){let bit=N>>1;for(;j&bit;bit>>=1) j^=bit;j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}}
    for(let len=2;len<=N;len<<=1){const ang=-2*Math.PI/len,wr=Math.cos(ang),wi=Math.sin(ang);for(let i=0;i<N;i+=len){let cr=1,ci=0;for(let k=0;k<len/2;k++){const xr=re[i+k],xi=im[i+k],yr=re[i+k+len/2]*cr-im[i+k+len/2]*ci,yi=re[i+k+len/2]*ci+im[i+k+len/2]*cr;re[i+k]=xr+yr;im[i+k]=xi+yi;re[i+k+len/2]=xr-yr;im[i+k+len/2]=xi-yi;const nc=cr*wr-ci*wi,ns=cr*wi+ci*wr;cr=nc;ci=ns;}}}
    const half=N/2,pw=new Float32Array(half);
    for(let i=0;i<half;i++) pw[i]=Math.log10(re[i]*re[i]+im[i]*im[i]+1e-20);
    self.postMessage({type:'fftDone',pw},[pw.buffer]);
  }
  else if(m.type==='benchmark'){
    const{P,gamma,dt,N}=m;const f=(s,o)=>rhs2(s,P,gamma,o);const ic=[2,2.5,0,0];
    const methods=['rk4','rk2','euler','leapfrog','symplectic','yoshida4','gauss2'];
    const results={};
    for(const meth of methods){
      const s=new Float64Array(ic),out=new Float64Array(4);
      const t0b=performance.now();
      for(let i=0;i<N;i++){doStep(meth,s,dt,f,4,out);for(let q=0;q<4;q++) s[q]=out[q];}
      const el=performance.now()-t0b;results[meth]=el>0?Math.round(N/el):0;
    }
    self.postMessage({type:'benchDone',results});
  }
};