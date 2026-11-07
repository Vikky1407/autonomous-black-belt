// Runs the engine on every dataset in /data and prints verdicts, to compare with data/ANSWER_KEY.md
const fs=require('fs'),BB=require('../src/engine.js');
const specs={'sample_invoices.csv':{usl:48},'call_centre_handle_time.csv':{usl:8},'filling_line_weight.csv':{usl:505,lsl:495},'it_service_desk.csv':{usl:24},'claims_accuracy.csv':{lsl:98}};
for(const [file,sp] of Object.entries(specs)){
  const rows=BB.parseCSV(fs.readFileSync(__dirname+'/../data/'+file,'utf8')),prof=BB.profile(rows),types=Object.fromEntries(prof.map(c=>[c.name,c.type]));
  const y=BB.suggestY(prof),dateCol=(prof.find(c=>c.type==='date')||{}).name,xs=prof.filter(c=>c.name!==y&&['categorical','continuous'].includes(c.type)).map(c=>c.name);
  const R=BB.run(rows,{y,xs,spec:{usl:sp.usl??NaN,lsl:sp.lsl??NaN},dateCol,types});
  console.log(`\n== ${file}  Y=${y}  n=${R.n}  out=${(R.cap.observedPct*100).toFixed(1)}%  sigma=${R.cap.sigmaLevel.toFixed(2)}  special=${R.special.map(s=>s.label).join(',')||'none'}  warn=${R.warnings.length}`);
  R.results.forEach(r=>console.log('  ',r.verdict.padEnd(22),r.x.padEnd(22),r.method.padEnd(22),r.effName,r.effect.toFixed(3),r.symptom?'(symptom)':''));
  const re=R.scenarios.find(s=>s.kind==='realistic');if(re)console.log('   realistic ->',(re.cap.observedPct*100).toFixed(1)+'%',re.cap.sigmaLevel.toFixed(2)+'σ');
}
