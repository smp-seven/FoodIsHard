# Small, multi-arch Python image. No third-party packages needed.
FROM python:3.13-alpine

ENV PYTHONUNBUFFERED=1 \
    FOODISHARD_DATA=/data \
    PORT=8099

WORKDIR /app
COPY app/ /app/

EXPOSE 8099
CMD ["python3", "-u", "/app/server.py"]
