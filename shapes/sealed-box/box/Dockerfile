FROM alpine:3.20
COPY cgi-bin /www/cgi-bin
RUN chmod +x /www/cgi-bin/run
EXPOSE 8080
CMD ["httpd", "-f", "-p", "8080", "-h", "/www"]
