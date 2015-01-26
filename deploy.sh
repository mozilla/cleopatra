#!/bin/bash
ssh bgirard@people.mozilla.org "cd public_html/cleopatra_staging && git checkout * && git pull && chmod -R 755 ."
