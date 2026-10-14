export const contentTopics=['시장·사용자 문제','기존 서비스의 한계','해결방안·핵심 기술','사업화·검증','기타·분류 미확정'];
const pages=[2,0,0,1,1,2,2,3,3,3,2,3,3,3,2];
/** Sample-deck page taxonomy; not runtime AI inference. */
export function pageTopic(session:{id:string;slides:unknown[]},index:number){return (session.id==='f7767d0a-14a7-4b1c-bd3d-fc50a8691d68'||session.id==='soi-demo')&&session.slides.length===15?pages[index]??4:4;}
