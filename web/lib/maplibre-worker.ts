import { setWorkerUrl } from "maplibre-gl";

// maplibre-gl 6 looks for its worker next to its own module file, which a bundler moves and renames,
// so every map stayed black with "Worker failed to load" (soma#917). Point it at the worker file as an
// asset the bundler emits. Import this module before any map is created.
setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
