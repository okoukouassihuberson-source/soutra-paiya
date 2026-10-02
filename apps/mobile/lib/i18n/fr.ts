// Dictionnaire français (langue de référence) de l'application mobile — à éditer à la main.
// Les autres langues doivent satisfaire le type Dict (le compilateur liste les clés manquantes).
// Pluriels : <clé>_one / <clé>_other. Paramètres : {nom}.

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

export const fr = {
  lang: { title: 'Langue / Language', fr: 'Français', en: 'English', hint: 'L’anglais est partiel : les écrans non traduits restent en français.' },
  tabs: { explore: 'Explorer', tickets: 'Billets', wallet: 'Soutra-Pay', social: 'Social', profile: 'Moi' },
  common: { loading: 'Chargement…', errorRetry: 'Impossible de charger. Tirez pour réessayer.', retry: 'Réessayer' },
  home: { trips: 'Voyages', activities: 'Activités', destinations: 'Destinations', promotions: 'Promotions', myTrips: 'Mes voyages' },
  settings: { title: 'Paramètres', language: 'Langue' },
  cat: {
    balade_bateau: 'Balade en bateau', visite_guidee: 'Visite guidée', randonnee: 'Randonnée', safari: 'Safari', peche: 'Pêche',
    plongee: 'Plongée', jet_ski: 'Jet-ski', quad: 'Quad', visite_culturelle: 'Visite culturelle', atelier_cuisine: 'Atelier cuisine',
    artisanat: 'Découverte artisanale', excursion: 'Excursion', photographie: 'Photographie touristique', autre: 'Autre', fallback: 'Activité',
  },
  dur: { min: '{n} min', h: '{h} h', hm: '{h} h {m}', day_one: '{n} jour', day_other: '{n} jours' },
  trips: {
    title: 'Voyages', subtitle: 'Voyages de groupe en Côte d’Ivoire et à l’international', national: '🇨🇮 Nationaux', international: '🌍 Internationaux',
    country: 'Côte d’Ivoire', promoBadge: 'Promo', full: 'Complet', seats_one: '{n} place', seats_other: '{n} places',
    empty: 'Aucun voyage ne correspond à votre recherche.', error: 'Impossible de charger les voyages. Tirez pour réessayer.',
  },
  acts: {
    title: 'Activités', subtitle: 'Excursions, balades, ateliers et sorties', empty: 'Aucune activité ne correspond à votre recherche.',
    error: 'Impossible de charger les activités. Tirez pour réessayer.', slotsLeft: '{n} pl.',
  },
  dest: { title: 'Destinations', subtitle: 'Où partir en Côte d’Ivoire et au-delà', empty: 'Aucune destination pour le moment.', error: 'Impossible de charger les destinations. Tirez pour réessayer.' },
  promos: { title: 'Promotions', subtitle: 'Les offres sans code s’appliquent automatiquement', empty: 'Aucune offre pour le moment. Revenez bientôt !', error: 'Impossible de charger les offres. Tirez pour réessayer.' },
  filter: { search: 'Rechercher', placeholder: 'Rechercher (ville, pays, thème…)', allBudgets: 'Tous budgets', all: 'Toutes' },
  detail: {
    tripTitle: 'Voyage', activityTitle: 'Activité', tripGone: 'Ce voyage n’est plus disponible.', activityGone: 'Cette activité n’est plus disponible.',
    daysCount_one: '{n} jour', daysCount_other: '{n} jours', full: 'Complet', seatsLeft_one: '{n} place restante', seatsLeft_other: '{n} places restantes',
    departure: 'Départ : {place}', departureAt: 'Départ : {place} à {time}', offers: '🏷️ Offres disponibles', included: 'Inclus', excluded: 'Non inclus', program: 'Programme',
    day: 'Jour {n}', book: 'Réserver', bookLogin: 'Se connecter pour réserver', chooseSlot: 'Choisissez un créneau', noSlots: 'Aucun créneau disponible pour le moment.',
    participants: 'Participants', phone: 'Téléphone (optionnel)', minAge: 'Âge minimum : {n} ans', rating: '★ {avg} sur 5 ({count} avis)',
    reviews: 'Avis', reviewsCount: 'Avis · ★ {avg} ({count})', noReviews: 'Pas encore d’avis. Les avis sont déposés par les voyageurs ayant réalisé l’activité.',
    traveler: 'Voyageur', stars: '{n} sur 5', bookingSaved: 'Réservation {ref} enregistrée', total: 'Total : {total}', discountApplied: ' (réduction de {amount} appliquée)',
    payWithin24: '. Payez dans les 24 h pour garantir vos places.', payWithin1: '. Payez dans l’heure pour garantir vos places.', payLater: 'Payer plus tard',
    whatsapp: 'Contacter l’organisateur sur WhatsApp', bookFail: 'Réservation impossible', retry: 'Réessayez.',
  },
  offer: {
    kind: { discount: 'Promotion', flash: 'Vente flash', early_booking: 'Réservation anticipée', group: 'Offre groupe', birthday: 'Anniversaire', couple: 'Offre couple', family: 'Offre famille', corporate: 'Entreprise', other: 'Offre' },
    auto: 'Appliquée automatiquement', code: 'Code : {code}', forTrip: 'Voyage : {title}', forActivity: 'Activité : {title}', fixedOff: '−{n} FCFA', percentOff: '−{n} %',
  },
  promo: {
    label: 'Code promo', placeholder: 'Ex. ABIDJAN10', apply: 'Appliquer', applied: 'Offre « {title} » appliquée : −{amount}',
    gross: 'Prix avant réduction', discount: 'Réduction', total: 'Total', from: 'dès {price}', less: 'Moins', more: 'Plus',
    err: {
      PROMO_NOT_FOUND: 'Ce code promo n’existe pas.', PROMO_NOT_APPLICABLE: 'Ce code ne s’applique pas à cette réservation.',
      PROMO_INACTIVE: 'Cette offre n’est plus active.', PROMO_NOT_STARTED: 'Cette offre n’a pas encore commencé.', PROMO_EXPIRED: 'Cette offre est terminée.',
      PROMO_PARTICIPANTS: 'Le nombre de participants ne correspond pas à l’offre.', PROMO_TOO_LATE: 'Trop tard pour cette offre.',
      PROMO_TOO_EARLY: 'Trop tôt pour cette offre : réservez plus près du départ.', PROMO_RATE_LIMITED: 'Trop d’essais de codes. Réessayez dans une heure.',
      PROMO_EXHAUSTED: 'Cette offre n’est plus disponible.', PROMO_ALREADY_USED: 'Vous avez déjà utilisé ce code.', NOT_AUTHENTICATED: 'Connectez-vous pour utiliser un code promo.',
      generic: 'Code promo invalide.',
    },
  },
  book: {
    err: {
      NOT_AUTHENTICATED: 'Connectez-vous pour réserver.', NOT_ENOUGH_SEATS: 'Il n’y a plus assez de places.', TRIP_NOT_AVAILABLE: 'Ce voyage n’est plus ouvert à la réservation.',
      TRIP_ALREADY_STARTED: 'Ce voyage a déjà commencé.', PACKAGE_NOT_FOUND: 'Formule indisponible.', INVALID_PARTICIPANTS: 'Nombre de participants invalide.',
      SLOT_CLOSED: 'Ce créneau n’est plus réservable.', GROUP_TOO_LARGE: 'Groupe trop grand pour une réservation.', ACTIVITY_NOT_AVAILABLE: 'Cette activité n’est plus disponible.',
      generic: 'Réservation impossible, réessayez.',
    },
    cancelRefund: 'Réservation déjà payée : contactez le support pour un remboursement.', cancelFail: 'Annulation impossible.',
    reviewAlready: 'Vous avez déjà donné votre avis.', reviewNotEligible: 'Vous pourrez donner votre avis après l’activité.', reviewFail: 'Envoi impossible, réessayez.',
    status: { pending: 'À payer', paid: 'Payée', confirmed: 'Confirmée', used: 'Utilisée', completed: 'Terminée', cancelled: 'Annulée', expired: 'Expirée', refunded: 'Remboursée', depositPaid: 'Acompte payé · solde à régler' },
  },
  pay: {
    full: 'Payer {amount}', deposit: 'Acompte {pct} % · {amount}', balance: 'Payer le solde {amount}', secure: 'Paiement sécurisé GeniusPay (Orange Money, MTN MoMo, Wave, carte).',
    okTitle: 'Paiement confirmé', okBody: 'Merci ! Votre billet est disponible dans « Mes voyages et activités ».', failTitle: 'Paiement échoué',
    failBody: 'Aucun montant n’a été débité. Vous pouvez réessayer.', pendingTitle: 'Paiement en cours', pendingBody: 'Nous attendons la confirmation de l’opérateur. Votre billet apparaîtra dès qu’elle arrive.',
    errTitle: 'Paiement impossible', errBody: 'Réessayez dans un instant.',
  },
  my: {
    title: 'Mes voyages et activités', count_one: '{n} réservation', count_other: '{n} réservations', empty: 'Aucune réservation pour le moment.', discover: 'Découvrir les voyages',
    kindTrip: 'Voyage', kindActivity: 'Activité', participantsPaid: '{n} participant(s) · payé {paid} / {total}', discount: 'Réduction appliquée : −{amount}',
    qrHint: 'Présentez ce code à l’organisateur.', cancelTitle: 'Annuler la réservation ?', cancelBody: 'Les places seront libérées.', no: 'Non', cancelDo: 'Annuler la réservation',
    cancelFail: 'Annulation impossible', yourReview: 'Votre avis', reviewPlaceholder: 'Racontez votre expérience (optionnel)', reviewPublish: 'Publier mon avis', reviewThanks: 'Merci pour votre avis !',
    reviewTitle: 'Avis', starLabel: '{n} étoile(s)',
  },
} as const;

export type Dict = Widen<typeof fr>;
