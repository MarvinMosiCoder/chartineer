import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

const GAP = 12;  // breathing room between the spotlight and the tooltip
const EDGE = 12; // closest the tooltip may sit to any viewport edge

// How tall the tooltip is depends on how far its copy wraps, which depends on the
// viewport width. This used to be two hardcoded guesses (`box.bottom+190<vh` /
// `box.top-178`) against a tooltip that actually measures 195-235px, so on the longer
// steps it either covered the very control it was describing or hung off the bottom of
// the screen. Place it from a real measurement instead: below the target, else above,
// else beside it. Only when the target fills the viewport (the journal page's Risk
// Guardrails and Closed Trades panels do on a phone, and its calendar does even at
// 1440x900) is some overlap unavoidable; there, pin to whichever edge covers less of the
// target rather than always picking the same one.
function placeTip(box, tip, vw, vh) {
  const left = Math.max(EDGE, Math.min(vw - tip.w - EDGE, box.left));
  if (box.bottom + GAP + tip.h <= vh - EDGE) return { left, top: box.bottom + GAP };
  if (box.top - GAP - tip.h >= EDGE) return { left, top: box.top - GAP - tip.h };
  const top = Math.max(EDGE, Math.min(vh - tip.h - EDGE, box.top));
  if (box.right + GAP + tip.w <= vw - EDGE) return { left: box.right + GAP, top };
  if (box.left - GAP - tip.w >= EDGE) return { left: box.left - GAP - tip.w, top };
  const atTop = { left, top: EDGE };
  const atBottom = { left, top: Math.max(EDGE, vh - tip.h - EDGE) };
  const covers = (pos) => Math.max(0, Math.min(box.bottom, pos.top + tip.h) - Math.max(box.top, pos.top));
  return covers(atTop) <= covers(atBottom) ? atTop : atBottom;
}

export default function WorkspaceTour({ step, steps, onStep, onFinish, dark }) {
  const [rect,setRect]=useState(null),[confirmSkip,setConfirmSkip]=useState(false); const [tipSize,setTipSize]=useState({w:320,h:220}); const tip=useRef(null),item=steps[step];
  useEffect(()=>{let target;const update=()=>{target=document.querySelector(item.selector);if(!target){setRect(null);return;}target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});const r=target.getBoundingClientRect();setRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,vw:window.innerWidth,vh:window.innerHeight});};update();const observer=window.ResizeObserver?new ResizeObserver(update):null;target&&observer?.observe(target);window.addEventListener('resize',update);window.addEventListener('scroll',update,true);document.addEventListener('fullscreenchange',update);return()=>{observer?.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);document.removeEventListener('fullscreenchange',update);};},[item.selector]);
  useEffect(()=>{tip.current?.focus();const key=e=>{if(e.key==='ArrowRight'&&step<steps.length-1)onStep(step+1);if(e.key==='ArrowLeft'&&step>0)onStep(step-1);if(e.key==='Escape')setConfirmSkip(true);};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[step,steps.length,onStep]);
  // Measured rather than assumed: the tooltip re-wraps on every viewport width and grows
  // again when the skip confirmation opens, so a ResizeObserver on it keeps placeTip honest.
  useLayoutEffect(()=>{const el=tip.current;if(!el)return;const measure=()=>{const r=el.getBoundingClientRect();setTipSize((prev)=>(Math.abs(prev.w-r.width)<1&&Math.abs(prev.h-r.height)<1?prev:{w:r.width,h:r.height}));};measure();const observer=window.ResizeObserver?new ResizeObserver(measure):null;observer?.observe(el);return()=>observer?.disconnect();},[]);
  const vw=rect?.vw??window.innerWidth,vh=rect?.vh??window.innerHeight,p=8,box=rect&&{top:Math.max(0,rect.top-p),left:Math.max(0,rect.left-p),right:Math.min(vw,rect.right+p),bottom:Math.min(vh,rect.bottom+p)};const position=box?placeTip(box,tipSize,vw,vh):{};
  return <div className="fixed inset-0 z-[10030]">{box?<><div className="fixed left-0 right-0 top-0 bg-black/60" style={{height:box.top}}/><div className="fixed left-0 bg-black/60" style={{top:box.top,width:box.left,height:box.bottom-box.top}}/><div className="fixed right-0 bg-black/60" style={{top:box.top,left:box.right,height:box.bottom-box.top}}/><div className="fixed bottom-0 left-0 right-0 bg-black/60" style={{top:box.bottom}}/><div className="pointer-events-none fixed rounded-lg ring-2 ring-[#5eead4] ring-offset-4 ring-offset-transparent" style={{top:box.top,left:box.left,width:box.right-box.left,height:box.bottom-box.top}}/></>:<div className="fixed inset-0 bg-black/60"/>}<section ref={tip} tabIndex={-1} role="dialog" aria-modal="true" style={box?position:undefined} className={`fixed w-[min(calc(100vw-24px),320px)] rounded-xl border p-4 shadow-2xl outline-none ${box?'':'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'} ${dark?'border-[#2a2e39] bg-[#131722] text-white':'border-slate-200 bg-white text-slate-900'}`}><div className="text-[10px] font-bold uppercase tracking-wider text-[#5eead4]">Workspace tour · {step+1}/{steps.length}</div><h2 className="mt-2 font-bold">{item.title}</h2><p className="mt-2 text-sm leading-5 text-[#787b86]">{item.description}</p>{!rect&&<p className="mt-2 text-xs text-amber-500">This control is unavailable here. Continue to the next step.</p>}{confirmSkip?<div className="mt-4 rounded-lg bg-amber-500/10 p-3 text-xs"><p>End the workspace tour?</p><div className="mt-2 flex gap-2"><button onClick={onFinish} className="rounded bg-amber-600 px-3 py-1.5 text-white">End tour</button><button onClick={()=>setConfirmSkip(false)}>Continue</button></div></div>:<div className="mt-4 flex items-center gap-2"><button onClick={()=>setConfirmSkip(true)} className="mr-auto text-xs text-[#787b86]">Skip</button>{step>0&&<button onClick={()=>onStep(step-1)} className="rounded border border-current/20 px-3 py-1.5 text-xs">Back</button>}<button onClick={()=>step===steps.length-1?onFinish():onStep(step+1)} className="rounded bg-[#2dd4bf] px-3 py-1.5 text-xs font-semibold text-white">{step===steps.length-1?'Finish':'Next'}</button></div>}</section></div>;
}
