// ============================================================================
// Subscriptions — Phase 14 du roadmap Soutra-Pay.
//
// 5 plans disponibles. Le catalogue est dupliqué côté client (pour l'UI)
// et côté serveur (Edge subscribe-initialize fait foi pour le pricing).
// Si discrepancy, le serveur tranche.
// ============================================================================
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { invokeEdge } from './edge';

const RETURN_URL = 'soutrapaiya://paystack';

export type PlanCode = 'free' | 'standard' | 'pro' | 'premium' | 'soutra_premium';

export interface Plan {
  code: PlanCode;
  name: string;
  amount_xof: number;
  duration_days: number;
  highlight?: string;
  features: string[];
  tone: 'neutral' | 'primary' | 'gold' | 'gradient';
}

export const PLANS: Plan[] = [
  {
    code: 'free',
    name: 'Free',
    amount_xof: 0,
    duration_days: 365,
    features: [
      'Soutra-Pay wallet de base',
      'Réservations et paiements standard',
      'Recherche et carte Mapbox',
    ],
    tone: 'neutral',
  },
  {
    code: 'standard',
    name: 'Standard',
    amount_xof: 2000,
    duration_days: 30,
    highlight: 'Recommandé',
    features: [
      'Tout du Free',
      'Cashback 1% sur tous les paiements',
      'Notifications prioritaires',
      'Support email',
    ],
    tone: 'primary',
  },
  {
    code: 'pro',
    name: 'Pro',
    amount_xof: 5000,
    duration_days: 30,
    features: [
      'Tout du Standard',
      'Cashback 2%',
      'Réservations VIP prioritaires',
      'Filtre "Sans pub" sur l\'app',
      'Concierge Sia illimité',
    ],
    tone: 'primary',
  },
  {
    code: 'premium',
    name: 'Premium',
    amount_xof: 15000,
    duration_days: 30,
    features: [
      'Tout du Pro',
      'Cashback 3%',
      'Accès aux events VVIP',
      'Voix premium pour Sia (ElevenLabs V2)',
      'Support téléphone 7/7',
    ],
    tone: 'gold',
  },
  {
    code: 'soutra_premium',
    name: 'Soutra Premium',
    amount_xof: 30000,
    duration_days: 30,
    highlight: 'Édition limitée',
    features: [
      'Tout du Premium',
      'Cashback 5%',
      'Concierge humain Soutra-Playce dédié',
      'Invitations événements partenaires',
      'Accès anticipé aux nouvelles features',
    ],
    tone: 'gradient',
  },
];

export interface ActiveSubscription {
  id: string;
  plan_code: PlanCode;
  status: 'pending' | 'active' | 'expired' | 'cancelled' | 'past_due';
  started_at: string | null;
  expires_at: string | null;
  auto_renew: boolean;
}

export async function getMyActiveSubscription(): Promise<ActiveSubscription | null> {
  const { data, error } = await (supabase as any)
    .from('subscriptions')
    .select('id, plan_code, status, started_at, expires_at, auto_renew')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as ActiveSubscription;
}

export interface SubscribeResult {
  status: 'active' | 'pending';
  reference?: string;
  authorization_url?: string;
  subscription_id?: string;
}

/**
 * Subscribe to a plan. Pour les plans payants, ouvre le WebBrowser Paystack
 * et attend la fin du paiement. Le webhook activera l'abonnement.
 */
export async function subscribeTo(planCode: PlanCode): Promise<SubscribeResult> {
  const res = await invokeEdge<{
    status: 'active' | 'pending';
    authorization_url?: string;
    reference?: string;
    subscription_id?: string;
  }>('subscribe-initialize', { plan_code: planCode });

  if (res.status === 'active') {
    return { status: 'active' };
  }

  if (!res.authorization_url) {
    throw new Error('Réponse invalide du serveur subscribe');
  }

  // Ouvre la page de paiement Paystack
  await WebBrowser.openAuthSessionAsync(res.authorization_url, RETURN_URL);

  return {
    status: 'pending',
    reference: res.reference,
    subscription_id: res.subscription_id,
    authorization_url: res.authorization_url,
  };
}

export async function cancelSubscription(subscriptionId: string, reason?: string): Promise<void> {
  const { error } = await (supabase.rpc as any)('cancel_subscription', {
    p_subscription_id: subscriptionId,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
}
