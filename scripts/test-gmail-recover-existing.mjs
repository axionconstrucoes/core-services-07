import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverExisting } from './gmail-recover-existing.mjs';
import { RECOVERY as R, recoveryOptions, assertRecoveryAuthorization, isRecoveryRow } from './lib/gmail-recovery-policy.mjs';
const authRow = {project_id:R.projectId,account_email:R.mailbox,user_id:'titular',decided_by_user_id:'titular',decided_at:'2026-11-11T13:50:01Z',requested_at:'2026-11-11T13:40:00Z',status:'AUTORIZADO'};
const row = (id='e1', extra={}) => ({id,project_id:R.projectId,mailbox_address:R.mailbox,provider:'GMAIL',provider_message_id:id,from_address:'bmancino@weg.net',sent_at:'2026-10-01T12:00:00Z',body_text:null,body_html:null,...extra});
function fixture(rows=[row()], {profile=R.mailbox, status='AUTORIZADO', failRead=false, revokeAfterRead=false, messageFrom='Bruna <bmancino@weg.net>', gmailFailure=null, failAttachmentsQuery=false, ingestStatus='INGESTED', internalDateOverride=null, parts=[{filename:'arquivo.pdf',attachmentId:'a',size:3,mimeType:'application/pdf'}], idsPerRead=false, seedAttachments=[], bucket={allowed_mime_types:['application/pdf','image/png'],file_size_limit:52428800}, attachmentBytes='abc', ingestError=undefined}={}) {
 const calls={reads:0,writes:0,ingest:0};
 const tables={project_email_ingestion_configs:[{id:'c',project_id:R.projectId,enabled:true}],project_email_ingestion_mailboxes:[{config_id:'c',mailbox_address:R.mailbox,enabled:true}],email_access_authorizations:[{...authRow,status}],emails:rows,email_attachments:[...seedAttachments]};
 class Query {
  constructor(table){this.table=table;this.filters=[];this.span=null;this.one=false;this.payload=null;}
  select(fields, options){this.head=options?.head;return this;}
  eq(k,v){this.filters.push(r=>r[k]===v);return this;}
  is(k,v){this.filters.push(r=>r[k]===v);return this;}
  ilike(k,v){this.filters.push(r=>String(r[k]).toLowerCase().endsWith(v.slice(1).toLowerCase()));return this;}
  gte(k,v){this.filters.push(r=>Date.parse(r[k])>=Date.parse(v));return this;}
  lte(k,v){this.filters.push(r=>Date.parse(r[k])<=Date.parse(v));return this;}
  or(value){const k=value.split('.')[0];this.filters.push(r=>!r[k]);return this;}
  order(){return this;}
  range(a,b){this.span=[a,b];return this;}
  single(){this.one=true;return this;}
  update(payload){this.payload=payload;return this;}
  then(resolve,reject){try {
   if(failAttachmentsQuery && this.table==='email_attachments') return Promise.resolve({error:{code:'42501',message:'permission denied para conteudo secreto'},data:null}).then(resolve,reject);
   if(failRead && this.table==='project_email_ingestion_configs') return Promise.resolve({error:{message:'blocked'},data:null}).then(resolve,reject);
   let data=tables[this.table].filter(r=>this.filters.every(f=>f(r)));
   const count=data.length;
   if(this.span)data=data.slice(this.span[0],this.span[1]+1);
   if(this.payload){calls.writes+=data.length;for(const r of data)Object.assign(r,this.payload);}
   return Promise.resolve({data:this.one?data[0]:data,error:null,count}).then(resolve,reject);
  }catch(e){return Promise.reject(e).then(resolve,reject);}}
 }
 const supabase={from:t=>new Query(t),storage:{getBucket:async()=>({data:bucket,error:null})}};
 const gmail={users:{getProfile:async()=>({data:{emailAddress:profile}}),messages:{get:async({id})=>{calls.reads++;if(gmailFailure)throw gmailFailure;if(revokeAfterRead)tables.email_access_authorizations[0].status='REVOGADO';return {data:{id,internalDate:String(Date.parse('2026-10-01T12:00:00Z')),payload:{mimeType:'text/plain',headers:[{name:'From',value:messageFrom}],body:{data:Buffer.from('corpo completo').toString('base64url')},parts:parts.map((p)=>({filename:p.filename,body:{attachmentId:idsPerRead?p.attachmentId+'-'+calls.reads:p.attachmentId,size:p.size},mimeType:p.mimeType}))}}};},attachments:{get:async()=>({data:{data:Buffer.from(attachmentBytes).toString('base64url')}})}}}};
 const ingestAttachments=async()=>{calls.ingest++;tables.email_attachments.push({email_id:'e1',project_id:R.projectId,gmail_attachment_id:'a'});return [{status:ingestStatus,error:ingestError}];};
 const run=(apply=false,kind='bodies',limit=10,probe=false)=>recoverExisting({supabase,gmail,ingestAttachments,options:{apply,kind,limit,probe}});
 return {run,calls,tables};
}
test('dry-run: corpo verificado sem gravação',async()=>{const f=fixture();const s=await f.run();assert.equal(s.corpos,1);assert.equal(f.calls.writes,0);assert.equal(f.calls.ingest,0);});
test('apply preenche corpo uma vez; repetição não lê nem grava novamente',async()=>{const f=fixture();assert.equal((await f.run(true)).corpos,1);const n=f.calls.reads;assert.equal((await f.run(true)).candidatas,0);assert.equal(f.calls.reads,n);assert.equal(f.calls.writes,1);});
test('exclui outra obra, caixa ausente, remetente externo e período externo',async()=>{const f=fixture([row(),row('p',{project_id:'outra'}),row('n',{mailbox_address:null}),row('s',{from_address:'outra@outro.net'}),row('t',{sent_at:'2024-01-01T00:00:00Z'})]);const s=await f.run();assert.equal(s.analisadas,1);assert.equal(s.sem_caixa_excluidas,1);});
test('credencial de outra caixa bloqueia antes de ler',async()=>{const f=fixture(undefined,{profile:'outra@axion.com.br'});await assert.rejects(f.run(),/outra caixa/);assert.equal(f.calls.reads,0);});
test('aceite revogado ou falha de banco bloqueiam antes de ler',async()=>{for(const opts of [{status:'REVOGADO'},{failRead:true}]){const f=fixture(undefined,opts);await assert.rejects(f.run());assert.equal(f.calls.reads,0);}});
test('revogação após leitura impede gravação do corpo',async()=>{const f=fixture(undefined,{revokeAfterRead:true});const s=await f.run(true);assert.equal(s.falhas,1);assert.equal(f.calls.writes,0);});
test('remetente real diferente do banco impede gravação',async()=>{const f=fixture(undefined,{messageFrom:'externo@outro.net'});assert.equal((await f.run(true)).falhas,1);assert.equal(f.calls.writes,0);});
test('anexos: dry-run não ingere; apply ingere e repetição reconhece existentes',async()=>{const f=fixture();assert.equal((await f.run(false,'attachments')).anexos_pendentes,1);assert.equal(f.calls.ingest,0);assert.equal((await f.run(true,'attachments')).anexos_gravados,1);assert.equal((await f.run(true,'attachments')).anexos_existentes,1);assert.equal(f.calls.ingest,1);});
test('limite impede leituras adicionais',async()=>{const f=fixture([row('a'),row('b')]);const s=await f.run(false,'bodies',1);assert.equal(s.restantes,1);assert.equal(f.calls.reads,1);});
test('paginação estável inclui mensagens depois da primeira página',async()=>{const f=fixture(Array.from({length:501},(_,i)=>row(String(i))));const s=await f.run(false,'bodies',501);assert.equal(s.analisadas,501);});
test('argumentos inválidos e repetidos falham',()=>{for(const args of [[],['--kind=bodies','--limit=0'],['--kind=bodies','--limit=1001'],['--kind=bodies','--kind=attachments'],['--kind=bodies','--project=outro']])assert.throws(()=>recoveryOptions(args));assert.equal(recoveryOptions(['--kind=attachments']).apply,false);});
test('aceite mais recente prevalece sobre autorização antiga',()=>{assert.throws(()=>assertRecoveryAuthorization({project_id:R.projectId,enabled:true},[{mailbox_address:R.mailbox,enabled:true}],[authRow,{...authRow,status:'REVOGADO',requested_at:'2026-11-11T14:00:00Z'}]));assert.equal(isRecoveryRow(row('x',{from_address:'x@weg.net.exemplo'})),false);});
test('diagnóstico de falha: etapa, id técnico e código sanitizado, sem conteúdo',async()=>{
 const f=fixture(undefined,{messageFrom:'Bruna <bmancino@weg.net> <outra@weg.net>'});
 const s=await f.run(false,'attachments');
 assert.equal(s.falhas,1);
 assert.deepEqual(s.falhas_detalhe,[{etapa:'validar_remetente',email_id:'e1',codigo:'REMETENTE_COM_2_ENDERECOS'}]);
 assert.ok(!JSON.stringify(s).match(/weg\.net|Bruna|outra@/i));
});
test('classificador nunca devolve mensagem bruta do provedor',async()=>{
 const { safeFailureCode } = await import('./lib/gmail-recovery-diagnostics.mjs');
 assert.equal(safeFailureCode({response:{status:404},message:'assunto secreto'}),'HTTP_404');
 assert.equal(safeFailureCode({message:'Mensagem fora da obra, caixa ou período congelado.'}),'FORA_DO_ESCOPO_CONGELADO');
 assert.equal(safeFailureCode(new Error('texto livre com corpo do e-mail')),'ERRO_ERROR');
 assert.equal(safeFailureCode({code:'ECONNRESET'}),'CODIGO_ECONNRESET');
});
test('etapas distinguidas: leitura do Gmail x consulta de anexos x gravação, sem expor conteúdo',async()=>{
 const gmailErr=Object.assign(new Error('assunto secreto do provedor'),{response:{status:403}});
 let f=fixture(undefined,{gmailFailure:gmailErr});
 let s=await f.run(false,'attachments');
 assert.deepEqual(s.falhas_detalhe,[{etapa:'gmail_get',email_id:'e1',codigo:'HTTP_403'}]);
 f=fixture(undefined,{failAttachmentsQuery:true});
 s=await f.run(false,'attachments');
 assert.deepEqual(s.falhas_detalhe,[{etapa:'consultar_anexos',email_id:'e1',codigo:'DB_42501'}]);
 f=fixture(undefined,{ingestStatus:'FAILED'});
 s=await f.run(true,'attachments');
 assert.deepEqual(s.falhas_detalhe,[{etapa:'recuperar_gravar_anexos',email_id:'e1',codigo:'FALHA_INGEST_NAO_CLASSIFICADO'}]);
 for(const out of [JSON.stringify(s)]) assert.ok(!/secreto|permission|weg\.net|Bruna/i.test(out));
});
test('falha de consulta de anexos não derruba a execução inteira, mas autorização revogada derruba',async()=>{
 const f=fixture(undefined,{failAttachmentsQuery:true});
 const s=await f.run(false,'attachments');
 assert.equal(s.falhas,1);
 const g=fixture(undefined,{status:'REVOGADO'});
 await assert.rejects(g.run(false,'attachments'));
 assert.equal(g.calls.reads,0);
});

const notFound=()=>Object.assign(new Error('assunto secreto do provedor'),{response:{status:404}});
test('404 na leitura do Gmail: pendência, não falha; conclusão com pendência e registro preservado',async()=>{
 const f=fixture([row('a'),row('b')],{gmailFailure:notFound()});
 const s=await f.run(true,'attachments');
 assert.equal(s.falhas,0);assert.equal(s.indisponiveis_no_provedor,2);
 assert.deepEqual(s.indisponiveis_detalhe[0],{etapa:'gmail_get',email_id:'a',codigo:'HTTP_404'});
 assert.equal(s.conclusao,'CONCLUIDO_COM_PENDENCIA');
 assert.equal(f.calls.writes,0);assert.equal(f.calls.ingest,0);assert.equal(f.tables.emails.length,2);
 assert.ok(!/secreto|weg\.net|Bruna/i.test(JSON.stringify(s)));
});
test('404 só vale na leitura do Gmail: nas demais etapas continua falha',async()=>{
 const { isProviderMessageUnavailable } = await import('./lib/gmail-recovery-diagnostics.mjs');
 const e=notFound();
 assert.equal(isProviderMessageUnavailable('gmail_get',e),true);
 for(const stage of ['validar_mensagem','validar_remetente','consultar_anexos','recuperar_gravar_anexos','extrair_corpo'])assert.equal(isProviderMessageUnavailable(stage,e),false);
 for(const status of [400,401,403,429,500,503])assert.equal(isProviderMessageUnavailable('gmail_get',Object.assign(new Error('x'),{response:{status}})),false);
 assert.equal(isProviderMessageUnavailable('gmail_get',Object.assign(new Error('x'),{recoveryDb:true,code:'DB_404'})),false);
 assert.equal(isProviderMessageUnavailable('gmail_get',new Error('Mensagem fora da obra, caixa ou período congelado.')),false);
});
test('um 404 não mascara as demais mensagens: restantes seguem e falhas reais continuam falhas',async()=>{
 const f=fixture([row('a'),row('b')],{gmailFailure:null});
 const original=f.run;
 const s=await original(false,'attachments');
 assert.equal(s.conclusao,'CONCLUIDO');assert.equal(s.indisponiveis_no_provedor,0);
 const g=fixture(undefined,{failAttachmentsQuery:true});
 assert.equal((await g.run(false,'attachments')).conclusao,'FALHA');
});
test('autenticação, permissão e revogação não são tratadas como mensagem indisponível',async()=>{
 for(const status of [401,403]){
  const f=fixture(undefined,{gmailFailure:Object.assign(new Error('x'),{response:{status}})});
  const s=await f.run(false,'attachments');
  assert.equal(s.indisponiveis_no_provedor,0);assert.equal(s.falhas,1);assert.equal(s.conclusao,'FALHA');
 }
 const g=fixture(undefined,{status:'REVOGADO',gmailFailure:notFound()});
 await assert.rejects(g.run(false,'attachments'));assert.equal(g.calls.reads,0);
 const h=fixture(undefined,{revokeAfterRead:true});
 assert.equal((await h.run(true)).conclusao,'FALHA');
});

const seed=(over={})=>({email_id:'e1',project_id:R.projectId,gmail_attachment_id:'antigo',original_file_name:'arquivo.pdf',mime_type:'application/pdf',file_size_bytes:3,sha256_hash:'0'.repeat(64),...over});
test('dry-run reflete anexos já recuperados mesmo com attachmentId diferente (casamento por metadados)',async()=>{
 const f=fixture(undefined,{seedAttachments:[seed()]});
 const s=await f.run(false,'attachments');
 assert.equal(s.anexos_ja_recuperados_por_metadados,1);assert.equal(s.anexos_pendentes,0);assert.equal(s.anexos_existentes,1);
});
test('casamento nunca cruza e-mails nem projetos; ambíguo vira indeterminado e sem tamanho não casa',async()=>{
 let f=fixture(undefined,{seedAttachments:[seed({email_id:'outro'})]});
 let s=await f.run(false,'attachments');assert.equal(s.anexos_pendentes,1);assert.equal(s.anexos_ja_recuperados_por_metadados,0);
 f=fixture(undefined,{seedAttachments:[seed({project_id:'outra'})]});
 s=await f.run(false,'attachments');assert.equal(s.anexos_pendentes,1);
 f=fixture(undefined,{parts:[{filename:'a.pdf',attachmentId:'x',size:3,mimeType:'application/pdf'},{filename:'a.pdf',attachmentId:'y',size:3,mimeType:'application/pdf'}],seedAttachments:[seed({original_file_name:'a.pdf'})]});
 s=await f.run(false,'attachments');assert.equal(s.anexos_indeterminados,2);assert.equal(s.anexos_pendentes,0);
 f=fixture(undefined,{parts:[{filename:'a.pdf',attachmentId:'x',size:0,mimeType:'application/pdf'}],seedAttachments:[seed({original_file_name:'a.pdf',file_size_bytes:0})]});
 s=await f.run(false,'attachments');assert.equal(s.anexos_indeterminados,1);
});
test('arquivos iguais em e-mails distintos continuam pendentes em cada e-mail (sem desduplicação entre e-mails)',async()=>{
 const f=fixture([row('e1'),row('e2')],{seedAttachments:[seed({email_id:'e1'})]});
 const s=await f.run(false,'attachments');
 assert.equal(s.anexos_ja_recuperados_por_metadados,1);assert.equal(s.anexos_pendentes,1);
});
test('apply só envia ao ingest o que não está comprovadamente recuperado',async()=>{
 const f=fixture(undefined,{seedAttachments:[seed()]});
 const s=await f.run(true,'attachments');
 assert.equal(f.calls.ingest,0);assert.equal(s.anexos_existentes,1);assert.equal(s.falhas,0);
});
test('classificação sanitizada das falhas do ingest: código fechado, sem texto bruto',async()=>{
 const { classifyIngestError } = await import('./lib/gmail-recovery-diagnostics.mjs');
 const cases=[
  ['Falha ao salvar anexo no Supabase Storage: mime type application/zip is not supported','STORAGE_MIME_NAO_PERMITIDO'],
  ['Falha ao salvar anexo no Supabase Storage: The object exceeded the maximum allowed size','STORAGE_TAMANHO'],
  ['Falha ao salvar anexo no Supabase Storage: Invalid key: x/y','STORAGE_NOME_INVALIDO'],
  ['Falha ao gravar metadata do anexo: new row for relation "email_attachments" violates check constraint "email_attachments_file_size_bytes_check"','BANCO_CHECK_TAMANHO'],
  ['Falha ao gravar metadata do anexo: duplicate key value violates unique constraint "email_attachments_storage_bucket_storage_path_key"','BANCO_UNICO_CAMINHO'],
  ['Falha ao registrar auditoria de ingestão de anexo: x','GRAVAR_AUDITORIA'],
  ['Request failed with status code 429','DOWNLOAD_HTTP_429'],
  ['texto livre com assunto secreto','INGEST_NAO_CLASSIFICADO'],
 ];
 for(const [raw,code] of cases)assert.equal(classifyIngestError(raw),code);
 const f=fixture(undefined,{ingestStatus:'FAILED',ingestError:'Falha ao salvar anexo no Supabase Storage: mime type application/zip secreto.zip'});
 const s=await f.run(true,'attachments');
 assert.deepEqual(s.falhas_detalhe,[{etapa:'recuperar_gravar_anexos',email_id:'e1',codigo:'FALHA_STORAGE_MIME_NAO_PERMITIDO'}]);
 assert.ok(!/secreto|zip/i.test(JSON.stringify(s)));
});
test('sondagem: attachmentIds mudam entre leituras? só contagens, sem gravar',async()=>{
 let f=fixture(undefined,{idsPerRead:true});
 let s=await f.run(false,'attachments',10,true);
 assert.equal(s.probe.partes_comparadas,1);assert.equal(s.probe.ids_diferentes,1);assert.equal(s.probe.ids_iguais,0);
 assert.equal(f.calls.writes,0);assert.equal(f.calls.ingest,0);
 f=fixture();
 s=await f.run(false,'attachments',10,true);
 assert.equal(s.probe.ids_iguais,1);assert.equal(s.probe.ids_diferentes,0);
});
test('sondagem classifica sem gravar: MIME fora do bucket, tamanho zero, excedido, duplicado no e-mail, gravável',async()=>{
 const parts=[
  {filename:'a.zip',attachmentId:'1',size:10,mimeType:'application/zip'},
  {filename:'b.pdf',attachmentId:'2',size:0,mimeType:'application/pdf'},
  {filename:'c.pdf',attachmentId:'3',size:99999999,mimeType:'application/pdf'},
  {filename:'d.pdf',attachmentId:'4',size:3,mimeType:'application/pdf'},
  {filename:'e.pdf',attachmentId:'5',size:3,mimeType:'application/pdf'},
 ];
 const f=fixture(undefined,{parts});
 const s=await f.run(false,'attachments',10,true);
 assert.deepEqual(s.probe.classes,{MIME_NAO_PERMITIDO:1,TAMANHO_DECLARADO_ZERO:1,TAMANHO_EXCEDIDO:1,GRAVAVEL:1,DUPLICADO_NO_MESMO_EMAIL:1});
 assert.deepEqual(s.probe.mime_nao_permitidos,{'application/zip':1});
 assert.equal(f.calls.writes,0);assert.equal(f.calls.ingest,0);
 assert.ok(!/a\.zip|b\.pdf|arquivo/i.test(JSON.stringify(s)));
});
test('sondagem não existe com apply nem para corpos; revogação continua abortando antes de ler',async()=>{
 assert.throws(()=>recoveryOptions(['--kind=attachments','--apply','--probe']));
 assert.throws(()=>recoveryOptions(['--kind=bodies','--probe']));
 assert.equal(recoveryOptions(['--kind=attachments','--probe']).probe,true);
 const g=fixture(undefined,{status:'REVOGADO'});
 await assert.rejects(g.run(false,'attachments',10,true));assert.equal(g.calls.reads,0);
});
test('mesmo conteúdo já gravado no e-mail é reconhecido na sondagem como duplicado, sem tocar outro e-mail',async()=>{
 const { createHash } = await import('node:crypto');
 const hash=createHash('sha256').update('abc').digest('hex');
 const f=fixture([row('e1'),row('e2')],{seedAttachments:[seed({email_id:'e1',gmail_attachment_id:'z',original_file_name:'outro.pdf',sha256_hash:hash})]});
 const s=await f.run(false,'attachments',10,true);
 assert.equal(s.probe.classes.DUPLICADO_NO_MESMO_EMAIL,1);assert.equal(s.probe.classes.GRAVAVEL,1);
});
