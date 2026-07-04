// Hand-maintained database types mirroring supabase/migrations.
// If the schema changes, update this file in the same commit as the migration.

export type BrokerStage = "introduced" | "engaged" | "active_submitter" | "prime";
export type DealStatus = "live" | "settled" | "withdrawn" | "declined" | "fell_over";
export type DealOutcome = Exclude<DealStatus, "live">;
export type DealProduct = "bridge" | "draw" | "hold" | "frame" | "other";
export type DealFunder = "hcp" | "first_federal" | "other";
export type DealPipelineStage = "enquiry" | "scenario" | "term_sheet" | "credit" | "docs" | "settlement";
export type InteractionType = "email" | "call" | "meeting" | "note";
export type LinkParentType = "deal" | "broker";
export type AuditAction = "insert" | "update" | "delete";
export type ChangeSource = "ui" | "mcp" | "import" | "system";

type RowMeta = {
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type BrokerRow = RowMeta & {
  id: string;
  full_name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  stage: BrokerStage;
  last_contact_date: string | null;
  next_action: string | null;
  next_action_date: string | null;
  notes: string | null;
  source: string | null;
};

export type BrokerInsert = Partial<RowMeta> & {
  id?: string;
  full_name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  stage?: BrokerStage;
  last_contact_date?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
  notes?: string | null;
  source?: string | null;
};

export type BrokerUpdate = Partial<BrokerInsert>;

export type DealRow = RowMeta & {
  id: string;
  name: string;
  broker_id: string;
  borrower_entity: string | null;
  borrower_contact_name: string | null;
  borrower_contact_email: string | null;
  borrower_contact_phone: string | null;
  security_address: string | null;
  loan_amount: number | null;
  product: DealProduct | null;
  funder: DealFunder | null;
  pipeline_stage: DealPipelineStage;
  status: DealStatus;
  settlement_date: string | null;
  loan_term_months: number | null;
  maturity_date: string | null;
  notes: string | null;
};

export type DealInsert = Partial<RowMeta> & {
  id?: string;
  name: string;
  broker_id: string;
  borrower_entity?: string | null;
  borrower_contact_name?: string | null;
  borrower_contact_email?: string | null;
  borrower_contact_phone?: string | null;
  security_address?: string | null;
  loan_amount?: number | null;
  product?: DealProduct | null;
  funder?: DealFunder | null;
  pipeline_stage?: DealPipelineStage;
  status?: DealStatus;
  settlement_date?: string | null;
  loan_term_months?: number | null;
  maturity_date?: string | null;
  notes?: string | null;
};

export type DealUpdate = Partial<DealInsert>;

export type KeyDateRow = RowMeta & {
  id: string;
  deal_id: string;
  label: string;
  due_date: string;
  completed: boolean;
  remind_days_before: number;
};

export type KeyDateInsert = Partial<RowMeta> & {
  id?: string;
  deal_id: string;
  label: string;
  due_date: string;
  completed?: boolean;
  remind_days_before?: number;
};

export type KeyDateUpdate = Partial<KeyDateInsert>;

export type DriveLinkRow = RowMeta & {
  id: string;
  parent_type: LinkParentType;
  parent_id: string;
  label: string;
  url: string;
};

export type DriveLinkInsert = Partial<RowMeta> & {
  id?: string;
  parent_type: LinkParentType;
  parent_id: string;
  label: string;
  url: string;
};

export type DriveLinkUpdate = Partial<DriveLinkInsert>;

export type InteractionRow = RowMeta & {
  id: string;
  broker_id: string;
  deal_id: string | null;
  type: InteractionType;
  occurred_at: string;
  summary: string;
  gmail_thread_id: string | null;
};

export type InteractionInsert = Partial<RowMeta> & {
  id?: string;
  broker_id: string;
  deal_id?: string | null;
  type: InteractionType;
  occurred_at?: string;
  summary: string;
  gmail_thread_id?: string | null;
};

export type InteractionUpdate = Partial<InteractionInsert>;

export type AuditLogRow = {
  id: string;
  table_name: string;
  record_id: string;
  action: AuditAction;
  changed_by: string | null;
  changed_at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  source: ChangeSource;
};

export type BrokerStatsRow = {
  broker_id: string;
  live_deal_count: number;
  total_deals_submitted: number;
  last_deal_outcome: DealOutcome | null;
};

export type AllowedUserRow = {
  email: string;
  full_name: string | null;
  created_at: string;
};

export type GoogleOauthTokenRow = {
  user_id: string;
  refresh_token: string;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      brokers: { Row: BrokerRow; Insert: BrokerInsert; Update: BrokerUpdate; Relationships: [] };
      deals: { Row: DealRow; Insert: DealInsert; Update: DealUpdate; Relationships: [] };
      key_dates: { Row: KeyDateRow; Insert: KeyDateInsert; Update: KeyDateUpdate; Relationships: [] };
      drive_links: { Row: DriveLinkRow; Insert: DriveLinkInsert; Update: DriveLinkUpdate; Relationships: [] };
      interactions: { Row: InteractionRow; Insert: InteractionInsert; Update: InteractionUpdate; Relationships: [] };
      audit_log: { Row: AuditLogRow; Insert: never; Update: never; Relationships: [] };
      allowed_users: {
        Row: AllowedUserRow;
        Insert: { email: string; full_name?: string | null; created_at?: string };
        Update: Partial<AllowedUserRow>;
        Relationships: [];
      };
      google_oauth_tokens: {
        Row: GoogleOauthTokenRow;
        Insert: { user_id: string; refresh_token: string };
        Update: { refresh_token?: string; updated_at?: string };
        Relationships: [];
      };
    };
    Views: {
      broker_stats: { Row: BrokerStatsRow; Relationships: [] };
    };
    Functions: {
      is_allowed: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      broker_stage: BrokerStage;
      deal_status: DealStatus;
      deal_product: DealProduct;
      deal_funder: DealFunder;
      deal_pipeline_stage: DealPipelineStage;
      interaction_type: InteractionType;
      link_parent_type: LinkParentType;
      audit_action: AuditAction;
      change_source: ChangeSource;
    };
    CompositeTypes: Record<string, never>;
  };
};
