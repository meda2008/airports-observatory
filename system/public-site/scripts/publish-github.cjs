'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const config=JSON.parse(fs.readFileSync(path.join(root,'.openai/github-target.json'),'utf8'));
const repoDir=path.join(root,'.publish','github');
const env={...process.env,GIT_TERMINAL_PROMPT:'0'};
for(const k of Object.keys(env))if(k.startsWith('GIT_TRACE')||k==='GIT_CURL_VERBOSE')delete env[k];
function run(file,args,{cwd=root,input,allowFailure=false}={}){const r=cp.spawnSync(file,args,{cwd,env,input,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});if(r.error)throw r.error;if(r.status!==0&&!allowFailure)throw new Error(file+' failed: '+(r.stderr||r.stdout).trim());return r;}
const repository=JSON.parse(run('gh',['api','repos/'+config.repository]).stdout);
if(repository.id!==config.repositoryId||repository.full_name!==config.repository||repository.private||!repository.permissions?.admin)throw new Error('GitHub repository identity or access mismatch');
run(process.execPath,[path.join(root,'scripts/validate-site.cjs')]);
fs.mkdirSync(repoDir,{recursive:true});
const resolved=fs.realpathSync(repoDir);if(!resolved.startsWith(fs.realpathSync(root)+path.sep)||fs.lstatSync(repoDir).isSymbolicLink())throw new Error('Invalid publishing checkout');
const git=args=>run('git',args,{cwd:repoDir});
if(!fs.existsSync(path.join(repoDir,'.git')))git(['init','-b',config.branch]);
else if(git(['status','--porcelain']).stdout.trim())throw new Error('Publishing checkout has local changes; preserve them before retrying');
if(path.resolve(git(['rev-parse','--show-toplevel']).stdout.trim()).toLowerCase()!==repoDir.toLowerCase())throw new Error('Publishing Git root mismatch');
const remote=run('git',['remote','get-url','origin'],{cwd:repoDir,allowFailure:true});
if(remote.status===0&&remote.stdout.trim()!==config.remoteUrl)throw new Error('Unexpected publishing remote');
if(remote.status!==0)git(['remote','add','origin',config.remoteUrl]);
const resolvedRemote=git(['ls-remote','--get-url',config.remoteUrl]).stdout.trim();if(resolvedRemote!==config.remoteUrl)throw new Error('Git URL rewriting changes the publishing destination');
git(['config','core.autocrlf','false']);git(['config','core.eol','lf']);
const build=JSON.parse(fs.readFileSync(path.join(root,'dist/build-manifest.json'),'utf8'));
for(const file of [...build.files.map(x=>x.path),'build-manifest.json']){const destination=path.resolve(repoDir,file);if(!destination.startsWith(repoDir+path.sep))throw new Error('Asset path escaped publishing checkout');fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(root,'dist',file),destination);}
const issuePath=path.join(repoDir,'.github','ISSUE_TEMPLATE','evidence-correction.yml');fs.mkdirSync(path.dirname(issuePath),{recursive:true});
fs.writeFileSync(issuePath,'name: 公开资料更正\ndescription: 提交可以公开复核的来源与相反证据\ntitle: "[更正] "\nbody:\n  - type: markdown\n    attributes:\n      value: "请只填写可公开的事实和原始来源，不要附账号、订阅链接、密码或付款资料。提交后公开，尚不代表已经核实。"\n  - type: input\n    id: record\n    attributes:\n      label: 记录编号与名称\n      placeholder: A001 · WgetCloud\n    validations:\n      required: true\n  - type: textarea\n    id: disputed\n    attributes:\n      label: 需要更正的字段或陈述\n    validations:\n      required: true\n  - type: textarea\n    id: evidence\n    attributes:\n      label: 原始公开来源 URL 与观察时间\n      description: 请写明时区，区分亲历、原文陈述和推断。\n    validations:\n      required: true\n  - type: textarea\n    id: proposed\n    attributes:\n      label: 建议如何修订及其影响范围\n    validations:\n      required: true\n');
fs.writeFileSync(path.join(repoDir,'README.md'),'# 机场观察\n\n此仓库只保存公开网站的静态产物、公开投影数据和更正模板。\n\n名称候选不等于独立经营主体；登记、证书和网页材料不证明付费业务可用。当前没有可评分的数值预测。观察日期、证据缺口与来源分别记录。\n\n网站：'+JSON.parse(fs.readFileSync(path.join(root,'.openai/site-origin.json'),'utf8')).origin+'/\n\n更正请使用本仓库 Issues，提供原始公开来源和观察时刻。提交不代表已经核实；复核后应追加修订并保留历史。\n\n原始项目代码、账户资料、本地日志和完整第三方网页归档不在本仓库中。\n');
fs.appendFileSync(path.join(repoDir,'README.md'),'\n## 独立核对\n\n网站的“版本核对”页可按需核对当前文件，也可下载公开工具。GitHub Download ZIP解压到新目录后，在该目录使用Node.js22或以上执行：\n\n```text\nnode verify-publication.cjs --directory . --allow-repository-metadata\n```\n\n只有固定的README、更正模板和换行配置可以作为仓库元数据忽略；其他额外文件仍拒绝。外部保存的清单哈希可通过`--expected-manifest-sha256`对照。随包哈希不能证明事实、可信时间或原始完整台账链。\n\n## 离线结算\n\n公开台账当前245条全部弃判，0条可评分，Brier未计算。`settle-ledger.cjs`只进行结构校验和算术；数值预测须事前冻结，结果须有未参与建模者的裁决声明和原始证据，独立性仍须人工核验。字段契约见`settlement.README.md`。空裁决输入不代表存活或停服。\n');
fs.writeFileSync(path.join(repoDir,'.gitattributes'),'* text eol=lf\n');
const allowed=new Set([...build.files.map(x=>x.path),'build-manifest.json','README.md','.gitattributes','.github/ISSUE_TEMPLATE/evidence-correction.yml']);
function check(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(dir===repoDir&&e.name==='.git')continue;const f=path.join(dir,e.name);if(e.isSymbolicLink())throw new Error('Symlink in publishing checkout');if(e.isDirectory())check(f);else if(e.isFile()&&!allowed.has(path.relative(repoDir,f).split(path.sep).join('/')))throw new Error('Unexpected file in publishing checkout');}}
check(repoDir);
git(['config','user.name','Airports Observatory']);git(['config','user.email','4166116+meda2008@users.noreply.github.com']);
git(['add','--all','--','.']);
if(run('git',['diff','--cached','--quiet'],{cwd:repoDir,allowFailure:true}).status===1)git(['commit','-m','Publish public evidence snapshot and correction channel']);
const commit=git(['rev-parse','HEAD']).stdout.trim();
for(const file of [...build.files.map(x=>x.path),'build-manifest.json']){const blob=cp.execFileSync('git',['show','HEAD:'+file],{cwd:repoDir,env,windowsHide:true,maxBuffer:8*1024*1024});if(!blob.equals(fs.readFileSync(path.join(root,'dist',file))))throw new Error('Git transformed a validated public file: '+file);}
const pushed=run('git',['-c','credential.helper=','-c','credential.helper=!gh auth git-credential','push','--porcelain','origin','HEAD:refs/heads/'+config.branch],{cwd:repoDir});
console.log(pushed.stdout.trim());
const verified=run('git',['-c','credential.helper=','-c','credential.helper=!gh auth git-credential','ls-remote',config.remoteUrl,'refs/heads/'+config.branch],{cwd:repoDir}).stdout.trim().split(/\s+/)[0];if(verified!==commit)throw new Error('Remote commit does not match the validated snapshot');
const receipt={provider:'github-pages',repositoryId:repository.id,repository:config.repository,repositoryUrl:repository.html_url,commitSha:commit,branch:config.branch,pushedAt:new Date().toISOString(),files:allowed.size,publicBuildManifest:build,scope:'public static assets only',deploymentStatus:'SOURCE_PUSHED_NOT_YET_VERIFIED_LIVE'};
fs.writeFileSync(path.join(root,'.openai/github-publication.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({status:'source_pushed',repository:repository.html_url,commit,files:allowed.size}));
