FROM alpine:3.21
RUN echo http://dl-2.alpinelinux.org/alpine/edge/community/ >> /etc/apk/repositories \
  && apk add --no-cache su-exec shadow \
  uv \
  openssl \
  tini \
  libjpeg-turbo \
  vips \
  vips-tools \
  python3 \
  python3-dev \
  py3-pip \
  libffi-dev \
  musl-dev \
  linux-headers \
  gcc \
  libffi-dev

#FROM python:3-alpine AS python-build

# RUN apt update \
#   && apt-get install -y --no-install-recommends \
#   build-essential \
#   libvips \
#   libvips-tools \
#   libvips-dev \
#   && rm -rf /var/lib/apt/lists/*
RUN pip install --break-system-packages cffi pyvips psutil
#FROM python:3-slim
#RUN
