import {AdminApiError,adminApiErrorResponse,readSmallJsonBody,requireAdminRequest} from '@/app/_infrastructure/server/admin-api';
import {labLocalRequest} from '@/app/_model/model-lab';
import {generateScopeSummary} from '@/app/_infrastructure/server/scope-summary';
export const runtime='nodejs';
export async function POST(request:Request){try{
 if(!labLocalRequest(request,process.env.NODE_ENV,process.env.NEXT_PUBLIC_SUPABASE_URL))throw new AdminApiError(404,'LOCAL_ONLY');
 const owner=process.env.NEXT_PUBLIC_DATA_MODE==='demo'?'demo':(await requireAdminRequest(request)).user.id;
 const body=await readSmallJsonBody(request,1000000) as {name:string;pages:Array<{page:number;text:string}>;questions:Array<{page:number;text:string;status:string}>};
 if(!body||typeof body.name!=='string'||body.name.length>200||!Array.isArray(body.pages)||!body.pages.length||body.pages.length>100||!Array.isArray(body.questions)||body.questions.length>400)throw new AdminApiError(400,'INVALID_CONTEXT');
 if(body.pages.some(p=>!p||!Number.isInteger(p.page)||p.page<1||typeof p.text!=='string'||!p.text.trim()||p.text.length>80000)||body.questions.some(q=>!q||!body.pages.some(p=>p.page===q.page)||typeof q.text!=='string'||q.text.length>3000||!['unanswered','answered','resolved'].includes(q.status)))throw new AdminApiError(400,'INVALID_CONTEXT');
 return Response.json(await generateScopeSummary(owner,body),{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return adminApiErrorResponse(error);}}
