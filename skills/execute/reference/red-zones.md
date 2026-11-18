# Red-zone approval

This applies when `risk-zones.ts check` (step 2a) or `check-diff` (step 9) exits 3.

Exit 3 from `check` means the planned paths reach a red zone, or name no path
while a red zone exists, and no person approved it. Exit 3 from `check-diff`
means the build touched a red zone no person approved for this change. Either
way, stop and name the zones or paths. Only a person's own words recorded as an
Approvals line naming `red-zone <changeName>` let it pass; `continuous-delivery: yes` and invoking
this command do not.
