export interface Db {
	// INSERT ... ON CONFLICT DO NOTHING. True when this call inserted the row.
	insertIgnoringConflict(
		table: string,
		row: Record<string, string>,
	): Promise<boolean>;
}
