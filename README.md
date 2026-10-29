# port

Install agent infra on your own Cloudflare account. Preview it, keep it, or tear it down.

Live at [port.customer0.dev](https://port.customer0.dev) once deployed.

## What you can do

1. **Browse.** The directory lists what can be installed. Each entry says what it creates on your account, which permissions it needs, and what it costs per month before use.
2. **Sign in with Cloudflare.** You pick the account. port asks for every permission it needs up front, and says why for each one.
3. **Preview.** port deploys the entry to your account under a temporary name and shows a link and a teardown time.
4. **Keep or tear down.** Keep renames it to a permanent install. Tear down deletes everything the preview made and lists what it removed.

Everything runs on your account and your bill. port holds the install button, your encrypted grant, and a record of what it made. Nothing else.

## What port does not do

- It does not run your agents. They run on your account.
- It does not pay for model calls. Those go through your AI Gateway.
- It does not touch anything it did not create. Teardown deletes only resources it recorded.

## Status

| Step | State |
|---|---|
| Directory page | built |
| Sign in with Cloudflare | not wired: the OAuth client is a dashboard step |
| Fleet entry, install and teardown | being built |
| Other entries | listed, not installable |

## Develop

```sh
npm install
npm run build
npx wrangler dev
```
