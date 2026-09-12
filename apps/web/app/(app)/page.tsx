import Link from 'next/link';
import { opportunitiesRepo, reportsRepo } from '@crm/db';
import {
  OPPORTUNITY_STAGE_LABELS,
  canAccessSettings,
  canWriteAnySchedule,
  canWriteCompanies,
  canWriteOpportunities,
  canWriteTickets,
  type OpportunityStage,
} from '@crm/shared';
import { PageHeader } from '@/components/app-shell';
import { GettingStarted } from '@/components/getting-started';
import { TodayActivities } from '@/components/today-activities';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { requireTenant } from '@/lib/tenant';

export default async function HomePage() {
  const ctx = await requireTenant();
  const [summary, inbox] = await Promise.all([
    reportsRepo.dashboardSummary(ctx.tenantId),
    opportunitiesRepo.listActivities(ctx.tenantId, { inbox: true, take: 8 }),
  ]);
  const funnel = Object.fromEntries(
    summary.funnel.map((row) => [row.stage, row._count._all]),
  ) as Partial<Record<OpportunityStage, number>>;

  const cards = [
    { label: '未結工單', value: summary.openTickets, href: '/tickets' },
    { label: '本週排程', value: summary.weekSchedules, href: '/schedules' },
    { label: '今日待辦', value: summary.todayTodos, href: '/opportunities' },
    { label: '客戶數', value: summary.companyCount, href: '/companies' },
  ];

  const steps = [
    ...(canWriteCompanies(ctx.role)
      ? [
          {
            href: '/companies/new',
            label: '新增第一間公司',
            hint: '客戶主檔，後續都能關聯',
          },
        ]
      : []),
    ...(canWriteOpportunities(ctx.role)
      ? [{ href: '/opportunities/new', label: '建立一筆商機', hint: '從潛在跟到成交' }]
      : []),
    ...(canWriteTickets(ctx.role)
      ? [{ href: '/tickets/new', label: '開一張工單', hint: '指派、留言、關聯排程' }]
      : []),
    ...(canAccessSettings(ctx.role)
      ? [
          {
            href: '/settings',
            label: '邀請同事',
            hint: '系統不會寄信，請複製邀請連結傳給對方',
          },
        ]
      : []),
  ];

  return (
    <div>
      <p className="mb-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
        這是試用版，方便收集使用回饋。目前沒有訂單／合約模組；邀請同事請到設定複製連結（不會寄信）。
      </p>
      <PageHeader
        title={`你好，${ctx.name ?? ctx.email}`}
        description={`${ctx.tenantName} 摘要`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canWriteOpportunities(ctx.role) ? (
              <Link href="/opportunities/new">
                <Button>新建商機</Button>
              </Link>
            ) : null}
            {canWriteTickets(ctx.role) ? (
              <Link href="/tickets/new">
                <Button variant="outline">新建工單</Button>
              </Link>
            ) : null}
            {canWriteAnySchedule(ctx.role) ? (
              <Link href="/schedules/new">
                <Button variant="outline">新建排程</Button>
              </Link>
            ) : null}
            {canWriteCompanies(ctx.role) ? (
              <Link href="/companies/new">
                <Button variant="secondary">新建公司</Button>
              </Link>
            ) : null}
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href}>
            <Card className="transition hover:border-accent/40">
              <CardBody>
                <p className="text-sm text-slate-500">{c.label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">{c.value}</p>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
      {summary.companyCount === 0 ? <GettingStarted steps={steps} /> : null}
      <TodayActivities
        activities={inbox.map((a) => ({
          ...a,
          dueAt: a.dueAt ? a.dueAt.toISOString() : null,
        }))}
        canWrite={canWriteOpportunities(ctx.role)}
      />
      <Card className="mt-6">
        <CardBody>
          <h2 className="text-sm font-semibold text-slate-800">商機漏斗摘要</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(Object.keys(OPPORTUNITY_STAGE_LABELS) as OpportunityStage[]).map(
              (stage) => (
                <div key={stage} className="rounded-xl bg-slate-50 px-3 py-3">
                  <div className="text-xs text-slate-500">
                    {OPPORTUNITY_STAGE_LABELS[stage]}
                  </div>
                  <div className="mt-1 text-xl font-semibold">{funnel[stage] ?? 0}</div>
                </div>
              ),
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
