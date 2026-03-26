# delete_link.jq
# Usage: jq --arg alias "foo" -f delete_link.jq links.json

del(.[$alias])
