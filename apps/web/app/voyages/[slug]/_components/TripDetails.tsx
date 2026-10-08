import type { ReactNode } from 'react';
import { formatTripDates, type Trip, type TripItineraryDay } from '@soutra/shared';
import type { I18n } from '@/lib/i18n/t';

/**
 * Corps de la fiche voyage (national ET international) : l'essentiel d'un coup d'œil, puis des blocs
 * courts et regroupés au lieu d'un long tableau. Les groupes sans donnée disparaissent ; les voyages
 * internationaux gardent vol / hôtel / transfert / visa / assurance, les nationaux ne montrent que ce qui est renseigné.
 */

type IconName = 'clock' | 'calendar' | 'pin' | 'users' | 'bus' | 'bed' | 'shield' | 'check' | 'cross' | 'chevron' | 'sparkle';

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', className, 'aria-hidden': true } as const;
  switch (name) {
    case 'clock': return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case 'calendar': return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>;
    case 'pin': return <svg {...p}><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>;
    case 'users': return <svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .6 3.2 2.3 3.5 5.2" /></svg>;
    case 'bus': return <svg {...p}><rect x="4" y="4" width="16" height="13" rx="3" /><path d="M4 11h16M8 21v-4M16 21v-4" /><circle cx="8" cy="14" r=".6" /><circle cx="16" cy="14" r=".6" /></svg>;
    case 'bed': return <svg {...p}><path d="M3 18V6M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" /><circle cx="7" cy="11" r="1.6" /></svg>;
    case 'shield': return <svg {...p}><path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>;
    case 'check': return <svg {...p}><path d="M5 12.5l4.2 4.2L19 7" /></svg>;
    case 'cross': return <svg {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case 'chevron': return <svg {...p}><path d="M6 9l6 6 6-6" /></svg>;
    case 'sparkle': return <svg {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>;
  }
}

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : null);

function Fact({ icon, label, value, tone = 'default' }: { icon: IconName; label: string; value: string; tone?: 'default' | 'alert' }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 max-lg:[&:last-child:nth-child(odd)]:col-span-2">
      <span className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl ${tone === 'alert' ? 'bg-red-100 text-red-700' : 'bg-primary-100 text-primary-700'}`}>
        <Icon name={icon} />
      </span>
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold leading-snug text-dark">{value}</p>
    </div>
  );
}

function Group({ icon, title, rows }: { icon: IconName; title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
      <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold text-dark">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary-700"><Icon name={icon} className="h-4 w-4" /></span>
        {title}
      </h3>
      <dl className="space-y-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{k}</dt>
            <dd className="mt-0.5 text-sm text-dark">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-24">
      <h2 id={`${id}-t`} className="mb-3 font-display text-xl font-bold text-dark">{title}</h2>
      {children}
    </section>
  );
}

export function TripDetails({ i, trip, days, left }: { i: I18n; trip: Trip; days: TripItineraryDay[]; left: number }) {
  const { t, field, list } = i;
  const inclusions = list(trip, 'inclusions'), exclusions = list(trip, 'exclusions'), activities = list(trip, 'activities');
  const conditions = field(trip, 'conditions');

  const departure = trip.departure_point && trip.departure_time
    ? t('trip.departureAt', { place: trip.departure_point, time: hhmm(trip.departure_time)! })
    : (trip.departure_point ?? hhmm(trip.departure_time));
  const dates = formatTripDates(trip.starts_on, trip.ends_on, i.intl);

  type RawGroup = { icon: IconName; title: string; rows: Array<[string, string | null | undefined]> };
  const raw: RawGroup[] = [
    { icon: 'clock', title: t('tripx.groupDeparture'), rows: [[t('trip.departure'), departure], [t('trip.return'), hhmm(trip.return_time)]] },
    { icon: 'bus', title: t('tripx.groupTransport'), rows: [[t('trip.transport'), field(trip, 'transport')], [t('trip.flight'), field(trip, 'flight_info')], [t('trip.transfer'), field(trip, 'transfer_info')]] },
    { icon: 'bed', title: t('tripx.groupStay'), rows: [[t('trip.lodging'), field(trip, 'lodging')], [t('trip.hotel'), field(trip, 'hotel_info')], [t('trip.meals'), field(trip, 'meals')]] },
    { icon: 'shield', title: t('tripx.groupFormalities'), rows: [[t('trip.insurance'), field(trip, 'insurance_info')], [t('trip.visa'), field(trip, 'visa_info')]] },
  ];
  const groups = raw
    .map((g) => ({ icon: g.icon, title: g.title, rows: g.rows.filter((r): r is [string, string] => !!r[1]) }))
    .filter((g) => g.rows.length > 0);

  const hasIncluded = inclusions.length > 0 || exclusions.length > 0 || activities.length > 0;
  const nav = [
    { id: 'details', label: t('tripx.navDetails') },
    hasIncluded && { id: 'included', label: t('tripx.navIncluded') },
    days.length > 0 && { id: 'program', label: t('tripx.navProgram') },
    conditions && { id: 'conditions', label: t('tripx.navConditions') },
  ].filter(Boolean) as Array<{ id: string; label: string }>;

  return (
    <>
      <nav aria-label={t('tripx.sectionNav')} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
          {nav.map((n) => (
            <li key={n.id}><a href={`#${n.id}`} className="inline-flex min-h-[40px] items-center rounded-full border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-700 transition hover:border-primary-400 hover:text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500">{n.label}</a></li>
          ))}
        </ul>
      </nav>

      <section aria-label={t('tripx.quickFacts')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Fact icon="clock" label={t('tripx.factDuration')} value={t('trip.duration', { n: trip.duration_days })} />
          <Fact icon="calendar" label={t('tripx.factDates')} value={dates} />
          {departure && <Fact icon="pin" label={t('tripx.factDeparture')} value={departure} />}
          <Fact icon="users" label={t('tripx.factSeats')} value={left === 0 ? t('booking.full') : i.tn('tripx.spotsLeft', left)} tone={left > 0 && left <= 5 ? 'alert' : 'default'} />
        </div>
      </section>

      <Section id="details" title={t('trip.info')}>
        {groups.length > 0
          ? <div className="grid gap-3 sm:grid-cols-2">{groups.map((g) => <Group key={g.title} {...g} />)}</div>
          : <p className="rounded-2xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">{t('tripx.noDetails')}</p>}
      </Section>

      {hasIncluded && (
        <Section id="included" title={t('tripx.includedHeading')}>
          {(inclusions.length > 0 || exclusions.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {inclusions.length > 0 && (
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
                  <h3 className="mb-3 font-display text-base font-bold text-dark">{t('common.included')}</h3>
                  <ul className="space-y-2 text-sm text-dark">
                    {inclusions.map((x) => (
                      <li key={x} className="flex gap-2"><span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700"><Icon name="check" className="h-3.5 w-3.5" /></span><span>{x}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              {exclusions.length > 0 && (
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
                  <h3 className="mb-3 font-display text-base font-bold text-dark">{t('common.notIncluded')}</h3>
                  <ul className="space-y-2 text-sm text-neutral-700">
                    {exclusions.map((x) => (
                      <li key={x} className="flex gap-2"><span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-600"><Icon name="cross" className="h-3 w-3" /></span><span>{x}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {activities.length > 0 && (
            <div className={inclusions.length > 0 || exclusions.length > 0 ? 'mt-5' : ''}>
              <h3 className="mb-2 flex items-center gap-2 font-display text-base font-bold text-dark"><Icon name="sparkle" className="h-4 w-4 text-primary-600" />{t('trip.activities')}</h3>
              <ul className="flex flex-wrap gap-2">
                {activities.map((x) => <li key={x} className="rounded-full bg-primary-100 px-3 py-1.5 text-sm font-medium text-primary-800">{x}</li>)}
              </ul>
            </div>
          )}
        </Section>
      )}

      {days.length > 0 && (
        <Section id="program" title={t('trip.program')}>
          <p className="-mt-2 mb-3 text-sm text-neutral-600">{t('tripx.daysCount', { n: days.length })}</p>
          <ol className="space-y-2">
            {days.map((d, idx) => {
              const title = field(d as never, 'title') ?? d.title;
              const desc = field(d as never, 'description');
              const body = d.stops.length > 0 || !!desc;
              return (
                <li key={d.id}>
                  <details open={idx === 0} className="group rounded-2xl border border-neutral-200 bg-white">
                    <summary className={`flex min-h-[56px] list-none items-center gap-3 rounded-2xl p-3 sm:p-4 [&::-webkit-details-marker]:hidden ${body ? 'cursor-pointer' : 'pointer-events-none'}`}>
                      <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-primary-100 leading-none text-primary-800">
                        <span className="text-[10px] font-bold uppercase">{t('trip.day', { n: d.day_number }).replace(/\s*\d+\s*$/, '').slice(0, 4)}</span>
                        <span className="text-base font-bold">{d.day_number}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-dark">{title}</span>
                        {d.stops.length > 0 && <span className="block text-xs text-neutral-500">{i.tn('tripx.stopsCount', d.stops.length)}</span>}
                      </span>
                      {body && <Icon name="chevron" className="h-5 w-5 shrink-0 text-neutral-500 transition-transform group-[[open]]:rotate-180 motion-reduce:transition-none" />}
                    </summary>
                    {body && (
                      <div className="border-t border-neutral-100 px-4 pb-4 pt-3 sm:pl-[4.25rem]">
                        {d.stops.length > 0 && (
                          <ul className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-medium text-neutral-700">
                            {d.stops.map((s, k) => (
                              <li key={`${s}-${k}`} className="inline-flex items-center gap-1.5">
                                <span className="rounded-full bg-neutral-100 px-2.5 py-1">{s}</span>
                                {k < d.stops.length - 1 && <span aria-hidden="true" className="text-neutral-400">→</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                        {desc && <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">{desc}</p>}
                      </div>
                    )}
                  </details>
                </li>
              );
            })}
          </ol>
        </Section>
      )}

      {conditions && (
        <section id="conditions" className="scroll-mt-24">
          <details className="group rounded-2xl border border-neutral-200 bg-white">
            <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 [&::-webkit-details-marker]:hidden">
              <h2 className="font-display text-xl font-bold text-dark">{t('common.conditions')}</h2>
              <Icon name="chevron" className="h-5 w-5 shrink-0 text-neutral-500 transition-transform group-[[open]]:rotate-180 motion-reduce:transition-none" />
            </summary>
            <p className="whitespace-pre-line border-t border-neutral-100 px-4 pb-4 pt-3 text-sm leading-relaxed text-neutral-700">{conditions}</p>
          </details>
        </section>
      )}
    </>
  );
}
