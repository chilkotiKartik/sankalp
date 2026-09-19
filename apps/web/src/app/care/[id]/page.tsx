import { Suspense } from 'react';
import { FacilityDetails } from '@/components/care/facility-details';

export const metadata = { title: 'Hospital details — Sanjeevani' };

export default async function FacilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <FacilityDetails id={decodeURIComponent(id)} />
    </Suspense>
  );
}
