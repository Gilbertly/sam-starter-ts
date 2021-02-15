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

  const userParameters =
    event['CodePipeline.job'].data.actionConfiguration.configuration
      .UserParameters;
  console.log(userParameters);

  const parameter = JSON.parse(JSON.stringify(userParameters));
  const repoName = parameter['GITHUB_REPO'] || '';
  const repoOwner = parameter['GITHUB_REPO_OWNER'] || '';
  const gitSourceBranch = parameter['GITHUB_SOURCE_BRANCH'] || '';
  const gitDestBranch = parameter['GITHUB_DEST_BRANCH'] || '';
  const authToken = parameter['GITHUB_OAUTH_TOKEN'] || '';

  const octokit = new Octokit({ auth: authToken });
  const pullRequestUrl = `POST /repos/${repoOwner}/${repoName}/pulls`;

  try {
    const branchExists = await checkBranchExists(
      octokit,
      repoOwner,
      repoName,
      gitDestBranch,
    );

    if (!branchExists) {
      await createGithubBranch(
        octokit,
        repoOwner,
        repoName,
        gitSourceBranch,
        gitDestBranch,
      );
    }

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
        console.log(`PutJobFailure: ${data}`);
        return data;
      },
    );
  }
};

const codepipelineJobSuccess = (jobID: string) => {
  return codePipelineClient.putJobSuccessResult(
    { jobId: jobID },
    (err, data) => {
      if (err) console.log(`PutJobSuccess error: ${err}`);
      console.log(`PutJobSuccess: ${data}`);
      return data;
    },
  );
};

const checkBranchExists = async (
  octokit: Octokit,
  repoOwner: string,
  repoName: string,
  gitDestBranch: string,
) => {
  const destBranchResponse = await octokit.request(
    `GET /repos/${repoOwner}/${repoName}/branches/${gitDestBranch}`,
  );
  if (destBranchResponse.data.name) return true;
  return false;
};

const createGithubBranch = async (
  octokit: Octokit,
  repoOwner: string,
  repoName: string,
  gitSourceBranch: string,
  gitDestBranch: string,
) => {
  const sourceBranchRef = await octokit.request(
    `GET /repos/${repoOwner}/${repoName}/git/refs/heads/${gitSourceBranch}`,
  );

  await octokit.request(`POST /repos/${repoOwner}/${repoName}/git/refs`, {
    ref: `refs/head/${gitDestBranch}`,
    sha: sourceBranchRef.data.object.sha,
  });
};
