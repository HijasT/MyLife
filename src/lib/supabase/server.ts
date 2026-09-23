import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from Server Component — safe to ignore
          }
        },
      },
    }
  );
}

/**
 * `supabase.auth.getUser()` is a real network round-trip (it revalidates the
 * JWT against Supabase's auth server rather than trusting the local cookie),
 * so calling it separately in both dashboard/layout.tsx and dashboard/page.tsx
 * meant two of those round-trips back to back on every dashboard root load
 * (on top of the one proxy.ts middleware already does). React's cache()
 * memoizes this per request, so both server components share one call.
 */
export const getAuthenticatedUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});
