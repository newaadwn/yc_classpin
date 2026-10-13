import {CARD_W,CARD_H,type CanvasPoint} from './question-canvas';
export const BOARD_WIDTH=580,BOARD_HEIGHT=580;
export type BoardPosition={id:string;x:number;y:number;width?:number;height?:number};
/** Board corner anchors let the existing camera fitter cover mixed node sizes. */
export function withBoardBounds(points:Record<string,CanvasPoint>,boards:BoardPosition[]){
 const result={...points};
 for(const board of boards){result[`${board.id}:start`]={x:board.x,y:board.y};result[`${board.id}:end`]={x:board.x+(board.width??BOARD_WIDTH)-CARD_W,y:board.y+(board.height??BOARD_HEIGHT)-CARD_H};}
 return result;
}
