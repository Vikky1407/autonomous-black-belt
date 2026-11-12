// Replays the live feed through the monitor and prints every detection, to check it against the planted events.
const fs=require('fs'),BB=require('../src/engine.js'),Mon=require('../src/monitor.js');
const rows=BB.parseCSV(fs.readFileSync(__dirname+'/../data/live_feed_invoices.csv','utf8'));
const prof=BB.profile(rows),types=Object.fromEntries(prof.map(c=>[c.name,c.type]));
const xs=prof.filter(c=>c.name!=='Cycle_Time_Hrs'&&['categorical','continuous'].includes(c.type)).map(c=>c.name);
const st=Mon.create(rows,{y:'Cycle_Time_Hrs',dateCol:'Received_Date',spec:{usl:48,lsl:NaN},xs,types,baselineDays:30});
console.log('baseline: %s%% out, sigma %s, limits %s-%s, critical %s',(st.basePct*100).toFixed(1),st.baseSigma.toFixed(2),st.limits.lcl.toFixed(1),st.limits.ucl.toFixed(1),st.critical.map(c=>c.x));
let r,day=30;while((r=Mon.step(st))){day++;for(const e of r.events){if(e.type==='incident'){const i=e.incident;console.log(`day ${day} ${i.opened} INCIDENT #${i.id}:`,i.signals.map(s=>s.kind+': '+s.text).join(' | '));console.log('   where:',i.where.text.replace(/<[^>]+>/g,''));console.log('   rerun vital:',i.vital,'new:',i.newX);}else console.log(`day ${day} ${e.incident.closed} RECOVERED #${e.incident.id} after ${e.incident.daysOpen} signal days`);}}
st.tracker.forEach(t=>console.log('tracker',t.x,'base',t.base.toFixed(2),'->',t.points.slice(-3).map(p=>p.v.toFixed(2)).join(','),t.status));
const k=Mon.kpis(st);console.log('end 20-day: %s%% out, sigma %s',(k.pct20*100).toFixed(1),k.sigma20.toFixed(2));
