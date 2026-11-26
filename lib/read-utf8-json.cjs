'use strict';
const {TextDecoder}=require('node:util');
const MAX_JSON_BYTES=2*1024*1024;
async function readJsonObject(stream,{maxBytes=MAX_JSON_BYTES,tooLarge='请求过大',invalid='无效参数'}={}){const chunks=[];let total=0;for await(const part of stream){const chunk=Buffer.isBuffer(part)?part:Buffer.from(part);total+=chunk.length;if(total>maxBytes)throw Error(tooLarge);chunks.push(chunk);}let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,total));}catch{throw Error(invalid);}const value=JSON.parse(text||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw Error(invalid);return value;}
module.exports={MAX_JSON_BYTES,readJsonObject};
