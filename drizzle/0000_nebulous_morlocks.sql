CREATE TYPE "public"."matter_status" AS ENUM('intake_review', 'active', 'declined', 'needs_manual_review');--> statement-breakpoint
CREATE TYPE "public"."matter_type" AS ENUM('Personal Injury', 'Contract Dispute', 'Employment', 'Family', 'Estate Planning', 'Criminal Defense', 'Other');--> statement-breakpoint
CREATE TYPE "public"."urgency" AS ENUM('Low', 'Medium', 'High');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conflict_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"matched_party" text NOT NULL,
	"matched_client_id" uuid,
	"note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extracted_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"matter_type" "matter_type",
	"summary" text,
	"jurisdiction" text,
	"urgency" "urgency" DEFAULT 'Medium' NOT NULL,
	"urgency_reason" text,
	"status" "matter_status" DEFAULT 'intake_review' NOT NULL,
	"raw_description" text NOT NULL,
	"opposing_party" text,
	"classification_confidence" numeric(4, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_flags" ADD CONSTRAINT "conflict_flags_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_flags" ADD CONSTRAINT "conflict_flags_matched_client_id_clients_id_fk" FOREIGN KEY ("matched_client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_facts" ADD CONSTRAINT "extracted_facts_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_matter_id_idx" ON "audit_log" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "clients_email_idx" ON "clients" USING btree ("email");--> statement-breakpoint
CREATE INDEX "clients_name_idx" ON "clients" USING btree ("name");--> statement-breakpoint
CREATE INDEX "conflict_flags_matter_id_idx" ON "conflict_flags" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "extracted_facts_matter_id_idx" ON "extracted_facts" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "extracted_facts_key_idx" ON "extracted_facts" USING btree ("key");--> statement-breakpoint
CREATE INDEX "matters_status_urgency_idx" ON "matters" USING btree ("status","urgency");--> statement-breakpoint
CREATE INDEX "matters_client_id_idx" ON "matters" USING btree ("client_id");