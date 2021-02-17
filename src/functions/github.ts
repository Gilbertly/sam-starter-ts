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

  const parameter = JSON.parse(JSON.stringify(userParameters));
  const repoName = parameter['GITHUB_REPO'] || '';
  const repoOwner = parameter['GITHUB_REPO_OWNER'] || '';
  const gitSourceBranch = parameter['GITHUB_SOURCE_BRANCH'] || '';
  const gitDestBranch = parameter['GITHUB_DEST_BRANCH'] || '';
  const authToken = parameter['GITHUB_OAUTH_TOKEN'] || '';

  const octokit = new Octokit({ auth: authToken });

  try {
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
      } catch (error) {
        console.error(`Error creating branch: ${JSON.stringify(error)}`);
        throw error;
      }
    } else {
      console.log(`Branch '${gitDestBranch}' exists.`);
      const pullRequestTitle = `CodePipeline Auto-Pull-Request (Job Id: ${jobIDShort})`;
      const pullRequestBody = `Automated pull request to merge ${gitSourceBranch} into ${gitDestBranch}.`;

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
    }

    codePipelineClient.putJobSuccessResult({ jobId: jobID }, (err, data) => {
      if (err) console.log(`PutJobSuccess error: ${err.message}`);
      console.log(`PutJobSuccess succcess: ${data}`);
      return;
    });
  } catch (error) {
    if (error.message.includes('pull request already exists')) {
      codePipelineClient.putJobSuccessResult({ jobId: jobID }, (err, data) => {
        if (err) console.log(`PutJobSuccess error: ${err.message}`);
        console.log(`PutJobSuccess succcess: ${data}`);
        return;
      });
    }

    codePipelineClient.putJobFailureResult(
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
        console.log(`PutJobFailure succcess: ${data}`);
        return;
      },
    );
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
