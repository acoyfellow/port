import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const variants = [
  { id: 'search-lite', instanceType: 'lite' },
  { id: 'search-basic', instanceType: 'basic' },
  { id: 'search-standard', instanceType: 'standard-1' },
  { id: 'search-diagnostic', instanceType: 'lite' },
];
for (const variant of variants) {
  if (process.argv[2] && process.argv[2] !== variant.id) continue;
  const directory = new URL(`../../shapes/${variant.id}/`, import.meta.url);
  await mkdir(new URL('src/', directory), { recursive: true });
  await writeFile(
    new URL('alchemy.run.ts', directory),
    `import { container, shapeStack, workersAi } from '../kit/stack.ts';
import type { Box } from './src/index.ts';
export default shapeStack('${variant.id}', { BOX: container<Box>('${variant.id}', 'Box', { instanceType: '${variant.instanceType}' }), AI: workersAi('AI') }, { gateway: { binding: 'GATEWAY' } });
`,
  );
  await writeFile(
    new URL('src/index.ts', directory),
    `import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { containerEnv } from '../../kit/container-env.ts';
import { piRouter } from '../../kit/router.ts';
type Env = AgentEnv & { readonly BOX: DurableObjectNamespace<Box> };
export class Box extends piAgent<Env>({
  name: '${variant.id}',
  lifetimeDeadlineKey: 'search-container-deadline',
  modelLimits: { calls: 16, requestBytes: 65536, outputTokens: 8192, lifetimeMs: 480000 },
  probe: async (_env, ctx) => ({ facts: {
    modelBudget: JSON.stringify(await ctx.storage.get('search-model-budget') ?? null),
    lastModelResponse: JSON.stringify(await ctx.storage.get('search-model-last-response') ?? null),
    lastModelStream: JSON.stringify(await ctx.storage.get('search-model-last-stream') ?? null),
    containerDeadline: await ctx.storage.get<number>('search-container-deadline') ?? 0,
  } }),
  instructions: 'Use the tools to finish the task in /workspace. Run the tests. Reply briefly.',
  environment: (_env, ctx) => containerEnv(ctx, ctx.id.toString(), { internet: false, lifetimeMs: 600000 }),
}) {
  override async alarm() {
    const deadline = await this.ctx.storage.get<number>('search-container-deadline');
    if (deadline !== undefined && Date.now() >= deadline) {
      await this.ctx.container?.destroy();
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await super.alarm();
  }
}
export default piRouter<Env>({ shape: '${variant.id}', agent: (env, name) => env.BOX.get(env.BOX.idFromName(name)), gateway: (env) => env.GATEWAY });
`,
  );
  console.log(fileURLToPath(directory));
}
