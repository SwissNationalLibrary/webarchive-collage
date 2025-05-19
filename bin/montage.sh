#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd $DIR/..

# get project environment variables and local overrides
export $(echo $(cat $DIR/../.env | sed 's/#.*//g'| xargs) | envsubst)
test -f $DIR/../.env.local && export $(echo $(cat $DIR/../.env.local | sed 's/#.*//g'| xargs) | envsubst)

/usr/local/bin/docker-compose run --rm app /bin/sh -c '${0} ${1+"$@"}' node /dist/app/montage.js "$@"
