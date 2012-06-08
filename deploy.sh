#!/bin/bash
ssh webadmin@varium.fantasytalesonline.com "cd tomcat/webapps/ROOT/cleopatra/ && git pull"
ssh people.mozilla.org "cd public_html/cleopatra && git checkout * && git pull && chmod -R 755 ."
