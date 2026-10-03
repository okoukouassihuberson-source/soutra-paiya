// Textes des pages légales — SQUELETTES rédigés d'après le fonctionnement réel de la plateforme.
// Ils DOIVENT être relus et validés par un juriste ivoirien avant publication (voir docs/LEGAL.md).
// Les passages « [à valider] » signalent un choix juridique ou commercial à confirmer.

export type Block = { p?: string; ul?: string[] };
export interface Section { h: string; blocks: Block[] }
export interface LegalDoc { title: string; intro: string; sections: Section[] }
export type LegalKey = 'terms' | 'privacy' | 'about';
export type LegalLang = 'fr' | 'en';

/** {x} : remplacé par les informations de l'éditeur (lib/legal/config.ts). */
export const LEGAL_DOCS: Record<LegalLang, Record<LegalKey, LegalDoc>> = {
  fr: {
    terms: {
      title: "Conditions générales d'utilisation",
      intro: "Les présentes conditions encadrent l'utilisation de Soutra-Playce (site web et application mobile). En créant un compte ou en utilisant la plateforme, vous les acceptez.",
      sections: [
        { h: '1. Éditeur', blocks: [{ p: "Soutra-Playce est éditée par {company} ({form}), dont le siège est situé {address}. Immatriculation : {registration}. Directeur de la publication : {director}. Contact : {email}." }] },
        { h: '2. Objet et définitions', blocks: [
          { p: "Soutra-Playce est une plateforme permettant de découvrir des lieux et expériences en Côte d'Ivoire (hôtels, restaurants, sites, activités, voyages), de les réserver et de les payer en ligne." },
          { ul: ["« Utilisateur » : toute personne qui utilise la plateforme.", "« Partenaire » ou « Organisateur » : professionnel qui publie des lieux, activités ou voyages sur la plateforme.", "« Offre » : un voyage, une activité, une réservation de lieu ou tout autre service proposé via la plateforme."] },
        ] },
        { h: '3. Rôle de Soutra-Playce', blocks: [{ p: "[à valider] Soutra-Playce agit comme intermédiaire technique de mise en relation et d'encaissement. Le contrat portant sur l'Offre (voyage, activité, hébergement…) est conclu entre l'Utilisateur et le Partenaire, qui reste responsable de l'exécution de sa prestation, de la conformité de son offre et de ses obligations légales (agrément, assurances, sécurité)." }] },
        { h: '4. Compte utilisateur', blocks: [
          { p: "La création d'un compte nécessite des informations exactes (nom, numéro de téléphone, adresse e-mail). Vous êtes responsable de la confidentialité de vos identifiants et de votre code PIN de paiement, et de toute activité réalisée depuis votre compte. Prévenez-nous sans délai en cas de perte ou d'usage frauduleux." },
          { p: "Certaines fonctions (retraits, paiements importants, espace partenaire) peuvent exiger une vérification d'identité (KYC)." },
        ] },
        { h: '5. Réservations, prix et promotions', blocks: [
          { p: "Les prix sont affichés en francs CFA (XOF), taxes comprises sauf mention contraire. Le prix à payer est calculé par la plateforme au moment de la réservation ; il peut intégrer une offre promotionnelle ou un code promo." },
          { ul: ["Une seule offre promotionnelle est appliquée par réservation (les offres ne sont pas cumulables).", "Les offres peuvent être limitées dans le temps, en nombre d'utilisations ou à certains profils.", "Une réservation peut être conservée un temps limité avant paiement, puis expirer."] },
        ] },
        { h: '6. Paiement', blocks: [{ p: "Le paiement s'effectue en ligne par Mobile Money, carte bancaire ou portefeuille Soutra-Pay, via des prestataires de paiement agréés (par exemple GeniusPay, Paystack). Soutra-Playce ne conserve pas vos données de carte. Un ticket ou un code de validation (QR) est délivré après paiement confirmé." }] },
        { h: '7. Commissions', blocks: [{ p: "Soutra-Playce perçoit une commission auprès des Partenaires sur les ventes réalisées via la plateforme. Cette commission est incluse dans le prix affiché à l'Utilisateur ; aucun frais caché n'est ajouté lors du paiement. [à valider]" }] },
        { h: '8. Annulation, modification et remboursement', blocks: [
          { p: "[à définir par l'éditeur] Les conditions d'annulation et de remboursement dépendent de l'Offre et sont indiquées sur sa fiche avant le paiement. En cas d'annulation par le Partenaire, l'Utilisateur est remboursé selon les modalités décrites ci-dessous." },
          { ul: ["Annulation par l'Utilisateur : [délais et pourcentages de remboursement à définir].", "Annulation ou modification par le Partenaire : remboursement intégral ou report au choix de l'Utilisateur [à valider].", "Délai de remboursement : [à définir]."] },
        ] },
        { h: '9. Avis et contenus publiés', blocks: [{ p: "Vous pouvez publier des avis, photos et commentaires. Vous garantissez détenir les droits sur ces contenus et vous nous accordez une licence non exclusive pour les afficher sur la plateforme. Sont interdits les contenus illicites, injurieux, trompeurs ou portant atteinte aux droits de tiers. Nous pouvons retirer un contenu signalé et suspendre un compte en cas d'abus." }] },
        { h: '10. Assistant et recherche par IA', blocks: [{ p: "L'assistant (SIA) et la recherche en langage naturel s'appuient sur l'intelligence artificielle. Leurs réponses sont fournies à titre indicatif et peuvent contenir des erreurs : vérifiez toujours les prix, dates et conditions sur la fiche de l'Offre avant de réserver. Ne communiquez pas d'informations sensibles dans vos questions." }] },
        { h: '11. Responsabilité', blocks: [{ p: "Soutra-Playce met en œuvre les moyens raisonnables pour assurer l'accès et la sécurité de la plateforme, sans garantir une disponibilité ininterrompue. [à valider] Notre responsabilité ne saurait être engagée pour l'exécution des prestations fournies par les Partenaires, ni pour les dommages indirects, dans les limites permises par la loi." }] },
        { h: '12. Propriété intellectuelle', blocks: [{ p: "La marque, le logo, les textes, la base de données et le code de Soutra-Playce sont protégés. Toute reproduction non autorisée est interdite. Les contenus des Partenaires restent leur propriété." }] },
        { h: '13. Données personnelles', blocks: [{ p: "Le traitement de vos données est décrit dans la Politique de confidentialité." }] },
        { h: '14. Modification des conditions', blocks: [{ p: "Nous pouvons modifier ces conditions ; la date de mise à jour figure en haut de page. En cas de changement important, vous en serez informé. L'utilisation de la plateforme après modification vaut acceptation." }] },
        { h: '15. Droit applicable et litiges', blocks: [{ p: "[à valider] Les présentes conditions sont soumises au droit ivoirien. En cas de litige, une solution amiable sera recherchée en priorité (contact : {email}) ; à défaut, les tribunaux compétents d'Abidjan seront saisis." }] },
        { h: '16. Contact', blocks: [{ p: "Pour toute question : {email}." }] },
      ],
    },
    privacy: {
      title: 'Politique de confidentialité',
      intro: "Cette politique explique quelles données personnelles Soutra-Playce collecte, pourquoi, avec qui nous les partageons et quels sont vos droits.",
      sections: [
        { h: '1. Responsable du traitement', blocks: [{ p: "{company} ({form}), {address}. Contact pour les données personnelles : {privacyEmail}." }] },
        { h: '2. Données collectées', blocks: [{ ul: [
          "Compte : nom, numéro de téléphone, adresse e-mail, photo de profil, mot de passe (stocké sous forme chiffrée) et code PIN de paiement.",
          "Réservations et paiements : Offres réservées, montants, références de transaction, historique du portefeuille Soutra-Pay. Les données de carte bancaire sont traitées par nos prestataires de paiement et ne sont pas conservées par Soutra-Playce.",
          "Vérification d'identité (KYC) : pièce d'identité et justificatifs fournis pour les retraits ou l'espace partenaire.",
          "Localisation : position approximative ou précise, uniquement si vous l'autorisez, pour afficher les lieux à proximité.",
          "Contenus : avis, photos, commentaires, messages, stories et publications.",
          "Assistant et recherche IA : les questions que vous saisissez ou dictez.",
          "Appareil et usage : jeton de notification, langue choisie, journaux techniques de sécurité.",
        ] }] },
        { h: '3. Finalités et bases légales', blocks: [{ ul: [
          "Fournir le service (compte, réservation, paiement, billets, support) — exécution du contrat.",
          "Sécurité, lutte contre la fraude et le blanchiment, vérification d'identité — obligations légales et intérêt légitime.",
          "Notifications de service (confirmations, rappels, paiements) — exécution du contrat ; notifications promotionnelles — votre consentement, modifiable à tout moment dans les préférences.",
          "Amélioration de la plateforme et statistiques — intérêt légitime.",
          "Géolocalisation — votre consentement (désactivable dans les réglages de votre téléphone).",
        ] }] },
        { h: '4. Destinataires et sous-traitants', blocks: [
          { p: "Vos données sont accessibles à nos équipes habilitées et à nos prestataires, dans la limite nécessaire :" },
          { ul: [
            "Hébergement et base de données : Supabase ; hébergement du site : Vercel.",
            "Paiement : GeniusPay, Paystack et opérateurs Mobile Money/cartes.",
            "Cartographie : Mapbox. Notifications : services de notification des systèmes mobiles (Expo, Apple, Google) et d'envoi d'e-mails.",
            "Assistant IA : un fournisseur de modèle de langage (Anthropic) reçoit les questions que vous posez à l'assistant.",
            "Partenaires : l'Organisateur ou l'établissement de votre réservation reçoit les informations nécessaires à son exécution (nom, contact, participants).",
          ] },
          { p: "Nous ne vendons pas vos données personnelles." },
        ] },
        { h: '5. Transferts hors de Côte d’Ivoire', blocks: [{ p: "[à valider] Certains prestataires sont situés hors de Côte d'Ivoire. Ces transferts sont encadrés conformément à la réglementation applicable (autorisation ou déclaration auprès de l'autorité de protection des données, clauses contractuelles)." }] },
        { h: '6. Durées de conservation', blocks: [{ p: "[à définir] Les données du compte sont conservées tant que le compte est actif, puis supprimées ou anonymisées dans un délai de [x] mois. Les données de transaction sont conservées [x] ans pour répondre aux obligations comptables et de lutte contre la fraude. Les pièces KYC sont conservées [x] ans après la fin de la relation." }] },
        { h: '7. Vos droits', blocks: [
          { p: "Conformément à la loi n° 2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel [à valider], vous disposez d'un droit d'accès, de rectification, d'opposition et de suppression de vos données, ainsi que du droit de retirer votre consentement. Écrivez-nous à {privacyEmail} ; nous répondons dans un délai raisonnable [délai à définir]." },
          { p: "Vous pouvez aussi saisir l'Autorité de Régulation des Télécommunications/TIC de Côte d'Ivoire (ARTCI) [à valider], autorité chargée de la protection des données personnelles." },
        ] },
        { h: '8. Sécurité', blocks: [{ p: "Les échanges sont chiffrés (HTTPS), l'accès aux données est restreint par des règles de sécurité au niveau de la base, et les opérations sensibles sont protégées (code PIN, biométrie optionnelle). Aucun système n'étant infaillible, signalez-nous toute anomalie à {privacyEmail}." }] },
        { h: '9. Stockage local et cookies', blocks: [{ p: "Nous utilisons le stockage de votre navigateur ou de votre téléphone pour vous maintenir connecté et mémoriser votre langue et certaines préférences. Ces éléments sont nécessaires au fonctionnement du service. [à valider : ajouter les outils de mesure d'audience éventuels]" }] },
        { h: '10. Mineurs', blocks: [{ p: "[à valider] Le service s'adresse aux personnes majeures ou, pour les mineurs, sous la responsabilité d'un représentant légal." }] },
        { h: '11. Modifications', blocks: [{ p: "Cette politique peut évoluer ; la date de mise à jour figure en haut de page. En cas de changement important, vous en serez informé." }] },
      ],
    },
    about: {
      title: 'À propos de Soutra-Playce',
      intro: "La Côte d'Ivoire à portée de main.",
      sections: [
        { h: 'Notre mission', blocks: [{ p: "Soutra-Playce aide chacun à découvrir, réserver et vivre les meilleures expériences de Côte d'Ivoire : plages, gastronomie, hébergements, culture, nature, sorties et voyages — en quelques secondes, avec un paiement adapté aux usages locaux (Mobile Money, carte, portefeuille)." }] },
        { h: 'Ce que vous trouvez sur la plateforme', blocks: [{ ul: [
          "Un explorateur de lieux avec carte et filtres, et des fiches détaillées.",
          "Des activités et des voyages de groupe, nationaux et internationaux, proposés par des organisateurs.",
          "Des promotions, un programme de fidélité et un assistant qui répond à vos questions.",
          "Une réservation et un paiement sécurisés, avec ticket et QR code de validation.",
        ] }] },
        { h: 'Pour les professionnels', blocks: [{ p: "Hôtels, restaurants, sites, guides et agences peuvent publier leurs offres, recevoir des réservations payées en ligne et suivre leurs revenus depuis l'espace partenaire." }] },
        { h: 'Nous contacter', blocks: [{ p: "{email}" }] },
      ],
    },
  },
  en: {
    terms: {
      title: 'Terms of use',
      intro: 'These terms govern the use of Soutra-Playce (website and mobile app). By creating an account or using the platform, you accept them.',
      sections: [
        { h: '1. Publisher', blocks: [{ p: 'Soutra-Playce is published by {company} ({form}), registered office: {address}. Registration: {registration}. Publication director: {director}. Contact: {email}.' }] },
        { h: '2. Purpose and definitions', blocks: [
          { p: 'Soutra-Playce is a platform to discover places and experiences in Côte d’Ivoire (hotels, restaurants, sites, activities, trips), book them and pay online.' },
          { ul: ['“User”: anyone using the platform.', '“Partner” or “Organiser”: a business that publishes places, activities or trips on the platform.', '“Offer”: a trip, activity, venue booking or any other service offered through the platform.'] },
        ] },
        { h: '3. Role of Soutra-Playce', blocks: [{ p: '[to be validated] Soutra-Playce acts as a technical intermediary for matching and payment collection. The contract for the Offer (trip, activity, stay…) is concluded between the User and the Partner, who remains responsible for delivering the service, for the compliance of the offer and for their legal obligations (licences, insurance, safety).' }] },
        { h: '4. User account', blocks: [
          { p: 'Creating an account requires accurate information (name, phone number, email). You are responsible for the confidentiality of your credentials and payment PIN and for all activity on your account. Tell us immediately about any loss or fraudulent use.' },
          { p: 'Some features (withdrawals, large payments, partner space) may require identity verification (KYC).' },
        ] },
        { h: '5. Bookings, prices and promotions', blocks: [
          { p: 'Prices are shown in CFA francs (XOF), taxes included unless stated otherwise. The price to pay is calculated by the platform at booking time and may include a promotional offer or promo code.' },
          { ul: ['Only one promotional offer applies per booking (offers cannot be combined).', 'Offers may be limited in time, number of uses or to certain profiles.', 'A booking may be held for a limited time before payment, then expire.'] },
        ] },
        { h: '6. Payment', blocks: [{ p: 'Payment is made online by Mobile Money, bank card or Soutra-Pay wallet through licensed payment providers (for example GeniusPay, Paystack). Soutra-Playce does not store your card data. A ticket or validation code (QR) is issued once payment is confirmed.' }] },
        { h: '7. Commissions', blocks: [{ p: 'Soutra-Playce charges Partners a commission on sales made through the platform. This commission is included in the price shown to the User; no hidden fee is added at payment. [to be validated]' }] },
        { h: '8. Cancellation, changes and refunds', blocks: [
          { p: '[to be defined by the publisher] Cancellation and refund conditions depend on the Offer and are shown on its page before payment. If the Partner cancels, the User is refunded as described below.' },
          { ul: ['Cancellation by the User: [deadlines and refund percentages to be defined].', 'Cancellation or change by the Partner: full refund or rescheduling at the User’s choice [to be validated].', 'Refund time: [to be defined].'] },
        ] },
        { h: '9. Reviews and published content', blocks: [{ p: 'You may publish reviews, photos and comments. You warrant that you hold the rights to this content and grant us a non-exclusive licence to display it on the platform. Unlawful, abusive, misleading content or content infringing third-party rights is prohibited. We may remove reported content and suspend an account in case of abuse.' }] },
        { h: '10. AI assistant and search', blocks: [{ p: 'The assistant (SIA) and natural-language search rely on artificial intelligence. Their answers are indicative and may contain errors: always check prices, dates and conditions on the Offer page before booking. Do not share sensitive information in your questions.' }] },
        { h: '11. Liability', blocks: [{ p: 'Soutra-Playce uses reasonable means to ensure access to and security of the platform, without guaranteeing uninterrupted availability. [to be validated] We are not liable for services provided by Partners, nor for indirect damage, to the extent permitted by law.' }] },
        { h: '12. Intellectual property', blocks: [{ p: 'The brand, logo, texts, database and code of Soutra-Playce are protected. Unauthorised reproduction is prohibited. Partners’ content remains their property.' }] },
        { h: '13. Personal data', blocks: [{ p: 'The processing of your data is described in the Privacy policy.' }] },
        { h: '14. Changes to the terms', blocks: [{ p: 'We may change these terms; the update date is shown at the top of the page. You will be informed of material changes. Continued use after a change means acceptance.' }] },
        { h: '15. Governing law and disputes', blocks: [{ p: '[to be validated] These terms are governed by Ivorian law. In case of a dispute, an amicable solution will be sought first (contact: {email}); failing that, the competent courts of Abidjan will have jurisdiction.' }] },
        { h: '16. Contact', blocks: [{ p: 'For any question: {email}.' }] },
      ],
    },
    privacy: {
      title: 'Privacy policy',
      intro: 'This policy explains what personal data Soutra-Playce collects, why, who we share it with and what your rights are.',
      sections: [
        { h: '1. Data controller', blocks: [{ p: '{company} ({form}), {address}. Contact for personal data: {privacyEmail}.' }] },
        { h: '2. Data we collect', blocks: [{ ul: [
          'Account: name, phone number, email, profile picture, password (stored encrypted) and payment PIN.',
          'Bookings and payments: Offers booked, amounts, transaction references, Soutra-Pay wallet history. Card data is processed by our payment providers and not stored by Soutra-Playce.',
          'Identity verification (KYC): ID documents and proofs provided for withdrawals or the partner space.',
          'Location: approximate or precise position, only if you allow it, to show nearby places.',
          'Content: reviews, photos, comments, messages, stories and posts.',
          'Assistant and AI search: the questions you type or dictate.',
          'Device and usage: notification token, chosen language, technical security logs.',
        ] }] },
        { h: '3. Purposes and legal bases', blocks: [{ ul: [
          'Providing the service (account, booking, payment, tickets, support) — performance of the contract.',
          'Security, fraud and money-laundering prevention, identity verification — legal obligations and legitimate interest.',
          'Service notifications (confirmations, reminders, payments) — performance of the contract; promotional notifications — your consent, changeable at any time in preferences.',
          'Improving the platform and statistics — legitimate interest.',
          'Geolocation — your consent (can be disabled in your phone settings).',
        ] }] },
        { h: '4. Recipients and processors', blocks: [
          { p: 'Your data is accessible to authorised staff and to our providers, as far as necessary:' },
          { ul: [
            'Hosting and database: Supabase; website hosting: Vercel.',
            'Payment: GeniusPay, Paystack and Mobile Money/card operators.',
            'Maps: Mapbox. Notifications: mobile OS notification services (Expo, Apple, Google) and email delivery.',
            'AI assistant: a language-model provider (Anthropic) receives the questions you ask the assistant.',
            'Partners: the Organiser or venue of your booking receives the information needed to fulfil it (name, contact, participants).',
          ] },
          { p: 'We do not sell your personal data.' },
        ] },
        { h: '5. Transfers outside Côte d’Ivoire', blocks: [{ p: '[to be validated] Some providers are located outside Côte d’Ivoire. These transfers are governed in accordance with applicable regulations (authorisation or declaration with the data protection authority, contractual clauses).' }] },
        { h: '6. Retention', blocks: [{ p: '[to be defined] Account data is kept while the account is active, then deleted or anonymised within [x] months. Transaction data is kept for [x] years to meet accounting and anti-fraud obligations. KYC documents are kept for [x] years after the end of the relationship.' }] },
        { h: '7. Your rights', blocks: [
          { p: 'Under Law no. 2013-450 of 19 June 2013 on the protection of personal data [to be validated], you have the right to access, rectify, object to and delete your data, and to withdraw your consent. Write to us at {privacyEmail}; we reply within a reasonable time [period to be defined].' },
          { p: 'You may also contact the Telecommunications/ICT Regulatory Authority of Côte d’Ivoire (ARTCI) [to be validated], the personal data protection authority.' },
        ] },
        { h: '8. Security', blocks: [{ p: 'Communications are encrypted (HTTPS), data access is restricted by database-level security rules, and sensitive operations are protected (PIN, optional biometrics). No system is infallible: report any anomaly to {privacyEmail}.' }] },
        { h: '9. Local storage and cookies', blocks: [{ p: 'We use your browser or phone storage to keep you signed in and remember your language and some preferences. These items are necessary for the service to work. [to be validated: add any analytics tools]' }] },
        { h: '10. Minors', blocks: [{ p: '[to be validated] The service is intended for adults or, for minors, under the responsibility of a legal guardian.' }] },
        { h: '11. Changes', blocks: [{ p: 'This policy may change; the update date is shown at the top of the page. You will be informed of material changes.' }] },
      ],
    },
    about: {
      title: 'About Soutra-Playce',
      intro: 'Côte d’Ivoire at your fingertips.',
      sections: [
        { h: 'Our mission', blocks: [{ p: 'Soutra-Playce helps everyone discover, book and enjoy the best experiences in Côte d’Ivoire: beaches, food, stays, culture, nature, outings and trips — in seconds, with payment suited to local habits (Mobile Money, card, wallet).' }] },
        { h: 'What you will find on the platform', blocks: [{ ul: [
          'A venue explorer with map and filters, and detailed pages.',
          'Activities and group trips, national and international, offered by organisers.',
          'Promotions, a loyalty programme and an assistant that answers your questions.',
          'Secure booking and payment, with a ticket and validation QR code.',
        ] }] },
        { h: 'For professionals', blocks: [{ p: 'Hotels, restaurants, sites, guides and agencies can publish their offers, receive bookings paid online and track their revenue from the partner space.' }] },
        { h: 'Contact us', blocks: [{ p: '{email}' }] },
      ],
    },
  },
};
