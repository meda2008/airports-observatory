'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
function assertRetainedScreenshot(root,raw){
 if(raw.representation!=='literal_transcription_of_retained_checkout_screenshot')return;
 const s=raw.originalImage;assert(s&&typeof s.file==='string'&&/^[a-f0-9]{64}$/.test(s.sha256),'Retained screenshot reference required');
 const file=path.resolve(root,s.file);assert(file.startsWith(path.resolve(root)+path.sep),'Screenshot proof outside workspace');
 const bytes=fs.readFileSync(file),png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=bytes.subarray(0,3).equals(Buffer.from([255,216,255]));assert(png||jpeg,'PNG or JPEG original required');
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),s.sha256,'Screenshot original hash mismatch');
 assert.equal(raw.transcriptionReview,'literal_source_self_review_not_independent');
}
module.exports={assertRetainedScreenshot};
