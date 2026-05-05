CREATE TABLE `ride_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ride_id` integer NOT NULL,
	`ride_session_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	FOREIGN KEY (`ride_id`) REFERENCES `rides`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ride_session_id`) REFERENCES `ride_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_session_student` ON `ride_assignments` (`ride_session_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `ride_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`label` text NOT NULL,
	`enforce_gender_rule` integer DEFAULT true NOT NULL,
	`recorded_by` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `rides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ride_session_id` integer NOT NULL,
	`vehicle_id` integer,
	`vehicle_name_snapshot` text NOT NULL,
	`capacity_snapshot` integer NOT NULL,
	`driver_name` text NOT NULL,
	`driver_student_id` integer,
	`driver_gender` text,
	`notes` text,
	FOREIGN KEY (`ride_session_id`) REFERENCES `ride_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`driver_student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`capacity` integer NOT NULL,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
