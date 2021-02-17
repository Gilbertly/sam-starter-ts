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
  const parameter = JSON.parse(userParameters);
  const repoName = parameter['GITHUB_REPO'] || '';
  const repoOwner = parameter['GITHUB_REPO_OWNER'] || '';
  const gitSourceBranch = parameter['GITHUB_SOURCE_BRANCH'] || '';
  const gitDestBranch = parameter['GITHUB_DEST_BRANCH'] || '';
  const authToken = parameter['GITHUB_OAUTH_TOKEN'] || '';
  const octokit = new Octokit({ auth: authToken });

  const branchExists = await checkBranchExists(
    octokit,
    repoOwner,
    repoName,
    gitDestBranch,
  );

  if (!branchExists) {
    try {
      console.log(`Creating branch '${gitDestBranch}' ...`);
      const sourceBranchSha = await getBranchSha(
        octokit,
        repoOwner,
        repoName,
        gitSourceBranch,
      );

      const response = await octokit.request(
        'POST /repos/{owner}/{repo}/git/refs',
        {
          owner: repoOwner,
          repo: repoName,
          ref: `refs/heads/${gitDestBranch}`,
          sha: sourceBranchSha || '',
        },
      );
      console.log(`Created branch: ${JSON.stringify(response.data.ref)}`);
      return await putJobSuccess(jobID);
    } catch (error) {
      console.error(`Error creating branch: ${JSON.stringify(error)}`);
      return await putJobFailure(context, jobID, error);
    }
  } else {
    console.log(`Branch '${gitDestBranch}' exists.`);
    const pullRequestTitle = `CodePipeline Auto-Pull-Request (Job Id: ${jobIDShort})`;
    const pullRequestBody = `Automated pull request to merge ${gitSourceBranch} into ${gitDestBranch}.`;

    try {
      const pullResponse = await octokit.request(
        'POST /repos/{owner}/{repo}/pulls',
        {
          owner: repoOwner,
          repo: repoName,
          head: gitSourceBranch,
          base: gitDestBranch,
          title: pullRequestTitle,
          body: pullRequestBody,
        },
      );
      console.log(`Opened pull request #${pullResponse.data.number}`);
      return await putJobSuccess(jobID);
    } catch (error) {
      if (error.message.includes('pull request already exists')) {
        console.log(`${error.message}. Skipping ...`);
        return await putJobSuccess(jobID);
      }
      if (error.message.includes('No commits between')) {
        console.log(`${error.message}. Skipping ...`);
        return await putJobSuccess(jobID);
      }
      console.error(`Error creating pull request: ${JSON.stringify(error)}`);
      return await putJobFailure(context, jobID, error);
    }
  }
};

const checkBranchExists = async (
  octokit: Octokit,
  repoOwner: string,
  repoName: string,
  gitDestBranch: string,
) => {
  try {
    const refResponse = await octokit.request(
      'GET /repos/{owner}/{repo}/branches/{branch}',
      {
        owner: repoOwner,
        repo: repoName,
        branch: gitDestBranch,
      },
    );
    if (refResponse.status == 200) return true;
    return false;
  } catch (error) {
    return false;
  }
};

const getBranchSha = async (
  octokit: Octokit,
  repoOwner: string,
  repoName: string,
  branchName: string,
) => {
  try {
    const response = await octokit.request(
      'GET /repos/{owner}/{repo}/branches/{branch}',
      {
        owner: repoOwner,
        repo: repoName,
        branch: branchName,
      },
    );
    if (response.status == 200) return response.data.commit.sha;
    return false;
  } catch (error) {
    console.error(`Error: ${error}`);
    return false;
  }
};

const putJobFailure = async (context: Context, jobID: string, error: any) => {
  return await codePipelineClient
    .putJobFailureResult({
      jobId: jobID,
      failureDetails: {
        type: 'JobFailed',
        message: error.message,
        externalExecutionId: context.awsRequestId,
      },
    })
    .promise();
};

const putJobSuccess = async (jobID: string) => {
  return await codePipelineClient
    .putJobSuccessResult({ jobId: jobID })
    .promise();
};
