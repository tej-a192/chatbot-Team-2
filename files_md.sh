#!/bin/bash

# --- Configuration ---
START_DIR="."                 
MAX_DEPTH=6                   
OUTPUT_FILE="code.txt"        
TREE_FILE="o.txt"             
declare -a IGNORE_DIRS=("node_modules" "assets" "backup_assets" ".git" ".vscode" "dist" "build" "venv")
declare -a INCLUDE_EXTENSIONS=("py" "js" "jsx" "ts" "tsx" "css" "scss" "html" "env")

# --- Check if start directory exists ---
if [ ! -d "$START_DIR" ]; then
  echo "Error: Start directory '$START_DIR' not found." >&2
  exit 1
fi

# --- Prepare the find command arguments for ignored directories ---
ignore_opts=()
if [ ${#IGNORE_DIRS[@]} -gt 0 ]; then
  ignore_opts+=("(")
  first_ignore=true
  for dir in "${IGNORE_DIRS[@]}"; do
    if [ "$first_ignore" = false ]; then
      ignore_opts+=("-o")
    fi
    ignore_opts+=("-name" "$dir" "-type" "d")
    first_ignore=false
  done
  ignore_opts+=(")" "-prune")
else
  ignore_opts+=("(" "-false" ")" "-prune")
fi

# --- Prepare the find command arguments for included file extensions ---
include_opts=()
if [ ${#INCLUDE_EXTENSIONS[@]} -gt 0 ]; then
  include_opts+=("(")
  first_include=true
  for ext in "${INCLUDE_EXTENSIONS[@]}"; do
    if [ "$first_include" = false ]; then
      include_opts+=("-o")
    fi
    include_opts+=("-name" "*.$ext")
    first_include=false
  done
  include_opts+=(")")
fi

# --- Clear or create output files ---
> "$OUTPUT_FILE"
> "$TREE_FILE"
echo "Created/Cleared: $OUTPUT_FILE and $TREE_FILE"

# --- Generate code.txt with code blocks ---
echo "Generating $OUTPUT_FILE..."
find "$START_DIR" -maxdepth "$MAX_DEPTH" \
  "${ignore_opts[@]}" \
  -o \
  \( -type f "${include_opts[@]}" \) \
  -print0 | while IFS= read -r -d $'\0' file; do
    clean_file="${file#./}"
    echo "Processing: $clean_file"

    extension="${clean_file##*.}"
    extension_lower=$(tr '[:upper:]' '[:lower:]' <<< "$extension")
    lang=""
    case "$extension_lower" in
      py) lang="python" ;;
      js|jsx) lang="javascript" ;;
      ts|tsx) lang="typescript" ;;
      css) lang="css" ;;
      scss) lang="scss" ;;
      html) lang="html" ;;
      md) lang="markdown" ;;
      sh) lang="bash" ;;
      json) lang="json" ;;
      yaml|yml) lang="yaml" ;;
      txt|env) lang="" ;;
      *) lang="" ;;
    esac

    {
      printf '`%s`\n\n' "$clean_file"
      printf '```%s\n' "$lang"
      cat "$file"
      printf '\n```\n\n'
    } >> "$OUTPUT_FILE"
done

echo "Done: $OUTPUT_FILE"

# --- Generate o.txt with folder structure using Bash loop ---
echo "Generating $TREE_FILE..."

# Recursive function to print directory tree
print_tree() {
  local dir="$1"
  local prefix="$2"

  # Skip ignored directories
  for ignore in "${IGNORE_DIRS[@]}"; do
    [[ "$(basename "$dir")" == "$ignore" ]] && return
  done

  echo "${prefix}|-- $(basename "$dir")" >> "$TREE_FILE"

  local item
  for item in "$dir"/*; do
    [ -e "$item" ] || continue
    local base="$(basename "$item")"

    # Skip ignored directories again
    skip=false
    for ignore in "${IGNORE_DIRS[@]}"; do
      if [[ "$base" == "$ignore" ]]; then
        skip=true
        break
      fi
    done
    $skip && continue

    if [ -d "$item" ]; then
      print_tree "$item" "$prefix  "
    else
      echo "${prefix}  |-- $base" >> "$TREE_FILE"
    fi
  done
}

# Start the tree from root
print_tree "$START_DIR" ""

echo "Done: $TREE_FILE"


# --- Generate folder structure (no tree command) ---
echo "Generating folder structure in $TREE_FILE..."

IGNORE_PATTERN=$(IFS='|'; echo "${IGNORE_DIRS[*]}")
find "$START_DIR" \( -type d -o -type f \) | grep -Ev "/(${IGNORE_PATTERN//|/|})" | \
  sed -e 's|[^/]*/|  |g' -e 's|  \([^ ]\)||-- \1|' > "$TREE_FILE"

echo "Folder structure written to: $TREE_FILE"