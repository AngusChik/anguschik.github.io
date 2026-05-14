# BikeSafe

A cycling route planner that finds safe, bike-friendly routes using real road infrastructure data. Compare three route options — shortest, safest, and scenic — with detailed risk assessment, elevation profiles, and turn-by-turn directions.

## Features

- **Route Comparison** — view shortest, safest, and scenic routes side by side
- **Risk Assessment** — color-coded segments (green/amber/red) based on road surface, steepness, suitability, and road type
- **Elevation Profiles** — interactive SVG chart with hover scrubbing to follow the route on the map
- **Turn-by-Turn Directions** — step-by-step navigation with click-to-focus
- **Route Sharing** — QR code generation, SMS, email, and clipboard sharing
- **Cycle Path Overlay** — toggle dedicated cycling infrastructure on the map
- **Geolocation** — automatically centers on your location (defaults to Mississauga, ON)
- **Drag-and-Drop** — reposition origin and destination markers directly on the map

## Tech Stack

- **React 19** with Vite 7
- **MapLibre GL JS** for vector map rendering
- **OpenRouteService API** for cycling route calculation
- **MapTiler** for basemap tiles and geocoding

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- A [MapTiler](https://www.maptiler.com/) API key
- An [OpenRouteService](https://openrouteservice.org/) API key

## Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/AngusChik/BikeSafe.git
   cd BikeSafe
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root:

   ```
   VITE_MAPTILER_KEY=your_maptiler_key
   VITE_ORS_KEY=your_openrouteservice_key
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:5173](http://localhost:5173) in your browser.

## Project Structure

```
src/
  components/
    BikeSafeMap.jsx        # Main map and routing logic
    GeoAutocomplete.jsx    # Location search with autocomplete
    RouteInsights.jsx      # Elevation profile and route stats
    ShareButtons.jsx       # SMS, email, and clipboard sharing
    ErrorBoundary.jsx      # React error boundary
  utils/
    scoring.js             # Route risk and scenic scoring utilities
  App.jsx                  # Root component
  main.jsx                 # Entry point
  styles.css               # Application styles
public/
  404.html                 # SPA routing fallback
```

## Building for Production

```bash
npm run build
```

Output is written to the `dist/` directory.

## Deployment

GitHub Pages deployment is configured via `.github/workflows/deploy.yml`. It triggers on pushes to `main` and requires two repository secrets:

- `VITE_MAPTILER_KEY`
- `VITE_ORS_KEY`

## License

This project is licensed under the [MIT License](LICENSE).
