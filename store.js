import { feelings } from './draft.js';
export const PREFIX='xushi:v1:', DRAFT_KEY=PREFIX+'draft';
export const recordKey=id=>PREFIX+'record:'+id;
export const EPOCH_KEY=PREFIX+'clear-epoch', MUTATION_LOCK=PREFIX+'mutations';
const deletedKey=id=>PREFIX+'deleted:'+id;
export const groundValue=value=>['warm','blue','pink','gray'].includes(value)?value:'warm';
const dateValue=value=>typeof value==='string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
const localDateValue=value=>typeof value==='string' && /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function readRecord(value){
  if(!value||value.v!==1||typeof value.id!=='string'||!value.id||typeof value.text!=='string')throw Error('record');
  const feel=value.feel;
  if(feel!==null&&feel!==undefined&&!(typeof feel.text==='string'&&['preset','custom'].includes(feel.source)&&(feel.source!=='preset'||feelings.includes(feel.text))))throw Error('feel');
  // Missing dates in older records stay unknown; rendering never writes them back.
  if(value.createdAt!=null&&!dateValue(value.createdAt)||value.updatedAt!=null&&!dateValue(value.updatedAt))throw Error('date');
  return {...value,feel:feel||null,ground:groundValue(value.ground),localDate:localDateValue(value.localDate)?value.localDate:null};
}
export function createStore(records,session){
  let blocked=false;
  const epoch=()=>records.getItem(EPOCH_KEY)||'';
  const keys=()=>Array.from({length:records.length},(_,i)=>records.key(i)).filter(Boolean);
  const visible=record=>!records.getItem(deletedKey(record.id))&&(record.storeEpoch||'')===epoch();
  return {
    epoch,
    list(){const items=[],errors=[];for(const key of keys().filter(k=>k.startsWith(PREFIX+'record:'))){try{const record=readRecord(JSON.parse(records.getItem(key)));if(key!==recordKey(record.id))throw Error('id');if(visible(record))items.push(record);}catch{errors.push(key);}}
      items.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')||b.id.localeCompare(a.id));return {items,errors};},
    remove(id){const raw=records.getItem(recordKey(id));if(raw===null)return null;const record=readRecord(JSON.parse(raw));if(record.id!==id)throw Error('id');if(!visible(record))return null;
      const token=crypto.randomUUID(), generation=epoch(),expires=Date.now()+10000;
      records.setItem(deletedKey(id),token);if(records.getItem(deletedKey(id))!==token)throw Error('verify');
      records.removeItem(recordKey(id));return {record,token,generation,expires};},
    undo(copy){if(!copy||Date.now()>copy.expires||epoch()!==copy.generation||records.getItem(deletedKey(copy.record.id))!==copy.token)throw Error('removed');
      const key=recordKey(copy.record.id);if(records.getItem(key)!==null)throw Error('conflict');
      records.setItem(key,JSON.stringify(copy.record));if(records.getItem(key)!==JSON.stringify(copy.record))throw Error('verify');
      records.removeItem(deletedKey(copy.record.id));return copy.record;},
    clearAll(){
      // The persistent generation invalidates old undo copies and pending saves in every tab.
      const generation=crypto.randomUUID();records.setItem(EPOCH_KEY,generation);if(epoch()!==generation)throw Error('verify');
      let damaged=0;for(const key of keys().filter(k=>k.startsWith(PREFIX+'record:'))){try{const value=readRecord(JSON.parse(records.getItem(key)));if(key!==recordKey(value.id))throw Error('id');}catch{damaged++;continue;}records.removeItem(key);}
      return damaged;
    },
    loadSession(){try{const raw=session.getItem(DRAFT_KEY);if(raw===null)return null;const value=JSON.parse(raw);
      if(value.v!==1||!value.draft||typeof value.draft.text!=='string'||typeof value.draft.custom!=='string'||!['',...feelings,'custom'].includes(value.draft.feeling)||!(value.currentId===null||typeof value.currentId==='string'))throw Error('draft');
      if(value.pending)value.pending=readRecord(value.pending);
      return value;
    }catch{blocked=true;throw Error('draft-read');}},
    writeSession(value){if(blocked)throw Error('draft-blocked');session.setItem(DRAFT_KEY,JSON.stringify({v:1,...value}));},
    read(id){const raw=records.getItem(recordKey(id));if(raw===null)return null;const value=readRecord(JSON.parse(raw));if(value.id!==id)throw Error('id');return visible(value)?value:null;},
    save(value,{update=false}={}){
      const record=readRecord(value);if(!visible(record))throw Error('removed');
      const key=recordKey(record.id),raw=records.getItem(key);
      if(raw!==null){const existing=readRecord(JSON.parse(raw));
        if(existing.id!==record.id||existing.text!==record.text||existing.createdAt!==record.createdAt||existing.localDate!==record.localDate||JSON.stringify(existing.feel)!==JSON.stringify(record.feel))throw Error('conflict');
        if(!update)return existing;
      }else if(update)throw Error('removed');
      records.setItem(key,JSON.stringify(record));
      if(records.getItem(key)!==JSON.stringify(record))throw Error('verify');
      return record;
    }
  };
}
