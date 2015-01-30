set -e
echo "CACHE MANIFEST" > cleopatra.appcache
echo "# $(date)" >> cleopatra.appcache
echo "" >> cleopatra.appcache
echo "CACHE:" >> cleopatra.appcache
find *.html js css images -not -path '*/\.*' -type file >> cleopatra.appcache
echo "" >> cleopatra.appcache
echo "NETWORK:" >> cleopatra.appcache
echo "*" >> cleopatra.appcache
