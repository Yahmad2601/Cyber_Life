# Cyber Life

A security-awareness city sim. Organisations get a tower in an isometric Lagos/Abuja
skyline (styled after the *Silicon Valley* title sequence). Staff walk the city,
network with people from other organisations, and get hit with simulated attacks
(phishing, BEC, and more) that they have to spot and respond to.

## Run it

```bash
npm install
npm run dev
```

## What the prototype does

- An isometric three.js city with three districts: Marina (finance), Victoria Island
  (tech/telco/energy) and the Central Business District (government). It also has
  traffic, a blimp and clouds, and the camera drifts on its own when nobody is using it.
- Nine **fictional** placeholder organisations, each with its own landmark archetype
  (twin towers, stepped tower, cylinder, prism roof, spire, domed ministry).
- Click a tower to open its panel. Then run a **Phishing** or **BEC** drill: an attack
  packet arcs in, the tower flashes, and an inbox opens. The player clicks the red
  flags and picks a response, then gets a scored debrief. The result feeds back into
  the org's human-risk posture.

| File | Purpose |
|---|---|
| `src/orgs.js` | Districts, bridges, organisation data |
| `src/city.js` | Procedural city, building archetypes, GLB swap-in |
| `src/scenarios.js` | Drill content (red flags, actions, feedback) |
| `src/drill.js` | Inbox UI, scoring, debrief |
| `src/main.js` | Renderer, camera, picking, panel, attack animation |

## Blender pipeline

Model a landmark in Blender and export it as glTF binary (`.glb`) to
`public/models/<org-id>.glb`, for example `public/models/lagoon-tel.glb`. The city
loads that file instead of the procedural placeholder, scales it to fit the 10×10
block and keeps its rooftop sign. Tips:

- Use low-poly, flat-shaded models with a small pastel palette to keep the
  title-sequence look. Skip photoreal textures.
- Apply transforms and set the origin at the base centre. Y-up is the glTF default.
- Keep each building under about 20k triangles and use Draco compression for production.

## Reference data: don't use Google Earth geometry

Google's terms forbid extracting or exporting 3D models from Google Earth or Maps,
so don't trace or rip buildings from it. Legitimate sources:

- **OpenStreetMap** building footprints and heights (ODbL, attribution required).
  Use the Blender add-on *blosm* or export from overpass-turbo.
- Your own photos, or photos with permission, as modelling reference.
- Stylised originals. The title-sequence look is a caricature anyway, so an
  "inspired by" landmark reads better than a literal replica.

## Branding and legal

Real banks, corporates and ministries appear only as tenants who have signed up.
Their names, logos and domains are trademarks, and a phishing simulator that
features an organisation without its consent is a reputational and legal risk.
Drills should run only against staff of organisations that have contracted for
them, with HR/legal sign-off. Training simulations also fall under NDPA 2023.

## Roadmap

1. **Accounts and tenancy**: org admins, SSO (Entra ID / Google Workspace), staff invites.
2. **Avatars and multiplayer**: walkable streets, lobbies inside towers, chat and
   networking (Colyseus or a WebSocket server, presence, moderation).
3. **Scenario engine**: author scenarios as data with difficulty tiers. Add
   smishing, vishing (audio), fake invoices, USB drops, QR phishing, MFA fatigue
   and deepfake-CEO calls.
4. **Live drills**: scheduled surprise campaigns delivered *inside* the sim, plus
   optional real-inbox campaigns (GoPhish-style) for consenting orgs.
5. **Analytics**: per-org posture over time, department heatmaps, a leaderboard
   between organisations, and exportable reports for regulators and audits.
6. **City events**: city-wide incidents such as a ransomware outbreak spreading
   tower to tower, which staff contain together.
