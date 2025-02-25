#!/bin/bash

# Get all files tracked by git
git ls-files > /tmp/all_files.txt

# Get files matched by CODEOWNERS
while read -r line; do
  # Skip comments and empty lines
  [[ "$line" =~ ^#.*$ ]] && continue
  [[ -z "$line" ]] && continue
  
  # Extract the path pattern
  pattern=$(echo "$line" | awk '{print $1}')
  
  # Convert the pattern to a form git understands
  # Remove leading slash if present
  pattern=${pattern#/}
  
  # List files matching this pattern
  git ls-files "$pattern" 2>/dev/null >> /tmp/covered_files.txt
done < .github/CODEOWNERS

# Sort and get unique entries
sort -u /tmp/covered_files.txt > /tmp/covered_files_unique.txt

# Find files that are in all_files but not in covered_files
comm -23 /tmp/all_files.txt /tmp/covered_files_unique.txt

# Cleanup
rm /tmp/all_files.txt /tmp/covered_files.txt /tmp/covered_files_unique.txt
