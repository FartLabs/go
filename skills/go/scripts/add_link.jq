# add_link.jq
# Usage: jq --arg alias "foo" --arg dest "https://bar.com" -f add_link.jq links.json

. + {($alias): $dest}
