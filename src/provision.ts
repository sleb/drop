import type { Ctx } from "./ctx.ts";
import type { Step } from "./steps.ts";

const seconds = (since: number) => `${((performance.now() - since) / 1000).toFixed(1)}s`;

export const provision = async (ctx: Ctx, steps: Step[]): Promise<void> => {
  const start = performance.now();
  for (const [i, step] of steps.entries()) {
    const t = performance.now();
    ctx.log(`==> [${i + 1}/${steps.length}] ${step.name}`);
    if (step.done && (await step.done(ctx))) {
      ctx.log("    already done");
      continue;
    }
    try {
      await step.run(ctx);
    } catch (err) {
      throw new Error(`"${step.name}" failed: ${err instanceof Error ? err.message : err}`);
    }
    // Re-check so a command that "succeeded" without doing its job fails loudly
    // here instead of breaking a later step.
    if (!ctx.dryRun && step.done && !(await step.done(ctx))) {
      throw new Error(`"${step.name}" ran but its check still fails`);
    }
    ctx.log(`    ok (${seconds(t)})`);
  }
  ctx.log(`==> Finished ${steps.length} steps in ${seconds(start)}`);
};
