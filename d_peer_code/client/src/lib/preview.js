/**
 * Injects the hidden test script before </body> for live preview.
 */
export function buildPreviewSrcDoc(userHtml, testScript) {
  if (typeof testScript !== 'string' || !testScript.trim()) {
    return userHtml;
  }
  const tag = `<script>\n${testScript}\n<\/script>`;
  if (/<\/body>/i.test(userHtml)) {
    return userHtml.replace(/<\/body>/i, `${tag}\n</body>`);
  }
  return `${userHtml}\n${tag}`;
}
