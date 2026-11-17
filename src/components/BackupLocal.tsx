import { useState } from 'react';
export default function BackupLocal() {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function backup() {
    setBusy(true);setMessage('');
    try {
      const response=await fetch('/api/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      if(!response.ok)throw Error((await response.json()).error.message);
      const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');
      link.href=url;link.download=response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]||'pdv-backup.sqlite';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('Backup criado. Guarde também uma cópia em um pen drive ou outro disco.');
    }catch(e){setMessage(e instanceof Error?e.message:'Falha no backup');}finally{setBusy(false);}
  }
  async function restore(file?:File) {
    if(!file)return;
    if(!window.confirm('Restaurar este backup? Os dados atuais serão substituídos. Uma cópia de segurança será criada antes.'))return;
    setBusy(true);setMessage('');
    try{
      const response=await fetch('/api/restore',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
      const result=await response.json();if(!response.ok)throw Error(result.error.message);
      window.location.reload();
    }catch(e){setMessage(e instanceof Error?e.message:'Falha ao restaurar');}finally{setBusy(false);}
  }
  return <details className="bg-white border rounded-xl p-3 mb-4 text-sm">
    <summary className="font-bold cursor-pointer">Backup e restauração — SQLite local</summary>
    <p className="my-2">Backup automático ao iniciar e a cada hora de uso. Os 30 mais recentes ficam em dados/backups.</p>
    <div className="flex flex-wrap gap-3 items-center">
      <button disabled={busy} onClick={backup} className="bg-cafe-primary text-white rounded px-4 py-2">{busy?'Aguarde...':'Baixar backup agora'}</button>
      <label className="border rounded px-4 py-2 cursor-pointer">Restaurar backup <input aria-label="Restaurar backup" type="file" accept=".sqlite" disabled={busy} onChange={e=>{void restore(e.target.files?.[0]);e.target.value='';}} /></label>
    </div>
    {message&&<p role="status" className="mt-2">{message}</p>}
  </details>;
}
