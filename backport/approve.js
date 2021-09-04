"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approve = void 0;
/*
 * This is from https://github.com/hmarr/auto-approve-action
 * MIT License
 */
const core = require("@actions/core");
const github = require("@actions/github");
const request_error_1 = require("@octokit/request-error");
async function approve(token, context, prNumber) {
    var _a;
    if (!prNumber) {
        prNumber = (_a = context.payload.pull_request) === null || _a === void 0 ? void 0 : _a.number;
    }
    if (!prNumber) {
        core.setFailed('Event payload missing `pull_request` key, and no `pull-request-number` provided as input.' +
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
            event: 'APPROVE',
        });
        core.info(`Approved pull request #${prNumber}`);
    }
    catch (error) {
        if (error instanceof request_error_1.RequestError) {
            switch (error.status) {
                case 401:
                    core.setFailed(`${error.message}. Please check that the \`github-token\` input ` + 'parameter is set correctly.');
                    break;
                case 403:
                    core.setFailed(`${error.message}. In some cases, the GitHub token used for actions triggered ` +
                        'from `pull_request` events are read-only, which can cause this problem. ' +
                        'Switching to the `pull_request_target` event typically resolves this issue.');
                    break;
                case 404:
                    core.setFailed(`${error.message}. This typically means the token you're using doesn't have ` +
                        'access to this repository. Use the built-in `${{ secrets.GITHUB_TOKEN }}` token ' +
                        'or review the scopes assigned to your personal access token.');
                    break;
                case 422:
                    core.setFailed(`${error.message}. This typically happens when you try to approve the pull ` +
                        'request with the same user account that created the pull request. Try using ' +
                        "the built-in `${{ secrets.GITHUB_TOKEN }}` token, or if you're using a personal " +
                        'access token, use one that belongs to a dedicated bot account.');
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
//# sourceMappingURL=approve.js.map