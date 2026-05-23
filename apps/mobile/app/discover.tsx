import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator, Alert, Modal, TextInput, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { useAuth } from '@/lib/auth-context';
import {
  INTEREST_SUGGESTIONS,
  getMyMatchingProfile,
  updateMyMatchingProfile,
  listCandidates,
  reactToProfile,
  type Candidate,
  type MyMatchingProfile,
} from '@/lib/discover';

export default function Discover() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [myProfile, setMyProfile] = useState<MyMatchingProfile | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [matchModal, setMatchModal] = useState<Candidate | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [cityOnly, setCityOnly] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const me = await getMyMatchingProfile(user.id);
      setMyProfile(me);
      // Si profil non opt-in OU pas d'intérêts -> on ouvre directement l'éditeur.
      if (!me.discoverable || me.interests.length === 0) {
        setEditOpen(true);
        setCandidates([]);
      } else {
        const list = await listCandidates({ cityOnly });
        setCandidates(list);
      }
    } catch (err: any) {
      console.error('[discover] load error:', err);
      Alert.alert('Erreur', err?.message ?? 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, cityOnly]);

  useEffect(() => { load(); }, [load]);

  async function handle(action: 'like' | 'pass') {
    if (!candidates.length || busy) return;
    const target = candidates[0];
    setBusy(true);
    // Optimistic : on retire la carte du dessus.
    setCandidates((prev) => prev.slice(1));
    try {
      const res = await reactToProfile(target.id, action);
      if (res.matched) setMatchModal(target);
      // Recharge si on est à court.
      if (candidates.length <= 3) {
        const more = await listCandidates({ cityOnly });
        setCandidates((prev) => [...prev, ...more.filter((c) => !prev.some((x) => x.id === c.id))]);
      }
    } catch (err: any) {
      // Rollback : on remet la carte.
      setCandidates((prev) => [target, ...prev]);
      Alert.alert('Erreur', err?.message ?? 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <Header onBack={() => router.back()} onEdit={() => setEditOpen(true)} onMatches={() => router.push('/matches')} />
        <View style={s.center}><ActivityIndicator size="large" color={colors.primary[500]} /></View>
      </SafeAreaView>
    );
  }

  const card = candidates[0];

  return (
    <SafeAreaView style={s.safe}>
      <Header onBack={() => router.back()} onEdit={() => setEditOpen(true)} onMatches={() => router.push('/matches')} />

      {/* Filtre ville */}
      <View style={s.filterRow}>
        <Pressable onPress={() => setCityOnly((v) => !v)} style={[s.filterChip, cityOnly && s.filterChipActive]}>
          <Ionicons name="location-outline" size={14} color={cityOnly ? '#fff' : colors.primary[600]} />
          <Text style={[s.filterChipText, cityOnly && s.filterChipTextActive]}>
            {cityOnly ? `Dans ${myProfile?.city || 'ma ville'}` : 'Toutes villes'}
          </Text>
        </Pressable>
      </View>

      {!card ? (
        <View style={s.center}>
          <Ionicons name="people-outline" size={64} color={colors.neutral[300]} />
          <Text style={s.emptyTitle}>Personne pour l'instant</Text>
          <Text style={s.emptyText}>
            {myProfile?.interests.length === 0
              ? 'Ajoute des centres d\'intérêt pour rencontrer des gens.'
              : 'Reviens plus tard ou élargis la recherche à toutes les villes.'}
          </Text>
          <Pressable onPress={() => setEditOpen(true)} style={s.emptyBtn}>
            <Text style={s.emptyBtnText}>Modifier mon profil</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          <View style={s.card}>
            {card.avatar_url ? (
              <Image source={{ uri: card.avatar_url }} style={s.cardImg} resizeMode="cover" />
            ) : (
              <View style={[s.cardImg, s.avatarPlaceholder]}>
                <Text style={s.avatarPlaceholderTxt}>{(card.full_name || '?').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={s.cardBody}>
              <View style={s.cardTitleRow}>
                <Text style={s.cardName}>{card.full_name || 'Anonyme'}</Text>
                {card.birth_year && (
                  <Text style={s.cardAge}>{new Date().getFullYear() - card.birth_year} ans</Text>
                )}
              </View>
              <Text style={s.cardLoc}>📍 {card.district || card.city || 'Abidjan'}</Text>
              {card.bio ? <Text style={s.cardBio}>{card.bio}</Text> : null}
              {card.overlap_count > 0 && (
                <Text style={s.overlap}>
                  ✨ {card.overlap_count} intérêt{card.overlap_count > 1 ? 's' : ''} en commun
                </Text>
              )}
              {card.interests.length > 0 && (
                <View style={s.tags}>
                  {card.interests.slice(0, 8).map((t) => {
                    const mine = myProfile?.interests.includes(t);
                    return (
                      <View key={t} style={[s.tag, mine && s.tagShared]}>
                        <Text style={[s.tagText, mine && s.tagSharedText]}>{t}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Boutons Pass / Like */}
      {card && (
        <View style={s.actionsBar}>
          <Pressable onPress={() => handle('pass')} disabled={busy} style={[s.action, s.actionPass]}>
            <Ionicons name="close" size={28} color={colors.danger} />
          </Pressable>
          <Pressable onPress={() => handle('like')} disabled={busy} style={[s.action, s.actionLike]}>
            <Ionicons name="heart" size={28} color="#fff" />
          </Pressable>
        </View>
      )}

      {/* Modal éditeur de profil */}
      <ProfileEditor
        visible={editOpen}
        profile={myProfile}
        onClose={() => setEditOpen(false)}
        onSaved={async () => { setEditOpen(false); await load(); }}
        userId={user?.id || ''}
      />

      {/* Modal célébration match */}
      <Modal transparent visible={!!matchModal} animationType="fade" onRequestClose={() => setMatchModal(null)}>
        <View style={s.matchOverlay}>
          <View style={s.matchCard}>
            <Text style={s.matchEmoji}>🎉</Text>
            <Text style={s.matchTitle}>C'est un match !</Text>
            <Text style={s.matchSub}>Toi et {matchModal?.full_name || 'cette personne'} vous êtes likés mutuellement.</Text>
            <Pressable onPress={() => setMatchModal(null)} style={s.matchBtn}>
              <Text style={s.matchBtnText}>Continuer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Header({ onBack, onEdit, onMatches }: { onBack: () => void; onEdit: () => void; onMatches: () => void }) {
  return (
    <View style={s.header}>
      <Pressable onPress={onBack} hitSlop={10}><Ionicons name="chevron-back" size={26} color={colors.dark} /></Pressable>
      <Text style={s.headerTitle}>Découverte</Text>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Pressable onPress={onMatches} hitSlop={10}><Ionicons name="heart-outline" size={24} color={colors.dark} /></Pressable>
        <Pressable onPress={onEdit} hitSlop={10}><Ionicons name="settings-outline" size={22} color={colors.dark} /></Pressable>
      </View>
    </View>
  );
}

function ProfileEditor(props: {
  visible: boolean;
  profile: MyMatchingProfile | null;
  userId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [interests, setInterests] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [gender, setGender] = useState<'m' | 'f' | 'x' | null>(null);
  const [lookingFor, setLookingFor] = useState<'m' | 'f' | 'any' | null>(null);
  const [discoverable, setDiscoverable] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!props.profile) return;
    setInterests(props.profile.interests || []);
    setBio(props.profile.bio || '');
    setBirthYear(props.profile.birth_year ? String(props.profile.birth_year) : '');
    setGender(props.profile.gender);
    setLookingFor(props.profile.looking_for);
    setDiscoverable(props.profile.discoverable);
  }, [props.profile, props.visible]);

  function toggleInterest(tag: string) {
    setInterests((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  }

  async function save() {
    const yr = birthYear.trim() ? parseInt(birthYear, 10) : null;
    if (yr !== null && (!Number.isFinite(yr) || yr < 1900 || yr > new Date().getFullYear() - 13)) {
      Alert.alert('Année invalide', 'L\'année de naissance doit être réaliste (13 ans minimum).');
      return;
    }
    if (discoverable && interests.length === 0) {
      Alert.alert('Profil incomplet', 'Choisis au moins 1 centre d\'intérêt pour apparaître dans la découverte.');
      return;
    }
    setSaving(true);
    try {
      await updateMyMatchingProfile(props.userId, {
        interests,
        bio,
        birth_year: yr,
        gender,
        looking_for: lookingFor,
        discoverable,
      });
      await props.onSaved();
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Sauvegarde impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <Pressable onPress={props.onClose} hitSlop={10}><Ionicons name="close" size={26} color={colors.dark} /></Pressable>
          <Text style={s.headerTitle}>Mon profil</Text>
          <Pressable onPress={save} disabled={saving} style={s.saveBtn}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Enregistrer</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}>
          {/* Opt-in */}
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Apparaître dans la découverte</Text>
              <Text style={s.hint}>Ton profil sera visible par les autres utilisateurs.</Text>
            </View>
            <Switch value={discoverable} onValueChange={setDiscoverable} />
          </View>

          {/* Bio */}
          <Text style={s.label}>Bio (facultative)</Text>
          <TextInput
            value={bio}
            onChangeText={(v) => v.length <= 280 && setBio(v)}
            placeholder="Parle un peu de toi…"
            placeholderTextColor={colors.neutral[400]}
            multiline
            style={s.bio}
          />
          <Text style={s.counter}>{bio.length} / 280</Text>

          {/* Année de naissance */}
          <Text style={s.label}>Année de naissance (facultative)</Text>
          <TextInput
            value={birthYear}
            onChangeText={setBirthYear}
            keyboardType="number-pad"
            placeholder="1995"
            placeholderTextColor={colors.neutral[400]}
            style={s.input}
            maxLength={4}
          />

          {/* Genre */}
          <Text style={s.label}>Je suis</Text>
          <View style={s.choiceRow}>
            {([['m', 'Homme'], ['f', 'Femme'], ['x', 'Autre']] as const).map(([v, l]) => (
              <Pressable key={v} onPress={() => setGender((g) => g === v ? null : v)} style={[s.choice, gender === v && s.choiceActive]}>
                <Text style={[s.choiceText, gender === v && s.choiceTextActive]}>{l}</Text>
              </Pressable>
            ))}
          </View>

          {/* Looking for */}
          <Text style={s.label}>Je cherche</Text>
          <View style={s.choiceRow}>
            {([['m', 'Hommes'], ['f', 'Femmes'], ['any', 'Tout le monde']] as const).map(([v, l]) => (
              <Pressable key={v} onPress={() => setLookingFor((g) => g === v ? null : v)} style={[s.choice, lookingFor === v && s.choiceActive]}>
                <Text style={[s.choiceText, lookingFor === v && s.choiceTextActive]}>{l}</Text>
              </Pressable>
            ))}
          </View>

          {/* Intérêts */}
          <Text style={s.label}>Mes centres d'intérêt ({interests.length})</Text>
          <View style={s.tags}>
            {INTEREST_SUGGESTIONS.map((t) => {
              const on = interests.includes(t);
              return (
                <Pressable key={t} onPress={() => toggleInterest(t)} style={[s.tag, on && s.tagShared]}>
                  <Text style={[s.tagText, on && s.tagSharedText]}>{t}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.neutral[200],
  },
  headerTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  saveBtn: { backgroundColor: colors.primary[500], paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, minWidth: 92, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { marginTop: spacing.base, fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  emptyText: { marginTop: spacing.xs, fontSize: typography.fontSize.sm, color: colors.neutral[500], textAlign: 'center', maxWidth: 280 },
  emptyBtn: { marginTop: spacing.lg, backgroundColor: colors.primary[500], paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.sm },
  filterRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.base, paddingVertical: spacing.sm, backgroundColor: colors.primary[50], borderRadius: radius.full },
  filterChipActive: { backgroundColor: colors.primary[500] },
  filterChipText: { fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.primary[600] },
  filterChipTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.neutral[200] },
  cardImg: { width: '100%', aspectRatio: 1, backgroundColor: colors.neutral[100] },
  avatarPlaceholder: { backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center' },
  avatarPlaceholderTxt: { color: '#fff', fontSize: 96, fontWeight: '700' },
  cardBody: { padding: spacing.lg, gap: spacing.sm },
  cardTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  cardName: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.dark },
  cardAge: { fontSize: typography.fontSize.lg, color: colors.neutral[600] },
  cardLoc: { fontSize: typography.fontSize.sm, color: colors.neutral[600] },
  cardBio: { fontSize: typography.fontSize.sm, color: colors.dark, lineHeight: 20, marginTop: spacing.xs },
  overlap: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.primary[600] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  tag: { paddingHorizontal: spacing.base, paddingVertical: spacing.xs, backgroundColor: colors.neutral[100], borderRadius: radius.full },
  tagShared: { backgroundColor: colors.primary[100] },
  tagText: { fontSize: typography.fontSize.xs, color: colors.neutral[700], fontWeight: '600' },
  tagSharedText: { color: colors.primary[700] },
  actionsBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, padding: spacing.lg, backgroundColor: 'transparent' },
  action: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  actionPass: { borderWidth: 2, borderColor: colors.danger },
  actionLike: { backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.danger },
  matchOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  matchCard: { backgroundColor: '#fff', borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', width: '100%', maxWidth: 360 },
  matchEmoji: { fontSize: 72 },
  matchTitle: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.primary[500], marginTop: spacing.sm },
  matchSub: { fontSize: typography.fontSize.sm, color: colors.neutral[600], marginTop: spacing.sm, textAlign: 'center' },
  matchBtn: { marginTop: spacing.lg, backgroundColor: colors.primary[500], paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.lg },
  matchBtnText: { color: '#fff', fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.neutral[200] },
  label: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.dark, marginTop: spacing.md, marginBottom: spacing.xs },
  hint: { fontSize: typography.fontSize.xs, color: colors.neutral[500] },
  bio: { fontSize: typography.fontSize.sm, color: colors.dark, minHeight: 80, padding: spacing.md, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.lg, textAlignVertical: 'top' },
  counter: { textAlign: 'right', fontSize: typography.fontSize.xs, color: colors.neutral[400], marginTop: 2 },
  input: { fontSize: typography.fontSize.sm, color: colors.dark, padding: spacing.md, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.lg },
  choiceRow: { flexDirection: 'row', gap: spacing.sm },
  choice: { flex: 1, paddingVertical: spacing.md, alignItems: 'center', backgroundColor: colors.neutral[100], borderRadius: radius.lg },
  choiceActive: { backgroundColor: colors.primary[500] },
  choiceText: { fontSize: typography.fontSize.sm, color: colors.neutral[700], fontWeight: '600' },
  choiceTextActive: { color: '#fff' },
});
