# HRC Preflop Study MVP

Small React + Vite app for browsing HRC preflop solver trees through a local Node API.

## Requirements

- Node.js 20+ recommended
- npm
- `unzip` for extracting the bundled solver data archive

## Install

```bash
npm install
npm run data:unpack
```

## Run locally

```bash
npm run dev
```

The API runs on `http://localhost:5174`.
The Vite app runs on the local URL printed by Vite, usually `http://localhost:5173`.

## Data

The app needs the solver data folders to run. The raw data folders are large and ignored by Git, so the repository includes them as a compressed archive:

```text
data/hrc-preflop-data.zip
```

Extract it before running the app:

```bash
npm run data:unpack
```

This creates the required stack folders in the project root. Each stack folder must contain:

```text
15bb/
  settings.json
  nodes/
    0.json
    ...
```

By default, the server reads data from the project root. You can keep large data outside the GitHub repo and point the server to it:

```bash
HRC_DATA_ROOT=/path/to/hrc-data npm run dev
```

On Windows PowerShell without `unzip`, extract manually:

```powershell
Expand-Archive -Path data/hrc-preflop-data.zip -DestinationPath . -Force
```

## Validate Data

```bash
npm run validate-data
```

## Build

```bash
npm run build
npm run preview
```
