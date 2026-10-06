// What the team picks when a decision waits too long and expires (B.pacing.askExpiry): the cautious,
// do-little choice a busy team would make without the founder. Never the best one, so ignoring asks never
// pays, and never a punishing one. An event with a choice that does nothing needs no entry here.
export const ASK_DEFAULTS = {
  senior_grumble: 0, junior_asks_mentor: 1, resignation_letter: 1, poached_by_bigco: 2, senior_side_project: 1,
  remote_debate: 0, ai_skeptic_speech: 1, no_show: 2, no_show_again: 0, public_complaint: 3, pay_equity_question: 2,
  junior_overwhelmed: 1, ceo_replace_support: 2, ceo_support_fallout: 2, four_day_week: 1, four_day_week_review: 0,
  ai_first_mandate: 1, ai_first_review: 1, pivot_pitch: 1, hackathon_week: 1, founder_burnout: 0,
  incumbent_copies_flavor: 1, big_customer_threat: 0, press_wrapper_mockery: 0, acquisition_offer: 1, vc_offer: 1,
  grokk_pr_scandal: 2, noc_bet: 0, incident_postmortem: 0,
  era_chatgbt: 1, era_agents: 1, era_consolidation: 2, era_plateau: 0,
  first_user_test: 2, lockdown_start: 1, work_policy: 1, pet_request: 1, pet_mishap: 0, rival_jab: 0, rival_merge: 1,
  agent_bill: 2, agent_invoice: 0, rival_megaround: 1, mission_statement: 0, mission_test_support: 1, mission_test_demo: 1,
  ai_summit: 0, ai_summit_panel: 0, ai_summit_hackathon: 0, hearing_summons: 2, hearing_report: 1,
  alumni_referral: 1, alumni_competitor: 0, cloud_bill: 1, app_store_rejection: 0, blockchain_pitch: 0,
  family_dinner: 0, family_checkin: 0, family_intern: 0, investor_growth_push: 1, investor_automation_push: 1,
  music_night_genre: 3, moonshot_checkin: 0, moonshot_result: 0, last_bet: 2,
  coffee_machine_broke: 1, coffee_wanted: 1, coffee_wanted_corner: 1, banner_company: 0, cover_sheets: 1, the_stapler: 1,
  efficiency_consultants: 2, printer_jam: 1, saturday_ask: 1, the_box: 1, oat_milk: 2, is_it_kielbasa: 2, tabs_or_spaces: 2,
  dotcom_ipo_frenzy: 0, dotcom_bust: 0, dotcom_y2k_oncall: 1,
  pre_master_disk: 1, pre_cd_rom: 1, pre_first_order: 0, pre_sold_out: 0,
  ai_interview_watch: 1, ai_interview_loop: 1,
};
