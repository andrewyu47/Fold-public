CREATE TABLE `contact_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`attempted_by_user_id` integer,
	`channel` text NOT NULL,
	`channel_detail` text,
	`attempted_at` integer DEFAULT (unixepoch()) NOT NULL,
	`responded` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attempted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `students` ADD `added_by_user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `students` ADD `first_met_context` text;--> statement-breakpoint
ALTER TABLE `students` ADD `first_met_at` integer;--> statement-breakpoint
ALTER TABLE `students` ADD `funnel_stage` text DEFAULT 'not_contacted' NOT NULL;--> statement-breakpoint
-- Backfill: existing students are already in the DB so they've at least attended something.
UPDATE `students` SET `funnel_stage` = 'attended';