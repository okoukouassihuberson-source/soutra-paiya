-- ============================================================================
-- SOUTRA PLAYCE V2 — DONNÉES DE DÉMO TOURISME (DÉVELOPPEMENT UNIQUEMENT)
-- ============================================================================
-- NE JAMAIS exécuter en production. Ce fichier n'est volontairement PAS dans
-- supabase/migrations/. Usage : psql "$DEV_DB_URL" -f supabase/seed-dev-tourism.sql
-- Prérequis : un profil admin existe (il devient l'organisateur des démos).
-- Idempotent : relançable sans doublons (ON CONFLICT sur slug).
-- ============================================================================

insert into public.destinations (slug, name, kind, tagline, description, venue_city, latitude, longitude, is_featured, position, cover_url) values
 ('assinie',       'Assinie',       'city', 'Sable blond et lagune',        'Station balnéaire à une heure d''Abidjan : plages, lagune, resorts et sports nautiques.', 'Assinie',       5.1500, -3.2833, true, 1, 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=70'),
 ('grand-bassam',  'Grand-Bassam',  'city', 'Ville historique classée UNESCO','Ancienne capitale coloniale : quartier France, musées, plage et artisanat.',        'Grand-Bassam',  5.2000, -3.7400, true, 2, 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=1200&q=70'),
 ('san-pedro',     'San Pedro',     'city', 'Port, plages et forêts du Sud-Ouest','Deuxième port du pays, plages de Monogaga et Parc national de Taï à proximité.', 'San Pedro',     4.7485, -6.6363, true, 3, null),
 ('man',           'Man',           'city', 'Cité des 18 montagnes',        'Cascades, ponts de lianes et Dent de Man dans l''Ouest ivoirien.',                      'Man',           7.4125, -7.5538, true, 4, null),
 ('korhogo',       'Korhogo',       'city', 'Art sénoufo et savane',        'Capitale du Nord : tissage de Waraniéné, danses et artisanat sénoufo.',                 'Korhogo',       9.4580, -5.6296, true, 5, null),
 ('yamoussoukro',  'Yamoussoukro',  'city', 'Capitale et basilique',        'Basilique Notre-Dame de la Paix, lac aux caïmans et architecture monumentale.',          'Yamoussoukro',  6.8276, -5.2893, true, 6, null),
 ('bonoua',        'Bonoua',        'city', 'Terre des Abouré',             'Fête de l''Abissa, plantations et culture abouré.',                                       'Bonoua',        5.2736, -3.5944, false, 7, null)
on conflict (slug) do nothing;

with org as (select id from public.profiles where role = 'admin' order by created_at limit 1)
insert into public.trips
  (slug, organizer_id, scope, title, summary, destination_id, country, country_code, continent, city, starts_on, ends_on,
   base_price_xof, seats_total, departure_point, departure_time, return_time, transport, lodging, meals,
   activities, inclusions, conditions, contact_whatsapp, highlight, is_circuit, status)
select v.slug, org.id, v.scope::trip_scope, v.title, v.summary,
       (select id from public.destinations d where d.slug = v.dest), v.country, v.cc, v.continent, v.city,
       current_date + v.in_days, current_date + v.in_days + v.len, v.price, v.seats, v.dep, v.dep_t::time, v.ret_t::time,
       v.transport, v.lodging, v.meals, v.acts, v.incl, 'Annulation gratuite jusqu''à 7 jours avant le départ. Pièce d''identité obligatoire.',
       '+2250700000000', v.hl, v.circuit, 'published'
from org, (values
 ('demo-week-end-assinie','national','Week-end à Assinie','2 jours de détente sur la plage','assinie','Côte d''Ivoire','CI',null,'Assinie',14,1,65000,30,'Abidjan - Carrefour Marcory','07:00','20:00','Bus climatisé','Resort en bord de mer','Petit-déjeuner et dîner',array['Balade en pirogue','Plage','Jet-ski (option)'],array['Transport A/R','1 nuit','Repas'], 'a_la_une', false),
 ('demo-circuit-sud-comoe','national','Circuit Sud-Comoé','Grand-Bassam, Bonoua, Assinie, Aboisso en 3 jours','grand-bassam','Côte d''Ivoire','CI',null,'Grand-Bassam',30,2,120000,24,'Abidjan - Plateau','06:30','21:00','Minibus','Hôtels 3*','Pension complète',array['Visite guidée Grand-Bassam','Pirogue sur la lagune','Atelier artisanal'],array['Transport','2 nuits','Guide','Repas'], 'populaire', true),
 ('demo-man-cascades','national','Man et ses cascades','Dent de Man, ponts de lianes, villages dan','man','Côte d''Ivoire','CI',null,'Man',45,3,150000,20,'Abidjan - Gare d''Adjamé','05:00','22:00','Bus VIP','Hôtel à Man','Pension complète',array['Randonnée Dent de Man','Cascades','Pont de lianes'],array['Transport','3 nuits','Repas','Guide'], 'nouveau', false),
 ('demo-maroc-marrakech','international','Marrakech en groupe','8 jours entre médina, désert et Atlas','', 'Maroc','MA','afrique','Marrakech',75,7,950000,25,'Abidjan - Aéroport FHB','22:00','10:00','Vol A/R','Riad / hôtel 4*','Petit-déjeuner',array['Médina','Désert d''Agafay','Excursion Atlas'],array['Vol','Hôtel','Transferts','Visites','Assurance'], 'coup_de_coeur', false),
 ('demo-paris-groupe','international','Paris : 6 jours','Capitale française en groupe','', 'France','FR','europe','Paris',120,5,1450000,20,'Abidjan - Aéroport FHB','21:00','08:00','Vol A/R','Hôtel 3* centre','Petit-déjeuner',array['Tour Eiffel','Louvre','Croisière Seine'],array['Vol','Hôtel','Transferts','Visites','Assurance'], 'promotion', false),
 ('demo-dubai-groupe','international','Dubaï : 5 jours','Skyline, désert et shopping','', 'Émirats arabes unis','AE','asie','Dubaï',95,4,1200000,25,'Abidjan - Aéroport FHB','23:30','12:00','Vol A/R','Hôtel 4*','Petit-déjeuner',array['Burj Khalifa','Safari désert','Dhow cruise'],array['Vol','Hôtel','Transferts','Visites'], 'recommande', false)
) as v(slug,scope,title,summary,dest,country,cc,continent,city,in_days,len,price,seats,dep,dep_t,ret_t,transport,lodging,meals,acts,incl,hl,circuit)
on conflict (slug) do nothing;

-- Programme du circuit Sud-Comoé
insert into public.trip_itineraries (trip_id, day_number, title, stops, description)
select t.id, d.n, d.title, d.stops, d.descr from public.trips t,
 (values (1,'Abidjan → Grand-Bassam',array['Abidjan','Grand-Bassam'],'Départ, visite du quartier France et du musée.'),
         (2,'Bonoua → Assinie',array['Bonoua','Assinie'],'Culture abouré puis plage et lagune d''Assinie.'),
         (3,'Aboisso → Abidjan',array['Aboisso','Abidjan'],'Découverte d''Aboisso et retour à Abidjan.')) as d(n,title,stops,descr)
where t.slug = 'demo-circuit-sud-comoe'
on conflict (trip_id, day_number) do nothing;

-- Formules (modèles Essentielle / Confort / Premium / VIP) sur le week-end Assinie
insert into public.trip_packages (trip_id, code, name, includes, price_xof, position)
select t.id, p.code, p.name, p.inc, p.price, p.pos from public.trips t,
 (values ('essentielle','Formule Essentielle',array['Transport'],35000,0),
         ('confort','Formule Confort',array['Transport','Hébergement'],65000,1),
         ('premium','Formule Premium',array['Transport','Hôtel','Activités'],95000,2),
         ('vip','Formule VIP',array['Transport','Hôtel premium','Activités','Accompagnement personnalisé'],160000,3)) as p(code,name,inc,price,pos)
where t.slug = 'demo-week-end-assinie'
on conflict (trip_id, name) do nothing;

-- ----------------------------------------------------------------------------
-- Activités de démo (DEV UNIQUEMENT) + créneaux sur les 14 prochains jours
-- ----------------------------------------------------------------------------
with org as (select id from public.profiles where role = 'admin' order by created_at limit 1)
insert into public.activities
  (slug, organizer_id, destination_id, title, summary, category, city, address, latitude, longitude, price_xof,
   duration_minutes, min_age, max_group_size, languages, includes, conditions, contact_whatsapp, highlight, status, approved_at)
select v.slug, org.id, (select id from public.destinations d where d.slug = v.dest), v.title, v.summary, v.category, v.city, v.address,
       v.lat, v.lng, v.price, v.dur, v.age, v.grp, array['Français'], v.incl,
       'Annulation gratuite jusqu''à 24 h avant. Gilets de sauvetage fournis.', '+2250700000000', v.hl, 'published', now()
from org, (values
 ('demo-balade-lagune-assinie','assinie','Balade en bateau sur la lagune','Coucher de soleil et mangroves en pirogue motorisée','balade_bateau','Assinie','Embarcadère d''Assinie-France',5.1500,-3.2833,15000,120,0,8,array['Gilets de sauvetage','Boisson'],'populaire'),
 ('demo-visite-bassam','grand-bassam','Visite guidée du quartier France','Histoire coloniale, musée et artisanat','visite_guidee','Grand-Bassam','Place de la mairie',5.2000,-3.7400,8000,150,0,15,array['Guide','Entrée du musée'],'a_la_une'),
 ('demo-rando-man','man','Randonnée de la Dent de Man','Ascension guidée et vue sur les 18 montagnes','randonnee','Man','Départ ville de Man',7.4125,-7.5538,12000,300,12,10,array['Guide','Eau'],null),
 ('demo-atelier-attieke','bonoua','Atelier cuisine : attiéké et poisson braisé','Cuisinez et dégustez avec une cheffe locale','atelier_cuisine','Bonoua','Maison de la chef',5.2736,-3.5944,10000,180,8,6,array['Ingrédients','Repas'],'nouveau')
) as v(slug,dest,title,summary,category,city,address,lat,lng,price,dur,age,grp,incl,hl)
on conflict (slug) do nothing;

insert into public.activity_slots (activity_id, starts_at, capacity)
select a.id, (current_date + d.n)::timestamptz + t.h * interval '1 hour', 8
from public.activities a, generate_series(2, 15) as d(n), (values (9), (15)) as t(h)
where a.slug like 'demo-%'
on conflict (activity_id, starts_at) do nothing;
