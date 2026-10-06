import { LegalPage, legalMetadata } from '@/components/legal/LegalPage';

export const generateMetadata = () => legalMetadata('about');
export default function Page() { return <LegalPage docKey="about" />; }
