import { redirect } from 'next/navigation';
import { getOpenApiDocument } from '@/lib/api/openapi';
import { getAdminSession } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';

export default async function AdminApiDocsPage() {
  const admin = await getAdminSession();
  if (!admin) {
    redirect('/signin?redirect=/admin/api-docs');
  }

  if (!canViewPage(admin.role, 'operations_center')) {
    redirect('/admin/work?access=denied');
  }

  const spec = getOpenApiDocument();
  const paths = Object.entries(spec.paths) as Array<
    [string, Record<string, { summary?: string; tags?: string[] }>]
  >;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="admin-shell-surface-strong rounded-[28px] p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-500">
          Developer Contract
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-[color:var(--admin-shell-text)]">
          API Documentation
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--admin-shell-text-muted)]">
          Admin and reader API contract reference. The machine-readable OpenAPI document is
          available at <code>/api/docs/openapi.json</code>.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4">
        {paths.map(([path, methods]) => (
          <article key={path} className="admin-shell-surface rounded-[22px] p-5">
            <h2 className="font-mono text-sm font-bold text-[color:var(--admin-shell-text)]">
              {path}
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {Object.entries(methods).map(([method, operation]) => (
                <div
                  key={`${path}-${method}`}
                  className="rounded-2xl border border-[color:var(--admin-shell-border)] p-4"
                >
                  <span className="rounded-full bg-[color:var(--admin-shell-surface-muted)] px-3 py-1 font-mono text-xs font-bold uppercase text-[color:var(--admin-shell-text)]">
                    {method}
                  </span>
                  <p className="mt-3 text-sm font-semibold text-[color:var(--admin-shell-text)]">
                    {operation.summary || 'API operation'}
                  </p>
                  <p className="mt-2 text-xs text-[color:var(--admin-shell-text-muted)]">
                    {(operation.tags || []).join(', ') || 'General'}
                  </p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
