const http=require('http'),url=require('url');
const trip={id:'11111111-1111-1111-1111-111111111111',slug:'t1',organizer_id:'o1',scope:'national',title:'Week-end à Bassam',summary:'Plage et histoire',description:'Deux jours',destination_id:null,country:"Côte d'Ivoire",country_code:'CI',continent:null,city:'Grand-Bassam',cover_url:null,gallery_urls:[],starts_on:'2027-03-10',ends_on:'2027-03-12',duration_days:3,base_price_xof:100000,deposit_pct:30,seats_total:10,seats_booked:2,departure_point:'Abidjan Plateau',departure_time:'07:00:00',return_time:null,transport:null,lodging:null,meals:null,activities:[],inclusions:['Transport'],exclusions:[],conditions:null,contact_phone:null,contact_whatsapp:null,contact_email:null,highlight:null,is_circuit:false,status:'published',i18n:{en:{title:'Bassam weekend'}}};
const pkgs=[{id:'p1',trip_id:trip.id,code:'essentielle',name:'Essentielle',description:null,includes:['Transport'],price_xof:100000,position:1,i18n:null},{id:'p2',trip_id:trip.id,code:'confort',name:'Confort',description:null,includes:['Transport','Hôtel'],price_xof:150000,position:2,i18n:null}];
const offer={id:'of1',kind:'couple',code:null,title:'Couple -10%',description:'Pour deux',discount_type:'percent',discount_value:10,max_discount_xof:null,min_participants:2,max_participants:2,min_days_before:null,max_days_before:null,valid_until:null,i18n:{en:{title:'Couple -10% EN'}}};
let consumed=0; global.log=[];
function preview(b){const unit=b.p_package==='p2'?150000:100000;const gross=unit*b.p_participants;
  const code=(b.p_code||'').toUpperCase();
  if(code&&code!=='BIENVENUE') return {gross_xof:gross,discount_xof:0,total_xof:gross,offer:null,error:'PROMO_NOT_FOUND'};
  let d=0,o=null; if(code==='BIENVENUE'){d=Math.round(gross*0.2);o={id:'x',title:'Bienvenue -20%',kind:'discount',code:'BIENVENUE'};}
  else if(b.p_participants===2){d=Math.round(gross*0.1);o={id:'of1',title:'Couple -10%',kind:'couple',code:null};}
  return {gross_xof:gross,discount_xof:d,total_xof:gross-d,offer:o,error:null};}
http.createServer((req,res)=>{
  const u=url.parse(req.url,true); res.setHeader('access-control-allow-origin',req.headers.origin||'*');res.setHeader('access-control-allow-credentials','true');
  res.setHeader('access-control-allow-headers','*');res.setHeader('access-control-allow-methods','*');
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
  let body='';req.on('data',d=>body+=d);req.on('end',()=>{
    res.setHeader('content-type','application/json');
    const j=()=>{try{return JSON.parse(body||'{}')}catch{return {}}};
    global.log.push(req.method+' '+u.pathname+(body?' '+body.slice(0,160):''));
    const single=(req.headers.accept||'').includes('vnd.pgrst.object');
    const send=(a)=>res.end(JSON.stringify(single?(a[0]??null):a));
    if(u.pathname==='/auth/v1/user') return res.end(JSON.stringify({id:'u1',aud:'authenticated',email:'a@b.ci',role:'authenticated'}));
    if(u.pathname==='/rest/v1/trips') return send(u.query.slug==='eq.t1'?[trip]:[]);
    if(u.pathname==='/rest/v1/trip_packages') return send(pkgs);
    if(u.pathname==='/rest/v1/rpc/list_offers_for_target') return res.end(JSON.stringify([offer]));
    if(u.pathname==='/rest/v1/rpc/preview_booking_price') return res.end(JSON.stringify(preview(j())));
    if(u.pathname==='/rest/v1/rpc/create_trip_booking'){const b=j();
      if(b.p_promo_code==='LIMITE') return res.end(JSON.stringify({error:'PROMO_RATE_LIMITED'}));
      const p=preview(b); return res.end(JSON.stringify({id:'bk1',reference:'TRP-TEST',total_xof:p.total_xof,discount_xof:p.discount_xof,offer:p.offer&&p.offer.title}));}
    if(u.pathname==='/functions/v1/tourism-assistant'){ consumed++; const b=j();
      if(consumed>2){res.statusCode=429;return res.end(JSON.stringify({error:'RATE_LIMITED'}));}
      return res.end(JSON.stringify({reply:b.locale==='en'?'Try the Bassam weekend.':'Je te propose le week-end à Bassam.',items:[{kind:'trip',slug:'t1',title:'Week-end à Bassam',price_xof:100000,detail:'Grand-Bassam, CI'}],remaining:3-consumed}));}
    if(u.pathname==='/__log') return res.end(JSON.stringify(global.log));
    res.end(single?'null':'[]');
  });
}).listen(9201);
