import { createApp } from "./app";
import { sweepOrphanedMirrors } from "./rehearsal/mirror";

const PORT = Number(process.env.PORT ?? 4317);

const swept = await sweepOrphanedMirrors();
if (swept > 0) {
  console.log(`Removed ${swept} orphaned rehearsal clone(s) left by a previous run.`);
}

createApp().listen(PORT, () => {
  console.log(`Foresight server listening on http://localhost:${PORT}`);
});
