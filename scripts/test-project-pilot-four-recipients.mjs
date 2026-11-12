import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-module-resolver.mjs', import.meta.url);
const p = await import('../apps/web/lib/email/project-pilot-profile');
const { FakeEmailProvider } = await import('../apps/web/lib/email/fake-email-provider');
const { buildMimeMessage } = await import('../apps/web/lib/email/mime-message');
const WEG = '00000000-0000-4000-8000-000000000001';
const env = { ACC_PROJECT_PILOT_PROJECT_ID: WEG, ACC_PROJECT_PILOT_DESTINATION: 'axion@axion.com.br', ACC_PROJECT_PILOT_SENDER: 'crm@axion.com.br', ACC_PROJECT_PILOT_TEST_GROUP: 'WEG_INTERNAL_FOUR' };
const expected = ['crm@axion.com.br','reynaldo@axion.com.br','jaime.ramos@axion.com.br','carlos.evandro@axion.com.br'];
const message = { to: 'cliente@weg.net', subject: 'Alerta', text: 'Conteúdo', html: '<body>Conteúdo</body>', correlationId: 'test-four', pilot: { projectId: WEG }, cc:'outro@externo.invalid', bcc:'outro@externo.invalid' };
assert.deepEqual([...p.WEG_INTERNAL_TEST_RECIPIENTS], expected);
const profile = p.resolveProjectPilotProfile(env);
assert.equal(profile.valid, true);
assert.equal(profile.destination, expected.join(', '));
for (const patch of [{ACC_PROJECT_PILOT_TEST_GROUP:'qualquer'}, {ACC_PROJECT_PILOT_PROJECT_ID:'11111111-1111-4111-8111-111111111111'}, {ACC_PROJECT_PILOT_SENDER:'externo@weg.net'}]) assert.equal(p.resolveProjectPilotProfile({...env,...patch}).valid,false);
const legacy = {...env};delete legacy.ACC_PROJECT_PILOT_TEST_GROUP;
assert.equal(p.resolveProjectPilotProfile(legacy).destination,'axion@axion.com.br');
const routing=p.applyProjectPilotProfile(message, env);
assert.equal(routing.input.to,expected.join(', '));
assert.equal(routing.sender,'crm@axion.com.br');
assert.equal(routing.input.cc,undefined);assert.equal(routing.input.bcc,undefined);
assert.ok(routing.input.subject.startsWith('[PILOTO]'));
assert.ok(routing.input.text.includes('grupo interno de quatro testadores'));
assert.equal(p.resolveProjectPilotReplyMailbox(WEG,env),'crm@axion.com.br');
const mime=buildMimeMessage(routing.input,'crm@axion.com.br','<four@axion.invalid>');
p.assertPilotMimeRecipients(mime,routing.sender,routing.destination);
for(const changed of [mime.replace('To: crm@axion.com.br,','To: externo@weg.net,'),mime.replace('To: crm@axion.com.br,','To: crm@axion.com.br, crm@axion.com.br,'),mime.replace('To: crm@axion.com.br,','Bcc: externo@weg.net\r\nTo: crm@axion.com.br,')]) assert.throws(()=>p.assertPilotMimeRecipients(changed,routing.sender,routing.destination));
const other={...message,pilot:{projectId:'11111111-1111-4111-8111-111111111111'}};
assert.equal(p.applyProjectPilotProfile(other,env).input,other);
const saved={...process.env};
try {
 for (const mode of ['pilot','production']) {
  Object.assign(process.env,env,{ACC_OUTBOUND_MODE:mode,ACC_PILOT_RECIPIENT:'crm@axion.com.br',ACC_EMAIL_ONLY_RECIPIENT:'crm@axion.com.br'});
  let captured;
  await new FakeEmailProvider({onGuardedInput:input=>{captured=input;}}).send(message);
  assert.equal(captured.to,expected.join(', '));assert.equal(captured.cc,undefined);assert.equal(captured.bcc,undefined);
 }
} finally {for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
console.log('Grupo interno WEG: destinatários exatos, isolamento, MIME e transporte fake aprovados.');
