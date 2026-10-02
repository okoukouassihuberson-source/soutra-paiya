const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
let pass=0,fail=0; const ok=(c,m)=>{ if(c){pass++;console.log('✅',m);} else {fail++;console.log('❌',m);} };
(async()=>{
  const b=await chromium.launch({...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),args:['--no-sandbox']});
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:1100,height:900}});
  const session={access_token:'a.b.c',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:'u1',aud:'authenticated',email:'a@b.ci',role:'authenticated'}};
  await ctx.addCookies([{name:'sb-127-auth-token',value:encodeURIComponent(JSON.stringify(session)),domain:'localhost',path:'/'}]);
  const errs=[]; const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://localhost:3100/organisateur',{waitUntil:'networkidle'});
  ok(await p.locator('text=Votre commission').count()>0,'bandeau commission');
  ok(/10 %/.test(await p.locator('text=Votre commission').first().innerText()) && /8 %/.test(await p.locator('text=Votre commission').first().innerText()),'taux 10 % / 8 % affichés');
  await p.click('button[role=tab]:has-text("Offres")'); await p.waitForSelector('text=Aucune offre pour le moment');
  ok(true,'onglet Offres : liste vide');
  await p.click('text=+ Nouvelle offre');
  // type couple : pas de champs participants
  await p.selectOption('select >> nth=0','couple');
  ok(await p.locator('input[name=min_participants]').count()===0,'couple : champs participants masqués (fixés à 2)');
  await p.fill('input[name=title]','Couple été'); await p.fill('input[name=discount_value]','15');
  await p.click('button:has-text("Créer l’offre")'); await p.waitForSelector('li:has-text("Couple été")',{timeout:8000});
  ok(true,'offre créée et listée');
  let posts=await (await fetch('http://127.0.0.1:9201/__posts')).json();
  ok(posts[0].kind==='couple'&&posts[0].min_participants===2&&posts[0].max_participants===2&&posts[0].owner_id==='u1'&&posts[0].applies_to==='both','charge utile : couple 2–2, propriétaire = utilisateur, cible « tous »');
  // % > 90 -> message
  await p.click('text=+ Nouvelle offre'); await p.fill('input[name=title]','Trop'); await p.fill('input[name=discount_value]','95');
  await p.click('button:has-text("Créer l’offre")'); await p.waitForSelector('form [role=alert]');
  const al=await p.locator('form [role=alert]').allInnerTexts(); ok(al.some(x=>/entre 1 et 90/.test(x)),'95 % : message en français');
  // code en double
  await p.fill('input[name=discount_value]','10'); await p.fill('input[name=code]','dup');
  await p.click('button:has-text("Créer l’offre")'); await p.waitForTimeout(500);
  ok(/déjà utilisé/.test(await p.locator('form [role=alert]').first().innerText()),'code en double : message');
  await p.click('text=Annuler');
  // flash : date de fin requise (HTML5)
  await p.click('text=+ Nouvelle offre'); await p.selectOption('select >> nth=0','flash');
  ok(await p.locator('input[name=valid_until]').getAttribute('required')!==null,'vente flash : date de fin obligatoire');
  await p.click('text=Annuler');
  // désactiver / supprimer
  await p.click('text=Désactiver'); await p.waitForSelector('text=Désactivée');
  ok(true,'désactivation');
  p.once('dialog',d=>d.accept()); await p.click('text=Supprimer'); await p.waitForSelector('text=Aucune offre pour le moment');
  ok(true,'suppression avec confirmation');
  const real=errs.filter(e=>!/favicon/.test(e)); ok(real.length===0,'aucune erreur JS'+(real.length?' : '+real[0]:''));
  await b.close(); console.log(`\n${pass} ok, ${fail} échec(s)`); process.exit(fail?1:0);
})().catch(e=>{console.error(e.message);process.exit(2);});
