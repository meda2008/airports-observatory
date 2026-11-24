'use strict';
const {createService}=require('../lib/site-collector-registry.cjs');
if(require.main===module){try{const command=process.argv[2]||'status';if(!['init','plan','status'].includes(command))throw Error('Usage: node scripts/site-collector-registry.cjs init|plan|status');console.log(JSON.stringify(createService()[command](),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
