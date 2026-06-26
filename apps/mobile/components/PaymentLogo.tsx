import { View } from 'react-native';
import Svg, {
  Rect, Circle, Text as SvgText, Path, Defs, LinearGradient, Stop, G, TSpan,
} from 'react-native-svg';

/**
 * PaymentLogo (mobile) — version React Native du composant web.
 *
 * Doit rester strictement aligné avec :
 *   - apps/web/components/marketing/PaymentLogo.tsx (couleurs et formes)
 *   - public.payment_method_slugs() côté SQL (migration 0063)
 *
 * Utilisé sur :
 *   - écrans /orders et /hotel-bookings (panel "Moyens disponibles" avant
 *     "Payer maintenant" Paystack)
 *   - fiche venue (badge "Moyens acceptés")
 */

export type PaymentMethodName =
  | 'visa'
  | 'mastercard'
  | 'orange-money'
  | 'mtn-money'
  | 'moov-money'
  | 'wave'
  | 'paiya-pay';

interface Props {
  name: PaymentMethodName;
  /** Hauteur en pixels. Le ratio paysage 1.6:1 conserve la largeur calculée. */
  height?: number;
}

export function PaymentLogo({ name, height = 32 }: Props) {
  const width = Math.round(height * 3.2); // viewBox 160×50 → ratio 3.2
  return (
    <View accessibilityRole="image" accessibilityLabel={LABELS[name]}>
      {renderSvg(name, width, height)}
    </View>
  );
}

const LABELS: Record<PaymentMethodName, string> = {
  'visa':         'Visa',
  'mastercard':   'Mastercard',
  'orange-money': 'Orange Money',
  'mtn-money':    'MTN Mobile Money',
  'moov-money':   'Moov Money',
  'wave':         'Wave',
  'paiya-pay':    'Paiya-Pay',
};

function renderSvg(name: PaymentMethodName, w: number, h: number) {
  switch (name) {
    case 'visa':         return <VisaSvg width={w} height={h} />;
    case 'mastercard':   return <MastercardSvg width={w} height={h} />;
    case 'orange-money': return <OrangeMoneySvg width={w} height={h} />;
    case 'mtn-money':    return <MtnMoneySvg width={w} height={h} />;
    case 'moov-money':   return <MoovMoneySvg width={w} height={h} />;
    case 'wave':         return <WaveSvg width={w} height={h} />;
    case 'paiya-pay':    return <PaiyaPaySvg width={w} height={h} />;
  }
}

type SvgProps = { width: number; height: number };

function VisaSvg({ width, height }: SvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 160 50">
      <Rect width="160" height="50" rx="8" fill="#FFFFFF" />
      <Rect y="36" width="160" height="6" fill="#F7B600" />
      <Rect y="42" width="160" height="8" fill="#1A1F71" />
      <SvgText
        x="80" y="30"
        textAnchor="middle"
        fontFamily="Arial"
        fontWeight="900"
        fontSize="24"
        fontStyle="italic"
        fill="#1A1F71"
      >
        VISA
      </SvgText>
    </Svg>
  );
}

function MastercardSvg({ width, height }: SvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 160 50">
      <Rect width="160" height="50" rx="8" fill="#FFFFFF" />
      <Circle cx="68" cy="25" r="14" fill="#EB001B" />
      <Circle cx="92" cy="25" r="14" fill="#F79E1B" />
      <Path
        d="M80 13.5a14 14 0 0 1 0 23a14 14 0 0 1 0-23Z"
        fill="#FF5F00"
      />
      <SvgText
        x="80" y="46"
        textAnchor="middle"
        fontFamily="Arial"
        fontWeight="700"
        fontSize="6"
        fill="#1A1F71"
      >
        mastercard
      </SvgText>
    </Svg>
  );
}

function OrangeMoneySvg({ width, height }: SvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 160 50">
      <Rect width="160" height="50" rx="8" fill="#000000" />
      <G x={20} y={10}>
        <Rect x="0" y="14" width="4" height="14" rx="1.5" fill="#FFFFFF" />
        <Rect x="0" y="0" width="14" height="4" rx="1.5" fill="#FFFFFF" />
        <Path d="M14 0 L4 10 L4 18 L18 4 Z" fill="#FFFFFF" />
      </G>
      <G x={38} y={12}>
        <Rect x="14" y="0" width="4" height="14" rx="1.5" fill="#FF7900" />
        <Rect x="4" y="24" width="14" height="4" rx="1.5" fill="#FF7900" />
        <Path d="M0 24 L18 6 L18 14 L8 24 Z" fill="#FF7900" />
      </G>
      <SvgText
        x="78" y="32"
        fontFamily="Arial"
        fontWeight="700"
        fontSize="14"
        fill="#FFFFFF"
      >
        Orange Money
      </SvgText>
    </Svg>
  );
}

function MtnMoneySvg({ width, height }: SvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 160 50">
      <Rect width="160" height="50" rx="8" fill="#FFCB05" />
      <SvgText
        x="14" y="32"
        fontFamily="Arial"
        fontWeight="900"
        fontSize="22"
        fill="#000000"
      >
        MTN
      </SvgText>
      <SvgText
        x="64" y="22"
        fontFamily="Arial"
        fontWeight="800"
        fontSize="12"
        fill="#000000"
      >
        Mobile
      </SvgText>
      <SvgText
        x="64" y="36"
        fontFamily="Arial"
        fontWeight="800"
        fontSize="12"
        fill="#ED1C24"
      >
        Money
      </SvgText>
    </Svg>
  );
}

function MoovMoneySvg({ width, height }: SvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 160 50">
      <Rect width="160" height="50" rx="8" fill="#00549F" />
      <SvgText
        x="16" y="30"
        fontFamily="Arial"
        fontWeight="900"
        fontSize="18"
        fill="#FFFFFF"
      >
        Moov
      </SvgText>
      <Path
        d="M88 16 Q 110 12, 130 28 Q 132 30, 130 32 Q 110 18, 90 22 Z"
        fill="#F47A1F"
      />
      <SvgText
        x="84" y="42"
        fontFamily="Arial"
        fontWeight="700"
        fontSize="9"
        fill="#FFFFFF"
      >
        MONEY
      </SvgText>
    </Svg>
  );
}

function WaveSvg({ width, height }: SvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 160 50">
      <Rect width="160" height="50" rx="8" fill="#1DC8FB" />

      {/* Pingouin Wave (gauche) */}
      <G x={6} y={4}>
        {/* Bras levé */}
        <Path d="M 9 19 Q 1 14, 3 6 Q 5 1, 9 3 L 12 18 Z" fill="#000000" />
        {/* Corps noir */}
        <Circle cx="20" cy="23" r="17" fill="#000000" />
        {/* Ventre blanc */}
        <Circle cx="20" cy="27" r="11" fill="#FFFFFF" />
        {/* Œil gauche */}
        <Circle cx="14" cy="14" r="2" fill="#FFFFFF" />
        <Circle cx="14.3" cy="14.3" r="1.2" fill="#000000" />
        {/* Œil droit */}
        <Circle cx="24" cy="14" r="2" fill="#FFFFFF" />
        <Circle cx="24.3" cy="14.3" r="1.2" fill="#000000" />
        {/* Bec orange (diamant) */}
        <Path d="M 19 18 L 14 21 L 19 25 L 24 21 Z" fill="#FF9933" />
        {/* Pieds orange */}
        <Path d="M 12 40 a 4 2 0 1 0 8 0 a 4 2 0 1 0 -8 0 Z" fill="#FF9933" />
        <Path d="M 22 40 a 4 2 0 1 0 8 0 a 4 2 0 1 0 -8 0 Z" fill="#FF9933" />
      </G>

      {/* Texte "wave" en noir */}
      <SvgText
        x="56" y="32"
        fontFamily="Arial"
        fontWeight="900"
        fontSize="22"
        fill="#000000"
      >
        wave
      </SvgText>
    </Svg>
  );
}

function PaiyaPaySvg({ width, height }: SvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 160 50">
      <Defs>
        <LinearGradient id="paiya-bg-mobile" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#2E6BC8" />
          <Stop offset="100%" stopColor="#F58220" />
        </LinearGradient>
      </Defs>
      <Rect width="160" height="50" rx="8" fill="url(#paiya-bg-mobile)" />
      <G x={12} y={8}>
        <Path d="M14 0 C 6 0, 0 6, 0 14 C 0 22, 14 34, 14 34 C 14 34, 28 22, 28 14 C 28 6, 22 0, 14 0 Z" fill="#FFFFFF" />
        <Circle cx="14" cy="14" r="6" fill="#2E6BC8" />
      </G>
      <SvgText
        x="52" y="32"
        fontFamily="Arial"
        fontWeight="900"
        fontSize="20"
        fill="#FFFFFF"
      >
        Paiya<TSpan fill="#FFE5C2">-Pay</TSpan>
      </SvgText>
    </Svg>
  );
}
