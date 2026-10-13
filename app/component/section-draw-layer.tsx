'use client';
import {useEffect,useRef,useState,type PointerEvent} from 'react';
import styles from './section-draw-layer.module.css';
type Point={x:number;y:number};
export function SectionDrawLayer({onAdd,onCancel}:{onAdd:(box:{x:number;y:number;w:number;h:number})=>void;onCancel:()=>void}){
 const root=useRef<HTMLDivElement>(null),start=useRef<{point:Point;pointer:number}|null>(null);
 const [box,setBox]=useState<{x:number;y:number;w:number;h:number}|null>(null);
 useEffect(()=>{root.current?.focus();},[]);
 const point=(e:PointerEvent<HTMLDivElement>)=>{const r=e.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
 const rectangle=(p:Point)=>{const a=start.current!.point;return {x:Math.min(a.x,p.x),y:Math.min(a.y,p.y),w:Math.abs(p.x-a.x),h:Math.abs(p.y-a.y)};};
 return <div ref={root} className={styles.layer} tabIndex={0} role="group" aria-label="슬라이드에서 드래그하여 영역 추가. Esc로 취소" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onCancel();}}}
 onPointerDown={e=>{if(e.button!==0||start.current)return;e.preventDefault();start.current={point:point(e),pointer:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);setBox(null);}}
 onPointerMove={e=>{if(start.current?.pointer===e.pointerId)setBox(rectangle(point(e)));}}
 onPointerUp={e=>{if(start.current?.pointer!==e.pointerId)return;const next=rectangle(point(e)),r=e.currentTarget.getBoundingClientRect();start.current=null;setBox(null);e.currentTarget.releasePointerCapture(e.pointerId);if(next.w*r.width>=8&&next.h*r.height>=8)onAdd(next);}}
 onPointerCancel={()=>{start.current=null;setBox(null);}} onLostPointerCapture={()=>{start.current=null;setBox(null);}}>
 {box&&<div className={styles.preview} style={{left:`${box.x*100}%`,top:`${box.y*100}%`,width:`${box.w*100}%`,height:`${box.h*100}%`}}/>}
 </div>;
}
