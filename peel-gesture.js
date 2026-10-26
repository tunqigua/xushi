// A physical single-fold construction: reflect the peeled triangle over its crease.
export function peelGeometry(width,height,corner,point){
  const rect=[{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}];
  const dx=point.x-corner.x,dy=point.y-corner.y,length=Math.hypot(dx,dy);
  const inward=(width/2-corner.x)*dx+(height/2-corner.y)*dy;
  if(length<1||inward<=0)return {cover:rect,back:[],crease:[],progress:0};
  const normal={x:dx/length,y:dy/length},mid={x:(corner.x+point.x)/2,y:(corner.y+point.y)/2};
  const side=p=>(p.x-mid.x)*normal.x+(p.y-mid.y)*normal.y;
  const clip=sign=>{
    const result=[];
    for(let i=0;i<4;i++){
      const a=rect[i],b=rect[(i+1)%4],sa=side(a)*sign,sb=side(b)*sign;
      if(sa>=0)result.push(a);
      if((sa>=0)!==(sb>=0)){const t=sa/(sa-sb);result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
    }
    return result;
  };
  const cover=clip(1),peeled=clip(-1);
  const back=peeled.map(p=>{const d=side(p);return {x:p.x-2*d*normal.x,y:p.y-2*d*normal.y};});
  const area=Math.abs(cover.reduce((sum,p,i)=>{const q=cover[(i+1)%cover.length];return sum+p.x*q.y-q.x*p.y;},0))/2;
  return {cover,back,crease:cover.filter(p=>Math.abs(side(p))<.01),progress:Math.max(0,Math.min(1,1-area/(width*height)))};
}
const path=points=>points.length?'M'+points.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('L')+'Z':'';
export function createGesturePeel(){
  const dialog=document.createElement('dialog');dialog.className='gesture-dialog';dialog.setAttribute('aria-labelledby','gesture-title');
  dialog.innerHTML='<div class="gesture-heading"><h2 id="gesture-title">片刻，在你手里。</h2><button type="button" class="gesture-skip">直接查看</button></div><p class="gesture-hint" id="gesture-hint">从银色纸角向内揭开，松手后可以继续。</p><div class="gesture-sheet" tabindex="0" role="group" aria-label="揭开覆盖纸" aria-describedby="gesture-hint"><div class="gesture-paper"></div><svg class="gesture-film" aria-hidden="true"><path class="film-front" fill="#bfc2c5"/><path class="film-back" fill="#d6d8da" stroke="#9da2a6" stroke-width=".6"/><path class="film-crease" fill="none" stroke="#8c9297" stroke-opacity=".4" stroke-width="1.2"/></svg><span class="gesture-corner" aria-hidden="true">⌜</span></div><p class="gesture-progress" role="status">等待你揭开</p>';
  document.body.append(dialog);
  const sheet=dialog.querySelector('.gesture-sheet'),paper=dialog.querySelector('.gesture-paper'),film=dialog.querySelector('.gesture-film'),progress=dialog.querySelector('.gesture-progress');
  let active=false,makeSVG,complete,corner={x:1,y:0},point={x:1,y:0},drag=null,bucket=0,lastBuzz=0,frame=0,metrics='';
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const buzz=(duration=7)=>{const now=performance.now();if(!reduced()&&now-lastBuzz>90){lastBuzz=now;try{navigator.vibrate?.(duration);}catch{}}};
  const finish=()=>{if(active){buzz(14);complete();}};
  function draw(){
    const w=paper.clientWidth,h=paper.clientHeight;if(!w||!h)return;
    const geometry=peelGeometry(w,h,{x:corner.x*w,y:corner.y*h},{x:point.x*w,y:point.y*h});
    film.setAttribute('viewBox',`0 0 ${w} ${h}`);
    film.querySelector('.film-front').setAttribute('d',path(geometry.cover));
    film.querySelector('.film-back').setAttribute('d',path(geometry.back));
    film.querySelector('.film-crease').setAttribute('d',geometry.crease.length>1?'M'+geometry.crease.map(p=>`${p.x},${p.y}`).join('L'):'');
    sheet.style.setProperty('--peel-progress',String(geometry.progress));
    const next=Math.floor(geometry.progress*7);if(next>bucket){bucket=next;buzz();try{film.querySelector('.film-crease').animate([{strokeWidth:1.2},{strokeWidth:1.6},{strokeWidth:1.2}],{duration:80});}catch{}}
    progress.textContent=geometry.progress>.01?'松手后，可以接着向内揭开。':'从纸角开始揭开';
    dialog.querySelector('.gesture-corner').hidden=geometry.progress>.01;
    return geometry.progress;
  }
  function release(event){if(!drag||event.pointerId!==drag.id)return;drag=null;const amount=draw();if(amount<.01){point={...corner};draw();}else if(amount>=.6)finishFold();}
  function finishFold(){
    const start={...point},w=paper.clientWidth,h=paper.clientHeight,c={x:corner.x*w,y:corner.y*h};
    let dx=(point.x-corner.x)*w,dy=(point.y-corner.y)*h,len=Math.hypot(dx,dy);
    if(len<1){dx=(.5-corner.x)*w;dy=(.5-corner.y)*h;len=Math.hypot(dx,dy);}
    const nx=dx/len,ny=dy/len;
    const reach=2*Math.max(...[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}].map(p=>(p.x-c.x)*nx+(p.y-c.y)*ny))+4;
    const end={x:(c.x+nx*reach)/w,y:(c.y+ny*reach)/h},began=performance.now();
    const step=now=>{if(!active)return;const t=Math.min(1,(now-began)/260),ease=1-(1-t)**3;point={x:start.x+(end.x-start.x)*ease,y:start.y+(end.y-start.y)*ease};draw();if(t<1)frame=requestAnimationFrame(step);else finish();};
    frame=requestAnimationFrame(step);
  }
  sheet.addEventListener('pointerdown',event=>{
    if(!active||!event.isPrimary||event.button!==0)return;event.preventDefault();cancelAnimationFrame(frame);
    const r=paper.getBoundingClientRect(),x=(event.clientX-r.left)/r.width,y=(event.clientY-r.top)/r.height;
    if(!bucket&&point.x===corner.x&&point.y===corner.y){corner={x:x>.5?1:0,y:y>.5?1:0};point={...corner};}
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,start:{...point}};sheet.setPointerCapture(event.pointerId);buzz();
  });
  sheet.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;event.preventDefault();point={x:drag.start.x+(event.clientX-drag.x)/paper.clientWidth,y:drag.start.y+(event.clientY-drag.y)/paper.clientHeight};draw();});
  sheet.addEventListener('pointerup',release);sheet.addEventListener('pointercancel',event=>{if(drag?.id===event.pointerId)drag=null;});
  sheet.addEventListener('keydown',event=>{if(['Enter',' ','ArrowLeft','ArrowDown'].includes(event.key)){event.preventDefault();point={x:point.x-.22,y:point.y+.22};if(draw()>=.6||event.key==='Enter'||event.key===' ')finishFold();}});
  dialog.querySelector('.gesture-skip').addEventListener('click',finish);
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish();});
  const resize=new ResizeObserver(()=>{if(!active)return;const key=paper.clientWidth;if(key===metrics)return;metrics=key;paper.innerHTML=makeSVG(paper);draw();});resize.observe(paper);
  return {
    open(options){makeSVG=options.makeSVG;complete=options.onComplete;active=true;corner={x:1,y:0};point={...corner};bucket=0;metrics='';drag=null;dialog.showModal();paper.innerHTML=makeSVG(paper);draw();sheet.focus({preventScroll:true});if(!reduced())sheet.animate([{transform:'translateY(36px) scale(.88)',opacity:0},{transform:'translateY(0) scale(1)',opacity:1}],{duration:300,easing:'cubic-bezier(.2,.8,.2,1)'});},
    close(){active=false;drag=null;cancelAnimationFrame(frame);if(dialog.open)dialog.close();paper.replaceChildren();try{navigator.vibrate?.(0);}catch{}},
  };
}
