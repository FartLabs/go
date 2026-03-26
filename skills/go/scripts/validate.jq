# validate.jq
# Usage: jq -f validate.jq links.json
# Expects: A JSON object where all values are strings.

if type != "object" then
  error("Root must be a JSON object")
elif ([.[] | type == "string"] | all) then
  .
else
  error("All values in the shortlink map must be strings")
end
