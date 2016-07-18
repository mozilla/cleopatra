#!/bin/bash
wget http://profile-store.commondatastorage.googleapis.com/$1 -O /tmp/downloadedProfile.json
echo "Pretty printing to: $1"
cat /tmp/downloadedProfile.json | python -mjson.tool > $1
