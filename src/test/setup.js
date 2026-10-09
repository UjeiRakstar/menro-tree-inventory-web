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
