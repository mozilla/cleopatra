#!/bin/bash

set -e 

./bootstrap.sh

./phantomjs-1.9.8/bin/phantomjs js/tests/run_qunit.js test.html
SLIMERJSLAUNCHER=/Applications/Firefox.app/Contents/MacOS/firefox ./slimerjs/slimerjs js/tests/run_qunit.js $PWD/test.html
