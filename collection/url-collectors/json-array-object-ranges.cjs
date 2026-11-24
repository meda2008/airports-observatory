'use strict';
// Preserve HTTP JSON spelling (including escaped Unicode), not JSON.stringify output.
function dataObjectRanges(body){
 const parsed=JSON.parse(body);if(Object.keys(parsed).length!==1||!Array.isArray(parsed.data))throw Error('single_data_array_required');
 const header=/^\s*\{\s*"data"\s*:\s*\[/u.exec(body);if(!header)throw Error('data_array_header_required');
 let i=header[0].length;const rows=[];while(i<body.length){while(/\s/.test(body[i]||'')&&i<body.length)i++;if(body[i]===']')break;if(body[i]!=='{')throw Error('object_row_required');const start=i;let depth=0,string=false,escape=false;
  for(;i<body.length;i++){const c=body[i];if(string){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')string=false;}else if(c==='"')string=true;else if(c==='{'||c==='[')depth++;else if(c==='}'||c===']'){depth--;if(depth===0){i++;break;}}}
  if(depth!==0||string)throw Error('unfinished_json_row');const quote=body.slice(start,i);rows.push({start,end:i,quote,value:JSON.parse(quote)});while(/\s/.test(body[i]||'')&&i<body.length)i++;if(body[i]===','){i++;continue;}if(body[i]===']')break;throw Error('array_delimiter_required');
 }if(rows.length!==parsed.data.length)throw Error('array_row_count_mismatch');return rows;
}
module.exports={dataObjectRanges};
