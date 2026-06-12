'use client';

import { useState } from 'react';
import { ClaimsTab } from './ClaimsTab';
import { SubmissionsTab } from './SubmissionsTab';
import { ReportsTab } from './ReportsTab';
import { ProKycTab } from './ProKycTab';

type SubTab = 'kyc' | 'claims' | 'submissions' | 'reports';

const SUB_TABS: { id: SubTab; label: string; desc: string }[] = [
  { id: 'kyc',         label: 'KYC Pro',          desc: 'Vérifier l\'identité des propriétaires' },
  { id: 'claims',      label: 'Revendications',   desc: 'Approuver les demandes de propriété' },
  { id: 'submissions', label: 'Contributions',    desc: 'Valider les nouveaux établissements' },
  { id: 'reports',     label: 'Signalements',     desc: 'Traiter les rapports communautaires' },
];

/**
 * Onglet « Modération Pro » du dashboard /admin.
 *
 * Regroupe les 4 outils de validation que peuvent utiliser l'admin et le
 * modérateur (numéro hardcodé en migration 0045) :
 *   1. KYC Pro          → ProKycTab
 *   2. Revendications   → ClaimsTab (devenir venue_owner)
 *   3. Contributions    → SubmissionsTab (ajouter un nouvel établissement)
 *   4. Signalements     → ReportsTab (rapports communautaires)
 *
 * Les sous-onglets sont gérés en state local — pas de query param pour ne pas
 * polluer le `?tab=` du dashboard principal.
 */
export function ModerationTab() {
  const [subTab, setSubTab] = useState<SubTab>('kyc');

  const active = SUB_TABS.find((s) => s.id === subTab) ?? SUB_TABS[0];

  return (
    <div>
      {/* Bandeau d'en-tête */}
      <div className="mb-6 rounded-2xl border border-primary-500/20 bg-primary-500/5 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/15 text-primary-400">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-white">Modération Pro</h2>
            <p className="mt-0.5 text-sm text-neutral-400">
              Valider les utilisateurs Pro et les contenus communautaires. Toute action est journalisée.
            </p>
          </div>
        </div>
      </div>

      {/* Sous-onglets */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SUB_TABS.map((s) => {
          const isActive = s.id === subTab;
          return (
            <button
              key={s.id}
              onClick={() => setSubTab(s.id)}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                isActive
                  ? 'border-primary-500/50 bg-primary-500/10 text-white'
                  : 'border-neutral-800/50 bg-neutral-900/50 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
              }`}
            >
              <div className="text-sm font-semibold">{s.label}</div>
              <div className="mt-0.5 text-[11px] text-neutral-500 line-clamp-2">{s.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Description du sous-onglet actif */}
      <p className="mb-3 text-xs text-neutral-500">
        <strong className="text-neutral-300">{active.label} :</strong> {active.desc}
      </p>

      {/* Contenu du sous-onglet */}
      {subTab === 'kyc' && <ProKycTab />}
      {subTab === 'claims' && <ClaimsTab />}
      {subTab === 'submissions' && <SubmissionsTab />}
      {subTab === 'reports' && <ReportsTab />}
    </div>
  );
}
