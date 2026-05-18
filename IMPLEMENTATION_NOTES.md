# Soutra-Paiya Implementation Progress

## v0.1.2 — Reservation Flow Complete

### Features Implemented

#### 1. Venue Discovery & Detail View
- **Explore Tab**: Browse venues by category, map integration
- **Venue Detail Screen** (`app/venue/[id].tsx`)
  - Full venue information: name, description, rating, price range
  - Address, phone, email, opening hours
  - Amenities tags and image gallery
  - "Réserver une table" action button

#### 2. Complete Reservation Flow
- **Reservation Form** (`app/reservation/[venueId].tsx`)
  - Date picker: select tomorrow or later
  - Time picker: 24-hour format
  - Party size: quick select buttons (1-10 people)
  - Special notes field (dietary requirements, occasion, etc.)
  - **Real-time calculation**:
    - Total price = avg_price_xof × party_size
    - Deposit (20%) = total × 0.2
    - Stored in database with pending status
  
- **Confirmation Screen**:
  - QR code generation (`venue_id:user_id:timestamp` format)
  - Reservation details summary
  - Payment deposit amount
  - Instructions for restaurant approval

#### 3. Reservation Management
- **Tickets Tab** (`app/tickets.tsx`)
  - Lists user's reservations from database
  - Shows: venue name, date/time, party size, status
  - Status badges: pending, confirmed, cancelled
  - Deposit amount displayed

#### 4. Transaction History
- **Wallet Screen** (`app/wallet.tsx`)
  - Displays last 10 transactions
  - Type, amount, date sorting
  - Color coding: topups (green) vs withdrawals (red)

### Database Changes

#### Reservations Table
```sql
reservations
├─ id: uuid (primary key)
├─ user_id: uuid (FK → profiles)
├─ venue_id: uuid (FK → venues)
├─ date_time: timestamptz
├─ party_size: int (1-50)
├─ deposit_xof: bigint
├─ qr_code: text (venue_id:user_id:timestamp hash)
├─ notes: text
├─ status: enum ('pending','confirmed','arrived','no_show','cancelled','refunded')
├─ created_at: timestamptz
├─ arrived_at: timestamptz
└─ cancelled_at: timestamptz
```

#### RLS Policy
Users can only see/create their own reservations + venue owners can see reservations for their venues.

### New Dependencies
- `@react-native-community/datetimepicker@^8.2.1` - Native date/time pickers
- `react-native-qrcode-svg@^6.2.0` - QR code generation

### Validation Schemas (Zod)
- `reservationFormSchema`: Validates date, party_size, notes
- `reservationSchema`: Full reservation with venue_id, date_time, etc.

### Navigation Structure
```
tabs/
├─ explore.tsx (updated: navigate to venue details)
├─ wallet.tsx (updated: transaction history)
└─ tickets.tsx (updated: show reservations)

venue/
├─ _layout.tsx (new)
└─ [id].tsx (new: venue detail screen)

reservation/
├─ _layout.tsx (new)
└─ [venueId].tsx (new: complete form flow)
```

### User Flow
1. **Browse** → Tap venue card in explore tab
2. **Details** → See full venue info + amenities
3. **Reserve** → Tap "Réserver une table" button
4. **Form** → Select date, time, party size, notes
5. **Review** → See price calculation & deposit
6. **Confirm** → QR code generated, reservation stored as pending
7. **Manage** → See reservation in Tickets tab

### Next Steps

#### Immediate (Payment Integration)
- [ ] Implement deposit payment via CinetPay
- [ ] Handle payment success/failure flows
- [ ] Send confirmation SMS to user

#### Short-term (Restaurant Workflow)
- [ ] Restaurant approval interface (web dashboard)
- [ ] Notification when status changes (pending→confirmed)
- [ ] QR scanning for check-in at venue
- [ ] Deposit refund on no-show after 2 hours

#### Medium-term (Features)
- [ ] Split Bill implementation
- [ ] Payment page design
- [ ] Review/rating after reservation completion
- [ ] SOS button with location tracking
- [ ] Social features (stories, chat, following)

### Testing Checklist
- [ ] Navigate venue card → detail screen
- [ ] Select date, time, party size
- [ ] Verify price calculations
- [ ] Confirm QR code generation
- [ ] Check reservation appears in Tickets tab
- [ ] Test with different venue data
- [ ] Verify RLS policies (users see only their own)

### Performance Considerations
- Date/time picker optimized for mobile (native UI)
- QR code generated client-side (no server calls)
- Reservations lazy-loaded with pagination (limit 10 for now)
- Venue details fetched once on navigation
