'use strict';
const Service = require('webos-service');
const service = new Service('com.vineeth.vtvsleep.service');
const ACTIVITY='com.vineeth.vtvsleep.shutdown';

function localDateString(d){
  const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function cancelActivity(cb){
  service.call('luna://com.palm.activitymanager/cancel',{activityName:ACTIVITY},()=>cb&&cb());
}
function schedule(minutes, cb){
  const when=new Date(Date.now()+minutes*60000);
  const spec={
    name:ACTIVITY,
    description:'V/TV scheduled power off',
    type:{background:true,persist:true,explicit:true},
    schedule:{start:localDateString(when)},
    callback:{method:'luna://com.vineeth.vtvsleep.service/fire',params:{reason:'timer'}},
    metadata:{minutes,createdAt:new Date().toISOString(),firesAt:when.toISOString()}
  };
  service.call('luna://com.palm.activitymanager/create',{activity:spec,start:true,replace:true,subscribe:false},m=>cb(m.payload,when));
}
function attemptPowerOff(cb){
  // Capability probe / direct path. Retail LG firmware may deny sleep.management.
  service.call('luna://com.webos.service.sleep/shutdown/machineOff',{reason:'offTimer'},m=>cb(m.payload));
}
service.register('arm', msg=>{
  const minutes=Math.max(1,Math.min(720,Number(msg.payload.minutes||30)));
  schedule(minutes,(result,when)=>msg.respond({returnValue:!!result.returnValue,minutes,firesAt:when.toISOString(),activity:result,note:'Timer is TV-side; iPhone/Mac do not need to remain awake.'}));
});
service.register('cancel', msg=>cancelActivity(()=>msg.respond({returnValue:true,cancelled:true})));
service.register('powerTest', msg=>attemptPowerOff(result=>msg.respond({returnValue:!!result.returnValue,result,warning:'If this powers the TV off, direct TV-only mode is viable. If permission is denied, use the LAN SSAP fallback.'})));
service.register('fire', msg=>{
  attemptPowerOff(result=>{
    // If permission is denied, this cannot guarantee shutdown without an external SSAP client.
    msg.respond({returnValue:!!result.returnValue,powerResult:result,firedAt:new Date().toISOString()});
  });
});
