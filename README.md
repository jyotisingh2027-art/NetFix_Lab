# NetFixLab

Beginner networking course taught through comics. Live at https://netfixlab.tech

A single static page (`public/index.html`), no build step. Pushing to `main` deploys it to Cloudflare Workers (`netfix-lab`, configured in `wrangler.jsonc`), which serves netfixlab.tech, and to a GitHub Pages copy.

## Going live with real accounts and payments
Edit the `CONFIG` block near the top of the `<script>` in `public/index.html`:
- `paymentLink`: the Dodo Payments link for the full-course product (empty = payments not open yet)
- `supabaseUrl` / `supabaseKey`: Supabase project URL and publishable key (set). Database setup: run `supabase/schema.sql` once in the Supabase SQL editor.
- `socialProviders`: add `"google"` / `"facebook"` after enabling them in Supabase Auth
- `contactEmail`: shown in the Contact section
