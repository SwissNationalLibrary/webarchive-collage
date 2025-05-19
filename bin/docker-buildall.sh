#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd $DIR/..
source $DIR/../.env
test -f $DIR/../.env.local && source $DIR/../.env.local

# Cross-platform scripts (amd64/arm64) to build container images
# only works on macOS or specially prepared linux machines
# use `docker login registry.gitlab.com` to push images
#
# call: ./docker-buildall.sh prod1
TARGET_ENV=env-${1:-test}

# collage cli tools
docker buildx build  --platform linux/amd64,linux/arm64/v8 -f./docker/app/Dockerfile --pull --push \
--tag registry.gitlab.com/targetroot/collage/webarchive-collage/${TARGET_ENV}/app:latest .

# Cantaloupe webarchives
cd $DIR/../docker/cantaloupe
docker buildx build  --platform linux/amd64,linux/arm64/v8 -fDockerfile --pull --push \
--tag registry.gitlab.com/targetroot/collage/e-helvetica-access/webarchive-collage/${TARGET_ENV}/cantaloupe:latest .

# python
cd $DIR/../docker/python
docker buildx build  --platform linux/amd64,linux/arm64/v8 -fDockerfile --pull --push \
--tag registry.gitlab.com/targetroot/collage/e-helvetica-access/webarchive-collage/${TARGET_ENV}/python:latest .

# nginx
cd $DIR/../docker/nginx
docker buildx build  --platform linux/amd64,linux/arm64/v8 -fDockerfile --pull --push \
--tag registry.gitlab.com/targetroot/collage/e-helvetica-access/webarchive-collage/${TARGET_ENV}/nginx:latest .

# solr
cd $DIR/../docker/solr
docker buildx build  --platform linux/amd64,linux/arm64/v8 -fDockerfile --pull --push \
--tag registry.gitlab.com/targetroot/collage/e-helvetica-access/webarchive-collage/${TARGET_ENV}/solr:latest .
