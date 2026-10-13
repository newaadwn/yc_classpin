export type Camera={x:number;y:number;zoom:number};
export type CanvasPoint={x:number;y:number};
export type CanvasRow={id:string;bucket:string;slideId?:string;questionIds?:string[]};
export const CARD_W=300, CARD_H=236;
export function zoomCamera(camera:Camera,at:CanvasPoint,zoom:number):Camera{
 const next=Math.max(.12,Math.min(2.5,zoom));
 return {x:at.x-(at.x-camera.x)*next/camera.zoom,y:at.y-(at.y-camera.y)*next/camera.zoom,zoom:next};
}
export function canvasArea(width:number,height:number){
 return {x:72,y:170,width:Math.max(1,width-92),height:Math.max(1,height-240)};
}
export function canvasLayout(rows:CanvasRow[],width=1440,height=900,analysisSpace=0){
 const groups=[...new Set(rows.map(r=>r.bucket))].map(name=>({name,items:rows.filter(r=>r.bucket===name)}));
 type Frame={name:string;x:number;y:number;width:number;height:number};
 let best:{points:Record<string,CanvasPoint>;frames:Frame[]}={points:{},frames:[]};
 let bestScale=0;
 const area=canvasArea(width,height);
 // Compare compact horizontal shelf layouts; keep group and page order stable.
 const maxCols=Math.min(20,Math.max(1,...groups.map(g=>g.items.length)));
 for(let cols=1;cols<=maxCols;cols++){
  const boxes=groups.map((g,index)=>{const side=index%3;const slideWidth=Math.min(cols,g.items.length)*324+24,slideHeight=Math.ceil(g.items.length/cols)*250+60;return {...g,side,width:analysisSpace?(side===2?Math.max(slideWidth,analysisSpace+24):slideWidth+analysisSpace):slideWidth,height:analysisSpace?(side===2?slideHeight+388:Math.max(slideHeight,420)):slideHeight};});
  const totalWidth=boxes.reduce((sum,b)=>sum+b.width+32,0);
  for(let limit=Math.max(1,...boxes.map(b=>b.width));limit<=totalWidth;limit+=162){
   const points:Record<string,CanvasPoint>={},frames:Frame[]=[];
   let x=0,y=0,rowHeight=0,boundsW=0;
   for(const b of boxes){
    if(x>0&&x+b.width>limit){x=0;y+=rowHeight+32;rowHeight=0;}
    frames.push({name:b.name,x,y,width:b.width,height:b.height});
    b.items.forEach((r,i)=>{points[r.id]={x:x+24+(analysisSpace&&b.side===0?analysisSpace:0)+(i%cols)*324,y:y+48+Math.floor(i/cols)*250};});
    boundsW=Math.max(boundsW,x+b.width);rowHeight=Math.max(rowHeight,b.height);x+=b.width+32;
   }
   const scale=Math.min(area.width/Math.max(1,boundsW),area.height/Math.max(1,y+rowHeight));
   if(scale>bestScale){bestScale=scale;best={points,frames};}
  }
 }
 return best;
}
export function fitCamera(points:Record<string,CanvasPoint>,width:number,height:number):Camera{
 const values=Object.values(points);if(!values.length)return {x:40,y:40,zoom:1};
 const minX=Math.min(...values.map(p=>p.x))-24,minY=Math.min(...values.map(p=>p.y))-48;
 const w=Math.max(...values.map(p=>p.x))+CARD_W+24-minX,h=Math.max(...values.map(p=>p.y))+CARD_H+36-minY;
 const area=canvasArea(width,height);
 const zoom=Math.min(2.5,area.width/w,area.height/h);
 return {x:area.x+(area.width-w*zoom)/2-minX*zoom,y:area.y+(area.height-h*zoom)/2-minY*zoom,zoom};
}
