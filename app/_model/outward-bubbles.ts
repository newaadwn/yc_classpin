type Frame={name:string;x:number;y:number;width:number;height:number};
type Bubble={scopeName?:string;x:number;y:number;width:number;height:number};
/** Match the left/right/bottom space reserved inside each section frame. */
export function insideBubbles<T extends Bubble>(frames:Frame[],boards:T[]):T[]{
 return boards.map(board=>{const index=frames.findIndex(f=>f.name===board.scopeName);if(index<0)return board;const f=frames[index],side=index%3;
 return {...board,x:side===0?f.x+24:side===1?f.x+f.width-board.width-24:f.x+(f.width-board.width)/2,y:side===2?f.y+f.height-board.height-24:f.y+48};});
}
export function bubbleTail(board:Bubble,frame?:Frame){
 if(!frame)return 'left';
 const dx=(frame.x+frame.width/2)-(board.x+board.width/2),dy=(frame.y+frame.height/2)-(board.y+board.height/2);
 return Math.abs(dx)/board.width>Math.abs(dy)/board.height?(dx>0?'right':'left'):(dy>0?'bottom':'top');
}
