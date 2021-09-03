"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approve = exports.getConfig = void 0;
const axios_1 = require("axios");
const core = require("@actions/core");
const github = require("@actions/github");
const exec_1 = require("@actions/exec");
const github_1 = require("@actions/github");
const backport_1 = require("backport");
const createStatusComment_1 = require("./createStatusComment");
const request_error_1 = require("@octokit/request-error");
const getConfig = async (repoOwner, repoName, branch, accessToken) => {
    const url = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/.backportrc.json`;
    const config = {
        method: 'get',
        url: url,
        headers: { Authorization: `token ${accessToken}` },
    };
    const resp = await axios_1.default(config);
    return resp.data;
};
exports.getConfig = getConfig;
async function approve(token, context, prNumber) {
    var _b;
    if (!prNumber) {
        prNumber = (_b = context.payload.pull_request) === null || _b === void 0 ? void 0 : _b.number;
    }
    if (!prNumber) {
        core.setFailed("Event payload missing `pull_request` key, and no `pull-request-number` provided as input." +
            "Make sure you're triggering this action on the `pull_request` or `pull_request_target` events.");
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
    }
    catch (error) {
        if (error instanceof request_error_1.RequestError) {
            switch (error.status) {
                case 401:
                    core.setFailed(`${error.message}. Please check that the \`github-token\` input ` +
                        "parameter is set correctly.");
                    break;
                case 403:
                    core.setFailed(`${error.message}. In some cases, the GitHub token used for actions triggered ` +
                        "from `pull_request` events are read-only, which can cause this problem. " +
                        "Switching to the `pull_request_target` event typically resolves this issue.");
                    break;
                case 404:
                    core.setFailed(`${error.message}. This typically means the token you're using doesn't have ` +
                        "access to this repository. Use the built-in `${{ secrets.GITHUB_TOKEN }}` token " +
                        "or review the scopes assigned to your personal access token.");
                    break;
                case 422:
                    core.setFailed(`${error.message}. This typically happens when you try to approve the pull ` +
                        "request with the same user account that created the pull request. Try using " +
                        "the built-in `${{ secrets.GITHUB_TOKEN }}` token, or if you're using a personal " +
                        "access token, use one that belongs to a dedicated bot account.");
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
exports.approve = approve;
async function backport() {
    var _b;
    const { payload, repo } = github_1.context;
    if (!payload.pull_request) {
        throw Error('Only pull_request events are supported.');
    }
    const pullRequest = payload.pull_request;
    const owner = pullRequest.user.login;
    const branch = (_b = pullRequest === null || pullRequest === void 0 ? void 0 : pullRequest.base) === null || _b === void 0 ? void 0 : _b.ref;
    if (!branch) {
        throw Error("Can't determine PR base branch.");
    }
    const accessToken = core.getInput('github_token', { required: true });
    const commitUser = core.getInput('commit_user', { required: true });
    const commitEmail = core.getInput('commit_email', { required: true });
    const autoMerge = core.getInput('auto_merge', { required: true }) === 'true';
    const autoMergeMethod = core.getInput('auto_merge_method', { required: true });
    const backportCommandTemplate = core.getInput('manual_backport_command_template', { required: true });
    await exec_1.exec(`git config --global user.name "${commitUser}"`);
    await exec_1.exec(`git config --global user.email "${commitEmail}"`);
    const config = await exports.getConfig(repo.owner, repo.repo, branch, accessToken);
    const backportResponse = await backport_1.run({
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
    await createStatusComment_1.default({
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
//# sourceMappingURL=index.js.map