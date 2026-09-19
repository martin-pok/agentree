export const RELEASE_REPOSITORY = 'martin-pok/agentree';
export const RELEASE_API_URL = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`;
export const RELEASE_PAGE_URL = `https://github.com/${RELEASE_REPOSITORY}/releases/latest`;
export const RELEASE_MANIFEST_URL = `https://github.com/${RELEASE_REPOSITORY}/releases/latest/download/agentree-release.json`;

export const RELEASE_METADATA = Object.freeze({
  repository: RELEASE_REPOSITORY,
  apiUrl: RELEASE_API_URL,
  pageUrl: RELEASE_PAGE_URL,
  manifestUrl: RELEASE_MANIFEST_URL,
});
