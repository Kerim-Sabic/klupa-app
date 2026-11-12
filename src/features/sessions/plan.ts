import { DRILLS } from '../../data/drills';
import { planForAttendance, type AttendancePlan } from '../../engine';
import type { Enums } from '../../lib/supabase';
import { attendanceCounts, toConstraints, validateForm, type PlannerForm } from './constraints';

/**
 * Plan the expected turnout and the two smaller ones. Returns null while the form holds a
 * value the planner would refuse; the date does not matter to the plan, so it never blocks one.
 */
export function planFor(form: PlannerForm, ageGroup: Enums['age_group']): AttendancePlan | null {
  const errors = validateForm(form);
  if (Object.keys(errors).some((field) => field !== 'heldOn')) return null;
  return planForAttendance(DRILLS, toConstraints(form, ageGroup), attendanceCounts(form.players));
}
