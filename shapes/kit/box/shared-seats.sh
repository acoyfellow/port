#!/bin/sh
for n in 1 2 3 4 5; do
  su -s /bin/sh "agent$n" -c "PI_ENV_ROOT=/home/agent$n PI_ENV_PORT=808$n node /opt/pi-env/env-server.mjs" &
done
exec node /opt/pi-env/env-server.mjs
