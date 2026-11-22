/* ウミガメの魚集め：2D版・3D版で共通の画面まわり（上の表示、下のログ、テストボタン、ゲームの進行） */
(function(){
const css=`
@font-face{font-family:MPR;src:url(./font/mpr.woff2) format('woff2');font-weight:900;font-display:swap}
@font-face{font-family:DELA;src:url(./font/dela.woff2) format('woff2');font-display:swap}
html,body{margin:0;height:100%;background:#03101f;overflow:hidden;font-family:MPR,'Hiragino Sans','Noto Sans JP',sans-serif;font-weight:900;color:#fff;-webkit-user-select:none;user-select:none}
#stage{position:absolute;left:50%;top:0;transform:translateX(-50%);overflow:hidden;background:#06203c}
#hud{position:absolute;left:0;top:0;width:100%;height:20em;background:linear-gradient(#0d2244,#132c57);border-bottom:.5em solid #ffd23f;box-sizing:border-box;z-index:5}
#hud .lab{position:absolute;font-size:2.6em;color:#9fb6e6;letter-spacing:.05em}
#win{position:absolute;left:.55em;top:.75em;font-family:DELA;font-size:7.6em;line-height:1}
#need{position:absolute;left:0;right:0;top:.38em;text-align:center;font-family:DELA;font-size:9.4em;line-height:1;color:#ffd23f;text-shadow:0 .05em 0 #5a2a00}
#need small{font-family:MPR;font-size:.32em;color:#fff;margin:0 .35em}
#bar{position:absolute;left:25em;right:25em;bottom:2.2em;height:2em;border-radius:1em;background:#0a1730;overflow:hidden;border:.25em solid #2c4a86}
#bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#39d98a,#b6ff6a)}
#rd{position:absolute;right:1.4em;top:3.2em;font-size:3em;color:#9fb6e6;text-align:right;line-height:1.35}
#view{position:absolute;left:0;top:20em;width:100%;height:137em;overflow:hidden}
#view canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
#panel{position:absolute;left:0;top:157em;width:100%;height:35em;background:linear-gradient(#132c57,#0d2244);border-top:.5em solid #2c4a86;box-sizing:border-box;z-index:5}
#log{position:absolute;left:2.2em;top:2.4em;right:2.2em;font-size:3.1em;line-height:1.55}
#log div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#fps{position:absolute;right:2em;bottom:1.6em;font-size:2.4em;color:#6f86b8}
#rule{position:absolute;left:0;right:0;bottom:1.2em;text-align:center;font-size:2.5em;color:#ffd23f}
#ban{position:absolute;left:0;right:0;top:66em;text-align:center;font-family:DELA;font-size:13em;line-height:1.05;pointer-events:none;z-index:6;opacity:0;text-shadow:0 0 .25em rgba(0,0,0,.6)}
#ban small{display:block;font-family:MPR;font-size:.26em;color:#fff}
#ban.on{animation:ban 2.6s ease-out forwards}
@keyframes ban{0%{opacity:0;transform:scale(2.4)}10%{opacity:1;transform:scale(1)}75%{opacity:1}100%{opacity:0;transform:scale(.95) translateY(-2em)}}
#testBtn{position:absolute;right:1.6em;top:1em;font:inherit;font-size:2.4em;padding:.25em .9em;border-radius:1.2em;border:.12em solid #fff;background:#0a1730;color:#fff;z-index:8;cursor:pointer}
#tp{position:absolute;left:3em;right:3em;top:24em;background:rgba(8,16,40,.94);border:.3em solid #2c4a86;border-radius:2em;padding:2em;z-index:9;display:grid;grid-template-columns:repeat(3,1fr);gap:1.2em}
#tp[hidden]{display:none}
#tp button{font:inherit;font-size:2.7em;padding:.7em .2em;border-radius:.6em;border:0;color:#fff;cursor:pointer;line-height:1.25}
#tp .j{background:#c0392b}#tp .h{background:#1f9a55}#tp .n{background:#42558a}
`;
function boot(opt){ // opt: {W,H,title,init(view,sim),render(dt,sim,evs)}
  const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
  const stage=document.createElement('div'); stage.id='stage'; document.body.appendChild(stage);
  stage.innerHTML=`<div id="hud"><div class="lab" style="left:1.3em;top:.45em">WIN</div><div id="win">0</div><div id="need"></div><div id="bar"><i></i></div><div id="rd"></div><button id="testBtn" type="button">テスト</button></div>
  <div id="view"></div><div id="ban"></div>
  <div id="panel"><div id="log"></div><div id="rule">カメが魚をぜんぶ集めたら WIN+1</div><div id="fps"></div></div>
  <div id="tp" hidden>
   <button class="j" data-a="add100">妨害<br>魚 ＋100</button><button class="j" data-a="add1000">妨害<br>魚 ＋1000</button><button class="j" data-a="add10000">妨害<br>魚 ＋1万</button>
   <button class="j" data-a="shark">妨害<br>サメ</button><button class="j" data-a="ink">妨害<br>イカスミ</button><button class="h" data-a="sub100">お助け<br>魚 −100</button>
   <button class="h" data-a="boost">お助け<br>カメ加速</button><button class="h" data-a="vortex">お助け<br>渦</button><button class="h" data-a="whale">お助け<br>クジラ</button>
   <button class="n" data-a="buddy">コメント<br>子ガメ</button><button class="n" data-a="buddy10">コメント<br>子ガメ×10</button><button class="n" data-a="reset">WINを0に</button>
  </div>`;
  const fit=()=>{ const h=window.innerHeight, w=Math.min(window.innerWidth,h*9/16); stage.style.width=w+'px'; stage.style.height=(w*16/9)+'px'; stage.style.fontSize=(w/108)+'px'; };
  fit(); window.addEventListener('resize',fit);
  const $=id=>document.getElementById(id), view=$('view'), sim=UmiSim.makeSim(opt.W,opt.H,{cap:opt.cap}), S=sim.S, tp=$('tp');
  $('testBtn').onclick=()=>{ tp.hidden=!tp.hidden; };
  const names=['たぬ吉','ぽんた','みけ','そら','りく','はな','こてつ','もも','ゆず','まる'];
  tp.addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; const a=b.dataset.a, n=names[Math.floor(Math.random()*names.length)];
    if(a.startsWith('add')) sim.act.addNeed(parseInt(a.slice(3),10),n); else if(a==='sub100') sim.act.subNeed(100,n); else if(a==='buddy10'){ for(let i=0;i<10;i++) sim.act.buddy(names[i]); } else if(a==='reset') sim.act.setWins(0); else sim.act[a](n); tp.hidden=true; });
  opt.init(view,sim);
  const ban=$('ban'); let banQ=[], banBusy=0;
  function banner(html,color){ banQ.push([html,color]); }
  let last=performance.now(), fpsT=0, fpsN=0, fpsV=0, lastLog='';
  function hud(){ $('win').textContent=S.wins; $('need').innerHTML=S.mode==='clear'?'クリア！':'<small>あと</small>'+S.need.toLocaleString()+'<small>匹</small>'; $('bar').firstChild.style.width=(S.total?Math.max(0,Math.min(1,1-S.need/S.total))*100:0)+'%'; $('rd').innerHTML='ラウンド '+S.round+'<br>子ガメ '+(S.turtles.length-1);
    const lg=S.log.map(l=>l.text).join('|'); if(lg!==lastLog){ lastLog=lg; $('log').innerHTML=''; for(const l of S.log){ const d=document.createElement('div'); d.textContent=l.text; d.style.color=l.color; $('log').appendChild(d); } } }
  function step(dt){ sim.update(dt); const evs=S.ev.splice(0);
    for(const e of evs){ if(e.type==='need') banner((e.n>0?'＋':'−')+Math.abs(e.n).toLocaleString()+'匹<small>'+(e.name||'')+'</small>',e.n>0?'#ff3d5a':'#5dffb0'); else if(e.type==='clear') banner('クリア！<small>WIN ＋1</small>','#ffd23f'); }
    opt.render(dt,sim,evs);
    banBusy-=dt; if(banBusy<=0 && banQ.length){ const [h,c]=banQ.shift(); ban.innerHTML=h; ban.style.color=c; ban.classList.remove('on'); void ban.offsetWidth; ban.classList.add('on'); banBusy=banQ.length?1.1:2.6; }
    hud(); }
  function loop(now){ const dt=Math.min(.05,(now-last)/1000); last=now; if(!window.__frozen) step(dt); fpsT+=dt; fpsN++; if(fpsT>=1){ fpsV=Math.round(fpsN/fpsT); fpsT=0; fpsN=0; $('fps').textContent=fpsV+' fps ・ 魚 '+S.fish.length; } requestAnimationFrame(loop); }
  window.__dbg={ sim, S, step, get fps(){ return fpsV; } }; window.UmiGame=sim.act;
  requestAnimationFrame(loop); window.__ready=true; return sim; }
window.UmiUI={ boot };
})();
