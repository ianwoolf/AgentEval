import {useState} from 'react';
import {useWorkbench} from './provider';
import {Button,Modal,ErrorText} from './ui';
export function DeleteResource({collection,id,name}:{collection:'datasets'|'scorers'|'environments'|'targets';id:string;name:string}) {
 const {archiveResource}=useWorkbench();const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 return <><Button variant="ghost" onClick={()=>setOpen(true)}>Delete</Button>{open&&<Modal title={`Delete ${name}?`} description="This item will be archived and hidden from the catalog. Existing reports and published versions are retained." onClose={()=>{if(!busy)setOpen(false);}}><ErrorText message={error}/><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setOpen(false)}>Cancel</Button><Button disabled={busy} onClick={async()=>{setBusy(true);try{await archiveResource(collection,id);setOpen(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Deleting…':'Delete'}</Button></div></Modal>}</>;
}
