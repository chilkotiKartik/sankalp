import { Suspense } from 'react';
import { NearbyCare } from '@/components/care/nearby-care';

export const metadata = { title: 'Nearby care — Sanjeevani' };

export default function CarePage() {
  return (
    <Suspense>
      <NearbyCare />
    </Suspense>
  );
}
