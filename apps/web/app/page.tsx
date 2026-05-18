import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 px-6 pb-24 pt-16 text-white">
        <nav className="mx-auto mb-20 flex max-w-6xl items-center justify-between">
          <div className="text-2xl font-bold">
            <span className="text-white">Soutra</span>
            <span className="text-warning">-Paiya</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/pro" className="text-sm font-medium opacity-90 hover:opacity-100">
              Espace Pro
            </Link>
            <Link href="/login" className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-primary-600">
              Se connecter
            </Link>
          </div>
        </nav>

        <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2 md:items-center">
          <div>
            <span className="mb-4 inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">
              🇨🇮 Akwaba ! Fait à Abidjan
            </span>
            <h1 className="font-display text-4xl font-bold leading-tight md:text-5xl">
              Sortir, réserver, payer.<br />
              <span className="text-warning">Sans la galère.</span>
            </h1>
            <p className="mt-6 text-lg opacity-90">
              Trouvez les meilleurs maquis, restos et événements près de vous.
              Payez avec Orange Money, MTN, Wave ou par carte. Garantie sur chaque réservation.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <a href="#download" className="rounded-md bg-white px-6 py-3 font-semibold text-primary-600 shadow-lg hover:shadow-xl">
                📱 Télécharger l'app
              </a>
              <Link href="/pro" className="rounded-md border-2 border-white px-6 py-3 font-semibold text-white hover:bg-white/10">
                Je suis un établissement
              </Link>
            </div>
            <div className="mt-10 flex items-center gap-6 text-sm">
              <div><span className="text-2xl font-bold">200+</span><br /><span className="opacity-75">Établissements</span></div>
              <div className="h-10 w-px bg-white/20" />
              <div><span className="text-2xl font-bold">15K+</span><br /><span className="opacity-75">Utilisateurs</span></div>
              <div className="h-10 w-px bg-white/20" />
              <div><span className="text-2xl font-bold">★ 4.7</span><br /><span className="opacity-75">Sur les stores</span></div>
            </div>
          </div>

          {/* Phone mockup */}
          <div className="relative mx-auto h-[520px] w-[260px] rounded-[40px] bg-dark p-3 shadow-2xl">
            <div className="h-full w-full rounded-[32px] bg-gradient-to-b from-light to-white p-4">
              <div className="text-xs text-neutral-500">📍 Cocody, Abidjan</div>
              <div className="mt-3 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-600">
                🔍 Sortie avec 15 000 FCFA ?
              </div>
              <div className="mt-4 flex gap-2 text-xs">
                <span className="rounded-full bg-primary-500 px-3 py-1 text-white">Maquis</span>
                <span className="rounded-full bg-neutral-200 px-3 py-1">Restos</span>
                <span className="rounded-full bg-neutral-200 px-3 py-1">Soirée</span>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  { name: 'Le Mékaféba', rating: '★ 4.7', price: '~8K', dist: '800m' },
                  { name: 'Saka Saka', rating: '★ 4.5', price: '~12K', dist: '1.2km' },
                  { name: 'VIP Lounge', rating: '★ 4.9', price: '~25K', dist: '2km' },
                ].map((v) => (
                  <div key={v.name} className="rounded-md bg-white p-3 text-dark shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{v.name}</span>
                      <span className="text-xs text-warning">{v.rating}</span>
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">{v.price} · {v.dist}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="bg-light px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-4 text-center font-display text-3xl font-bold">Tout ce qu'il faut pour sortir tranquille</h2>
          <p className="mb-12 text-center text-neutral-600">Une seule app. Trois super-pouvoirs.</p>
          <div className="grid gap-8 md:grid-cols-3">
            <FeatureCard icon="🗺️" title="Découvrir" desc="Carte interactive, IA qui propose selon ton budget et ton humeur." />
            <FeatureCard icon="💸" title="Payer (Paiya-Pay)" desc="Wallet rechargeable via Orange, MTN, Wave. QR pay, Split Bill." />
            <FeatureCard icon="🎫" title="Réserver & sécuriser" desc="Acompte protégé en séquestre. Remboursé si problème." />
          </div>
        </div>
      </section>

      {/* B2B */}
      <section className="bg-dark px-6 py-20 text-white">
        <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2 md:items-center">
          <div>
            <span className="mb-3 inline-block rounded-full bg-secondary-500/20 px-3 py-1 text-xs font-semibold text-secondary-500">
              ESPACE PRO
            </span>
            <h2 className="font-display text-3xl font-bold">Tu gères un maquis, un resto, un event ?</h2>
            <p className="mt-4 text-neutral-300">
              Reçois des réservations payées à l'avance, gère ta vente de billets et fidélise tes clients.
              <strong className="text-warning"> 0% de commission</strong> les 3 premiers mois.
            </p>
            <Link href="/pro" className="mt-6 inline-block rounded-md bg-secondary-500 px-6 py-3 font-semibold hover:bg-secondary-600">
              Ouvrir mon dashboard →
            </Link>
          </div>
          <div className="rounded-lg bg-neutral-800 p-6">
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Réservations aujourd'hui" value="47" />
              <Stat label="CA du jour" value="312 K FCFA" />
              <Stat label="Note moyenne" value="★ 4.7" />
              <Stat label="No-show" value="12%" />
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-dark px-6 py-10 text-neutral-400">
        <div className="mx-auto max-w-6xl text-center text-sm">
          © {new Date().getFullYear()} Soutra-Paiya — Conçu à Abidjan, pour la Côte d'Ivoire.
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="card text-center">
      <div className="mb-3 text-4xl">{icon}</div>
      <h3 className="mb-2 font-display text-xl font-semibold">{title}</h3>
      <p className="text-neutral-600">{desc}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-neutral-900 p-4">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold text-white">{value}</div>
    </div>
  );
}
