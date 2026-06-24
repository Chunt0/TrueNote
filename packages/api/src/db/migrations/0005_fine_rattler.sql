CREATE TABLE `maintenance_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`interval_hours` integer DEFAULT 24 NOT NULL,
	`stale_days` integer DEFAULT 180 NOT NULL,
	`max_docs_per_run` integer DEFAULT 200 NOT NULL,
	`max_suggestions` integer DEFAULT 100 NOT NULL,
	`llm_model` text,
	`scope_depts` text,
	`checks` text,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `maintenance_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`finished_at` text,
	`scanned` integer DEFAULT 0 NOT NULL,
	`found` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer,
	`check_type` text NOT NULL,
	`kind` text NOT NULL,
	`confidence` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`path` text NOT NULL,
	`department` text,
	`evidence` text,
	`fingerprint` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`snoozed_until` text,
	`resolved_by` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`resolved_at` text
);
