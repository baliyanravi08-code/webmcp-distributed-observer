// ⭐ Simple Planner Engine
// Decides which target to monitor next

const targets = ["godark"];

let index = 0;

export function decideNextTarget() {
  const target = targets[index];

  index++;

  if (index >= targets.length) {
    index = 0;
  }

  return { target };
}