export type Criterion = {
  id: string;
  section: string;
  title: string;
  description: string;
  kind: 'binary' | 'discrete_scale' | 'flag';
  weight: number;
  allowed_scores: number[];
  max_score: number;
  yes_label: string;
  no_label: string;
  rubric: Record<string, string>;
  na_allowed: boolean;
  na_rule: string;
  evidence_required: boolean;
  is_gross_violation_flag: boolean;
  active: boolean;
};
export type Checklist = {
  id: string;
  version: number;
  name: string;
  parent_id: string | null;
  created_at: string;
  criteria: Criterion[];
};
export type Message = {
  id: string;
  ordinal: number;
  timestamp: string;
  speaker: 'operator' | 'client' | 'bot' | 'system';
  text: string;
};
export type Judgment = {
  criterion_id: string;
  status: 'scored' | 'na';
  answer: string;
  raw_score: number | null;
  reason: string;
  na_reason: string | null;
  evidence_message_ids: string[];
  checked_span: { start_message_id: string; end_message_id: string } | null;
  omission: boolean;
  quotes: { message_id: string; quote: string }[];
  review_required: boolean;
  fact_verification_needed: boolean;
};
export type ScoredJudgment = Judgment & { weight: string; contribution: string | null };
export type Summary = {
  score: string | null;
  earned: string;
  denominator: string;
  gross_violation: boolean;
  criteria: ScoredJudgment[];
  sections: Record<
    string,
    {
      score: string | null;
      earned: string;
      denominator: string;
      flag_only: boolean;
      flagged: boolean;
    }
  >;
};
export type Run = {
  checklist_number?: number;
  id: string;
  conversation_id: string;
  checklist_version_id: string;
  status: string;
  provider: string;
  model: string;
  created_at: string;
  finished_at: string | null;
  original: Summary | null;
  final: Summary | null;
  error: string | null;
  warnings: string[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    thinking_tokens: number;
    total_tokens: number;
    latency_ms: number;
    attempts: number;
    estimated_cost_usd: string | null;
    usage_complete: boolean;
  } | null;
  checklist?: Checklist;
  appeals?: Appeal[];
  external_id?: string;
  language?: string;
};
export type ConversationRow = {
  id: string;
  external_id: string;
  group_id: string;
  language: string;
  channel: string;
  message_count: number;
  status: string;
  score: string | null;
  gross_violation: boolean;
  latest_evaluation: Pick<
    Run,
    | 'id'
    | 'status'
    | 'checklist_version_id'
    | 'checklist_number'
    | 'finished_at'
    | 'error'
    | 'provider'
    | 'model'
  > | null;
};
export type Conversation = {
  id: string;
  external_id: string;
  group_id: string;
  language: string;
  channel: string;
  audio_url: string | null;
  messages: Message[];
  latest_evaluation: Run | null;
};
export type Config = {
  provider: string;
  model: string;
  llm_configured: boolean;
  organizer_configured: boolean;
  test_mode: boolean;
  external_call_processing_allowed: boolean;
  parallel_evaluations: number;
  pricing_configured: boolean;
};
export type Dataset = { id: string; source: string; reported_count: number; imported_at: string };
export type Batch = {
  id: string;
  status: string;
  total: number;
  finished: number;
  counts: Record<string, number>;
  items: {
    id: string;
    conversation_id: string;
    external_id: string;
    status: string;
    error: string | null;
    retry_count: number;
  }[];
};
export type DashboardData = {
  imported: number;
  evaluated: number;
  pending: number;
  processing: number;
  failed: number;
  flagged: number;
  review_required: number;
  appealed: number;
  reviewed: number;
  open_appeals: number;
  languages: Record<string, number>;
  channels: Record<string, number>;
};
export type Appeal = {
  id: string;
  run_id: string;
  criterion_id: string;
  actor: string;
  comment: string;
  created_at: string;
  status: string;
  conversation_id: string;
  external_id: string;
  original_judgment: Judgment;
  current_judgment: ScoredJudgment;
  original_score: string | null;
  final_score: string | null;
  criterion: Criterion;
  decision: {
    reviewer: string;
    action: string;
    reason: string;
    created_at: string;
    before_score: string | null;
    after_score: string | null;
    before_judgment: Judgment;
    after_judgment: Judgment;
  } | null;
};
export type Page<T> = { items: T[]; total: number; page?: number; size?: number };
