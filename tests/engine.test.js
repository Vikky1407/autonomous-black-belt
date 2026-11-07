// Runs the full DMAIC engine on the sample data and prints the key findings.
const fs=require('fs'),BB=require('../src/engine.js');
const rows=BB.parseCSV(fs.readFileSync(__dirname+'/../data/sample_invoices.csv','utf8'));
const prof=BB.profile(rows),types=Object.fromEntries(prof.map(c=>[c.name,c.type]));
const y=BB.suggestY(prof),dateCol=(prof.find(c=>c.type==='date')||{}).name;
const xs=prof.filter(c=>c.name!==y&&(c.type==='categorical'||c.type==='continuous')).map(c=>c.name);
console.log('profile',prof.map(c=>c.name+':'+c.type).join(' | '));console.log('Y',y,'date',dateCol,'xs',xs);
const R=BB.run(rows,{y,xs,spec:{usl:48,lsl:NaN},dateCol,types});
const c=R.cap;console.log('n',R.n,'mean',c.mean.toFixed(2),'Ppk',c.Ppk.toFixed(3),'Cpk',c.Cpk.toFixed(3),'obs%',(c.observedPct*100).toFixed(2),'DPMO',Math.round(c.dpmo),'sigma',c.sigmaLevel.toFixed(2));
console.log('special',R.special.map(s=>s.label+' '+s.v.toFixed(1)),'shifts',R.shifts);
for(const r of R.results)console.log(r.verdict.padEnd(22),r.x.padEnd(18),r.method.padEnd(22),'padj',r.pAdj.toExponential(2),r.effName,r.effect.toFixed(3),r.symptom?'(symptom)':'');
console.log('model',R.model&&{r2:R.model.r2.toFixed(3),inputs:R.model.inputs});
console.log('pareto',R.pareto&&R.pareto.items.map(i=>i.name+':'+i.count).join(', '));
for(const s of R.scenarios)console.log(s.name.padEnd(36),'mean',s.mean.toFixed(1),'%out',(s.cap.observedPct*100).toFixed(1),'band',s.band.map(b=>(b*100).toFixed(1)).join('-'),'sigma',s.cap.sigmaLevel.toFixed(2),'Ppk',s.cap.Ppk.toFixed(2));
console.log('warnings',R.warnings);
console.log(R.results[0].trail.map(t=>t.join(': ')).join('\n'));
