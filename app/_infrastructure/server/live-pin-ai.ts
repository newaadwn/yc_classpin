import path from "node:path";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import type {PinSuggestion} from "@/app/_model/live-pin";
import {AdminApiError} from "./admin-api";
import {cachedSlidePages,loadSlideAnalysisCache} from "./slide-analysis-cache";

type ContextRegion={textRedacted?:string;label?:string;bboxNorm?:unknown};
type ContextPage={sourceSha256:string;pageNumber:number;regions:ContextRegion[]};
type Input={question:string;page:number;coords:unknown;ocr:ContextRegion[];layout:ContextRegion[]};
const state=globalThis as typeof globalThis & {livePinAi?:{busy:boolean;cache:Map<string,PinSuggestion>;pending?:Map<string,Promise<PinSuggestion>>}};
const pool:NonNullable<typeof state.livePinAi>=state.livePinAi??(state.livePinAi={busy:false,cache:new Map(),pending:new Map()});
const pending=pool.pending??(pool.pending=new Map());
export async function livePinContext(checksum:string|null):Promise<{ocr:ContextPage;layout:ContextPage}> {
  if(!checksum)throw new AdminApiError(409,"CONTEXT_MISSING");
  try {
    // Benchmarks used privacy-redacted renders. The shared cache follows the recorded
    // source→render provenance and never falls back to matching page numbers.
    const pages=cachedSlidePages(await loadSlideAnalysisCache(),checksum);
    if(!pages)throw Error();
    return pages as {ocr:ContextPage;layout:ContextPage};
  }catch{throw new AdminApiError(409,"CONTEXT_MISSING");}
}
export async function generateLivePin(owner:string,input:Input):Promise<PinSuggestion> {
  const key=createHash("sha256").update(owner+JSON.stringify(input)).digest("hex");
  const cached=pool.cache.get(key);if(cached)return cached;
  const existing=pending.get(key);if(existing)return existing;
  if(pool.busy)throw new AdminApiError(409,"MODEL_BUSY");
  pool.busy=true;
  const task=(async()=>{
  try {
    const result=await new Promise<PinSuggestion>((resolve,reject)=>{
      const env:NodeJS.ProcessEnv={NODE_ENV:"development",PYTHONUTF8:"1",HF_HUB_OFFLINE:"1",TRANSFORMERS_OFFLINE:"1"};
      for(const name of ["PATH","Path","SystemRoot","WINDIR","TEMP","TMP","USERPROFILE","LOCALAPPDATA","APPDATA"])if(process.env[name])env[name]=process.env[name];
      const python=path.join(process.cwd(),".local/model-benchmark-venv/Scripts/python.exe");
      const script=path.join(process.cwd(),"experiments/semantic_regions/live_pin_answer.py");
      const child=spawn(/* turbopackIgnore: true */ python,[script],{cwd:process.cwd(),env,windowsHide:true,stdio:["pipe","pipe","ignore"]});
      let output="";let settled=false;
      const finish=(error?:AdminApiError,value?:PinSuggestion)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(value!);};
      // Python's own timer kills its model descendants before this outer deadline.
      const timer=setTimeout(()=>{child.kill();finish(new AdminApiError(504,"MODEL_FAILED"));},135000);
      child.on("error",()=>finish(new AdminApiError(503,"MODEL_UNAVAILABLE")));
      child.stdout.setEncoding("utf8");
      child.stdout.on("data",chunk=>{output+=chunk.toString();if(output.length>20000){child.kill();finish(new AdminApiError(502,"MODEL_FAILED"));}});
      child.stdin.on("error",()=>{/* Exit handler reports early runner failure. */});
      child.on("close",()=>{
        try{
          const data=JSON.parse(output);
          if(data.error)throw new AdminApiError(503,data.error==="MODEL_BUSY"?"MODEL_BUSY":"MODEL_FAILED");
          if(typeof data.draft!=="string"||!data.draft.trim()||data.draft.length>1500||typeof data.analysis!=="string"||typeof data.quote!=="string")throw Error();
          finish(undefined,{...data,page:input.page});
        }catch(e){finish(e instanceof AdminApiError?e:new AdminApiError(502,"MODEL_FAILED"));}
      });
      child.stdin.end(JSON.stringify(input));
    });
    if(pool.cache.size>=100)pool.cache.delete(pool.cache.keys().next().value!);
    pool.cache.set(key,result);return result;
  }finally{pool.busy=false;pending.delete(key);}
  })();
  pending.set(key,task);return task;
}
