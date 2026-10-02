// English dictionary of the mobile app. Must satisfy Dict (the compiler lists missing keys).
// NOTE: translations have not been reviewed by a human yet.
import type { Dict } from './fr';

export const en: Dict = {
  lang: { title: 'Language', fr: 'Français', en: 'English', hint: 'English is partial: screens that are not translated yet stay in French.' },
  tabs: { explore: 'Explore', tickets: 'Tickets', wallet: 'Soutra-Pay', social: 'Social', profile: 'Me' },
  common: { loading: 'Loading…', errorRetry: 'Unable to load. Pull to retry.', retry: 'Retry' },
  home: { trips: 'Trips', activities: 'Activities', destinations: 'Destinations', promotions: 'Deals', myTrips: 'My trips' },
  settings: { title: 'Settings', language: 'Language' },
  cat: {
    balade_bateau: 'Boat trip', visite_guidee: 'Guided tour', randonnee: 'Hiking', safari: 'Safari', peche: 'Fishing',
    plongee: 'Diving', jet_ski: 'Jet ski', quad: 'Quad biking', visite_culturelle: 'Cultural visit', atelier_cuisine: 'Cooking class',
    artisanat: 'Craft discovery', excursion: 'Excursion', photographie: 'Photography tour', autre: 'Other', fallback: 'Activity',
  },
  dur: { min: '{n} min', h: '{h} h', hm: '{h} h {m}', day_one: '{n} day', day_other: '{n} days' },
  trips: {
    title: 'Trips', subtitle: 'Group trips in Côte d’Ivoire and abroad', national: '🇨🇮 National', international: '🌍 International',
    country: 'Côte d’Ivoire', promoBadge: 'Deal', full: 'Full', seats_one: '{n} seat', seats_other: '{n} seats',
    empty: 'No trip matches your search.', error: 'Unable to load trips. Pull to retry.',
  },
  acts: {
    title: 'Activities', subtitle: 'Excursions, tours, workshops and outings', empty: 'No activity matches your search.',
    error: 'Unable to load activities. Pull to retry.', slotsLeft: '{n} left',
  },
  dest: { title: 'Destinations', subtitle: 'Where to go in Côte d’Ivoire and beyond', empty: 'No destination yet.', error: 'Unable to load destinations. Pull to retry.' },
  promos: { title: 'Deals', subtitle: 'Offers without a code are applied automatically', empty: 'No offers right now. Check back soon!', error: 'Unable to load offers. Pull to retry.' },
  filter: { search: 'Search', placeholder: 'Search (city, country, theme…)', allBudgets: 'Any budget', all: 'All' },
  detail: {
    tripTitle: 'Trip', activityTitle: 'Activity', tripGone: 'This trip is no longer available.', activityGone: 'This activity is no longer available.',
    daysCount_one: '{n} day', daysCount_other: '{n} days', full: 'Full', seatsLeft_one: '{n} seat left', seatsLeft_other: '{n} seats left',
    departure: 'Departure: {place}', departureAt: 'Departure: {place} at {time}', offers: '🏷️ Available offers', included: 'Included', excluded: 'Not included', program: 'Itinerary',
    day: 'Day {n}', book: 'Book', bookLogin: 'Sign in to book', chooseSlot: 'Choose a time slot', noSlots: 'No time slot available right now.',
    participants: 'Participants', phone: 'Phone (optional)', minAge: 'Minimum age: {n}', rating: '★ {avg} out of 5 ({count} reviews)',
    reviews: 'Reviews', reviewsCount: 'Reviews · ★ {avg} ({count})', noReviews: 'No reviews yet. Reviews are left by travelers who took part in the activity.',
    traveler: 'Traveler', stars: '{n} out of 5', bookingSaved: 'Booking {ref} saved', total: 'Total: {total}', discountApplied: ' ({amount} discount applied)',
    payWithin24: '. Pay within 24 hours to secure your seats.', payWithin1: '. Pay within the hour to secure your spots.', payLater: 'Pay later',
    whatsapp: 'Contact the organizer on WhatsApp', bookFail: 'Booking failed', retry: 'Please try again.',
  },
  offer: {
    kind: { discount: 'Promotion', flash: 'Flash sale', early_booking: 'Early booking', group: 'Group offer', birthday: 'Birthday', couple: 'Couple offer', family: 'Family offer', corporate: 'Corporate', other: 'Offer' },
    auto: 'Applied automatically', code: 'Code: {code}', forTrip: 'Trip: {title}', forActivity: 'Activity: {title}', fixedOff: '−{n} FCFA', percentOff: '−{n}%',
  },
  promo: {
    label: 'Promo code', placeholder: 'e.g. ABIDJAN10', apply: 'Apply', applied: 'Offer “{title}” applied: −{amount}',
    gross: 'Price before discount', discount: 'Discount', total: 'Total', from: 'from {price}', less: 'Less', more: 'More',
    err: {
      PROMO_NOT_FOUND: 'This promo code does not exist.', PROMO_NOT_APPLICABLE: 'This code does not apply to this booking.',
      PROMO_INACTIVE: 'This offer is no longer active.', PROMO_NOT_STARTED: 'This offer has not started yet.', PROMO_EXPIRED: 'This offer has ended.',
      PROMO_PARTICIPANTS: 'The number of participants does not match the offer.', PROMO_TOO_LATE: 'Too late for this offer.',
      PROMO_TOO_EARLY: 'Too early for this offer: book closer to departure.', PROMO_RATE_LIMITED: 'Too many code attempts. Try again in an hour.',
      PROMO_EXHAUSTED: 'This offer is no longer available.', PROMO_ALREADY_USED: 'You have already used this code.', NOT_AUTHENTICATED: 'Sign in to use a promo code.',
      generic: 'Invalid promo code.',
    },
  },
  book: {
    err: {
      NOT_AUTHENTICATED: 'Sign in to book.', NOT_ENOUGH_SEATS: 'There are not enough seats left.', TRIP_NOT_AVAILABLE: 'This trip is no longer open for booking.',
      TRIP_ALREADY_STARTED: 'This trip has already started.', PACKAGE_NOT_FOUND: 'Package unavailable.', INVALID_PARTICIPANTS: 'Invalid number of participants.',
      SLOT_CLOSED: 'This time slot can no longer be booked.', GROUP_TOO_LARGE: 'Group too large for a single booking.', ACTIVITY_NOT_AVAILABLE: 'This activity is no longer available.',
      generic: 'Booking failed, please try again.',
    },
    cancelRefund: 'Booking already paid: contact support for a refund.', cancelFail: 'Cancellation failed.',
    reviewAlready: 'You have already left a review.', reviewNotEligible: 'You can leave a review after the activity.', reviewFail: 'Could not send, please try again.',
    status: { pending: 'To pay', paid: 'Paid', confirmed: 'Confirmed', used: 'Used', completed: 'Completed', cancelled: 'Cancelled', expired: 'Expired', refunded: 'Refunded', depositPaid: 'Deposit paid · balance due' },
  },
  pay: {
    full: 'Pay {amount}', deposit: 'Deposit {pct}% · {amount}', balance: 'Pay the balance {amount}', secure: 'Secure payment by GeniusPay (Orange Money, MTN MoMo, Wave, card).',
    okTitle: 'Payment confirmed', okBody: 'Thank you! Your ticket is available in “My trips and activities”.', failTitle: 'Payment failed',
    failBody: 'You were not charged. You can try again.', pendingTitle: 'Payment in progress', pendingBody: 'We are waiting for the operator’s confirmation. Your ticket will appear as soon as it arrives.',
    errTitle: 'Payment failed', errBody: 'Please try again in a moment.',
  },
  my: {
    title: 'My trips and activities', count_one: '{n} booking', count_other: '{n} bookings', empty: 'No bookings yet.', discover: 'Discover trips',
    kindTrip: 'Trip', kindActivity: 'Activity', participantsPaid: '{n} participant(s) · paid {paid} / {total}', discount: 'Discount applied: −{amount}',
    qrHint: 'Show this code to the organizer.', cancelTitle: 'Cancel this booking?', cancelBody: 'The seats will be released.', no: 'No', cancelDo: 'Cancel booking',
    cancelFail: 'Cancellation failed', yourReview: 'Your review', reviewPlaceholder: 'Tell us about your experience (optional)', reviewPublish: 'Post my review', reviewThanks: 'Thank you for your review!',
    reviewTitle: 'Review', starLabel: '{n} star(s)',
  },
};
