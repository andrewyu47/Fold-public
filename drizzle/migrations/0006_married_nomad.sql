DROP INDEX "uniq_student_event";--> statement-breakpoint
DROP INDEX "uniq_session_student";--> statement-breakpoint
DROP INDEX "users_email_unique";--> statement-breakpoint
ALTER TABLE `students` ALTER COLUMN "funnel_stage" TO "funnel_stage" text NOT NULL DEFAULT 'new';--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_student_event` ON `attendances` (`student_id`,`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_session_student` ON `ride_assignments` (`ride_session_id`,`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `students` ADD `member_status` text;--> statement-breakpoint
ALTER TABLE `students` DROP COLUMN `faith_status`;