CREATE TABLE `funnel_sweep_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_at` integer DEFAULT (unixepoch()) NOT NULL,
	`threshold_days` integer NOT NULL,
	`evaluated` integer NOT NULL,
	`flipped_count` integer NOT NULL,
	`flipped` text,
	`triggered_by` text DEFAULT 'manual' NOT NULL
);
