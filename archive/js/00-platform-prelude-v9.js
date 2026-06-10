'use strict';
(function installSingleFilePlatformPrelude(global){
  if(global.__PENDULUM_PLATFORM_PRELUDE_V9__) return;

  /* =====================================================
     CORE
  ===================================================== */
  const native = Object.freeze({
    setTimeout: global.setTimeout.bind(global),
    clearTimeout: global.clearTimeout.bind(global),
    setInterval: global.setInterval.bind(global),
    clearInterval: global.clearInterval.bind(global),
    addEventListener: EventTarget.prototype.addEventListener,
    removeEventListener: EventTarget.prototype.removeEventListener,
    performanceNow: () => (global.performance && performance.now ? performance.now() : Date.now())
  });

  function safeInvoke(handler, thisArg, args){
    if(typeof handler === 'function') return handler.apply(thisArg, args || []);
    return native.setTimeout(handler, 0);
  }

  /* =====================================================
     EVENT BUS
  ===================================================== */
  const PreloadBus = (() => {
    const channels = new Map();
    const history = [];
    const MAX_HISTORY = 256;
    function on(type, listener){
      if(typeof listener !== 'function') throw new TypeError('EventBus listener must be a function');
      const bucket = channels.get(type) || new Set();
      bucket.add(listener); channels.set(type, bucket);
      return () => off(type, listener);
    }
    function once(type, listener){
      const dispose = on(type, payload => { dispose(); listener(payload); });
      return dispose;
    }
    function off(type, listener){ const bucket = channels.get(type); if(bucket) bucket.delete(listener); }
    function emit(type, payload){
      const record = Object.freeze({type, payload, at: native.performanceNow()});
      history.push(record); if(history.length > MAX_HISTORY) history.shift();
      const bucket = channels.get(type); if(!bucket) return true;
      for(const listener of Array.from(bucket)){
        try{ listener(payload, record); }
        catch(error){ console.error('[PlatformV9/EventBus]', type, error); }
      }
      return true;
    }
    return Object.freeze({on, once, off, emit, history:()=>history.slice(), count:type => (channels.get(type)||new Set()).size});
  })();

  /* =====================================================
     TIMERS
  ===================================================== */
  const Scheduler = (() => {
    const timers = new Map();
    let paused = false;
    let sequence = 0;
    let skippedIntervals = 0;
    let deferredTimeouts = 0;
    function now(){ return native.performanceNow(); }
    function normalizeDelay(delay){ return Number.isFinite(+delay) ? Math.max(0, +delay) : 0; }
    function makeMeta(kind, delay, handler){
      return {id:null, kind, delay:normalizeDelay(delay), createdAt:now(), lastFiredAt:0, fired:0, cleared:false,
        sequence:++sequence, label:(handler && handler.name) || 'anonymous'};
    }
    function scheduleTimeout(handler, delay, ...args){
      const meta = makeMeta('timeout', delay, handler);
      if(typeof handler !== 'function'){
        const id = native.setTimeout(handler, meta.delay, ...args);
        meta.id = id; timers.set(id, meta); return id;
      }
      const id = native.setTimeout(function platformTimeoutWrapper(){
        if(paused){
          deferredTimeouts++;
          meta.deferred = true;
          meta.id = native.setTimeout(platformTimeoutWrapper, Math.min(250, Math.max(16, meta.delay || 16)));
          timers.delete(id); timers.set(meta.id, meta);
          return;
        }
        meta.fired++; meta.lastFiredAt = now(); timers.delete(meta.id);
        try{ return safeInvoke(handler, this, args); }
        catch(error){ PreloadBus.emit('runtime:error', {source:'timeout', error:String(error && error.stack || error)}); throw error; }
      }, meta.delay);
      meta.id = id; timers.set(id, meta); return id;
    }
    function clearScheduledTimeout(id){ const meta = timers.get(id); if(meta){ meta.cleared = true; timers.delete(id); } return native.clearTimeout(id); }
    function scheduleInterval(handler, delay, ...args){
      const meta = makeMeta('interval', delay, handler);
      if(typeof handler !== 'function'){
        const id = native.setInterval(handler, meta.delay, ...args);
        meta.id = id; timers.set(id, meta); return id;
      }
      const id = native.setInterval(function platformIntervalWrapper(){
        if(paused){ skippedIntervals++; return; }
        meta.fired++; meta.lastFiredAt = now();
        try{ return safeInvoke(handler, this, args); }
        catch(error){ PreloadBus.emit('runtime:error', {source:'interval', error:String(error && error.stack || error)}); throw error; }
      }, meta.delay);
      meta.id = id; timers.set(id, meta); return id;
    }
    function clearScheduledInterval(id){ const meta = timers.get(id); if(meta){ meta.cleared = true; timers.delete(id); } return native.clearInterval(id); }
    function pause(){ paused = true; PreloadBus.emit('scheduler:pause', snapshot()); }
    function resume(){ paused = false; PreloadBus.emit('scheduler:resume', snapshot()); }
    function snapshot(){
      let timeouts = 0, intervals = 0;
      timers.forEach(meta => { if(meta.kind === 'timeout') timeouts++; else if(meta.kind === 'interval') intervals++; });
      return {active:timers.size, timeouts, intervals, paused, skippedIntervals, deferredTimeouts,
        timers:Array.from(timers.values()).map(meta => ({id:String(meta.id), kind:meta.kind, delay:meta.delay, fired:meta.fired, ageMs:Math.round(now()-meta.createdAt), label:meta.label}))};
    }
    return Object.freeze({setTimeout:scheduleTimeout, clearTimeout:clearScheduledTimeout,
      setInterval:scheduleInterval, clearInterval:clearScheduledInterval, pause, resume, snapshot, native});
  })();

  global.setTimeout = Scheduler.setTimeout;
  global.clearTimeout = Scheduler.clearTimeout;
  global.setInterval = Scheduler.setInterval;
  global.clearInterval = Scheduler.clearInterval;

  /* =====================================================
     EVENT LISTENERS
  ===================================================== */
  const ListenerRegistry = (() => {
    const targetIds = new WeakMap();
    const listenerIds = new WeakMap();
    const listeners = new Map();
    let targetSeq = 0, listenerSeq = 0, duplicateAdds = 0, orphanRemoves = 0;
    function idForTarget(target){ if(!targetIds.has(target)) targetIds.set(target, ++targetSeq); return targetIds.get(target); }
    function idForListener(listener){
      if(listener && (typeof listener === 'function' || typeof listener === 'object')){
        if(!listenerIds.has(listener)) listenerIds.set(listener, ++listenerSeq);
        return listenerIds.get(listener);
      }
      return String(listener);
    }
    function captureOf(options){ return typeof options === 'boolean' ? options : !!(options && options.capture); }
    function keyFor(target, type, listener, options){ return idForTarget(target)+'|'+type+'|'+idForListener(listener)+'|'+captureOf(options); }
    function labelTarget(target){
      if(target === global) return 'window';
      if(target === document) return 'document';
      if(target && target.id) return '#'+target.id;
      return target && target.nodeName ? target.nodeName.toLowerCase() : Object.prototype.toString.call(target);
    }
    function add(target, type, listener, options){
      const key = keyFor(target, type, listener, options);
      if(listeners.has(key)) duplicateAdds++;
      listeners.set(key, {type, target:labelTarget(target), capture:captureOf(options), addedAt:native.performanceNow(), listenerName:(listener && listener.name) || 'anonymous'});
    }
    function remove(target, type, listener, options){
      const key = keyFor(target, type, listener, options);
      if(!listeners.delete(key)) orphanRemoves++;
    }
    function snapshot(){
      const byType = {}, byTarget = {};
      for(const meta of listeners.values()){
        byType[meta.type] = (byType[meta.type] || 0) + 1;
        byTarget[meta.target] = (byTarget[meta.target] || 0) + 1;
      }
      return {active:listeners.size, duplicateAdds, orphanRemoves, byType, byTarget};
    }
    function clearTargetLabel(label){
      let removed = 0;
      for(const [key, meta] of Array.from(listeners.entries())) if(meta.target === label){ listeners.delete(key); removed++; }
      return removed;
    }
    return Object.freeze({add, remove, snapshot, clearTargetLabel});
  })();

  EventTarget.prototype.addEventListener = function(type, listener, options){
    try{ ListenerRegistry.add(this, type, listener, options); }catch(error){ console.warn('[PlatformV9/ListenerRegistry] add failed', error); }
    return native.addEventListener.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function(type, listener, options){
    try{ ListenerRegistry.remove(this, type, listener, options); }catch(error){ console.warn('[PlatformV9/ListenerRegistry] remove failed', error); }
    return native.removeEventListener.call(this, type, listener, options);
  };

  /* =====================================================
     DIAGNOSTICS
  ===================================================== */
  global.__PENDULUM_PLATFORM_PRELUDE_V9__ = Object.freeze({version:'v9.0.0-prelude', bus:PreloadBus, scheduler:Scheduler, listeners:ListenerRegistry, native});
})(globalThis);
