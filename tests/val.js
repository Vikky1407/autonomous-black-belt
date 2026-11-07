// Prints the JS engine results on the sample data as JSON for tests/val.py to compare.
const S=require('../src/stats.js'),mk=require('../src/data.js');const rows=mk(S);const y=rows.map(r=>r.Cycle_Time_Hrs);
const grp=c=>{const m={};rows.forEach(r=>(m[r[c]]??=[]).push(r.Cycle_Time_Hrs));return Object.keys(m).sort().map(k=>m[k]);};
const out={};
out.ad=S.andersonDarling(y);
for(const c of['Channel','Team','Shift','Region']){const g=grp(c);out[c]={anova:S.anova(g),welch:S.welchAnova(g),kw:S.kruskal(g),lev:S.levene(g)};}
const x=rows.map(r=>r.Line_Items);out.pear=S.pearson(x,y);out.spear=S.spearman(x,y);
const lv=[...new Set(rows.map(r=>r.Channel))].sort(),ex=[...new Set(rows.map(r=>r.Exception_Reason))].sort();
const tab=lv.map(a=>ex.map(b=>rows.filter(r=>r.Channel===a&&r.Exception_Reason===b).length));out.chi=S.chiSquare(tab);
out.ols=(()=>{const o=S.ols(rows.map(r=>[r.Line_Items,r.PO_Type==='Non-PO'?1:0]),y);return{beta:o.beta,r2:o.r2,adj:o.adjR2,F:o.F,p:o.p}})();
out.cap=S.capability(y,{usl:48},S.imr(y).sigma);
out.t=S.tInv975(20);out.holm=S.holm([0.01,0.04,0.03,0.2]);
console.log(JSON.stringify(out,(k,v)=>typeof v==='number'?+v.toPrecision(6):v));
