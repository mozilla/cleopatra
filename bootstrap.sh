#!/bin/bash
set -e

if [ ! -e phantomjs-1.9.8 ]; then
  echo "Setting up PhantomJS for testing"
  wget https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-1.9.8-macosx.zip
  unzip phantomjs-1.9.8-macosx > /dev/null
  mv phantomjs-1.9.8-macosx phantomjs-1.9.8
  rm phantomjs-1.9.8-macosx.zip
fi

if [ ! -e slimerjs ]; then
  echo "Setting up SlimerJS for testing"
  wget http://download.slimerjs.org/releases/0.9.4/slimerjs-0.9.4.zip
  unzip slimerjs-0.9.4.zip > /dev/null
  mv slimerjs-0.9.4 slimerjs
fi

