import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { createApp } from '../server/index.mjs';
import { insert } from '../server/db.mjs';
const directory=mkdtempSync(join(tmpdir(),'pdv-browser-'));let browser,app;
try {
  app=createApp({directory,port:0,catalog:false});insert(app.db,'controle_caixa',{fundo_inicial:100});
  insert(app.db,'produtos',{nome:'Café E2E',preco_venda:5,preco_custo:2,quantidade_estoque:10});
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const base=`http://127.0.0.1:${app.server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.PDV_CHROMIUM?{executablePath:process.env.PDV_CHROMIUM}:{})});
  const page=await browser.newPage({acceptDownloads:true});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  page.on('request',r=>{assert.ok(r.url().startsWith(base)||r.url().startsWith('data:'),'Requisição externa: '+r.url());});
  await page.goto(base);await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('input[type=password]').count(),0);assert.equal(await page.getByRole('button',{name:/Entrar|Criar conta|Sair/}).count(),0);
  await page.getByText('Café E2E',{exact:true}).click();
  console.log('Acesso direto e produto no PDV: OK');
  for(const label of ['Comandas','Dashboard','Fichas','Revenda','Estoque','Financeiro','Rendimentos','Vendas','PDV Caixa']) {
    await page.getByRole('navigation').getByRole('button',{name:label,exact:true}).click();await page.waitForLoadState('networkidle');
    assert.ok((await page.locator('main').innerText()).length>100);console.log(`Módulo ${label}: OK`);
  }
  const summary=page.locator('summary');await summary.click();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar backup agora'}).click();const download=await downloadPromise;
  const backup=join(directory,'download.sqlite');await download.saveAs(backup);assert.equal(readFileSync(backup).subarray(0,15).toString(),'SQLite format 3');
  // Simula mudança após o backup e verifica restauração pelo seletor real da interface.
  app.db.prepare("UPDATE produtos SET nome='Alterado depois do backup'").run();
  page.on('dialog',dialog=>dialog.accept());
  await page.getByLabel('Restaurar backup',{exact:true}).setInputFiles(backup);await page.waitForLoadState('networkidle');
  await page.waitForFunction(()=>document.body.innerText.includes('Café E2E'));
  assert.equal(app.db.prepare('SELECT nome FROM produtos').get().nome,'Café E2E');
  assert.deepEqual(errors,[]);console.log('Download e restauração pelo navegador: OK');
  console.log('E2E concluído: 9 módulos, sem login, sem requisições externas, backup e restauração.');
}finally {
  await browser?.close();if(app?.server.listening){app.server.close();await once(app.server,'close');}else app?.close();rmSync(directory,{recursive:true,force:true});
}
