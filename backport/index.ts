import axios, { AxiosRequestConfig } from 'axios';
import * as core from '@actions/core';
import * as github from "@actions/github";
import { exec } from '@actions/exec';
import { context } from '@actions/github';
import { run, ConfigOptions } from 'backport';
import createStatusComment from './createStatusComment';
import { RequestError } from "@octokit/request-error";
import { Context } from "@actions/github/lib/context";

export const getConfig = async (repoOwner: string, repoName: string, branch: string, accessToken: string) => {
  const url = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/.backportrc.json`;
  const config: AxiosRequestConfig = {
    method: 'get',
    url: url,
    headers: { Authorization: `token ${accessToken}` },
  };
  const resp = await axios(config);
  return resp.data as ConfigOptions;
};

export async function approve(
  token: string,
  context: Context,
  prNumber?: number
) {
  if (!prNumber) {
    prNumber = context.payload.pull_request?.number;
  }

  if (!prNumber) {
    core.setFailed(
      "Event payload missing `pull_request` key, and no `pull-request-number` provided as input." +
        "Make sure you're triggering this action on the `pull_request` or `pull_request_target` events."
    );
    return;
  }

  const client = github.getOctokit(token);

  core.info(`Creating approving review for pull request #${prNumber}`);
  try {
    await client.rest.pulls.createReview({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: prNumber,
      event: "APPROVE",
    });
    core.info(`Approved pull request #${prNumber}`);
  } catch (error) {
    if (error instanceof RequestError) {
      switch (error.status) {
        case 401:
          core.setFailed(
            `${error.message}. Please check that the \`github-token\` input ` +
              "parameter is set correctly."
          );
          break;
        case 403:
          core.setFailed(
            `${error.message}. In some cases, the GitHub token used for actions triggered ` +
              "from `pull_request` events are read-only, which can cause this problem. " +
              "Switching to the `pull_request_target` event typically resolves this issue."
          );
          break;
        case 404:
          core.setFailed(
            `${error.message}. This typically means the token you're using doesn't have ` +
              "access to this repository. Use the built-in `${{ secrets.GITHUB_TOKEN }}` token " +
              "or review the scopes assigned to your personal access token."
          );
          break;
        case 422:
          core.setFailed(
            `${error.message}. This typically happens when you try to approve the pull ` +
              "request with the same user account that created the pull request. Try using " +
              "the built-in `${{ secrets.GITHUB_TOKEN }}` token, or if you're using a personal " +
              "access token, use one that belongs to a dedicated bot account."
          );
          break;
        default:
          core.setFailed(`Error (code ${error.status}): ${error.message}`);
      }
      return;
    }

    core.setFailed(error.message);
    return;
  }
}

async function backport() {
  const { payload, repo } = context;

  if (!payload.pull_request) {
    throw Error('Only pull_request events are supported.');
  }

  const pullRequest = payload.pull_request;
  const owner: string = pullRequest.user.login;

  const branch: string = pullRequest?.base?.ref;

  if (!branch) {
    throw Error("Can't determine PR base branch.");
  }

  const accessToken = core.getInput('github_token', { required: true });
  const commitUser = core.getInput('commit_user', { required: true });
  const commitEmail = core.getInput('commit_email', { required: true });

  const autoMerge = core.getInput('auto_merge', { required: true }) === 'true';
  const autoMergeMethod = core.getInput('auto_merge_method', { required: true });
  const backportCommandTemplate = core.getInput('manual_backport_command_template', { required: true });

  await exec(`git config --global user.name "${commitUser}"`);
  await exec(`git config --global user.email "${commitEmail}"`);

  const config = await getConfig(repo.owner, repo.repo, branch, accessToken);

  const backportResponse = await run({
    ...config,
    accessToken,
    fork: true,
    username: commitUser,
    ci: true,
    pullNumber: pullRequest.number,
    labels: ['backport'],
    assignees: [owner],
    autoMerge: autoMerge,
    autoMergeMethod: autoMergeMethod,
  });

  backportResponse.results
        .map(async (result) => {
      var _a;
      if (result.pullRequestUrl) {
        _a = result.pullRequestUrl.split('/')[6];
        const backportPullNumber = parseInt(_a);
        await approve(accessToken, github.context, backportPullNumber);
      }
  });

  await createStatusComment({
    accessToken,
    repoOwner: repo.owner,
    repoName: repo.repo,
    pullNumber: pullRequest.number,
    backportCommandTemplate,
    backportResponse,
    autoMerge,
  });
}

backport().catch((error) => {
  console.error('An error occurred', error);
  core.setFailed(error.message);
});
