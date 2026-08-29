const XLSX=require("xlsx");
const wb=XLSX.readFile('C:/Users/dusti/.claude/uploads/a0130f7b-8bb3-4ec7-852e-5d7d7d725906/61178473-Peptide_Calibration_Analysis_v2_2.xlsx');
const rows=XLSX.utils.sheet_to_json(wb.Sheets['Raw Calibration Data'],{header:1,blankrows:false});
const cC=[2,3,4,5,6,7], hC=[14,15,16,17,18,19];
const LOW=100, HIGH=1800, CAP=1.0, STEP=0.005;
const up=x=>Math.ceil(x/STEP+1e-9)*STEP, down=x=>Math.floor(x/STEP+1e-9)*STEP, near=x=>Math.round(x/STEP)*STEP;

const byName=new Map();
for(const r of rows.slice(1)){ const n=r[0]; if(!n) continue;
  const pts=[]; for(let i=0;i<6;i++){const c=r[cC[i]],h=r[hC[i]];
    if(typeof c==='number'&&typeof h==='number'&&h>0)pts.push([c,h]);}
  if(pts.length>=2){ if(!byName.has(n))byName.set(n,[]); byName.get(n).push(...pts); } }
byName.set('NAD+',[[0.05,126.250],[0.5,1284.941]]);   // supplied by Dustin

const res=[];
for(const [name,raw] of byName){
  // average replicates at each concentration
  const m0=new Map();
  for(const [c,h] of raw){ if(!m0.has(c))m0.set(c,[]); m0.get(c).push(h); }
  const pts=[...m0.entries()].map(([c,hs])=>[c,hs.reduce((a,b)=>a+b,0)/hs.length]).sort((a,b)=>a[0]-b[0]);
  const loC=pts[0][0], loH=pts[0][1], hiC=pts[pts.length-1][0], hiH=pts[pts.length-1][1];
  const n=pts.length, sx=pts.reduce((s,p)=>s+p[0],0), sy=pts.reduce((s,p)=>s+p[1],0);
  const sxx=pts.reduce((s,p)=>s+p[0]*p[0],0), sxy=pts.reduce((s,p)=>s+p[0]*p[1],0);
  const m=(n*sxy-sx*sy)/(n*sxx-sx*sx), b=(sy-m*sx)/n;
  if(!(m>0)){ res.push({name,skip:"response does not increase with concentration"}); continue; }

  // FLOOR: never below the lowest standard actually run. If that standard
  // already clears 100 mAU, the floor is simply the lowest tested point.
  let L1, floorNote="";
  if(loH>=LOW){ L1=up(loC); }
  else {
    let f=null;
    for(let i=0;i<pts.length-1;i++){ const [c1,h1]=pts[i],[c2,h2]=pts[i+1];
      if(h1<LOW&&h2>=LOW){ f=c1+(LOW-h1)*(c2-c1)/(h2-h1); break; } }
    if(f==null){ res.push({name,skip:`never reaches ${LOW} mAU within the tested range (max ${Math.round(hiH)} mAU at ${hiC})`}); continue; }
    L1=up(f); floorNote="floor raised";
  }
  // CEILING: extrapolate the fit to 1800 mAU but cap at 2x the tested top.
  const cHigh=(HIGH-b)/m;
  let L6=down(Math.min(cHigh,CAP));
  const capped=cHigh>CAP, extrap=Math.min(cHigh,CAP)>hiC;
  if(L6<=L1){ res.push({name,skip:`no usable span (L1 ${L1.toFixed(3)} >= L6 ${L6.toFixed(3)})`}); continue; }
  const lv=[]; for(let i=0;i<6;i++) lv.push(near(L1+(L6-L1)*i/5));
  for(let i=1;i<6;i++) if(lv[i]<=lv[i-1]) lv[i]=near(lv[i-1]+STEP);
  res.push({name, levels:lv, m, b, capped, extrap, floorNote,
            h1:Math.round(m*lv[0]+b), h6:Math.round(m*lv[5]+b)});
}
const f=v=>v.toFixed(3);
console.log("compound".padEnd(20)+"L1     L2     L3     L4     L5     L6     mAU@L1/L6   note");
for(const o of res.sort((a,b)=>a.name.localeCompare(b.name))){
  if(o.skip){ console.log(o.name.padEnd(20)+"SKIPPED - "+o.skip); continue; }
  const note=[o.floorNote,o.capped?"capped@1.0":(o.extrap?"extrap>0.5":"")].filter(Boolean).join(", ");
  console.log(o.name.padEnd(20)+o.levels.map(f).join("  ")+`   ${String(o.h1).padStart(4)}/${String(o.h6).padStart(4)}   ${note}`);
}
require('fs').writeFileSync('./cal-levels.json',JSON.stringify(res.filter(r=>r.levels),null,1));
console.log("\nwrote "+res.filter(r=>r.levels).length+" ladders; skipped "+res.filter(r=>r.skip).length);
