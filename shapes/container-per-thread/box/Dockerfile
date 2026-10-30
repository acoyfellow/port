FROM busybox:1.36
COPY cgi-bin /www/cgi-bin
COPY start.sh /start.sh
RUN chmod +x /www/cgi-bin/fs /start.sh && mkdir -p /disk
EXPOSE 8080
CMD ["/start.sh"]
