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
  const jobIDShort = jobID.split('-')[0];

  try {
    const pullRequestTitle = `CodePipeline Auto-Pull-Request (Job Id: ${jobIDShort})`;
    const pullRequestBody = `Automated pull request to merge ${gitSourceBranch} into ${gitDestBranch}, created from CodePipeline job id: ${jobID}`;

    const pullResponse = await octokit.request(pullRequestUrl, {
      owner: repoOwner,
      repo: repoName,
      head: gitSourceBranch,
      base: gitDestBranch,
      title: pullRequestTitle,
      body: pullRequestBody,
    });
    console.log(`PR number: ${JSON.stringify(pullResponse.data.number)}`);

    return codePipelineClient.putJobSuccessResult(
      { jobId: jobID },
      (err, data) => {
        if (err) console.log(`PutJobSuccess error: ${JSON.stringify(err)}`);
        console.log(`PutJobSuccess: ${JSON.stringify(data)}`);
        return data;
      },
    );
  } catch (error) {
    console.error(`Error creating pull request: ${error}`);
    return codePipelineClient.putJobFailureResult(
      {
        jobId: jobID,
        failureDetails: {
          type: 'JobFailed',
          message: error.message,
          externalExecutionId: context.awsRequestId,
        },
      },
      (err, data) => {
        if (err) console.log(`PutJobFailure error: ${JSON.stringify(err)}`);
        console.log(`PutJobFailure: ${JSON.stringify(data)}`);
        return data;
      },
    );
  }
};
