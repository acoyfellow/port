import { raw } from './html';

const frame = (body: string, label: string) =>
  raw(
    `<svg class="bp-art" viewBox="0 0 240 150" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="bp-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width=".5"/></pattern></defs><rect width="240" height="150" fill="url(#bp-grid)"/>${body}</svg>`,
  );

const dim = (x1: number, x2: number, y: number, text: string) =>
  `<g class="bp-dim"><path d="M${x1} ${y - 4}v8M${x2} ${y - 4}v8M${x1} ${y}H${x2}"/><text x="${(x1 + x2) / 2}" y="${y - 4}" text-anchor="middle">${text}</text></g>`;

const callout = (x: number, y: number, tx: number, ty: number, text: string) =>
  `<g class="bp-call"><circle cx="${x}" cy="${y}" r="2.5"/><path d="M${x} ${y}L${tx} ${ty}H${tx + (tx > x ? 34 : -34)}"/><text x="${tx + (tx > x ? 2 : -2)}" y="${ty - 3}" text-anchor="${tx > x ? 'start' : 'end'}">${text}</text></g>`;

export const signInArt = frame(
  `<g class="bp-line"><rect x="28" y="40" width="64" height="76" rx="6"/><path d="M40 58h40M40 70h40M40 82h24"/><circle cx="60" cy="100" r="7"/><path d="M92 78h40"/><path d="M126 72l8 6-8 6"/><rect x="138" y="44" width="76" height="68" rx="6" stroke-dasharray="3 3"/><path d="M150 62h52M150 76h52M150 90h30"/></g><g class="bp-amber"><circle cx="150" cy="62" r="3"/><circle cx="150" cy="76" r="3"/></g>${dim(28, 92, 30, 'you')}${dim(138, 214, 30, 'your account')}${callout(150, 90, 120, 134, 'scopes')}`,
  'You sign in with Cloudflare and pick one account.',
);

export const installArt = frame(
  `<g class="bp-line"><rect x="18" y="58" width="44" height="34" rx="4"/><path d="M62 75h22"/><path d="M80 70l6 5-6 5"/><rect x="90" y="36" width="132" height="92" rx="6" stroke-dasharray="3 3"/><rect x="102" y="50" width="46" height="26" rx="3"/><rect x="164" y="50" width="46" height="26" rx="3"/><rect x="102" y="90" width="46" height="26" rx="3"/><rect x="164" y="90" width="46" height="26" rx="3"/><path d="M148 63h16M125 76v14M187 76v14"/></g><g class="bp-amber"><rect x="164" y="90" width="46" height="26" rx="3"/><path d="M175 103l6 6 12-12"/></g>${dim(18, 62, 48, 'port')}${callout(125, 63, 112, 20, 'Worker')}${callout(187, 103, 226, 142, 'eval')}`,
  'port creates the resources on your account and runs the eval.',
);

export const teardownArt = frame(
  `<g class="bp-line"><rect x="24" y="36" width="96" height="92" rx="6" stroke-dasharray="3 3"/><rect x="36" y="50" width="30" height="22" rx="3" opacity=".45"/><rect x="78" y="50" width="30" height="22" rx="3" opacity=".45"/><rect x="36" y="90" width="30" height="22" rx="3" opacity=".45"/><rect x="78" y="90" width="30" height="22" rx="3" opacity=".45"/><path d="M40 54l22 14M62 54L40 68M82 54l22 14M104 54L82 68M40 94l22 14M62 94L40 108M82 94l22 14M104 94L82 108"/><path d="M120 82h30"/><path d="M144 76l8 6-8 6"/><circle cx="186" cy="82" r="28"/><path d="M186 54v-8M186 118v-8M158 82h-8M222 82h-8"/></g><g class="bp-amber"><text x="186" y="88" text-anchor="middle" class="bp-big">0</text></g>${dim(24, 120, 26, 'deleted')}${callout(206, 62, 226, 26, 'API sweep')}`,
  'Tear down deletes each resource, then the Cloudflare API confirms 0 are left.',
);
