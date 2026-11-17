## ADDED Requirements

### Requirement: One review lens runs on a second model family at no extra cost
When the runtime advertises a live standard model from a different family than
the usual one, `/code-review-max` SHALL run exactly one lens on it in place of
the usual model, keeping the lens count unchanged. When only one family is
available, every lens SHALL use the usual model. The review output SHALL list
the model each lens used and why.

#### Scenario: Two families available
- **WHEN** the inventory advertises standard models from two families
- **THEN** exactly one lens uses the other family and the number of lenses is unchanged

#### Scenario: One family available
- **WHEN** only one standard model family is advertised
- **THEN** every lens uses the usual model and the output says only one family was available
