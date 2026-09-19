import { SummaryView } from '@/components/history/summary-view';

export const metadata = { title: 'Care summary — Sanjeevani' };

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SummaryView id={id} />;
}
