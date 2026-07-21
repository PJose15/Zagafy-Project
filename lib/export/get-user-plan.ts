// Moved to lib/get-user-plan.ts so plan resolution is available to all
// billing-gated features (sync, collaborators, AI quota), not just export.
// This re-export keeps existing import paths working.
export { getUserPlan } from '@/lib/get-user-plan';
