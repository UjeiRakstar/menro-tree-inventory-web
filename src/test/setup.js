import '@testing-library/jest-dom';

/**
 * jsdom implements neither observer API, and the public pages use
 * IntersectionObserver for their scroll-reveal animations — without a stand-in,
 * rendering one throws before anything can be asserted about it.
 *
 * These do nothing: a test that needs an element to "come into view" should
 * drive that explicitly rather than rely on a fake observer firing.
 */
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = NoopObserver;
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = NoopObserver;
}

/**
 * jsdom has no matchMedia either. The default answer is "no match", which is
 * the desktop view; a test that wants the mobile view overrides this with its
 * own stub.
 */
if (typeof globalThis.matchMedia === 'undefined') {
  globalThis.matchMedia = (query) => ({
    media: query,
    matches: false,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
}

/**
 * jsdom has no window.scrollTo.
 *
 * The router scrolls each new page to the top, so every routing test printed a
 * "Not implemented: window.scrollTo" stack — pages of noise that real failures
 * then had to be found among. A no-op is enough; the test that cares about the
 * scrolling stubs its own and asserts against that.
 */
globalThis.scrollTo = () => {};
