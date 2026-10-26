import { createGesturePeel } from './peel-gesture.js';
import { countChars, formatDateLabel } from './layout.js';
import { feelings, validateDraft, captureDraft, TEXT_LIMIT, FEEL_LIMIT } from './draft.js';
import { paperLayout, paperSVG, paperFont, exportPNG, readyPaper, readyWithin } from './paper.js';
import { createStore, groundValue, recordKey, PREFIX, MUTATION_LOCK } from './store.js';
const $ = id => document.getElementById(id);
const result = document.querySelector('.result'), sheet=document.querySelector('.sheet'), cover=document.querySelector('.cover');
const gesture=document.body.dataset.reveal==='gesture'?createGesturePeel():null;
const preference=matchMedia('(prefers-reduced-motion: reduce)');
let state='editing', animations=[], timers=[], run=0, svg='', snapshot=null, imageURL=null;
const measureCanvas=document.createElement('canvas');measureCanvas.lang=document.documentElement.lang;
const measure=measureCanvas.getContext('2d');
const fontProbe=document.createElement('span');fontProbe.setAttribute('aria-hidden','true');fontProbe.style.cssText='position:absolute;width:1rem;height:1rem;visibility:hidden;pointer-events:none';document.body.append(fontProbe);
let detailRecord=null, detailSVG='', detailURL=null, wallReturn=null, undoCopy=null, undoTimer=null;
let composing=false, saveState='pending', pending=null, currentId=null, capturedDraft=null, draftSafe=false, removed=false, saving=false;
// Access can itself throw in private/restricted browsing; all reads stay inside the adapter.
const store=createStore({get length(){return localStorage.length;},key:i=>localStorage.key(i),getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)}, {getItem:key=>sessionStorage.getItem(key),setItem:(key,value)=>sessionStorage.setItem(key,value)});
function sessionValue(){return {draft:draft(),pending,currentId,capturedDraft};}
function persistDraft(){try{store.writeSession(sessionValue());draftSafe=true;$('draft-status').textContent='草稿已保存在本标签页；正式片段保存在当前浏览器。';}catch{draftSafe=false;$('draft-status').textContent='草稿暂未能保存到本标签页。文字仍在，请先拍下并保存图片；关闭前请保留原文。原有坏数据不会被覆盖。';}}
function showSave(){
  result.dataset.saveState=saveState;
  $('save-status').textContent=removed?'这张记录已被移除。本页文字仍可导出，不会自动重新写入。':saveState==='saved'?'已保存在当前浏览器。':saveState==='failed'?'这次没能存进浏览器。文字还在，可以先保存图片，或重试保存。':'正在尝试保存到当前浏览器……';
  $('retry').hidden=saveState!=='failed'||removed;$('retry').disabled=saving;$('ground').disabled=saving;
  $('resume').hidden=state!=='editing'||!snapshot;
}
async function withRecordLock(id,action){return navigator.locks? navigator.locks.request(MUTATION_LOCK,action):action();}
async function saveCapture(update=currentId===snapshot?.id){
  if(!snapshot||saving||removed)return;
  saving=true;saveState='pending';showSave();const shot=snapshot;
  try{const saved=await withRecordLock(shot.id,()=>store.save(shot,{update}));
    if(snapshot?.id!==shot.id)return;
    snapshot=Object.freeze(saved);pending=null;currentId=shot.id;saveState='saved';
    const url=new URL(location.href);url.searchParams.set('record',shot.id);history.replaceState(null,'',url);
    // Only the exact draft used by this shutter can be cleared, after the record is confirmed.
    if(capturedDraft&&JSON.stringify(draft())===JSON.stringify(capturedDraft))applyDraft({text:'',feeling:'',custom:''});
    capturedDraft=null;persistDraft();refreshWall();
  }catch(error){if(snapshot?.id!==shot.id)return;saveState='failed';if(error.message==='removed')removed=true;pending=removed?null:snapshot;persistDraft();}
  finally{saving=false;showSave();}
}
function applyDraft(value){$('text').value=value.text;$('custom-feel').value=value.custom;document.querySelectorAll('[name="feeling"]').forEach(input=>input.checked=input.value===value.feeling);$('custom-wrap').hidden=value.feeling!=='custom';updateDraft();}
function showSnapshot(){result.dataset.captureId=snapshot.id;$('ground').value=groundValue(snapshot.ground);$('date').textContent=snapshot.localDate?formatDateLabel(snapshot.localDate):'日期未记录';$('feel').hidden=!snapshot.feel;$('feel').textContent=snapshot.feel?.text||'';showSave();}

const draft=()=>({text:$('text').value, feeling:document.querySelector('[name="feeling"]:checked')?.value || '', custom:$('custom-feel').value});
for(const value of [...feelings,'custom']) {
  const label=document.createElement('label'), input=document.createElement('input');
  input.type='checkbox';input.name='feeling';input.value=value;
  label.append(input,document.createTextNode(value==='custom'?'自己写一个':value));$('feelings').append(label);
  input.addEventListener('change',()=>{
    if(input.checked)document.querySelectorAll('[name="feeling"]').forEach(other=>{if(other!==input)other.checked=false;});
    $('custom-wrap').hidden=draft().feeling!=='custom';updateDraft();persistDraft();
  });
}
$('reduce').checked=preference.matches;
function syncMotion(){result.dataset.reduced=String($('reduce').checked||preference.matches);}
syncMotion();
function updateDraft(){
  const value=draft(),error=validateDraft(value);
  $('count').textContent=`${countChars(value.text)} / ${TEXT_LIMIT} 个字符`;
  $('feel-count').textContent=`${countChars(value.custom)} / ${FEEL_LIMIT} 个字符`;
  $('text').setAttribute('aria-invalid',String(!!value.text&&!!validateDraft({text:value.text})));
  $('custom-feel').setAttribute('aria-invalid',String(value.feeling==='custom'&&countChars(value.custom)>FEEL_LIMIT));
  $('error').textContent=composing||!value.text?'':error;
  $('shutter').setAttribute('aria-disabled',String(composing||!!error||state!=='editing'));
}
for(const id of ['text','custom-feel']) {
  $(id).addEventListener('input',()=>{updateDraft();persistDraft();});
  $(id).addEventListener('compositionstart',()=>{composing=true;updateDraft();});
  $(id).addEventListener('compositionend',()=>{composing=false;updateDraft();});
  $(id).addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.isComposing||event.keyCode===229))event.stopPropagation();});
}
function setState(value){state=value;result.dataset.state=value;$('editor').hidden=value!=='editing';$('skip').hidden=['editing','settled'].includes(value);$('cancel').hidden=['editing','settled'].includes(value);updateDraft();$('resume').hidden=value!=='editing'||!snapshot;if(value==='preparing')$('skip').focus({preventScroll:true});}
function clear(){gesture?.close();timers.forEach(clearTimeout);timers=[];animations.forEach(a=>a.cancel());animations=[];}
function settle(focus=true){if(!snapshot)return;run++;clear();render();setState('settled');$('status').textContent='成品已展开。';if(focus)$('result-title').focus({preventScroll:true});}
function render(){svg=finalSVG(snapshot);putSVG($('paper'),svg);}
function animate(element,frames,options){const a=element.animate(frames,{fill:'forwards',...options});animations.push(a);return a;}
$('shutter').addEventListener('click',async()=>{
  if(state!=='editing'||composing)return;
  if(pending&&snapshot){showSnapshot();settle();void saveCapture();return;}
  const error=validateDraft(draft());if(error){$('error').textContent=error;(validateDraft({text:draft().text})?$('text'):$('custom-feel')).focus();return;}
  clear();const token=++run;setState('preparing');capturedDraft=draft();
  let generation='';try{generation=store.epoch();}catch{}
  const capture=captureDraft(capturedDraft);snapshot=Object.freeze({...capture,v:1,storeEpoch:generation,ground:$('ground').value,updatedAt:capture.createdAt});
  removed=false;pending=snapshot;currentId=null;saveState='pending';persistDraft();showSnapshot();void saveCapture();clearImage();
  timers.push(setTimeout(()=>{if(token===run)settle();},3500));
  try{
    await readyPaper(snapshot.text);if(token!==run)return;render();
    if($('reduce').checked||preference.matches||document.hidden){settle();return;}
    if(gesture){
      timers.forEach(clearTimeout);timers=[];setState('peeling');$('status').textContent='相纸已展开，向内揭开银色覆盖纸。';
      gesture.open({makeSVG:target=>finalSVG(snapshot,snapshot.text,target),onComplete:()=>{if(token===run)settle();}});return;
    }
    setState('ejecting');$('status').textContent='相纸正在从出口推出……';
    // The overflow mask is the slot's lower boundary. Only the paper translates.
    animate(sheet,[{transform:'translateY(calc(-100% - 12px))'},{transform:'translateY(0)'}],{duration:800,easing:'cubic-bezier(.25,.65,.3,1)'});
    timers.push(setTimeout(()=>{if(token!==run)return;setState('peeling');$('status').textContent='覆盖纸正在揭开……';
      animate(cover,[{clipPath:'polygon(0 0,100% 0,100% 0,100% 100%,0 100%)'},{clipPath:'polygon(0 0,48% 0,100% 52%,100% 100%,0 100%)',offset:.35},{clipPath:'polygon(0 35%,0 35%,65% 100%,0 100%,0 100%)',offset:.7},{clipPath:'polygon(0 100%,0 100%,0 100%,0 100%,0 100%)'}],{duration:1150,easing:'ease-in-out'});
      // A clean diagonal peel keeps the boundary continuous without a detached rolled band.
    },950));
    timers.push(setTimeout(()=>{if(token===run)settle();},2250));
  }catch{settle();$('status').textContent='动作未能播放，已直接展开成品。';}
});
$('skip').addEventListener('click',()=>settle());
$('reduce').addEventListener('change',()=>{syncMotion();if($('reduce').checked&&state!=='editing')settle();});
preference.addEventListener('change',()=>{syncMotion();if(preference.matches){$('reduce').checked=true;if(state!=='editing')settle();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state!=='editing')settle(false);});
addEventListener('pagehide',()=>{run++;clear();clearImage();clearImage(true);});
addEventListener('pageshow',event=>{if(event.persisted&&snapshot)settle(false);});
function returnToDraft(){
  run++;clear();
  if(saveState==='saved'){currentId=null;pending=null;snapshot=null;const url=new URL(location.href);url.searchParams.delete('record');history.replaceState(null,'',url);}
  persistDraft();if(!snapshot)delete result.dataset.captureId;svg='';$('paper').replaceChildren();setState('editing');clearImage();
  $('status').textContent=pending?'草稿仍在。上一张尚未保存，可查看并重试；再次按快门会先恢复这一张。':'可以继续写。已保存的片段留在当前浏览器。';$('text').focus();
}
$('resume').addEventListener('click',()=>{showSnapshot();settle();});
$('back').addEventListener('click',returnToDraft);
$('cancel').addEventListener('click',returnToDraft);
for(const link of document.querySelectorAll('a[href="#writing"]'))link.addEventListener('click',()=>{if(state!=='editing')returnToDraft();});
addEventListener('beforeunload',event=>{if(!draftSafe&&(draft().text||draft().custom||pending)){event.preventDefault();event.returnValue='';}});
$('ground').addEventListener('change',()=>{if(snapshot){snapshot=Object.freeze({...snapshot,ground:$('ground').value,updatedAt:new Date().toISOString()});if(saveState!=='saved')pending=snapshot;persistDraft();render();clearImage();void saveCapture(saveState==='saved');}});
$('retry').addEventListener('click',()=>void saveCapture());
addEventListener('storage',event=>{
  if(event.key===null||event.key?.startsWith(PREFIX)){refreshWall();syncDetail();if(undoCopy){try{if(store.epoch()!==undoCopy.generation)clearUndo();}catch{clearUndo();}}}
  if(!snapshot||event.key!==recordKey(snapshot.id)&&event.key!==PREFIX+'deleted:'+snapshot.id&&event.key!==PREFIX+'clear-epoch'&&event.key!==null)return;
  // External changes never replace current input, start an animation, or recreate a removed record.
  try{const latest=store.read(snapshot.id);if(!latest){removed=true;pending=null;saveState='failed';persistDraft();showSave();return;}
    if(latest.text!==snapshot.text||latest.createdAt!==snapshot.createdAt||JSON.stringify(latest.feel)!==JSON.stringify(snapshot.feel)||latest.localDate!==snapshot.localDate){saveState='failed';pending=snapshot;persistDraft();showSave();$('external-status').textContent='另一标签页修改了这条记录，当前文字仍保留。请先保存图片。';return;}
    snapshot=Object.freeze(latest);pending=null;currentId=latest.id;capturedDraft=null;saveState='saved';$('ground').value=latest.ground;if(state!=='editing')render();clearImage();persistDraft();showSave();$('external-status').textContent='另一标签页更新了这张记录；当前输入未改变。';
  }catch{saveState='failed';pending=snapshot;persistDraft();showSave();$('external-status').textContent='另一标签页的数据无法读取，原始数据与当前文字都保留。';}
});
function clearImage(detail=false){
  const url=detail?detailURL:imageURL;
  $(detail?'detail-image':'image-preview').hidden=true;
  $(detail?'detail-png':'png').removeAttribute('src');
  $(detail?'detail-link':'image-link').removeAttribute('href');
  if(url)URL.revokeObjectURL(url);
  if(detail)detailURL=null;else imageURL=null;
}
async function saveImage(detail=false){
  const button=$(detail?'detail-download':'download'),notice=$(detail?'detail-status':'status');
  const record=detail?detailRecord:snapshot,token=run;
  if(!record||button.disabled||(!detail&&state!=='settled'))return;
  const current=()=>token===run&&(detail?detailRecord===record:snapshot===record);
  button.disabled=true;button.textContent='正在生成图片…';notice.textContent='正在准备字体与完整相纸…';clearImage(detail);
  try{
    await readyPaper(record.text);if(!current())return;
    // Refresh the visible master after fonts settle; viewport changes never reuse a stale screenshot.
    const source=finalSVG(record,record.text,detail?$('detail-paper'):$('paper'));
    if(detail){detailSVG=source;putSVG($('detail-paper'),source);}else{svg=source;putSVG($('paper'),source);}
    const blob=await exportPNG(source);if(!current())return;
    const url=URL.createObjectURL(blob);if(detail)detailURL=url;else imageURL=url;
    const image=$(detail?'detail-png':'png'),link=$(detail?'detail-link':'image-link');
    image.src=url;await readyWithin(image.decode(),'图片预览未能打开，请重试。');if(!current()){clearImage(detail);return;}
    link.href=url;link.download=`虚室-${record.localDate||'片段'}-${record.id}.png`;
    $(detail?'detail-image':'image-preview').hidden=false;
    // A visible image and explicit link remain usable when a mobile browser ignores download.
    link.click();notice.textContent='PNG 已生成，下载已发起。手机可在下方长按图片保存；请在设备中确认。';
  }catch{if(current()){clearImage(detail);notice.textContent='这次未能生成图片，可能是字体或纸张素材未就绪。原文仍在，请点“重试生成图片”。';button.textContent='重试生成图片';}}
  finally{button.disabled=false;if(button.textContent!=='重试生成图片')button.textContent='保存图片';if(!current()&&notice.textContent==='正在准备字体与完整相纸…')notice.textContent='内容已更新，请重新保存图片。';}
}
$('download').addEventListener('click',()=>saveImage());
setState('editing');
try{
  const saved=store.loadSession();
  if(saved){applyDraft(saved.draft);capturedDraft=saved.capturedDraft||null;pending=saved.pending||null;currentId=saved.currentId||new URL(location.href).searchParams.get('record');
    if(pending){snapshot=Object.freeze(pending);saveState='failed';showSnapshot();settle(false);void saveCapture();}
    else if(currentId){const record=store.read(currentId);if(record){snapshot=Object.freeze(record);saveState='saved';showSnapshot();settle(false);}else{currentId=null;$('external-status').textContent='此前的记录已被移除；当前草稿仍保留。';}}
    draftSafe=true;$('draft-status').textContent='已恢复本标签页内容。正式片段保存在当前浏览器。';
  }else{const id=new URL(location.href).searchParams.get('record');if(id){const record=store.read(id);if(record){snapshot=Object.freeze(record);currentId=id;saveState='saved';showSnapshot();settle(false);persistDraft();}else $('external-status').textContent='这张记录不在当前浏览器中，未创建替代记录。';}}
}catch{$('draft-status').textContent='本地内容读取失败；原始数据已保留，未自动清空。当前仍可书写和导出，请在关闭前保留原文。';}

// History uses the final paper master directly; it never enters the shutter state machine.
function finalSVG(record,text=record.text,target=$('paper')){
  // Keep full-size artwork readable on narrow screens and under browser/text zoom.
  const width=target?.clientWidth||Math.min(520,innerWidth-84);
  const scale=fontProbe.getBoundingClientRect().width/16;
  const fontSize=target?Math.max(64,18*scale*1200/Math.max(1,width)):64;
  const layout=paperLayout(text,(value,size)=>{measure.font=`${size}px ${paperFont}`;return measure.measureText(value).width;},fontSize);
  return paperSVG(text,layout,record.ground);
}
function putSVG(target,value){target.replaceChildren(new DOMParser().parseFromString(value,'image/svg+xml').documentElement);}
function refreshWall(){
  try{
    const {items,errors}=store.list(), fragment=document.createDocumentFragment();
    for(const record of items){
      const card=document.createElement('article'),button=document.createElement('button'),caption=document.createElement('span'),meta=document.createElement('div');
      card.className='wall-card';button.className='wall-open';button.dataset.recordId=record.id;
      const units=Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(record.text),part=>part.segment);
      const summary=units.slice(0,48).join('').split('\n').slice(0,3).join('\n'),shortened=summary!==record.text;
      putSVG(button,finalSVG(record,summary+(shortened?'…':''),null));
      caption.className='wall-caption';caption.textContent=shortened?'摘要 · 点开读全文':'点开查看片段';button.append(caption);
      button.addEventListener('click',()=>openDetail(record.id));
      meta.className='metadata';const date=document.createElement('p');date.textContent=record.localDate?formatDateLabel(record.localDate):'日期未记录';meta.append(date);
      if(record.feel){const feel=document.createElement('p');feel.textContent=record.feel.text;meta.append(feel);}
      card.append(button,meta);fragment.append(card);
    }
    $('wall').replaceChildren(fragment);$('wall-empty').hidden=items.length>0;$('delete-all').hidden=items.length===0;
    $('wall-status').textContent=errors.length?`有 ${errors.length} 条内容无法读取，原始数据已保留，未自动清空。`:items.length?`${items.length} 张片段，保存在当前浏览器。`:'';
  }catch{$('wall-status').textContent='暂时无法读取照片墙。原始数据已保留，请稍后重试。';}
}
function paintDetail(invalidateImage=true){
  detailSVG=finalSVG(detailRecord,detailRecord.text,$('detail-paper'));putSVG($('detail-paper'),detailSVG);
  $('detail-date').textContent=detailRecord.localDate?formatDateLabel(detailRecord.localDate):'日期未记录';
  $('detail-feel').hidden=!detailRecord.feel;$('detail-feel').textContent=detailRecord.feel?.text||'';
  $('detail-ground').value=detailRecord.ground;if(invalidateImage)clearImage(true);
}
function openDetail(id){
  try{const record=store.read(id);if(!record){refreshWall();$('wall-status').textContent='这张片段已被移除。';return;}
    wallReturn={id,y:scrollY};detailRecord=record;paintDetail();$('detail-status').textContent='已保存在当前浏览器。';$('delete-one').disabled=false;$('detail-ground').disabled=false;
    $('detail').showModal();paintDetail();$('detail').scrollTop=0;$('close-detail').focus({preventScroll:true});
  }catch{$('wall-status').textContent='这张内容无法读取，原始数据已保留。';}
}
function syncDetail(){
  if(!detailRecord||!$('detail').open)return;
  try{const latest=store.read(detailRecord.id);
    if(!latest){$('detail-status').textContent='这张片段已被移除。当前文字仍可保存图片。';$('delete-one').disabled=true;$('detail-ground').disabled=true;return;}
    if(JSON.stringify(latest)===JSON.stringify(detailRecord))return;
    detailRecord=latest;paintDetail();$('detail-status').textContent='已同步当前浏览器中的片段。';
  }catch{$('detail-status').textContent='本地内容无法读取，当前文字与原始数据已保留。';$('delete-one').disabled=true;$('detail-ground').disabled=true;}
}
$('close-detail').addEventListener('click',()=>$('detail').close());
$('detail').addEventListener('close',()=>{
  // A delayed close event must not clear a detail that has already reopened.
  if($('detail').open)return;
  clearImage(true);
  detailRecord=null;const back=wallReturn;wallReturn=null;
  requestAnimationFrame(()=>{if($('detail').open)return;const target=Array.from(document.querySelectorAll('.wall-open')).find(button=>button.dataset.recordId===back?.id)||$('wall-title');target.focus({preventScroll:true});if(back)scrollTo(0,back.y);});
});
$('detail-ground').addEventListener('change',async()=>{
  const record=detailRecord;if(!record)return;$('detail-ground').disabled=true;
  try{const next={...record,ground:$('detail-ground').value,updatedAt:new Date().toISOString()};const saved=await withRecordLock(record.id,()=>store.save(next,{update:true}));
    if(detailRecord?.id!==record.id)return;detailRecord=saved;paintDetail();refreshWall();
    if(snapshot?.id===record.id){snapshot=Object.freeze(saved);$('ground').value=saved.ground;if(state!=='editing')render();clearImage();}
    $('detail-status').textContent='底色已保存在当前浏览器。';
  }catch{$('detail-status').textContent='这次没能保存底色；记录可能已被移除。当前文字仍可保存图片。';}
  finally{if(detailRecord?.id===record.id)$('detail-ground').disabled=false;}
});
$('detail-download').addEventListener('click',()=>saveImage(true));
function clearUndo(){const focused=document.activeElement===$('undo');undoCopy=null;clearTimeout(undoTimer);$('undo-bar').hidden=true;if(focused)$('wall-title').focus({preventScroll:true});}
function markCurrentRemoved(){
  if(!snapshot)return;
  try{if(!store.read(snapshot.id)){removed=true;pending=null;saveState='failed';persistDraft();showSave();}}catch{}
}
$('delete-one').addEventListener('click',async()=>{
  if(!detailRecord)return;const record=detailRecord,id=record.id;$('delete-one').disabled=true;
  try{const copy=await withRecordLock(id,()=>store.remove(id));clearUndo();refreshWall();markCurrentRemoved();if(detailRecord===record)$('detail').close();
    if(copy){undoCopy=copy;$('undo-status').textContent='已删除这张片段，10 秒内可以撤销。';$('undo-bar').hidden=false;undoTimer=setTimeout(()=>{clearUndo();},Math.max(0,copy.expires-Date.now()));}
  }catch{if(detailRecord===record){$('detail-status').textContent='删除未能完成。原始内容未自动清空，请检查照片墙后重试。';$('delete-one').disabled=false;}else $('wall-status').textContent='此前片段删除未能完成，请检查照片墙后重试。';refreshWall();}
});
$('undo').addEventListener('click',async()=>{
  const copy=undoCopy;if(!copy)return;$('undo').disabled=true;
  try{await withRecordLock(copy.record.id,()=>store.undo(copy));clearUndo();refreshWall();$('wall-status').textContent='已撤销删除。';
    if(snapshot?.id===copy.record.id){removed=false;saveState='saved';currentId=copy.record.id;showSave();persistDraft();}
  }catch{clearUndo();refreshWall();$('wall-status').textContent='撤销已失效，或这次未能写入。不会恢复已被全部删除的片段。';}
  finally{$('undo').disabled=false;$('wall-title').focus({preventScroll:true});}
});
$('delete-all').addEventListener('click',()=>{$('clear-status').textContent='';$('clear-dialog').showModal();$('cancel-clear').focus();});
$('cancel-clear').addEventListener('click',()=>$('clear-dialog').close());
$('confirm-clear').addEventListener('click',async()=>{
  $('confirm-clear').disabled=true;
  try{const damaged=await withRecordLock('all',()=>store.clearAll());clearUndo();refreshWall();markCurrentRemoved();syncDetail();$('clear-dialog').close();$('wall-title').focus({preventScroll:true});$('wall-status').textContent=damaged?`已删除可读取片段；${damaged} 条坏数据保留原样。旧撤销已失效。`:'已删除全部片段，旧撤销已失效。未拍下的草稿仍在。';}
  catch{clearUndo();refreshWall();markCurrentRemoved();$('clear-status').textContent='未能完整清理本地数据。请检查照片墙后重试；旧撤销可能已失效。';}
  finally{$('confirm-clear').disabled=false;}
});
refreshWall();

// Restored records may render before a web font finishes; refresh all visible paper together.
document.fonts.ready.then(()=>{if(snapshot&&state!=='editing')render();if(detailRecord)paintDetail(false);refreshWall();}).catch(()=>{});

// Width and rem changes reflow paper, while an exported PNG remains an independent file.
let paperMetrics='';
const reflow=new ResizeObserver(()=>{
  const metrics=[$('paper').clientWidth,$('detail-paper').clientWidth,fontProbe.getBoundingClientRect().width].join(':');
  if(metrics===paperMetrics)return;paperMetrics=metrics;
  if(snapshot&&state!=='editing')render();if(detailRecord)paintDetail(false);
});
[$('paper'),$('detail-paper'),fontProbe].forEach(element=>reflow.observe(element));
