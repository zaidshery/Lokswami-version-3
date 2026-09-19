import { AsyncLocalStorage } from 'node:async_hooks';

type AdminMutationActor = {
  id: string;
  email: string;
  role: string;
};

type AdminMutationContext = {
  actor: AdminMutationActor | null;
  csrfBlocked: boolean;
};

const adminMutationStorage = new AsyncLocalStorage<AdminMutationContext>();

export function runWithAdminMutationContext<T>(
  context: AdminMutationContext,
  operation: () => T
) {
  return adminMutationStorage.run(context, operation);
}

export function getAdminMutationContext() {
  return adminMutationStorage.getStore() || null;
}

/**
 * Called by the canonical admin-session helpers after identity validation.
 * Returning false makes the helper withhold the session from a cross-site
 * mutation, so the route cannot reach any side effect. The outer mutation
 * wrapper then converts the route's ordinary 401 into CSRF_BLOCKED (403).
 */
export function registerAdminMutationActor(actor: AdminMutationActor) {
  const context = adminMutationStorage.getStore();
  if (!context) return true;

  context.actor = actor;
  return !context.csrfBlocked;
}
