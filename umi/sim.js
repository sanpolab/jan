/* ウミガメの魚集め：2D版と3D版で共通のルール（見た目はここに入れない）
   座標は「海の広さ W×H」の中の x,y。カメは自動で近い魚を追いかけて食べる。 */
(function(){
const rand=(a,b)=>a+Math.random()*(b-a), clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), pick=a=>a[Math.floor(Math.random()*a.length)];
const CFG={ startNeed:300, needStep:200, cap:800, schoolMin:14, schoolMax:36, turtleSpd:230, eatR:46, boostSec:15, buddySec:40, vortexSec:6, sharkSec:10, clearSec:3.5 };
function makeSim(W,H,opt){ opt=opt||{}; const cap=opt.cap||CFG.cap;
  const S={ W,H, t:0, wins:0, round:1, need:CFG.startNeed, total:CFG.startNeed, mode:'play', clearT:0, fish:[], schools:[], turtles:[], whale:null, shark:null, boostT:0, vortexT:0, inkT:0, ev:[], log:[], eaten:0 };
  try{ S.wins=parseInt(localStorage.getItem('umi_wins')||'0',10)||0; }catch(e){}
  const save=()=>{ try{ localStorage.setItem('umi_wins',String(S.wins)); }catch(e){} };
  const logAdd=(text,color)=>{ S.log.push({text,color:color||'#fff'}); if(S.log.length>3) S.log.shift(); };
  const ev=(o)=>{ S.ev.push(o); if(S.ev.length>200) S.ev.shift(); };
  const main={ x:W/2, y:H/2, a:-Math.PI/2, spd:0, main:true, name:null, life:1e9, flap:0, eatT:0 }; S.turtles.push(main);
  function alive(){ return S.fish.length; }
  function addSchool(n,near){ const m=120; let x,y,k=0; do{ x=rand(m,W-m); y=rand(m,H-m); k++; }while(!near && k<12 && Math.hypot(x-main.x,y-main.y)<Math.min(W,H)*.28);
    if(near){ x=near.x; y=near.y; }
    const sc={ x,y, a:rand(0,6.28), spd:rand(26,52), n:0, turn:rand(-.4,.4), r:26+Math.sqrt(n)*9, kind:Math.floor(rand(0,3)) }; S.schools.push(sc);
    for(let i=0;i<n;i++){ S.fish.push({ sc, oa:rand(0,6.28), or:Math.sqrt(Math.random())*sc.r, w:rand(.5,1.4)*(Math.random()<.5?-1:1), ph:rand(0,6.28), x:x, y:y, a:0, s:rand(.8,1.25) }); sc.n++; } }
  function refill(){ let guard=0; while(alive()<Math.min(cap,S.need) && guard++<60){ const n=Math.min(Math.floor(rand(CFG.schoolMin,CFG.schoolMax)), Math.min(cap,S.need)-alive()); if(n<=0) break; addSchool(n); } }
  function eat(f,by){ const i=S.fish.indexOf(f); if(i<0) return; S.fish.splice(i,1); f.sc.n--; S.need=Math.max(0,S.need-1); S.eaten++; ev({type:'eat',x:f.x,y:f.y,by}); }
  function nearestFish(t){ let best=null, bd=1e18; for(const f of S.fish){ const d=(f.x-t.x)*(f.x-t.x)+(f.y-t.y)*(f.y-t.y); if(d<bd){ bd=d; best=f; } } return best; }
  function startRound(){ S.mode='play'; S.need=S.total=CFG.startNeed+CFG.needStep*(S.round-1); S.fish.length=0; S.schools.length=0; refill(); logAdd('ラウンド '+S.round+'：魚を '+S.need+' 匹あつめよう','#9be9ff'); }
  function update(dt){ S.t+=dt; if(S.boostT>0) S.boostT-=dt; if(S.vortexT>0) S.vortexT-=dt; if(S.inkT>0) S.inkT-=dt;
    if(S.mode==='clear'){ S.clearT-=dt; if(S.clearT<=0){ S.round++; startRound(); } }
    // 群れ：ふらふら泳ぐ。カメやサメが近いと逃げる
    for(const sc of S.schools){ sc.turn+=rand(-1,1)*dt*1.2; sc.turn=clamp(sc.turn,-.7,.7); sc.a+=sc.turn*dt; let sp=sc.spd, fx=0, fy=0;
      for(const t of S.turtles){ const dx=sc.x-t.x, dy=sc.y-t.y, d=Math.hypot(dx,dy); if(d<260 && d>1){ const k=(260-d)/260; fx+=dx/d*k*70; fy+=dy/d*k*70; } }
      if(S.shark){ const dx=sc.x-S.shark.x, dy=sc.y-S.shark.y, d=Math.hypot(dx,dy); if(d<520 && d>1){ const k=(520-d)/520; fx+=dx/d*k*330; fy+=dy/d*k*330; } }
      if(S.vortexT>0){ const dx=main.x-sc.x, dy=main.y-sc.y, d=Math.hypot(dx,dy)||1; fx=dx/d*260; fy=dy/d*260; sp=0; }
      sc.x+=(Math.cos(sc.a)*sp+fx)*dt; sc.y+=(Math.sin(sc.a)*sp+fy)*dt; const m=90;
      if(sc.x<m){ sc.x=m; sc.a=Math.PI-sc.a; } if(sc.x>W-m){ sc.x=W-m; sc.a=Math.PI-sc.a; } if(sc.y<m){ sc.y=m; sc.a=-sc.a; } if(sc.y>H-m){ sc.y=H-m; sc.a=-sc.a; } }
    S.schools=S.schools.filter(sc=>sc.n>0);
    for(const f of S.fish){ const sc=f.sc, rr=f.or*(S.vortexT>0?.45:1), a=f.oa+S.t*f.w*.6, tx=sc.x+Math.cos(a)*rr, ty=sc.y+Math.sin(a)*rr*.8, px=f.x, py=f.y; f.x+=(tx-f.x)*Math.min(1,dt*4); f.y+=(ty-f.y)*Math.min(1,dt*4); const vx=f.x-px, vy=f.y-py; if(vx*vx+vy*vy>1e-4) f.a=Math.atan2(vy,vx); }
    // カメ：いちばん近い魚へ向かって泳ぎ、口が届いたら食べる
    for(const t of S.turtles){ t.life-=dt; if(S.mode!=='play'){ t.spd*=.95; t.flap+=dt*3; continue; }
      const f=nearestFish(t), base=(t.main?CFG.turtleSpd:CFG.turtleSpd*.8)*(S.boostT>0?2:1)*(S.inkT>0?.45:1);
      if(f){ const want=Math.atan2(f.y-t.y,f.x-t.x); let da=want-t.a; while(da>Math.PI) da-=6.2832; while(da<-Math.PI) da+=6.2832; t.a+=clamp(da,-dt*4.2,dt*4.2); t.spd+=(base-t.spd)*Math.min(1,dt*3); } else t.spd*=.96;
      t.x=clamp(t.x+Math.cos(t.a)*t.spd*dt,40,W-40); t.y=clamp(t.y+Math.sin(t.a)*t.spd*dt,40,H-40); t.flap+=dt*(4+t.spd/60); t.eatT=Math.max(0,t.eatT-dt);
      const R=(t.main?CFG.eatR:CFG.eatR*.7)*(S.vortexT>0?1.5:1), mx=t.x+Math.cos(t.a)*30, my=t.y+Math.sin(t.a)*30; let n=0;
      for(let i=S.fish.length-1;i>=0 && n<(S.vortexT>0?6:2);i--){ const q=S.fish[i]; if((q.x-mx)*(q.x-mx)+(q.y-my)*(q.y-my)<R*R){ eat(q,t); n++; t.eatT=.25; } } }
    S.turtles=S.turtles.filter(t=>t.main||t.life>0);
    // クジラ：横切りながら通り道の魚をまとめて食べる
    if(S.whale){ const w=S.whale; w.x+=w.vx*dt; let n=0; for(let i=S.fish.length-1;i>=0;i--){ const q=S.fish[i]; if(Math.abs(q.y-w.y)<w.r && Math.abs(q.x-w.x)<w.r*1.1){ eat(q,w); n++; } } w.got+=n; if((w.vx>0 && w.x>W+500)||(w.vx<0 && w.x<-500)){ logAdd(w.name+' のクジラが '+w.got+' 匹のみこんだ','#9be9ff'); S.whale=null; } }
    // サメ：魚を追い回して散らす（食べない）
    if(S.shark){ const s=S.shark; s.t-=dt; let tgt=null, bd=1e18; for(const sc of S.schools){ const d=(sc.x-s.x)**2+(sc.y-s.y)**2; if(d<bd){ bd=d; tgt=sc; } } if(tgt){ const want=Math.atan2(tgt.y-s.y,tgt.x-s.x); let da=want-s.a; while(da>Math.PI) da-=6.2832; while(da<-Math.PI) da+=6.2832; s.a+=clamp(da,-dt*2.2,dt*2.2); } s.x+=Math.cos(s.a)*300*dt; s.y+=Math.sin(s.a)*300*dt; if(s.t<=0) S.shark=null; }
    if(S.mode==='play'){ refill(); if(S.need<=0){ S.mode='clear'; S.clearT=CFG.clearSec; S.wins++; save(); ev({type:'clear'}); logAdd('クリア！ WIN +1','#ffe680'); } } }
  const A={
    addNeed(n,name){ S.need+=n; S.total+=n; ev({type:'need',n,name}); logAdd((name||'だれか')+' が魚を '+n+' 匹ふやした','#ff9aa8'); },
    subNeed(n,name){ if(S.mode!=='play') return; const k=Math.min(n,S.need); S.need-=k; let rm=Math.max(0,alive()-Math.min(cap,S.need)); while(rm-->0 && S.fish.length){ const f=S.fish.pop(); f.sc.n--; ev({type:'eat',x:f.x,y:f.y,by:null}); } ev({type:'need',n:-k,name}); logAdd((name||'だれか')+' が魚を '+k+' 匹へらした','#9be9ff'); },
    boost(name){ S.boostT=CFG.boostSec; ev({type:'boost'}); logAdd((name||'だれか')+' がカメを速くした','#9be9ff'); },
    buddy(name){ const t={ x:rand(60,W-60), y:Math.random()<.5?40:H-40, a:rand(0,6.28), spd:0, main:false, name:name||'なかま', life:CFG.buddySec, flap:rand(0,6), eatT:0 }; S.turtles.push(t); if(S.turtles.length>41) S.turtles.splice(1,1); logAdd((name||'だれか')+' の子ガメが手伝いにきた','#b9ffb0'); },
    whale(name){ if(S.whale) return; const dir=Math.random()<.5?1:-1; let y=main.y, best=-1; for(let k=0;k<8;k++){ const yy=rand(H*.15,H*.85); let c=0; for(const f of S.fish) if(Math.abs(f.y-yy)<170) c++; if(c>best){ best=c; y=yy; } } S.whale={ x:dir>0?-500:W+500, y, vx:dir*420, r:170, name:name||'だれか', got:0 }; ev({type:'whale'}); logAdd((name||'だれか')+' がクジラを呼んだ','#9be9ff'); },
    vortex(name){ S.vortexT=CFG.vortexSec; ev({type:'vortex'}); logAdd((name||'だれか')+' が渦を起こした','#9be9ff'); },
    shark(name){ S.shark={ x:Math.random()<.5?-80:W+80, y:rand(100,H-100), a:0, t:CFG.sharkSec, name }; ev({type:'shark'}); logAdd((name||'だれか')+' がサメを放った','#ff9aa8'); },
    ink(name){ S.inkT=8; ev({type:'ink'}); logAdd((name||'だれか')+' がスミを吐いた（カメがおそくなる）','#ff9aa8'); },
    setWins(v){ S.wins=v; save(); }
  };
  startRound();
  return { S, CFG, update, act:A, main };
}
window.UmiSim={ makeSim, CFG };
})();
