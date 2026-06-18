const TRACKING_EVENTS = Object.freeze([
  'diagnosis_start',
  'diagnosis_complete',
  'feedback_given',
  'paywall_seen',
  'paywall_action',
  'register_prompt_seen',
  'register_prompt_action',
  'image_diagnosis_start',
  'image_diagnosis_complete',
  'recognition_complete',
]);

const TRACKING_EVENT_SET = new Set(TRACKING_EVENTS);

module.exports = {
  TRACKING_EVENTS,
  TRACKING_EVENT_SET,
};
