// Generated from the live schema by scripts/db-types.mjs. Do not edit by hand.
import type { Enums } from './enums';
import type { Functions } from './functions';
import type { ClubTables } from './tables.club';
import type { MatchTables } from './tables.match';
import type { TrainingTables } from './tables.training';

export type { Json } from './json';

export type Database = {
  // Lets createClient pick the right options for this PostgREST version.
  __InternalSupabase: { PostgrestVersion: '14.18' };
  public: {
    Tables: ClubTables & MatchTables & TrainingTables;
    Views: { [_ in never]: never };
    Functions: Functions;
    Enums: Enums;
    CompositeTypes: { [_ in never]: never };
  };
};
