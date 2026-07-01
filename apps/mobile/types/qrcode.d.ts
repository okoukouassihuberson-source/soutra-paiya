// Déclaration TS minimale pour `qrcode` (npm, ^1.5) disponible en transitive
// dep via react-native-qrcode-svg. Évite d'ajouter @types/qrcode en devDep
// juste pour les 2 signatures qu'on utilise dans lib/ticket-pdf.ts.
declare module 'qrcode' {
  export interface QRCodeToStringOptions {
    type?: 'svg' | 'terminal' | 'utf8';
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    scale?: number;
    width?: number;
    color?: { dark?: string; light?: string };
    version?: number;
  }
  export interface QRCodeToDataURLOptions extends QRCodeToStringOptions {
    type?: 'image/png' | 'image/jpeg' | 'image/webp';
    rendererOpts?: { quality?: number };
  }

  export function toString(
    text: string,
    options?: QRCodeToStringOptions,
  ): Promise<string>;

  export function toDataURL(
    text: string,
    options?: QRCodeToDataURLOptions,
  ): Promise<string>;

  const QRCode: {
    toString: typeof toString;
    toDataURL: typeof toDataURL;
  };
  export default QRCode;
}
