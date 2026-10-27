# NetFixLab

Beginner networking course taught through comics. Live at https://netfixlab.tech

A single static page (`index.html`), no build step. Pushing to `main` deploys it to GitHub Pages.

## Going live with real accounts and payments
Edit the `CONFIG` block near the top of the `<script>` in `index.html`:
- `paymentLink`: a Razorpay or Stripe payment link (empty = demo unlock, no charge)
- `supabaseUrl` / `supabaseKey`: Supabase project URL and public anon key (empty = accounts stored only in the visitor's browser)
- `contactEmail`: shown in the Contact section
