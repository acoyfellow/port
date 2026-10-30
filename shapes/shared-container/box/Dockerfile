FROM busybox:1.36
COPY cgi-bin /www/cgi-bin
RUN chmod +x /www/cgi-bin/seats && for n in 1 2 3 4 5; do adduser -D -u 100$n -s /bin/sh agent$n && chmod 700 /home/agent$n; done
EXPOSE 8080
CMD ["httpd", "-f", "-p", "8080", "-h", "/www"]
