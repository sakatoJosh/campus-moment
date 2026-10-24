/* Campus Moment. Prototype — all data stays in localStorage. */
//#LOGIC-START
const G=9.81;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

/* ---------- Triaxial pothole detector ----------
   Works for a phone clamped to the handlebar at any tilt. Gravity is tracked on all three axes, so "vertical" is whatever
   direction gravity points in the phone's own frame. A hit needs: speed above 5 km/h, a vertical spike with a rebound,
   a pitch/roll jolt from the gyro, and no sustained yaw (turning) or horizontal acceleration (braking). */
const SPEED_MIN=1.39; /* 5 km/h in m/s */
class Detector{
  constructor(mode){this.setMode(mode||'mounted');this.reset();}
  setMode(m){this.mode=m;this.thr=m==='pocket'?5.2:7.2;this.jolt=m==='pocket'?22:35;}
  reset(){this.g=null;this.last=null;this.state=0;this.cool=-1;this.pre=[];this.start=0;this.pos=0;this.neg=0;this.n=0;this.postHi=0;this.postN=0;this.thrAt=1;this.speedAt=0;this.preFrac=0;this.pk=0;this.yawS=0;this.ahS=0;this.hasG=false;}
  feed(t,ax,ay,az,speed,gx,gy,gz){
    const dt=this.last==null?0.02:clamp(t-this.last,0.001,0.2);this.last=t;
    const a=[ax,ay,az];
    if(!this.g)this.g=a.slice();
    const k=dt/(dt+0.8);
    for(let i=0;i<3;i++)this.g[i]+=k*(a[i]-this.g[i]);
    const gm=Math.hypot(this.g[0],this.g[1],this.g[2])||1,u=[this.g[0]/gm,this.g[1]/gm,this.g[2]/gm];
    const lin=[ax-this.g[0],ay-this.g[1],az-this.g[2]];
    const av=lin[0]*u[0]+lin[1]*u[1]+lin[2]*u[2];
    const ah=Math.sqrt(Math.max(0,lin[0]*lin[0]+lin[1]*lin[1]+lin[2]*lin[2]-av*av));
    const hasG=gx!=null&&gy!=null&&gz!=null;this.hasG=hasG;
    let yaw=0,pr=0;
    if(hasG){yaw=gx*u[0]+gy*u[1]+gz*u[2];pr=Math.sqrt(Math.max(0,gx*gx+gy*gy+gz*gz-yaw*yaw));}
    const thr=this.thr*(0.6+0.4*clamp(speed,1,12)/6);
    let ev=null,rej=null,rejT=t;
    if(this.state===0){
      if(Math.abs(av)>thr&&t>=this.cool){
        if(speed<SPEED_MIN){rej='Too slow';this.cool=t+1;}
        else{
          let hi=0;for(const x of this.pre)if(x>0.35*thr)hi++;
          this.preFrac=this.pre.length>=10?hi/this.pre.length:0;
          this.state=1;this.start=t;this.pos=Math.max(av,0);this.neg=Math.min(av,0);this.thrAt=thr;this.n=1;this.postHi=0;this.postN=0;this.speedAt=speed;
          this.pk=pr;this.yawS=Math.abs(yaw);this.ahS=ah;
        }
      }
    }else{
      this.n++;
      if(this.n>5){this.postN++;if(Math.abs(av)>0.35*this.thrAt)this.postHi++;}
      if(av>this.pos)this.pos=av;if(av<this.neg)this.neg=av;
      if(pr>this.pk)this.pk=pr;this.yawS+=Math.abs(yaw);this.ahS+=ah;
      if(t-this.start>=0.4){
        const peak=Math.max(this.pos,-this.neg),thr0=this.thrAt;
        const rebound=Math.min(this.pos,-this.neg)>0.45*thr0;
        const postFrac=this.postN?this.postHi/this.postN:0;
        const meanYaw=this.yawS/this.n,meanAh=this.ahS/this.n;
        this.state=0;this.cool=t+1.5;rejT=this.start;
        if(!rebound)rej='No rebound';
        else if(this.preFrac>=0.2||postFrac>=0.15)rej='Rough road';
        else if(this.hasG&&meanYaw>12)rej='Turning';
        else if(meanAh>2.2)rej='Braking';
        else if(this.hasG&&this.pk<this.jolt)rej='No pitch jolt';
        else ev={t:this.start,peakG:peak/G,conf:clamp(0.6+0.3*(peak/thr0-1)+(this.hasG?0.08*clamp(this.pk/this.jolt-1,0,1):0),0.5,0.98),speed:this.speedAt,pitchRoll:this.pk,yaw:meanYaw};
      }
    }
    this.pre.push(Math.abs(av));if(this.pre.length>25)this.pre.shift();
    return{av,thr,pr,yaw,ah,ev,rej,rejT};
  }
}

/* ---------- Campus geometry (from campus.js) ---------- */
if(typeof CAMPUS==='undefined')window.CAMPUS={origin:{lat:37.3352,lon:-121.8811},bounds:{x0:-446,x1:432,y0:-286,y1:504},buildings:[],streets:[],pools:[],gold:[],labels:[],gates:[],greens:[]};
CAMPUS.greens=CAMPUS.greens||[];CAMPUS.bounds=CAMPUS.bounds||{x0:-446,x1:432,y0:-286,y1:504};
const B=CAMPUS.buildings.map(b=>{
  const xs=b.p.map(q=>q[0]),ys=b.p.map(q=>q[1]);
  return{...b,short:b.code,x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys),
    cx:xs.reduce((a,v)=>a+v,0)/xs.length,cy:ys.reduce((a,v)=>a+v,0)/ys.length};
});
const BI=Object.fromEntries(B.map(b=>[b.id,b]));
const BSORT=[...B].sort((a,b)=>a.name.localeCompare(b.name));
function nearest(x,y){let best=null,bd2=1e9;for(const b of B){const dx=Math.max(b.x0-x,0,x-b.x1),dy=Math.max(b.y0-y,0,y-b.y1);const d=Math.hypot(dx,dy);if(d<bd2){bd2=d;best=b;}}return{b:best,d:bd2};}
/* City streets: 4th, 10th, San Fernando, San Salvador, and S 7th and S 8th south of the Paseo. Everything else is campus. */
function isCityStreet(x,y){
  if(Math.abs(x+446)<12||Math.abs(x-432)<12)return true;
  if(Math.abs(y-504)<12||Math.abs(y+286)<12)return true;
  if(Math.abs(x+2)<10&&y<-20&&y>-290)return true;
  if(Math.abs(x-141)<10&&y<-160&&y>-290)return true;
  return false;
}

/* ---------- Report types ---------- */
const CATS={
  elevator:{label:'Broken elevator',code:'E',dept:'Facilities Services',sev:'med',opts:[{k:'out',label:'Out of service'},{k:'stuck',label:'Stuck between floors',sev:'high'},{k:'door',label:'Door problem',sev:'low'}]},
  uhs:{label:'University Housing (UHS)',code:'H',dept:'University Housing Services',sev:'low',opts:[{k:'front',label:'Front desk or access'},{k:'conduct',label:'Noise or conduct'},{k:'mail',label:'Package or mail'},{k:'other',label:'Something else'}]},
  lamp:{label:'Broken lamp post',code:'L',dept:'Facilities Services',sev:'med',opts:[{k:'out',label:'Light is out'},{k:'flicker',label:'Flickering',sev:'low'},{k:'pole',label:'Pole damaged',sev:'high'}]},
  parking:{label:'Parking problem',code:'P',dept:'Parking Services',sev:'low',opts:[{k:'two',label:'Taking two spots'},{k:'block',label:'Blocking my car',sev:'med'},{k:'lane',label:'Blocking a lane or exit',sev:'med'},{k:'other',label:'Something else'}]},
  wifi:{label:'Dead wifi spot',code:'W',dept:'Information Technology',sev:'low',opts:[{k:'none',label:'No connection'},{k:'slow',label:'Very slow',sev:'low'},{k:'drop',label:'Keeps dropping'}]},
  safety:{label:'Safety or welfare',code:'S',dept:'Campus safety',sev:'med',opts:[
    {k:'welfare',label:'Someone may need a welfare check',route:'Student Affairs outreach',sev:'med'},
    {k:'trespass',label:'Unauthorized access or trespass',route:'UPD, non-emergency',sev:'med'},
    {k:'urgent',label:'Threat or emergency',route:'UPD. Call 911 first',sev:'high'}]},
  graffiti:{label:'Graffiti',code:'G',dept:'Facilities Services',sev:'low',opts:[{k:'tag',label:'Tag or paint'},{k:'offensive',label:'Offensive message',sev:'med'}]},
  water:{label:'Water issue',code:'~',dept:'Facilities Services',sev:'med',opts:[{k:'leak',label:'Leak or flooding',sev:'high'},{k:'nowater',label:'No water'},{k:'quality',label:'Dirty or bad tasting',sev:'med'},{k:'fountain',label:'Fountain broken',sev:'low'}]},
  dorm:{label:'Dorm maintenance',code:'D',dept:'Housing maintenance',sev:'med',opts:[{k:'heat',label:'Heat or air'},{k:'plumb',label:'Plumbing'},{k:'electric',label:'Electrical'},{k:'lock',label:'Door or lock'},{k:'other',label:'Something else',sev:'low'}]},
  pothole:{label:'Pothole or road damage',code:'R',dept:'Facilities Services',sev:'med',opts:[{k:'pothole',label:'Pothole'},{k:'crack',label:'Cracked or lifted pavement'},{k:'ride',label:'Detected on a ride'}]}
};
const HIGHRX=/flood|leak|burst|stuck|trapped|spark|smoke|fire|exposed|glass|injur|no water|pitch|unsafe|wheelchair|cannot|can't/i;
const LOWRX=/minor|small|cosmetic|faded|tiny/i;
function routeFor(cat,opt,x,y){
  if(cat==='pothole')return isCityStreet(x,y)?'City of San José Transportation':'Facilities Services';
  if(cat==='safety'){const o=CATS.safety.opts.find(o=>o.k===opt);return o?o.route:CATS.safety.dept;}
  return CATS[cat].dept;
}
function triage({cat,opt,text,bld,x,y,peakG}){
  const c=CATS[cat],o=c.opts.find(o=>o.k===opt)||c.opts[0];
  let sev=o.sev||c.sev;
  if(cat!=='safety'){if(HIGHRX.test(text||''))sev='high';else if(LOWRX.test(text||'')&&sev!=='high')sev='low';}
  if(peakG!=null)sev=peakG>2.2?'high':peakG>1.4?'med':'low';
  const place=bld&&BI[bld]?BI[bld].name:'campus';
  const t=(text||'').trim();
  const desc=t?(t[0].toUpperCase()+t.slice(1)).replace(/[.!?]*$/,'.'):(c.label+': '+o.label.toLowerCase()+'.');
  return{type:c.label,sub:o.label,title:(cat==='safety'?o.label:o.label+' ('+c.label.toLowerCase()+')')+' near '+place,description:desc,severity:sev,building:place,route:routeFor(cat,opt,x,y),status:'reported'};
}

/* ---------- Crowd verification ---------- */
function tally(r){let c=0,d=0;for(const v of r.votes){if(v.v>0)c++;else d++;}return{c,d};}
function nextStatus(r){
  if(r.locked||r.status==='assigned'||r.status==='fixed'||r.status==='dismissed')return r.status;
  const{c,d}=tally(r);
  if(c>=2&&c>d)return'verified';
  if(d>=2&&d>c)return'dismissed';
  return'reported';
}
function visible(r,now,viewer){
  if(r.status==='dismissed')return false;
  if(r.cat==='safety'){
    if(now-r.t>7200000)return false;
    if(r.by!==viewer&&r.status==='reported'&&tally(r).c<2)return false;
  }
  return true;
}
function leaderboard(reports){
  const m=new Map();
  for(const r of reports){if(r.status==='verified'||r.status==='assigned'||r.status==='fixed'){const e=m.get(r.by)||{by:r.by,n:0,first:Infinity};e.n++;e.first=Math.min(e.first,r.t);m.set(r.by,e);}}
  return[...m.values()].sort((a,b)=>b.n-a.n||a.first-b.first);
}
/* Weighted median of recent crowd reports. Older ones fade, vouches add weight, disputes remove it. */
function aggregate(list,now,half){
  half=half||20;const items=[];let sw=0;
  for(const r of list){
    const age=(now-r.t)/60000;if(age>120)continue;
    const net=r.votes.reduce((a,x)=>a+x.v,0);
    const w=Math.max(0.1,Math.pow(0.5,age/half)*(1+0.5*net));
    items.push({v:r.v,w});sw+=w;
  }
  if(!items.length||sw<0.25)return null;
  items.sort((a,b)=>a.v-b.v);let acc=0;
  for(const it of items){acc+=it.w;if(acc>=sw/2)return{v:it.v,n:items.length,weight:sw};}
  return null;
}
/* School email check */
const CONFIG={requireEdu:true,allowGuest:true,domains:['sjsu.edu']};
function eduOk(email){
  const m=/^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec((email||'').trim().toLowerCase());
  if(!m)return false;
  return CONFIG.domains.some(d=>m[1]===d||m[1].endsWith('.'+d));
}
const shortName=n=>{const p=(n||'').trim().split(/\s+/).filter(Boolean);return p.length<2?(p[0]||'You'):p[0]+' '+p[p.length-1][0].toUpperCase()+'.';};

/* ---------- Scripted demo ride on real streets: Paseo de San Carlos, S 7th St, San Salvador St ----------
   Generates raw triaxial samples for a phone tilted 35 degrees on the handlebar, including things the detector must reject:
   a bump while turning, a hard brake, rough pavement and a jolt at walking pace. Every seed hits the same real potholes plus one stray bump. */
function makeDemo(seed){
  const rng=mulberry32(seed||7);
  const gauss=()=>Math.sqrt(-2*Math.log(1-rng()))*Math.cos(2*Math.PI*rng());
  const path=[[396.5,-1],[0,-1],[-2,-286],[-242,-286]];
  const cum=[0];for(let i=1;i<path.length;i++)cum.push(cum[i-1]+Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]));
  const END=cum[cum.length-1];
  const holes=[{d:90,a:12},{d:240,a:14},{d:450,a:12.5},{d:560,a:13},{d:740,a:12.5},{d:850,a:15},{d:140,a:5},{d:170+((seed||7)*53)%120,a:12.5,stray:true}];
  const rough=[300,345],turns=[cum[1],cum[2]],brakeAt=520,bumpAt=cum[1]+4;
  const TH=35*Math.PI/180,sT=Math.sin(TH),cT=Math.cos(TH);
  let sim=0,s=0,vPrev=0.3,jost=false,braked=false,bumped=false;const pend=[],fired=new Set();
  const at=d=>{let i=1;while(i<cum.length-1&&cum[i]<d)i++;const k=(d-cum[i-1])/(cum[i]-cum[i-1]);return[path[i-1][0]+(path[i][0]-path[i-1][0])*k,path[i-1][1]+(path[i][1]-path[i-1][1])*k];};
  const wave=a=>({i:0,w:[a,-0.9*a,0.5*a,-0.3*a,0.12*a],q:[7*a,-6*a,3*a,-1.8*a,0.7*a]});
  return{END,real:6,path,step(){
    sim+=0.02;
    const v=sim<2?0.3:Math.min(8.5,0.3+(sim-2)*1.4);
    s+=v*0.02;
    let av=gauss()*0.9,f=(v-vPrev)/0.02+gauss()*0.35,l=gauss()*0.3,p=gauss()*5,r=gauss()*4,y=gauss()*2;
    vPrev=v;
    if(s>rough[0]&&s<rough[1])av=gauss()*4;
    for(const c of turns)if(Math.abs(s-c)<6.5){y+=30;l+=30*Math.PI/180*v;}
    if(Math.abs(s-brakeAt)<4){f-=4.8;p+=25;}
    if(!jost&&sim>=1.2){jost=true;pend.push(wave(14));}
    if(!braked&&s>=brakeAt-4){braked=true;pend.push(wave(9));}
    if(!bumped&&s>=bumpAt){bumped=true;pend.push(wave(12));}
    holes.forEach((h,k)=>{if(!fired.has(k)&&s>=h.d){fired.add(k);pend.push(wave(h.a));}});
    for(const q of pend){const i=q.i++;av+=q.w[i]||0;p+=q.q[i]||0;r+=0.35*(q.q[i]||0);}
    for(let i=pend.length-1;i>=0;i--)if(pend[i].i>=pend[i].w.length)pend.splice(i,1);
    /* world axes (right, forward, up) into the tilted phone frame */
    const aw=[l,f,G+av],gw=[p,r,y];
    return{t:sim,a:[aw[0],aw[1]*cT+aw[2]*sT,-aw[1]*sT+aw[2]*cT],w:[gw[0],gw[1]*cT+gw[2]*sT,-gw[1]*sT+gw[2]*cT],v,s,pos:at(Math.min(s,END)),done:s>=END};
  }};
}
/* Headless pass for "simulate riders": same detector, GPS jitter of about 2.5 m. */
function simulatePass(seed){
  const demo=makeDemo(seed),det=new Detector('mounted'),rng=mulberry32(seed*97+3);
  const gj=()=>Math.sqrt(-2*Math.log(1-rng()))*Math.cos(2*Math.PI*rng())*2.5;
  const ev=[],rej=[];
  for(let i=0;i<60000;i++){
    const x=demo.step(),r=det.feed(x.t,x.a[0],x.a[1],x.a[2],x.v,x.w[0],x.w[1],x.w[2]);
    if(r.ev)ev.push({...r.ev,pos:[x.pos[0]+gj(),x.pos[1]+gj()]});
    if(r.rej)rej.push({t:r.rejT,reason:r.rej});
    if(x.done)break;
  }
  return{ev,rej};
}
/* Group hits that land within 10 m of each other. A spot counts rides, not hits, so one rider repeating a bump does not flag it. */
const SPOT_RADIUS=10;
function clusterHits(hits){
  const spots=[];
  for(const h of hits){
    let best=null,bd=SPOT_RADIUS;
    for(const s of spots){const d=Math.hypot(s.x-h.x,s.y-h.y);if(d<bd){bd=d;best=s;}}
    if(best){best.hits.push(h);best.x=best.hits.reduce((a,q)=>a+q.x,0)/best.hits.length;best.y=best.hits.reduce((a,q)=>a+q.y,0)/best.hits.length;}
    else spots.push({x:h.x,y:h.y,hits:[h]});
  }
  for(const s of spots){s.rides=new Set(s.hits.map(h=>h.ride)).size;s.peak=Math.max(...s.hits.map(h=>h.peakG));s.speed=s.hits.reduce((a,q)=>a+q.speed,0)/s.hits.length;}
  return spots;
}
//#LOGIC-END

/* ================= App ================= */
const KEY='campusmoment.v1';
const USERS={u1:'Priya S.',u2:'Diego A.',u3:'Hannah K.',u4:'Ben C.',u5:'Aarav P.',u6:'Lena W.',u7:'Marcus T.',u8:'Sofia R.'};
const $=(s,r)=>(r||document).querySelector(s);
const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MIN=60000;
const uid=()=>Math.random().toString(36).slice(2,6).toUpperCase();
const ago=t=>{const m=Math.round((Date.now()-t)/MIN);return m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':Math.round(m/1440)+' d ago';};
const sevLabel={high:'High',med:'Medium',low:'Low'};
const statusLabel={reported:'Reported',verified:'Verified',assigned:'Assigned',fixed:'Fixed',dismissed:'Dismissed'};
const statusColor={reported:'--reported',verified:'--verified',assigned:'--assigned',fixed:'--fixed',dismissed:'--dismissed'};
const normStatus=s=>statusLabel[s]?s:'reported';
const normSev=s=>sevLabel[s]?s:'med';
const wkStart=()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toISOString().slice(0,10);};
let S=null;
const nameOf=id=>id==='me'?((S&&S.user&&S.user.name)?shortName(S.user.name):'You'):(USERS[id]||'Someone');
function pinPos(b,i){const bb=BI[b]||BI.su||B[0];return[bb.cx+((i*37)%5-2)*5,bb.cy+((i*53)%5-2)*5];}
const initials=n=>((n||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('')||'?').toUpperCase();
const hue=s=>{let h=0;for(const c of String(s))h=(h*31+c.charCodeAt(0))%360;return h;};
const avatar=(name,key)=>`<span class="av">${esc(initials(name))}</span>`;

/* Motion: GSAP when it loaded and the user has not asked for reduced motion. Every call degrades to a no-op. */
const GS=window.gsap||null;
const MOTION=!!GS&&!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
function reveal(root){
  if(!MOTION)return;
  const els=$$('.rv',root).filter(e=>e.offsetParent!==null);
  if(els.length)GS.from(els,{y:10,duration:.4,stagger:.04,ease:'power3.out',clearProps:'transform'});
}

/* Icons: 24px stroke set */
const IC={
  camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
  flag:'<path d="M5 21V4M5 4h12l-2.5 4.5L17 13H5"/>',
  bike:'<circle cx="6" cy="17" r="3.2"/><circle cx="18" cy="17" r="3.2"/><path d="M6 17l3.5-7h5.5l3 7M9.5 10 8.5 7H6.5M12.5 13.5H8.5"/>',
  chat:'<path d="M20.5 12a8 8 0 0 1-11.4 7.2L3.5 20.5l1.4-4.9A8 8 0 1 1 20.5 12z"/>',
  map:'<path d="M9 4 3 6.2v13.6L9 17.6l6 2.2 6-2.2V4.2L15 6.4z"/><path d="M9 4v13.6M15 6.4v13.4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',x:'<path d="M6 6l12 12M18 6 6 18"/>',check:'<path d="M5 12.5 10 17.5 19 7"/>',
  chev:'<path d="m6 9 6 6 6-6"/>',up:'<path d="m6 15 6-6 6 6"/>',down:'<path d="m6 9 6 6 6-6"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1z"/>',
  user:'<circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20c.8-3.8 3.8-5.6 7.5-5.6s6.7 1.8 7.5 5.6"/>',
  wave:'<path d="M5 14.5c2.6-.8 3.7-4.5 7-4.5s4.4 3.7 7 4.5"/>',
  elevator:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9.5 10.5 12 8l2.5 2.5M9.5 13.5 12 16l2.5-2.5"/>',
  home:'<path d="M3.5 10.5 12 3.5l8.5 7V20h-17z"/><path d="M9.5 20v-5.5h5V20"/>',
  bulb:'<path d="M9 18.5h6M10 21h4M12 3.5a6 6 0 0 0-3.8 10.7c.8.7 1 1.4 1 2.3h5.6c0-.9.2-1.6 1-2.3A6 6 0 0 0 12 3.5z"/>',
  parking:'<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M10 16.5v-9h3a2.8 2.8 0 0 1 0 5.6h-3"/>',
  wifi:'<path d="M2.5 9a15 15 0 0 1 19 0M5.7 12.4a10.4 10.4 0 0 1 12.6 0M9 15.8a5.4 5.4 0 0 1 6 0"/><path d="M12 19.3h.01"/>',
  shield:'<path d="M12 3l7.5 2.8v5.7c0 4.6-3.2 7.9-7.5 9.5-4.3-1.6-7.5-4.9-7.5-9.5V5.8z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  pencil:'<path d="M4 20l1-4.2L16.3 4.5a2.1 2.1 0 0 1 3 3L8 18.8z"/><path d="M14.5 6.5l3 3"/>',
  drop:'<path d="M12 3.5s6 6.4 6 10.7a6 6 0 0 1-12 0c0-4.3 6-10.7 6-10.7z"/>',
  wrench:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5l3 3 5.8-5.8a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.5-.6-.6-2.5z"/>',
  road:'<path d="M7 20 9.5 4M17 20 14.5 4M12 5.5v3M12 11v3M12 16.5v3"/>',
  pin:'<path d="M12 21s6.5-5.6 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.4 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  thumb:'<path d="M7 11v9H4v-9z"/><path d="M7 11l4-7.5a2 2 0 0 1 2 2V9h5.6a2 2 0 0 1 2 2.3l-1.2 6.6a2 2 0 0 1-2 1.7H7"/>'
};
const CATICON={elevator:'elevator',uhs:'home',lamp:'bulb',parking:'parking',wifi:'wifi',safety:'shield',graffiti:'pencil',water:'drop',dorm:'wrench',pothole:'road'};
const icon=(n,s=18,sw=1.5)=>`<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]||''}</svg>`;
const catIcon=(cat,s=20)=>icon(CATICON[cat]||'pin',s);

function seed(){
  const now=Date.now();const reports=[];
  const add=(cat,opt,bld,text,by,mins,voters,status,pos)=>{
    const p=pos||pinPos(bld,reports.length);
    const near=bld||nearest(p[0],p[1]).b.id;
    const tr=triage({cat,opt,text,bld:near,x:p[0],y:p[1]});
    reports.push({id:'R'+uid(),cat,opt,b:near,title:tr.title,desc:tr.description,sev:tr.severity,bld:tr.building,route:tr.route,x:p[0],y:p[1],by,t:now-mins*MIN,src:cat==='pothole'?'ride':'manual',
      votes:voters.map(u=>({u,v:1})),status,locked:false});
  };
  add('elevator','out','jwh','Elevator out since this morning, lots of bags on the stairs','u1',380,['u1','u2','u3'],'assigned');
  add('lamp','out','eng','Lamp on the south side is dark again','u2',1400,['u2','u4','u5'],'verified');
  add('pothole','ride',null,'Sharp hit on S 7th Street, detected on a ride','u4',200,['u4','u6'],'verified',[0,-150]);
  add('parking','two','spg','Truck across two spots on level 3','u3',90,['u3'],'reported');
  add('wifi','none','bbc','No signal in the back classrooms','u5',2600,['u5','u7','u2'],'verified');
  add('graffiti','tag','cva','Tag on the wall by the bike racks','u6',4000,['u6','u1','u8'],'fixed');
  add('water','leak','jwh','Water pooling by the side entrance','u7',150,['u7','u3'],'verified');
  add('dorm','heat','cvc','Heater not working in the third floor lounge','u8',700,['u8'],'reported');
  add('lamp','flicker','su','Flickering lamp near the Union steps','u1',2200,['u1','u6'],'assigned');
  add('pothole','ride',null,'Pothole on San Salvador Street near the garage, detected on a ride','u2',300,['u2'],'reported',[-120,-286]);
  add('elevator','door','cl','Door sticks on the second floor','u6',5000,['u6','u4','u2'],'fixed');
  add('safety','welfare','king','Near the east entrance','u3',50,['u3','u5'],'verified');
  add('uhs','front','cvb','Front desk closes before packages are sorted','u4',1000,['u4'],'reported');
  add('wifi','slow','su','Very slow around the food court at lunch','u4',240,['u4'],'reported');
  add('water','nowater','dc','Fountain by the dining commons is dry','u5',1800,['u5','u2'],'verified');
  add('pothole','ride',null,'Rough edge on the paseo, detected on a ride','u8',600,['u8','u3'],'verified',[-150,-1]);
  const ch=[];
  const c=(chan,v,mins,by,votes)=>ch.push({id:'C'+uid(),chan,v,t:now-mins*MIN,by,votes:(votes||[]).map(u=>({u,v:1}))});
  c('su-food',35,6,'u1',['u2','u3']);c('su-food',40,14,'u5',['u4']);c('su-food',30,3,'u6',[]);
  c('starbucks',45,9,'u2',['u1']);c('starbucks',40,4,'u7',['u3']);
  c('dc',10,12,'u8',[]);
  c('spg',2,15,'u3',['u1']);c('spg',2,6,'u4',[]);c('wpg',1,20,'u5',[]);c('npg',0,10,'u6',[]);
  c('king-lib',0,25,'u7',['u2']);c('su-noise',2,8,'u8',[]);c('eng-noise',1,30,'u1',[]);
  const wk=wkStart();
  const srac=[
    {id:'S1',what:'Lap swim',days:[1,2,3,4,5],start:'06:00',end:'08:00',by:'u2',wk,votes:['u2','u5']},
    {id:'S2',what:'Group fitness',days:[1,3,5],start:'12:15',end:'13:00',by:'u3',wk,votes:['u3']},
    {id:'S3',what:'Climbing wall',days:[2,4],start:'17:00',end:'20:00',by:'u6',wk,votes:['u6','u1']},
    {id:'S4',what:'Open swim',days:[0,6],start:'12:00',end:'15:00',by:'u4',wk:'2000-01-03',votes:['u4']},
    {id:'S5',what:'Court hours',days:[0,1,2,3,4,5,6],start:'15:00',end:'21:00',by:'u7',wk,votes:['u7','u8','u2']}
  ].map(e=>({...e,votes:e.votes.map(u=>({u,v:1}))}));
  const posts=[
    {id:'P1',title:'Quiet floors in King after 8',content:'Fourth floor is actually silent if you go past the printers. Bring a jacket.',authorId:'u1',authorName:'Priya S.',t:now-80*MIN,votes:[{u:'u2',v:1},{u:'u5',v:1}]},
    {id:'P2',title:'South garage is a trap at 10am',content:'Went in looking for one spot, sat in the ramp for twelve minutes. West was open.',authorId:'u3',authorName:'Hannah K.',t:now-400*MIN,votes:[{u:'u4',v:1}]},
    {id:'P3',title:'Union sushi line vs. dining commons',content:'Commons was faster today even at noon. Union looked frozen.',authorId:'u6',authorName:'Lena W.',t:now-1200*MIN,votes:[{u:'u1',v:1},{u:'u8',v:-1}]}
  ];
  return{v:3,reports,ch,srac,posts,user:null,cal:[0,0],hits:[],flagged:[]};
}
try{S=JSON.parse(localStorage.getItem(KEY));}catch(e){}
if(!S||S.v!==3)S=seed();
S.hits=S.hits||[];S.flagged=S.flagged||[];S.posts=S.posts||[];
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}};
let toastT=0;
function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,3200);}

/* ---------- Sheets ---------- */
let sheetClose=null;
function openSheet(title,html,onClose){
  const w=$('#sheet');sheetClose=onClose||null;
  w.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="grab"></div>
    <div class="sheet-head"><h2>${esc(title)}</h2><button class="closebtn" data-act="closesheet" aria-label="Close">${icon('x',18)}</button></div>
    <div class="sheet-body">${html}</div></div>`;
  w.hidden=false;
}
function closeSheet(){
  const w=$('#sheet');if(w.hidden)return;
  w.hidden=true;w.innerHTML='';
  const f=sheetClose;sheetClose=null;if(f)f();
}

/* ---------- School email sign in ---------- */
/* In this demo there is no mail server, so the code is shown on screen. The live version emails it: replace sendCode. */
const DEMO_SHOW_CODE=true;
function sendCode(email,code){return Promise.resolve();}
const gate={step:1,name:'',email:'',code:'',err:'',agree:false};
function renderGate(force){
  const g=$('#gate');
  if(!force&&(S.user||!CONFIG.requireEdu)){g.hidden=true;return;}
  g.hidden=false;
  let body='';
  if(gate.step===1){
    body=`<span class="kicker">San José State</span>
      <div class="stack" style="gap:12px"><h1>Campus Moment</h1><p class="muted">Report infrastructure issues on campus. Sign in with your SJSU email so every report comes from a real student.</p></div>
      <div><label for="g-name">Full name</label><input type="text" id="g-name" autocomplete="name" value="${esc(gate.name)}"></div>
      <div><label for="g-email">School email</label><input type="email" id="g-email" autocomplete="email" placeholder="you@sjsu.edu" value="${esc(gate.email)}"></div>
      <label class="check"><input type="checkbox" id="g-agree" ${gate.agree?'checked':''}><span>I will report honestly, and I will not photograph or describe individual people.</span></label>
      ${gate.err?`<p class="err" role="alert">${esc(gate.err)}</p>`:''}
      <div class="stack" style="gap:8px"><button class="btn primary block" data-act="gsend">Send my code</button>
      ${CONFIG.allowGuest?'<button class="btn ghost block" data-act="gguest">Look around as a guest</button>':''}</div>`;
  }else{
    body=`<span class="kicker">Verification</span>
      <div class="stack" style="gap:12px"><h1>Enter your code</h1><p class="muted">We sent a 6 digit code to ${esc(gate.email)}. Check spam for Campus Moment.</p></div>
      ${DEMO_SHOW_CODE?`<div class="warnbox">Demo only: no email is sent here. Your code is <span class="democode">${esc(gate.code)}</span></div>`:''}
      <div><label for="g-code">6 digit code</label><input type="text" id="g-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div>
      ${gate.err?`<p class="err" role="alert">${esc(gate.err)}</p>`:''}
      <div class="stack" style="gap:8px"><button class="btn primary block" data-act="gverify">Verify</button>
      <button class="btn ghost block" data-act="gback">Use a different email</button></div>`;
  }
  g.innerHTML=`<div class="box">${body}</div>`;
}
function needVerified(){
  if(S.user&&S.user.verified)return true;
  toast('Sign in with your school email to do that.');gate.step=1;gate.err='';renderGate(true);return false;
}
function renderMe(){
  const b=$('#me'),ok=S.user&&S.user.verified;
  b.innerHTML=ok?esc(shortName(S.user.name)[0]||'U'):icon('user',20);
  b.title=ok?S.user.name:'Sign in';
}

/* ---------- Map ---------- */
const hex2rgb=h=>{h=String(h).trim();if(h[0]==='#'){if(h.length===4)h='#'+h[1]+h[1]+h[2]+h[2]+h[3]+h[3];const n=parseInt(h.slice(1),16);return[n>>16&255,n>>8&255,n&255];}const m=h.match(/[\d.]+/g)||[128,128,128];return[+m[0],+m[1],+m[2]];};
const mixc=(a,b,t)=>'rgb('+a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(',')+')';
const inPoly=(x,y,pts)=>{let c=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))c=!c;}return c;};
const GATE_LABEL_ZOOM=1.3;
const BN=CAMPUS.bounds;
const CAMPUS_BOX=[[BN.x0,BN.y1],[BN.x1,BN.y1],[BN.x1,BN.y0],[BN.x0,BN.y0]];
class CampusMap{
  constructor(canvas,z0){
    this.c=canvas;this.ctx=canvas.getContext('2d');this.pal=null;this.z0=z0||1;
    this.yaw=0.52;this.tilt=0.92;this.zoom=this.z0;this.flat=false;this.ox=-10;this.oy=70;
    this.pins=[];this.trail=[];this.rider=null;this.sel=null;this.onSelect=null;this.onView=null;
    this.hits=[];this.tops=[];this.W=300;this.H=300;this.d=1;this.s=1;this.raf=0;
    const ptrs=new Map();let g=null;
    canvas.addEventListener('pointerdown',e=>{
      ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});try{canvas.setPointerCapture(e.pointerId);}catch(x){}
      if(GS)GS.killTweensOf(this);
      if(ptrs.size===1)g={mode:'pan',sx:e.clientX,sy:e.clientY,moved:false};
      else if(ptrs.size===2){const[a,b]=[...ptrs.values()];g={mode:'pinch',d0:Math.hypot(a.x-b.x,a.y-b.y)||1,a0:Math.atan2(b.y-a.y,b.x-a.x),z0:this.zoom,y0:this.yaw};}
    });
    canvas.addEventListener('pointermove',e=>{
      const p=ptrs.get(e.pointerId);if(!p||!g)return;
      const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
      if(g.mode==='pan'){
        if(!g.moved&&Math.hypot(e.clientX-g.sx,e.clientY-g.sy)<6)return;
        g.moved=true;this.panBy(dx,dy);this.draw();
      }else if(g.mode==='pinch'&&ptrs.size>=2){
        const[a,b]=[...ptrs.values()];
        this.zoom=clamp(g.z0*(Math.hypot(a.x-b.x,a.y-b.y)/g.d0),0.6,5);
        this.yaw=g.y0+(Math.atan2(b.y-a.y,b.x-a.x)-g.a0);this.draw();
      }
    });
    const end=e=>{
      ptrs.delete(e.pointerId);
      if(!g)return;
      if(g.mode==='pan'&&e.type==='pointerup'&&!g.moved){
        const r=canvas.getBoundingClientRect();this.tap(e.clientX-r.left,e.clientY-r.top);
      }
      if(ptrs.size===0)g=null;else if(g.mode==='pinch'&&ptrs.size===1)g={mode:'pan',sx:0,sy:0,moved:true};
    };
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=clamp(this.zoom*Math.pow(1.0016,-e.deltaY),0.6,5);this.draw();},{passive:false});
  }
  tap(px,py){
    let best=null,bd=22;
    for(const h of this.hits){const d=Math.min(Math.hypot(h.x-px,h.y-py),Math.hypot(h.tx-px,h.ty-py));if(d<bd){bd=d;best=h;}}
    let bid=null;
    if(!best){for(let i=this.tops.length-1;i>=0;i--){if(inPoly(px,py,this.tops[i].pts)){bid=this.tops[i].id;break;}}}
    if(this.onSelect)this.onSelect(best?best.id:null,bid);
  }
  panBy(dx,dy){
    const t=this.flat?Math.PI/2:this.tilt,cy=Math.cos(this.yaw),sy=Math.sin(this.yaw);
    const rx=dx/this.s,ry=-dy/(this.s*Math.sin(t));
    this.ox=clamp(this.ox-(rx*cy+ry*sy),BN.x0,BN.x1);this.oy=clamp(this.oy-(-rx*sy+ry*cy),BN.y0,BN.y1);
  }
  size(){
    const r=this.c.getBoundingClientRect();const d=Math.min(window.devicePixelRatio||1,2);
    const w=Math.round(r.width*d),h=Math.round(r.height*d);
    if(this.c.width!==w||this.c.height!==h){this.c.width=w;this.c.height=h;}
    this.W=r.width;this.H=r.height;this.d=d;
  }
  P(x,y,z){
    const dx=x-this.ox,dy=y-this.oy,cy=Math.cos(this.yaw),sy=Math.sin(this.yaw);
    const rx=dx*cy-dy*sy,ry=dx*sy+dy*cy,t=this.flat?Math.PI/2:this.tilt;
    return[this.W/2+rx*this.s,this.H/2-(ry*Math.sin(t)+(z||0)*Math.cos(t))*this.s,ry];
  }
  loadPal(){
    const cs=getComputedStyle(document.documentElement),g=n=>cs.getPropertyValue(n).trim();
    const out=hex2rgb(g('--map-out'));
    this.pal={out:g('--map-out'),campus:g('--map-campus'),street:g('--map-street'),casing:g('--map-case'),path:g('--map-path'),
      bld:hex2rgb(g('--map-bld')),park:hex2rgb(g('--map-park')),green:g('--map-green')||g('--map-path'),line:g('--map-line'),ink:g('--map-ink'),water:g('--map-water'),
      shadow:hex2rgb(g('--map-shadow')),gold:g('--gold'),muted:g('--muted'),bad:g('--bad'),inkc:g('--ink'),
      font:g('--font')||'system-ui,sans-serif',mono:g('--mono')||'monospace',
      dark:(out[0]*.3+out[1]*.59+out[2]*.11)<110,vars:{}};
    for(const v of Object.values(statusColor))this.pal.vars[v]=g(v);
  }
  draw(){
    if(!this.c.clientWidth)return;
    if(!this.pal)this.loadPal();
    const P0=this.pal;
    this.size();const ctx=this.ctx;ctx.setTransform(this.d,0,0,this.d,0,0);
    const t=this.flat?Math.PI/2:this.tilt,tm=performance.now()/1000;
    this.s=Math.min(this.W/1380,this.H/(1280*Math.sin(t)+140))*this.zoom;
    const W=this.W,H=this.H;
    ctx.fillStyle=P0.out;ctx.fillRect(0,0,W,H);
    const path=(pts,close)=>{ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));if(close)ctx.closePath();};
    const gp=(x,y)=>this.P(x,y,0);

    /* campus ground */
    path(CAMPUS_BOX.map(p=>gp(p[0],p[1])),true);ctx.fillStyle=P0.campus;ctx.fill();
    ctx.strokeStyle=P0.casing;ctx.lineWidth=1.5;ctx.stroke();
    for(const g of CAMPUS.greens){path(g.map(p=>gp(p[0],p[1])),true);ctx.fillStyle=P0.green;ctx.fill();}

    /* streets: asphalt for the four city streets, lighter strips for the campus paseos */
    ctx.lineJoin='round';ctx.lineCap='butt';
    const sts=CAMPUS.streets;
    for(const st of sts){const pts=st.p.map(p=>gp(p[0],p[1])),w=Math.max(3,st.w*this.s*1.1);ctx.strokeStyle=P0.casing;ctx.lineWidth=w+3;path(pts);ctx.stroke();}
    for(const st of sts){
      const pts=st.p.map(p=>gp(p[0],p[1])),w=Math.max(3,st.w*this.s*1.1),paseo=st.w>=20;
      ctx.strokeStyle=paseo?P0.path:P0.street;ctx.lineWidth=w;path(pts);ctx.stroke();
      if(!paseo&&this.s>0.28){ctx.strokeStyle=P0.dark?'rgba(255,255,255,.12)':'rgba(0,0,0,.12)';ctx.lineWidth=1;ctx.setLineDash([7,7]);path(pts);ctx.stroke();ctx.setLineDash([]);}
    }
    for(const pl of CAMPUS.pools){path(pl.map(p=>gp(p[0],p[1])),true);ctx.fillStyle=P0.water;ctx.fill();ctx.strokeStyle='rgba(255,255,255,.25)';ctx.lineWidth=1;ctx.stroke();}
    if(this.trail.length>1){ctx.strokeStyle=P0.gold;ctx.lineWidth=4;ctx.lineCap='round';path(this.trail.map(p=>gp(p[0],p[1])));ctx.stroke();ctx.lineCap='butt';}

    /* items sorted far to near */
    const items=B.map(b=>({b,h:b.h,park:b.park,key:this.P(b.cx,b.cy,0)[2]}));
    for(const g of CAMPUS.gold)if(g.p&&g.h>=12){
      const gx=g.p.reduce((a,q)=>a+q[0],0)/g.p.length,gy=g.p.reduce((a,q)=>a+q[1],0)/g.p.length;
      items.push({b:{id:g.id,p:g.p,name:g.name,gold:true},h:g.h,gold:true,key:this.P(gx,gy,0)[2]});
    }
    items.sort((a,b)=>b.key-a.key);

    /* one soft cast shadow for everything (light from the north west) */
    const sh=new Path2D();
    for(const it of items){
      if(it.h<4)continue;
      for(const k of[.17,.33,.5,.67,.83,1]){
        const sx=it.h*.42*k,sy=-it.h*.42*k;
        it.b.p.forEach((p,i)=>{const q=gp(p[0]+sx,p[1]+sy);i?sh.lineTo(q[0],q[1]):sh.moveTo(q[0],q[1]);});sh.closePath();
      }
    }
    ctx.fillStyle='rgba('+P0.shadow.join(',')+','+(P0.dark?.4:.13)+')';ctx.fill(sh);

    const cy=Math.cos(this.yaw),sy=Math.sin(this.yaw);
    const goldRgb=hex2rgb(P0.gold);
    const lift=P0.dark?[255,255,255]:[120,145,190];
    this.tops=[];
    for(const it of items){
      const b=it.b,pts=b.p,n=pts.length;
      const base=it.gold?goldRgb:it.park?P0.park:P0.bld;
      const top=mixc(base,lift,it.gold||it.park?0:Math.min(1,it.h/55)*(P0.dark?.14:.1));
      const bot=pts.map(p=>this.P(p[0],p[1],0)),roof=pts.map(p=>this.P(p[0],p[1],it.h));
      if(!this.flat){
        const faces=[];
        for(let i=0;i<n;i++){
          const j=(i+1)%n,ex=pts[j][0]-pts[i][0],ey=pts[j][1]-pts[i][1],l=Math.hypot(ex,ey)||1;
          const nx=ey/l,ny=-ex/l,rx=nx*cy-ny*sy,ry=nx*sy+ny*cy;
          if(ry>0.05)continue;
          faces.push({i,j,rx,key:(bot[i][2]+bot[j][2])/2});
        }
        faces.sort((a,b)=>b.key-a.key);
        for(const f of faces){
          const lit=(f.rx+1)/2;
          ctx.fillStyle=P0.dark?mixc(base,[0,0,0],.34+.3*(1-lit)):mixc(base,[44,62,100],.16+.2*(1-lit));
          path([bot[f.i],bot[f.j],roof[f.j],roof[f.i]],true);ctx.fill();
          ctx.strokeStyle=P0.line;ctx.globalAlpha=.55;ctx.lineWidth=.8;ctx.stroke();ctx.globalAlpha=1;
        }
      }
      path(roof,true);ctx.fillStyle=top;ctx.fill();
      ctx.strokeStyle=P0.dark?'rgba(255,255,255,.16)':P0.line;ctx.lineWidth=1;ctx.stroke();
      if(it.park){ /* garage deck lines */
        ctx.save();path(roof,true);ctx.clip();ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=1;
        const xs=roof.map(p=>p[0]),ys=roof.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
        ctx.beginPath();for(let x=x0-(y1-y0);x<x1;x+=9){ctx.moveTo(x,y1);ctx.lineTo(x+(y1-y0),y0);}ctx.stroke();ctx.restore();
      }
      if(!it.gold)this.tops.push({id:b.id,pts:roof.map(p=>[p[0],p[1]])});
    }

    /* labels */
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
    const halo=(txt,x,y,fill)=>{ctx.strokeStyle=P0.campus;ctx.lineWidth=3.5;ctx.strokeText(txt,x,y);ctx.fillStyle=fill;ctx.fillText(txt,x,y);};
    ctx.font='600 9px '+P0.font;
    const tips=this.pins.map(p=>this.P(p.x,p.y,0));
    for(const it of items){
      if(it.gold)continue;
      if(this.zoom<1.25&&it.h<22)continue;
      const b=it.b;
      const q=this.P(b.cx,b.cy,this.flat?0:it.h+1),txt=it.park?'P':b.code;
      if(tips.some(t=>Math.abs(t[0]-q[0])<22&&q[1]>t[1]-52&&q[1]<t[1]+10))continue;
      halo(txt,q[0],q[1],P0.ink);
    }
    ctx.font='500 9px '+P0.font;
    for(const lb of CAMPUS.labels)if(this.zoom>=1.25){const q=gp(lb.p[0],lb.p[1]);halo(lb.t,q[0],q[1],P0.muted);}
    ctx.font='650 10px '+P0.font;
    for(const g of CAMPUS.gates){
      const q=gp(g.p[0],g.p[1]);
      ctx.save();ctx.translate(q[0],q[1]);ctx.rotate(Math.PI/4);ctx.fillStyle=P0.gold;ctx.fillRect(-3.5,-3.5,7,7);ctx.restore();
      if(this.zoom>=GATE_LABEL_ZOOM)halo(g.n,q[0],q[1]-12,P0.ink);
    }

    /* pins: teardrop markers */
    this.hits=[];
    const pins=this.pins.map(p=>({p,q:this.P(p.x,p.y,0)})).sort((a,b)=>b.q[2]-a.q[2]);
    for(const{p,q}of pins){
      const sel=p.id===this.sel,r=sel?14:11,h=r*2.15,hx=q[0],hy=q[1]-h,col=P0.vars[p.color||'--reported']||P0.gold;
      if(sel){
        const ph=(tm*.9)%1,rr=10+22*ph;ctx.save();ctx.globalAlpha=(1-ph)*.7;ctx.strokeStyle=col;ctx.lineWidth=2;
        ctx.beginPath();ctx.ellipse(q[0],q[1],rr,rr*(this.flat?1:Math.sin(this.tilt)),0,0,7);ctx.stroke();ctx.restore();
      }
      ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.ellipse(q[0],q[1]+1,r*.55,r*.22,0,0,7);ctx.fill();
      const b=Math.acos(r/h);
      ctx.beginPath();ctx.moveTo(q[0],q[1]);ctx.lineTo(hx+r*Math.cos(Math.PI/2-b),hy+r*Math.sin(Math.PI/2-b));
      ctx.arc(hx,hy,r,Math.PI/2-b,Math.PI/2+b,true);ctx.closePath();
      ctx.fillStyle=col;ctx.fill();ctx.lineWidth=sel?2:1.4;ctx.strokeStyle=P0.dark?'#0A0A0A':'#F4F2ED';ctx.stroke();
      if(p.sev==='high'){ctx.beginPath();ctx.arc(hx,hy,r+3.5,0,7);ctx.strokeStyle=P0.bad;ctx.lineWidth=1.6;ctx.stroke();}
      ctx.fillStyle=P0.out;ctx.font='500 '+(sel?11:10)+'px '+P0.mono;ctx.fillText(p.code||'',hx,hy+.5);
      this.hits.push({id:p.id,x:hx,y:hy,tx:q[0],ty:q[1]-4});
    }
    if(this.rider){
      const q=gp(this.rider[0],this.rider[1]),ph=(tm*1.2)%1;
      ctx.beginPath();ctx.arc(q[0],q[1],10+14*ph,0,7);ctx.strokeStyle=P0.gold;ctx.globalAlpha=1-ph;ctx.lineWidth=2;ctx.stroke();ctx.globalAlpha=1;
      ctx.beginPath();ctx.arc(q[0],q[1],8,0,7);ctx.fillStyle=P0.gold;ctx.fill();ctx.strokeStyle=P0.dark?'#0A0A0A':'#F4F2ED';ctx.lineWidth=2;ctx.stroke();
    }
    if(this.onView)this.onView();
    if(this.sel&&!this.raf)this.loop();
  }
  loop(){
    this.raf=requestAnimationFrame(()=>{this.raf=0;if(this.sel&&this.c.clientWidth)this.draw();});
  }
  zoomBy(d){const z=clamp(this.zoom*(d>0?1.35:0.74),0.6,5);this.camTo({zoom:z});}
  /* Animate the camera. Falls back to an instant jump without GSAP or with reduced motion. */
  camTo(v,dur){
    if(MOTION){GS.to(this,{...v,duration:dur||.55,ease:'power3.out',overwrite:true,onUpdate:()=>this.draw()});}
    else{Object.assign(this,v);this.draw();}
  }
  flyTo(x,y,z){this.camTo({ox:x,oy:y,zoom:Math.max(this.zoom,z||1.6)},.8);}
  toggleFlat(){this.flat=!this.flat;this.draw();return this.flat;}
  reset(){this.camTo({yaw:.52,tilt:.92,zoom:this.z0,ox:-10,oy:70},.7);this.flat=false;}
}
const maps={map:new CampusMap($('#cv-map'),1.08),ride:new CampusMap($('#cv-ride'),0.85)};
let selB=null;
maps.map.onSelect=(pinId,bid)=>{
  maps.map.sel=pinId;selB=pinId?null:bid;renderMap();
  const r=pinId&&S.reports.find(x=>x.id===pinId);if(r)maps.map.flyTo(r.x,r.y,1.5);
};

/* ---------- Map tab ---------- */
let mapFilter='open';
const pass={open:r=>['reported','verified','assigned'].includes(r.status),verified:r=>['verified','assigned'].includes(r.status),fixed:r=>r.status==='fixed',all:()=>true};
const visibleReports=()=>{const now=Date.now();return S.reports.filter(r=>visible(r,now,'me'));};
function mapPins(){
  return visibleReports().filter(pass[mapFilter]).map(r=>({id:r.id,x:r.x,y:r.y,code:(CATS[r.cat]||{code:'?'}).code,color:statusColor[r.status],sev:r.sev}));
}
const FILTERS=[['open','Open'],['verified','Verified'],['fixed','Fixed'],['all','All']];
function renderFilters(){
  const vis=visibleReports();
  $('#mapfilters').innerHTML=FILTERS.map(([k,l])=>`<button class="chip" data-act="mapf" data-f="${k}" aria-pressed="${mapFilter===k}">${l}<span class="mono" style="opacity:.65">${vis.filter(pass[k]).length}</span></button>`).join('');
}
function renderMap(){
  maps.map.pins=mapPins();
  renderFilters();renderPeek();maps.map.draw();
}
function renderPeek(){
  const box=$('#peek'),r=S.reports.find(x=>x.id===maps.map.sel),b=!r&&selB&&BI[selB];
  const ctl=$('#mapctl'),leg=$('#legend');
  if(!r&&!b){box.hidden=true;ctl.classList.remove('up');leg.classList.remove('off');return;}
  leg.classList.add('off');
  if(r){
    const{c,d}=tally(r),mine=r.votes.find(v=>v.u==='me'),own=r.by==='me';
    const needs=r.status==='reported'&&c<2?`Needs ${2-c} more confirmation${2-c>1?'s':''} to be verified.`:'';
    box.innerHTML=`<button class="x" data-act="peekclose" aria-label="Close">${icon('x',16)}</button>
      <div class="stack" style="gap:12px">
        <div class="row" style="gap:8px"><span class="pill s-${r.status}"><i class="dot"></i>${statusLabel[r.status]}</span><span class="pill v-${r.sev}">${sevLabel[r.sev]} severity</span></div>
        <h3>${esc(r.title)}</h3>
        ${r.photo?`<img class="photo" src="${esc(r.photo)}" alt="">`:''}
        <p class="note" style="color:var(--ink2)">${esc(r.desc)}</p>
        <p class="note">${ago(r.t)} by ${esc(nameOf(r.by))}${r.src==='ride'?' on a ride':''} · Goes to ${esc(r.route)}</p>
        <div class="row between"><span class="mono note">${c} confirm · ${d} not there</span></div>
        ${needs?`<p class="note">${needs}</p>`:''}
        ${own?'<p class="note">You reported this, so someone else confirms it.</p>':`<div class="votebar">
          <button class="btn secondary sm ${mine&&mine.v>0?'on':''}" data-act="vote" data-id="${r.id}" data-v="1">Yes, it's real</button>
          <button class="btn ghost sm ${mine&&mine.v<0?'on':''}" data-act="vote" data-id="${r.id}" data-v="-1">Not there</button></div>`}
      </div>`;
  }else{
    const open=visibleReports().filter(x=>x.b===b.id&&pass.open(x)).length;
    box.innerHTML=`<button class="x" data-act="peekclose" aria-label="Close">${icon('x',16)}</button>
      <div class="stack" style="gap:12px"><div class="row" style="gap:8px"><span class="pill mono">${esc(b.code)}</span></div>
      <h3>${esc(b.name)}</h3><p class="note">${open} open report${open===1?'':'s'} here.</p>
      <button class="btn primary block" data-act="reporthere" data-b="${b.id}">${icon('plus',18,2.2)}Report an issue here</button></div>`;
  }
  box.hidden=false;
  ctl.classList.add('up');ctl.style.setProperty('--peek-h',(box.offsetHeight+4)+'px');
}
function vote(id,v){
  if(!needVerified())return;
  const r=S.reports.find(x=>x.id===id);if(!r||r.by==='me')return;
  const i=r.votes.findIndex(x=>x.u==='me');
  if(i>=0&&r.votes[i].v===v)r.votes.splice(i,1);else if(i>=0)r.votes[i].v=v;else r.votes.push({u:'me',v});
  const before=r.status;r.status=nextStatus(r);save();
  if(before!==r.status)toast(r.status==='verified'?'Verified. It now counts for the reporter.':r.status==='dismissed'?'Dismissed by the crowd.':'Updated.');
  if(r.status==='dismissed')maps.map.sel=null;
  renderMap();renderOpen();renderBoard();
}

/* ---------- Ride (logic unchanged) ---------- */
const ride={rejs:[],lastSim:null,state:'idle',mode:'mounted',det:new Detector('mounted'),evs:[],trail:[],pos:null,speed:0,dist:0,graph:[],timers:[],mh:null,watch:null,wake:null,startMs:0,gpsOff:false,demo:null,lastGps:null};
const rmsg=m=>{$('#ridemsg').textContent=m||'';};
function beginRide(kind){
  ride.state='riding';ride.evs=[];ride.trail=[];ride.pos=null;ride.speed=0;ride.dist=0;ride.graph=[];ride.rejs=[];ride.nrej=0;ride.det.reset();ride.startMs=Date.now();ride.gpsOff=false;ride.kind=kind;ride.lastGps=null;
  $('#b-start').hidden=true;$('#b-demo').hidden=true;const sim=$('#b-sim');if(sim)sim.hidden=true;$('#b-stop').hidden=false;$('#ridelive').hidden=false;$('#review').innerHTML='';
  maps.ride.trail=[];maps.ride.pins=[];maps.ride.rider=null;
  ride.timers.push(setInterval(rideUI,200));
}
function feedSample(t,ax,ay,az,gx,gy,gz){
  const sp=ride.speed||(ride.gpsOff?6:0);
  const r=ride.det.feed(t,ax,ay,az,sp,gx,gy,gz);
  ride.graph.push([t,r.av,r.thr,r.pr,r.yaw,sp]);
  while(ride.graph.length&&t-ride.graph[0][0]>10)ride.graph.shift();
  if(r.rej){ride.rejs.push({t:r.rejT,reason:r.rej});while(ride.rejs.length&&t-ride.rejs[0].t>12)ride.rejs.shift();ride.nrej=(ride.nrej||0)+1;}
  if(r.ev){
    ride.evs.push({id:'E'+uid(),t:r.ev.t,peakG:r.ev.peakG,conf:r.ev.conf,speed:r.ev.speed,pitchRoll:r.ev.pitchRoll,pos:ride.pos?[ride.pos[0],ride.pos[1]]:null,dec:null,mark:r.ev.t});
    try{navigator.vibrate&&navigator.vibrate(30);}catch(x){}
    syncRidePins();
  }
}
function syncRidePins(){
  if(ride.state==='riding'||ride.state==='review'){
    maps.ride.pins=ride.evs.filter(e=>e.pos).map((e,i)=>({id:e.id,x:e.pos[0],y:e.pos[1],code:String(i+1),color:e.dec==='no'?'--dismissed':e.dec==='yes'?'--fixed':'--reported'}));
  }else{
    maps.ride.pins=clusterHits(S.hits).map((sp,i)=>({id:'SP'+i,x:sp.x,y:sp.y,code:String(sp.rides),color:sp.rides>=2?'--verified':'--dismissed',sev:'low'}));
  }
}
function rideUI(){
  if(ride.state!=='riding')return;
  $('#st-speed').textContent=(ride.speed*2.237).toFixed(1);
  $('#st-dist').textContent=Math.round(ride.dist);
  const s=Math.round((Date.now()-ride.startMs)/1000);$('#st-time').textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
  $('#st-ev').textContent=ride.evs.length;$('#st-rej').textContent=ride.nrej||0;
  drawGraph();maps.ride.rider=ride.pos;maps.ride.trail=ride.trail;maps.ride.draw();
}
/* Signal lab: the last 10 s of every channel the detector reads, with each decision marked on it. */
function drawGraph(){
  const c=$('#graph');if(!c.offsetParent)return;
  const d=Math.min(window.devicePixelRatio||1,2),r=c.getBoundingClientRect();
  if(c.width!==Math.round(r.width*d)||c.height!==Math.round(r.height*d)){c.width=Math.round(r.width*d);c.height=Math.round(r.height*d);}
  const ctx=c.getContext('2d');ctx.setTransform(d,0,0,d,0,0);const W=r.width,H=r.height;
  const cs=getComputedStyle(document.documentElement),col=n=>cs.getPropertyValue(n).trim();
  ctx.clearRect(0,0,W,H);
  const g=ride.graph,last=g.length?g[g.length-1]:null,t1=last?last[0]:0,t0=t1-10;
  const thr=last?last[2]:7.2,ymax=Math.max(thr*2,12),jolt=ride.det.jolt;
  const lanes=[{n:'Vertical accel (m/s²)',h:.38,c:'--blue'},{n:'Pitch / roll (°/s)',h:.24,c:'--assigned'},{n:'Yaw (°/s)',h:.20,c:'--reported'},{n:'Speed (m/s)',h:.18,c:'--fixed'}];
  let y=4;const gap=4;const usable=H-8-gap*3;
  for(const l of lanes){l.y0=y;l.y1=y+l.h*usable;y=l.y1+gap;}
  const X=t=>(t-t0)/10*W;
  const scale=[v=>{const L=lanes[0];return(L.y0+L.y1)/2-v/ymax*((L.y1-L.y0)/2-2);},v=>{const L=lanes[1];return L.y1-2-Math.min(v,120)/120*(L.y1-L.y0-4);},
    v=>{const L=lanes[2];return(L.y0+L.y1)/2-clamp(v,-60,60)/60*((L.y1-L.y0)/2-2);},v=>{const L=lanes[3];return L.y1-2-clamp(v,0,12)/12*(L.y1-L.y0-4);}];
  const dash=(yv,color)=>{ctx.setLineDash([4,4]);ctx.strokeStyle=col(color);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,yv);ctx.lineTo(W,yv);ctx.stroke();ctx.setLineDash([]);};
  ctx.font='600 10px '+(col('--font')||'sans-serif');ctx.textBaseline='top';ctx.textAlign='left';
  lanes.forEach((L,i)=>{
    ctx.fillStyle=col('--surface2');ctx.globalAlpha=.55;ctx.fillRect(0,L.y0,W,L.y1-L.y0);ctx.globalAlpha=1;
    if(i===0){dash(scale[0](thr),'--bad');dash(scale[0](-thr),'--bad');}
    if(i===1)dash(scale[1](jolt),'--assigned');
    if(i===2){dash(scale[2](12),'--reported');dash(scale[2](-12),'--reported');}
    if(i===3)dash(scale[3](SPEED_MIN),'--bad');
    ctx.fillStyle=col('--muted');ctx.fillText(L.n,8,L.y0+3);
  });
  if(g.length>1){
    const idx=[1,3,4,5];
    lanes.forEach((L,i)=>{
      ctx.strokeStyle=col(L.c);ctx.lineWidth=1.4;ctx.lineJoin='round';ctx.beginPath();
      g.forEach((p,k)=>{const v=idx[i]===1?clamp(p[1],-ymax,ymax):p[idx[i]];k?ctx.lineTo(X(p[0]),scale[i](v)):ctx.moveTo(X(p[0]),scale[i](v));});ctx.stroke();
    });
  }
  const top=lanes[0].y0,bot=lanes[3].y1;
  for(const e of ride.evs){if(e.mark>=t0){const x=X(e.mark);ctx.strokeStyle=col('--gold');ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bot);ctx.stroke();
    ctx.fillStyle=col('--gold');ctx.textAlign=x>W-60?'right':'left';ctx.fillText('Hit',x+(x>W-60?-5:5),bot-13);}}
  for(const e of ride.rejs){if(e.t>=t0){const x=X(e.t);ctx.strokeStyle=col('--bad');ctx.lineWidth=1.5;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bot);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=col('--bad');ctx.textAlign=x>W-90?'right':'left';ctx.fillText('Ignored: '+e.reason,x+(x>W-90?-5:5),lanes[1].y0+3);}}
}
/* GPS to campus meters. Origin is 7th St Paseo at Paseo de San Carlos. Calibrate there to remove any offset. */
const rawLocal=(lat,lon)=>[(lon-CAMPUS.origin.lon)*111320*Math.cos(CAMPUS.origin.lat*Math.PI/180),(lat-CAMPUS.origin.lat)*110540];
const toLocal=(lat,lon)=>{const r=rawLocal(lat,lon);return[r[0]-S.cal[0],r[1]-S.cal[1]];};
function calibrate(){
  if(!navigator.geolocation){toast('This browser has no GPS.');return;}
  navigator.geolocation.getCurrentPosition(p=>{S.cal=rawLocal(p.coords.latitude,p.coords.longitude);save();toast('Calibrated. Your position is now set to that corner.');},()=>toast('Could not get your location. Allow location access and try again.'),{enableHighAccuracy:true,timeout:10000});
}
function onGps(p){
  const[x,y]=toLocal(p.coords.latitude,p.coords.longitude);
  if(ride.lastGps){const dd=Math.hypot(x-ride.lastGps[0],y-ride.lastGps[1]);ride.dist+=dd;if(p.coords.speed==null)ride.speed=dd/Math.max(0.5,(p.timestamp-ride.lastGps[2])/1000);}
  if(p.coords.speed!=null)ride.speed=p.coords.speed;
  ride.lastGps=[x,y,p.timestamp];ride.pos=[x,y];ride.trail.push([x,y]);
}
async function startReal(){
  if(typeof DeviceMotionEvent==='undefined'){rmsg('This browser has no motion sensors. Try the Demo ride, or open the app on your phone.');return;}
  try{
    if(typeof DeviceMotionEvent.requestPermission==='function'){
      const r=await DeviceMotionEvent.requestPermission();
      if(r!=='granted'){rmsg('Motion access was denied, so ride mode cannot listen.');return;}
    }
  }catch(e){rmsg('Could not ask for motion access here. Try the Demo ride, or open the app on your phone.');return;}
  beginRide('real');rmsg('Riding. Keep your eyes up. Reports are built when you end the ride.');
  let got=false;
  ride.mh=ev=>{const a=ev.accelerationIncludingGravity,rr=ev.rotationRate;if(!a||a.x==null)return;got=true;feedSample(performance.now()/1000,a.x,a.y,a.z,rr&&rr.beta!=null?rr.beta:null,rr&&rr.gamma!=null?rr.gamma:null,rr&&rr.alpha!=null?rr.alpha:null);};
  addEventListener('devicemotion',ride.mh);
  ride.timers.push(setTimeout(()=>{if(ride.state==='riding'&&!got){rmsg('No sensor data is arriving. Open the app on your phone over https, or run the Demo ride.');}},2500));
  if(navigator.geolocation){ride.watch=navigator.geolocation.watchPosition(onGps,()=>{ride.gpsOff=true;},{enableHighAccuracy:true,maximumAge:500});}else ride.gpsOff=true;
  try{ride.wake=await navigator.wakeLock.request('screen');}catch(e){}
}
function startDemo(){
  beginRide('demo');rmsg('Demo ride: a scripted scooter run at about 19 mph on Paseo de San Carlos, S 7th St and San Salvador St, played at 4x speed. The same detector runs on it.');
  const demo=makeDemo(7);ride.demo=demo;
  ride.timers.push(setInterval(()=>{
    for(let k=0;k<8;k++){
      const x=demo.step();ride.speed=x.v;ride.pos=x.pos;
      if(!ride.lastGps||Math.hypot(x.pos[0]-ride.lastGps[0],x.pos[1]-ride.lastGps[1])>4){if(ride.lastGps)ride.dist+=Math.hypot(x.pos[0]-ride.lastGps[0],x.pos[1]-ride.lastGps[1]);ride.lastGps=[x.pos[0],x.pos[1]];ride.trail.push(x.pos);}
      feedSample(x.t,x.a[0],x.a[1],x.a[2],x.w[0],x.w[1],x.w[2]);
      if(x.done){stopRide();return;}
    }
  },40));
}
function stopRide(){
  if(ride.state!=='riding')return;
  for(const t of ride.timers){clearInterval(t);clearTimeout(t);}ride.timers=[];
  if(ride.mh)removeEventListener('devicemotion',ride.mh);ride.mh=null;
  if(ride.watch!=null&&navigator.geolocation)navigator.geolocation.clearWatch(ride.watch);ride.watch=null;
  try{ride.wake&&ride.wake.release();}catch(e){}
  rideUI();
  ride.state=ride.evs.length?'review':'idle';ride.lastGps=null;
  $('#b-start').hidden=false;$('#b-demo').hidden=false;const sim=$('#b-sim');if(sim)sim.hidden=false;$('#b-stop').hidden=true;
  rmsg(ride.evs.length?'Ride finished. Check each hit below, then send.':'Ride finished. No potholes detected.');
  syncRidePins();maps.ride.rider=null;maps.ride.draw();renderReview();
}
function evPlace(e){if(!e.pos)return'Location unknown';const n=nearest(e.pos[0],e.pos[1]);return n.d<40?'near '+n.b.name:isCityStreet(e.pos[0],e.pos[1])?'on a city street':'on a campus path';}
function renderReview(){
  const box=$('#review');
  if(ride.state!=='review'){box.innerHTML='';return;}
  const rows=ride.evs.map((e,i)=>{
    const sel=e.pos?'':`<div><label for="loc-${e.id}">GPS was off. Where was it?</label><select id="loc-${e.id}" data-evloc="${e.id}"><option value="">Pick a building</option>${BSORT.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>`;
    const btn=(d,l)=>`<button class="btn sm ${e.dec===d?'primary':'secondary'}" data-act="dec" data-id="${e.id}" data-d="${d}">${l}</button>`;
    return`<div class="listrow" style="align-items:flex-start"><div class="main stack" style="gap:10px">
      <div class="row between"><b>Hit ${i+1}</b><span class="mono note">${e.peakG.toFixed(1)} g · ${(e.speed*2.237).toFixed(0)} mph · ${Math.round(e.conf*100)}%</span></div>
      <p class="note">${esc(evPlace(e))}</p><div class="row" style="gap:8px">${btn('yes','Pothole')}${btn('unsure','Not sure')}${btn('no','No')}</div>${sel}</div></div>`;
  }).join('');
  const send=ride.evs.filter(e=>e.dec!=='no'&&e.pos).length;
  box.innerHTML=`<div class="card stack"><div><h3>Check your ride</h3>
    <p class="note" style="margin-top:4px">Pothole and Not sure both count as a hit. No drops it. A spot is flagged once a second ride hits it.</p></div><div>${rows}</div>
    <div class="row"><button class="btn primary grow" data-act="sendride" ${send?'':'disabled'}>Save ${send} hit${send===1?'':'s'}</button><button class="btn ghost" data-act="discard">Discard</button></div></div>`;
}
const SIMU={sim1:'u3',sim2:'u5',sim3:'u7'};
/* Turn every spot hit by 2+ rides into one report for the city. Spots already reported are skipped. */
function promoteSpots(){
  S.flagged=S.flagged||[];let made=0;
  for(const sp of clusterHits(S.hits)){
    if(sp.rides<2||S.flagged.some(f=>Math.hypot(f.x-sp.x,f.y-sp.y)<SPOT_RADIUS))continue;
    const near=nearest(sp.x,sp.y).b,tr=triage({cat:'pothole',opt:'ride',text:'',bld:near.id,x:sp.x,y:sp.y,peakG:sp.peak});
    const riders=[...new Set(sp.hits.map(h=>h.ride))].map(r=>SIMU[r]||'me');
    const rep={id:'R'+uid(),cat:'pothole',opt:'ride',b:near.id,title:'Pothole near '+near.name,
      desc:'Hit by '+sp.rides+' separate rides within '+SPOT_RADIUS+' m. Peak '+sp.peak.toFixed(1)+' g at about '+Math.round(sp.speed*2.237)+' mph.',
      sev:tr.severity,bld:near.name,route:tr.route,x:sp.x,y:sp.y,by:riders.includes('me')?'me':riders[0],t:Date.now(),src:'ride',
      votes:[...new Set(riders)].map(u=>({u,v:1})),status:'reported',locked:false};
    rep.status=nextStatus(rep);S.reports.push(rep);S.flagged.push({x:sp.x,y:sp.y,id:rep.id});made++;
  }
  return made;
}
function afterHits(made,msg){
  save();syncRidePins();maps.ride.draw();renderSpots();renderMap();renderOpen();renderBoard();
  toast(made?msg:'Saved. A spot is flagged once a second ride hits it.');
}
function sendRide(){
  if(!needVerified())return;
  const rid='R'+uid();let n=0;
  for(const e of ride.evs){
    if(e.dec==='no'||!e.pos)continue;
    S.hits.push({id:'H'+uid(),ride:rid,x:e.pos[0],y:e.pos[1],peakG:e.peakG,speed:e.speed,t:Date.now()});n++;
  }
  ride.state='idle';ride.evs=[];ride.rejs=[];$('#ridelive').hidden=true;renderReview();rmsg('');
  const made=promoteSpots();
  afterHits(made,n+' hit'+(n===1?'':'s')+' saved. '+made+' spot'+(made===1?'':'s')+' hit by 2+ rides sent to the city.');
}
function runSimulation(){
  if(ride.state==='riding'||!needVerified())return;
  S.hits=S.hits.filter(h=>!String(h.ride).startsWith('sim'));
  const tot={rides:3,accepted:0,rej:{}};
  [7,11,19].forEach((seed,i)=>{
    const r=simulatePass(seed);
    for(const e of r.ev){S.hits.push({id:'H'+uid(),ride:'sim'+(i+1),x:e.pos[0],y:e.pos[1],peakG:e.peakG,speed:e.speed,t:Date.now()});tot.accepted++;}
    for(const j of r.rej)tot.rej[j.reason]=(tot.rej[j.reason]||0)+1;
  });
  ride.lastSim=tot;
  const made=promoteSpots();
  afterHits(made,'3 riders simulated. '+made+' new spot'+(made===1?'':'s')+' hit by 2+ rides sent to the city.');
}
function renderSpots(){
  const box=$('#spots');if(!box)return;
  const spots=clusterHits(S.hits).sort((a,b)=>b.rides-a.rides||b.peak-a.peak),flagged=spots.filter(x=>x.rides>=2).length,L=ride.lastSim;
  if(!spots.length&&!L){box.innerHTML='';return;}
  const rejRows=L?Object.entries(L.rej).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<dt>${esc(k)}</dt><dd class="mono">${v}</dd>`).join(''):'';
  box.innerHTML=`<div class="card stack"><div><h3>Repeat hits</h3><p class="note" style="margin-top:4px">A spot is flagged when 2 or more separate rides hit it within ${SPOT_RADIUS} m. One rider hitting it twice does not count.</p></div>
    <div class="statgrid" style="grid-template-columns:repeat(3,1fr)"><div class="stat"><b>${spots.length}</b><span>spots</span></div><div class="stat"><b>${flagged}</b><span>flagged</span></div><div class="stat"><b>${(S.flagged||[]).length}</b><span>sent to city</span></div></div>
    <div>${spots.slice(0,6).map(sp=>{const near=nearest(sp.x,sp.y),ok=sp.rides>=2;
      return`<div class="listrow"><span class="badge ${ok?'s-verified':''}"><b class="mono">${sp.rides}</b></span><div class="main"><div class="t">${esc(near.d<40?'Near '+near.b.name:isCityStreet(sp.x,sp.y)?'On a city street':'On a campus path')}</div>
      <div class="note">${sp.peak.toFixed(1)} g peak · ${Math.round(sp.speed*2.237)} mph</div></div><span class="pill ${ok?'s-verified':''}">${ok?'Flagged':'Needs 1 more ride'}</span></div>`;}).join('')}</div>
    ${L?`<div><h3 style="margin-bottom:8px">Last simulation</h3><dl class="kv"><dt>Rides</dt><dd class="mono">${L.rides}</dd><dt>Hits accepted</dt><dd class="mono">${L.accepted}</dd>${rejRows?`<dt style="grid-column:1/-1;margin-top:4px">Ignored by the detector</dt>${rejRows}`:''}</dl></div>`:''}
    <button class="btn ghost sm" data-act="clearhits" style="align-self:flex-start">Clear ride data</button></div>`;
}

/* ---------- Reports tab ---------- */
const R={cat:null,opt:null,bld:'su',text:'',done:null,photoData:null};
let rsub='new',fsub='posts',openFilter='all',staff=false,opsDept='all',busy=false;
function resetPhoto(){R.photoData=null;const i=$('#photo-input');if(i)i.value='';}
function curTriage(){
  if(!R.cat||!CATS[R.cat])return null;const b=BI[R.bld]||BI.su||B[0];
  return triage({cat:R.cat,opt:R.opt,text:R.text,bld:b.id,x:b.cx,y:b.cy});
}
function previewHTML(){
  const t=curTriage();if(!t)return'';
  return`<div class="card stack"><div class="row between"><h3>Preview</h3></div>
    <dl class="kv"><dt>Title</dt><dd>${esc(t.title)}</dd><dt>Severity</dt><dd><span class="pill v-${t.severity}">${sevLabel[t.severity]}</span></dd>
    <dt>Building</dt><dd>${esc(t.building)}</dd><dt>Goes to</dt><dd>${esc(t.route)}</dd></dl></div>`;
}
function typeTiles(){
  return`<div class="tiles">${Object.entries(CATS).map(([k,c])=>`<button class="tile rv" data-act="cat" data-k="${k}"><span class="ti">${catIcon(k,20)}</span><b>${esc(c.label)}</b></button>`).join('')}</div>`;
}
function renderReportNew(){
  const box=$('#rp-new');
  if(R.done){
    const r=R.done;
    box.innerHTML=`<div class="card success rv"><span class="ring">${icon('check',28,2.4)}</span>
      <div class="stack" style="gap:6px"><h2>Report sent</h2><p class="ink2">#<span class="mono">${esc(r.id)}</span> is on its way to <b>${esc(r.route)}</b>.</p>
      <p class="note">${r.cat==='safety'?'Others see it on the map after two people confirm it, and it clears after 2 hours. In an emergency call 911.':'It needs one more confirmation from another student to be verified. Verified reports count toward the leaderboard.'}</p></div>
      <div class="row" style="width:100%"><button class="btn primary grow" data-act="seeit" data-id="${esc(r.id)}">See it on the map</button><button class="btn secondary" data-act="again">Report another</button></div></div>`;
    return;
  }
  const photo=R.photoData?`<div class="card stack rv"><img class="photo" src="${esc(R.photoData)}" alt="Your photo">
      <div class="row between"><span class="note">Photo attached</span><button class="btn ghost sm" data-act="clearphoto">Remove</button></div></div>`:'';
  box.innerHTML=`<div class="hero stack rv" style="gap:20px"><div class="stack" style="gap:10px"><h2>What did you spot?</h2>
      <p class="ink2" style="max-width:32ch">Pick a type. Add a photo if you have one.</p></div>
      ${photo||`<button class="btn secondary block" data-act="takephoto">${icon('camera',16,1.5)}Add a photo</button>`}</div>
    <div class="row between rv"><h3>Type</h3><span class="note">${R.photoData?'Required':'Optional photo'}</span></div>
    ${typeTiles()}`;
}
function openReportSheet(){
  const c=CATS[R.cat];if(!c)return;
  openSheet(c.label,`
    ${R.photoData?`<img class="photo" src="${esc(R.photoData)}" alt="Your photo">`:''}
    <div><label for="f-opt">What kind</label><select id="f-opt">${c.opts.map(o=>`<option value="${o.k}" ${R.opt===o.k?'selected':''}>${esc(o.label)}</option>`).join('')}</select></div>
    <div><label for="f-bld">Where</label><select id="f-bld">${BSORT.map(b=>`<option value="${b.id}" ${R.bld===b.id?'selected':''}>${esc(b.name)} (${esc(b.code)})</option>`).join('')}</select></div>
    ${R.cat==='safety'?`<div class="warnbox">Describe the place, not people. No names, no descriptions of anyone. Others see it after two confirmations and it clears after 2 hours. In an emergency call 911 first.</div>
      <div><label for="f-text">Where exactly (place only)</label><input type="text" id="f-text" maxlength="80" value="${esc(R.text)}" placeholder="East entrance, near the bike racks"></div>`
    :`<div><label for="f-text">A few words (optional)</label><textarea id="f-text" maxlength="140" placeholder="The light has been out for a week">${esc(R.text)}</textarea></div>`}
    <div id="prev">${previewHTML()}</div>
    <button class="btn primary block" data-act="submitmanual">Send report</button>`,()=>{R.cat=null;});
}
function submitReport(){
  if(busy||!needVerified())return;
  if(!R.cat||!CATS[R.cat]){toast('Pick a type first.');return;}
  busy=true;
  const base=pinPos(R.bld,S.reports.length+3);
  const res=triage({cat:R.cat,opt:R.opt,text:R.text,bld:R.bld,x:base[0],y:base[1]});
  const newReport={id:'R'+uid(),cat:R.cat,opt:R.opt,b:R.bld,title:res.title,desc:res.description,
    sev:normSev(res.severity),bld:res.building,route:res.route,x:base[0],y:base[1],
    by:S.user.id,t:Date.now(),src:R.photoData?'photo':(R.cat==='pothole'?'ride':'manual'),
    photo:R.photoData||null,votes:[{u:S.user.id,v:1}],status:'reported',locked:false};
  S.reports.unshift(newReport);save();
  closeSheet();R.text='';resetPhoto();R.done=newReport;
  setRsub('new');renderMap();renderOpen();renderBoard();
  busy=false;
}
function handlePhotoInput(file){
  if(!file)return;
  if(!needVerified()){$('#photo-input').value='';return;}
  const reader=new FileReader();
  reader.onload=()=>{R.photoData=reader.result;renderReportNew();};
  reader.onerror=()=>toast('Could not read that photo.');
  reader.readAsDataURL(file);
}

/* ---------- Open reports (queue) ---------- */
function renderOpen(){
  const now=Date.now(),list=S.reports.filter(r=>r.status!=='dismissed'&&(r.cat!=='safety'||now-r.t<7200000));
  const cnt=s=>s==='all'?list.length:list.filter(r=>r.status===s).length;
  $('#c-open').textContent=cnt('all');
  const depts=[...new Set(list.map(r=>r.route))].sort();
  const ord={verified:0,reported:1,assigned:2,fixed:3},sv={high:0,med:1,low:2};
  const q=list.filter(r=>(openFilter==='all'||r.status===openFilter)&&(!staff||opsDept==='all'||r.route===opsDept))
    .sort((a,b)=>ord[a.status]-ord[b.status]||sv[a.sev]-sv[b.sev]||b.t-a.t);
  const chips=['all','reported','verified','assigned','fixed'].map(s=>`<button class="chip flat" data-act="ofilter" data-s="${s}" aria-pressed="${openFilter===s}">${s==='all'?'All':statusLabel[s]}<span class="mono" style="opacity:.6">${cnt(s)}</span></button>`).join('');
  const rows=q.map(r=>{
    const act=!staff?'':r.status==='reported'?`<button class="btn secondary sm" data-act="ops" data-id="${r.id}" data-to="verified">Verify</button>`:r.status==='verified'?`<button class="btn secondary sm" data-act="ops" data-id="${r.id}" data-to="assigned">Assign</button>`:r.status==='assigned'?`<button class="btn secondary sm" data-act="ops" data-id="${r.id}" data-to="fixed">Mark fixed</button>`:'';
    return`<div class="listrow"><button class="badge s-${r.status}" data-act="locate" data-id="${r.id}" aria-label="Show on map">${catIcon(r.cat,20)}</button>
      <button class="main stack" data-act="locate" data-id="${r.id}" style="text-align:left;gap:6px"><div class="t">${esc(r.title)}</div>
      <div class="row" style="gap:8px"><span class="pill s-${r.status}"><i class="dot"></i>${statusLabel[r.status]}</span>${r.sev==='high'?'<span class="pill v-high">High</span>':''}</div>
      <div class="note">${esc(r.route)} · ${ago(r.t)} · ${tally(r).c} confirm${tally(r).c===1?'':'s'}${r.cat==='safety'&&tally(r).c<2&&r.status==='reported'?' · not public yet':''}</div></button>
      ${act?`<div>${act}</div>`:''}</div>`;
  }).join('');
  $('#rp-open').innerHTML=`<div class="scroller" style="margin:0 -22px">${chips}</div>
    <div class="row between"><button class="chip flat" data-act="staff" aria-pressed="${staff}">Staff view</button>
    ${staff?`<div style="min-width:150px"><select id="dept" aria-label="Team"><option value="all">All teams</option>${depts.map(d=>`<option ${d===opsDept?'selected':''}>${esc(d)}</option>`).join('')}</select></div>`:'<span class="note">Tap a report to see it on the map</span>'}</div>
    <div class="card tight">${rows||'<p class="note" style="padding:14px 0">Nothing here yet.</p>'}</div>`;
}
const renderOps=renderOpen;
function opsSet(id,to){
  const r=S.reports.find(x=>x.id===id);if(!r)return;
  r.status=to;if(to==='verified')r.locked=true;save();
  toast(to==='verified'?'Verified by staff.':to==='assigned'?'Assigned to '+r.route+'.':'Marked fixed.');
  renderOpen();renderMap();renderBoard();
}

/* ---------- Leaders ---------- */
function renderBoard(){
  const lb=leaderboard(S.reports),mineIdx=lb.findIndex(x=>x.by==='me');
  const mine=S.reports.filter(r=>r.by==='me').sort((a,b)=>b.t-a.t);
  const rows=lb.map(e=>`<tr${e.by==='me'?' class="me"':''}><td>${esc(nameOf(e.by))}${e.by==='me'?' (you)':''}</td><td class="mono">${e.n}</td></tr>`).join('');
  $('#rp-board').innerHTML=`<div class="card tight"><table class="board"><thead><tr><th>Name</th><th>Reports</th></tr></thead>
      <tbody>${rows||'<tr><td colspan="2" class="note">No valid reports yet.</td></tr>'}</tbody></table></div>
    <div class="card stack" style="gap:8px"><b>${mineIdx<0?'You are not on the board yet':'You are #'+(mineIdx+1)+' with '+lb[mineIdx].n+' valid report'+(lb[mineIdx].n===1?'':'s')}</b>
      <p class="note">A report counts once two people verify it or campus staff do. You cannot verify your own, and ties go to whoever got there first.</p></div>
    <h3>Your reports</h3>
    <div class="card tight">${mine.length?mine.map(r=>`<div class="listrow"><span class="badge s-${r.status}">${catIcon(r.cat,20)}</span><div class="main"><div class="t">${esc(r.title)}</div><div class="note">${ago(r.t)}${r.doubt?' · rider was not sure':''}</div></div><span class="pill s-${r.status}"><i class="dot"></i>${statusLabel[r.status]}</span></div>`).join(''):'<p class="note" style="padding:14px 0">Send a report or finish a ride and it shows up here.</p>'}</div>`;
}
function setRsub(s){
  rsub=s;
  $$('#rp-seg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.s===s)));
  $('#rp-new').hidden=s!=='new';$('#rp-open').hidden=s!=='open';$('#rp-board').hidden=s!=='board';
  if(s==='new')renderReportNew();if(s==='open')renderOpen();if(s==='board')renderBoard();
  reveal($('#rp-'+s));
}

/* ---------- Live (right now) ---------- */
const WAIT=[{id:'su-food',name:'Student Union food court'},{id:'starbucks',name:'Starbucks'},{id:'dc',name:'Dining Commons'}];
const PARK=[{id:'spg',name:'South Parking Garage'},{id:'wpg',name:'West Parking Garage'},{id:'npg',name:'North Parking Garage'}];
const NOISE=[{id:'king-lib',name:'MLK Library'},{id:'su-noise',name:'Student Union'},{id:'eng-noise',name:'Engineering'}];
const PL=['Open','Filling up','Full'],NL=['Quiet','Moderate','Loud'];
const DAYN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const f12=s=>{const[h,m]=s.split(':').map(Number);return((h+11)%12+1)+':'+String(m).padStart(2,'0')+(h<12?' AM':' PM');};
let sracDays=[1,2,3,4,5];
const chanList=id=>S.ch.filter(r=>r.chan===id);
function voteBtns(r){
  const mine=r.votes.find(v=>v.u==='me'),own=r.by==='me',net=r.votes.reduce((a,x)=>a+x.v,0);
  return`<span class="votepill"><button class="${mine&&mine.v>0?'on':''}" data-act="cvote" data-id="${r.id}" data-v="1" ${own?'disabled':''} aria-label="Vouch">${icon('up',16,2.2)}</button><span>${net>=0?'+':''}${net}</span><button class="dn ${mine&&mine.v<0?'on':''}" data-act="cvote" data-id="${r.id}" data-v="-1" ${own?'disabled':''} aria-label="Dispute">${icon('down',16,2.2)}</button></span>`;
}
function renderLive(){
  const now=Date.now(),v=$('#fd-live');
  const wait=WAIT.map(w=>{
    const list=chanList(w.id).sort((a,b)=>b.t-a.t),a=aggregate(list,now);
    const verdict=!a?'No recent reports':a.v<10?'Walk right in':a.v<25?'Short wait':a.v<35?'Long line':'Come back later';
    return`<div class="card stack"><div class="row between" style="flex-wrap:nowrap"><div><h3>${esc(w.name)}</h3><p class="note">${a?a.n+' recent report'+(a.n===1?'':'s'):'Be the first to report'}</p></div>
      <div style="text-align:right"><div class="big">${a?a.v:'–'}<span class="note" style="font-size:13px;font-family:var(--font)"> min</span></div><span class="note">${verdict}</span></div></div>
      ${list.slice(0,2).map(r=>`<div class="row between" style="flex-wrap:nowrap"><span class="note mono">${r.v} min · ${ago(r.t)} · ${esc(nameOf(r.by))}</span>${voteBtns(r)}</div>`).join('')}
      <div><label for="w-${w.id}">How long is the line? <output class="mono" id="o-${w.id}">15</output> min</label><div class="row" style="flex-wrap:nowrap"><input type="range" id="w-${w.id}" min="0" max="60" step="5" value="15" data-out="o-${w.id}" class="grow"><button class="btn secondary sm" data-act="cpost" data-chan="${w.id}" data-src="w-${w.id}">Post</button></div></div></div>`;
  }).join('');
  const level=(arr,labels,colors)=>arr.map(p=>{
    const list=chanList(p.id).sort((a,b)=>b.t-a.t),a=aggregate(list,now,30);
    return`<div class="card stack"><div class="row between" style="flex-wrap:nowrap"><div><h3>${esc(p.name)}</h3><p class="note">${a?a.n+' recent report'+(a.n===1?'':'s')+', latest '+ago(list[0].t):'No recent reports'}</p></div>
      <span class="pill" style="color:var(${a?colors[a.v]:'--muted'})"><i class="dot"></i>${a?labels[a.v]:'Unknown'}</span></div>
      <div class="levels">${labels.map((l,i)=>`<button class="btn secondary sm" data-act="cpost" data-chan="${p.id}" data-val="${i}">${l}</button>`).join('')}</div>
      ${list.slice(0,2).map(r=>`<div class="row between" style="flex-wrap:nowrap"><span class="note mono">${labels[r.v]} · ${ago(r.t)}</span>${voteBtns(r)}</div>`).join('')}</div>`;
  }).join('');
  const wk=wkStart(),dow=new Date().getDay(),nm=new Date().getHours()*60+new Date().getMinutes();
  const tm=s=>{const[h,m]=s.split(':').map(Number);return h*60+m;};
  const srac=[...S.srac].sort((a,b)=>(b.days.includes(dow)-a.days.includes(dow))||tm(a.start)-tm(b.start)).map(e=>{
    const today=e.days.includes(dow),open=today&&nm>=tm(e.start)&&nm<tm(e.end),stale=e.wk!==wk,yes=e.votes.filter(x=>x.v>0).length,mine=e.votes.find(x=>x.u==='me');
    return`<div class="listrow" style="align-items:flex-start"><div class="main stack" style="gap:4px"><div class="row" style="gap:8px"><b>${esc(e.what)}</b>${open?'<span class="pill s-fixed"><i class="dot"></i>Open now</span>':today?'<span class="pill s-verified">Today</span>':''}${stale?'<span class="pill s-reported">Confirm?</span>':''}</div>
      <p class="mono note">${e.days.map(d=>DAYN[d]).join(' ')} · ${f12(e.start)} to ${f12(e.end)}</p><p class="note">${yes} confirm · by ${esc(nameOf(e.by))}</p></div>
      <button class="btn ${mine?'primary':'secondary'} sm" data-act="sracok" data-id="${e.id}">Still right</button></div>`;
  }).join('');
  v.innerHTML=`<span class="kicker">Lines</span>${wait}<span class="kicker">Parking</span>${level(PARK,PL,['--ok','--warn','--bad'])}<span class="kicker">Noise</span>${level(NOISE,NL,['--ok','--warn','--bad'])}
    <div class="row between"><span class="kicker">SRAC this week</span><button class="btn secondary sm" data-act="newsrac">${icon('plus',14,1.5)}Post a change</button></div>
    <div class="card tight">${srac}</div><p class="note">The schedule changes weekly, so confirm what you see or post the new one. Entries are examples until students post.</p>`;
}
function openSracSheet(){
  openSheet('Post a schedule change',`
    <div><label for="sr-what">Activity</label><select id="sr-what">${['Lap swim','Open swim','Climbing wall','Group fitness','Court hours','Closed or changed'].map(a=>`<option>${a}</option>`).join('')}</select></div>
    <div><label>Days</label><div class="days" role="group" aria-label="Days">${DAYN.map((n,i)=>`<button class="chip flat" data-act="srday" data-d="${i}" aria-pressed="${sracDays.includes(i)}">${n}</button>`).join('')}</div></div>
    <div class="row" style="flex-wrap:nowrap"><div class="grow"><label for="sr-s">Start</label><input type="time" id="sr-s" value="12:00"></div><div class="grow"><label for="sr-e">End</label><input type="time" id="sr-e" value="14:00"></div></div>
    <button class="btn primary block" data-act="srpost">Post update</button>`);
}
function cvote(id,v){
  if(!needVerified())return;
  const r=S.ch.find(x=>x.id===id);if(!r||r.by==='me')return;
  const i=r.votes.findIndex(x=>x.u==='me');
  if(i>=0&&r.votes[i].v===v)r.votes.splice(i,1);else if(i>=0)r.votes[i].v=v;else r.votes.push({u:'me',v});
  save();renderLive();
}

/* ---------- Posts (local) ---------- */
const meKey=()=>(S.user&&(S.user.email||S.user.id))||'guest';
function renderPosts(){
  const box=$('#fd-posts');
  const posts=(S.posts||[]).slice().sort((a,b)=>b.t-a.t);
  const me=meKey();
  box.innerHTML=posts.length?posts.map(p=>{
    const votes=p.votes||[],mine=votes.find(v=>v.u===me),net=votes.reduce((s,v)=>s+v.v,0);
    const nm=p.authorName||nameOf(p.authorId);
    return`<article class="card post"><div class="row" style="gap:12px;flex-wrap:nowrap">${avatar(nm,p.authorId)}<div class="grow"><b>${esc(nm)}</b><div class="note">${ago(p.t)}</div></div></div>
      <div class="stack" style="gap:6px"><h3>${esc(p.title)}</h3><p>${esc(p.content)}</p></div>
      <div class="row"><span class="votepill"><button class="${mine&&mine.v>0?'on':''}" data-act="votepost" data-id="${esc(p.id)}" data-v="1" aria-label="Vouch">${icon('up',16,2.2)}</button><span>${net>=0?'+':''}${net}</span><button class="dn ${mine&&mine.v<0?'on':''}" data-act="votepost" data-id="${esc(p.id)}" data-v="-1" aria-label="Dispute">${icon('down',16,2.2)}</button></span></div></article>`;
  }).join(''):'<div class="card"><h3>No posts yet</h3><p class="note" style="margin-top:4px">Start the conversation with the New post button.</p></div>';
}
function openPostSheet(){
  if(!needVerified())return;
  openSheet('New post',`<div><label for="post-title">Title</label><input type="text" id="post-title" maxlength="100" placeholder="Best study spots after 10pm?"></div>
    <div><label for="post-content">What's on your mind?</label><textarea id="post-content" maxlength="500" placeholder="Share a tip, ask a question, or flag an event."></textarea></div>
    <button class="btn primary block" data-act="submitpost">Post to feed</button>`);
}
function submitPost(){
  if(busy||!needVerified())return;
  const title=($('#post-title')||{}).value?.trim(),content=($('#post-content')||{}).value?.trim();
  if(!title||!content){toast('Add a title and some text first.');return;}
  S.posts.unshift({id:'P'+uid(),title,content,authorId:meKey(),authorName:shortName(S.user.name),t:Date.now(),votes:[]});
  save();closeSheet();toast('Posted.');renderPosts();
}
function votePost(postId,v){
  if(!needVerified())return;
  const post=(S.posts||[]).find(p=>p.id===postId);if(!post)return;
  const votes=post.votes||[],me=meKey(),i=votes.findIndex(x=>x.u===me);
  if(i>=0){if(votes[i].v===v)votes.splice(i,1);else votes[i]={u:me,v};}else votes.push({u:me,v});
  post.votes=votes;save();renderPosts();
}
function setFsub(s){
  fsub=s;
  $$('#fd-seg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.s===s)));
  $('#fd-posts').hidden=s!=='posts';$('#fd-live').hidden=s!=='live';
  $('#fab-post').hidden=!(currentTab==='feed'&&s==='posts');
  if(s==='posts'){renderPosts();reveal($('#fd-posts'));}else{renderLive();reveal($('#fd-live'));}
}

/* ---------- Tabs ---------- */
const TABS=['reports','ride','feed','map'];
const NAV={reports:['flag','Reports'],ride:['bike','Ride'],feed:['chat','Feed'],map:['map','Map']};
let currentTab='map';
function buildNav(){
  $$('#tabs button').forEach(b=>{const[i,l]=NAV[b.dataset.t];b.innerHTML=icon(i,18,1.4)+'<span>'+l+'</span>';});
  const bm=$('#brandmark');if(bm)bm.innerHTML='';
  $('#b-compass').innerHTML=icon('compass',16,1.4);
}
function switchTab(t){
  closeSheet();
  currentTab=t;
  for(const id of TABS)$('#v-'+id).hidden=id!==t;
  $$('#tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.t===t)));
  $('#navind').style.transform='translateX('+TABS.indexOf(t)*100+'%)';
  $('#fab-post').hidden=!(t==='feed'&&fsub==='posts');
  const v=$('#v-'+t);v.scrollTop=0;
  if(t==='map'){renderMap();}
  if(t==='reports'){setRsub(rsub);}
  if(t==='ride'){syncRidePins();renderSpots();maps.ride.draw();reveal(v);}
  if(t==='feed'){setFsub(fsub);}
}

/* ---------- Events ---------- */
document.addEventListener('click',async e=>{
  if(e.target.id==='sheet'){closeSheet();return;}
  const a=e.target.closest('[data-act]');if(!a)return;const d=a.dataset;
  switch(d.act){
    case'tab':switchTab(d.t);break;
    case'rsub':setRsub(d.s);break;
    case'fsub':setFsub(d.s);break;
    case'mapf':mapFilter=d.f;maps.map.sel=null;selB=null;renderMap();break;
    case'peekclose':maps.map.sel=null;selB=null;renderMap();break;
    case'zoom':maps[d.m].zoomBy(+d.d);break;
    case'flat':{const f=maps[d.m].toggleFlat();a.textContent=f?'3D':'2D';break;}
    case'resetview':maps[d.m].reset();$('#b-flat').textContent='2D';break;
    case'vote':vote(d.id,+d.v);break;
    case'reporthere':R.bld=d.b;R.done=null;resetPhoto();R.cat=null;rsub='new';switchTab('reports');break;
    case'cat':R.cat=d.k;R.opt=CATS[d.k].opts[0].k;R.text='';openReportSheet();break;
    case'submitmanual':submitReport();break;
    case'takephoto':if(needVerified())$('#photo-input').click();break;
    case'clearphoto':resetPhoto();renderReportNew();break;
    case'again':R.done=null;R.cat=null;resetPhoto();renderReportNew();break;
    case'seeit':case'locate':{
      const r=S.reports.find(x=>x.id===d.id);maps.map.sel=d.id;selB=null;mapFilter='all';if(d.act==='seeit'){R.done=null;R.cat=null;resetPhoto();}
      switchTab('map');if(r)maps.map.flyTo(r.x,r.y,1.6);break;}
    case'ofilter':openFilter=d.s;renderOpen();break;
    case'staff':staff=!staff;renderOpen();break;
    case'ops':opsSet(d.id,d.to);break;
    case'mode':ride.mode=d.m;ride.det.setMode(d.m);$$('#modeseg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.m===d.m)));break;
    case'start':startReal();break;
    case'demo':startDemo();break;
    case'stop':stopRide();break;
    case'calibrate':calibrate();break;
    case'sim':runSimulation();break;
    case'clearhits':S.hits=[];S.flagged=[];ride.lastSim=null;save();syncRidePins();maps.ride.draw();renderSpots();break;
    case'dec':{const ev=ride.evs.find(x=>x.id===d.id);if(ev){ev.dec=d.d;syncRidePins();maps.ride.draw();renderReview();}break;}
    case'sendride':sendRide();break;
    case'discard':ride.state='idle';ride.evs=[];maps.ride.pins=[];$('#ridelive').hidden=true;renderReview();rmsg('');maps.ride.draw();break;
    case'cvote':cvote(d.id,+d.v);break;
    case'cpost':{
      if(!needVerified())break;
      const val=d.src?+document.getElementById(d.src).value:+d.val;
      S.ch.push({id:'C'+uid(),chan:d.chan,v:val,t:Date.now(),by:'me',votes:[]});save();renderLive();toast('Thanks. Posted for everyone nearby.');break;}
    case'newsrac':if(needVerified())openSracSheet();break;
    case'srday':{const n=+d.d;sracDays=sracDays.includes(n)?sracDays.filter(x=>x!==n):[...sracDays,n].sort();a.setAttribute('aria-pressed',String(sracDays.includes(n)));break;}
    case'srpost':{
      if(!needVerified())break;
      if(!sracDays.length){toast('Pick at least one day.');break;}
      S.srac.push({id:'S'+uid(),what:$('#sr-what').value,days:[...sracDays],start:$('#sr-s').value||'12:00',end:$('#sr-e').value||'14:00',by:'me',wk:wkStart(),votes:[]});save();closeSheet();renderLive();toast('Posted for this week.');break;}
    case'sracok':{
      if(!needVerified())break;
      const s=S.srac.find(x=>x.id===d.id);if(!s)break;
      const i=s.votes.findIndex(x=>x.u==='me');if(i>=0)s.votes.splice(i,1);else{s.votes.push({u:'me',v:1});s.wk=wkStart();}
      save();renderLive();break;}
    case'newpost':openPostSheet();break;
    case'submitpost':submitPost();break;
    case'votepost':votePost(d.id,+d.v);break;
    case'closesheet':closeSheet();break;
    case'account':{
      if(S.user&&S.user.verified){
        openSheet('Account',`<div class="row" style="gap:14px;flex-wrap:nowrap">${avatar(S.user.name,S.user.email)}<div><b>${esc(S.user.name)}</b><div class="note">${esc(S.user.email)}</div></div></div>
          <div class="stack" style="gap:10px"><button class="btn secondary block" data-act="reset">Reset demo data</button><button class="btn ghost block" data-act="signout">Sign out</button></div>`);
      }else{gate.step=1;gate.err='';renderGate(true);}
      break;}
    case'reset':{const u=S.user,c=S.cal;S=seed();S.user=u;S.cal=c;save();R.cat=null;R.done=null;resetPhoto();closeSheet();maps.map.sel=null;selB=null;renderMap();renderOpen();renderBoard();renderReportNew();renderPosts();toast('Demo data reset.');break;}
    case'signout':S.user=null;save();closeSheet();gate.step=1;gate.err='';renderMe();renderGate(true);break;
    case'gsend':{
      gate.name=($('#g-name').value||'').trim();gate.email=($('#g-email').value||'').trim().toLowerCase();gate.agree=$('#g-agree').checked;
      if(gate.name.length<2){gate.err='Enter your full name.';renderGate(true);break;}
      if(!eduOk(gate.email)){gate.err='Use your school email, like you@'+CONFIG.domains[0]+'.';renderGate(true);break;}
      if(!gate.agree){gate.err='Please agree to report honestly.';renderGate(true);break;}
      gate.code=String(Math.floor(100000+Math.random()*900000));gate.err='';gate.step=2;sendCode(gate.email,gate.code).then(()=>renderGate(true));break;}
    case'gverify':{
      const v=($('#g-code').value||'').trim();
      if(v!==gate.code){gate.err='That code does not match. Check it and try again.';renderGate(true);break;}
      S.user={id:'me',name:gate.name,email:gate.email,verified:true,at:Date.now()};save();gate.step=1;gate.err='';
      renderMe();renderGate(false);renderMap();renderOpen();renderBoard();toast('Signed in as '+shortName(S.user.name));break;}
    case'gback':gate.step=1;gate.err='';renderGate(true);break;
    case'gguest':S.user={id:'guest',guest:true};save();renderMe();renderGate(false);break;
  }
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='f-opt'){R.opt=t.value;$('#prev').innerHTML=previewHTML();}
  else if(t.id==='f-bld'){R.bld=t.value;$('#prev').innerHTML=previewHTML();}
  else if(t.id==='dept'){opsDept=t.value;renderOpen();}
  else if(t.dataset&&t.dataset.evloc){
    const ev=ride.evs.find(x=>x.id===t.dataset.evloc);
    if(ev&&t.value){const b=BI[t.value];ev.pos=[b.cx,b.cy];syncRidePins();maps.ride.draw();renderReview();}
  }
  else if(t.id==='photo-input')handlePhotoInput(t.files[0]);
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='f-text'){R.text=t.value;const p=$('#prev');if(p)p.innerHTML=previewHTML();}
  else if(t.dataset&&t.dataset.out){document.getElementById(t.dataset.out).textContent=t.value;}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet();});

function redrawAll(){maps.map.pal=null;maps.ride.pal=null;maps.map.draw();maps.ride.draw();drawGraph();}
addEventListener('resize',redrawAll);
try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',redrawAll);}catch(e){}
new MutationObserver(redrawAll).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
if(window.ResizeObserver){const ro=new ResizeObserver(()=>{maps.map.draw();maps.ride.draw();});ro.observe($('#cv-map'));ro.observe($('#cv-ride'));}
renderMe();renderGate(false);buildNav();renderOpen();renderBoard();renderSpots();switchTab('map');
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(redrawAll);
