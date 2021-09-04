"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = void 0;
const axios_1 = require("axios");
const core = require("@actions/core");
const github = require("@actions/github");
const exec_1 = require("@actions/exec");
const github_1 = require("@actions/github");
const backport_1 = require("backport");
const createStatusComment_1 = require("./createStatusComment");
const approve_1 = require("./approve");
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
    const approverToken = core.getInput('approver_token');
    const autoApprove = core.getInput('auto_approve') === 'true';
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
    if (autoApprove) {
        backportResponse.results.map(async (result) => {
            var _a;
            if (result.pullRequestUrl) {
                _a = result.pullRequestUrl.split('/')[6];
                const backportPullNumber = parseInt(_a);
                await approve_1.approve(approverToken, github.context, backportPullNumber);
            }
        });
    }
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