import {AdminApiError,adminApiErrorResponse,readSmallJsonBody,requireAdminRequest} from "@/app/_infrastructure/server/admin-api";
import {labLocalRequest} from "@/app/_model/model-lab";
import {generateLivePin,livePinContext} from "@/app/_infrastructure/server/live-pin-ai";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){
  try{
    if(!labLocalRequest(request,process.env.NODE_ENV,process.env.NEXT_PUBLIC_SUPABASE_URL))throw new AdminApiError(404,"LOCAL_ONLY");
    const {client,user}=await requireAdminRequest(request);
    const body=await readSmallJsonBody(request,2048) as {questionId?:unknown};
    if(typeof body?.questionId!=="string"||!/^[0-9a-f-]{36}$/.test(body.questionId))throw new AdminApiError(400,"INVALID_QUESTION");
    const {data:q,error}=await client.from("questions").select("id,course_id,slide_id,raw_text,region_anchors(coords)").eq("id",body.questionId).maybeSingle();
    if(error||!q)throw new AdminApiError(404,"QUESTION_NOT_FOUND");
    const {data:course,error:ownerError}=await client.from("courses").select("id").eq("id",q.course_id).eq("owner_id",user.id).maybeSingle();
    if(ownerError||!course)throw new AdminApiError(404,"QUESTION_NOT_FOUND");
    const {data:slide,error:slideError}=await client.from("slides").select("id,page_index,image_checksum").eq("id",q.slide_id).maybeSingle();
    if(slideError||!slide)throw new AdminApiError(409,"CONTEXT_MISSING");
    const {ocr,layout}=await livePinContext(slide.image_checksum);
    const result=await generateLivePin(user.id,{question:q.raw_text.slice(0,4000),page:slide.page_index+1,coords:q.region_anchors,ocr:ocr.regions,layout:layout.regions});
    return Response.json(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return adminApiErrorResponse(error);}
}
