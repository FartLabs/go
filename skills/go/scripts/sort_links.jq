# sort_links.jq
# Usage: jq -f sort_links.jq links.json
# Note: jq --sort-keys . is often sufficient, but this script ensures 
# a canonical format.

to_entries | sort_by(.key) | from_entries
