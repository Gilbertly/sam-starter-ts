import { Context, CodePipelineEvent } from 'aws-lambda';
import * as CodePipeline from 'aws-sdk/clients/codepipeline';
import { Octokit } from '@octokit/core';

let codePipelineClient: CodePipeline;

exports.handler = async (
  event: CodePipelineEvent,
  context: Context,
): Promise<any> => {
  context.callbackWaitsForEmptyEventLoop = false;
  if (!codePipelineClient) new CodePipeline();

  const repoName = process.env['GITHUB_REPO'] || '';
  const repoOwner = process.env['GITHUB_REPO_OWNER'] || '';
  const gitSourceBranch = process.env['GITHUB_SOURCE_BRANCH'] || 'develop';
  const gitDestBranch = process.env['GITHUB_DEST_BRANCH'] || 'main';
  const authToken = process.env['GITHUB_OAUTH_TOKEN'] || '';

  const octokit = new Octokit({ auth: authToken });
  const pullRequestUrl = `POST /repos/${repoOwner}/${repoName}/pulls`;
  const jobID = event['CodePipeline.job'].id;

  try {
    const pullResponse = await octokit.request(pullRequestUrl, {
      owner: repoOwner,
      repo: repoName,
      head: gitSourceBranch,
      base: gitDestBranch,
    });
    console.log(`PR number: ${JSON.stringify(pullResponse.data.number)}`);

    const cpResponse = await codePipelineClient
      .putJobSuccessResult({
        jobId: jobID,
      })
      .promise();
    console.log(`codepipeline success response: ${JSON.stringify(cpResponse)}`);

    return cpResponse;
  } catch (error) {
    console.error(`Error creating pull request: ${error}`);
    const cpResponse = await codePipelineClient
      .putJobFailureResult({
        jobId: jobID,
        failureDetails: {
          type: 'JobFailed',
          message: error.message,
          externalExecutionId: context.awsRequestId,
        },
      })
      .promise();
    console.log(`codepipeline error response: ${JSON.stringify(cpResponse)}`);

    return cpResponse;
  }
};
