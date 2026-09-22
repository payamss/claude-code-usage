import { Suspense } from 'react';
import BurnView from '@/components/BurnView';

export default function Page() {
  return <Suspense><BurnView /></Suspense>;
}
