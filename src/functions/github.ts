import { Context, CodePipelineEvent } from 'aws-lambda';
import * as CodePipeline from 'aws-sdk/clients/codepipeline';
import { Octokit } from '@octokit/core';

let codePipelineClient: CodePipeline;

exports.handler = async (
  event: CodePipelineEvent,
  context: Context,
): Promise<any> => {
  context.callbackWaitsForEmptyEventLoop = false;
  if (!codePipelineClient) codePipelineClient = new CodePipeline();

  const jobID = event['CodePipeline.job'].id;
  const jobIDShort = jobID.split('-')[0];

  const repoName = process.env['GITHUB_REPO'] || '';
  const repoOwner = process.env['GITHUB_REPO_OWNER'] || '';
  const gitSourceBranch = process.env['GITHUB_SOURCE_BRANCH'] || 'develop';
  const gitDestBranch = process.env['GITHUB_DEST_BRANCH'] || 'main';
  const authToken = process.env['GITHUB_OAUTH_TOKEN'] || '';

  const jobDetails = await codePipelineClient
    .getJobDetails({ jobId: jobID })
    .promise();
  const inputArtifacts = jobDetails.jobDetails?.data?.inputArtifacts;
  console.log(`event: ${JSON.stringify(inputArtifacts)}`);

  // const repoName = inputArtifacts['GITHUB_REPO'] || '';
  // const repoOwner = inputArtifacts['GITHUB_REPO_OWNER'] || '';
  // const gitSourceBranch = inputArtifacts['GITHUB_SOURCE_BRANCH'] || '';
  // const gitDestBranch = inputArtifacts['GITHUB_DEST_BRANCH'] || '';
  // const authToken = inputArtifacts['GITHUB_OAUTH_TOKEN'] || '';

  return codepipelineJobSuccess(jobID);

  const octokit = new Octokit({ auth: authToken });
  const pullRequestUrl = `POST /repos/${repoOwner}/${repoName}/pulls`;

  try {
    const pullRequestTitle = `CodePipeline Auto-Pull-Request (Job Id: ${jobIDShort})`;
    const pullRequestBody = `Automated pull request to merge ${gitSourceBranch} into ${gitDestBranch}.`;

    const pullResponse = await octokit.request(pullRequestUrl, {
      owner: repoOwner,
      repo: repoName,
      head: gitSourceBranch,
      base: gitDestBranch,
      title: pullRequestTitle,
      body: pullRequestBody,
    });
    console.log(`Opened pull request #${pullResponse.data.number}`);

    return codepipelineJobSuccess(jobID);
  } catch (error) {
    if (error.message.includes('pull request already exists')) {
      return codepipelineJobSuccess(jobID);
    }

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
        if (err) console.log(`PutJobFailure error: ${err.message}`);
        return JSON.stringify(data);
      },
    );
  }
};

const codepipelineJobSuccess = (jobID: string) => {
  return codePipelineClient.putJobSuccessResult(
    { jobId: jobID },
    (err, data) => {
      if (err) console.log(`PutJobSuccess error: ${err}`);
      return JSON.stringify(data);
    },
  );
};
