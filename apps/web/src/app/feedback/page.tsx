import { Suspense } from 'react';
import { FeedbackView } from '@/components/settings/feedback-view';

export const metadata = { title: 'Feedback — Sanjeevani' };

export default function FeedbackPage() {
  return (
    <Suspense>
      <FeedbackView />
    </Suspense>
  );
}
