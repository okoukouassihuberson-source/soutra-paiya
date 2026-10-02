const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;console.log('✅',m);} else {fail++;console.log('❌',m);} };
(async()=>{
  const b=await chromium.launch({...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),args:['--no-sandbox']});
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
  const session={access_token:'a.b.c',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:'u1',aud:'authenticated',email:'a@b.ci',role:'authenticated'}};
  await ctx.addCookies([{name:'sb-127-auth-token',value:encodeURIComponent(JSON.stringify(session)),domain:'localhost',path:'/'}]);
  const errs=[]; const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  // ---- FR fiche voyage
  await p.goto('http://localhost:3100/voyages/t1',{waitUntil:'networkidle'});
  ok((await p.textContent('h1')).includes('Week-end à Bassam'),'fiche FR : titre');
  ok(await p.locator('text=Offres disponibles').count()>0,'bloc « Offres disponibles » affiché');
  ok(await p.locator('text=Couple -10%').count()>0,'offre couple listée');
  ok(await p.locator('text=Confort').count()>0,'formules affichées');
  const totalTxt=async()=>(await p.locator('form').first().innerText());
  ok((await totalTxt()).replace(/\s/g,'').includes('100000FCFA')||(await totalTxt()).includes('100 000'),'prix 1 personne = 100 000');
  // 2 participants -> offre auto couple
  await p.fill('input[type=number]','2'); await p.waitForTimeout(900);
  let t=await totalTxt();
  ok(/appliquée automatiquement/.test(t),'2 personnes : offre couple appliquée automatiquement');
  ok(/180[\s  ]?000/.test(t),'total remisé 180 000 (200 000 − 10 %)');
  ok(/Prix avant réduction/.test(t) && /Réduction/.test(t),'lignes avant / réduction');
  // code inconnu
  await p.fill('#promo-code','NOPE'); await p.click('text=Appliquer'); await p.waitForTimeout(900);
  ok(/n’existe pas/.test(await totalTxt()),'code inconnu : message');
  // code valide, casse ignorée
  await p.fill('#promo-code','bienvenue'); await p.click('text=Appliquer'); await p.waitForTimeout(900);
  t=await totalTxt(); ok(/Bienvenue -20%/.test(t) && /160[\s  ]?000/.test(t),'code BIENVENUE : 160 000');
  // formule Confort
  await p.click('text=Confort'); await p.waitForTimeout(900); t=await totalTxt();
  ok(/240[\s  ]?000/.test(t),'formule Confort ×2 avec −20 % = 240 000');
  // réserver
  await p.click('button:has-text("Réserver")'); await p.waitForSelector('[role=status]',{timeout:5000});
  ok(/TRP-TEST/.test(await p.locator('[role=status]').innerText()),'réservation enregistrée (référence)');
  ok(await p.locator('a:has-text("Payer")').count()>0,'lien de paiement proposé');
  // code limité
  await p.goto('http://localhost:3100/voyages/t1',{waitUntil:'networkidle'});
  await p.fill('#promo-code','LIMITE'); await p.click('text=Appliquer'); await p.waitForTimeout(500);
  await p.click('button:has-text("Réserver")'); await p.waitForSelector('[role=status]',{timeout:5000});
  ok(/Trop d’essais/.test(await p.locator('[role=status]').innerText()),'{ error: PROMO_RATE_LIMITED } affiché sans réservation');
  const log=await (await fetch('http://127.0.0.1:9201/__log')).json();
  ok(log.filter(l=>l.includes('create_trip_booking')&&l.includes('"p_promo_code":"BIENVENUE"')).length>=1,'le code est transmis au serveur (le prix reste calculé côté serveur)');
  // ---- EN
  await p.goto('http://localhost:3100/en/voyages/t1',{waitUntil:'networkidle'});
  ok((await p.textContent('h1')).includes('Bassam weekend'),'fiche EN : titre traduit');
  ok(await p.locator('text=Couple -10% EN').count()>0,'offre traduite EN');
  ok(await p.locator('text=Promo code').count()>0,'interface EN (Promo code)');
  // ---- Assistant
  await p.goto('http://localhost:3100/assistant',{waitUntil:'networkidle'});
  ok((await p.textContent('h1')).includes('Assistant voyage'),'page assistant (connecté)');
  await p.fill('input[aria-label]','week-end pas cher'); await p.click('button:has-text("Envoyer")'); await p.waitForSelector('text=week-end à Bassam');
  ok(await p.locator('a[href="/voyages/t1"]').count()>0,'fiche cliquable sous la réponse');
  await p.fill('input[aria-label]','encore'); await p.click('button:has-text("Envoyer")'); await p.waitForTimeout(600);
  await p.fill('input[aria-label]','et encore'); await p.click('button:has-text("Envoyer")'); await p.waitForSelector('text=limite',{timeout:5000}).catch(()=>{});
  ok(/limite de questions/.test(await p.locator('ol').innerText()),'limite quotidienne : message');
  // ---- pas de débordement horizontal mobile
  for (const u of ['/voyages/t1','/promotions','/assistant']) { await p.goto('http://localhost:3100'+u,{waitUntil:'networkidle'}); const w=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth); ok(w<=0,`pas de défilement horizontal sur ${u} (390 px)`); }
  const real=errs.filter(e=>!/favicon|Failed to load resource.*(404|429)/.test(e)); ok(real.length===0,'aucune erreur JS/console'+(real.length?' : '+real.slice(0,3).join(' | '):''));
  await b.close(); console.log(`\n${pass} ok, ${fail} échec(s)`); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
