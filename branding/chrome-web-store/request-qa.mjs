// Screenshot QA: a language switch intentionally replaces a Czech <img src>
// with an English data-en-src. Chromium may report ERR_ABORTED for the original
// request. Ignore only that discarded image, never a missing final image.
export function unexpectedScreenshotFailures(failures, finalImageUrls) {
  const current = new Set(finalImageUrls);
  return failures.filter(({ url, error, kind }) => !(
    kind === 'image'
    && error === 'net::ERR_ABORTED'
    && !current.has(url)
  ));
}
