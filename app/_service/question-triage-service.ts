import { getSupabaseClient } from "@/app/_infrastructure/supabase/client";
import type { Triage } from "@/app/_model/question-groups";
import type { ClassSession, Question } from "@/app/_model/types";

export type GroupAnswerTarget = {id:string;answer_id:string;text:string;slide_id:string;x:number|null;y:number|null};
export async function answerQuestionGroup(targets:GroupAnswerTarget[],body:string) {
  const client=getSupabaseClient();
  if(!client)throw new Error("묶음 답변은 Supabase 연결이 필요합니다.");
  const {data,error}=await client.rpc("answer_question_group",{question_snapshot:targets,answer_body:body});
  if(error)throw error;
  return data as string[];
}

export async function fetchQuestionTriage(ids: string[]): Promise<Triage[]> {
  const client = getSupabaseClient();
  if (!client || !ids.length) return [];
  const rows: Triage[] = [];
  // Avoid URL size limits for a long-running lecture.
  for (let index=0; index<ids.length; index+=100) {
    const {data,error} = await client.from("question_triage").select("question_id,deferred,separate").in("question_id", ids.slice(index,index+100));
    if (error) throw error;
    rows.push(...data);
  }
  return rows;
}

export async function saveQuestionTriage(rows: Triage[]) {
  const client = getSupabaseClient();
  if (!client) throw new Error("그룹 처리 저장은 Supabase 연결이 필요합니다.");
  const {error} = await client.from("question_triage").upsert(rows, {onConflict:"question_id"});
  if (error) throw error;
}

export async function completeQuestionGroup(session: ClassSession, questions: Question[], actionId: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error("묶음 완료는 Supabase 연결이 필요합니다.");
  const {data,error} = await client.rpc("complete_question_group", {action_id:actionId,question_snapshot:questions.map(q=>({id:q.id,text:q.text,slide_id:session.slides[q.slideIndex]?.id,x:q.x,y:q.y}))});
  if(error)throw error;
  return data as string[];
}
export async function undoQuestionGroup(actionId:string) {
  const client=getSupabaseClient();
  if(!client)throw new Error("되돌리기는 Supabase 연결이 필요합니다.");
  const {data,error}=await client.rpc("undo_question_group",{action_id:actionId});
  if(error)throw error;
  return data as string[];
}
