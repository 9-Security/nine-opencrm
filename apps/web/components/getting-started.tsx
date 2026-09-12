import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/components/ui/card';

type Step = { href: string; label: string; hint: string };

export function GettingStarted({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return null;
  return (
    <Card className="mt-6 border-accent/30">
      <CardHeader>
        <h2 className="text-sm font-semibold text-slate-800">開始使用</h2>
      </CardHeader>
      <CardBody>
        <p className="text-sm text-slate-600">
          先建立一間公司，之後的聯絡人、商機與工單都可以關聯過去。
        </p>
        <ol className="mt-4 space-y-3">
          {steps.map((step, i) => (
            <li key={step.href} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-50 text-xs font-semibold text-accent-600">
                {i + 1}
              </span>
              <div>
                <Link
                  href={step.href}
                  className="font-medium text-accent hover:underline"
                >
                  {step.label}
                </Link>
                <p className="text-xs text-slate-500">{step.hint}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}
