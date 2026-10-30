import * as Schema from 'effect/Schema';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const shapeUrl = (slug: string) => {
  const subdomain = process.env.SHAPE_SUBDOMAIN;
  if (subdomain === undefined || subdomain === '') throw new Error('SHAPE_SUBDOMAIN is not set');
  return `https://port-shape-${slug}.${subdomain}.workers.dev`;
};

type Decodable = Schema.ConstraintDecoder<unknown>;

export type Client = {
  readonly get: <S extends Decodable>(
    path: string,
    schema: S,
    options?: { readonly tries?: number },
  ) => Promise<S['Type']>;
};

export const client = (slug: string): Client => {
  const base = shapeUrl(slug);
  return {
    get: async <S extends Decodable>(path: string, schema: S, options: { readonly tries?: number } = {}) => {
      const tries = options.tries ?? 30;
      let last = '';
      for (let attempt = 0; attempt < tries; attempt++) {
        const response = await fetch(`${base}${path}`).catch((error: unknown) => String(error));
        if (typeof response !== 'string' && response.ok)
          return Schema.decodeUnknownSync(schema)(await response.json());
        last = typeof response === 'string' ? response : `HTTP ${response.status}`;
        await pause(2000);
      }
      throw new Error(`${path} kept failing: ${last}`);
    },
  };
};

export const prove = (claim: string, ok: boolean, detail: Record<string, unknown>) => {
  console.log(JSON.stringify(detail));
  if (!ok) {
    console.log(`smoke failed: ${claim}`);
    process.exit(1);
  }
  console.log(`PROVED ${claim}`);
};
