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
  // console.log(userParameters);

  const parameter = JSON.parse(JSON.stringify(userParameters));
  const repoName = parameter['GITHUB_REPO'] || '';
  const repoOwner = parameter['GITHUB_REPO_OWNER'] || '';
  const gitSourceBranch = parameter['GITHUB_SOURCE_BRANCH'] || '';
  const gitDestBranch = parameter['GITHUB_DEST_BRANCH'] || '';
  const authToken = parameter['GITHUB_OAUTH_TOKEN'] || '';

  const octokit = new Octokit({ auth: authToken });
  const pullRequestUrl = `POST /repos/${repoOwner}/${repoName}/pulls`;

  try {
    const refUrl = `GET /repos/${repoOwner}/${repoName}/git/ref/${gitDestBranch}`;
    const refResponse = await octokit.request(refUrl);
    console.log(`refResponse: ${refResponse}`);

    // const branchExists = await checkBranchExists(
    //   octokit,
    //   repoOwner,
    //   repoName,
    //   gitDestBranch,
    // );
    // console.log(`Branch ${gitDestBranch} exists: ${branchExists}`);

    // if (!branchExists) {
    //   await createGithubBranch(
    //     octokit,
    //     repoOwner,
    //     repoName,
    //     gitSourceBranch,
    //     gitDestBranch,
    //   );
    //   console.log(`Skipping opening a pull request ...`);
    //   await codePipelineClient.putJobSuccessResult({ jobId: jobID }).promise();
    //   return;
    // }

    // const pullRequestTitle = `CodePipeline Auto-Pull-Request (Job Id: ${jobIDShort})`;
    // const pullRequestBody = `Automated pull request to merge ${gitSourceBranch} into ${gitDestBranch}.`;

    // const pullResponse = await octokit.request(pullRequestUrl, {
    //   owner: repoOwner,
    //   repo: repoName,
    //   head: gitSourceBranch,
    //   base: gitDestBranch,
    //   title: pullRequestTitle,
    //   body: pullRequestBody,
    // });
    // console.log(`Opened pull request #${pullResponse.data.number}`);

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

// const checkBranchExists = async (
//   octokit: Octokit,
//   repoOwner: string,
//   repoName: string,
//   gitDestBranch: string,
// ) => {
//   const destBranchResponse = await octokit.request(
//     `GET /repos/${repoOwner}/${repoName}/branches/${gitDestBranch}`,
//   );
//   console.log(`destBranchResponse: ${destBranchResponse}`);
//   if (destBranchResponse.data.name) return true;
//   return false;
// };

// const createGithubBranch = async (
//   octokit: Octokit,
//   repoOwner: string,
//   repoName: string,
//   gitSourceBranch: string,
//   gitDestBranch: string,
// ) => {
//   console.log(`Creating branch ${gitDestBranch} ...`);
//   const sourceBranchRef = await octokit.request(
//     `GET /repos/${repoOwner}/${repoName}/git/refs/heads/${gitSourceBranch}`,
//   );

//   await octokit.request(`POST /repos/${repoOwner}/${repoName}/git/refs`, {
//     ref: `refs/head/${gitDestBranch}`,
//     sha: sourceBranchRef.data.object.sha,
//   });
//   console.log(`Branch '${gitDestBranch}' created from '${gitSourceBranch}'`);
// };
