FROM node:lts-alpine AS node
FROM alpine:edge AS python
RUN apk add --no-cache openssl \
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
  gcc

RUN pip install --break-system-packages cffi pyvips
#psutil

FROM alpine:edge
# copy nodejs files
COPY --from=node /usr/lib /usr/lib
COPY --from=node /usr/local/share /usr/local/share
COPY --from=node /usr/local/lib /usr/local/lib
COPY --from=node /usr/local/include /usr/local/include
COPY --from=node /usr/local/bin /usr/local/bin

COPY --from=python /usr/lib /usr/lib
COPY --from=python /usr/bin/py* /usr/bin/

# install some alpine things
RUN echo http://dl-2.alpinelinux.org/alpine/edge/community/ >> /etc/apk/repositories \
  && apk add --no-cache openssl \
  tini \
  libjpeg-turbo \
  vips \
  vips-tools

# install npm packages
ENV NODE_ENV production
WORKDIR /dist
ADD ./package.json .
RUN npm install \
  && ls -la \
  && npm audit fix \
  # fix what we can - ignore further errors
  ; exit 0

# create data directory with suitable permissions
RUN mkdir -p /dist/data

# see https://www.elastic.io/nodejs-as-pid-1-under-docker-images/
#ENTRYPOINT ["/sbin/tini", "-e", "143", "--"]
CMD ["/usr/local/bin/node"]
