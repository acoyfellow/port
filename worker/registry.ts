const REGISTRY = 'https://registry.cloudflare.com/v2';
const MANIFEST_TYPES =
  'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json';

export type RegistryAuth = { readonly basic: string };

export type ImageRef = {
  readonly auth: RegistryAuth;
  readonly repository: string;
  readonly tag: string;
};

type Blob = { readonly digest: string; readonly size: number };

const header = (auth: RegistryAuth) => ({ authorization: `Basic ${auth.basic}` });

const isBlob = (value: unknown): value is Blob =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'digest') === 'string' &&
  typeof Reflect.get(value, 'size') === 'number';

const blobsOf = (manifest: unknown): readonly Blob[] => {
  if (typeof manifest !== 'object' || manifest === null) return [];
  const config = Reflect.get(manifest, 'config');
  const layers = Reflect.get(manifest, 'layers');
  return [config, ...(Array.isArray(layers) ? layers : [])].filter(isBlob);
};

const uploadUrl = (location: string, digest: string) => {
  const base = location.startsWith('http') ? location : `https://registry.cloudflare.com${location}`;
  return `${base}${base.includes('?') ? '&' : '?'}digest=${encodeURIComponent(digest)}`;
};

const copyBlob = async (from: ImageRef, to: ImageRef, blob: Blob) => {
  const present = await fetch(`${REGISTRY}/${to.repository}/blobs/${blob.digest}`, {
    method: 'HEAD',
    headers: header(to.auth),
  });
  if (present.ok) return 0;
  const started = await fetch(`${REGISTRY}/${to.repository}/blobs/uploads/`, {
    method: 'POST',
    headers: header(to.auth),
  });
  const location = started.headers.get('location');
  if (location === null) throw new Error(`registry upload did not start: HTTP ${started.status}`);
  const pulled = await fetch(`${REGISTRY}/${from.repository}/blobs/${blob.digest}`, {
    headers: header(from.auth),
  });
  if (!pulled.ok || pulled.body === null) throw new Error(`registry pull failed: HTTP ${pulled.status}`);
  const pushed = await fetch(uploadUrl(location, blob.digest), {
    method: 'PUT',
    headers: {
      ...header(to.auth),
      'content-type': 'application/octet-stream',
      'content-length': String(blob.size),
    },
    body: pulled.body,
  });
  if (!pushed.ok) throw new Error(`registry push failed: HTTP ${pushed.status}`);
  return blob.size;
};

export const copyImage = async (from: ImageRef, to: ImageRef) => {
  const source = await fetch(`${REGISTRY}/${from.repository}/manifests/${from.tag}`, {
    headers: { ...header(from.auth), accept: MANIFEST_TYPES },
  });
  if (!source.ok) throw new Error(`image ${from.repository}:${from.tag} not found: HTTP ${source.status}`);
  const manifestType = source.headers.get('content-type') ?? 'application/vnd.oci.image.manifest.v1+json';
  const manifestText = await source.text();
  let bytes = 0;
  for (const blob of blobsOf(JSON.parse(manifestText))) bytes += await copyBlob(from, to, blob);
  const put = await fetch(`${REGISTRY}/${to.repository}/manifests/${to.tag}`, {
    method: 'PUT',
    headers: { ...header(to.auth), 'content-type': manifestType },
    body: manifestText,
  });
  const digest = put.headers.get('docker-content-digest');
  if (!put.ok || digest === null) throw new Error(`image manifest push failed: HTTP ${put.status}`);
  return { digest, bytes };
};

export const deleteImage = async (auth: RegistryAuth, repository: string) => {
  const listed = await fetch(`${REGISTRY}/${repository}/tags/list`, { headers: header(auth) });
  if (!listed.ok) return;
  const body: unknown = await listed.json();
  const tags = typeof body === 'object' && body !== null ? Reflect.get(body, 'tags') : undefined;
  for (const tag of Array.isArray(tags) ? tags : [])
    if (typeof tag === 'string')
      await fetch(`${REGISTRY}/${repository}/manifests/${tag}`, {
        method: 'DELETE',
        headers: { ...header(auth), accept: MANIFEST_TYPES },
      });
  await fetch(`${REGISTRY}/gc/layers`, {
    method: 'PUT',
    headers: { ...header(auth), 'content-type': 'application/json' },
  });
};
