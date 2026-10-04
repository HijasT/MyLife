import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Current user id for client-side, RLS-filtered queries. Uses getSession()
 * (reads the local cookie) instead of getUser() (a network round-trip that
 * revalidates the JWT). proxy.ts + dashboard/layout.tsx already revalidate on
 * every /dashboard/* request, so the client only needs the id — skipping the
 * round-trip saves one network wait on every page navigation.
 */
export async function getClientUser(client: ReturnType<typeof createClient>) {
  const { data: { session } } = await client.auth.getSession();
  return session?.user ?? null;
}
