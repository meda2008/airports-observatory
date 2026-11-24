'use strict';
async function handleMeasurementApi({req,res,url,send,measurements,catalogStore}){
 if(!url.pathname.startsWith('/api/admin/measurements'))return false;
 if(!measurements){send(res,503,{error:'measurement_store_unavailable',realMeasurementStatus:'NOT_CONFIGURED'});return true;}
 const route=url.pathname;
 if(req.method==='GET'&&route==='/api/admin/measurements'){const state=measurements.status();send(res,200,{...state,perSiteReadiness:catalogStore.listSites().map(site=>({siteId:site.id,webEvidence:'existing_pipeline_preserved',lineMeasurement:state.profiles.some(p=>p.siteId===site.id&&p.kind==='bandwidth'&&p.enabled&&!p.synthetic)?'configured_requires_observation_and_review':'NOT_CONFIGURED',continuousProbe:state.profiles.some(p=>p.siteId===site.id&&p.kind==='stability'&&p.enabled&&!p.synthetic)?'configured_requires_observation_and_review':'NOT_CONFIGURED',historicalTimelineAvailable:true,syntheticCountsAsServiceMeasurement:false}))});return true;}
 if(req.method==='GET'&&route==='/api/admin/measurements/summary'){send(res,200,require('../lib/measurement-conclusions.cjs').summarize(measurements,url.searchParams.get('profileId')));return true;}
 if(req.method==='GET'&&route==='/api/admin/measurements/observations'){const id=url.searchParams.get('profileId');send(res,200,{items:measurements.observations(id).slice(-100),raw:true,conclusionReviewRequired:true});return true;}
 if(req.method==='GET'&&route==='/api/admin/measurements/timeline'){const site=catalogStore.getSite(url.searchParams.get('siteId'));send(res,site?200:404,site?require('../lib/historical-evidence-timeline.cjs').buildHistoricalEvidenceTimeline(site):{error:'site_not_found'});return true;}
 if(req.method!=='POST')return false;
 let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384){send(res,413,{error:'request_too_large'});return true;}}const value=body?JSON.parse(body):{};
 if(typeof value.actor!=='string'||!value.actor.trim()){send(res,400,{error:'actor_required'});return true;}
 let result;
 if(route==='/api/admin/measurements/control')result=measurements.setEnabled(value.enabled);
 else if(route==='/api/admin/measurements/profile'){if(value.profile?.synthetic)throw Error('synthetic_profile_forbidden_on_production_api');if(!catalogStore.getSite(value.profile?.siteId))throw Error('measurement_catalog_identity_missing');result=measurements.configure(value.profile);result={profileId:result.profile.id,revision:result.revision};}
 else if(route==='/api/admin/measurements/request-run')result=measurements.requestRun(value.profileId);
 else if(route==='/api/admin/measurements/propose')result=value.profileIds?require('../lib/measurement-conclusions.cjs').proposeBatch({measurements,catalogStore,profileIds:value.profileIds,observationIdsByProfile:value.observationIdsByProfile||{}}):require('../lib/measurement-conclusions.cjs').propose({measurements,catalogStore,profileId:value.profileId});
 else return false;
 send(res,200,result);return true;
}
module.exports={handleMeasurementApi};
