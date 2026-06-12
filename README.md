# HRC Preflop Study MVP

Small React + Vite app for browsing HRC preflop solver trees through a local Node API.

## Requirements

- Node.js 20+ recommended
- npm
- Solver data folders such as `10bb`, `12bb`, `15bb`, `20bb`, and `25bb`

## Install

```bash
npm install
```

## Run locally

```bash
npm run dev
```

The API runs on `http://localhost:5174`.
The Vite app runs on the local URL printed by Vite, usually `http://localhost:5173`.

## Data

The app needs the solver data folders to run. The data folders are intentionally not committed to GitHub because they are large. Each stack folder must contain:

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

This is useful if the data is stored separately, for example in a Hugging Face Dataset.

Example with Hugging Face CLI after uploading the data to a Dataset repo:

```bash
hf download Bangchis/poker-solver-mvp-data --type dataset --local-dir ./data
HRC_DATA_ROOT=./data npm run dev
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
