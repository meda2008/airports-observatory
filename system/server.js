'use strict';
const{createApp}=require('./lib/app.cjs');
function start({port=Number(process.env.PORT||4000),host='127.0.0.1'}={}){
 if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT must be an integer between 0 and 65535');
 const{app,service}=createApp();
 const server=app.listen(port,host,()=>console.log(JSON.stringify({event:'listening',service:'airports-local',url:'http://'+host+':'+server.address().port,catalogCount:service.stats().totalCatalog,dataVersion:service.dataVersion,evidenceAsOf:service.evidenceAsOf})));
 server.on('error',err=>{console.error(JSON.stringify({event:'startup_failed',code:err.code,message:err.message}));process.exitCode=1;});return server;
}
if(require.main===module)start();
module.exports={start,createApp};
