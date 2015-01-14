#!/bin/bash

set -e 

./bootstrap.sh

./phantomjs-1.9.8/bin/phantomjs js/tests/run_qunit.js test.html
