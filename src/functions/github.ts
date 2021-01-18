import { Context, CodePipelineEvent } from 'aws-lambda';
import * as CodePipeline from 'aws-sdk/clients/codepipeline';
import {Octokit} from '@octokit/core';
import { request, RequestOptions } from 'https';

let codePipelineClient: CodePipeline;

exports.handler = async (
  event: CodePipelineEvent,
  context: Context,
): Promise<any> => {
  context.callbackWaitsForEmptyEventLoop = false;
  if (!codePipelineClient) new CodePipeline();

  const repoName = process.env['GITHUB_REPO'] || '';
  const repoOwner = process.env['GITHUB_REPO_OWNER'] || '';
  const gitSourceBranch = process.env['GITHUB_SOURCE_BRANCH'] || '';
  const gitDestBranch = process.env['GITHUB_DEST_BRANCH'] || 'master';
  const authToken = process.env['GITHUB_OAUTH_TOKEN'] || '';

  const octokit = new Octokit({auth: authToken});
  const pullRequestUrl = `POST /repos/${repoOwner}/${repoName}/pulls`;
  const jobID = event['CodePipeline.job'].id;

  try {
    const pullResponse = await octokit.request(pullRequestUrl, {
      owner: repoOwner,
      repo: repoName,
      head: gitSourceBranch,
      base: gitDestBranch,
    })
    console.log(`Created pr number: ${JSON.stringify(pullResponse.data.number)}`);

    const response = await codePipelineClient
      .putJobSuccessResult({
        jobId: jobID,
      })
      .promise();
    console.log(`Codepipeline response: \n${JSON.stringify(response)}`);
  } catch (error) {
    console.error(`Error creating pull request: ${error}`);
    await codePipelineClient
      .putJobFailureResult({
        jobId: jobID,
        failureDetails: {
          type: 'JobFailed',
          message: error.message,
          externalExecutionId: context.awsRequestId,
        },
      })
      .promise();
  }
  return;
};

const createPullRequest = () => {
  const repo = process.env['GITHUB_REPO'];
  const repoOwner = process.env['GITHUB_REPO_OWNER'];

  try {
    const pullRequestBody = {
      title: 'Automatic pull request by CI',
      head: process.env['GITHUB_SOURCE_BRANCH'],
      base: process.env['GITHUB_DEST_BRANCH'],
    };
    const path = `/repos/${repoOwner}/${repo}/pulls`;
    githubRequest('POST', path, pullRequestBody);
    return true;
  } catch (err) {
    if (err && Array.isArray(err.errors) && err.errors.length === 1) {
      if (
        err.errors[0].code === 'custom' &&
        err.errors[0].message === 'No commits between master and staging'
      ) {
        // Nothing changed so no pull request.  This is fine.
        return null;
      }
      if (
        err.errors[0].code === 'custom' &&
        /^A pull request already exists for /.test(err.errors[0].message)
      ) {
        // There's already a pull request for this.  This is fine.
        return null;
      }
    }
    throw err;
  }
};

const mergePullRequest = (prNumber: string) => {
  const repo = process.env['GITHUB_REPO'];
  const repoOwner = process.env['GITHUB_REPO_OWNER'];
  const path = `/repos/${repoOwner}/${repo}/pulls/${prNumber}/merge`;

  const mergeBody = {
    commit_message: 'Automatic PR merge by CI',
  };
  githubRequest('PUT', path, mergeBody);
  return true;
};

const githubRequest = (
  method: string,
  path: string,
  body?: Record<string, any>,
) => {
  const oauthToken = process.env['GITHUB_OAUTH_TOKEN'];
  const bodyJson = JSON.stringify(body);
  const options: RequestOptions = {
    hostname: 'api.github.com',
    port: 443,
    path: path,
    method: method,
    headers: {
      Authorization: `token ${oauthToken}`,
      Accept: 'application/json',
      'Content-Length': bodyJson.length,
      'Content-Type': 'application/json',
    },
  };

  const req = request(options, response => {
    const responseBody: string[] = [];
    console.log(`Request success! ${response.statusMessage}`);
    response.setEncoding('utf8');
    response.on('data', d => {
      responseBody.push(d as string);
    });
  });

  req.on('error', error => {
    console.log(`Error with request! ${error.message}`);
  });
  req.write(bodyJson);
  req.end();
};
