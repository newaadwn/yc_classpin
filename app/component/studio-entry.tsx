'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect,useRef,type ReactNode} from 'react';

// AI_Develop: presentation-only deck entrance; no session mutations.
export function StudioEntry({id,className,children,label}:{id:string;className:string;children:ReactNode;label:string}){
 const router=useRouter();const busy=useRef(false);const overlay=useRef<HTMLElement|null>(null);
 useEffect(()=>()=>{overlay.current?.remove();},[]);
 const href=`/admin/session/${id}/qa-studio`;
 return <Link href={href} className={className} aria-label={label} onClick={async e=>{
  if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;
  e.preventDefault();if(busy.current)return;busy.current=true;
  const source=e.currentTarget;const rect=source.getBoundingClientRect();
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
   const clone=source.cloneNode(true) as HTMLElement;clone.removeAttribute('href');clone.setAttribute('aria-hidden','true');clone.inert=true;
   Object.assign(clone.style,{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,margin:'0',zIndex:'9999',pointerEvents:'none',background:'var(--color-bg-surface, white)',borderRadius:'20px',boxShadow:'0 24px 80px #171d2633'});
   const backdrop=document.createElement('div');
   Object.assign(backdrop.style,{position:'fixed',inset:'0',background:'white',zIndex:'9998',pointerEvents:'none'});
   backdrop.setAttribute('aria-hidden','true');backdrop.inert=true;
   backdrop.append(clone);document.body.append(backdrop);overlay.current=backdrop;
   backdrop.animate([{backgroundColor:'rgba(255,255,255,0)'},{backgroundColor:'white'}],{duration:380,fill:'forwards'});
   try{await clone.animate([{transform:'translate(0,0) scale(1)'},{transform:`translate(${innerWidth/2-rect.left-rect.width/2}px,${innerHeight/2-rect.top-rect.height/2}px) scale(1.08)`}],{duration:440,easing:'cubic-bezier(.2,0,0,1)',fill:'forwards'}).finished;}catch{/* Unmount cancels visual work only. */}
  }
  router.push(`${href}?unfold=1`);
  // Release even when navigation is delayed; the real link remains retryable.
  setTimeout(()=>{overlay.current?.remove();overlay.current=null;busy.current=false;},1800);
 }}>{children}</Link>;
}

export function StudioUnfold(){
 useEffect(()=>{
  if(new URLSearchParams(location.search).get('unfold')!=='1'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  let disposed=false;const animations:Animation[]=[];
  const backdrop=document.createElement('div');
  Object.assign(backdrop.style,{position:'fixed',inset:'0',background:'white',zIndex:'9998',pointerEvents:'none'});
  backdrop.setAttribute('aria-hidden','true');backdrop.inert=true;document.body.append(backdrop);
  const timer=setTimeout(()=>{
   if(disposed)return;
   const cards=Array.from(document.querySelectorAll<HTMLElement>('[data-card]'));
   const flights:Promise<Animation>[]=[];
   cards.forEach((card,i)=>{
    const rect=card.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    // Animate screen-space copies, independent of canvas pan/zoom transforms.
    const clone=card.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-card');
    Object.assign(clone.style,{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${card.offsetWidth}px`,height:`${card.offsetHeight}px`,margin:'0',transformOrigin:'center',pointerEvents:'none',zIndex:String(cards.length-i),boxShadow:'0 12px 36px #171d2626'});
    backdrop.append(clone);
    const zoom=rect.width/card.offsetWidth;
    clone.style.left=`${rect.left+(rect.width-card.offsetWidth)/2}px`;
    clone.style.top=`${rect.top+(rect.height-card.offsetHeight)/2}px`;
    const dx=innerWidth/2-rect.left-rect.width/2,dy=innerHeight/2-rect.top-rect.height/2;
    const startScale=Math.min(360,innerWidth*.65)/card.offsetWidth;
    const depth=Math.min(i,12)*2;
    const direction=dx>0?-1:1;
    // Peel the top sheet upward, carry it on an arc, then flatten at its destination.
    // Every sheet gets a distinct departure; later sheets remain in the central stack.
    const spacing=Math.max(45,Math.min(105,2400/Math.max(1,cards.length)));
    const animation=clone.animate([
     {offset:0,transform:`perspective(1000px) translate(${dx+depth}px,${dy+depth}px) rotateX(0deg) rotateZ(-1deg) scale(${startScale})`,boxShadow:'0 2px 4px #171d2620',easing:'ease-out'},
     {offset:.2,transform:`perspective(1000px) translate(${dx+direction*22}px,${dy-62}px) rotateX(14deg) rotateZ(${direction*7}deg) scale(${startScale*1.04})`,boxShadow:'0 28px 40px #171d2628',easing:'cubic-bezier(.3,0,.25,1)'},
     {offset:.72,transform:`perspective(1000px) translate(${dx*.12}px,${dy*.12-28}px) rotateX(5deg) rotateZ(${direction*3}deg) scale(${zoom*1.08})`,boxShadow:'0 16px 24px #171d2620',easing:'ease-out'},
     {offset:1,transform:`perspective(1000px) translate(0,0) rotateX(0deg) rotateZ(0deg) scale(${zoom})`,boxShadow:'0 1px 3px #171d2610'}
    ],{duration:900,delay:220+i*spacing,fill:'both'});
    animations.push(animation);flights.push(animation.finished);
   });
   void Promise.allSettled(flights).then(async()=>{
    if(disposed)return;
    const fade=backdrop.animate([{opacity:1},{opacity:0}],{duration:200,fill:'forwards'});animations.push(fade);
    try{await fade.finished;}catch{/* Route changed. */}
    backdrop.remove();
   });
  },120);
  return ()=>{disposed=true;clearTimeout(timer);animations.forEach(a=>a.cancel());backdrop.remove();};
 },[]);
 return null;
}
