import {test} from 'node:test';
import assert from 'node:assert/strict';
import {insideBubbles} from './outward-bubbles.ts';
import {canvasLayout,CARD_W,CARD_H} from './question-canvas.ts';
test('left, right and bottom summaries stay inside their sections without overlapping slides',()=>{
 const rows=Array.from({length:21},(_,i)=>({id:String(i),bucket:String(i%3)}));
 for(const width of [800,1440,1920]){const {points,frames}=canvasLayout(rows,width,900,644);const boards=insideBubbles(frames,frames.map(f=>({scopeName:f.name,x:0,y:0,width:580,height:340})));
 boards.forEach(b=>{const f=frames.find(f=>f.name===b.scopeName)!;assert.ok(b.x>=f.x&&b.y>=f.y&&b.x+b.width<=f.x+f.width&&b.y+b.height<=f.y+f.height);rows.filter(r=>r.bucket===b.scopeName).forEach(r=>{const p=points[r.id];assert.ok(b.x+b.width<=p.x||b.x>=p.x+CARD_W||b.y+b.height<=p.y||b.y>=p.y+CARD_H);});});}
});
