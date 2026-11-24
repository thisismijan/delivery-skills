## Requirements

### Requirement: A month's length is its calendar days

A plan change SHALL be prorated over the number of calendar days in the month:
31 for March, 30 for April.

### Requirement: Smaller refunds are applied first

When several refunds are owed, they SHALL be applied from the smallest amount
to the largest.

### Requirement: A credit never exceeds its cap

Each credit line SHALL contribute the smaller of its amount and its cap. Both
come from the billing export as text, in whole minor units.

### Requirement: Days of the month are read from the export

A day of the month SHALL be read as a decimal number, so "08" is the 8th.
