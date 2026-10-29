import { createBlogEdgeHandler } from './edge-handler.mjs';

Deno.serve(createBlogEdgeHandler({
  base: Deno.env.get('SUPABASE_URL'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
}));
