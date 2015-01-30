#!/bin/bash
ssh bgirard@people.mozilla.org "cd public_html/cleopatra_staging && git pull && bash appcache_generator.sh && chmod -R 755 ."
