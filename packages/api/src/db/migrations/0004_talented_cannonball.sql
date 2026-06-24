CREATE TABLE `departments` (
	`key` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_departments` (
	`user_id` integer NOT NULL,
	`dept_key` text NOT NULL,
	PRIMARY KEY(`user_id`, `dept_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dept_key`) REFERENCES `departments`(`key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'member' NOT NULL;