import * as Schema from 'effect/Schema';

export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const shapeUrl = (slug: string) => {
  const subdomain = process.env.SHAPE_SUBDOMAIN;
  if (subdomain === undefined || subdomain === '') throw new Error('SHAPE_SUBDOMAIN is not set');
  return `https://port-shape-${slug}.${subdomain}.workers.dev`;
};

export const shapeKey = () => {
  const key = process.env.SHAPE_KEY;
  if (key === undefined || key === '') throw new Error('SHAPE_KEY is not set');
  return key;
};

type Decodable = Schema.ConstraintDecoder<unknown>;

type RequestOptions = { readonly tries?: number; readonly body?: unknown };

export type Client = {
  readonly get: <S extends Decodable>(
    path: string,
    schema: S,
    options?: RequestOptions,
  ) => Promise<S['Type']>;
  readonly post: <S extends Decodable>(
    path: string,
    schema: S,
    options?: RequestOptions,
  ) => Promise<S['Type']>;
};

export const client = (slug: string, auth?: { readonly bearer: string }): Client => {
  const base = shapeUrl(slug);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(auth === undefined ? {} : { authorization: `Bearer ${auth.bearer}` }),
  };
  const send =
    (method: 'GET' | 'POST') =>
    async <S extends Decodable>(path: string, schema: S, options: RequestOptions = {}) => {
      const tries = options.tries ?? 30;
      const body = options.body === undefined ? undefined : JSON.stringify(options.body);
      let last = '';
      for (let attempt = 0; attempt < tries; attempt++) {
        const response = await fetch(`${base}${path}`, { method, headers, body }).catch((error: unknown) =>
          String(error),
        );
        if (typeof response !== 'string' && response.ok)
          return Schema.decodeUnknownSync(schema)(await response.json());
        last = typeof response === 'string' ? response : `HTTP ${response.status}`;
        await pause(2000);
      }
      throw new Error(`${method} ${path} kept failing: ${last}`);
    };
  return { get: send('GET'), post: send('POST') };
};

export const prove = (claim: string, ok: boolean, detail: Record<string, unknown>) => {
  console.log(JSON.stringify(detail));
  if (!ok) {
    console.log(`smoke failed: ${claim}`);
    process.exit(1);
  }
  console.log(`PROVED ${claim}`);
};
