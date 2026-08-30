export class Scheduler{
 #jobs=new Map();
 add(job){if(!job?.id||!job?.at||typeof job.run!=='function')throw new Error('invalid job');if(this.#jobs.has(job.id))throw new Error('duplicate job id');const at=new Date(job.at).getTime();if(!Number.isFinite(at))throw new Error('invalid schedule time');this.#jobs.set(job.id,{...job,at:new Date(at).toISOString(),status:'scheduled',createdAt:new Date().toISOString()});return job.id;}
 cancel(id){const j=this.#jobs.get(id);if(!j||j.status!=='scheduled')return false;j.status='cancelled';return true;}
 list(){return [...this.#jobs.values()].map(({run,...rest})=>rest);}
 async tick(now=Date.now()){for(const j of this.#jobs.values()){if(j.status==='scheduled'&&new Date(j.at).getTime()<=now){j.status='running';j.startedAt=new Date().toISOString();try{j.result=await j.run();j.status='done';}catch(e){j.status='failed';j.error=String(e?.message||e);}j.finishedAt=new Date().toISOString();}}return this.list();}
}
