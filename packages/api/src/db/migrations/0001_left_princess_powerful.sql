CREATE TABLE `llm_providers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`model` text NOT NULL,
	`base_url` text,
	`api_key` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
