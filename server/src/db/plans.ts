import { pool } from './pool';

// Team and Business only, no free tier (docs/PRODUCT_PLAN.md section 4).
export type Plan = 'team' | 'business';
export type Feature = 'audit' | 'roles';

const FEATURES: Record<Plan, readonly Feature[]> = { team: [], business: ['audit', 'roles'] };
const SEAT_LIMIT: Record<Plan, number> = { team: 10, business: Infinity };

export const hasFeature = (plan: Plan, feature: Feature) => FEATURES[plan].includes(feature);
export const seatLimit = (plan: Plan) => SEAT_LIMIT[plan];
export const upgradeMessage = (feature: Feature) =>
  `${feature === 'audit' ? 'The audit log' : 'Viewer roles'} ${feature === 'audit' ? 'is' : 'are'} part of the Business plan.`;

export async function getPlan(organizationId: number): Promise<Plan> {
  const result = await pool.query('SELECT plan FROM organizations WHERE id = $1', [organizationId]);
  return result.rows[0]?.plan === 'business' ? 'business' : 'team';
}
