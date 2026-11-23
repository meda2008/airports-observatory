'use strict';
const fs=require('node:fs');
async function main(file){const options=JSON.parse(fs.readFileSync(file,'utf8')),api=await import('../collection/unified-workflow.mjs'),state=api.initializeUnifiedRun(options);console.log(JSON.stringify({runId:state.runId,scope:state.scope.length,reusedSources:state.scopeReceipt.reusedSources,unreadTasks:state.scopeReceipt.unreadTasks}));}
if(require.main===module)main(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
