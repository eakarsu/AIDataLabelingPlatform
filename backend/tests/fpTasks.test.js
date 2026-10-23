process.env.JWT_SECRET='test-secret-test-secret-test-secret-1234';
const test=require('node:test'); const assert=require('node:assert/strict'); const express=require('express'); const jwt=require('jsonwebtoken');
const router=require('../routes/fpTasks.js');
delete process.env.OPENROUTER_API_KEY; delete process.env.OPENAI_API_KEY;
async function boot(){ const app=express(); app.use(express.json()); app.use('/api/tasks',router); const s=await new Promise(r=>{const x=app.listen(0,()=>r(x))}); return {s,base:'http://127.0.0.1:'+s.address().port, tok:jwt.sign({id:1,email:'a@test.io'},process.env.JWT_SECRET)}; }
test('fpTasks auth/crud/search/export/ai fallback', async (t)=>{
  router._reset(); const {s,base,tok}=await boot(); t.after(()=>s.close());
  const H={Authorization:'Bearer '+tok,'Content-Type':'application/json'};
  let r=await fetch(base+'/api/tasks'); assert.equal(r.status,401);
  r=await fetch(base+'/api/tasks',{method:'POST',headers:H,body:JSON.stringify({title:'Alpha task',priority:'high',status:'todo'})}); assert.equal(r.status,201); const c=await r.json(); assert.equal(c.title,'Alpha task');
  r=await fetch(base+'/api/tasks',{method:'POST',headers:H,body:JSON.stringify({title:'Beta task',priority:'low'})}); assert.equal(r.status,201);
  r=await fetch(base+'/api/tasks?q=Alpha',{headers:H}); let j=await r.json(); assert.equal(j.data.length,1);
  r=await fetch(base+'/api/tasks?priority=low',{headers:H}); j=await r.json(); assert.equal(j.data.length,1);
  r=await fetch(base+'/api/tasks/'+c.id,{method:'PUT',headers:H,body:JSON.stringify({title:'Alpha task',status:'done',priority:'high'})}); j=await r.json(); assert.equal(j.status,'done');
  r=await fetch(base+'/api/tasks/export?format=csv',{headers:H}); assert.match(r.headers.get('content-type'),/csv/); assert.match(await r.text(),/Alpha task/);
  r=await fetch(base+'/api/tasks/export?format=json',{headers:H}); j=await r.json(); assert.equal(j.count,2); assert.equal(j.aiGenerated,false);
  for(const f of ["suggest-labels", "quality-score", "prioritize-queue"]){ r=await fetch(base+'/api/tasks/ai/'+f,{method:'POST',headers:H,body:'{}'}); j=await r.json(); assert.equal(j.aiGenerated,false); assert.ok(j.sections); assert.ok('score' in j.sections); assert.ok(Array.isArray(j.sections.items)); }
});
