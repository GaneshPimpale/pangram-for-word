# Hosting the pane on a Next.js (App Router) site

1. Add the package and a prebuild step to your site's `package.json`:

   ```json
   "scripts": { "prebuild": "pangram-for-word-publish . https://your-site.com/pangram" },
   "dependencies": { "pangram-for-word": "github:GaneshPimpale/pangram-for-word" }
   ```

   The prebuild copies the pane into `public/pangram/` and writes a matching
   `manifest.xml` there. Add `/public/pangram/` to `.gitignore`; it is generated.

2. Copy `app/pangram/api/status/route.ts` and `app/pangram/api/analyze/route.ts` from
   this folder into your site. They are one-line wrappers around the package's handlers.
   `app/pangram/page.tsx` is an optional landing page with a manifest download link.

3. Deploy. Leave `PANGRAM_API_KEY` unset on the host; users paste their own key in the pane.

To pick up a new add-in version: `npm update pangram-for-word`, commit the lockfile, deploy.
