# RescueFlow Frontend

Responsive React + Vite prototype for the RescueFlow transaction recovery blueprint.

## Run locally
```bash
npm install
npm run dev
```

## Included screens
- Overview dashboard
- Recovery inbox with search and status filter
- Transaction details, reconciliation, timeline, customer choice confirmation, resolve/verify and escalation flows
- Voice session mock UI and speaker-labelled transcript
- Recovery policy toggles
- Analytics and synthetic-data disclaimer
- Audit trail and demo event generator

## Integration boundary
This frontend uses seeded in-memory demo data. API contracts in the project blueprint are proposed contracts, not deployed endpoints. Replace local action handlers with authenticated backend calls; never report a recovery as resolved before the backend confirms final state. No real call, payment, refund, or customer notification is initiated.
