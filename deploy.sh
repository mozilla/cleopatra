#!/bin/bash
ssh bgirard@people.mozilla.org "cd public_html/cleopatra && git checkout * && git pull && chmod -R 755 ."
