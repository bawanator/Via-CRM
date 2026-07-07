-- Imported Attio deals arrive as "Lost" with no recorded reason. Rather than
-- fabricate one, record the honest value.
alter type public.deal_loss_reason add value if not exists 'unknown';
