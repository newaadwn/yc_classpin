/** Display-only grouping. Preserve originals and never infer answer completion. */
export function identicalQuestions<T extends {id:string;slideIndex:number;text:string}>(questions:T[]):T[][]{
 const groups=new Map<string,T[]>();
 for(const question of questions){
  const text=question.text.normalize('NFC').trim().replace(/\s+/g,' ');
  const key=JSON.stringify([question.slideIndex,text||question.id]);
  const group=groups.get(key);
  if(group)group.push(question);else groups.set(key,[question]);
 }
 return [...groups.values()];
}
