export interface ExtractedProject {
  title?: string;
  genre?: string[];
  summary_global?: string;
  tone_profile?: string;
  narrative_pov?: string;
}

export interface ExtractedChapter {
  chapter_id?: string;
  title?: string;
  summary?: string;
  raw_text_reference?: string;
  confidence?: number;
}

export interface ExtractedScene {
  scene_id?: string;
  chapter_id?: string;
  order_index?: number;
  summary?: string;
}

export interface ExtractedCharacter {
  character_id?: string;
  name?: string;
  role?: string;
  description?: string;
  core_traits?: string[];
  confidence?: number;
}

export interface ExtractedCharacterState {
  character_id?: string;
  name?: string;
  current_pressure_level?: string;
  current_emotional_state?: string;
  visible_goal?: string;
  hidden_need?: string;
  current_fear?: string;
  dominant_belief?: string;
  emotional_wound?: string;
  current_knowledge?: string;
}

export interface ExtractedRelationship {
  character_1?: string;
  character_2?: string;
  trust_level?: number;
  tension_level?: number;
  current_dynamic?: string;
  relationship_type?: string;
}

export interface ExtractedConflict {
  conflict_id?: string;
  conflict_type?: string;
  title?: string;
  description?: string;
  status?: string;
  confidence?: number;
}

export interface ExtractedTimelineEvent {
  timeline_event_id?: string;
  event?: string;
  date?: string;
  cause?: string;
  description?: string;
  immediate_effect?: string;
  latent_effect?: string;
  confidence?: number;
}

export interface ExtractedWorldRule {
  world_rule_id?: string;
  scope?: string;
  title?: string;
  rule?: string;
  description?: string;
  confidence?: number;
}

export interface ExtractedLocation {
  location_id?: string;
  name?: string;
  description?: string;
  importance?: string;
  associated_rules?: string[];
  confidence?: number;
}

export interface ExtractedTheme {
  theme_id?: string;
  theme?: string;
  evidence?: string[];
  confidence?: number;
}

export interface ExtractedCanonItem {
  canon_item_id?: string;
  category?: string;
  description?: string;
  status?: string;
  source_reference?: string;
  confidence?: number;
}

export interface ExtractedAmbiguity {
  ambiguity_id?: string;
  issue?: string;
  affected_section?: string;
  confidence?: string;
  recommended_review?: string;
}

export interface ExtractedOpenLoop {
  loop_id?: string;
  description?: string;
  status?: string;
  confidence?: number;
}

export interface ExtractedForeshadowing {
  foreshadowing_id?: string;
  description?: string;
  clue?: string;
  payoff_status?: string;
  confidence?: number;
}

export interface ExtractedData {
  project?: ExtractedProject;
  chapters?: ExtractedChapter[];
  scenes?: ExtractedScene[];
  characters?: ExtractedCharacter[];
  character_states?: ExtractedCharacterState[];
  relationships?: ExtractedRelationship[];
  active_conflicts?: ExtractedConflict[];
  timeline_events?: ExtractedTimelineEvent[];
  world_rules?: ExtractedWorldRule[];
  locations?: ExtractedLocation[];
  themes?: ExtractedTheme[];
  canon_items?: ExtractedCanonItem[];
  ambiguities?: ExtractedAmbiguity[];
  open_loops?: ExtractedOpenLoop[];
  foreshadowing_elements?: ExtractedForeshadowing[];
}
