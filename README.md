<h1 align="center">Foresight</h1>

<p align="center">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20%2B-5FA04E?logo=node.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white">
  <img alt="D3.js" src="https://img.shields.io/badge/D3.js-7-F9A03C?logo=d3.js&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white">
  <img alt="Vitest" src="https://img.shields.io/badge/Vitest-3-6E9F18?logo=vitest&logoColor=white">
</p>

<p align="center">
  A local web app that visualises a git repository and lets you rehearse a pasted git command in a throwaway clone before running it for real.
</p>

## Run it

```sh
npm install
npm start
```

That builds the frontend and serves it with the API at http://127.0.0.1:4317.

To work on Foresight itself, `npm run dev` runs the frontend and the backend separately and prints both addresses.

## Requirements

Node 20 or newer. Rehearsal needs Linux or WSL, where the network-isolation sandbox can run. The commit graph, the repository browser, and the rest of the read-only surfaces work anywhere, including macOS.
