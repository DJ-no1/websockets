/**
 * Default challenge: practical DOM — stateful counter in iframe.
 * Tests run in the preview iframe only; hidden script posts TEST_PASS to parent.
 */
export function getDefaultChallenge() {
  return {
    id: 'counter-v1',
    title: 'Stateful DOM counter',
    statement: `Build a **stateful** counter in the page:
- A clickable control that **increases** the count
- A clickable control that **decreases** the count
- The current count must be shown inside the element with \`id="out"\` (start at **0**)

Use the HTML/JS in the editor. You can change markup freely as long as the rules above hold.`,
    starterCode: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Counter</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 1.5rem; }
    #out { font-size: 2rem; margin: 1rem 0; }
    button { margin-right: 0.5rem; padding: 0.35rem 0.75rem; }
  </style>
</head>
<body>
  <p id="out">0</p>
  <button type="button" id="up">+1</button>
  <button type="button" id="down">-1</button>
  <script>
    // Your logic here: wire #up, #down, and #out
  </script>
</body>
</html>`,
    testScript: `
(function peercodeRunTests() {
  function fail(msg) {
    try { console.error('PeerCode test:', msg); } catch (_) {}
  }
  var out = document.getElementById('out');
  if (!out) { fail('Missing #out'); return; }
  var up = document.getElementById('up');
  var down = document.getElementById('down');
  if (!up || !down) { fail('Need #up and #down controls'); return; }

  function textNum() {
    return parseInt(String(out.textContent || '').replace(/\\D/g, ''), 10) || 0;
  }

  if (textNum() !== 0) { fail('Count must start at 0'); return; }
  up.click();
  if (textNum() !== 1) { fail('After +1, #out should show 1'); return; }
  up.click();
  if (textNum() !== 2) { fail('After second +1, #out should show 2'); return; }
  down.click();
  if (textNum() !== 1) { fail('After -1 from 2, #out should show 1'); return; }
  down.click();
  if (textNum() !== 0) { return fail('After -1 from 1, #out should show 0'); }

  if (window.parent) {
    window.parent.postMessage({ type: 'TEST_PASS', challengeId: 'counter-v1' }, '*');
  }
})();
`,
  };
}
