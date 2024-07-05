#!/bin/bash

function build_and_publish {
    PACKAGE_NAME=$1

    # Replace placeholder with the package name in package.json
    jq --arg name "$PACKAGE_NAME" '.name = $name' package.json > temp.json && mv temp.json package.json

    # Debug: show modified state
    echo "Modified package.json for $PACKAGE_NAME:"
    cat package.json

    # Publish the package using npm
    npm publish

    # Check if publish was successful
    if [ $? -ne 0 ]; then
        echo "Publish failed for $PACKAGE_NAME"
        exit 1
    fi

    # Wait for a moment to ensure npm publish has processed
    sleep 10

    # Revert the changes to the original placeholder in package.json
    jq '.name = "PLACEHOLDER_NAME"' package.json > temp.json && mv temp.json package.json

    # Debug: show reverted state
    echo "Reverted package.json to placeholder:"
    cat package.json
}

# Build and publish the first package to npm
build_and_publish "@mendable/firecrawl-js"

# Build and publish the second package to npm
build_and_publish "firecrawl"