#!/bin/bash
ssh bgirard@people.mozilla.org "cd public_html/cleopatra && git reset --hard HEAD && git pull && bash appcache_generator.sh && chmod -R 755 ."
ssh cleopatra@cleopatra.io "./update-site.sh"
