export const workerUrl = (name) => `https://${name}.${process.env.SHAPE_SUBDOMAIN}.workers.dev`;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const getJson = async (base, path, tries = 30) => {
  let last = '';
  for (let attempt = 0; attempt < tries; attempt++) {
    const response = await fetch(`${base}${path}`).catch((error) => ({ ok: false, status: String(error) }));
    if (response.ok) return response.json();
    last = String(response.status);
    await pause(2000);
  }
  throw new Error(`${path} kept failing (${last})`);
};

export const prove = (claim, ok, detail) => {
  console.log(JSON.stringify(detail));
  if (!ok) {
    console.log(`smoke failed: ${claim}`);
    process.exit(1);
  }
  console.log(`PROVED ${claim}`);
};
