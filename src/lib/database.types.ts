// Hand-maintained database types mirroring supabase/migrations.
// If the schema changes, update this file in the same commit as the migration.

export type BrokerStage = "introduced" | "engaged" | "active_submitter" | "prime";
export type DealStatus = "live" | "settled" | "lost";
export type DealOutcome = Exclude<DealStatus, "live">; // settled | lost
export type DealLossReason =
  | "outside_mandate"
  | "unknown_broker"
  | "failed_broker_dd"
  | "failed_customer_dd"
  | "lost_to_competitor"
  | "ghosted"
  | "unknown";
export type DealProduct = "bridging" | "equity_release" | "purchase" | "residual_stock" | "other";
// Funders are code-named. Real names live nowhere in the app. funder_1=HCP,
// funder_2=First Federal, funder_3=Vest Capital — displayed only as 1/2/3.
export type DealFunder = "funder_1" | "funder_2" | "funder_3" | "other";
export type DealPipelineStage = "scenario" | "term_sheet" | "credit" | "docs" | "settlement";
export type InteractionType = "email" | "call" | "meeting" | "note";
export type LinkParentType = "deal" | "contact";
export type AuditAction = "insert" | "update" | "delete";
export type ChangeSource = "ui" | "mcp" | "import" | "system";

type RowMeta = {
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ---------------------------------------------------------------------------
// Contacts (the table was `brokers`; brokers are now contacts of type "Broker")
// ---------------------------------------------------------------------------

export type ContactRow = RowMeta & {
  id: string;
  full_name: string;
  company_id: string | null; // FK -> companies.id
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  type: string; // references contact_types.name; defaults to "Broker"
  location: string | null; // city / region, used for filtering
  stage: BrokerStage; // meaningful only for type "Broker"
  last_contact_date: string | null;
  next_action: string | null;
  next_action_date: string | null;
  notes: string | null;
  source: string | null;
};

export type ContactInsert = Partial<RowMeta> & {
  id?: string;
  full_name: string;
  company_id?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  type?: string;
  location?: string | null;
  stage?: BrokerStage;
  next_action?: string | null;
  next_action_date?: string | null;
  notes?: string | null;
  source?: string | null;
  // last_contact_date is intentionally omitted: trigger-maintained only.
};

export type ContactUpdate = Partial<ContactInsert>;

// Back-compat aliases — much existing code says "broker". A broker is a contact.
export type BrokerRow = ContactRow;
export type BrokerInsert = ContactInsert;
export type BrokerUpdate = ContactUpdate;

export type CompanyRow = RowMeta & {
  id: string;
  name: string;
  domain: string | null; // primary email domain, lowercase, never a free-mail domain
  location: string | null;
  notes: string | null;
};

export type CompanyInsert = Partial<RowMeta> & {
  id?: string;
  name: string;
  domain?: string | null;
  location?: string | null;
  notes?: string | null;
};

export type CompanyUpdate = Partial<CompanyInsert>;

export type ContactTypeRow = {
  name: string;
  sort: number;
  created_at: string;
  created_by: string | null;
};

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export type DealRow = RowMeta & {
  id: string;
  name: string;
  broker_id: string; // FK → contacts.id (the broker on the deal)
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
  loss_reason: DealLossReason | null; // required iff status = 'lost'
  settlement_date: string | null;
  loan_term_months: number | null;
  maturity_date: string | null;
  closed_at: string | null; // trigger-maintained: when the deal left 'live'
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
  loss_reason?: DealLossReason | null;
  settlement_date?: string | null;
  loan_term_months?: number | null;
  maturity_date?: string | null;
  notes?: string | null;
};

export type DealUpdate = Partial<DealInsert>;

// ---------------------------------------------------------------------------
// Guarantors (child of deals; max 3 enforced in app)
// ---------------------------------------------------------------------------

export type GuarantorRow = RowMeta & {
  id: string;
  deal_id: string;
  full_name: string;
  date_of_birth: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

export type GuarantorInsert = Partial<RowMeta> & {
  id?: string;
  deal_id: string;
  full_name: string;
  date_of_birth?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
};

export type GuarantorUpdate = Partial<GuarantorInsert>;

// ---------------------------------------------------------------------------
// Tasks (against contacts and/or deals)
// ---------------------------------------------------------------------------

export type TaskRow = RowMeta & {
  id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  contact_id: string | null;
  deal_id: string | null;
  source_event_id: string | null; // calendar event that auto-created this task
  google_task_id: string | null; // set once synced to Google Tasks
};

export type TaskInsert = Partial<RowMeta> & {
  id?: string;
  title: string;
  notes?: string | null;
  due_date?: string | null;
  completed?: boolean;
  contact_id?: string | null;
  deal_id?: string | null;
  source_event_id?: string | null;
  google_task_id?: string | null;
};

export type TaskUpdate = Partial<TaskInsert>;

// ---------------------------------------------------------------------------
// Saved reports (up to 3 pinnable)
// ---------------------------------------------------------------------------

export type SavedReportRow = RowMeta & {
  id: string;
  name: string;
  spec: Record<string, unknown>;
  pinned: boolean;
  sort: number;
};

export type SavedReportInsert = Partial<RowMeta> & {
  id?: string;
  name: string;
  spec: Record<string, unknown>;
  pinned?: boolean;
  sort?: number;
};

export type SavedReportUpdate = Partial<SavedReportInsert>;

// ---------------------------------------------------------------------------
// Unchanged child tables
// ---------------------------------------------------------------------------

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
  broker_id: string; // FK → contacts.id
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

type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      contacts: Table<ContactRow, ContactInsert, ContactUpdate>;
      companies: Table<CompanyRow, CompanyInsert, CompanyUpdate>;
      contact_types: Table<ContactTypeRow, { name: string; sort?: number }, Partial<ContactTypeRow>>;
      deals: Table<DealRow, DealInsert, DealUpdate>;
      guarantors: Table<GuarantorRow, GuarantorInsert, GuarantorUpdate>;
      tasks: Table<TaskRow, TaskInsert, TaskUpdate>;
      saved_reports: Table<SavedReportRow, SavedReportInsert, SavedReportUpdate>;
      key_dates: Table<KeyDateRow, KeyDateInsert, KeyDateUpdate>;
      drive_links: Table<DriveLinkRow, DriveLinkInsert, DriveLinkUpdate>;
      interactions: Table<InteractionRow, InteractionInsert, InteractionUpdate>;
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
      deal_loss_reason: DealLossReason;
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
