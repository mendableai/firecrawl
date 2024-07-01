#!/bin/bash

function build_and_publish {
    PACKAGE_NAME=$1
    REPOSITORY=$2

    # Replace placeholder with the package name in pyproject.toml (only the name field)
    sed -i '' "s/^name = \"PLACEHOLDER_NAME\"/name = \"$PACKAGE_NAME\"/" pyproject.toml

    # Replace placeholder with the package name in setup.py (only the name field)
    sed -i '' "s/^    name=\"PLACEHOLDER_NAME\"/    name=\"$PACKAGE_NAME\"/" setup.py

    # Debug: show modified state
    echo "Modified pyproject.toml for $PACKAGE_NAME:"
    cat pyproject.toml

    echo "Modified setup.py for $PACKAGE_NAME:"
    cat setup.py

    # Build the package
    python -m build

    # Check if build was successful
    if [ $? -ne 0 ]; then
        echo "Build failed for $PACKAGE_NAME"
        exit 1
    fi

    # Publish the package using twine with the specified repository
    twine upload --repository $REPOSITORY dist/*

    # Check if upload was successful
    if [ $? -ne 0 ]; then
        echo "Upload failed for $PACKAGE_NAME to $REPOSITORY"
        exit 1
    fi

    # Revert the changes to the original placeholder in pyproject.toml and setup.py
    sed -i '' "s/^name = \"$PACKAGE_NAME\"/name = \"PLACEHOLDER_NAME\"/" pyproject.toml
    sed -i '' "s/^    name=\"$PACKAGE_NAME\"/    name=\"PLACEHOLDER_NAME\"/" setup.py

    # Debug: show reverted state
    echo "Reverted pyproject.toml to placeholder:"
    cat pyproject.toml

    echo "Reverted setup.py to placeholder:"
    cat setup.py

    # Clean up build artifacts
    rm -rf dist build *.egg-info
}

# Build and publish the first package to the main PyPI repository
build_and_publish "firecrawl" "pypi"

# Build and publish the second package to the main PyPI repository
build_and_publish "firecrawl-py" "pypi"
