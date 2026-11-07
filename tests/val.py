# Cross-checks every number from the JS stats engine against SciPy/statsmodels.
import json,pathlib,pandas as pd,numpy as np
from scipy import stats
import statsmodels.api as sm, statsmodels.formula.api as smf
from statsmodels.stats.oneway import anova_oneway
from statsmodels.stats.diagnostic import normal_ad
from statsmodels.stats.multitest import multipletests
H=pathlib.Path(__file__).resolve().parent
d=pd.read_csv(H.parent/'data'/'sample_invoices.csv',keep_default_na=False);y=d.Cycle_Time_Hrs.values;J=json.load(open(H/'js.json'))
def cmp(name,a,b):
    ok=abs(a-b)<=max(1e-4,1e-3*abs(b)) or (abs(b)<1e-10 and abs(a)<1e-10)
    print(f"{'OK ' if ok else 'XX '} {name:28s} js={a:.6g}  ref={b:.6g}")
ad,p=normal_ad(y);cmp('AD A2*',J['ad']['A2'],ad);cmp('AD p (minitab-style)',J['ad']['p'],p)
for c in['Channel','Team','Shift','Region']:
    g=[v.Cycle_Time_Hrs.values for k,v in sorted(d.groupby(c))]
    F,pa=stats.f_oneway(*g);cmp(c+' ANOVA F',J[c]['anova']['F'],F);cmp(c+' ANOVA p',J[c]['anova']['p'],pa)
    w=anova_oneway(g,use_var='unequal');cmp(c+' Welch F',J[c]['welch']['F'],w.statistic);cmp(c+' Welch p',J[c]['welch']['p'],w.pvalue)
    H,pk=stats.kruskal(*g);cmp(c+' KW H',J[c]['kw']['H'],H);cmp(c+' KW p',J[c]['kw']['p'],pk)
    W,pl=stats.levene(*g);cmp(c+' Levene W',J[c]['lev']['W'],W);cmp(c+' Levene p',J[c]['lev']['p'],pl)
r,pp=stats.pearsonr(d.Line_Items,y);cmp('Pearson r',J['pear']['r'],r);cmp('Pearson p',J['pear']['p'],pp)
rho,ps=stats.spearmanr(d.Line_Items,y);cmp('Spearman rho',J['spear']['rho'],rho);cmp('Spearman p',J['spear']['p'],ps)
ct=pd.crosstab(d.Channel,d.Exception_Reason);chi=stats.chi2_contingency(ct,correction=False);cmp('Chi2',J['chi']['X2'],chi[0]);cmp('Chi2 p',J['chi']['p'],chi[1])
d['np']=(d.PO_Type=='Non-PO').astype(int);m=sm.OLS(y,sm.add_constant(d[['Line_Items','np']])).fit()
for i,b in enumerate(m.params):cmp(f'OLS b{i}',J['ols']['beta'][i],b)
cmp('OLS R2',J['ols']['r2'],m.rsquared);cmp('OLS adjR2',J['ols']['adj'],m.rsquared_adj);cmp('OLS F',J['ols']['F'],m.fvalue)
mr=np.abs(np.diff(y)).mean()/1.128;cmp('Ppk',J['cap']['Ppk'],(48-y.mean())/(3*y.std(ddof=1)));cmp('Cpk',J['cap']['Cpk'],(48-y.mean())/(3*mr))
cmp('t 0.975 df20',J['t'],stats.t.ppf(.975,20))
for a,b in zip(J['holm'],multipletests([0.01,0.04,0.03,0.2],method='holm')[1]):cmp('Holm',a,b)
