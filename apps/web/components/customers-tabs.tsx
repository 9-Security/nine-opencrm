import Link from 'next/link';
import { cn } from '@/lib/utils';

export function CustomersTabs({ active }: { active: 'companies' | 'contacts' }) {
  return (
    <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
      <Link
        href="/companies"
        className={cn(
          'rounded-lg px-3 py-1.5',
          active === 'companies' ? 'bg-white font-medium shadow-sm' : 'text-slate-600',
        )}
      >
        公司
      </Link>
      <Link
        href="/contacts"
        className={cn(
          'rounded-lg px-3 py-1.5',
          active === 'contacts' ? 'bg-white font-medium shadow-sm' : 'text-slate-600',
        )}
      >
        聯絡人
      </Link>
    </div>
  );
}
