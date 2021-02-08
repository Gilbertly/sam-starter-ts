#!/bin/bash

jsConfigFile=package.json
pyConfigFile=setup.py
repositoryOwner=$1
repositoryName=$2

releaseVersion () {
	repositoryOwner=$1
  repositoryName=$2
	newVersionRelease=$3

  dateToday=$(date +"%Y-%m-%d")
  currentBranch=$(git rev-parse --abbrev-ref HEAD)

  git tag $newVersionRelease
  git push origin $newVersionRelease

  github-release release \
    --user $repositoryOwner \
    --repo $repositoryName \
    --tag $newVersionRelease \
    --name "$newVersionRelease ($dateToday)" \
    --description "Released $newVersionRelease from branch $currentBranch"

  echo "Info: Successfully released version $newVersionRelease for $repositoryOwner/$repositoryName"
}

validateAndRelease () {
	repositoryOwner=$1
  repositoryName=$2
  releaseTag=$3
  response=$(github-release --quiet info --user $repositoryOwner --repo $repositoryName --tag $releaseTag)

  if [[ "$response" == *"tags:"* ]]; then
    echo -e "Error: Found existing release $releaseTag for $repositoryOwner/$repositoryName. Skipping release ..."
    exit 1
  else
    echo "Info: Deploying release $jsNextVersion for $repositoryOwner/$repositoryName"
    releaseVersion "$repositoryOwner" "$repositoryName" "$jsNextVersion"
  fi
}

jsVersionRelease () {
	repositoryOwner=$1
  repositoryName=$2
	jsNextVersion=$(jq -r < $jsConfigFile ".version")

	if test -z "$jsNextVersion"; then
		echo -e "Error: 'version' key could not be found in $jsConfigFile. Skipping release ..."
		exit 1
	else
		validateAndRelease "$repositoryOwner" "$repositoryName" "$jsNextVersion"
	fi
}

if test -z "$repositoryOwner"; then
  echo -e "Error: Invalid arguments passed. Expected: ./release.sh repositoryOwner repositoryName"
  exit 1
elif test -z "$repositoryName"; then
  echo -e "Error: Invalid arguments passed. Expected: ./release.sh repositoryOwner repositoryName"
	exit 1
else
  currentBranch=$(git rev-parse --abbrev-ref HEAD)
  if [[ "$currentBranch" -ne "master" || "$currentBranch" -ne "main" ]]; then
    echo "Info: Current branch '$currentBranch' is not a production branch ('master' or 'main'). Skipping release ..."
    exit 1
  fi

	if test -f "$pyConfigFile"; then
		echo "Info: Preparing to deploy next Python version release..."
		pyVersionRelease "$repositoryOwner" "$repositoryName"
	elif test -f "$jsConfigFile"; then
		echo "Info: Preparing to deploy next Javascript version release..."
		jsVersionRelease "$repositoryOwner" "$repositoryName"
	else
		echo "Info: Could not find $pyConfigFile or $jsConfigFile in project root. Skipping release ..."
		exit 1
	fi
fi
