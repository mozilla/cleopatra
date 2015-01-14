#!/bin/bash
set -e

[ ! -e phantomjs ] && {
  echo "Setting up PhantomJS for testing"
  wget https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-1.9.8-macosx.zip
  unzip phantomjs-1.9.8-macosx > /dev/null
  mv phantomjs-1.9.8-macosx phantomjs-1.9.8
  rm phantomjs-1.9.8-macosx.zip
}

