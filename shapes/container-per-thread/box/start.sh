#!/bin/sh
cat /proc/sys/kernel/random/uuid > /disk/.boot
exec httpd -f -p 8080 -h /www
