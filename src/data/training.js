// Training programs for the train action. awayWeeks sends the person away (mood 'away') while they learn.
export const TRAINING = {
  workshop: { id: 'workshop', name: 'Workshop', desc: 'A focused day of practice. +XP and +3 to one skill.', cost: 2000, xp: 30, skill: 3, meaning: 0, brand: 0, knowledge: 0, awayWeeks: 0 },
  conference: { id: 'conference', name: 'Conference', desc: 'A week of talks and hallway chats. Big XP, a meaning lift, a little brand.', cost: 8000, xp: 80, skill: 0, meaning: 10, brand: 0.5, knowledge: 0, awayWeeks: 1 },
  course: { id: 'course', name: 'Course', desc: 'Two weeks deep in the fundamentals. XP and knowledge.', cost: 5000, xp: 60, skill: 0, meaning: 0, brand: 0, knowledge: 15, awayWeeks: 2 },
};
