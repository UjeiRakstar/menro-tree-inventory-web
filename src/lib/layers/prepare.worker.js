import { prepareFile } from './browser.js';

/**
 * The background thread that prepares an uploaded layer, so a 111 MB flood
 * map is read and laid on the grid without freezing the page.
 */
self.onmessage = async ({ data }) => {
  try {
    const result = await prepareFile(data.kind, data.file);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error?.message ?? String(error) });
  }
};
