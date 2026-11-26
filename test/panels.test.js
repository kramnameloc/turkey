import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { Window } from 'happy-dom';

// Lit captures the document when it is imported. Each Node test file has its own process.
const browser = new Window({ settings: { disableJavaScriptEvaluation: true } });
globalThis.document = browser.document;
after(async () => {
  delete globalThis.document;
  await browser.happyDOM.close();
});
const { render } = await import('lit-html');
const { fieldGuide } = await import('../src/ui/field-guide.js');
const { paradeMap } = await import('../src/ui/hunt-maps.js');
const { pausePanel, courseClearPanel, resultsPanel } =
  await import('../src/ui/hunt-panels.js');
const { COURSES, TRIP_CAPTURES } = await import('../src/gameplay/courses.js');

function mount(view) {
  const root = document.createElement('main');
  render(view, root);
  return root;
}

test('parade model labels remain literal option text, including punctuation and markup', () => {
  const label = 'Finn & Jake <em>duo</em> "2026"';
  const root = mount(paradeMap([{ label, release: true }]));
  const option = root.querySelector('option');
  assert.equal(option.textContent, label + ' · crew only');
  assert.equal(option.value, '0');
  assert.equal(root.querySelector('em'), null);
  assert.ok(root.querySelector('[data-action="rejoin-parade"] svg path'));
});

test('the guide distinguishes captured sides from desserts and preserves dish colors', () => {
  const game = { active: true, allTargets: [{ id: 'corn', caught: true }] };
  const sides = mount(fieldGuide('dishes', game, false));
  const corn = sides.querySelector('.target-row');
  assert.equal(corn.querySelector('small').textContent, 'CAPTURED');
  assert.equal(corn.style.getPropertyValue('--dish'), '#e7b149');
  assert.equal(sides.querySelectorAll('.target-row').length, 6);
  assert.ok(sides.querySelector('[data-action="resume"]'));
  const desserts = mount(fieldGuide('desserts', game, false));
  assert.equal(
    desserts
      .querySelector('[data-action="desserts"]')
      .getAttribute('aria-pressed'),
    'true'
  );
  assert.deepEqual(
    [...desserts.querySelectorAll('.target-row small')].map(
      (el) => el.textContent
    ),
    Array(6).fill('DESSERT')
  );
});

test('pause, day completion and results reflect mode, timing and retry eligibility', () => {
  const game = {
    mode: 'campaign',
    count: 6,
    huntCaptures: 1,
    targets: [{}, {}],
    huntLabel: 'The garden',
    level: 0,
    course: COURSES[0],
    elapsed: 65.5,
    fight: { health: 82 },
    hits: 3,
    paradeHits: 0,
  };
  const paused = mount(pausePanel(game, false));
  assert.match(
    paused.querySelector('.panel-text').textContent,
    /1 of 2 dishes captured.*own pace/
  );
  const completed = mount(courseClearPanel(game, '+12 turkey HP.', true));
  assert.match(completed.textContent, /1:05/);
  assert.match(completed.textContent, /82 \/ 100/);
  assert.ok(completed.querySelector('[data-action="next-course"]'));

  const result = {
    won: false,
    shots: 4,
    count: 6,
    time: 65.5,
    reason: 'health',
  };
  const lost = mount(resultsPanel(game, result, false, false));
  assert.equal(lost.querySelector('h2').textContent, 'You got basted!');
  assert.ok(lost.querySelector('[data-action="retry-course"]'));
  assert.doesNotMatch(lost.textContent, /TIME AFIELD|New personal best/);
  assert.match(lost.textContent, /75%/);

  const won = mount(
    resultsPanel(
      { ...game, course: COURSES.at(-1) },
      { ...result, won: true, count: TRIP_CAPTURES },
      true,
      true
    )
  );
  assert.ok(won.querySelector('.pearl-recap'));
  assert.ok(won.querySelector('[data-action="start"]'));
  assert.match(won.textContent, /New personal best!/);
  assert.match(won.textContent, /36 \/ 36/);
});
