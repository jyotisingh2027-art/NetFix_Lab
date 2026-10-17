# Fix the Network

A browser game for CCNA learners. Each level is a broken network: read the story, use simulated
Cisco IOS `show` commands to find the fault, then `configure terminal` to fix it. Earn up to 3 stars per
level (fix, par time, par commands). A hint costs half a star, Show Answer costs one, and a fix always
keeps at least half a star. Levels unlock one at a time; progress is saved in the browser (localStorage).
Terminal output is simplified. Not affiliated with Cisco.

React 18 + TypeScript + Vite. No backend.

## Run
```
npm install
npm run dev        # http://localhost:5173
```

## Build
```
npm run build      # outputs dist/
npm run preview    # serve dist/ locally
```

## GitHub Pages
Project sites are served from `/<repo-name>/`, so set the base path when building:
```
VITE_BASE=/<repo-name>/ npm run build
```
Then publish `dist/` (for example with a GitHub Actions Pages workflow, or push dist/ to a gh-pages branch).
Without `VITE_BASE` the base is `./`, which works from any sub-path and for user/organisation sites.

## Layout
- `src/App.tsx`    screens (Home, About, Levels, Play), scoring, terminal simulator
- `src/levels.ts`  the 10 levels and their answers
- `src/ui.tsx`     small layout components
- `src/style.css`  styles
