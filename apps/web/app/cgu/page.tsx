import { LegalPage, legalMetadata } from '@/components/legal/LegalPage';

export const generateMetadata = () => legalMetadata('terms');
export default function Page() { return <LegalPage docKey="terms" />; }
