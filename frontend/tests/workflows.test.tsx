import { useState } from 'react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { act, renderHook } from '@testing-library/react';
import { useApi } from '../src/lib/useApi';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import Transcript from '../src/components/Transcript';
import EvaluationCards, { Evidence, JudgmentCard } from '../src/components/EvaluationCards';
import { ToastProvider } from '../src/components/ui';
import Checklists from '../src/pages/Checklists';
import { appeal, checklist, conversation, judgment, run } from './fixtures';
import type { Appeal, Checklist } from '../src/lib/types';
function reply(value: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}
beforeEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('Evidence and original transcript', () => {
  it('clicking an evidence chip highlights only the exact original message, then a span', () => {
    function Harness() {
      const [highlighted, setHighlighted] = useState<string[]>([]);
      return (
        <>
          <Transcript conversation={conversation} highlighted={highlighted} />
          <Evidence judgment={judgment} conversation={conversation} onHighlight={setHighlighted} />
        </>
      );
    }
    const { container } = render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /#2 · operator/ }));
    expect(container.querySelector('[data-message-id="m2"]')).toHaveClass('highlighted');
    expect(container.querySelector('[data-message-id="m1"]')).not.toHaveClass('highlighted');
    fireEvent.click(screen.getByRole('button', { name: /Checked interval/ }));
    expect(container.querySelectorAll('.highlighted')).toHaveLength(3);
    expect(container.querySelector('[data-message-id="m2"]')).toHaveTextContent(
      'Здравствуйте, меня зовут Алия.',
    );
  });
  it('missing evidence reports an error instead of moving to another message', () => {
    const jump = vi.fn();
    render(
      <ToastProvider>
        <Evidence
          judgment={{ ...judgment, evidence_message_ids: ['missing'] }}
          conversation={conversation}
          onHighlight={jump}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Missing message' }));
    expect(screen.getByRole('alert')).toHaveTextContent('referenced transcript message is missing');
    expect(jump).not.toHaveBeenCalled();
  });
  it('shows the audio player only for voice calls and preserves ISO timestamps', () => {
    const { rerender, container } = render(
      <Transcript conversation={conversation} highlighted={[]} />,
    );
    expect(container.querySelector('audio')).toBeNull();
    rerender(
      <Transcript
        conversation={{
          ...conversation,
          channel: 'voice call',
          audio_url: 'https://example.invalid/recording.wav',
          messages: [{ ...conversation.messages[0], timestamp: '2026-11-01T10:00:00+05:00' }],
        }}
        highlighted={[]}
      />,
    );
    expect(container.querySelector('audio')).not.toBeNull();
    expect(screen.getByRole('link', { name: /Open recording/ })).toHaveAttribute(
      'href',
      'https://example.invalid/recording.wav',
    );
    expect(screen.getByText('2026-11-01T10:00:00+05:00')).toBeInTheDocument();
    expect(screen.getByText(/no exact seek alignment/)).toBeInTheDocument();
  });
  it('clearly displays N/A rationale and separate serious violation with unchanged total', () => {
    render(
      <EvaluationCards
        run={{ ...run, final: { ...run.final!, gross_violation: true } }}
        checklist={checklist}
        conversation={conversation}
        onHighlight={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByText(/SERIOUS VIOLATION/)).toBeInTheDocument();
    expect(screen.getAllByText('100.00').length).toBeGreaterThan(0);
    const { container } = render(
      <JudgmentCard
        criterion={{
          ...checklist.criteria[0],
          na_allowed: true,
          na_rule: 'Already sufficient information',
        }}
        judgment={{
          ...judgment,
          status: 'na',
          answer: 'N/A',
          raw_score: null,
          contribution: null,
          na_reason: 'No clarification needed',
        }}
        conversation={conversation}
        onHighlight={() => {}}
      />,
    );
    expect(within(container).getByText('N/A reason')).toBeInTheDocument();
    expect(within(container).getByText('No clarification needed')).toBeInTheDocument();
    expect(within(container).getByText(/Weight redistributed/)).toBeInTheDocument();
  });
});
it('editing a criterion saves a new immutable checklist version', async () => {
  let posted: Record<string, unknown> | undefined;
  const next: Checklist = { ...checklist, id: 'v2', version: 2, parent_id: 'v1' };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, options?: RequestInit) => {
      if (url === '/api/checklists' && options?.method === 'POST') {
        posted = JSON.parse(String(options.body));
        return reply({ ...next, criteria: posted!.criteria });
      }
      return reply([checklist]);
    }),
  );
  render(
    <MemoryRouter>
      <ToastProvider>
        <Checklists />
      </ToastProvider>
    </MemoryRouter>,
  );
  await screen.findByText('Greeting');
  fireEvent.click(screen.getByRole('button', { name: /Greeting/ }));
  fireEvent.change(screen.getByLabelText('Title C01'), {
    target: { value: 'Replacement criterion' },
  });
  fireEvent.change(screen.getByLabelText('Description C01'), {
    target: { value: 'Judge the operator against this new configurable instruction.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save as new version' }));
  await screen.findByText(/v2 saved and available/);
  expect(posted?.parent_id).toBe('v1');
  expect((posted?.criteria as Checklist['criteria'])[0].title).toBe('Replacement criterion');
  expect(checklist.criteria[0].title).toBe('Greeting');
});
it('submits a criterion-level appeal with required comment', async () => {
  const fetch = vi.fn(() => reply(appeal)),
    refreshed = vi.fn();
  vi.stubGlobal('fetch', fetch);
  render(
    <ToastProvider>
      <EvaluationCards
        run={run}
        checklist={checklist}
        conversation={conversation}
        onHighlight={() => {}}
        onRefresh={refreshed}
      />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Appeal criterion' }));
  expect(screen.getByRole('button', { name: 'Submit appeal' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Appeal comment'), {
    target: { value: 'Please inspect the first operator reply.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit appeal' }));
  await waitFor(() => expect(refreshed).toHaveBeenCalled());
  expect(fetch.mock.calls[0]).toBeDefined();
});
it('reviewer flow updates final while keeping original judgment visible', async () => {
  let item: Appeal = structuredClone(appeal);
  let reviewBody: Record<string, unknown> | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, options?: RequestInit) => {
      if (url === '/api/config/status')
        return reply({ llm_configured: true, test_mode: true, model: 'test fixture' });
      if (url === '/api/conversations/conv1') return reply(conversation);
      if (url === '/api/appeals/appeal1/decision') {
        reviewBody = JSON.parse(String(options?.body));
        item = {
          ...item,
          status: 'changed',
          final_score: '90.00',
          current_judgment: { ...item.current_judgment, raw_score: 0, answer: 'Нет' },
          decision: {
            reviewer: 'Demo reviewer',
            action: 'change',
            reason: String(reviewBody!.reason),
            created_at: '2026-11-01T00:00:00Z',
            before_score: '100.00',
            after_score: '90.00',
            before_judgment: judgment,
            after_judgment: { ...judgment, raw_score: 0, answer: 'Нет' },
          },
        };
        return reply(item);
      }
      if (url === '/api/appeals/appeal1') return reply(item);
      if (url.startsWith('/api/appeals')) {
        const status = new URL(url, 'http://local').searchParams.get('status');
        return reply(!status || item.status === status ? [item] : []);
      }
      return reply([]);
    }),
  );
  window.history.replaceState({}, '', '/appeals');
  render(<App />);
  await screen.findByText('Please review the greeting');
  expect(screen.getByRole('button', { name: 'Review evidence & decide' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /Supervisor mode/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Review evidence & decide' }));
  await screen.findByRole('dialog');
  fireEvent.change(screen.getByLabelText('Review decision'), { target: { value: 'change' } });
  fireEvent.change(screen.getByLabelText('Revised score'), { target: { value: '0' } });
  expect(screen.getByRole('button', { name: 'Save review decision' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Reviewer reason'), {
    target: { value: 'The opening evidence does not meet the criterion.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save review decision' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Changed' }));
  await screen.findByText('90.00');
  expect(screen.getByText('100.00')).toBeInTheDocument();
  expect(screen.getByText('The opening evidence does not meet the criterion.')).toBeInTheDocument();
  expect(reviewBody?.action).toBe('change');
});

it('switching reports never presents the previous run as a new evaluation', async () => {
  let resolveSecond: (response: Response) => void = () => {};
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.endsWith('/first')
        ? reply({ id: 'first', score: '100.00' })
        : new Promise<Response>((resolve) => {
            resolveSecond = resolve;
          }),
    ),
  );
  const { result, rerender } = renderHook(
    ({ path }) => useApi<{ id: string; score: string }>(path),
    { initialProps: { path: '/reports/first' } },
  );
  await waitFor(() => expect(result.current.data?.id).toBe('first'));
  rerender({ path: '/reports/second' });
  expect(result.current.data).toBeNull();
  expect(result.current.loading).toBe(true);
  await act(async () => {
    resolveSecond(new Response(JSON.stringify({ id: 'second', score: null }), { status: 200 }));
  });
  await waitFor(() => expect(result.current.data?.id).toBe('second'));
  expect(result.current.data?.score).toBeNull();
});
