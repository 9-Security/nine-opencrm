'use client';

import { useSearchParams } from 'next/navigation';

export function usePrefillParam(name: string) {
  const params = useSearchParams();
  return params.get(name);
}
